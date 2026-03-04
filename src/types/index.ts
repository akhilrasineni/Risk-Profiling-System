export type AIModel = 
  | 'gemini-3-flash-preview' 
  | 'gemini-3.1-pro-preview'
  | 'qwen/qwen3-32b'
  | 'llama-3.1-8b-instant'
  | 'llama-3.3-70b-versatile'
  | 'meta-llama/llama-4-scout-17b-16e-instruct'
  | 'moonshotai/kimi-k2-instruct-0905'
  | 'groq/compound'
  | 'groq/compound-mini';

export interface Advisor {
  id: string;
  full_name: string;
  email: string;
  license_number: string | null;
  created_at?: string;
}

export interface Client {
  id: string;
  advisor_id: string;
  first_name: string;
  last_name: string;
  email: string;
  dob: string | null;
  annual_income: number | null;
  net_worth: number | null;
  liquidity_needs: number | null;
  tax_bracket: number | null;
  investable_assets: number | null;
  risk_assessment_completed?: boolean;
  risk_assessment_finalized?: boolean;
  final_risk_category?: string;
  created_at: string;
  updated_at?: string;
}

export interface RiskQuestionnaire {
  id: string;
  version: string;
  methodology_reference: string;
}

export interface RiskAnswerOption {
  id: string;
  question_id: string;
  option_text: string;
  score_value: number;
}

export interface RiskQuestion {
  id: string;
  questionnaire_id: string;
  question_text: string;
  question_type: string;
  weight: number;
  order_number: number;
  options?: RiskAnswerOption[];
}

export interface QuestionnaireResponsePayload {
  client_id: string;
  questionnaire_id: string;
  responses: {
    question_id: string;
    selected_option_id: string;
  }[];
}

export interface RiskAssessment {
  id: string;
  client_id: string;
  questionnaire_id: string;
  raw_score: number;
  normalized_score: number;
  risk_category: string;
  finalized_by_advisor: boolean;
  finalized_at: string | null;
  ai_behavior_summary: string;
  ai_confidence_score: number;
  advisor_override_category?: string;
  advisor_override_reason?: string;
  created_at: string;
  behavioral_bias_analysis?: any;
  risk_probability_analysis?: any;
  dual_scoring_analysis?: any;
  consistency_analysis?: any;
}

export interface RiskAssessmentResponse {
  id: string;
  risk_assessment_id: string;
  question_id: string;
  selected_option_id: string;
  score_given: number;
}

export interface IPSDocument {
  id: string;
  client_id: string;
  risk_assessment_id: string;
  version?: number;
  rebalancing_band_percent?: number;
  esg_preference?: boolean;
  concentrated_position_flag?: boolean;
  constraints_json?: any;
  status: 'Draft' | 'Finalized' | 'Active';
  advisor_signed_at?: string;
  client_signed_at?: string;
  created_at: string;
  risk_category: string;
  investment_objective: string;
  time_horizon_years: number;
  tax_considerations: number | string;
  rebalancing_frequency: string;
  liquidity_needs: number | string;
  performance_benchmark?: string;
  updated_at?: string;
  monitoring_review_description?: string;
  rebalancing_strategy_description?: string;
  constraints_description?: string;
  finalized_at?: string;
  goals_description?: string;
  advisor_accepted_at?: string;
  client_accepted_at?: string;
  risk_assessments?: RiskAssessment;
  clients?: {
    first_name: string;
    last_name: string;
    advisors?: {
      full_name: string;
    };
  };
}

export interface TargetAllocation {
  id: string;
  ips_id: string;
  asset_class: string;
  target_percent: number;
  lower_band: number;
  upper_band: number;
}

export interface Security {
  id: string;
  security_name: string;
  ticker?: string;
  asset_class: string;
  current_price?: number;
}

export interface Portfolio {
  id: string;
  client_id: string;
  ips_id: string;
  total_investment_amount: number;
  status: 'Active' | 'Pending' | 'Closed';
  client_approved: boolean;
  client_approved_at?: string;
  approval_status: 'Pending' | 'Approved' | 'Rejected';
  cash_balance?: number;
  created_at: string;
  updated_at: string;
  holdings?: PortfolioHolding[];
  ips?: any;
}

export interface PortfolioHolding {
  id: string;
  portfolio_id: string;
  security_id: string;
  allocated_percent: number;
  allocated_amount: number;
  units: number;
  security?: Security;
}

export interface RebalanceHolding extends PortfolioHolding {
  suggested_percent?: number;
  action?: string;
}


export type UserSession = {
  id: string;
  role: 'advisor' | 'client';
  name: string; // For client: first_name + last_name, for advisor: full_name
  rawData: any;
};

