import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X, ShieldCheck, Activity, BrainCircuit, Search, Check } from 'lucide-react';
import { Client } from '../types';
import { aiService } from '../services/aiService';

interface RiskProfileModalProps {
  client: Client;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RiskProfileModal({ client, onClose, onSuccess }: RiskProfileModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [overrideMode, setOverrideMode] = useState<boolean>(false);
  const [overrideCategory, setOverrideCategory] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [finalizing, setFinalizing] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/clients/${client.id}/risk_assessment`);
        const json = await res.json();
        if (res.ok && json.status === 'ok') {
          setData(json.data);
          setOverrideCategory(json.data.risk_category);
        } else {
          setError(json.message || 'Failed to load profile');
        }
      } catch (err: any) {
        setError(err.message || 'Network error');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [client.id]);

  const handleAnalyze = async () => {
    if (!data) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await aiService.analyzeInconsistencies(data.risk_category, data.responses);
      setAnalysis(result);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'Network error occurred during AI analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFinalize = async () => {
    if (!data) return;
    setFinalizing(true);
    try {
      const payload: any = {};
      if (overrideMode) {
        payload.override_category = overrideCategory;
        payload.override_reason = overrideReason;
      }

      const res = await fetch(`/api/assessments/${data.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        setData({ ...data, ...json.data });
        if (onSuccess) onSuccess();
      } else {
        alert(json.message || 'Failed to finalize assessment');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFinalizing(false);
    }
  };

  const handleReject = async () => {
    if (!data) return;
    
    setFinalizing(true);
    try {
      const res = await fetch(`/api/assessments/${data.id}/reject`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        if (onSuccess) onSuccess();
        else onClose();
      } else {
        alert(json.message || 'Failed to reject assessment');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFinalizing(false);
      setShowRejectConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Risk Profile Analysis</h3>
              {data && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  data.finalized_by_advisor ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {data.finalized_by_advisor ? 'Finalized' : 'Review Needed'}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{client.first_name} {client.last_name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-slate-50/50 flex-1">
          {loading ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
                  <div className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
                </div>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          ) : data ? (
            <div className="space-y-6">
              
              {/* Top Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-slate-500">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="text-sm font-medium uppercase tracking-wider">Calculated Category</span>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${
                    data.risk_category === 'Aggressive' ? 'text-rose-600' :
                    data.risk_category === 'Moderate' ? 'text-amber-600' :
                    'text-emerald-600'
                  }`}>
                    {data.risk_category}
                  </p>
                  {data.advisor_override_category && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-1">Advisor Override</span>
                      <p className="text-lg font-bold text-blue-600">{data.advisor_override_category}</p>
                    </div>
                  )}
                </div>
                
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm font-medium uppercase tracking-wider">Scoring Metrics</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-slate-900">
                      {(data.normalized_score * 100).toFixed(1)}%
                    </p>
                    <span className="text-xs text-slate-400 font-mono">({data.raw_score} pts)</span>
                  </div>
                  <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-500" 
                      style={{ width: `${data.normalized_score * 100}%` }}
                    />
                  </div>
                  
                  {/* Suitability Breakdown */}
                  {data.ai_behavior_summary.includes('[SUITABILITY_ANALYSIS]:') && (
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                      {(() => {
                        try {
                          const jsonStr = data.ai_behavior_summary.split('[SUITABILITY_ANALYSIS]:')[1].split('[CONFIDENCE_BREAKDOWN]:')[0];
                          const suitability = JSON.parse(jsonStr);
                          return (
                            <>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Willingness</p>
                                <p className="text-sm font-semibold text-slate-700">{suitability.willingness}%</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Ability</p>
                                <p className="text-sm font-semibold text-slate-700">{suitability.ability}%</p>
                              </div>
                              {suitability.knockout && (
                                <div className="col-span-2 mt-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wide rounded border border-red-100">
                                    <AlertCircle className="w-3 h-3" />
                                    Knock-out Constraint Active
                                  </span>
                                </div>
                              )}
                            </>
                          );
                        } catch (e) { return null; }
                      })()}
                    </div>
                  )}
                </div>
                
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                  <div className="absolute top-3 right-3">
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-tighter">AI Analysis</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <BrainCircuit className="w-4 h-4" />
                    <span className="text-sm font-medium uppercase tracking-wider">Reliability Score</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {data.ai_confidence_score <= 1 
                      ? Math.round(data.ai_confidence_score * 100) 
                      : Math.round(data.ai_confidence_score)}/100
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-xl relative">
                    <div className="absolute top-4 right-4">
                      <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[10px] font-bold rounded uppercase tracking-tighter">AI Generated</span>
                    </div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4" />
                      Behavioral Profile Summary
                    </h4>
                    <p className="text-blue-800 text-sm leading-relaxed pr-12">
                      {data.ai_behavior_summary.split('[SUITABILITY_ANALYSIS]:')[0].split('[CONFIDENCE_BREAKDOWN]:')[0]}
                    </p>
                    
                    {/* Confidence Breakdown Visualization */}
                    {data.ai_behavior_summary.includes('[CONFIDENCE_BREAKDOWN]:') && (
                      <div className="mt-6 pt-4 border-t border-blue-100/50">
                        <h5 className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-3">Reliability Breakdown</h5>
                        <div className="space-y-3">
                          {(() => {
                            try {
                              const jsonStr = data.ai_behavior_summary.split('[CONFIDENCE_BREAKDOWN]:')[1];
                              const breakdown = JSON.parse(jsonStr);
                              const metrics = [
                                { label: 'AI Consistency', value: breakdown.consistency, weight: '40%', color: 'bg-blue-500' },
                                { label: 'Boundary Distance', value: breakdown.boundary, weight: '30%', color: 'bg-indigo-500' },
                                { label: 'Profile Completion', value: breakdown.completion, weight: '20%', color: 'bg-emerald-500' },
                                { label: 'Response Stability', value: breakdown.stability, weight: '10%', color: 'bg-amber-500' }
                              ];
                              return metrics.map(m => (
                                <div key={m.label}>
                                  <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-blue-900 font-medium">{m.label} <span className="text-blue-400 font-normal">({m.weight})</span></span>
                                    <span className="text-blue-900 font-bold">{Math.round(m.value)}%</span>
                                  </div>
                                  <div className="w-full bg-blue-100/50 h-1 rounded-full overflow-hidden">
                                    <div className={`${m.color} h-full transition-all duration-1000`} style={{ width: `${m.value}%` }} />
                                  </div>
                                </div>
                              ));
                            } catch (e) { return null; }
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Inconsistency Check */}
                  <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <Search className="w-4 h-4 text-slate-500" />
                          Inconsistency Deep-Dive
                        </h4>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded uppercase tracking-tighter border border-slate-200">AI Analysis</span>
                      </div>
                      {!analysis && !analyzing && (
                        <button 
                          onClick={handleAnalyze}
                          className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-all shadow-sm active:scale-95"
                        >
                          Run Check
                        </button>
                      )}
                    </div>
                    
                    {analyzing ? (
                      <div className="space-y-3 py-2">
                        <div className="h-4 bg-slate-100 rounded-md w-3/4 animate-pulse" />
                        <div className="h-4 bg-slate-100 rounded-md w-full animate-pulse" />
                        <div className="h-4 bg-slate-100 rounded-md w-5/6 animate-pulse" />
                        <div className="flex items-center gap-2 mt-4">
                          <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">AI is processing...</span>
                        </div>
                      </div>
                    ) : analysis ? (
                      <div className="bg-slate-900 text-slate-100 p-5 rounded-xl border border-slate-800 shadow-inner font-sans">
                        <div className="prose prose-invert prose-sm max-w-none">
                          <div className="whitespace-pre-wrap leading-relaxed opacity-90">
                            {analysis}
                          </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Analytical Report</span>
                          <span className="text-[10px] text-slate-500 italic">Gemini 3 Flash Analysis</span>
                        </div>
                      </div>
                    ) : analysisError ? (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-800 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>{analysisError}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">
                        Run the check to scan for conflicting answers (e.g., capital preservation vs. aggressive returns).
                      </p>
                    )}
                  </div>

                  {/* Advisor Finalization Form */}
                  {!data.finalized_by_advisor && (
                    <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-slate-500" />
                        Advisor Confirmation
                      </h4>
                      
                      <div className="space-y-4">
                        <div className="flex gap-4 mb-4">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              checked={!overrideMode} 
                              onChange={() => setOverrideMode(false)} 
                              className="text-blue-600 focus:ring-blue-500" 
                            />
                            Confirm Calculated Category
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              checked={overrideMode} 
                              onChange={() => setOverrideMode(true)} 
                              className="text-blue-600 focus:ring-blue-500" 
                            />
                            Override Category
                          </label>
                        </div>

                        {overrideMode && (
                          <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">New Category</label>
                              <select 
                                value={overrideCategory}
                                onChange={(e) => setOverrideCategory(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              >
                                <option value="Conservative">Conservative</option>
                                <option value="Moderate">Moderate</option>
                                <option value="Aggressive">Aggressive</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Override *</label>
                              <textarea 
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                placeholder="Explain why you are overriding the calculated category..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white min-h-[80px]"
                                required
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex gap-3 mt-6">
                          {!showRejectConfirm ? (
                            <button
                              onClick={() => setShowRejectConfirm(true)}
                              disabled={finalizing}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              Reject & Retake
                            </button>
                          ) : (
                            <div className="flex-1 flex gap-2">
                              <button
                                onClick={() => setShowRejectConfirm(false)}
                                disabled={finalizing}
                                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleReject}
                                disabled={finalizing}
                                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {finalizing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirm Reject"}
                              </button>
                            </div>
                          )}
                          <button
                            onClick={handleFinalize}
                            disabled={finalizing || (overrideMode && !overrideReason.trim())}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Confirm Suitability
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {data.advisor_override_reason && (
                    <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-900 mb-2">Advisor Notes</h4>
                      <p className="text-sm text-slate-700 italic">"{data.advisor_override_reason}"</p>
                    </div>
                  )}
                </div>

                {/* Detailed Responses */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider">Detailed Responses</h4>
                  <div className="space-y-3">
                    {data.responses?.map((r: any, i: number) => (
                      <div key={r.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-sm font-medium text-slate-900 mb-2">
                          <span className="text-slate-400 mr-2">{i + 1}.</span>
                          {r.question_text}
                        </p>
                        <div className="flex items-center justify-between pl-6">
                          <p className="text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                            {r.option_text}
                          </p>
                          <span className="text-xs font-mono text-slate-400">Score Given: {r.score_given}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assessment Metadata */}
              <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assessment ID</p>
                  <p className="text-xs font-mono text-slate-600 truncate" title={data.id}>{data.id.split('-')[0]}...</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Created On</p>
                  <p className="text-xs text-slate-600">{new Date(data.created_at).toLocaleDateString()} {new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Questionnaire</p>
                  <p className="text-xs text-slate-600">{data.questionnaire_id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-xs text-slate-600">{data.finalized_by_advisor ? 'Verified & Finalized' : 'Pending Review'}</p>
                </div>
              </div>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
