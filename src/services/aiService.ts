import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Client, RiskQuestion, RiskQuestionnaire } from "../types";

export class AIService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
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

    const result = await this.ai.models.generateContent({
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

    const result = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    });

    return result.text || "Analysis complete, but no text returned.";
  }
}

export const aiService = new AIService();
