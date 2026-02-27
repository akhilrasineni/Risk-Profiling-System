import { Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { portfolioService } from '../../services/portfolioService.js';
import { ALLOCATION_MODELS, RiskCategory } from '../../constants/allocationModels.js';

const router = Router();

// Save Generated IPS
router.post("/save", async (req, res) => {
  try {
    const { client_id, risk_assessment_id, ips_data, target_allocations } = req.body;

    if (!client_id || !risk_assessment_id || !ips_data || !target_allocations) {
      return res.status(400).json({ status: "error", message: "Missing required fields" });
    }

    // 1. Insert IPS Document
    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .insert({
        client_id,
        risk_assessment_id,
        risk_category: ips_data.risk_category,
        investment_objective: ips_data.investment_objective,
        time_horizon_years: ips_data.time_horizon_years,
        liquidity_needs: ips_data.liquidity_needs,
        tax_considerations: ips_data.tax_considerations,
        rebalancing_frequency: ips_data.rebalancing_frequency,
        rebalancing_strategy_description: ips_data.rebalancing_strategy_description,
        monitoring_review_description: ips_data.monitoring_review_description,
        constraints_description: ips_data.constraints_description,
        goals_description: ips_data.goals_description,
        status: 'Draft'
      })
      .select()
      .single();

    if (ipsError) throw ipsError;

    // 2. Insert Target Allocations
    const allocationInserts = target_allocations.map((a: any) => ({
      ips_id: ips.id,
      asset_class: a.asset_class,
      target_percent: a.target_percent,
      lower_band: a.lower_band,
      upper_band: a.upper_band
    }));

    const { error: allocError } = await supabase
      .from('target_allocations')
      .insert(allocationInserts);

    if (allocError) throw allocError;

    // Fetch the full IPS with allocations to return
    const { data: fullIps, error: fetchError } = await supabase
      .from('ips_documents')
      .select(`
        *,
        target_allocations (*)
      `)
      .eq('id', ips.id)
      .single();

    if (fetchError) throw fetchError;

    res.json({ status: "ok", data: fullIps });
  } catch (error: any) {
    console.error("Error saving IPS:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get latest IPS for a client
router.get("/client/:client_id", async (req, res) => {
  try {
    const { client_id } = req.params;
    const { data, error } = await supabase
      .from('ips_documents')
      .select(`
        *,
        target_allocations (*),
        risk_assessments (*),
        clients:client_id (
          first_name,
          last_name,
          advisors:advisor_id (
            full_name
          )
        )
      `)
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    res.json({ status: "ok", data: data || null });
  } catch (error: any) {
    console.error("Error fetching IPS:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Update IPS Document
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      investment_objective, 
      time_horizon_years, 
      liquidity_needs, 
      tax_considerations, 
      rebalancing_frequency,
      rebalancing_strategy_description,
      monitoring_review_description,
      constraints_description,
      goals_description,
      status,
      allocations 
    } = req.body;

    // 1. Update IPS Document fields
    const updates: any = {
      investment_objective,
      time_horizon_years,
      liquidity_needs,
      tax_considerations,
      rebalancing_frequency,
      rebalancing_strategy_description,
      monitoring_review_description,
      constraints_description,
      goals_description,
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'Finalized') {
      updates.finalized_at = new Date().toISOString();
    }

    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (ipsError) throw ipsError;

    // 2. Update Allocations (Upsert)
    if (allocations && Array.isArray(allocations)) {
      for (const alloc of allocations) {
        if (alloc.id) {
          const { error: allocError } = await supabase
            .from('target_allocations')
            .update({
              target_percent: alloc.target_percent,
              lower_band: alloc.lower_band,
              upper_band: alloc.upper_band,
              updated_at: new Date().toISOString()
            })
            .eq('id', alloc.id);
            
          if (allocError) throw allocError;
        }
      }
    }

    res.json({ status: "ok", data: ips });
  } catch (error: any) {
    console.error("Error updating IPS:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Accept IPS Document
router.put("/:id/accept", async (req, res) => {
  try {
    const { id } = req.params;
    const { role, investable_assets } = req.body; // 'advisor' or 'client'

    if (!role || (role !== 'advisor' && role !== 'client')) {
      return res.status(400).json({ status: "error", message: "Invalid role specified" });
    }

    const updates: any = {};
    const timestamp = new Date().toISOString();

    if (role === 'advisor') {
      updates.advisor_accepted_at = timestamp;
    } else {
      updates.client_accepted_at = timestamp;
      
      // If client is accepting and provided investable_assets, update client record
      if (investable_assets) {
        const { data: ipsData } = await supabase
          .from('ips_documents')
          .select('client_id')
          .eq('id', id)
          .single();
          
        if (ipsData) {
          await supabase
            .from('clients')
            .update({ investable_assets })
            .eq('id', ipsData.client_id);
        }
      }
    }

    // Check if both have accepted to finalize
    // First fetch current state
    const { data: currentIPS, error: fetchError } = await supabase
      .from('ips_documents')
      .select('advisor_accepted_at, client_accepted_at')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (role === 'advisor' && currentIPS.client_accepted_at) {
      updates.status = 'Active';
      updates.finalized_at = timestamp;
    } else if (role === 'client' && currentIPS.advisor_accepted_at) {
      updates.status = 'Active';
      updates.finalized_at = timestamp;
    }

    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (ipsError) throw ipsError;

    res.json({ status: "ok", data: ips });
  } catch (error: any) {
    console.error("Error accepting IPS:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Build Portfolio from IPS (Advisor Only)
router.post("/:id/build-portfolio", async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch IPS
    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (ipsError || !ips) {
      return res.status(404).json({ status: "error", message: "IPS not found" });
    }

    if (ips.status !== 'Active') {
      return res.status(400).json({ status: "error", message: "Portfolio can only be built for an Active IPS." });
    }

    // 2. Fetch client to get investment amount
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('investable_assets, net_worth')
      .eq('id', ips.client_id)
      .single();

    if (clientError) throw clientError;

    const investmentAmount = client.investable_assets || client.net_worth;

    if (!investmentAmount || investmentAmount <= 0) {
      return res.status(400).json({ 
        status: "error", 
        message: "Client's investable assets or net worth is missing. Please ensure the client has provided an investment amount." 
      });
    }

    // 3. Create Portfolio
    const newPortfolio = await portfolioService.createPortfolioFromIPS(id, ips.client_id, investmentAmount);

    // 4. Fetch full portfolio with holdings to return
    const { data: fullPortfolio, error: fetchPortError } = await supabase
      .from('portfolios')
      .select(`
        *,
        holdings:portfolio_holdings (
          *,
          security:securities (*)
        )
      `)
      .eq('id', newPortfolio.id)
      .single();

    if (fetchPortError) throw fetchPortError;

    res.json({ status: "ok", data: fullPortfolio });
  } catch (error: any) {
    console.error("Error building portfolio:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
