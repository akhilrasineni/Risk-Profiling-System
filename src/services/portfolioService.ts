import { supabase } from '../db/supabase.ts';
import { aiService } from './aiService.ts';

/**
 * Service for managing portfolio operations, including creation from IPS.
 */
export const portfolioService = {
  /**
   * Creates a new portfolio based on an IPS document and client data.
   * 
   * @param ipsId The ID of the IPS document to use.
   * @param clientId The ID of the client.
   * @param totalInvestment The total amount to invest.
   * @param model Optional AI model override for portfolio drafting.
   * @returns The created portfolio object.
   * @throws Error if IPS is not found or investment amount is invalid.
   */
  async createPortfolioFromIPS(ipsId: string, clientId: string, totalInvestment?: number, model?: any) {
    // 1. Fetch IPS, Allocations, Client, and Responses
    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .select(`
        *,
        target_allocations (*),
        client:clients (*),
        assessment:risk_assessments (
          *,
          responses:risk_assessment_responses (
            *,
            risk_questions (*),
            risk_answer_options (*)
          )
        )
      `)
      .eq('id', ipsId)
      .single();
    
    if (ipsError) throw ipsError;

    const client = ips.client;
    const responses = ips.assessment?.responses || [];

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
      if (!allSecurities || allSecurities.length === 0) {
        throw new Error("No securities found in the database. Please add securities before drafting a portfolio.");
      }

      // 4. Draft Portfolio using AI
      const aiDraft = await aiService.draftPortfolioFromIPS(
        ips, 
        totalInvestment, 
        allSecurities || [], 
        client, 
        responses, 
        model
      );
      
      // Update IPS with AI predictions
      if (ips.id) {
        const { data: currentIps } = await supabase
          .from('ips_documents')
          .select('constraints_json')
          .eq('id', ips.id)
          .single();
          
        const updatedConstraints = {
          ...(currentIps?.constraints_json || {}),
          portfolio_prediction: {
            predicted_return_1y: aiDraft.predicted_return_1y,
            confidence_score: aiDraft.confidence_score,
            prediction_rationale: aiDraft.prediction_rationale
          }
        };

        await supabase
          .from('ips_documents')
          .update({
            constraints_json: updatedConstraints
          })
          .eq('id', ips.id);
      }

      // Calculate actual sum of percentages
      const actualTotalPercent = aiDraft.holdings.reduce((sum: number, h: any) => sum + h.allocated_percent, 0);
      
      // Validate AI output
      if (Math.abs(actualTotalPercent - 100) > 0.1) {
        throw new Error(`AI generated portfolio with invalid total allocation: ${actualTotalPercent.toFixed(2)}%. Please try again.`);
      }
      
      // 5. Validate Security IDs exist in our list
      const validSecurityIds = new Set(allSecurities.map(s => s.id));
      const invalidHoldings = aiDraft.holdings.filter((h: any) => !validSecurityIds.has(h.security_id));
      
      if (invalidHoldings.length > 0) {
        const invalidNames = invalidHoldings.map((h: any) => h.security_id).join(', ');
        throw new Error(`AI suggested securities that are not in our database: ${invalidNames}. Please try again.`);
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
