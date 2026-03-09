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
  
  // 2. Calculate actual allocations by asset class
  const actualAllocations: Record<string, number> = {};
  holdings.forEach((h: any) => {
    const assetClass = h.security?.asset_class;
    if (assetClass) {
      actualAllocations[assetClass] = (actualAllocations[assetClass] || 0) + h.allocated_percent;
    }
  });

  const driftEvents = [];
  
  // 3. Compare with target bands
  for (const target of targetAllocations) {
    const actual = actualAllocations[target.asset_class] || 0;
    const lower = target.lower_band;
    const upper = target.upper_band;
    
    if (actual < lower || actual > upper) {
      const breachType = actual > upper ? 'OVER' : 'UNDER';
      const driftPercent = Math.abs(actual - target.target_percent);
      let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      
      if (driftPercent > 10) severity = 'HIGH';
      else if (driftPercent > 5) severity = 'MEDIUM';
      
      driftEvents.push({
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

  // 4. Insert drift events if found
  console.log(`[Drift] Drift events found: ${driftEvents.length}`);
  if (driftEvents.length > 0) {
    const { data, error: iError } = await supabase
      .from('drift_events')
      .insert(driftEvents)
      .select();
      
    if (iError) throw iError;

    // Update client health status
    console.log(`[Drift] Updating client ${portfolio.client_id} to drift_detected`);
    if (!portfolio.client_id) {
      console.error("[Drift] portfolio.client_id is missing or undefined");
      throw new Error("portfolio.client_id is missing");
    }
    const { error: updateError } = await supabase
      .from('clients')
      .update({ health_status: 'drift_detected' })
      .eq('id', portfolio.client_id);
      
    if (updateError) {
      console.error("[Drift] Error updating client health status:", {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code,
        raw: updateError
      });
      throw updateError;
    }
    console.log(`[Drift] Successfully updated client ${portfolio.client_id} to drift_detected`);

    return { driftDetected: true, data };
  }
  console.log(`[Drift] No drift events found`);

  return { driftDetected: false, data: [] };
}
