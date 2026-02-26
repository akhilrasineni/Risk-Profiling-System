import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';
import { aiService } from '../../services/aiService.ts';
import { ALLOCATION_MODELS, RiskCategory } from '../../constants/allocationModels.ts';

const router = Router();

// Generate Draft IPS
router.post("/generate", async (req, res) => {
  try {
    const { client_id, risk_assessment_id } = req.body;

    if (!client_id || !risk_assessment_id) {
      return res.status(400).json({ status: "error", message: "Missing required fields" });
    }

    // 1. Fetch Risk Assessment & Client Data
    const { data: assessment, error: assessmentError } = await supabase
      .from('risk_assessments')
      .select(`
        *,
        clients:client_id (
          first_name,
          last_name,
          advisors:advisor_id (
            full_name
          )
        )
      `)
      .eq('id', risk_assessment_id)
      .single();

    if (assessmentError || !assessment) {
      return res.status(404).json({ status: "error", message: "Risk assessment not found" });
    }

    // Eligibility Check
    if (!assessment.finalized_by_advisor) {
      return res.status(400).json({ status: "error", message: "Risk assessment must be finalized by advisor." });
    }
    
    // Check AI Confidence Score (assuming 0-100 scale based on previous context)
    // If it's stored as 0-1, multiply by 100. If it's 0-100, use as is.
    // The user requirement is >= 0.65. If the score is 66, that's > 0.65.
    // If the score is 0.7, that's > 0.65.
    // Let's assume if score > 1, it's a percentage. If <= 1, it's a ratio.
    const score = assessment.ai_confidence_score;
    const normalizedScore = score > 1 ? score / 100 : score;
    
    if (normalizedScore < 0.65) {
      return res.status(400).json({ status: "error", message: `AI Confidence Score too low (${(normalizedScore * 100).toFixed(1)}%). Minimum 65% required.` });
    }

    const client = assessment.clients;
    const riskCategory = assessment.risk_category as RiskCategory;

    // 2. Fetch Allocation Model
    const model = ALLOCATION_MODELS[riskCategory];
    if (!model) {
      return res.status(400).json({ status: "error", message: `Invalid risk category: ${riskCategory}` });
    }

    // 3. Determine Time Horizon from Responses
    const { data: responses, error: responsesError } = await supabase
      .from('risk_assessment_responses')
      .select(`
        *,
        risk_questions (question_text),
        risk_answer_options (option_text)
      `)
      .eq('risk_assessment_id', risk_assessment_id);

    if (responsesError) throw responsesError;

    let timeHorizon = 5; // Default
    const horizonResponse = responses.find((r: any) => 
      r.risk_questions.question_text.toLowerCase().includes('horizon') || 
      r.risk_questions.question_text.toLowerCase().includes('years')
    );

    if (horizonResponse) {
      const text = horizonResponse.risk_answer_options.option_text;
      const match = text.match(/(\d+)/);
      if (match) {
        timeHorizon = parseInt(match[1]);
      }
    }

    // 4. Generate Full IPS via AI
    const staticAllocations = [
      { asset_class: 'Equity', target_percent: model.Equity },
      { asset_class: 'Debt', target_percent: model.Debt },
      { asset_class: 'Alternatives', target_percent: model.Alternatives }
    ];

    const aiResponse = await aiService.generateFullIPS(
      client,
      riskCategory,
      timeHorizon,
      client.liquidity_needs || 0,
      client.tax_bracket || 0,
      "None", // Default ESG
      "None", // Default Concentrated Position
      {}, // Default Constraints
      staticAllocations
    );

    // 5. Insert IPS Document
    const { data: ips, error: ipsError } = await supabase
      .from('ips_documents')
      .insert({
        client_id,
        risk_assessment_id,
        risk_category: riskCategory,
        investment_objective: aiResponse.investment_objective,
        time_horizon_years: timeHorizon,
        liquidity_needs: client.liquidity_needs || 0,
        tax_considerations: client.tax_bracket || 0,
        rebalancing_frequency: aiResponse.rebalancing_frequency || model.Rebalance,
        rebalancing_strategy_description: aiResponse.rebalancing_strategy_description,
        monitoring_review_description: aiResponse.monitoring_review_description,
        constraints_description: aiResponse.constraints_description,
        goals_description: aiResponse.goals_description,
        status: 'Draft'
      })
      .select()
      .single();

    if (ipsError) throw ipsError;

    // 6. Insert Target Allocations
    // Use AI generated allocations if available, otherwise fallback to model
    const allocationsToInsert = aiResponse.target_allocations && aiResponse.target_allocations.length > 0
      ? aiResponse.target_allocations
      : [
          { asset_class: 'Equity', target_percent: model.Equity, lower_band: Math.max(0, model.Equity - 5), upper_band: Math.min(100, model.Equity + 5) },
          { asset_class: 'Debt', target_percent: model.Debt, lower_band: Math.max(0, model.Debt - 5), upper_band: Math.min(100, model.Debt + 5) },
          { asset_class: 'Alternatives', target_percent: model.Alternatives, lower_band: Math.max(0, model.Alternatives - 5), upper_band: Math.min(100, model.Alternatives + 5) }
        ];

    const allocationInserts = allocationsToInsert.map((a: any) => ({
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

    // Fetch full IPS with allocations to return
    const { data: fullIPS, error: fetchError } = await supabase
      .from('ips_documents')
      .select(`
        *,
        target_allocations (*),
        clients:client_id (
          first_name,
          last_name,
          advisors:advisor_id (
            full_name
          )
        )
      `)
      .eq('id', ips.id)
      .single();

    if (fetchError) throw fetchError;

    res.json({ status: "ok", data: fullIPS });

  } catch (error: any) {
    console.error("IPS Generation Error:", error);
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
    const { role } = req.body; // 'advisor' or 'client'

    if (!role || (role !== 'advisor' && role !== 'client')) {
      return res.status(400).json({ status: "error", message: "Invalid role specified" });
    }

    const updates: any = {};
    const timestamp = new Date().toISOString();

    if (role === 'advisor') {
      updates.advisor_accepted_at = timestamp;
    } else {
      updates.client_accepted_at = timestamp;
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
      updates.status = 'Finalized';
      updates.finalized_at = timestamp;
    } else if (role === 'client' && currentIPS.advisor_accepted_at) {
      updates.status = 'Finalized';
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

export default router;
