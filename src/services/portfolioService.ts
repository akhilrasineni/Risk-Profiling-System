import { supabase } from '../db/supabase.ts';
import { aiService } from './aiService.ts';

export const portfolioService = {
  async createPortfolioFromIPS(ipsId: string, clientId: string, totalInvestment?: number, model?: any) {
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
    
    
    if (totalInvestment === undefined || totalInvestment === null || totalInvestment <= 0) {
      
      throw new Error('Total investment amount is required and must be greater than zero. Please update the client profile with investable assets or net worth.');
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
      // 3. Fetch All Available Securities
      const { data: allSecurities, error: secError } = await supabase
        .from('securities')
        .select('id, security_name, current_price, asset_class, asset_sub_class');
        
      if (secError) throw secError;

      // 4. Draft Portfolio using AI
      const aiDraft = await aiService.draftPortfolioFromIPS(ips, totalInvestment, allSecurities || [], model);
      
      // Calculate actual sum of percentages
      const actualTotalPercent = aiDraft.holdings.reduce((sum: number, h: any) => sum + h.allocated_percent, 0);
      
      // Validate AI output
      if (Math.abs(actualTotalPercent - 100) > 0.1) {
        throw new Error(`AI generated portfolio with invalid total allocation: ${actualTotalPercent.toFixed(2)}%. Please try again.`);
      }
      
      const holdings = aiDraft.holdings.map((h: any) => ({
        portfolio_id: portfolio.id,
        security_id: h.security_id,
        allocated_percent: h.allocated_percent,
        allocated_amount: h.allocated_amount,
        units: h.units
      }));
      
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
