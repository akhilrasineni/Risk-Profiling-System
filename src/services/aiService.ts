import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Client, RiskQuestion, RiskQuestionnaire } from "../types";

export class AIService {
  
  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_KEY;
    if (!apiKey) {
      console.error("CRITICAL: Missing GEMINI_KEY in process.env");
      throw new Error("GEMINI_KEY not configured");
    }
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Generates a behavioral summary and confidence score for a risk assessment.
   */
  async analyzeRiskAssessment(
    client: Client,
    questionnaire: RiskQuestionnaire & { questions: RiskQuestion[] },
    answers: Record<string, string>
  ) {
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
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json"
      }
    });

    const aiResponse = result.text || "{}";
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  /**
   * Analyzes a risk assessment for inconsistencies.
   */
  async analyzeInconsistencies(
    riskCategory: string,
    responses: any[]
  ) {
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
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });

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
    constraints: any
  ) {
    const prompt = `
      Generate a comprehensive Investment Policy Statement (IPS) for a client with the following profile:
      
      Risk Category: ${riskCategory}
      Time Horizon: ${timeHorizon} years
      Liquidity Needs: ${liquidityNeeds}
      Tax Considerations: ${taxConsiderations}%
      ESG Preference: ${esgPreference}
      Concentrated Position: ${concentratedPosition}
      Constraints: ${JSON.stringify(constraints)}

      Please provide the output in the following JSON format:
      {
        "investment_objective": "A detailed paragraph describing the client's investment goals, return expectations, and risk tolerance.",
        "rebalancing_frequency": "Quarterly" | "Semi-Annually" | "Annually",
        "rebalancing_strategy_description": "A detailed paragraph explaining the rebalancing strategy, including drift tolerance and methodology.",
        "monitoring_review_description": "A detailed paragraph outlining the frequency and scope of portfolio reviews and performance monitoring.",
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
      Common asset classes: US Equity, International Equity, Emerging Markets, US Bonds, Global Bonds, Real Estate, Cash.
      Set lower and upper bands (e.g., +/- 5% or 10% of target) to allow for drift.
    `;

    const ai = this.getClient();
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json"
      }
    });

    const aiResponse = result.text || "{}";
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }
}

export const aiService = new AIService();
