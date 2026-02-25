import { Router } from 'express';
import { supabase } from '../../db/supabase.ts';

const router = Router();

// Fetch a specific questionnaire by version, including questions and options
router.get("/:version", async (req, res) => {
  try {
    const { version } = req.params;
    console.log(`[API] Fetching questionnaire version: ${version}`);

    // 1. Fetch the questionnaire
    let { data: questionnaire, error: qError } = await supabase
      .from('risk_questionnaires')
      .select('*')
      .eq('version', version)
      .single();

    // Fallback: If the specific version isn't found, just grab the first one available
    if (qError || !questionnaire) {
      console.log(`[API] Version ${version} not found (Error: ${qError?.message || 'None'}). Attempting fallback...`);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('risk_questionnaires')
        .select('*')
        .limit(1)
        .single();
        
      if (fallbackError || !fallbackData) {
        console.error(`[API] Fallback failed. Error:`, fallbackError);
        return res.status(404).json({ 
          status: "error", 
          message: `Database Error: ${fallbackError?.message || 'No questionnaires found in the table.'}`,
          details: fallbackError
        });
      }
      questionnaire = fallbackData;
      console.log(`[API] Fallback successful. Found questionnaire ID: ${questionnaire.id}`);
    }

    // 2. Fetch all related questions ordered by order_number
    console.log(`[API] Fetching questions for questionnaire ID: ${questionnaire.id}`);
    const { data: questions, error: questionsError } = await supabase
      .from('risk_questions')
      .select('*')
      .eq('questionnaire_id', questionnaire.id)
      .order('order_number', { ascending: true });

    if (questionsError) {
      console.error(`[API] Error fetching questions:`, questionsError);
      return res.status(500).json({ 
        status: "error", 
        message: `Error fetching questions: ${questionsError.message}`,
        details: questionsError
      });
    }

    // 3. Fetch all answer options for these questions
    const questionIds = questions.map((q: any) => q.id);
    console.log(`[API] Fetching options for ${questionIds.length} questions...`);
    
    let options: any[] = [];
    if (questionIds.length > 0) {
      const { data: optionsData, error: optionsError } = await supabase
        .from('risk_answer_options')
        .select('*')
        .in('question_id', questionIds);

      if (optionsError) {
        console.error(`[API] Error fetching options:`, optionsError);
        return res.status(500).json({ 
          status: "error", 
          message: `Error fetching options: ${optionsError.message}`,
          details: optionsError
        });
      }
      options = optionsData || [];
    }

    // 4. Assemble the final nested object
    const assembledQuestions = questions.map((q: any) => ({
      ...q,
      options: options.filter((o: any) => o.question_id === q.id)
    }));

    console.log(`[API] Successfully assembled questionnaire with ${assembledQuestions.length} questions.`);
    res.json({
      status: "ok",
      data: {
        ...questionnaire,
        questions: assembledQuestions
      }
    });

  } catch (error: any) {
    console.error("[API] Unhandled error fetching questionnaire:", error);
    res.status(500).json({ status: "error", message: error.message, details: error });
  }
});

// Submit questionnaire responses
router.post("/submit", async (req, res) => {
  try {
    const payload = req.body;
    
    // Validate payload structure
    if (!payload.client_id || !payload.questionnaire_id || !Array.isArray(payload.responses)) {
      return res.status(400).json({ status: "error", message: "Invalid payload format" });
    }

    console.log("Received Risk Profiling Submission:", JSON.stringify(payload, null, 2));

    // 1. Fetch all questions and options for this questionnaire to calculate scores
    const { data: questions, error: qError } = await supabase
      .from('risk_questions')
      .select('*')
      .eq('questionnaire_id', payload.questionnaire_id);

    if (qError || !questions) throw new Error("Failed to fetch questions for scoring");

    const questionIds = questions.map(q => q.id);
    const { data: options, error: oError } = await supabase
      .from('risk_answer_options')
      .select('*')
      .in('question_id', questionIds);

    if (oError || !options) throw new Error("Failed to fetch options for scoring");

    // 2. Calculate Scores
    let raw_score = 0;
    let max_score = 0;
    const responseInserts: any[] = [];

    for (const q of questions) {
      const qOptions = options.filter(o => o.question_id === q.id);
      const maxOptScore = Math.max(...qOptions.map(o => o.score_value));
      max_score += maxOptScore * q.weight;

      const userResponse = payload.responses.find((r: any) => r.question_id === q.id);
      if (userResponse) {
        const selectedOpt = qOptions.find(o => o.id === userResponse.selected_option_id);
        const score_given = (selectedOpt?.score_value || 0) * q.weight;
        raw_score += score_given;

        responseInserts.push({
          question_id: q.id,
          selected_option_id: userResponse.selected_option_id,
          score_given: score_given
        });
      }
    }

    const normalized_score = max_score > 0 ? raw_score / max_score : 0;
    
    // 3. Determine Category with Willingness vs Ability logic
    let willingness_raw = 0;
    let willingness_max = 0;
    let ability_raw = 0;
    let ability_max = 0;
    let is_knockout_conservative = false;

    for (const q of questions) {
      const qOptions = options.filter(o => o.question_id === q.id);
      const maxOptScore = Math.max(...qOptions.map(o => o.score_value));
      const userResponse = payload.responses.find((r: any) => r.question_id === q.id);
      
      if (userResponse) {
        const selectedOpt = qOptions.find(o => o.id === userResponse.selected_option_id);
        const score = (selectedOpt?.score_value || 0) * q.weight;
        const maxScore = maxOptScore * q.weight;
        const text = q.question_text.toLowerCase();

        const isAbility = text.includes('horizon') || text.includes('time') || text.includes('withdraw') || text.includes('income') || text.includes('years');
        
        if (isAbility) {
          ability_raw += score;
          ability_max += maxScore;
          if ((text.includes('horizon') || text.includes('time')) && selectedOpt && selectedOpt.score_value <= 1) {
            is_knockout_conservative = true;
          }
        } else {
          willingness_raw += score;
          willingness_max += maxScore;
        }
      }
    }

    const willingness_score = willingness_max > 0 ? (willingness_raw / willingness_max) * 100 : 0;
    const ability_score = ability_max > 0 ? (ability_raw / ability_max) * 100 : 0;

    // Final category: Minimum of Willingness and Ability, or Knock-out
    let risk_category = 'Conservative';
    if (is_knockout_conservative) {
      risk_category = 'Conservative';
    } else {
      // Use the lower of the two scores for suitability
      const suitability_score = Math.min(willingness_score, ability_score) / 100;
      if (suitability_score > 0.35 && suitability_score <= 0.65) {
        risk_category = 'Moderate';
      } else if (suitability_score > 0.65) {
        risk_category = 'Aggressive';
      }
    }

    // 4. Use AI Summary and Confidence from payload
    const ai_behavior_summary = payload.ai_behavior_summary || "";
    const ai_confidence_score = payload.ai_confidence_score || 0;

    // Append Suitability Analysis to the summary for persistence
    const suitabilityAnalysis = {
      willingness: Math.round(willingness_score),
      ability: Math.round(ability_score),
      knockout: is_knockout_conservative
    };
    const enhanced_summary = `${ai_behavior_summary}\n\n[SUITABILITY_ANALYSIS]:${JSON.stringify(suitabilityAnalysis)}`;

    // 5. Insert into risk_assessments
    const { data: assessment, error: assessmentError } = await supabase
      .from('risk_assessments')
      .insert({
        client_id: payload.client_id,
        questionnaire_id: payload.questionnaire_id,
        raw_score,
        normalized_score,
        risk_category,
        finalized_by_advisor: false,
        finalized_at: null,
        ai_behavior_summary: enhanced_summary,
        ai_confidence_score
      })
      .select()
      .single();

    if (assessmentError || !assessment) {
      throw new Error(`Failed to save risk assessment: ${assessmentError?.message}`);
    }

    // 6. Insert into risk_assessment_responses
    const finalResponses = responseInserts.map(r => ({
      ...r,
      risk_assessment_id: assessment.id
    }));

    const { error: responsesError } = await supabase
      .from('risk_assessment_responses')
      .insert(finalResponses);

    if (responsesError) {
      console.error("Failed to save individual responses:", responsesError);
    }

    // 7. Update the client's risk_assessment_completed flag
    const { error: updateError } = await supabase
      .from('clients')
      .update({ risk_assessment_completed: true })
      .eq('id', payload.client_id);

    if (updateError) {
      console.error("[API] Failed to update client flag:", updateError);
    }

    res.json({ 
      status: "ok", 
      message: "Questionnaire submitted and scored successfully.",
      data: assessment
    });

  } catch (error: any) {
    console.error("Submission Error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
