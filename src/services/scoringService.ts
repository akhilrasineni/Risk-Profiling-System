import { supabase } from '../db/supabase.ts';
import { aiService } from './aiService.ts';

/**
 * Service for calculating risk scores using deterministic and AI-assisted methodologies.
 */
class ScoringService {
  /**
   * Calculates a deterministic risk score based on client capacity and tolerance factors.
   * 
   * @param assessmentId The ID of the risk assessment to score.
   * @returns A detailed scoring report including capacity, tolerance, and final risk scores.
   * @throws Error if the assessment is not found.
   */
  async calculateDeterministicScore(assessmentId: string) {
    // 1. Fetch assessment with client and responses
    const { data: assessment, error: assessmentError } = await supabase
      .from('risk_assessments')
      .select(`
        *,
        client:clients(*),
        responses:risk_assessment_responses(
          *,
          question:risk_questions(*),
          option:risk_answer_options(*)
        )
      `)
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      throw new Error(`Assessment not found: ${assessmentError?.message}`);
    }

    const client = assessment.client || {};
    const responses = assessment.responses || [];

    // 2. Fetch methodology version
    let methodology = null;
    const { data: existingMethodology, error: methodError } = await supabase
      .from('risk_methodology_versions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (methodError || !existingMethodology) {
      // Create a default methodology if none exists
      const defaultConfig = {
        capacity_factors: {
          NET_WORTH: {
            weight: 0.4,
            mapping: [
              { min: 0, max: 250000, score: 1 },
              { min: 250001, max: 1000000, score: 2 },
              { min: 1000001, max: 5000000, score: 3 },
              { min: 5000001, max: 10000000, score: 4 },
              { min: 10000001, max: 999999999, score: 5 }
            ]
          },
          ANNUAL_INCOME: {
            weight: 0.4,
            mapping: [
              { min: 0, max: 75000, score: 1 },
              { min: 75001, max: 150000, score: 2 },
              { min: 150001, max: 300000, score: 3 },
              { min: 300001, max: 1000000, score: 4 },
              { min: 1000001, max: 999999999, score: 5 }
            ]
          },
          LIQUIDITY_NEEDS: {
            weight: 0.2,
            mapping: [
              { min: 0, max: 50000, score: 5 },
              { min: 50001, max: 250000, score: 4 },
              { min: 250001, max: 500000, score: 3 },
              { min: 500001, max: 1000000, score: 2 },
              { min: 1000001, max: 999999999, score: 1 }
            ]
          }
        },
        tolerance_factors: {
          default_weight: 0.20
        },
        final_rule: "MIN",
        thresholds: {
          "Conservative": { min: 0, max: 20 },
          "Moderately Conservative": { min: 21, max: 40 },
          "Moderate": { min: 41, max: 60 },
          "Moderately Aggressive": { min: 61, max: 80 },
          "Aggressive": { min: 81, max: 100 }
        }
      };

      const { data: newMethodology, error: insertError } = await supabase
        .from('risk_methodology_versions')
        .insert({
          methodology_name: 'Standard Dual Scoring',
          version: '1.0.0',
          config_json: defaultConfig,
          is_active: true
        })
        .select()
        .single();

      if (insertError) {
        console.warn(`Failed to create default methodology (possibly RLS): ${insertError.message}`);
        // Fallback to using the default config in-memory if DB insert fails
        methodology = {
          methodology_name: 'Standard Dual Scoring',
          version: '1.0.0 (Fallback)',
          config_json: defaultConfig
        };
      } else {
        methodology = newMethodology;
      }
    } else {
      methodology = existingMethodology;
    }

    const config = typeof methodology.config_json === 'string' ? JSON.parse(methodology.config_json) : methodology.config_json;
    const capacityFactorsConfig = config.capacity_factors || {};
    
    // 3. Calculate Capacity Score
    const capacityBreakdown = [];
    let capacityScore = 0;

    const mapValue = (value: number, mapping: any[]) => {
      if (!mapping || !Array.isArray(mapping)) return 1;
      for (const range of mapping) {
        if (value >= range.min && value <= range.max) {
          return range.score;
        }
      }
      return 1; // Default fallback
    };

    // Net Worth
    const netWorth = client.net_worth || 0;
    const nwMapped = mapValue(netWorth, capacityFactorsConfig.NET_WORTH?.mapping);
    const nwWeight = capacityFactorsConfig.NET_WORTH?.weight || 0.4;
    const nwWeighted = nwMapped * nwWeight;
    capacityScore += nwWeighted;
    capacityBreakdown.push({
      factor_type: 'CAPACITY',
      factor_name: 'NET_WORTH',
      input_value: netWorth.toString(),
      mapped_score: nwMapped,
      weight: nwWeight,
      weighted_score: nwWeighted,
      mapping_version: methodology.version
    });

    // Annual Income
    const annualIncome = client.annual_income || 0;
    const incMapped = mapValue(annualIncome, capacityFactorsConfig.ANNUAL_INCOME?.mapping);
    const incWeight = capacityFactorsConfig.ANNUAL_INCOME?.weight || 0.4;
    const incWeighted = incMapped * incWeight;
    capacityScore += incWeighted;
    capacityBreakdown.push({
      factor_type: 'CAPACITY',
      factor_name: 'ANNUAL_INCOME',
      input_value: annualIncome.toString(),
      mapped_score: incMapped,
      weight: incWeight,
      weighted_score: incWeighted,
      mapping_version: methodology.version
    });

    // Liquidity Needs
    const liquidityNeeds = client.liquidity_needs || 0;
    const liqMapped = mapValue(liquidityNeeds, capacityFactorsConfig.LIQUIDITY_NEEDS?.mapping);
    const liqWeight = capacityFactorsConfig.LIQUIDITY_NEEDS?.weight || 0.2;
    const liqWeighted = liqMapped * liqWeight;
    capacityScore += liqWeighted;
    capacityBreakdown.push({
      factor_type: 'CAPACITY',
      factor_name: 'LIQUIDITY_NEEDS',
      input_value: liquidityNeeds.toString(),
      mapped_score: liqMapped,
      weight: liqWeight,
      weighted_score: liqWeighted,
      mapping_version: methodology.version
    });

    // Normalize capacity score to 0-100 scale (max possible is 5 * 1.0 = 5)
    const normalizedCapacityScore = Math.round((capacityScore / 5) * 100);

    // 4. Calculate Tolerance Score
    const toleranceBreakdown = [];
    let toleranceScore = 0;
    let totalToleranceWeight = 0;

    for (const response of responses) {
      if (!response.option || !response.question) continue;
      
      const mappedScore = response.option.score_value || 0;
      const weight = response.question.weight || config.tolerance_factors?.default_weight || 0.20;
      const weightedScore = mappedScore * weight;
      
      toleranceScore += weightedScore;
      totalToleranceWeight += weight;

      toleranceBreakdown.push({
        factor_type: 'TOLERANCE',
        factor_name: response.question.question_text,
        question_id: response.question.id,
        selected_option_id: response.option.id,
        input_value: response.option.option_text,
        mapped_score: mappedScore,
        weight: weight,
        weighted_score: weightedScore,
        mapping_version: methodology.version
      });
    }

    // Normalize tolerance score to 0-100 scale (assuming max score per question is 5)
    // If weights don't sum to 1, we normalize it based on total weight
    const maxPossibleTolerance = totalToleranceWeight > 0 ? (totalToleranceWeight * 5) : 5;
    const normalizedToleranceScore = totalToleranceWeight > 0 
      ? Math.round((toleranceScore / maxPossibleTolerance) * 100)
      : 0;

    // 5. Apply Final Rule
    let finalScore = 0;
    const finalRule = config.final_rule || 'MIN';

    if (finalRule === 'MIN') {
      finalScore = Math.min(normalizedCapacityScore, normalizedToleranceScore);
    } else if (finalRule === 'WEIGHTED') {
      finalScore = Math.round((normalizedCapacityScore * 0.5) + (normalizedToleranceScore * 0.5));
    } else {
      finalScore = Math.min(normalizedCapacityScore, normalizedToleranceScore);
    }

    // Determine Risk Category
    let riskCategory = 'MODERATE';
    for (const [category, range] of Object.entries(config.thresholds || {})) {
      const r = range as {min: number, max: number};
      if (finalScore >= r.min && finalScore <= r.max) {
        riskCategory = category;
        break;
      }
    }

    // 6. Record factor-level breakdown (Insert into DB)
    const breakdownInserts = [...capacityBreakdown, ...toleranceBreakdown].map(b => ({
      ...b,
      factor_name: b.factor_name.substring(0, 50),
      risk_assessment_id: assessmentId
    }));

    // We'll try to insert, but if the tables don't exist yet, we'll catch the error
    // and just return the JSON. This ensures the app doesn't break if migrations haven't run.
    let auditId = 'AUTO_GENERATED_ID';
    
    try {
      // Clear old breakdowns
      await supabase.from('risk_factor_breakdown').delete().eq('risk_assessment_id', assessmentId);
      
      // Insert new breakdowns
      const { error: breakdownError } = await supabase.from('risk_factor_breakdown').insert(breakdownInserts);
      if (breakdownError) throw breakdownError;

      // Clear old dual scores
      await supabase.from('risk_dual_scores').delete().eq('risk_assessment_id', assessmentId);

      // Insert dual scores
      const { error: dualScoreError } = await supabase.from('risk_dual_scores').insert({
        risk_assessment_id: assessmentId,
        capacity_score: normalizedCapacityScore,
        tolerance_score: normalizedToleranceScore,
        final_score: finalScore,
        final_rule: finalRule
      });
      if (dualScoreError) throw dualScoreError;

      // Insert audit log
      const { data: auditData, error: auditError } = await supabase.from('audit_logs').insert({
        action: 'DETERMINISTIC_SCORING_COMPLETED',
        entity_type: 'RISK_ASSESSMENT',
        entity_id: assessmentId,
        details: {
          methodology_version: methodology.version,
          final_score: finalScore,
          capacity_score: normalizedCapacityScore,
          tolerance_score: normalizedToleranceScore
        }
      }).select().single();
      
      if (!auditError && auditData) {
        auditId = auditData.id;
      }
    } catch (dbError) {
      console.warn("Could not save to deterministic tables. Returning JSON anyway.", dbError);
    }

    // 7. Generate AI Explanation
    const explanationPrompt = `
      You are an AI assistant explaining a deterministic risk score to a financial advisor.
      
      The system has calculated the following scores deterministically:
      - Risk Capacity Score: ${normalizedCapacityScore}/100
      - Risk Tolerance Score: ${normalizedToleranceScore}/100
      - Final Risk Score: ${finalScore}/100 (Rule: ${finalRule})
      - Risk Category: ${riskCategory}
      
      Client Financial Context:
      - Net Worth: $${client.net_worth?.toLocaleString() || 'N/A'}
      - Annual Income: $${client.annual_income?.toLocaleString() || 'N/A'}
      - Liquidity Needs: $${client.liquidity_needs?.toLocaleString() || 'N/A'}
      
      Provide a concise, professional markdown explanation of these scores.
      Explain the gap between capacity and tolerance if one exists.
      Do NOT mention that you calculated the scores (because you didn't).
      Do NOT invent new data.
    `;

    let explanation = "Explanation unavailable.";
    try {
      const aiResponse = await aiService.generateContent(explanationPrompt, { temperature: 0, seed: 42 });
      explanation = aiResponse.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
    } catch (e) {
      console.error("Failed to generate AI explanation", e);
    }

    // 8. Output JSON
    return {
      capacity_score: normalizedCapacityScore,
      tolerance_score: normalizedToleranceScore,
      final_risk_score: finalScore,
      final_rule: finalRule,
      risk_band: riskCategory,
      risk_category: riskCategory,
      methodology_name: methodology.methodology_name,
      version: methodology.version,
      capacity_breakdown: capacityBreakdown,
      tolerance_breakdown: toleranceBreakdown,
      explanation: explanation,
      flags: [
        {
          type: "CONSISTENCY_CHECK",
          message: Math.abs(normalizedCapacityScore - normalizedToleranceScore) > 30 
            ? "Significant mismatch between capacity and tolerance detected." 
            : "No major mismatch between capacity and tolerance."
        }
      ],
      audit_id: auditId
    };
  }
}

export const scoringService = new ScoringService();
