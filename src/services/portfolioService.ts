import { supabase } from '../db/supabase.ts';

export const portfolioService = {
  async createPortfolioFromIPS(ipsId: string, clientId: string, totalInvestment?: number) {
    // 1. Fetch IPS and Allocations
    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .select(`
        *,
        target_allocations (*)
      `)
      .eq('id', ipsId)
      .single();
    
    if (ipsError) throw ipsError;

    // 2. Validate Investment Amount
    if (!totalInvestment || totalInvestment <= 0) {
      throw new Error('Total investment amount is required and must be greater than zero.');
    }
    
    const { data: portfolio, error: portError } = await supabase
      .from('portfolios')
      .insert({
        client_id: clientId,
        ips_id: ipsId,
        total_investment_amount: totalInvestment,
        status: 'Active',
        approval_status: 'Pending'
      })
      .select()
      .single();
      
    if (portError) throw portError;

    try {
      // 3. Allocate Capital & Create Holdings
      const holdings = [];
      
      if (ips.target_allocations) {
        for (const alloc of ips.target_allocations) {
          const amount = totalInvestment * (alloc.target_percent / 100);
          
          // 4. Select Security (Simple logic: pick first matching asset class)
          // Map 'Debt' to 'Fixed Income' if needed
          let assetClass = alloc.asset_class;
          if (assetClass === 'Debt') assetClass = 'Fixed Income'; 
          
          const { data: securities, error: secError } = await supabase
            .from('securities')
            .select('id, security_name, current_price')
            .eq('asset_class', assetClass)
            .limit(1);
            
          if (secError) throw secError;
          
          if (securities && securities.length > 0) {
            const security = securities[0];
            const units = security.current_price > 0 ? amount / security.current_price : 0;
            
            holdings.push({
              portfolio_id: portfolio.id,
              security_id: security.id,
              allocated_percent: alloc.target_percent,
              allocated_amount: amount,
              units: units
            });
          } else {
            throw new Error(`No security found in the database for asset class: ${assetClass}. Please add securities to the database before creating a portfolio.`);
          }
        }
      }
      
      if (holdings.length > 0) {
        const { error: holdError } = await supabase
          .from('portfolio_holdings')
          .insert(holdings);
          
        if (holdError) throw holdError;
      }
      
      return portfolio;
    } catch (error) {
      // Rollback: Delete the portfolio record if holdings creation fails
      await supabase.from('portfolios').delete().eq('id', portfolio.id);
      throw error;
    }
  }
};
