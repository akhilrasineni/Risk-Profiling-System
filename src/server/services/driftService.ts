import { supabase } from '../../db/supabase.ts';

export async function checkPortfolioDrift(portfolio_id: string) {
  // 1. Fetch portfolio with holdings and IPS target allocations
  const { data: portfolio, error: pError } = await supabase
    .from('portfolios')
    .select(`
      *,
      holdings:portfolio_holdings (
        *,
        security:securities (*)
      ),
      ips:ips_documents (
        *,
        target_allocations (*)
      )
    `)
    .eq('id', portfolio_id)
    .single();
    
  if (pError) throw pError;
  if (!portfolio || !portfolio.ips) {
    throw new Error("Portfolio or IPS not found");
  }

  const targetAllocations = portfolio.ips.target_allocations || [];
  const holdings = portfolio.holdings || [];
  
  // Helper to normalize asset class names (e.g., "Alternatives" -> "alternative")
  const normalizeClass = (name: string) => {
    if (!name) return '';
    const lower = name.toLowerCase();
    return lower.endsWith('s') ? lower.slice(0, -1) : lower;
  };

  // 2. Calculate actual allocations by asset class
  const actualAllocations: Record<string, number> = {};
  holdings.forEach((h: any) => {
    const assetClass = h.security?.asset_sub_class || h.security?.asset_class;
    if (assetClass) {
      const normalized = normalizeClass(assetClass);
      actualAllocations[normalized] = (actualAllocations[normalized] || 0) + h.allocated_percent;
    }
  });

  // Fetch existing unresolved drift events
  const { data: existingDrifts, error: fetchError } = await supabase
    .from('drift_events')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .eq('resolved_flag', false);
    
  if (fetchError) throw fetchError;

  const newDriftEvents = [];
  const currentlyDriftingAssetClasses = new Set<string>();
  
  // 3. Compare with target bands
  for (const target of targetAllocations) {
    const normalizedTarget = normalizeClass(target.asset_class);
    const actual = actualAllocations[normalizedTarget] || 0;
    const lower = target.lower_band;
    const upper = target.upper_band;
    
    if (actual < lower || actual > upper) {
      currentlyDriftingAssetClasses.add(target.asset_class);
      const existingDrift = existingDrifts?.find(d => normalizeClass(d.asset_class) === normalizedTarget);

      if (!existingDrift) {
        const breachType = actual > upper ? 'OVER' : 'UNDER';
        const driftPercent = Math.abs(actual - target.target_percent);
        let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        
        if (driftPercent > 10) severity = 'HIGH';
        else if (driftPercent > 5) severity = 'MEDIUM';
        
        newDriftEvents.push({
          portfolio_id: portfolio.id,
          ips_id: portfolio.ips_id,
          asset_class: target.asset_class,
          actual_percent: actual,
          target_percent: target.target_percent,
          lower_band: lower,
          upper_band: upper,
          breach_type: breachType,
          severity: severity,
          drift_percent: driftPercent,
          alert_sent_flag: false,
          resolved_flag: false
        });
      }
    }
  }

  // 4. Identify resolved drifts
  const resolvedDriftIds = existingDrifts
    ?.filter(d => !currentlyDriftingAssetClasses.has(d.asset_class))
    .map(d => d.id) || [];

  if (resolvedDriftIds.length > 0) {
    const { error: resolveError } = await supabase
      .from('drift_events')
      .update({
        resolved_flag: true,
        alert_sent_flag: true,
        resolved_at: new Date().toISOString(),
        action_taken: 'Rebalanced portfolio to correct drift'
      })
      .in('id', resolvedDriftIds);
      
    if (resolveError) throw resolveError;
  }

  // 5. Insert new drift events
  let insertedData = [];
  if (newDriftEvents.length > 0) {
    
    const { data, error: iError } = await supabase
      .from('drift_events')
      .insert(newDriftEvents)
      .select();
      
    if (iError) throw iError;
    insertedData = data;
  }

  // 6. Calculate client health status (dynamically, no DB update needed)
  const stillUnresolved = (existingDrifts?.length || 0) - resolvedDriftIds.length + newDriftEvents.length;
  const newHealthStatus = stillUnresolved > 0 ? 'drift_detected' : 'healthy';
  
  

  return { driftDetected: stillUnresolved > 0, data: insertedData };
}
