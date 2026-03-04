import { GoogleGenAI, Type } from "@google/genai";
import { Groq } from 'groq-sdk';
import { Client, RiskQuestion, RiskQuestionnaire, AIModel } from "../types";
import { AVAILABLE_MODELS } from "../constants/aiModels";

type ModelChangeCallback = (model: AIModel) => void;

export class AIService {
  private currentModel: AIModel = 'gemini-3-flash-preview';
  private listeners: ModelChangeCallback[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('ai_current_model');
      if (saved && AVAILABLE_MODELS.includes(saved as AIModel)) {
        this.currentModel = saved as AIModel;
      }
    }
  }

  public subscribe(callback: ModelChangeCallback) {
    this.listeners.push(callback);
  }

  public unsubscribe(callback: ModelChangeCallback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.currentModel));
  }

  public setModel(model: AIModel) {
    if (this.currentModel !== model) {
      this.currentModel = model;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ai_current_model', model);
      }
      this.notifyListeners();
    }
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

  private getGroqClient(): Groq {
    let apiKey = '';
    try {
      apiKey = process.env.GROQ_API_KEY || '';
    } catch (e) {
      // Ignore
    }
    
    if (!apiKey) {
      try {
        // @ts-ignore
        apiKey = import.meta.env.VITE_GROQ_API_KEY || '';
      } catch (e) {
        // Ignore
      }
    }

    if (!apiKey) {
      console.error("CRITICAL: Missing GROQ_API_KEY");
      throw new Error("GROQ_API_KEY not configured");
    }
    return new Groq({ apiKey, dangerouslyAllowBrowser: true });
  }

  private isGroqModel(model: AIModel): boolean {
    return !model.startsWith('gemini');
  }

  private async generateContent(
    prompt: string,
    options: { responseMimeType?: string, responseSchema?: any } = {},
    startModel?: AIModel
  ): Promise<string> {
    const modelToTry = startModel || this.currentModel;

    try {
      if (this.isGroqModel(modelToTry)) {
        const groq = this.getGroqClient();
        const messages: any[] = [{ role: 'user', content: prompt }];
        
        // If JSON is requested, ensure the prompt mentions JSON
        let finalPrompt = prompt;
        if (options.responseMimeType === 'application/json' && !finalPrompt.toLowerCase().includes('json')) {
          finalPrompt += '\n\nPlease respond in JSON format.';
        }
        messages[0].content = finalPrompt;

        const completion = await groq.chat.completions.create({
          messages,
          model: modelToTry,
          response_format: options.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
        });

        return completion.choices[0]?.message?.content || "{}";
      } else {
        const ai = this.getClient();
        const result = await ai.models.generateContent({
          model: modelToTry,
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseMimeType: options.responseMimeType,
            responseSchema: options.responseSchema,
          }
        });
        return result.text || "{}";
      }
    } catch (error: any) {
      console.error(`Model ${modelToTry} failed:`, error);
      
      // Provide a user-friendly error message
      let errorMessage = "An error occurred during AI analysis.";
      if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "AI service quota exceeded. Please try again later.";
      } else if (error.message?.includes("503") || error.message?.includes("500") || error.message?.includes("overloaded")) {
        errorMessage = "AI service is currently overloaded or unavailable. Please try again later.";
      } else if (error.message?.includes("404") || error.message?.includes("NOT_FOUND")) {
        errorMessage = `AI model '${modelToTry}' is not available.`;
      } else if (error.message) {
        errorMessage = `AI Error: ${error.message}`;
      }

      throw new Error(errorMessage);
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

    const aiResponse = await this.generateContent(
      prompt,
      { responseMimeType: "application/json" },
      modelOverride
    );
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  /**
   * Analyzes a risk assessment for inconsistencies and returns a structured JSON report.
   */
  async analyzeInconsistencies(
    riskCategory: string,
    responses: any[],
    modelOverride?: AIModel
  ) {
    const responsesText = responses.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'} (Weight: ${r.score_given || 'N/A'})`;
    }).join('\n');

    const prompt = `
      As an expert financial risk profiling consistency engine, analyze the following risk assessment responses.
      The client has been algorithmically categorized as: ${riskCategory}.

      User Responses:
      ${responsesText}

      Your task:
      1. Detect logical contradictions between answers (e.g., long horizon vs. early withdrawal).
      2. Identify overconfidence patterns (e.g., high return expectations with low risk tolerance).
      3. Identify mismatches between experience and volatility tolerance.
      4. Assign a Consistency Score from 0–100.
      5. Classify profile stability as: "Stable", "Slightly Inconsistent", or "Highly Conflicted".

      Return a JSON object with the following structure:
      {
        "consistency_score": number,
        "stability_flag": "Stable | Slightly Inconsistent | Highly Conflicted",
        "contradictions_detected": ["string", "string"],
        "explanation": "A concise markdown-formatted summary of the reasoning"
      }
    `;

    const aiResponse = await this.generateContent(
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              consistency_score: { type: Type.NUMBER },
              stability_flag: { type: Type.STRING, description: "Stable | Slightly Inconsistent | Highly Conflicted" },
              contradictions_detected: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              explanation: { type: Type.STRING, description: "A concise markdown-formatted summary of the reasoning, highlighting key findings in bold." }
            },
            required: ["consistency_score", "stability_flag", "contradictions_detected", "explanation"]
          }
      },
      modelOverride
    );
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      
      // Clean up any internal "thought" artifacts in the explanation
      if (parsed.explanation) {
        parsed.explanation = parsed.explanation.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
        parsed.explanation = parsed.explanation.replace(/^thought\)\s*/i, '');
        parsed.explanation = parsed.explanation.replace(/\(thought\)\s*/i, '');
        parsed.explanation = parsed.explanation.replace(/^thought:\s*/i, '');
        parsed.explanation = parsed.explanation.replace(/\n\s*thought:\s*/i, '\n');
        parsed.explanation = parsed.explanation.trim();
      }
      
      return parsed;
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      return { 
        consistency_score: 0, 
        stability_flag: "Highly Conflicted", 
        contradictions_detected: ["Failed to analyze profile consistency"], 
        explanation: "An error occurred during consistency analysis." 
      };
    }
  }
  /**
   * Performs a multi-class risk classification to predict probability distribution.
   */
  async analyzeRiskProbabilities(
    responses: any[],
    modelOverride?: AIModel
  ) {
    const responsesText = responses.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are a multi-class risk classification model. Analyze the following questionnaire inputs and behavioral signals to predict the probability distribution across risk categories.

      Risk Categories:
      - Conservative
      - Moderate
      - Aggressive

      User Responses:
      ${responsesText}

      Your task:
      1. Predict probability distribution across the three risk categories.
      2. Ensure probabilities sum exactly to 100.
      3. Identify the highest probability category as the "predicted_risk_band".
      4. Calculate "confidence_level" as the absolute difference between the top two probabilities.

      Return a JSON object with the following structure:
      {
        "probabilities": {
          "Conservative": number,
          "Moderate": number,
          "Aggressive": number
        },
        "predicted_risk_band": "Conservative | Moderate | Aggressive",
        "confidence_level": number,
        "explanation": "A concise markdown-formatted summary of why the model favored the predicted band and the significance of the confidence level."
      }
    `;

    const aiResponse = await this.generateContent(
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              probabilities: {
                type: Type.OBJECT,
                properties: {
                  Conservative: { type: Type.NUMBER },
                  Moderate: { type: Type.NUMBER },
                  Aggressive: { type: Type.NUMBER }
                },
                required: ["Conservative", "Moderate", "Aggressive"]
              },
              predicted_risk_band: { type: Type.STRING },
              confidence_level: { type: Type.NUMBER },
              explanation: { type: Type.STRING }
            },
            required: ["probabilities", "predicted_risk_band", "confidence_level", "explanation"]
          }
      },
      modelOverride
    );
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      if (parsed.explanation) {
        parsed.explanation = parsed.explanation.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse AI risk probability response:", e);
      return { 
        probabilities: { Conservative: 33.3, Moderate: 33.3, Aggressive: 33.4 },
        predicted_risk_band: "Moderate",
        confidence_level: 0,
        explanation: "An error occurred during risk probability analysis." 
      };
    }
  }

  /**
   * Detects behavioral biases based on responses.
   */
  async analyzeBehavioralBiases(
    responses: any[],
    modelOverride?: AIModel
  ) {
    const responsesText = responses.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are a behavioral finance AI model. Analyze the following investment questionnaire responses to detect psychological investment biases.

      Analyze:
      - Expected return vs experience level
      - Reaction to drawdowns
      - Loss history
      - Derivative exposure
      - Volatility comfort

      Identify the likelihood (Low | Medium | High) of:
      1. Overconfidence Bias
      2. Loss Aversion Bias
      3. Unrealistic Return Expectation
      4. Recency Bias

      User Responses:
      ${responsesText}

      Return a JSON object with the following structure:
      {
        "overconfidence": "Low | Medium | High",
        "loss_aversion": "Low | Medium | High",
        "unrealistic_expectation": "Low | Medium | High",
        "recency_bias": "Low | Medium | High",
        "dominant_behavioral_pattern": "A concise markdown-formatted summary of the key behavioral findings."
      }
    `;

    const aiResponse = await this.generateContent(
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              overconfidence: { type: Type.STRING, description: "Low | Medium | High" },
              loss_aversion: { type: Type.STRING, description: "Low | Medium | High" },
              unrealistic_expectation: { type: Type.STRING, description: "Low | Medium | High" },
              recency_bias: { type: Type.STRING, description: "Low | Medium | High" },
              dominant_behavioral_pattern: { type: Type.STRING }
            },
            required: ["overconfidence", "loss_aversion", "unrealistic_expectation", "recency_bias", "dominant_behavioral_pattern"]
          }
      },
      modelOverride
    );
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      if (parsed.dominant_behavioral_pattern) {
        parsed.dominant_behavioral_pattern = parsed.dominant_behavioral_pattern.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse AI behavioral bias response:", e);
      return { 
        overconfidence: "Low", 
        loss_aversion: "Low", 
        unrealistic_expectation: "Low", 
        recency_bias: "Low", 
        dominant_behavioral_pattern: "An error occurred during behavioral bias analysis." 
      };
    }
  }

  /**
   * Performs a dual risk scoring analysis (Capacity vs Tolerance).
   */
  async analyzeDualScoring(
    client: Client,
    responses: any[],
    modelOverride?: AIModel
  ) {
    const responsesText = responses.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are an advanced financial risk scoring engine. Perform a Dual Risk Scoring analysis for the following client.
      
      Client Financial Context:
      - Net Worth: $${client.net_worth?.toLocaleString() || 'N/A'}
      - Annual Income: $${client.annual_income?.toLocaleString() || 'N/A'}
      - Tax Bracket: ${client.tax_bracket || 'N/A'}%
      - Liquidity Needs: $${client.liquidity_needs?.toLocaleString() || 'N/A'}

      User Responses:
      ${responsesText}

      Your task:
      1. Calculate Risk Capacity Score (0–100): Financial ability to take risk.
      2. Calculate Risk Tolerance Score (0–100): Emotional comfort with risk.
      3. Final Risk Score = Minimum of the two.
      4. Classify final risk band:
         - Conservative (0–35)
         - Moderate (36–70)
         - Aggressive (71–100)

      Return a JSON object with the following structure:
      {
        "capacity_score": number,
        "tolerance_score": number,
        "final_risk_score": number,
        "risk_band": "Conservative | Moderate | Aggressive",
        "explanation": "A concise markdown-formatted summary of the reasoning, explaining the gap between capacity and tolerance if one exists."
      }
    `;

    const aiResponse = await this.generateContent(
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              capacity_score: { type: Type.NUMBER },
              tolerance_score: { type: Type.NUMBER },
              final_risk_score: { type: Type.NUMBER },
              risk_band: { type: Type.STRING, description: "Conservative | Moderate | Aggressive" },
              explanation: { type: Type.STRING }
            },
            required: ["capacity_score", "tolerance_score", "final_risk_score", "risk_band", "explanation"]
          }
      },
      modelOverride
    );
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      
      if (parsed.explanation) {
        parsed.explanation = parsed.explanation.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
      }
      
      return parsed;
    } catch (e) {
      console.error("Failed to parse AI dual scoring response:", e);
      return { 
        capacity_score: 0, 
        tolerance_score: 0, 
        final_risk_score: 0, 
        risk_band: "Conservative", 
        explanation: "An error occurred during dual risk scoring analysis." 
      };
    }
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

    const aiResponse = await this.generateContent(
      prompt,
      { responseMimeType: "application/json" },
      modelOverride
    );
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  async suggestRebalanceActions(
    ips: any,
    targetAllocations: any[],
    availableSecurities: any[],
    currentHoldings: any[],
    modelOverride?: AIModel
  ) {
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

    const aiResponse = await this.generateContent(
      prompt,
      {
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
      },
      modelOverride
    );
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
