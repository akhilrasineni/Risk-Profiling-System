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
    options: { responseMimeType?: string, responseSchema?: any, temperature?: number, seed?: number } = {},
    startModel?: AIModel
  ): Promise<string> {
    const modelToTry = startModel || this.currentModel;
    const temperature = options.temperature ?? 0;
    const seed = options.seed ?? 42;

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
          temperature: temperature,
          seed: seed,
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
            temperature: temperature,
            seed: seed,
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

      Think step-by-step and provide your reasoning before the final JSON.

      Based on this, provide the following in a single JSON object:
      1.  "behavioral_summary" (string): A concise, 2-3 sentence summary of the client's likely investment behavior. IMPORTANT: Explicitly mention the reliability of the profile based on the consistency of their answers (e.g., "The profile is highly reliable due to consistent..." or "Caution is advised due to contradictory...").
      2.  "reliability_score" (integer 0-100): A holistic reliability score based on logical consistency, response stability, and profile depth. 100 is perfectly reliable, 0 is completely random/contradictory.
      3.  "consistency_score" (integer 0-100): How logically consistent the answers are with each other.
      4.  "response_stability" (integer 0-100): How "stable" the profile feels (e.g., does it feel like a real person's profile or random guesses).
    `;

    const aiResponse = await this.generateContent(
      prompt,
      { responseMimeType: "application/json", temperature: 0, seed: 42 },
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
      You are an expert financial risk profiling consistency engine. Analyze the following risk assessment responses for a client categorized as: ${riskCategory}.

      User Responses:
      ${responsesText}

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Detect logical contradictions between answers (e.g., long horizon vs. early withdrawal).
      2. Identify: Identify overconfidence patterns (e.g., high return expectations with low risk tolerance) and mismatches between experience and volatility tolerance.
      3. Evaluate: Assign a Consistency Score from 0–100 and classify profile stability.

      Your task:
      Return a JSON object with the following structure:
      {
        "consistency_score": number,
        "stability_flag": "Stable | Slightly Inconsistent | Highly Conflicted",
        "contradictions_detected": ["string", "string"],
        "explanation": "A concise markdown-formatted summary of the reasoning, highlighting key findings in bold."
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
          },
        temperature: 0,
        seed: 42
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
      throw new Error("Failed to analyze profile consistency.");
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

      Risk Categories & Definitions:
      - Conservative: Focus on capital preservation, low volatility.
      - Moderate: Balanced approach, moderate growth and volatility.
      - Aggressive: Focus on capital appreciation, high volatility.

      User Responses:
      ${responsesText}

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Analyze the user's input against the risk definitions above.
      2. Identify Factors: Identify key factors that increase or decrease risk based on the responses.
      3. Calculate Distribution: Calculate the probability distribution based on those factors.

      Your task:
      1. Predict probability distribution across the three risk categories as percentages (0-100).
      2. Ensure probabilities sum exactly to 100.
      3. Identify the highest probability category as the "predicted_risk_band".
      4. Calculate "confidence_level" as the absolute difference between the top two probabilities (0-100).
      
      STRICT DATA REQUIREMENT:
      If the provided input data is insufficient to make a confident determination, you must NOT default to any category. Instead, return a JSON object with:
      {
        "error": "INCOMPLETE_DATA",
        "missing_data_description": "A concise description of what data is missing to make a confident determination."
      }

      Return a JSON object with the following structure (if data is sufficient):
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
              error: { type: Type.STRING },
              missing_data_description: { type: Type.STRING },
              probabilities: {
                type: Type.OBJECT,
                properties: {
                  Conservative: { type: Type.NUMBER, description: "Percentage value between 0 and 100" },
                  Moderate: { type: Type.NUMBER, description: "Percentage value between 0 and 100" },
                  Aggressive: { type: Type.NUMBER, description: "Percentage value between 0 and 100" }
                },
                required: ["Conservative", "Moderate", "Aggressive"]
              },
              predicted_risk_band: { type: Type.STRING },
              confidence_level: { type: Type.NUMBER, description: "Confidence level between 0 and 100" },
              explanation: { type: Type.STRING }
            }
          },
        temperature: 0,
        seed: 42
      },
      modelOverride
    );
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      
      if (parsed.error === "INCOMPLETE_DATA") {
        throw new Error(JSON.stringify({ type: "INCOMPLETE_DATA", message: parsed.missing_data_description }));
      }

      if (parsed.explanation) {
        parsed.explanation = parsed.explanation.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
      }
      return parsed;
    } catch (e: any) {
      if (e.message.includes("INCOMPLETE_DATA")) {
        throw e;
      }
      console.error("Failed to parse AI risk probability response:", e);
      throw new Error("Failed to analyze risk probabilities.");
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

      User Responses:
      ${responsesText}

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Examine responses for expected return vs experience level, reaction to drawdowns, loss history, derivative exposure, and volatility comfort.
      2. Detect: Identify the likelihood (Low | Medium | High) of Overconfidence Bias, Loss Aversion Bias, Unrealistic Return Expectation, and Recency Bias.
      3. Synthesize: Formulate a dominant behavioral pattern summary.

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
          },
        temperature: 0,
        seed: 42
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
      throw new Error("Failed to analyze behavioral biases.");
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

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze Capacity: Evaluate financial ability to take risk based on Net Worth, Income, and Liquidity Needs.
      2. Analyze Tolerance: Evaluate emotional comfort with risk based on questionnaire responses.
      3. Calculate: Determine Risk Capacity Score (0–100), Risk Tolerance Score (0–100), and Final Risk Score (Minimum of the two).
      4. Classify: Assign risk band (Conservative: 0–35, Moderate: 36–70, Aggressive: 71–100).

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
          },
        temperature: 0,
        seed: 42
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
      throw new Error("Failed to analyze dual risk scoring.");
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

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Evaluate the client's profile against the base allocation.
      2. Adjust: Refine the allocation to fit the client's specific profile (e.g., time horizon, tax situation). You may adjust percentages slightly (e.g., +/- 5-10%).
      3. Validate: Ensure the total sums to 100% and only use the provided asset classes.

      Return a JSON object with the following structure:
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
    `;

    const aiResponse = await this.generateContent(
      prompt,
      { responseMimeType: "application/json", temperature: 0, seed: 42 },
      modelOverride
    );
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  async suggestRebalanceActions(
    ips: any,
    targetAllocations: any[],
    availableSecurities: any[],
    currentHoldings: any[],
    driftEvents: any[] = [],
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

    const driftText = driftEvents.length > 0 ? driftEvents.map(d => 
      `- ${d.asset_class}: Actual ${d.actual_percent}%, Target ${d.target_percent}%, Band ${d.lower_band}%-${d.upper_band}%, Breach: ${d.breach_type}, Severity: ${d.severity}, Drift: ${d.drift_percent}%, Action: ${d.action_taken || 'None'}`
    ).join('\n') : 'No drift events detected.';

    const prompt = `
      As a senior investment strategist, analyze the following portfolio and suggest rebalancing actions. While the IPS is the primary guideline, you are authorized to suggest strategic deviations if market conditions are unfavorable for a specific asset class, provided you justify the deviation based on market performance.

      Client's Investment Policy Statement (IPS) Context:
      Risk Category: ${ips?.risk_category || 'Unknown'}
      Investment Objective: ${ips?.investment_objective || 'Unknown'}
      Constraints: ${ips?.constraints_description || 'None'}

      Target Allocation Model:
      ${targetAllocationsText}

      Current Holdings:
      ${holdingsText}

      Drift Analysis (If any):
      ${driftText}

      Available Securities in Database:
      ${availableSecuritiesText}

      Market Context: Assume a neutral to slightly bullish market environment. If market conditions are poor for a specific asset class, you may suggest shifting to better-performing alternatives.

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Compare Current Holdings against the Target Allocation Model, considering the Drift Analysis and current market performance for each asset class.
      2. Identify: Determine necessary actions (sell, buy, or add new securities) to align the portfolio and resolve drift. If a category is underperforming, justify any deviation from the IPS target allocation.
      3. Validate: Ensure the total of all "suggested_allocation" percentages sums to exactly 100.

      Your task:
      Return a single JSON object with two keys:
      {
        "rebalance_summary": "A 2-3 sentence high-level summary explaining the recommended strategy to align with the IPS and target model, addressing the drift.",
        "suggestions": [
          {
            "security_name": "string",
            "ticker": "string",
            "current_allocation": number,
            "suggested_allocation": number,
            "action": "string (rationale)",
            "is_ips_deviation": boolean,
            "deviation_reason": "string (required if is_ips_deviation is true, otherwise empty string)"
          }
        ]
      }
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
                    ticker: { type: Type.STRING, description: "The ticker symbol of the security. MUST be included. If unknown, use the ticker from the Available Securities list." },
                    current_allocation: { type: Type.NUMBER },
                    suggested_allocation: { type: Type.NUMBER },
                    action: { type: Type.STRING },
                    is_ips_deviation: { type: Type.BOOLEAN, description: "True if the suggested allocation deviates from the IPS target allocation band due to market conditions." },
                    deviation_reason: { type: Type.STRING, description: "Required if is_ips_deviation is true, explaining why the deviation is necessary." }
                  },
                  required: ["security_name", "ticker", "current_allocation", "suggested_allocation", "action", "is_ips_deviation", "deviation_reason"]
                }
              }
            },
            required: ["rebalance_summary", "suggestions"]
          },
        temperature: 0,
        seed: 42
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
      throw new Error("Failed to parse AI suggestions.");
    }
  }

  /**
   * Analyzes portfolio drift and provides recommendations.
   */
  async analyzeDrift(
    driftData: {
      portfolio_id: string;
      allocation: Record<string, number>;
      target: Record<string, number>;
      bands: Record<string, [number, number]>;
      severity: string;
    },
    modelOverride?: AIModel
  ) {
    const allocationText = Object.entries(driftData.allocation)
      .map(([asset, percent]) => `${asset}: ${percent}%`)
      .join('\n');
    
    const targetText = Object.entries(driftData.target)
      .map(([asset, percent]) => {
        const [lower, upper] = driftData.bands[asset] || [0, 0];
        return `${asset}: ${percent}% (band ${lower}%–${upper}%)`;
      })
      .join('\n');

    const prompt = `
      You are a portfolio advisor. Analyze the following portfolio drift and provide recommendations.

      Portfolio allocation:
      ${allocationText}

      Target allocation:
      ${targetText}

      Severity: ${driftData.severity}

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Determine why drift happened based on allocation vs target.
      2. Assess: Evaluate the risk impact of this drift.
      3. Recommend: Formulate rebalance actions and an advisor message.

      Return a JSON object with the following structure:
      {
        "reason": "string",
        "risk_impact": "string",
        "recommendations": ["string", "string"],
        "advisor_message": "string"
      }
    `;

    const aiResponse = await this.generateContent(
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reason: { type: Type.STRING },
            risk_impact: { type: Type.STRING },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            advisor_message: { type: Type.STRING }
          },
          required: ["reason", "risk_impact", "recommendations", "advisor_message"]
        },
        temperature: 0,
        seed: 42
      },
      modelOverride
    );
    
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      return parsed;
    } catch (e) {
      console.error("Failed to parse AI drift analysis response:", e);
      throw new Error("Failed to analyze portfolio drift. Please try again.");
    }
  }
}

export const aiService = new AIService();
