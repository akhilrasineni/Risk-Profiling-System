import { GoogleGenAI, Type } from "@google/genai";
import { Groq } from 'groq-sdk';
import { Client, RiskQuestion, RiskQuestionnaire, AIModel } from "../types";
import { AVAILABLE_MODELS } from "../constants/aiModels";

type ModelChangeCallback = (model: AIModel) => void;

/**
 * Service for interacting with AI models (Gemini and Groq).
 * Handles model selection, content generation, and specialized analysis tasks.
 */
class AIService {
  /** The currently active AI model. */
  private currentModel: AIModel = 'gemini-3-flash-preview';
  /** Callbacks for model change events. */
  private listeners: ModelChangeCallback[] = [];

  /**
   * Initializes the service and restores the last used model from session storage.
   */
  constructor() {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('ai_current_model');
      if (saved && AVAILABLE_MODELS.includes(saved as AIModel)) {
        this.currentModel = saved as AIModel;
      }
    }
  }

  /**
   * Subscribes to model change events.
   * @param callback The function to call when the model changes.
   */
  public subscribe(callback: ModelChangeCallback) {
    this.listeners.push(callback);
  }

  /**
   * Unsubscribes from model change events.
   * @param callback The function to remove from the listeners list.
   */
  public unsubscribe(callback: ModelChangeCallback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  /**
   * Notifies all subscribers that the model has changed.
   */
  private notifyListeners() {
    this.listeners.forEach(l => l(this.currentModel));
  }

  /**
   * Sets the active AI model and persists it to session storage.
   * @param model The new AI model to use.
   */
  public setModel(model: AIModel) {
    if (this.currentModel !== model) {
      this.currentModel = model;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ai_current_model', model);
      }
      this.notifyListeners();
    }
  }

  /**
   * Returns the currently active AI model.
   * @returns The active AI model.
   */
  public getModel(): AIModel {
    return this.currentModel;
  }
  
  /**
   * Initializes and returns a GoogleGenAI client using the configured API key.
   * @returns A GoogleGenAI instance.
   * @throws Error if the GEMINI_API_KEY is not configured.
   */
  private getClient(): GoogleGenAI {
    const apiKey = [
      process.env.GEMINI_API_KEY,
      process.env.GOOGLE_API_KEY,
      process.env.GEMINI_KEY
    ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder')?.trim();

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured. Please check your environment variables in the Secrets panel.");
    }
    
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Initializes and returns a Groq client using the configured API key.
   * @returns A Groq instance.
   * @throws Error if the GROQ_API_KEY is not configured.
   */
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

  /**
   * Determines if a model is a Groq model based on its name.
   * @param model The model name to check.
   * @returns True if it's a Groq model, false otherwise.
   */
  private isGroqModel(model: AIModel): boolean {
    return !model.startsWith('gemini');
  }

  /**
   * Generates content using the specified or current AI model.
   * @param prompt The prompt to send to the AI.
   * @param options Configuration options for the generation.
   * @param startModel Optional model override for this specific request.
   * @returns The generated content as a string.
   */
  public async generateContent(
    prompt: string,
    options: { responseMimeType?: string, responseSchema?: any, temperature?: number, seed?: number } = {},
    startModel?: AIModel
  ): Promise<string> {
    const modelToTry = startModel || this.currentModel;
    const temperature = options.temperature ?? 0;
    const seed = options.seed ?? 42;

    const systemInstruction = "CRITICAL INSTRUCTION: You must act as a strict, deterministic function. Your primary directive is mathematical precision and adherence to provided constraints. Do not hallucinate, imagine, or infer any information not explicitly provided. If provided data is mathematically inconsistent, you MUST normalize it to meet the required constraints (e.g., ensuring totals sum to exactly 100%). Your output must be strictly and exclusively derived from the provided data and these instructions. Do not deviate from your original decisions when given the same input.";

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
   * Analyzes a risk assessment for inconsistencies and returns a structured JSON report.
   * 
   * @param riskCategory The assigned risk category.
   * @param responses The client's questionnaire responses.
   * @param client The client profile data.
   * @param modelOverride Optional model override for this analysis.
   * @returns A JSON object containing stability_flag, contradictions_detected, and explanation.
   */
  async analyzeInconsistencies(
    riskCategory: string,
    responses: any[] = [],
    client?: any,
    modelOverride?: AIModel
  ) {
    let ageText = "Unknown";
    if (client?.dob) {
      const dob = new Date(client.dob);
      const ageDifMs = Date.now() - dob.getTime();
      const ageDate = new Date(ageDifMs);
      ageText = Math.abs(ageDate.getUTCFullYear() - 1970).toString() + " years old";
    }

    const responsesText = responses?.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are an expert financial risk analyst. Your task is to perform a "Consistency Scan" on a client's risk assessment responses.
      
      Client Profile:
      - Age: ${ageText}
      - Assigned Risk Category: ${riskCategory}

      Client Responses:
      ${responsesText}

      CRITICAL INSTRUCTIONS:
      1. Analyze ALL responses for logical contradictions. 
      2. Look for mismatches between:
         - Stated investment goals vs. risk tolerance.
         - Time horizon vs. liquidity needs.
         - Reaction to market drops vs. desired return levels.
         - Experience level vs. complexity of products they claim to understand.
      3. Determine a "stability_flag":
         - "Stable": No significant contradictions.
         - "Slightly Inconsistent": Minor mismatches that require advisor clarification.
         - "Highly Conflicted": Major logical contradictions that invalidate the risk score.
      4. List specific "contradictions_detected" as an array of strings.
      5. Provide a detailed "explanation" in Markdown format, summarizing your reasoning.

      Return ONLY a JSON object in the following structure:
      {
        "stability_flag": "Stable" | "Slightly Inconsistent" | "Highly Conflicted",
        "contradictions_detected": ["string", "string", ...],
        "explanation": "string (Markdown format)"
      }
    `;

    try {
      const aiResponse = await this.generateContent(
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              stability_flag: { type: Type.STRING, enum: ["Stable", "Slightly Inconsistent", "Highly Conflicted"] },
              contradictions_detected: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              explanation: { type: Type.STRING }
            },
            required: ["stability_flag", "contradictions_detected", "explanation"]
          },
          temperature: 0,
          seed: 42
        },
        modelOverride
      );

      return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
    } catch (error) {
      console.error("Failed to analyze inconsistencies:", error);
      return {
        stability_flag: "Stable",
        contradictions_detected: [],
        explanation: "Consistency analysis is currently unavailable due to a processing error."
      };
    }
  }
  /**
   * Analyzes a risk assessment for behavioral biases and returns a structured JSON report.
   * 
   * @param responses The client's questionnaire responses.
   * @param client The client profile data.
   * @param modelOverride Optional model override for this analysis.
   * @returns A JSON object containing biases and dominant_pattern.
   */
  async analyzeBehavioralBiases(
    responses: any[] = [],
    client?: any,
    modelOverride?: AIModel
  ) {
    let ageText = "Unknown";
    if (client?.dob) {
      const dob = new Date(client.dob);
      const ageDifMs = Date.now() - dob.getTime();
      const ageDate = new Date(ageDifMs);
      ageText = Math.abs(ageDate.getUTCFullYear() - 1970).toString() + " years old";
    }

    const responsesText = responses?.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are an expert behavioral finance analyst. Analyze the following risk assessment responses to identify potential psychological biases in the client's investment behavior.
      
      Focus on these four specific biases:
      1. OVERCONFIDENCE: Tendency to overestimate one's own abilities and the accuracy of one's information.
      2. LOSS AVERSION: Tendency to prefer avoiding losses to acquiring equivalent gains.
      3. UNREALISTIC RETURN: Expecting returns that are significantly higher than historical market averages for the given risk level.
      4. RECENCY BIAS: Tendency to over-emphasize recent events or trends when making decisions.

      Client Profile:
      - Age: ${ageText}

      Client Responses (ALL questions and answers):
      ${responsesText}

      CRITICAL INSTRUCTIONS:
      1. You MUST use ALL provided questions and answers to form your analysis.
      2. You MUST consider the client's Age and their number of Dependents (found in the responses) when evaluating their behavioral biases. For example, a younger client with no dependents might exhibit different biases or risk tolerance than an older client with multiple dependents.
      3. Provide a DETAILED and CONSISTENT response for each bias. The "description" must explicitly reference specific answers, the client's age, and dependents where relevant.
      4. Ensure the "dominant_pattern" provides a comprehensive summary of their behavioral profile.
      5. Your analysis MUST be logically consistent. If you identify a high likelihood of a bias, the description must align with the answers provided. Do not contradict yourself.

      Return ONLY a JSON object in the following structure:
      {
        "biases": [
          {
            "bias_name": "OVERCONFIDENCE",
            "likelihood": "LOW" | "MEDIUM" | "HIGH",
            "description": "string (detailed explanation)"
          },
          {
            "bias_name": "LOSS AVERSION",
            "likelihood": "LOW" | "MEDIUM" | "HIGH",
            "description": "string (detailed explanation)"
          },
          {
            "bias_name": "UNREALISTIC RETURN",
            "likelihood": "LOW" | "MEDIUM" | "HIGH",
            "description": "string (detailed explanation)"
          },
          {
            "bias_name": "RECENCY BIAS",
            "likelihood": "LOW" | "MEDIUM" | "HIGH",
            "description": "string (detailed explanation)"
          }
        ],
        "dominant_pattern": "string (detailed summary)"
      }
    `;

    try {
      const aiResponse = await this.generateContent(
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              biases: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    bias_name: { type: Type.STRING },
                    likelihood: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] },
                    description: { type: Type.STRING }
                  },
                  required: ["bias_name", "likelihood", "description"]
                }
              },
              dominant_pattern: { type: Type.STRING }
            },
            required: ["biases", "dominant_pattern"]
          },
          temperature: 0,
          seed: 42
        },
        modelOverride
      );

      return JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
    } catch (error) {
      console.error("Failed to analyze behavioral biases:", error);
      return {
        biases: [
          { bias_name: "OVERCONFIDENCE", likelihood: "LOW", description: "Analysis unavailable." },
          { bias_name: "LOSS AVERSION", likelihood: "LOW", description: "Analysis unavailable." },
          { bias_name: "UNREALISTIC RETURN", likelihood: "LOW", description: "Analysis unavailable." },
          { bias_name: "RECENCY BIAS", likelihood: "LOW", description: "Analysis unavailable." }
        ],
        dominant_pattern: "Analysis failed due to a processing error."
      };
    }
  }

  /**
   * Drafts a portfolio based on IPS and client data using AI.
   * 
   * @param ips The Investment Policy Statement data.
   * @param totalInvestment The total amount to invest.
   * @param availableSecurities List of securities available for selection.
   * @param client The client profile data.
   * @param responses The client's questionnaire responses.
   * @param modelOverride Optional model override for this drafting.
   * @returns A JSON object containing holdings and total_allocation_percent.
   */
  async draftPortfolioFromIPS(
    ips: any,
    totalInvestment: number,
    availableSecurities: any[],
    client?: any,
    responses: any[] = [],
    modelOverride?: AIModel
  ) {
    const securitiesText = availableSecurities?.map(s => 
      `- ID: ${s.id}, Name: ${s.security_name}, Class: ${s.asset_class}, SubClass: ${s.asset_sub_class}, Price: $${s.current_price}`
    ).join('\n');

    const allocationsText = ips?.target_allocations?.map((a: any) => 
      `- Asset Class: ${a.asset_class}, Target: ${a.target_percent}%`
    ).join('\n');

    const age = client?.dob ? new Date().getFullYear() - new Date(client.dob).getFullYear() : 'Not provided';
    const dependents = client?.dependents !== null && client?.dependents !== undefined ? client.dependents : 'Not provided';

    const responsesText = responses?.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const prompt = `
      You are an elite Senior Portfolio Manager. Your task is to draft an initial investment portfolio for a client based on the provided IPS mandate and detailed investor profile.
      
      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided "Available Securities" list. DO NOT imagine or invent securities, tickers, or prices.
      2. Adhere STRICTLY to the "Target Allocation Model" defined in the IPS.
      3. Consider the client's specific life situation (Age: ${age}, Dependents: ${dependents}) and their questionnaire responses to select the most appropriate funds within each asset class.
      4. Maintain a professional, institutional-grade tone.

      Client Profile & Context:
      - Age: ${age}
      - Dependents: ${dependents}
      - Total Investment Amount: $${totalInvestment}
      - Questionnaire Responses:
      ${responsesText}
      
      Target Allocation Model (IPS MANDATE):
      ${allocationsText}
      
      Available Securities:
      ${securitiesText}
      
      ASSET ALLOCATION CALCULATION RULES (MANDATORY):
      1. Build a robust, best-performing portfolio that adheres strictly to the Target Allocation Model.
      2. For each Asset Class listed in the Target Allocation Model, you MUST select multiple securities (funds) from the Available Securities list to achieve diversification.
      3. The selection of specific funds should be informed by the client's profile. For example, if they have many dependents, prioritize stability and lower-cost institutional funds. If they are younger, you might select funds with slightly higher growth potential within the allowed asset class.
      4. The sum of the 'allocated_percent' for all securities selected within a specific Asset Class MUST equal the Target Percent for that Asset Class as defined in the IPS. 
      5. CRITICAL MATHEMATICAL RULE: The sum of 'allocated_percent' for ALL securities across ALL asset classes MUST be EXACTLY 100.00.
      6. NEVER produce totals above or below 100.00.
      7. If the provided IPS mandate target allocations do not sum to 100, you MUST normalize them to 100 before selecting securities.

      MANDATORY VALIDATION & NORMALIZATION STEP:
      After generating allocations, you MUST perform this exact correction:
      
      current_total = Sum of all allocated_percent
      
      If current_total != 100:
        1. Identify the security with the largest allocation.
        2. Adjust its allocation by (100 - current_total) so that the new sum is EXACTLY 100.00.
        3. Recalculate allocated_amount and units for that security.

      CALCULATION REQUIREMENTS:
      - allocated_amount = (allocated_percent / 100) * ${totalInvestment}
      - units = allocated_amount / security.current_price
      - Ensure allocated_percent values are precise (up to 2 decimal places) and sum exactly to 100.00.

      PERFORMANCE PREDICTION (MANDATORY):
      1. Predict the expected 1-year percentage return range for this specific portfolio based on the asset allocation and selected securities.
      2. Provide a 'predicted_return_low' and 'predicted_return_high' to represent a realistic range.
      3. Provide a confidence score (0-100) for this prediction.
      4. Provide a detailed rationale (2-3 sentences) explaining why you believe the portfolio will achieve this return, considering the risk profile and market context of the selected securities.

      Return ONLY a JSON object in the following structure:
      {
        "holdings": [
          {
            "security_id": "EXACT UUID FROM THE LIST PROVIDED",
            "allocated_percent": number,
            "allocated_amount": number,
            "units": number
          }
        ],
        "total_allocation_percent": number,
        "predicted_return_low": number,
        "predicted_return_high": number,
        "confidence_score": number,
        "prediction_rationale": "string",
        "math_verification": {
          "sum_of_percents": number,
          "is_exactly_100": boolean
        }
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
            total_allocation_percent: { type: Type.NUMBER },
            predicted_return_low: { type: Type.NUMBER },
            predicted_return_high: { type: Type.NUMBER },
            confidence_score: { type: Type.NUMBER },
            prediction_rationale: { type: Type.STRING },
            math_verification: {
              type: Type.OBJECT,
              properties: {
                sum_of_percents: { type: Type.NUMBER },
                is_exactly_100: { type: Type.BOOLEAN }
              },
              required: ["sum_of_percents", "is_exactly_100"]
            }
          },
          required: ["holdings", "total_allocation_percent", "predicted_return_low", "predicted_return_high", "confidence_score", "prediction_rationale", "math_verification"]
        },
        temperature: 0,
        seed: 42
      },
      modelOverride
    );
    
    try {
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      
      // Post-process normalization to ensure 100% total allocation
      if (parsed.holdings && parsed.holdings.length > 0) {
        const currentTotal = parsed.holdings.reduce((sum: number, h: any) => sum + h.allocated_percent, 0);
        
        if (Math.abs(currentTotal - 100) > 0.001) {
          // Find the holding with the largest allocation to adjust
          let maxIdx = 0;
          for (let i = 1; i < parsed.holdings.length; i++) {
            if (parsed.holdings[i].allocated_percent > parsed.holdings[maxIdx].allocated_percent) {
              maxIdx = i;
            }
          }
          
          // Apply correction
          const diff = 100 - currentTotal;
          parsed.holdings[maxIdx].allocated_percent = Number((parsed.holdings[maxIdx].allocated_percent + diff).toFixed(2));
          
          // Recalculate amount and units for the adjusted holding
          const h = parsed.holdings[maxIdx];
          h.allocated_amount = Number(((h.allocated_percent / 100) * totalInvestment).toFixed(2));
          
          // We need the security price to recalculate units. 
          // We can find it from availableSecurities.
          const security = availableSecurities.find(s => s.id === h.security_id);
          if (security && security.current_price > 0) {
            h.units = Number((h.allocated_amount / security.current_price).toFixed(6));
          }
          
          // Update metadata
          parsed.total_allocation_percent = 100;
          if (parsed.math_verification) {
            parsed.math_verification.sum_of_percents = 100;
            parsed.math_verification.is_exactly_100 = true;
          }
        }
      }
      
      return parsed;
    } catch (e) {
      throw new Error("Failed to draft portfolio using AI.");
    }
  }

  /**
   * Generates a full Investment Policy Statement (IPS) document.
   * 
   * @param client The client profile data.
   * @param riskCategory The assigned risk category.
   * @param timeHorizon The investment time horizon in years.
   * @param liquidityNeeds The client's liquidity requirements.
   * @param taxConsiderations The client's tax situation.
   * @param esgPreference The client's ESG preferences.
   * @param concentratedPosition Any concentrated positions to consider.
   * @param constraints Other investment constraints.
   * @param staticAllocations Base allocation model for the risk category.
   * @param responses The client's questionnaire responses.
   * @param modelOverride Optional model override for this generation.
   * @returns A JSON object containing the full IPS structure.
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
    const responsesText = responses?.map((r: any) => {
      return `- ${r.risk_questions?.question_text || r.question_text || 'Question'}: ${r.risk_answer_options?.option_text || r.option_text || 'Option'}`;
    }).join('\n');

    const age = client.dob ? new Date().getFullYear() - new Date(client.dob).getFullYear() : 'Not provided';
    
    // Extract dependents from questionnaire responses if not provided in client profile
    let extractedDependents = client.dependents;
    if (extractedDependents === null || extractedDependents === undefined) {
      const dependentResponse = responses?.find((r: any) => {
        const qText = (r.risk_questions?.question_text || r.question_text || '').toLowerCase();
        return qText.includes('dependent') || qText.includes('rely on your income');
      });
      if (dependentResponse) {
        const optionText = (dependentResponse.risk_answer_options?.option_text || dependentResponse.option_text || '');
        // Extract number from option text (e.g., "2", "3+", "None" -> 0)
        const match = optionText.match(/\d+/);
        if (match) {
          extractedDependents = parseInt(match[0]);
        } else if (optionText.toLowerCase().includes('none') || optionText.toLowerCase() === '0') {
          extractedDependents = 0;
        }
      }
    }
    const dependents = extractedDependents !== null && extractedDependents !== undefined ? extractedDependents : 'Not provided';

    const prompt = `
      You are a Senior Investment Strategist at a top-tier institutional wealth management firm. Generate a highly professional, comprehensive, and consistent Investment Policy Statement (IPS) for a client based EXCLUSIVELY on the provided data.

      STYLE GUIDE & TONE:
      - TONE: Institutional-grade, formal, dispassionate, and precise.
      - TERMINOLOGY: Use industry-standard terms (e.g., "Strategic Asset Allocation", "Risk Capacity vs. Risk Tolerance", "L-T-T-L-U Framework", "Standard Deviation", "Sharpe Ratio Optimization").
      - FORMATTING: Use Markdown headers (###), bold text for emphasis, and structured bullet points. Avoid generic filler.
      - PERSPECTIVE: Write from the perspective of an institutional fiduciary.

      STRICT DATA ADHERENCE RULES:
      1. Use ONLY the provided Client Profile and Questionnaire Responses.
      2. DO NOT imagine or hallucinate client goals, constraints, or preferences.
      3. Adhere STRICTLY to the "BASE ALLOCATION MODEL" as the starting point.
      4. Ensure all analysis (Risk, Goals, Constraints) is deeply integrated with the client's specific age (${age}), dependents (${dependents}), and financial data.

      Client Profile:
      - Name: ${client.first_name} ${client.last_name}
      - Age: ${age}
      - Dependents: ${dependents}
      - Risk Category: ${riskCategory}
      - Time Horizon: ${timeHorizon} years
      - Liquidity Needs: $${liquidityNeeds.toLocaleString()}
      - Tax Considerations: ${taxConsiderations}% Marginal Rate
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
      2. Adjust allocations based on the client's risk profile, age (${age}), and dependents (${dependents}).
      3. Equity should be highest for Aggressive profiles and younger clients.
      4. Debt should be highest for Conservative profiles and older clients nearing retirement.
      5. Alternatives should normally stay between 5% and 15%.

      CRITICAL MATHEMATICAL RULE:
      - Equity + Debt + Alternatives MUST equal EXACTLY 100.
      - NEVER produce totals above or below 100.
      - All target_percent values must be integers.

      MANDATORY VALIDATION & NORMALIZATION STEP:
      After generating allocations, you MUST perform this exact correction:
      total = Equity + Debt + Alternatives
      If total != 100:
        1. Identify the largest allocation.
        2. Adjust it by (100 - total) so that the new sum is EXACTLY 100.
        3. Ensure all values remain positive and logical.

      OUTPUT REQUIREMENTS:
      - Percentages must be integers.
      - Exactly THREE asset classes must be returned.

      Return ONLY a JSON object in the following structure:

      {
        "investment_objective": "string",
        "goals_description": "string",
        "rebalancing_frequency": "Quarterly" | "Semi-Annually" | "Annually",
        "rebalancing_band_percent": number,
        "rebalancing_strategy_description": "string",
        "monitoring_review_description": "string",
        "constraints_description": "string",
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
        ],
        "math_verification": {
          "sum_of_targets": number,
          "is_exactly_100": boolean
        }
      }

      FINAL VALIDATION (MANDATORY):
      Before returning JSON verify:
      1. Equity + Debt + Alternatives = 100
      2. All text descriptions are professional, detailed, and specific to this client's data.
      3. No generic placeholders like '[Client Name]' or '[Date]'.
    `;

    const aiResponse = await this.generateContent(
      prompt,
      { 
        responseMimeType: "application/json", 
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            investment_objective: { type: Type.STRING },
            goals_description: { type: Type.STRING },
            rebalancing_frequency: { type: Type.STRING, enum: ["Quarterly", "Semi-Annually", "Annually"] },
            rebalancing_band_percent: { type: Type.NUMBER },
            rebalancing_strategy_description: { type: Type.STRING },
            monitoring_review_description: { type: Type.STRING },
            constraints_description: { type: Type.STRING },
            target_allocations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  asset_class: { type: Type.STRING },
                  target_percent: { type: Type.NUMBER },
                  lower_band: { type: Type.NUMBER },
                  upper_band: { type: Type.NUMBER }
                },
                required: ["asset_class", "target_percent", "lower_band", "upper_band"]
              }
            },
            math_verification: {
              type: Type.OBJECT,
              properties: {
                sum_of_targets: { type: Type.NUMBER },
                is_exactly_100: { type: Type.BOOLEAN }
              },
              required: ["sum_of_targets", "is_exactly_100"]
            }
          },
          required: [
            "investment_objective", 
            "goals_description", 
            "rebalancing_frequency", 
            "rebalancing_band_percent", 
            "rebalancing_strategy_description", 
            "monitoring_review_description", 
            "constraints_description", 
            "target_allocations",
            "math_verification"
          ]
        },
        temperature: 0, // Set to 0 for precision
        seed: 42 
      },
      modelOverride
    );
    const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
    
    // Post-process normalization for IPS targets
    if (parsed.target_allocations && parsed.target_allocations.length > 0) {
      const currentTotal = parsed.target_allocations.reduce((sum: number, a: any) => sum + a.target_percent, 0);
      
      if (Math.abs(currentTotal - 100) > 0.001) {
        // Find the asset class with the largest target to adjust
        let maxIdx = 0;
        for (let i = 1; i < parsed.target_allocations.length; i++) {
          if (parsed.target_allocations[i].target_percent > parsed.target_allocations[maxIdx].target_percent) {
            maxIdx = i;
          }
        }
        
        // Apply correction
        const diff = 100 - currentTotal;
        parsed.target_allocations[maxIdx].target_percent = Math.round(parsed.target_allocations[maxIdx].target_percent + diff);
        
        // Update metadata
        if (parsed.math_verification) {
          parsed.math_verification.sum_of_targets = 100;
          parsed.math_verification.is_exactly_100 = true;
        }
      }
    }
    
    return parsed;
  }

  /**
   * Suggests portfolio rebalance actions based on current holdings and IPS mandate.
   * 
   * @param ips The Investment Policy Statement data.
   * @param targetAllocations The target asset class allocations.
   * @param availableSecurities List of securities available for selection.
   * @param currentHoldings The current portfolio holdings.
   * @param driftEvents Any detected drift events.
   * @param modelOverride Optional model override for this suggestion.
   * @returns A JSON object containing rebalance_summary and suggestions.
   */
  async suggestRebalanceActions(
    ips: any,
    targetAllocations: any[],
    availableSecurities: any[],
    currentHoldings: any[],
    driftEvents: any[] = [],
    modelOverride?: AIModel
  ) {
    const holdingsText = currentHoldings?.map(h => 
      `- ${h.security?.security_name} (${h.security?.ticker || 'N/A'}) [${h.security?.asset_sub_class || h.security?.asset_class}]: ${h.allocated_percent.toFixed(2)}%`
    ).join('\n');

    const availableSecuritiesText = availableSecurities?.map(s => 
      `- ${s.security_name} (${s.ticker || 'N/A'}) [${s.asset_sub_class || s.asset_class}]`
    ).join('\n');

    const targetAllocationsText = targetAllocations?.map(t => 
      `- ${t.asset_class}: ${t.target_percent}% (Band: ${t.lower_band}% - ${t.upper_band}%)`
    ).join('\n');

    const driftText = driftEvents?.length > 0 ? driftEvents?.map(d => 
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
      1. IPS Alignment: Ensure the sum of suggested allocations for securities in each asset class exactly matches the Target Allocation Model's target percent. You MUST NOT violate the IPS bands unless there is a compelling market reason (e.g., extreme volatility or significant alpha opportunity), in which case you MUST mark it as a deviation and provide a detailed reason.
      2. Diversification & Weighting (CRITICAL RULE): You MUST NOT allocate more than 20% of the total portfolio to any single security. 
         - For large target allocations (e.g., Equity at 60%), you MUST select 3-5 different securities from the "Available Securities" list to spread risk and optimize market exposure.
         - Use a Core-Satellite approach: Assign higher weights (e.g., 15-20%) to broad-market, core funds and lower weights (e.g., 5-10%) to specialized, sector, or higher-risk funds.
         - Actively ADD new, high-quality securities from the "Available Securities" list to improve diversification. Do not just rely on existing holdings.
      3. Detailed Rationale: For EVERY security suggested (buy, sell, or hold), you MUST provide a detailed rationale in the "action" field. Explain WHY this specific fund was chosen or adjusted, referencing its asset class, market quality, and how it fits the client's IPS.
      4. IPS Deviation Disclosure: If you suggest an allocation that falls outside the IPS target bands [Lower Band - Upper Band], you MUST set "is_ips_deviation" to true and provide a comprehensive "deviation_reason" explaining the tactical necessity.
      5. Drift Correction (CRITICAL): If Drift Analysis is provided, you MUST explicitly mention in the "rebalance_summary" exactly WHERE the drift occurred (which asset classes/securities) and the PERCENTAGE of drift observed.
      6. Correction Measures: In the "action" field for each security, explicitly state the measures being taken for correction (e.g., "Selling 5% to reduce Equity overweight" or "Buying 3% to resolve Debt underweight").
      7. Scope of Change: Focus ONLY on correcting the identified drift. Do not make unnecessary changes to securities or asset classes that are already aligned with their target weights, unless it is strictly necessary to fund the correction of a drift elsewhere.
      8. CRITICAL MATHEMATICAL RULE: The sum of ALL "suggested_allocation" percentages MUST equal EXACTLY 100.
      9. NEVER produce totals above or below 100.

      MANDATORY VALIDATION STEP:
      After generating allocations, perform this correction:
      
      total_percent = Sum of all suggested_allocation
      
      If total_percent > 100 → reduce the largest allocation until total_percent = 100  
      If total_percent < 100 → increase the allocation of the most stable Debt security until total_percent = 100

      Your task:
      Return a single JSON object with two keys:
      {
        "rebalance_summary": "A detailed high-level summary (2-4 sentences). You MUST explicitly mention where drift occurred, the percentage of drift, and the overall strategy to bring the portfolio back into IPS compliance while correcting ONLY the drifted areas.",
        "suggestions": [
          {
            "security_name": "string",
            "ticker": "string",
            "asset_class": "string (The asset class this security belongs to, e.g., Equity, Debt, Alternatives)",
            "current_allocation": number,
            "suggested_allocation": number,
            "action": "string (Detailed rationale explaining the specific measures taken to correct drift for this security, referencing percentages and asset class alignment)",
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
                    asset_class: { type: Type.STRING, description: "The asset class this security belongs to (Equity, Debt, or Alternatives)." },
                    current_allocation: { type: Type.NUMBER },
                    suggested_allocation: { type: Type.NUMBER },
                    action: { type: Type.STRING },
                    is_ips_deviation: { type: Type.BOOLEAN, description: "True if the suggested allocation deviates from the IPS target allocation band due to market conditions." },
                    deviation_reason: { type: Type.STRING, description: "Required if is_ips_deviation is true, explaining why the deviation is necessary." }
                  },
                  required: ["security_name", "ticker", "asset_class", "current_allocation", "suggested_allocation", "action", "is_ips_deviation", "deviation_reason"]
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
      4. CRITICAL: You MUST explicitly mention WHERE the drift occurred (asset classes) and the EXACT PERCENTAGE of drift observed in the "reason" field.
      5. CRITICAL: In the "recommendations" field, specify the exact measures being taken for correction (e.g., "Sell 4.5% of Equity to return to target").
      6. CRITICAL: Focus ONLY on correcting the drift. Do not suggest changes to areas that are within their target bands.

      Portfolio allocation:
      ${allocationText}

      Target allocation:
      ${targetText}

      Severity: ${driftData.severity}

      Reasoning Structure (You MUST follow this strictly):
      1. Analyze: Determine exactly where drift happened and by what percentage.
      2. Assess: Evaluate the risk impact of this specific drift.
      3. Recommend: Formulate specific rebalance actions to correct ONLY the drifted areas.

      Return a JSON object with the following structure:
      {
        "reason": "string (Detailed explanation of where drift occurred and the exact percentage of drift)",
        "risk_impact": "string (Evaluation of risk impact based on the specific drift observed)",
        "recommendations": ["string (Specific measure for correction)", "string (Specific measure for correction)"],
        "advisor_message": "string (Professional message for the advisor)"
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
