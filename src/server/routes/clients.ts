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
    console.error("Error fetching risk assessment:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
