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
    // Try multiple possible environment variable names
    const apiKey = [
      process.env.GEMINI_API_KEY,
      process.env.GOOGLE_API_KEY,
      process.env.GEMINI_KEY
    ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder')?.trim();

    if (!apiKey) {
      
      throw new Error("GEMINI_API_KEY not configured. Please check your environment variables in the Secrets panel.");
    }
    
    if (apiKey.length < 20) {
      
    }
    
    return new GoogleGenAI({ apiKey });
  }

  private getGroqClient(): Groq {
    const apiKey = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_KEY
    ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder')?.trim();
    
    if (!apiKey) {
      
      throw new Error("GROQ_API_KEY not configured. Please check your environment variables in the Secrets panel.");
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

    const systemInstruction = "CRITICAL INSTRUCTION: You must act as a strict, deterministic function. Do not hallucinate, imagine, or infer any information, preferences, or market conditions not explicitly provided in the input. Your output must be strictly and exclusively derived from the provided data. Do not deviate from your original decisions when given the same input.";

    try {
      let responseText = "{}";
      if (this.isGroqModel(modelToTry)) {
        const groq = this.getGroqClient();
        const messages: any[] = [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ];
        
        // If JSON is requested, ensure the prompt mentions JSON
        let finalPrompt = prompt;
        if (options.responseMimeType === 'application/json' && !finalPrompt.toLowerCase().includes('json')) {
          finalPrompt += '\n\nPlease respond in JSON format.';
        }
        messages[1].content = finalPrompt;

        const completion = await groq.chat.completions.create({
          messages,
          model: modelToTry,
          response_format: options.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
          temperature: temperature,
          seed: seed,
        });

        responseText = completion.choices[0]?.message?.content || "{}";
      } else {
        const ai = this.getClient();
        const result = await ai.models.generateContent({
          model: modelToTry,
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: options.responseMimeType,
            responseSchema: options.responseSchema,
            temperature: temperature,
            seed: seed,
          }
        });
        responseText = result.text || "{}";
      }

      return responseText;
    } catch (error: any) {
      
      
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
   * 
   * @use This prompt is used to provide a qualitative and quantitative evaluation of a client's risk profile based on their questionnaire responses.
   * @considers Client financial context (Annual Income, Net Worth, Tax Bracket, DOB) and their specific answers to risk-related questions.
   * @returns A JSON object containing:
   *  - behavioral_summary: A 2-3 sentence summary of likely investment behavior and profile reliability.
   *  - reliability_score: A holistic score (0-100) based on consistency and depth.
   *  - consistency_score: Logical consistency between answers (0-100).
   *  - response_stability: Stability of the profile (0-100).
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
      You are a professional financial risk analyst. Analyze the following risk assessment responses to determine a financial risk profile.
      
      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided client context and responses.
      2. DO NOT imagine or hallucinate financial details not present in the input.
      3. Maintain a formal, objective, and professional tone.
      4. If data is contradictory, highlight it as a reliability risk rather than trying to "fix" it.

      Client's financial context: ${clientContext}
      
      Responses:
      ${responsesText}

      Think step-by-step and provide your reasoning before the final JSON.

      Based on this, provide the following in a single JSON object:
      1.  "behavioral_summary" (string): A concise, 2-3 sentence summary of the client's likely investment behavior. IMPORTANT: Explicitly mention the reliability of the profile based on the consistency of their answers.
      2.  "reliability_score" (integer 0-100): A holistic reliability score based on logical consistency, response stability, and profile depth. 100 is perfectly reliable, 0 is completely random/contradictory.
      3.  "consistency_score" (integer 0-100): How logically consistent the answers are with each other.
      4.  "response_stability" (integer 0-100): How "stable" the profile feels.
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
   * 
   * @use This prompt is used to detect logical contradictions and overconfidence patterns in a client's risk responses.
   * @considers The assigned risk category and the detailed question-answer pairs from the assessment.
   * @returns A JSON object containing:
   *  - consistency_score: Numerical score (0-100) of response logic.
   *  - stability_flag: Classification (Stable, Slightly Inconsistent, Highly Conflicted).
   *  - contradictions_detected: Array of specific logical mismatches found.
   *  - explanation: Markdown-formatted reasoning summary.
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

      STRICT DATA ADHERENCE RULES:
      1. Base your analysis EXCLUSIVELY on the provided User Responses.
      2. DO NOT assume or imagine external market conditions or client history not provided.
      3. If a response is missing or unclear, state that in the explanation rather than guessing.
      4. Maintain a professional, clinical tone suitable for a compliance report.

      User Responses:
      ${responsesText}

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Detect logical contradictions between answers (e.g., long horizon vs. early withdrawal).
      2. Identify: Identify overconfidence patterns and mismatches between experience and volatility tolerance.
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
      
      throw new Error("Failed to analyze profile consistency.");
    }
  }
  /**
   * Performs a multi-class risk classification to predict probability distribution.
   * 
   * @use This prompt is used to categorize a client into Conservative, Moderate, or Aggressive bands using a probabilistic model.
   * @considers The full set of questionnaire inputs and behavioral signals.
   * @returns A JSON object containing:
   *  - probabilities: Distribution percentages for Conservative, Moderate, and Aggressive.
   *  - predicted_risk_band: The category with the highest probability.
   *  - confidence_level: The margin between the top two categories.
   *  - explanation: Markdown summary of the classification logic.
   *  - (Optional) error: "INCOMPLETE_DATA" if inputs are insufficient.
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

      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided User Responses.
      2. DO NOT hallucinate or imagine user preferences not explicitly stated.
      3. If the data is insufficient, you MUST return the error object specified below.
      4. Maintain a professional, data-driven tone.

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
      
      throw new Error("Failed to analyze risk probabilities.");
    }
  }

  /**
   * Drafts a portfolio based on IPS and client data using AI.
   * 
   * @use This prompt is used to create an initial set of security holdings that strictly adhere to a client's Target Allocation Model.
   * @considers Total investment amount, IPS target allocations, and a list of available securities with their metadata.
   * @returns A JSON object containing:
   *  - holdings: Array of objects with security_id, allocated_percent, allocated_amount, and units.
   *  - total_allocation_percent: The sum of all allocations (must be 100).
   */
  async draftPortfolioFromIPS(
    ips: any,
    totalInvestment: number,
    availableSecurities: any[],
    modelOverride?: AIModel
  ) {
    const securitiesText = availableSecurities.map(s => 
      `- ID: ${s.id}, Name: ${s.security_name}, Class: ${s.asset_class}, SubClass: ${s.asset_sub_class}, Price: $${s.current_price}`
    ).join('\n');

    const allocationsText = ips.target_allocations.map((a: any) => 
      `- Asset Class: ${a.asset_class}, Target: ${a.target_percent}%`
    ).join('\n');

    const prompt = `
      You are an elite Senior Portfolio Manager. Your task is to draft an initial investment portfolio for a client based EXCLUSIVELY on the provided data.
      
      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided "Available Securities" list. DO NOT imagine or invent securities, tickers, or prices.
      2. Adhere STRICTLY to the "Target Allocation Model".
      3. DO NOT assume any client preferences or market conditions not explicitly provided.
      4. Maintain a professional, institutional-grade tone.

      Client Financial Context:
      - Total Investment Amount: $${totalInvestment}
      
      Target Allocation Model (IPS MANDATE):
      ${allocationsText}
      
      Available Securities:
      ${securitiesText}
      
      ASSET ALLOCATION CALCULATION RULES (MANDATORY):
      1. Build a robust, best-performing portfolio that adheres strictly to the Target Allocation Model.
      2. For each Asset Class listed in the Target Allocation Model, you MUST select multiple securities (funds) from the Available Securities list to achieve diversification.
      3. The sum of the 'allocated_percent' for all securities selected within a specific Asset Class MUST equal the Target Percent for that Asset Class as defined in the IPS. 
      4. CRITICAL MATHEMATICAL RULE: The sum of 'allocated_percent' for ALL securities across ALL asset classes MUST be EXACTLY 100.
      5. NEVER produce totals above or below 100.

      MANDATORY VALIDATION STEP:
      After generating allocations, perform this correction:
      
      total_percent = Sum of all allocated_percent
      
      If total_percent > 100 → reduce the largest allocation until total_percent = 100  
      If total_percent < 100 → increase the allocation of the most stable Debt security until total_percent = 100

      CALCULATION REQUIREMENTS:
      - allocated_amount = (allocated_percent / 100) * ${totalInvestment}
      - units = allocated_amount / security.current_price
      - Ensure allocated_percent values are precise and sum exactly to 100.

      Return ONLY a JSON object in the following structure:
      {
        "holdings": [
          {
            "security_id": "string",
            "allocated_percent": number,
            "allocated_amount": number,
            "units": number
          }
        ],
        "total_allocation_percent": number
      }

      FINAL VALIDATION (MANDATORY):
      Before returning JSON verify:
      Sum of all allocated_percent = 100
      If not equal to 100 → fix it before returning.
    `;

    const aiResponse = await this.generateContent(
      prompt,
      {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            holdings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  security_id: { type: Type.STRING },
                  allocated_percent: { type: Type.NUMBER },
                  allocated_amount: { type: Type.NUMBER },
                  units: { type: Type.NUMBER }
                },
                required: ["security_id", "allocated_percent", "allocated_amount", "units"]
              }
            },
            total_allocation_percent: { type: Type.NUMBER }
          },
          required: ["holdings", "total_allocation_percent"]
        },
        temperature: 0,
        seed: 42
      },
      modelOverride
    );
    
    try {
      return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
    } catch (e) {
      
      throw new Error("Failed to draft portfolio using AI.");
    }
  }

  /**
   * Detects behavioral biases based on responses.
   * 
   * @use This prompt is used to identify psychological factors like loss aversion or overconfidence that might affect investment decisions.
   * @considers User responses regarding return expectations, experience, and reaction to market drawdowns.
   * @returns A JSON object containing:
   *  - overconfidence: Likelihood (Low | Medium | High).
   *  - loss_aversion: Likelihood (Low | Medium | High).
   *  - unrealistic_expectation: Likelihood (Low | Medium | High).
   *  - recency_bias: Likelihood (Low | Medium | High).
   *  - dominant_behavioral_pattern: Markdown summary of key behavioral findings.
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

      STRICT DATA ADHERENCE RULES:
      1. Analyze ONLY the provided User Responses.
      2. DO NOT imagine or hallucinate behavioral traits not supported by the input.
      3. Maintain a professional, clinical tone.

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
      
      throw new Error("Failed to analyze behavioral biases.");
    }
  }

  /**
   * Performs a dual risk scoring analysis (Capacity vs Tolerance).
   * 
   * @use This prompt is used to balance a client's financial ability to take risk (Capacity) against their emotional willingness (Tolerance).
   * @considers Financial data (Net Worth, Income, Liquidity) and emotional responses from the questionnaire.
   * @returns A JSON object containing:
   *  - capacity_score: Financial ability score (0-100).
   *  - tolerance_score: Emotional comfort score (0-100).
   *  - final_risk_score: The minimum of capacity and tolerance.
   *  - risk_band: Classification (Conservative, Moderate, Aggressive).
   *  - explanation: Markdown summary explaining the scores and any gap between them.
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
      
      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided Financial Context and User Responses.
      2. DO NOT imagine or hallucinate financial assets or liabilities not listed.
      3. Maintain a professional, objective tone.

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
      
      throw new Error("Failed to analyze dual risk scoring.");
    }
  }

  /**
   * Generates a full Investment Policy Statement (IPS) document.
   * 
   * @use This prompt is used to create a formal document outlining a client's investment strategy, goals, and constraints.
   * @considers Risk category, time horizon, liquidity needs, tax considerations, ESG preferences, and questionnaire responses.
   * @returns A JSON object containing:
   *  - investment_objective: Professional strategy explanation.
   *  - goals_description: Detailed financial goals.
   *  - rebalancing_frequency & rebalancing_band_percent: Parameters for portfolio maintenance.
   *  - target_allocations: Array of Equity, Debt, and Alternatives targets with lower/upper bands.
   *  - constraints_description: Summary of investment limitations.
   */
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
    responses: any[],
    modelOverride?: AIModel
  ) {
    const responsesText = responses.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are a professional financial advisor. Generate a highly professional, comprehensive, and consistent Investment Policy Statement (IPS) for a client based EXCLUSIVELY on the provided data.

      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided Client Profile and Questionnaire Responses.
      2. DO NOT imagine or hallucinate client goals, constraints, or preferences.
      3. Adhere STRICTLY to the "BASE ALLOCATION MODEL".
      4. Maintain a formal, institutional-grade tone throughout the document.

      Client Profile:
      - Risk Category: ${riskCategory}
      - Time Horizon: ${timeHorizon} years
      - Liquidity Needs: ${liquidityNeeds}
      - Tax Considerations: ${taxConsiderations}%
      - ESG Preference: ${esgPreference}
      - Concentrated Position: ${concentratedPosition}
      - Constraints: ${JSON.stringify(constraints)}

      Client Questionnaire Responses:
      ${responsesText}

      TARGET ASSET CLASSES:
      You MUST ONLY use these three asset classes:
      1. Equity
      2. Debt
      3. Alternatives

      BASE ALLOCATION MODEL:
      ${JSON.stringify(staticAllocations)}

      ASSET ALLOCATION CALCULATION RULES (MANDATORY):
      1. Start with the BASE ALLOCATION.
      2. Adjust allocations based on the client's risk profile and responses.
      3. Equity should be highest for Aggressive profiles.
      4. Debt should be highest for Conservative profiles.
      5. Alternatives should normally stay between 5% and 15%.

      CRITICAL MATHEMATICAL RULE:
      - Equity + Debt + Alternatives MUST equal EXACTLY 100.
      - NEVER produce totals above or below 100.

      MANDATORY VALIDATION STEP:
      After generating allocations, perform this correction:

      total = Equity + Debt + Alternatives

      If total > 100 → reduce the largest allocation until total = 100  
      If total < 100 → increase Debt until total = 100

      OUTPUT REQUIREMENTS:
      - Percentages must be integers.
      - Exactly THREE asset classes must be returned.
      - No extra asset classes.

      Return ONLY a JSON object in the following structure:

      {
        "investment_objective": "Detailed professional explanation.",
        "goals_description": "Detailed explanation of financial goals.",
        "rebalancing_frequency": "Quarterly" | "Semi-Annually" | "Annually",
        "rebalancing_band_percent": number,
        "rebalancing_strategy_description": "Detailed explanation of drift and rebalancing.",
        "monitoring_review_description": "Detailed explanation of monitoring process.",
        "constraints_description": "Detailed explanation of constraints.",
        "target_allocations": [
          {
            "asset_class": "Equity",
            "target_percent": number,
            "lower_band": number,
            "upper_band": number
          },
          {
            "asset_class": "Debt",
            "target_percent": number,
            "lower_band": number,
            "upper_band": number
          },
          {
            "asset_class": "Alternatives",
            "target_percent": number,
            "lower_band": number,
            "upper_band": number
          }
        ]
      }

      FINAL VALIDATION (MANDATORY):
      Before returning JSON verify:

      Equity + Debt + Alternatives = 100

      If not equal to 100 → fix it before returning.
    `;

    const aiResponse = await this.generateContent(
      prompt,
      { responseMimeType: "application/json", temperature: 0, seed: 42 },
      modelOverride
    );
    return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
  }

  /**
   * Suggests portfolio rebalance actions based on current holdings and IPS mandate.
   * 
   * @use This prompt is used to optimize an existing portfolio or build a new one while correcting for drift and ensuring diversification.
   * @considers IPS context, target allocations, current holdings, drift events, and available securities.
   * @returns A JSON object containing:
   *  - rebalance_summary: High-level strategy explanation.
   *  - suggestions: Array of security-specific actions (buy/sell/hold) with suggested allocation percentages and rationales.
   */
  async suggestRebalanceActions(
    ips: any,
    targetAllocations: any[],
    availableSecurities: any[],
    currentHoldings: any[],
    driftEvents: any[] = [],
    modelOverride?: AIModel
  ) {
    const holdingsText = currentHoldings.map(h => 
      `- ${h.security?.security_name} (${h.security?.ticker || 'N/A'}) [${h.security?.asset_sub_class || h.security?.asset_class}]: ${h.allocated_percent.toFixed(2)}%`
    ).join('\n');

    const availableSecuritiesText = availableSecurities.map(s => 
      `- ${s.security_name} (${s.ticker || 'N/A'}) [${s.asset_sub_class || s.asset_class}]`
    ).join('\n');

    const targetAllocationsText = targetAllocations.map(t => 
      `- ${t.asset_class}: ${t.target_percent}% (Band: ${t.lower_band}% - ${t.upper_band}%)`
    ).join('\n');

    const driftText = driftEvents.length > 0 ? driftEvents.map(d => 
      `- ${d.asset_class}: Actual ${d.actual_percent}%, Target ${d.target_percent}%, Band ${d.lower_band}%-${d.upper_band}%, Breach: ${d.breach_type}, Severity: ${d.severity}, Drift: ${d.drift_percent}%, Action: ${d.action_taken || 'None'}`
    ).join('\n') : 'No drift events detected.';

    const prompt = `
      As an elite Senior Portfolio Manager and Quantitative Strategist, your task is to construct or rebalance this client's portfolio based EXCLUSIVELY on the provided data.

      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided "Available Securities" list. DO NOT imagine or invent securities, tickers, or prices.
      2. Adhere STRICTLY to the "Target Allocation Model".
      3. DO NOT assume any client preferences or market conditions not explicitly provided.
      4. Maintain a professional, institutional-grade tone.

      Client's Investment Policy Statement (IPS) Context:
      Risk Category: ${ips?.risk_category || 'Unknown'}
      Investment Objective: ${ips?.investment_objective || 'Unknown'}
      Constraints: ${ips?.constraints_description || 'None'}

      Target Allocation Model (IPS MANDATE):
      ${targetAllocationsText}
      *CRITICAL*: The total allocation for each asset class MUST fall within its specified [Lower Band - Upper Band]. Aim directly for the target percent.

      Current Holdings:
      ${holdingsText || 'None (New Portfolio Construction)'}

      Drift Analysis (If any):
      ${driftText}

      Available Securities in Database:
      ${availableSecuritiesText}

      Market Context & Optimization Strategy:
      - Position the portfolio to perform well by selecting the highest quality securities available for each required asset class.
      - Select securities from the "Available Securities" list that offer the best fundamental strength, broad market exposure, and resilience.
      - If constructing a new portfolio, build a robust, all-weather allocation that perfectly matches the Target Allocation Model.
      - If rebalancing, prioritize aggressively correcting any identified Drift to bring asset classes back to their exact target percentages.

      REBALANCING RULES (MANDATORY):
      1. IPS Alignment: Ensure the sum of suggested allocations for securities in each asset class exactly matches the Target Allocation Model's target percent. You MUST NOT violate the IPS bands.
      2. Diversification & Weighting (CRITICAL RULE): You MUST NOT allocate more than 20% of the total portfolio to any single security. 
         - For large target allocations (e.g., Equity at 60%), you MUST select 3-5 different securities from the "Available Securities" list to spread risk and optimize market exposure.
         - Use a Core-Satellite approach: Assign higher weights (e.g., 15-20%) to broad-market, core funds and lower weights (e.g., 5-10%) to specialized, sector, or higher-risk funds.
         - Actively ADD new, high-quality securities from the "Available Securities" list to improve diversification. Do not just rely on existing holdings.
      3. Drift Correction: If Drift Analysis is provided, you MUST explicitly sell overweight positions and buy underweight positions to resolve the drift completely.
      4. CRITICAL MATHEMATICAL RULE: The sum of ALL "suggested_allocation" percentages MUST equal EXACTLY 100.
      5. NEVER produce totals above or below 100.

      MANDATORY VALIDATION STEP:
      After generating allocations, perform this correction:
      
      total_percent = Sum of all suggested_allocation
      
      If total_percent > 100 → reduce the largest allocation until total_percent = 100  
      If total_percent < 100 → increase the allocation of the most stable Debt security until total_percent = 100

      Your task:
      Return a single JSON object with two keys:
      {
        "rebalance_summary": "A 2-3 sentence high-level summary explaining the recommended strategy to optimize market performance, align with the IPS, and address any drift.",
        "suggestions": [
          {
            "security_name": "string",
            "ticker": "string",
            "current_allocation": number,
            "suggested_allocation": number,
            "action": "string (rationale for buying/selling/holding based on market quality and IPS)",
            "is_ips_deviation": boolean,
            "deviation_reason": "string (required if is_ips_deviation is true, otherwise empty string)"
          }
        ]
      }

      FINAL VALIDATION (MANDATORY):
      Before returning JSON verify:
      Sum of all suggested_allocation = 100
      If not equal to 100 → fix it before returning.
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
      
      throw new Error("Failed to parse AI suggestions.");
    }
  }

  /**
   * Analyzes portfolio drift and provides recommendations.
   * 
   * @use This prompt is used to evaluate the impact of asset allocation deviations and provide actionable advice to the advisor.
   * @considers Current allocation vs target allocation, IPS bands, and drift severity.
   * @returns A JSON object containing:
   *  - reason: Explanation of why the drift occurred.
   *  - risk_impact: Evaluation of the increased/decreased risk.
   *  - recommendations: Array of specific steps to take.
   *  - advisor_message: A professional message for the financial advisor to share with the client.
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
      You are a professional portfolio advisor. Analyze the following portfolio drift and provide recommendations based EXCLUSIVELY on the provided data.

      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided Portfolio Allocation and Target Allocation.
      2. DO NOT imagine or hallucinate market events or client circumstances not provided.
      3. Maintain a formal, objective, and professional tone.

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
      
      throw new Error("Failed to analyze portfolio drift. Please try again.");
    }
  }
}

export const aiService = new AIService();
