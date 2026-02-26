import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X, ShieldCheck, Activity, BrainCircuit, Search, Check, ClipboardList, FileText, User } from 'lucide-react';
import { Client, IPSDocument, TargetAllocation } from '../types';
import IPSEditor from './IPSEditor';

interface RiskProfileModalProps {
  client: Client;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RiskProfileModal({ client, onClose, onSuccess }: RiskProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'ips'>('profile');
  
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
  
  const [generatingIPS, setGeneratingIPS] = useState(false);
  const [ipsError, setIpsError] = useState<string | null>(null);
  const [ipsDocument, setIpsDocument] = useState<(IPSDocument & { target_allocations: TargetAllocation[] }) | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Risk Assessment
        const resProfile = await fetch(`/api/clients/${client.id}/risk_assessment`);
        const jsonProfile = await resProfile.json();
        
        if (resProfile.ok && jsonProfile.status === 'ok') {
          setData(jsonProfile.data);
          setOverrideCategory(jsonProfile.data.risk_category);
        } else {
          setError(jsonProfile.message || 'Failed to load profile');
        }

        // 2. Fetch Existing IPS (if any)
        const resIPS = await fetch(`/api/ips/client/${client.id}`);
        const jsonIPS = await resIPS.json();
        if (resIPS.ok && jsonIPS.status === 'ok' && jsonIPS.data) {
          setIpsDocument(jsonIPS.data);
        }

      } catch (err: any) {
        setError(err.message || 'Network error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [client.id]);

  const handleAnalyze = async () => {
    if (!data) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/assessments/${data.id}/analyze`, {
        method: 'POST'
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        setAnalysis(json.data);
      } else {
        let msg = json.message || 'Failed to analyze inconsistencies';
        try {
          const parsed = JSON.parse(msg);
          if (parsed.error && parsed.error.message) {
            msg = parsed.error.message;
          }
        } catch (e) {
          // Not JSON, use original message
        }
        setAnalysisError(msg);
      }
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

  const handleGenerateIPS = async () => {
    if (!data) return;
    setGeneratingIPS(true);
    setIpsError(null);
    try {
      const res = await fetch('/api/ips/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          risk_assessment_id: data.id
        })
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        setIpsDocument(json.data); // Set the newly generated IPS
        setActiveTab('ips'); // Switch to IPS tab
      } else {
        let msg = json.message || 'Failed to generate IPS';
        try {
          const parsed = JSON.parse(msg);
          if (parsed.error && parsed.error.message) {
            msg = parsed.error.message;
          }
        } catch (e) {
          // Not JSON, use original message
        }
        setIpsError(msg);
      }
    } catch (err: any) {
      console.error(err);
      setIpsError(err.message || 'Network error occurred');
    } finally {
      setGeneratingIPS(false);
    }
  };

  const handleSaveIPS = async (updatedIps: any) => {
    if (!ipsDocument) return;
    
    const res = await fetch(`/api/ips/${ipsDocument.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedIps)
    });
    
    const json = await res.json();
    if (res.ok && json.status === 'ok') {
      setIpsDocument({ ...ipsDocument, ...json.data, target_allocations: updatedIps.allocations });
    } else {
      throw new Error(json.message || 'Failed to update IPS');
    }
  };

  const handleAcceptIPS = async () => {
    if (!ipsDocument) return;
    try {
      const res = await fetch(`/api/ips/${ipsDocument.id}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'advisor' })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setIpsDocument(prev => prev ? { ...prev, advisor_accepted_at: new Date().toISOString() } : null);
        // alert('IPS Accepted successfully.'); // Optional feedback
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to accept IPS: ' + err.message);
    }
  };

  const isEligibleForIPS = data && data.finalized_by_advisor && 
    (data.ai_confidence_score > 1 ? data.ai_confidence_score >= 65 : data.ai_confidence_score >= 0.65);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0 print:bg-white print:static print:block">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col h-[92vh] print:h-auto print:shadow-none print:rounded-none print:overflow-visible">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10 print:hidden">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Client Portfolio Management</h3>
              {data && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  data.finalized_by_advisor ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {data.finalized_by_advisor ? 'Risk Profile Finalized' : 'Risk Review Needed'}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{client.first_name} {client.last_name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-slate-200 bg-slate-50/50 flex gap-6 print:hidden">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'profile' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <User className="w-4 h-4" />
            Risk Profile
          </button>
          <button
            onClick={() => setActiveTab('ips')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'ips' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Investment Policy (IPS)
          </button>
        </div>
        
        {/* Content Area */}
        <div className="p-6 overflow-y-auto bg-slate-50/30 flex-1 print:overflow-visible print:bg-white print:p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* TAB: RISK PROFILE */}
              {activeTab === 'profile' && data && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                          <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[10px] font-bold rounded uppercase tracking-tighter">AI Analysis</span>
                        </div>
                        <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <BrainCircuit className="w-4 h-4" />
                          Behavioral Profile Summary
                        </h4>
                        <p className="text-blue-800 text-sm leading-relaxed pr-12">
                          {data.ai_behavior_summary.split('[SUITABILITY_ANALYSIS]:')[0].split('[CONFIDENCE_BREAKDOWN]:')[0]}
                        </p>
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
                </div>
              )}

              {/* TAB: IPS EDITOR */}
              {activeTab === 'ips' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {ipsDocument ? (
                    <IPSEditor 
                      ips={ipsDocument} 
                      client={client} 
                      onSave={handleSaveIPS} 
                      onAccept={handleAcceptIPS}
                      viewerRole="advisor"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">No IPS Document Found</h3>
                      <p className="text-slate-500 max-w-md mb-8">
                        {isEligibleForIPS 
                          ? "The risk profile is finalized and ready. Generate a draft Investment Policy Statement to get started."
                          : "You must finalize the risk profile with a high enough confidence score before generating an IPS."}
                      </p>
                      
                      {isEligibleForIPS && (
                        <div className="flex flex-col items-center gap-4">
                          <button
                            onClick={handleGenerateIPS}
                            disabled={generatingIPS}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-600/20"
                          >
                            {generatingIPS ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardList className="w-5 h-5" />}
                            Generate IPS Draft
                          </button>
                          {ipsError && (
                            <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 px-4 py-2 rounded-lg border border-red-100">
                              <AlertCircle className="w-4 h-4" />
                              {ipsError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
