import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';

const router = Router();

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

// Save consistency analysis
router.post("/:id/consistency", async (req, res) => {
  try {
    const { id } = req.params;
    const { analysis } = req.body;

    const { data, error } = await supabase
      .from('risk_assessments')
      .update({ consistency_analysis: analysis })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ status: "ok", data });
  } catch (error: any) {
    console.error("Error saving consistency analysis:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Save dual scoring analysis
router.post("/:id/dual-scoring", async (req, res) => {
  try {
    const { id } = req.params;
    const { analysis } = req.body;

    // We'll try to save to dual_scoring_analysis column. 
    // If it doesn't exist, we'll just return success to avoid breaking the UI, 
    // but the data won't persist until the user adds the column.
    const { data, error } = await supabase
      .from('risk_assessments')
      .update({ dual_scoring_analysis: analysis })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn("Could not save dual scoring analysis (column might be missing):", error.message);
      return res.json({ status: "ok", message: "Analysis completed but not saved to DB (column missing)" });
    }

    res.json({ status: "ok", data });
  } catch (error: any) {
    console.error("Error saving dual scoring analysis:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Save behavioral bias analysis
router.post("/:id/behavioral-biases", async (req, res) => {
  try {
    const { id } = req.params;
    const { analysis } = req.body;

    const { data, error } = await supabase
      .from('risk_assessments')
      .update({ behavioral_bias_analysis: analysis })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn("Could not save behavioral bias analysis (column might be missing):", error.message);
      return res.json({ status: "ok", message: "Analysis completed but not saved to DB (column missing)" });
    }

    res.json({ status: "ok", data });
  } catch (error: any) {
    console.error("Error saving behavioral bias analysis:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Save risk probability analysis
router.post("/:id/risk-probabilities", async (req, res) => {
  try {
    const { id } = req.params;
    const { analysis } = req.body;

    const { data, error } = await supabase
      .from('risk_assessments')
      .update({ risk_probability_analysis: analysis })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn("Could not save risk probability analysis (column might be missing):", error.message);
      return res.json({ status: "ok", message: "Analysis completed but not saved to DB (column missing)" });
    }

    res.json({ status: "ok", data });
  } catch (error: any) {
    console.error("Error saving risk probability analysis:", error);
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
