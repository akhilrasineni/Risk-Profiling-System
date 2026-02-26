import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';

import { aiService } from '../../services/aiService.ts';

const router = Router();

// Analyze inconsistencies in a risk assessment
router.post("/:id/analyze", async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch the assessment and its responses
    const { data: assessment, error: assessmentError } = await supabase
      .from('risk_assessments')
      .select(`
        *,
        responses:risk_assessment_responses (
          *,
          risk_questions (question_text),
          risk_answer_options (option_text)
        )
      `)
      .eq('id', id)
      .single();

    if (assessmentError || !assessment) {
      return res.status(404).json({ status: "error", message: "Assessment not found" });
    }

    // 2. Call AI Service
    const analysis = await aiService.analyzeInconsistencies(
      assessment.risk_category,
      assessment.responses
    );

    res.json({ status: "ok", data: analysis });
  } catch (error: any) {
    console.error("Analysis Error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Finalize a risk assessment
router.post("/:id/finalize", async (req, res) => {
  try {
    const { id } = req.params;
    const { override_category, override_reason } = req.body;

    const updateData: any = {
      finalized_by_advisor: true,
      finalized_at: new Date().toISOString()
    };

    if (override_category) {
      updateData.advisor_override_category = override_category;
    }
    if (override_reason) {
      updateData.advisor_override_reason = override_reason;
    }

    const { data, error } = await supabase
      .from('risk_assessments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ status: "ok", data });
  } catch (error: any) {
    console.error("Error finalizing assessment:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Reject a risk assessment (Allows the client to retake without deleting history)
router.post("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get the assessment to find the client_id
    const { data: assessment, error: fetchError } = await supabase
      .from('risk_assessments')
      .select('client_id')
      .eq('id', id)
      .single();

    if (fetchError || !assessment) throw new Error("Assessment not found");

    // 2. Mark this assessment as rejected in the history
    await supabase
      .from('risk_assessments')
      .update({ 
        finalized_by_advisor: false,
        finalized_at: null,
        advisor_override_reason: 'Rejected by advisor. Client requested to retake.'
      })
      .eq('id', id);

    // 3. Reset the client's completion flag so they can retake it
    await supabase
      .from('clients')
      .update({ risk_assessment_completed: false })
      .eq('id', assessment.client_id);

    res.json({ status: "ok", message: "Assessment rejected. Client can now retake." });
  } catch (error: any) {
    console.error("Error rejecting assessment:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
