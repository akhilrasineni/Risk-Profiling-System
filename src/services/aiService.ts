import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { Client, RiskQuestion, RiskQuestionnaire, AIModel } from "../types";

export class AIService {
  private currentModel: AIModel = 'gemini-3-flash-preview';

  public setModel(model: AIModel) {
    this.currentModel = model;
  }

  public getModel(): AIModel {
    return this.currentModel;
  }
  
  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!apiKey) {
      console.error("CRITICAL: Missing GEMINI_API_KEY in process.env");
      throw new Error("GEMINI_API_KEY not configured");
    }
    return new GoogleGenAI({ apiKey });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = 
        error.message?.includes("503") || 
        error.message?.includes("high demand") || 
        error.message?.includes("UNAVAILABLE") ||
        error.message?.includes("fetch failed") ||
        error.message?.includes("Timeout");

      if (retries > 0 && isRetryable) {
        console.warn(`Gemini API error (retryable), retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  /**
   * Generates a behavioral summary and confidence score for a risk assessment.
   */
  async analyzeRiskAssessment(
    client: Client,
    questionnaire: RiskQuestionnaire & { questions: RiskQuestion[] },
    answers: Record<string, string>,
    modelOverride?: AIModel
  ) {
    const model = modelOverride || this.currentModel;
    const clientContext = `Client financial context: Annual Income: ${client.annual_income}, Net Worth: ${client.net_worth}, Tax Bracket: ${client.tax_bracket}%, Date of Birth: ${client.dob}.`;
    
    const responsesText = questionnaire.questions.map(q => {
      const selectedOptionId = answers[q.id];
      const option = q.options?.find(o => o.id === selectedOptionId);
      return `- ${q.question_text}: ${option?.option_text || 'Unknown'}`;
    }).join('\n');

    const prompt = `
      Analyze the following risk assessment responses to determine a financial risk profile.
      Client's financial context: ${clientContext}
      
      Responses:
      ${responsesText}

      Based on this, provide the following in a single JSON object:
      1.  "behavioral_summary" (string): A concise, 2-3 sentence summary of the client's likely investment behavior. IMPORTANT: Explicitly mention the reliability of the profile based on the consistency of their answers (e.g., "The profile is highly reliable due to consistent..." or "Caution is advised due to contradictory...").
      2.  "reliability_score" (integer 0-100): A holistic reliability score based on logical consistency, response stability, and profile depth. 100 is perfectly reliable, 0 is completely random/contradictory.
      3.  "consistency_score" (integer 0-100): How logically consistent the answers are with each other.
      4.  "response_stability" (integer 0-100): How "stable" the profile feels (e.g., does it feel like a real person's profile or random guesses).
    `;

    const ai = this.getClient();
    const result = await this.withRetry(() => ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json"
      }
    }));

    const aiResponse = result.text || "{}";
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  /**
   * Analyzes a risk assessment for inconsistencies.
   */
  async analyzeInconsistencies(
    riskCategory: string,
    responses: any[],
    modelOverride?: AIModel
  ) {
    const model = modelOverride || this.currentModel;
    const responsesText = responses.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      As an expert financial risk analyst, perform a concise deep-dive consistency check on the following risk assessment responses.
      The client has been algorithmically categorized as: ${riskCategory}.

      User Responses:
      ${responsesText}

      Your task is to identify "Behavioral Friction Points" or "Logical Contradictions". 
      
      **Formatting Rules:**
      - DO NOT use email formatting (no "Dear Advisor", "Subject", or "Best regards").
      - Use clear, bold headers.
      - Use bullet points for specific observations.
      - Keep the total response length moderate (approx 150-200 words).
      
      **Structure:**
      1. **Profile Alignment**: High-level verdict on the ${riskCategory} category.
      2. **Evidence of Consistency**: 1-2 key responses that anchor this profile.
      3. **Friction Points**: Identify specific contradictions (e.g., aggressive goals vs. low loss tolerance). If none, state "Profile is logically consistent."
      4. **Advisor Action**: One specific question or talking point for the client meeting.

      Tone: Professional, objective, and data-driven.
    `;

    const ai = this.getClient();
    const result = await this.withRetry(() => ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    }));

    return result.text || "Analysis complete, but no text returned.";
  }
  async generateFullIPS(
    client: Client,
    riskCategory: string,
    timeHorizon: number,
    liquidityNeeds: number,
    taxConsiderations: number,
    esgPreference: string,
    concentratedPosition: string,
    constraints: any,
    staticAllocations: any[],
    availableAssetClasses: string[],
    modelOverride?: AIModel
  ) {
    const model = modelOverride || this.currentModel;
    const prompt = `
      Generate a comprehensive Investment Policy Statement (IPS) for a client with the following profile:
      
      Risk Category: ${riskCategory}
      Time Horizon: ${timeHorizon} years
      Liquidity Needs: ${liquidityNeeds}
      Tax Considerations: ${taxConsiderations}%
      ESG Preference: ${esgPreference}
      Concentrated Position: ${concentratedPosition}
      Constraints: ${JSON.stringify(constraints)}

      **AVAILABLE ASSET CLASSES:**
      You MUST ONLY use asset classes from this list: ${availableAssetClasses.join(', ')}

      **Asset Allocation Strategy:**
      Start with the following BASE ALLOCATION (Static Model):
      ${JSON.stringify(staticAllocations)}

      Your task is to "play around" with this base allocation to better fit the client's specific profile (e.g., time horizon, tax situation). 
      - You may adjust the percentages slightly (e.g., +/- 5-10%).
      - You MUST ONLY use the asset classes provided in the AVAILABLE ASSET CLASSES list above.
      - Ensure the total sums to 100%.

      Please provide the output in the following JSON format:
      {
        "investment_objective": "A detailed paragraph describing the client's investment goals, return expectations, and risk tolerance.",
        "goals_description": "A detailed paragraph elaborating on the client's specific financial goals, time horizon implications, and liquidity needs.",
        "rebalancing_frequency": "Quarterly" | "Semi-Annually" | "Annually",
        "rebalancing_strategy_description": "A detailed paragraph explaining the rebalancing strategy, including drift tolerance and methodology.",
        "monitoring_review_description": "A detailed paragraph outlining the frequency and scope of portfolio reviews and performance monitoring.",
        "constraints_description": "A detailed paragraph summarizing the client's constraints, including liquidity needs, tax considerations, and any unique circumstances.",
        "target_allocations": [
          {
            "asset_class": "Asset Class Name",
            "target_percent": 0,
            "lower_band": 0,
            "upper_band": 0
          }
        ]
      }

      Ensure the target allocations sum to 100%. The asset classes should be appropriate for the risk profile.
      Set lower and upper bands (e.g., +/- 5% or 10% of target) to allow for drift.
    `;

    const ai = this.getClient();
    const result = await this.withRetry(() => ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json"
      }
    }));

    const aiResponse = result.text || "{}";
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  async suggestRebalanceActions(
    ips: any,
    targetAllocations: any[],
    availableSecurities: any[],
    currentHoldings: any[],
    modelOverride?: AIModel
  ) {
    const model = modelOverride || this.currentModel;
    const holdingsText = currentHoldings.map(h => 
      `- ${h.security?.security_name} (${h.security?.ticker}) [${h.security?.asset_class}]: ${h.allocated_percent.toFixed(2)}%`
    ).join('\n');

    const availableSecuritiesText = availableSecurities.map(s => 
      `- ${s.security_name} (${s.ticker}) [${s.asset_class}]`
    ).join('\n');

    const targetAllocationsText = targetAllocations.map(t => 
      `- ${t.asset_class}: ${t.target_percent}% (Band: ${t.lower_band}% - ${t.upper_band}%)`
    ).join('\n');

    const prompt = `
      As a senior investment strategist, analyze the following portfolio and suggest rebalancing actions.

      Client's Investment Policy Statement (IPS) Context:
      Risk Category: ${ips?.risk_category || 'Unknown'}
      Investment Objective: ${ips?.investment_objective || 'Unknown'}
      Constraints: ${ips?.constraints_description || 'None'}

      Target Allocation Model:
      ${targetAllocationsText}

      Current Holdings:
      ${holdingsText}

      Available Securities in Database:
      ${availableSecuritiesText}

      Market Context: Assume a neutral to slightly bullish market environment.

      Task: Provide rebalancing recommendations to align the Current Holdings with the Target Allocation Model. You can suggest selling existing holdings, buying more of them, or adding NEW securities from the "Available Securities" list if an asset class is underrepresented.

      Return a single JSON object with two keys:
      1. "rebalance_summary" (string): A 2-3 sentence high-level summary explaining the recommended strategy to align with the IPS and target model.
      2. "suggestions" (array of objects): Specific actions for securities. Each object must have:
          - "security_name" (string): The name of the security.
          - "ticker" (string): The security's ticker.
          - "current_allocation" (number): The current allocation percentage (0 if it's a new suggested purchase).
          - "suggested_allocation" (number): The new suggested allocation percentage.
          - "action" (string): A brief rationale (e.g., "Buy to meet Large Cap target," "Trim to reduce overweight position").

      IMPORTANT: Ensure the total of all "suggested_allocation" percentages sums to exactly 100.
    `;

    const ai = this.getClient();
    const result = await this.withRetry(() => ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rebalance_summary: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  security_name: { type: Type.STRING },
                  ticker: { type: Type.STRING },
                  current_allocation: { type: Type.NUMBER },
                  suggested_allocation: { type: Type.NUMBER },
                  action: { type: Type.STRING }
                },
                required: ["security_name", "ticker", "current_allocation", "suggested_allocation", "action"]
              }
            }
          },
          required: ["rebalance_summary", "suggestions"]
        }
      }
    }));

    const aiResponse = result.text || "{}";
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed)) {
        return {
          rebalance_summary: "Analysis complete.",
          suggestions: parsed
        };
      }
      return {
        rebalance_summary: parsed.rebalance_summary || "Analysis complete.",
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      return { rebalance_summary: "Failed to parse AI suggestions.", suggestions: [] };
    }
  }
}

export const aiService = new AIService();
