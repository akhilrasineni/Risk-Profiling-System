import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';
import { scoringService } from '../../services/scoringService.ts';

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
    
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Deterministic Scoring
router.post("/:id/deterministic-scoring", async (req, res) => {
  try {
    const { id } = req.params;
    const analysis = await scoringService.calculateDeterministicScore(id);

    // Save the analysis to dual_scoring_analysis column for backward compatibility
    const { data, error } = await supabase
      .from('risk_assessments')
      .update({ dual_scoring_analysis: analysis, risk_category: analysis.risk_category })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.json({ status: "ok", data: analysis, message: "Analysis completed but not saved to DB (column missing)" });
    }

    res.json({ status: "ok", data: analysis });
  } catch (error: any) {
    
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
    
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Save behavioral bias analysis
router.post("/:id/behavioral-bias", async (req, res) => {
  try {
    const { id } = req.params;
    const { analysis } = req.body;

    const { data, error } = await supabase
      .from('risk_assessments')
      .update({ behavioral_bias_analysis: analysis })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ status: "ok", data });
  } catch (error: any) {
    
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Reject a risk assessment (Deletes it and allows the client to retake)
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

    // 2. Get dependent IPS documents to delete their target allocations
    const { data: ipsDocs } = await supabase
      .from('ips_documents')
      .select('id')
      .eq('risk_assessment_id', id);

    if (ipsDocs && ipsDocs.length > 0) {
      const ipsIds = ipsDocs.map(doc => doc.id);
      await supabase.from('target_allocations').delete().in('ips_id', ipsIds);
      await supabase.from('ips_documents').delete().in('id', ipsIds);
    }

    // 3. Delete dependent records
    await supabase.from('risk_assessment_responses').delete().eq('risk_assessment_id', id);
    await supabase.from('risk_factor_breakdown').delete().eq('risk_assessment_id', id);
    await supabase.from('risk_dual_scores').delete().eq('risk_assessment_id', id);

    // 4. Delete the assessment
    await supabase
      .from('risk_assessments')
      .delete()
      .eq('id', id);

    // 5. Reset the client's completion flag so they can retake it
    await supabase
      .from('clients')
      .update({ risk_assessment_completed: false })
      .eq('id', assessment.client_id);

    res.json({ status: "ok", message: "Assessment deleted. Client can now retake." });
  } catch (error: any) {
    
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
