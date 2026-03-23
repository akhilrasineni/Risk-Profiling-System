import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';

const router = Router();

// Create a new client (investor)
router.post("/", async (req, res) => {
  try {
    const payload = req.body;
    
    // Basic validation
    if (!payload.advisor_id || !payload.first_name || !payload.last_name || !payload.email) {
      return res.status(400).json({ status: "error", message: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from('clients')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    res.json({ status: "ok", data });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Fetch a client's risk assessment profile
router.get("/:id/risk_assessment", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the latest assessment
    const { data: assessment, error: assessmentError } = await supabase
      .from('risk_assessments')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (assessmentError || !assessment) {
      return res.status(404).json({ status: "error", message: "No risk assessment found for this client." });
    }

    // Fetch the responses with joined data
    const { data: responses, error: responsesError } = await supabase
      .from('risk_assessment_responses')
      .select(`
        id,
        score_given,
        question_id,
        selected_option_id,
        risk_questions ( question_text ),
        risk_answer_options ( option_text )
      `)
      .eq('risk_assessment_id', assessment.id);

    if (responsesError) throw responsesError;

    // Map the responses to a cleaner structure
    const mappedResponses = responses.map((r: any) => ({
      id: r.id,
      score_given: r.score_given,
      question_id: r.question_id,
      selected_option_id: r.selected_option_id,
      question_text: r.risk_questions?.question_text || 'Unknown Question',
      option_text: r.risk_answer_options?.option_text || 'Unknown Option'
    }));

    res.json({
      status: "ok",
      data: {
        ...assessment,
        responses: mappedResponses
      }
    });

  } catch (error: any) {
    
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Delete a client and all associated data
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get all portfolios for the client to delete holdings and drift events
    const { data: portfolios } = await supabase.from('portfolios').select('id').eq('client_id', id);
    const portfolioIds = portfolios?.map(p => p.id) || [];

    // 2. Get all IPS documents for the client to delete target allocations
    const { data: ipsDocs } = await supabase.from('ips_documents').select('id').eq('client_id', id);
    const ipsIds = ipsDocs?.map(i => i.id) || [];

    // 3. Get all risk assessments for the client to delete responses
    const { data: assessments } = await supabase.from('risk_assessments').select('id').eq('client_id', id);
    const assessmentIds = assessments?.map(a => a.id) || [];

    

    // --- START DELETIONS (Child-most tables first to respect FK constraints if any) ---

    // Delete Drift Events
    if (portfolioIds.length > 0) {
      await supabase.from('drift_events').delete().in('portfolio_id', portfolioIds);
    }

    // Delete Portfolio Holdings
    if (portfolioIds.length > 0) {
      await supabase.from('portfolio_holdings').delete().in('portfolio_id', portfolioIds);
    }

    // Delete Portfolios
    await supabase.from('portfolios').delete().eq('client_id', id);

    // Delete Target Allocations
    if (ipsIds.length > 0) {
      await supabase.from('target_allocations').delete().in('ips_id', ipsIds);
    }

    // Delete IPS Documents
    await supabase.from('ips_documents').delete().eq('client_id', id);

    // Delete Risk Assessment Responses and Dual Scoring Data
    if (assessmentIds.length > 0) {
      await supabase.from('risk_assessment_responses').delete().in('risk_assessment_id', assessmentIds);
      await supabase.from('risk_factor_breakdown').delete().in('risk_assessment_id', assessmentIds);
      await supabase.from('risk_dual_scores').delete().in('risk_assessment_id', assessmentIds);
    }

    // Delete Risk Assessments
    await supabase.from('risk_assessments').delete().eq('client_id', id);

    // Delete User Login
    const { error: loginError } = await supabase
      .from('user_login')
      .delete()
      .eq('profile_id', id);

    if (loginError) {
      
    }

    // Finally, delete the client record
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ status: "ok", message: "Client and all associated data deleted successfully." });
  } catch (error: any) {
    
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
