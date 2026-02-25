export interface Advisor {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
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
}

export interface RiskAssessmentResponse {
  id: string;
  risk_assessment_id: string;
  question_id: string;
  selected_option_id: string;
  score_given: number;
}

export type UserSession = {
  id: string;
  role: 'advisor' | 'client';
  name: string;
  rawData: any;
};

