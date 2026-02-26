import { useState, useEffect } from 'react';
import { ClipboardList, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { RiskQuestionnaire, RiskQuestion, QuestionnaireResponsePayload, Client } from '../types';
import { aiService } from '../services/aiService';

interface RiskQuestionnaireViewProps {
  client: Client;
  onComplete: () => void;
  onCancel: () => void;
}

export default function RiskQuestionnaireView({ client, onComplete, onCancel }: RiskQuestionnaireViewProps) {
  const [questionnaire, setQuestionnaire] = useState<RiskQuestionnaire & { questions: RiskQuestion[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const TARGET_VERSION = "AFS-RP-2026-v1";

  useEffect(() => {
    fetchQuestionnaire();
  }, []);

  const fetchQuestionnaire = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/questionnaires/${TARGET_VERSION}`);
      const data = await response.json();
      
      if (response.ok && data.status === 'ok') {
        setQuestionnaire(data.data);
      } else {
        setError(data.message || 'Failed to load questionnaire');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (questionId: string, optionId: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmit = async () => {
    if (!questionnaire) return;

    const unanswered = questionnaire.questions.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
      alert(`Please answer all questions before submitting. (${unanswered.length} remaining)`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Generate AI Summary and components using AIService
      let ai_behavior_summary = "";
      let consistency_score = 0;
      let response_stability = 0;
      let reliability_score = 0;

      try {
        const analysis = await aiService.analyzeRiskAssessment(client, questionnaire, answers);
        ai_behavior_summary = analysis.behavioral_summary;
        consistency_score = analysis.consistency_score || 0;
        response_stability = analysis.response_stability || 0;
        reliability_score = analysis.reliability_score || 0;
      } catch (aiErr) {
        console.error("AI Analysis failed:", aiErr);
        ai_behavior_summary = "AI analysis unavailable. Deterministic scoring used.";
        consistency_score = 50;
        response_stability = 50;
        reliability_score = 50;
      }

      // 2. Calculate Deterministic Components
      
      // Willingness vs Ability Separation
      let willingness_raw = 0;
      let willingness_max = 0;
      let ability_raw = 0;
      let ability_max = 0;
      let is_knockout_conservative = false;

      questionnaire.questions.forEach(q => {
        const qOptions = q.options || [];
        const maxOptScore = Math.max(...qOptions.map(o => o.score_value));
        const selectedOptId = answers[q.id];
        const selectedOpt = qOptions.find(o => o.id === selectedOptId);
        const score = (selectedOpt?.score_value || 0) * q.weight;
        const maxScore = maxOptScore * q.weight;

        const text = q.question_text.toLowerCase();
        
        // Categorize based on keywords
        const isAbility = text.includes('horizon') || text.includes('time') || text.includes('withdraw') || text.includes('income') || text.includes('years');
        
        if (isAbility) {
          ability_raw += score;
          ability_max += maxScore;
          
          // Knock-out logic: Very short time horizon (usually the lowest score option)
          if (text.includes('horizon') || text.includes('time')) {
            if (selectedOpt && selectedOpt.score_value <= 1) { // Assuming 0 or 1 is the "short term" option
              is_knockout_conservative = true;
            }
          }
        } else {
          willingness_raw += score;
          willingness_max += maxScore;
        }
      });

      const willingness_score = willingness_max > 0 ? (willingness_raw / willingness_max) * 100 : 0;
      const ability_score = ability_max > 0 ? (ability_raw / ability_max) * 100 : 0;

      // Completion Quality (8 fields)
      const profileFields = ['first_name', 'last_name', 'email', 'dob', 'annual_income', 'net_worth', 'liquidity_needs', 'tax_bracket'];
      const filledFields = profileFields.filter(f => !!(client as any)[f]).length;
      const completion_quality = (filledFields / profileFields.length) * 100;

      // Boundary Distance Score
      // We need a rough calculation of the score here to determine distance
      let raw_score = 0;
      let max_score = 0;
      questionnaire.questions.forEach(q => {
        const qOptions = q.options || [];
        const maxOptScore = Math.max(...qOptions.map(o => o.score_value));
        max_score += maxOptScore * q.weight;
        
        const selectedOptId = answers[q.id];
        const selectedOpt = qOptions.find(o => o.id === selectedOptId);
        raw_score += (selectedOpt?.score_value || 0) * q.weight;
      });
      const normalized_score = max_score > 0 ? raw_score / max_score : 0;
      
      let boundary_distance_score = 0;
      if (normalized_score <= 0.35) {
        // Conservative: boundary is 0.35. Max distance is 0.35 (at 0)
        const dist = 0.35 - normalized_score;
        boundary_distance_score = (dist / 0.35) * 100;
      } else if (normalized_score <= 0.65) {
        // Moderate: boundaries are 0.35 and 0.65. Max distance is 0.15 (at 0.5)
        const dist = Math.min(normalized_score - 0.35, 0.65 - normalized_score);
        boundary_distance_score = (dist / 0.15) * 100;
      } else {
        // Aggressive: boundary is 0.65. Max distance is 0.35 (at 1.0)
        const dist = normalized_score - 0.65;
        boundary_distance_score = (dist / 0.35) * 100;
      }

      // 3. Final Weighted Confidence Score - NOW 100% AI DRIVEN
      // We use the AI's holistic reliability score directly
      const ai_confidence_score = reliability_score;

      // Store breakdown in the summary for the UI to parse
      const breakdown = {
        consistency: consistency_score,
        boundary: boundary_distance_score,
        completion: completion_quality,
        stability: response_stability
      };
      const summaryWithBreakdown = `${ai_behavior_summary}\n\n[CONFIDENCE_BREAKDOWN]:${JSON.stringify(breakdown)}`;

      // 4. Submit to backend
      const payload: QuestionnaireResponsePayload & { ai_behavior_summary: string, ai_confidence_score: number } = {
        client_id: client.id,
        questionnaire_id: questionnaire.id,
        responses: Object.entries(answers).map(([question_id, selected_option_id]) => ({
          question_id,
          selected_option_id: String(selected_option_id)
        })),
        ai_behavior_summary: summaryWithBreakdown,
        ai_confidence_score
      };

      const response = await fetch('/api/questionnaires/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (response.ok && data.status === 'ok') {
        setSubmitSuccess(true);
      } else {
        setError(`Submission failed: ${data.message || 'Please try again'}`);
      }
    } catch (err: any) {
      setError(`Network error: ${err.message || 'Please check your connection'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 text-slate-500 py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p>Loading questionnaire...</p>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center mt-10">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Profile Submitted</h2>
        <p className="text-slate-500 mb-8">
          Your risk profile has been successfully recorded. Your advisor will review your results.
        </p>
        <button 
          onClick={onComplete}
          className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (error && !questionnaire) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center mt-10">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={onCancel} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
            Cancel
          </button>
          <button onClick={fetchQuestionnaire} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Risk Profiling Questionnaire</h1>
          </div>
          <p className="text-sm text-slate-500">Please answer the following questions to help us understand your investment risk tolerance.</p>
        </div>
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-900 font-medium">
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {questionnaire?.questions.map((question, index) => (
          <div key={question.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-medium mb-4">
              <span className="text-slate-400 mr-2">{index + 1}.</span>
              {question.question_text}
            </h3>
            
            <div className="space-y-3">
              {question.options?.map((option) => (
                <label 
                  key={option.id} 
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    answers[question.id] === option.id 
                      ? 'border-blue-500 bg-blue-50/30' 
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center h-5 mt-0.5">
                    <input 
                      type="radio" 
                      name={`question-${question.id}`}
                      value={option.id}
                      checked={answers[question.id] === option.id}
                      onChange={() => handleOptionSelect(question.id, option.id)}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-900">{option.option_text}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Answered: {Object.keys(answers).length} of {questionnaire?.questions.length || 0}
        </p>
        <button
          onClick={handleSubmit}
          disabled={submitting || Object.keys(answers).length !== (questionnaire?.questions.length || 0)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Submitting...' : 'Submit Profile'}
        </button>
      </div>
    </div>
  );
}
