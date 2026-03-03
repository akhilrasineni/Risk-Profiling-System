import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X, ShieldCheck, Activity, BrainCircuit, Search, Check, ClipboardList, FileText, User, Info, ChevronDown, Sparkles, TrendingUp, Heart, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Client, IPSDocument, TargetAllocation } from '../types';
import IPSEditor from './IPSEditor';
import PortfolioEditor from './PortfolioEditor';
import { aiService } from '../services/aiService';
import { ALLOCATION_MODELS, RiskCategory } from '../constants/allocationModels';
import Tooltip from './Tooltip';

interface RiskProfileModalProps {
  client: Client;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RiskProfileModal({ client, onClose, onSuccess }: RiskProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'ips' | 'portfolio'>('profile');
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<{
    consistency_score: number;
    stability_flag: string;
    contradictions_detected: string[];
    explanation: string;
  } | null>(null);
  const [dualScoring, setDualScoring] = useState<any>(null);
  const [behavioralBiases, setBehavioralBiases] = useState<any>(null);
  const [riskClassification, setRiskClassification] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingDual, setAnalyzingDual] = useState(false);
  const [analyzingBiases, setAnalyzingBiases] = useState(false);
  const [analyzingClassification, setAnalyzingClassification] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [dualError, setDualError] = useState<string | null>(null);
  const [biasesError, setBiasesError] = useState<string | null>(null);
  const [classificationError, setClassificationError] = useState<string | null>(null);

  const [overrideMode, setOverrideMode] = useState<boolean>(false);
  const [overrideCategory, setOverrideCategory] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [finalizing, setFinalizing] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showBehavioral, setShowBehavioral] = useState(true);
  const [showDualScoring, setShowDualScoring] = useState(true);
  const [showConsistency, setShowConsistency] = useState(true);
  const [showBiases, setShowBiases] = useState(true);
  const [showClassification, setShowClassification] = useState(true);
  
  const [generatingIPS, setGeneratingIPS] = useState(false);
  const [ipsError, setIpsError] = useState<string | null>(null);
  const [ipsDocument, setIpsDocument] = useState<(IPSDocument & { target_allocations: TargetAllocation[] }) | null>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [buildingPortfolio, setBuildingPortfolio] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Risk Assessment
        const resProfile = await fetch(`/api/clients/${client.id}/risk_assessment`);
        if (!resProfile.ok) {
          const errorText = await resProfile.text();
          throw new Error(`Failed to load profile: ${resProfile.status} ${resProfile.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
        }
        const jsonProfile = await resProfile.json();
        
        if (jsonProfile.status === 'ok') {
          setData(jsonProfile.data);
          setOverrideCategory(jsonProfile.data.risk_category);
          
          // Automatically trigger consistency scan if not already present
          if (jsonProfile.data.consistency_analysis) {
            setAnalysis(jsonProfile.data.consistency_analysis);
          } else {
            handleAnalyze(jsonProfile.data);
          }

          // Automatically trigger dual scoring if not already present
          if (jsonProfile.data.dual_scoring_analysis) {
            setDualScoring(jsonProfile.data.dual_scoring_analysis);
          } else {
            handleDualScoring(jsonProfile.data);
          }

          // Automatically trigger behavioral bias detection if not already present
          if (jsonProfile.data.behavioral_bias_analysis) {
            setBehavioralBiases(jsonProfile.data.behavioral_bias_analysis);
          } else {
            handleBehavioralBiases(jsonProfile.data);
          }

          // Automatically trigger risk classification if not already present
          if (jsonProfile.data.risk_probability_analysis) {
            setRiskClassification(jsonProfile.data.risk_probability_analysis);
          } else {
            handleRiskClassification(jsonProfile.data);
          }
        } else {
          setError(jsonProfile.message || 'Failed to load profile');
        }

        // 2. Fetch Existing IPS (if any)
        const resIPS = await fetch(`/api/ips/client/${client.id}`);
        if (resIPS.ok) {
          const jsonIPS = await resIPS.json();
          if (jsonIPS.status === 'ok' && jsonIPS.data) {
            setIpsDocument(jsonIPS.data);
          }
        }

        // 3. Fetch Existing Portfolio (if any)
        const resPort = await fetch(`/api/portfolios/client/${client.id}`);
        if (resPort.ok) {
          const jsonPort = await resPort.json();
          if (jsonPort.status === 'ok' && jsonPort.data) {
            setPortfolio(jsonPort.data);
          }
        }

      } catch (err: any) {
        setError(err.message || 'Network error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [client.id]);

  const handleAnalyze = async (assessmentData?: any) => {
    const targetData = assessmentData || data;
    if (!targetData) return;
    
    // If we already have analysis in the data, use it
    if (targetData.consistency_analysis && !analyzing) {
      setAnalysis(targetData.consistency_analysis);
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    try {
      // Call AI Service directly from frontend
      const result = await aiService.analyzeInconsistencies(
        targetData.risk_category,
        targetData.responses
      );
      setAnalysis(result);

      // Save the analysis back to the database for persistence
      try {
        await fetch(`/api/assessments/${targetData.id}/consistency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: result })
        });
      } catch (saveErr) {
        console.warn("Failed to save consistency analysis:", saveErr);
      }
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'Network error occurred during AI analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDualScoring = async (assessmentData?: any) => {
    const targetData = assessmentData || data;
    if (!targetData) return;

    if (targetData.dual_scoring_analysis && !analyzingDual) {
      setDualScoring(targetData.dual_scoring_analysis);
      return;
    }

    setAnalyzingDual(true);
    setDualError(null);
    try {
      const result = await aiService.analyzeDualScoring(
        client,
        targetData.responses
      );
      setDualScoring(result);

      // Save to DB
      try {
        await fetch(`/api/assessments/${targetData.id}/dual-scoring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: result })
        });
      } catch (saveErr) {
        console.warn("Failed to save dual scoring analysis:", saveErr);
      }
    } catch (err: any) {
      console.error(err);
      setDualError(err.message || 'Network error occurred during dual scoring analysis');
    } finally {
      setAnalyzingDual(false);
    }
  };

  const handleBehavioralBiases = async (assessmentData?: any) => {
    const targetData = assessmentData || data;
    if (!targetData) return;

    if (targetData.behavioral_bias_analysis && !analyzingBiases) {
      setBehavioralBiases(targetData.behavioral_bias_analysis);
      return;
    }

    setAnalyzingBiases(true);
    setBiasesError(null);
    try {
      const result = await aiService.analyzeBehavioralBiases(
        targetData.responses
      );
      setBehavioralBiases(result);

      // Save to DB
      try {
        await fetch(`/api/assessments/${targetData.id}/behavioral-biases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: result })
        });
      } catch (saveErr) {
        console.warn("Failed to save behavioral bias analysis:", saveErr);
      }
    } catch (err: any) {
      console.error(err);
      setBiasesError(err.message || 'Network error occurred during behavioral bias analysis');
    } finally {
      setAnalyzingBiases(false);
    }
  };

  const handleRiskClassification = async (assessmentData?: any) => {
    const targetData = assessmentData || data;
    if (!targetData) return;

    if (targetData.risk_probability_analysis && !analyzingClassification) {
      setRiskClassification(targetData.risk_probability_analysis);
      return;
    }

    setAnalyzingClassification(true);
    setClassificationError(null);
    try {
      const result = await aiService.analyzeRiskProbabilities(
        targetData.responses
      );
      setRiskClassification(result);

      // Save to DB
      try {
        await fetch(`/api/assessments/${targetData.id}/risk-probabilities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: result })
        });
      } catch (saveErr) {
        console.warn("Failed to save risk probability analysis:", saveErr);
      }
    } catch (err: any) {
      console.error(err);
      setClassificationError(err.message || 'Network error occurred during risk classification analysis');
    } finally {
      setAnalyzingClassification(false);
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
      // 1. Eligibility Check
      const score = data.ai_confidence_score;
      const normalizedScore = score > 1 ? score / 100 : score;
      
      if (normalizedScore < 0.65) {
        throw new Error(`AI Confidence Score too low (${(normalizedScore * 100).toFixed(1)}%). Minimum 65% required.`);
      }

      const riskCategory = data.risk_category as RiskCategory;
      const model = ALLOCATION_MODELS[riskCategory];
      if (!model) {
        throw new Error(`Invalid risk category: ${riskCategory}`);
      }

      // 2. Determine Time Horizon from Responses
      let timeHorizon = 5; // Default
      const horizonResponse = data.responses?.find((r: any) => 
        (r.risk_questions?.question_text || '').toLowerCase().includes('primary investment horizon') ||
        (r.risk_questions?.question_text || '').toLowerCase().includes('investment horizon')
      );

      if (horizonResponse) {
        const text = horizonResponse.risk_answer_options?.option_text || '';
        const match = text.match(/(\d+)/);
        if (match) {
          timeHorizon = parseInt(match[1]);
        }
      }

      // 2.5 Fetch Available Asset Classes
      const assetClassesRes = await fetch('/api/portfolios/securities/asset-classes');
      const assetClassesData = await assetClassesRes.json();
      const availableAssetClasses = assetClassesData.status === 'ok' ? assetClassesData.data : ['Equity', 'Fixed Income', 'Alternatives'];

      // 3. Generate Full IPS via AI (Frontend Call)
      const staticAllocations = [
        { asset_class: 'Equity', target_percent: model.Equity },
        { asset_class: 'Debt', target_percent: model.Debt },
        { asset_class: 'Alternatives', target_percent: model.Alternatives }
      ];

      const aiResponse = await aiService.generateFullIPS(
        client,
        riskCategory,
        timeHorizon,
        client.liquidity_needs || 0,
        client.tax_bracket || 0,
        "None",
        "None",
        {},
        staticAllocations,
        availableAssetClasses
      );

      // 4. Save to Backend
      const res = await fetch('/api/ips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          risk_assessment_id: data.id,
          ips_data: {
            risk_category: riskCategory,
            investment_objective: aiResponse.investment_objective,
            time_horizon_years: timeHorizon,
            liquidity_needs: client.liquidity_needs || 0,
            tax_considerations: client.tax_bracket || 0,
            rebalancing_frequency: aiResponse.rebalancing_frequency || model.Rebalance,
            rebalancing_strategy_description: aiResponse.rebalancing_strategy_description,
            monitoring_review_description: aiResponse.monitoring_review_description,
            constraints_description: aiResponse.constraints_description,
            goals_description: aiResponse.goals_description
          },
          target_allocations: aiResponse.target_allocations
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to save IPS: ${res.status} ${res.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
      }
      
      const json = await res.json();
      if (json.status === 'ok') {
        setIpsDocument(json.data);
        setActiveTab('ips');
      } else {
        setIpsError(json.message || 'Failed to save IPS');
      }
    } catch (err: any) {
      console.error(err);
      setIpsError(err.message || 'Error occurred during IPS generation');
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
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to accept IPS: ' + err.message);
    }
  };

  const handleBuildPortfolio = async () => {
    if (!ipsDocument) return;
    setBuildingPortfolio(true);
    setPortfolioError(null);
    try {
      const res = await fetch(`/api/ips/${ipsDocument.id}/build-portfolio`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setPortfolio(data.data);
        setActiveTab('portfolio');
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      setPortfolioError(err.message);
    } finally {
      setBuildingPortfolio(false);
    }
  };

  const handleSavePortfolio = async () => {
    // Refresh portfolio data
    const resPort = await fetch(`/api/portfolios/client/${client.id}`);
    if (resPort.ok) {
      const jsonPort = await resPort.json();
      if (jsonPort.status === 'ok' && jsonPort.data) {
        setPortfolio(jsonPort.data);
      }
    }
  };

  const isEligibleForIPS = data && data.finalized_by_advisor && 
    (data.ai_confidence_score > 1 ? data.ai_confidence_score >= 65 : data.ai_confidence_score >= 0.65);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0 print:bg-white print:static print:block"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col h-[92vh] print:h-auto print:shadow-none print:rounded-none print:overflow-visible"
      >
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10 print:hidden">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-display font-bold text-slate-900 tracking-tight">Client Portfolio Management</h3>
              {data && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  data.finalized_by_advisor 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                    : 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${data.finalized_by_advisor ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  {data.finalized_by_advisor ? 'Risk Profile Finalized' : 'Risk Review Needed'}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-medium">{client.first_name} {client.last_name}</p>
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
            Investment Policy
          </button>
          {portfolio && (
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'portfolio' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              Portfolio
            </button>
          )}
        </div>
        
        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden bg-gray-50 print:overflow-visible print:bg-white">
          {/* Enhanced Background */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            {/* Base Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100/50 to-gray-50"></div>
            
            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
            
            {/* Animated Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/20 rounded-full blur-[100px] animate-float"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-400/20 rounded-full blur-[100px] animate-float [animation-delay:2s]"></div>
            <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-emerald-400/20 rounded-full blur-[80px] animate-float [animation-delay:4s]"></div>
          </div>

          <div className="absolute inset-0 z-10 overflow-y-auto p-6 print:static print:p-0 print:overflow-visible">
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
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  
                  {/* SECTION: CORE RISK PROFILE (NON-AI) */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-1 h-6 bg-slate-900 rounded-full" />
                      <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight">Core Risk Profile</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Primary Risk Card */}
                      <div className="md:col-span-2 bg-slate-900 rounded-[2.5rem] p-8 md:p-10 text-white relative overflow-hidden shadow-2xl group">
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 text-slate-400 mb-8">
                            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white border border-white/10 group-hover:scale-110 transition-transform">
                              <ShieldCheck className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Risk Classification</span>
                          </div>
                          <h2 className="text-6xl md:text-7xl font-display font-bold mb-4 tracking-tighter">
                            {data.advisor_override_category || data.risk_category}
                          </h2>
                          <div className="flex items-center gap-4">
                            <div className="flex -space-x-2">
                              {[1, 2, 3].map(i => (
                                <div key={i} className="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-500">
                                  {i}
                                </div>
                              ))}
                            </div>
                            <span className="text-xs text-slate-400 font-medium">
                              Based on {data.responses?.length || 0} behavioral data points
                            </span>
                            {data.advisor_override_category && (
                              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded-full border border-blue-500/30 uppercase tracking-wider">
                                Advisor Override
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Abstract background elements */}
                        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl group-hover:bg-blue-600/30 transition-colors"></div>
                        <div className="absolute top-10 right-10 w-32 h-32 bg-indigo-600/10 rounded-full blur-2xl group-hover:bg-indigo-600/20 transition-colors"></div>
                      </div>

                      {/* Financial Constraints Card */}
                      <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Constraints
                          </h4>
                          <div className="space-y-8">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tax Bracket</p>
                              <p className="text-2xl font-display font-bold text-slate-900">{client.tax_bracket ? `${client.tax_bracket}%` : 'Standard'}</p>
                            </div>
                            <div className="pt-6 border-t border-slate-100">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Liquidity Needs</p>
                              <p className="text-2xl font-display font-bold text-slate-900">${client.liquidity_needs?.toLocaleString() || 'Minimal'}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quick Stats Column */}
                      <div className="flex flex-col gap-4">
                        <div className="flex-1 bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-blue-200 transition-colors">
                          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-2">Net Worth</p>
                          <p className="text-2xl font-display font-bold text-slate-900 group-hover:text-blue-600 transition-colors">${client.net_worth?.toLocaleString() || '—'}</p>
                        </div>
                        <div className="flex-1 bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-emerald-200 transition-colors">
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Income</p>
                          <p className="text-2xl font-display font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">${client.annual_income?.toLocaleString() || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Questionnaire Audit */}
                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                      <button 
                        onClick={() => setShowAudit(!showAudit)}
                        className="w-full p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between hover:bg-slate-100/80 transition-colors group"
                      >
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 group-hover:text-slate-600 transition-colors">
                          <ClipboardList className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                          Questionnaire Audit
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {showAudit ? 'Collapse' : 'Expand'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showAudit ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      
                      {showAudit && (
                        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto scrollbar-hide animate-in slide-in-from-top-2 duration-300">
                          {data.responses?.map((r: any, i: number) => (
                            <div key={r.id} className="p-6 hover:bg-slate-50/50 transition-colors">
                              <div className="flex items-start gap-4">
                                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-slate-900 mb-3 leading-snug">
                                    {r.question_text}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-600 shadow-sm">
                                      {r.option_text}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                      Weight: {r.score_given}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION: AI INSIGHTS & ANALYSIS */}
                  <div className="space-y-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-6 bg-violet-600 rounded-full" />
                        <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight">AI Insights & Analysis</h3>
                      </div>
                      <Tooltip alignment="right" content={
                        <div className="text-left space-y-2">
                          <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">AI Analysis Engine</p>
                          <p className="text-xs text-slate-300">These insights are generated using Gemini 1.5 Pro by cross-referencing behavioral responses with financial constraints.</p>
                          <div className="pt-2">
                            <p className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Data Used:</p>
                            <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-300">
                              <li>{data.responses?.length || 0} Questionnaire Responses</li>
                              <li>Financial Constraints (Tax, Liquidity)</li>
                              <li>Client Net Worth & Income</li>
                            </ul>
                          </div>
                        </div>
                      }>
                        <div className="flex items-center gap-2 px-3 py-1 bg-violet-50 text-violet-600 text-[10px] font-bold rounded-full border border-violet-100 uppercase shadow-sm cursor-help">
                          <BrainCircuit className="w-3 h-3" />
                          AI Powered
                        </div>
                      </Tooltip>
                    </div>

                    {/* Dual Risk Scoring Model (Capacity vs Tolerance) */}
                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                      <button 
                        onClick={() => setShowDualScoring(!showDualScoring)}
                        className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 group-hover:scale-110 transition-transform">
                            <Activity className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-sm font-bold text-slate-900 tracking-tight">Risk Capacity vs Tolerance</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Dual Scoring Model</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Dual Scoring Model</p>
                              <div className="text-[10px] text-slate-300 space-y-2">
                                <p>Analyzed: Separate financial risk into Capacity (Ability) and Tolerance (Willingness).</p>
                                <div>
                                  <p className="font-bold text-white uppercase tracking-widest text-[9px] mb-0.5">Capacity Inputs:</p>
                                  <ul className="list-disc pl-3 space-y-0.5">
                                    <li>% of net worth invested</li>
                                    <li>Emergency fund coverage</li>
                                    <li>Income stability</li>
                                    <li>Withdrawal rate & Horizon</li>
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-bold text-white uppercase tracking-widest text-[9px] mb-0.5">Tolerance Inputs:</p>
                                  <ul className="list-disc pl-3 space-y-0.5">
                                    <li>Reaction to 20% drop</li>
                                    <li>2-year market decline reaction</li>
                                    <li>Volatility comfort</li>
                                    <li>Experience & Loss history</li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                          }>
                            <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                              <Sparkles className="w-3 h-3" />
                            </div>
                          </Tooltip>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showDualScoring ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {showDualScoring && (
                        <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                          {analyzingDual ? (
                            <div className="space-y-4 py-2">
                              <div className="h-4 bg-slate-100 rounded-full w-3/4 animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-full animate-pulse" />
                              <div className="flex items-center gap-2 mt-6">
                                <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Calculating dual scores...</span>
                              </div>
                            </div>
                          ) : dualError ? (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800 text-xs">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <p>{dualError}</p>
                            </div>
                          ) : dualScoring ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Capacity Score */}
                                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:border-blue-200 group/card">
                                  <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2 text-slate-400">
                                      <ShieldCheck className="w-4 h-4" />
                                      <p className="text-[10px] font-bold uppercase tracking-widest">Risk Capacity</p>
                                    </div>
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover/card:scale-110 transition-transform">
                                      <TrendingUp className="w-4 h-4" />
                                    </div>
                                  </div>
                                  <div className="flex items-baseline gap-1 mb-4">
                                    <p className="text-4xl font-display font-bold text-slate-900 tracking-tight">{dualScoring.capacity_score}</p>
                                    <p className="text-sm font-bold text-slate-300">/ 100</p>
                                  </div>
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${dualScoring.capacity_score}%` }}
                                      transition={{ duration: 1, ease: "easeOut" }}
                                      className="bg-blue-500 h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]" 
                                    />
                                  </div>
                                  <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                                    <p className="text-[10px] text-blue-700 leading-relaxed font-medium">Financial ability to absorb market fluctuations based on net worth and income stability.</p>
                                  </div>
                                </div>

                                {/* Tolerance Score */}
                                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:border-violet-200 group/card">
                                  <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2 text-slate-400">
                                      <Activity className="w-4 h-4" />
                                      <p className="text-[10px] font-bold uppercase tracking-widest">Risk Tolerance</p>
                                    </div>
                                    <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 group-hover/card:scale-110 transition-transform">
                                      <Heart className="w-4 h-4" />
                                    </div>
                                  </div>
                                  <div className="flex items-baseline gap-1 mb-4">
                                    <p className="text-4xl font-display font-bold text-slate-900 tracking-tight">{dualScoring.tolerance_score}</p>
                                    <p className="text-sm font-bold text-slate-300">/ 100</p>
                                  </div>
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${dualScoring.tolerance_score}%` }}
                                      transition={{ duration: 1, ease: "easeOut" }}
                                      className="bg-violet-500 h-full rounded-full shadow-[0_0_10px_rgba(139,92,246,0.3)]" 
                                    />
                                  </div>
                                  <div className="mt-4 p-3 bg-violet-50/50 rounded-xl border border-violet-100/50">
                                    <p className="text-[10px] text-violet-700 leading-relaxed font-medium">Psychological comfort with volatility and potential temporary losses in the portfolio.</p>
                                  </div>
                                </div>

                                {/* Final Score & Band */}
                                <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden group/card">
                                  <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-6">
                                      <div className="flex items-center gap-2 text-slate-400">
                                        <Target className="w-4 h-4" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest">Prudent Risk Score</p>
                                      </div>
                                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white border border-white/10 group-hover/card:scale-110 transition-transform">
                                        <ShieldCheck className="w-4 h-4" />
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between mb-6">
                                      <p className="text-5xl font-display font-bold tracking-tighter">{dualScoring.final_risk_score}</p>
                                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                                        dualScoring.risk_band === 'Aggressive' 
                                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                          : dualScoring.risk_band === 'Moderate'
                                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                      }`}>
                                        {dualScoring.risk_band}
                                      </span>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                                      <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Calculated using the conservative minimum of Capacity and Tolerance scores.</p>
                                    </div>
                                  </div>
                                  <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-600/10 rounded-full blur-2xl group-hover/card:bg-blue-600/20 transition-colors" />
                                </div>
                              </div>

                              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                  <Info className="w-3 h-3" />
                                  Analysis Summary
                                </h5>
                                <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed">
                                  <ReactMarkdown>{dualScoring.explanation}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Consistency / Contradiction Detection */}
                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                      <button 
                        onClick={() => setShowConsistency(!showConsistency)}
                        className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                            <Search className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-sm font-bold text-slate-900 tracking-tight">Response Consistency Scan</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Contradiction Detection</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Consistency Scan</p>
                              <div className="text-[10px] text-slate-300 space-y-1">
                                <p className="font-bold text-white uppercase tracking-widest text-[9px]">Analyzed:</p>
                                <ul className="list-disc pl-3 space-y-0.5">
                                  <li>All questionnaire responses</li>
                                  <li>Question weights</li>
                                  <li>Initial risk category score</li>
                                </ul>
                              </div>
                            </div>
                          }>
                            <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                              <Sparkles className="w-3 h-3" />
                            </div>
                          </Tooltip>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showConsistency ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      
                      {showConsistency && (
                        <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                          {analysisError && !analyzing && (
                            <div className="mb-4 flex justify-end">
                              <button 
                                onClick={() => handleAnalyze()}
                                className="text-[10px] font-bold bg-slate-900 text-white px-4 py-2 rounded-full uppercase tracking-wider hover:bg-slate-800 transition-all"
                              >
                                Retry Scan
                              </button>
                            </div>
                          )}
                          
                          {analyzing ? (
                            <div className="space-y-4 py-2">
                              <div className="h-4 bg-slate-100 rounded-full w-3/4 animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-full animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-5/6 animate-pulse" />
                              <div className="flex items-center gap-2 mt-6">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Scanning responses...</span>
                              </div>
                            </div>
                          ) : analysisError ? (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800 text-xs">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <p>{analysisError}</p>
                            </div>
                          ) : analysis ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center group/card transition-all hover:border-blue-200">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Consistency Score</p>
                                  <div className="relative inline-flex items-center justify-center mb-4">
                                    <svg className="w-20 h-20 transform -rotate-90">
                                      <circle
                                        cx="40"
                                        cy="40"
                                        r="34"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="transparent"
                                        className="text-slate-100"
                                      />
                                      <motion.circle
                                        cx="40"
                                        cy="40"
                                        r="34"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="transparent"
                                        strokeDasharray={213.6}
                                        initial={{ strokeDashoffset: 213.6 }}
                                        animate={{ strokeDashoffset: 213.6 - (213.6 * (analysis.consistency_score / 100)) }}
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                        className={analysis.consistency_score >= 70 ? 'text-emerald-500' : analysis.consistency_score >= 40 ? 'text-amber-500' : 'text-red-500'}
                                      />
                                    </svg>
                                    <span className="absolute text-xl font-display font-bold text-slate-900">{analysis.consistency_score}%</span>
                                  </div>
                                  <p className={`text-[10px] font-bold uppercase tracking-widest ${analysis.consistency_score >= 70 ? 'text-emerald-600' : analysis.consistency_score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {analysis.stability_flag}
                                  </p>
                                </div>

                                <div className="md:col-span-2 bg-slate-50 rounded-2xl p-6 border border-slate-100 relative overflow-hidden group/card">
                                  <div className="relative z-10">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <AlertTriangle className="w-3 h-3" />
                                      Detected Contradictions
                                    </h5>
                                    {analysis.contradictions_detected && analysis.contradictions_detected.length > 0 ? (
                                      <div className="space-y-3">
                                        {analysis.contradictions_detected.map((c: string, idx: number) => (
                                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3 group/item hover:border-amber-200 transition-colors">
                                            <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 group-hover/item:scale-110 transition-transform">
                                              <AlertCircle className="w-3.5 h-3.5" />
                                            </div>
                                            <div>
                                              <p className="text-[11px] font-bold text-slate-900 leading-relaxed">{c}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-4">
                                          <CheckCircle2 className="w-6 h-6" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-900">No Contradictions Detected</p>
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">Response logic is highly stable across all dimensions.</p>
                                      </div>
                                    )}
                                  </div>
                                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover/card:bg-blue-500/10 transition-colors" />
                                </div>
                              </div>

                              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <Info className="w-3 h-3" />
                                  Reasoning Summary
                                </h5>
                                <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed">
                                  <ReactMarkdown>{analysis.explanation}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6">
                              <p className="text-sm text-slate-400 italic">
                                Scan for conflicting answers between risk tolerance and financial goals.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Behavioral Bias Detection */}
                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                      <button 
                        onClick={() => setShowBiases(!showBiases)}
                        className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                            <BrainCircuit className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-sm font-bold text-slate-900 tracking-tight">Behavioral Bias Analysis</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Psychological Profiling</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Bias Detection</p>
                              <div className="text-[10px] text-slate-300 space-y-1">
                                <p className="font-bold text-white uppercase tracking-widest text-[9px]">Analyzed:</p>
                                <ul className="list-disc pl-3 space-y-0.5">
                                  <li>Expected return vs experience</li>
                                  <li>Reaction to drawdowns</li>
                                  <li>Loss history & Volatility comfort</li>
                                  <li>Derivative exposure</li>
                                </ul>
                              </div>
                            </div>
                          }>
                            <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                              <Sparkles className="w-3 h-3" />
                            </div>
                          </Tooltip>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showBiases ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {showBiases && (
                        <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                          {analyzingBiases ? (
                            <div className="space-y-4 py-2">
                              <div className="h-4 bg-slate-100 rounded-full w-3/4 animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-full animate-pulse" />
                              <div className="flex items-center gap-2 mt-6">
                                <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Analyzing biases...</span>
                              </div>
                            </div>
                          ) : biasesError ? (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800 text-xs">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <p>{biasesError}</p>
                            </div>
                          ) : behavioralBiases ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                  { label: 'Overconfidence', key: 'overconfidence', icon: ShieldCheck, color: 'blue' },
                                  { label: 'Loss Aversion', key: 'loss_aversion', icon: Activity, color: 'red' },
                                  { label: 'Unrealistic Return', key: 'unrealistic_expectation', icon: AlertCircle, color: 'amber' },
                                  { label: 'Recency Bias', key: 'recency_bias', icon: Search, color: 'violet' }
                                ].map((bias) => (
                                  <div key={bias.key} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:border-blue-200 group/card">
                                    <div className="flex items-center justify-between mb-4">
                                      <div className={`w-8 h-8 rounded-lg bg-${bias.color}-50 flex items-center justify-center text-${bias.color}-600 group-hover/card:scale-110 transition-transform`}>
                                        <bias.icon className="w-4 h-4" />
                                      </div>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${
                                        behavioralBiases[bias.key] === 'High' 
                                          ? 'bg-red-50 text-red-600 border-red-100' 
                                          : behavioralBiases[bias.key] === 'Medium'
                                          ? 'bg-amber-50 text-amber-600 border-amber-100'
                                          : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                      }`}>
                                        {behavioralBiases[bias.key]}
                                      </span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{bias.label}</p>
                                    <p className="text-xs font-bold text-slate-900">Likelihood</p>
                                  </div>
                                ))}
                              </div>

                              <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden group/card">
                                <div className="relative z-10">
                                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <BrainCircuit className="w-4 h-4 text-violet-400" />
                                    Dominant Behavioral Pattern
                                  </h5>
                                  <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed text-slate-200 font-medium">
                                    <ReactMarkdown>{behavioralBiases.dominant_behavioral_pattern}</ReactMarkdown>
                                  </div>
                                </div>
                                <div className="absolute -right-10 -top-10 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl group-hover/card:bg-violet-500/20 transition-colors" />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Probability-Based Risk Classification */}
                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                      <button 
                        onClick={() => setShowClassification(!showClassification)}
                        className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                            <ClipboardList className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-sm font-bold text-slate-900 tracking-tight">Risk Probability Model</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Multi-Class Classification</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Risk Probability Model</p>
                              <p className="text-[10px] text-slate-300">Analyzed: Using all questionnaire inputs and behavioral signals to predict probability distribution.</p>
                            </div>
                          }>
                            <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                              <Sparkles className="w-3 h-3" />
                            </div>
                          </Tooltip>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showClassification ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {showClassification && (
                        <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                          {analyzingClassification ? (
                            <div className="space-y-4 py-2">
                              <div className="h-4 bg-slate-100 rounded-full w-3/4 animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-full animate-pulse" />
                              <div className="flex items-center gap-2 mt-6">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Calculating probabilities...</span>
                              </div>
                            </div>
                          ) : classificationError ? (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800 text-xs">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <p>{classificationError}</p>
                            </div>
                          ) : riskClassification ? (
                            <div className="space-y-6">
                              {/* Probability Bars */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {Object.entries(riskClassification.probabilities).map(([band, prob]: [string, any]) => (
                                    <div key={band} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:border-blue-200 group/card">
                                      <div className="flex items-center justify-between mb-6">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{band}</p>
                                        <span className={`text-xl font-display font-bold ${band === riskClassification.predicted_risk_band ? 'text-emerald-600' : 'text-slate-400'}`}>
                                          {prob}%
                                        </span>
                                      </div>
                                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <motion.div 
                                          initial={{ width: 0 }}
                                          animate={{ width: `${prob}%` }}
                                          transition={{ duration: 1.5, ease: "easeOut" }}
                                          className={`h-full rounded-full ${
                                            band === riskClassification.predicted_risk_band 
                                              ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                              : 'bg-slate-300'
                                          }`}
                                        />
                                      </div>
                                      {band === riskClassification.predicted_risk_band && (
                                        <div className="mt-4 p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                                          <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest">Predicted Band</p>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                              {/* Prediction Summary */}
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-1 bg-slate-900 text-white rounded-[2rem] p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group/card">
                                  <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-8">
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Predicted Risk Band</p>
                                        <h3 className="text-4xl font-display font-bold text-emerald-400 tracking-tighter">{riskClassification.predicted_risk_band}</h3>
                                      </div>
                                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white border border-white/10 group-hover/card:scale-110 transition-transform">
                                        <Target className="w-6 h-6" />
                                      </div>
                                    </div>
                                    
                                    <div className="pt-6 border-t border-white/10">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Model Confidence</p>
                                      <div className="flex items-center gap-4">
                                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                          <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${riskClassification.confidence_level}%` }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="h-full bg-emerald-500 rounded-full" 
                                          />
                                        </div>
                                        <span className="text-xl font-display font-bold">{riskClassification.confidence_level}%</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl group-hover/card:bg-emerald-500/20 transition-colors" />
                                </div>
                                <div className="lg:col-span-2 bg-slate-50 border border-slate-100 rounded-[2rem] p-8 relative overflow-hidden group/card">
                                  <div className="relative z-10">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <Info className="w-4 h-4 text-blue-500" />
                                      Classification Logic
                                    </h5>
                                    <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed text-slate-600 font-medium">
                                      <ReactMarkdown>{riskClassification.explanation}</ReactMarkdown>
                                    </div>
                                  </div>
                                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover/card:bg-blue-500/10 transition-colors" />
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Behavioral Summary - Large Card */}
                      <div className="md:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <button 
                          onClick={() => setShowBehavioral(!showBehavioral)}
                          className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-600 group-hover:scale-110 transition-transform">
                              <Activity className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                              <h4 className="text-sm font-bold text-slate-900 tracking-tight">Behavioral Narrative</h4>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">AI Insights Summary</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Tooltip alignment="right" content={
                              <div className="text-left space-y-1">
                                <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">AI Behavioral Dossier</p>
                                <p className="text-[10px] text-slate-300">Generated by analyzing sentiment and patterns in questionnaire responses combined with financial capacity data.</p>
                              </div>
                            }>
                              <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                                <Sparkles className="w-3 h-3" />
                              </div>
                            </Tooltip>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showBehavioral ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        
                        {showBehavioral && (
                          <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative overflow-hidden group">
                              <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed prose-strong:text-slate-900 relative z-10">
                                <p className="text-slate-700 text-lg leading-relaxed font-medium italic">
                                  "{data.ai_behavior_summary.split('[')[0].trim()}"
                                </p>
                              </div>
                              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl group-hover:bg-violet-500/10 transition-colors" />
                            </div>
                          </div>
                        )}
                        {/* Subtle background glow */}
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-violet-100/50 rounded-full blur-2xl pointer-events-none"></div>
                      </div>

                      {/* Reliability Score Card */}
                      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all hover:shadow-md">
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2 text-slate-400">
                              <BrainCircuit className="w-5 h-5" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Reliability Index</span>
                            </div>
                            <Tooltip alignment="right" content={
                              <div className="text-left space-y-1">
                                <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">AI Confidence Index</p>
                                <p className="text-[10px] text-slate-300">Calculated based on response stability, logical consistency, and data point depth.</p>
                              </div>
                            }>
                              <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                                <Sparkles className="w-3 h-3" />
                              </div>
                            </Tooltip>
                          </div>
                          
                          <div className="mb-6">
                            <div className="flex items-baseline gap-1">
                              <p className="text-5xl font-display font-bold text-slate-900 tracking-tighter">
                                {data.ai_confidence_score <= 1 
                                  ? Math.round(data.ai_confidence_score * 100) 
                                  : Math.round(data.ai_confidence_score)}
                              </p>
                              <p className="text-xl font-display font-bold text-slate-300">%</p>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">AI Confidence Score</p>
                          </div>

                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${data.ai_confidence_score <= 1 ? data.ai_confidence_score * 100 : data.ai_confidence_score}%` }}
                              transition={{ duration: 1.5, ease: "easeOut" }}
                              className={`h-full rounded-full ${
                                (data.ai_confidence_score <= 1 ? data.ai_confidence_score * 100 : data.ai_confidence_score) >= 65 
                                  ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                  : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                              }`} 
                            />
                          </div>
                        </div>
                        <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-slate-50 rounded-full blur-3xl group-hover:bg-slate-100 transition-colors" />
                      </div>
                    </div>
                  </div>

                  {/* SECTION: ADVISOR FINALIZATION */}
                  <div className="space-y-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-6 bg-blue-600 rounded-full" />
                      <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight">Advisor Finalization</h3>
                    </div>

                    {!data.finalized_by_advisor ? (
                      <div className="bg-slate-900 p-8 md:p-10 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30">
                              <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-lg font-display font-bold tracking-tight">Advisor Confirmation</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Step Required</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                              <label onClick={() => setOverrideMode(false)} className={`flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer group/label ${!overrideMode ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:bg-white/5'}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${!overrideMode ? 'border-blue-400 bg-blue-400' : 'border-slate-600'}`}>
                                  {!overrideMode && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-bold">Confirm Calculated Profile</p>
                                  <p className="text-[10px] text-slate-400 font-medium">Use AI-recommended classification</p>
                                </div>
                              </label>

                              <label onClick={() => setOverrideMode(true)} className={`flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer group/label ${overrideMode ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:bg-white/5'}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${overrideMode ? 'border-blue-400 bg-blue-400' : 'border-slate-600'}`}>
                                  {overrideMode && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-bold">Override Classification</p>
                                  <p className="text-[10px] text-slate-400 font-medium">Manually adjust risk category</p>
                                </div>
                              </label>

                              {overrideMode && (
                                <motion.div 
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-4 pt-2"
                                >
                                  <select 
                                    value={overrideCategory}
                                    onChange={(e) => setOverrideCategory(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                  >
                                    <option value="Conservative" className="text-slate-900">Conservative</option>
                                    <option value="Moderate" className="text-slate-900">Moderate</option>
                                    <option value="Aggressive" className="text-slate-900">Aggressive</option>
                                  </select>
                                  <textarea 
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    placeholder="Provide clinical reasoning for override..."
                                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px] resize-none"
                                  />
                                </motion.div>
                              )}
                            </div>

                            <div className="flex flex-col justify-end gap-4">
                              <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                                  By finalizing, you confirm that you have reviewed the AI-generated insights and behavioral narrative, and that the selected risk category is appropriate for the client's financial situation and goals.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3">
                                  <button 
                                    onClick={handleFinalize}
                                    disabled={finalizing || (overrideMode && !overrideReason.trim())}
                                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-500 transition-all disabled:opacity-50 shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2 group/btn"
                                  >
                                    {finalizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />}
                                    Finalize Profile
                                  </button>
                                  <button 
                                    onClick={() => setShowRejectConfirm(true)}
                                    disabled={finalizing}
                                    className="px-6 py-4 rounded-2xl border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white font-bold transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-600/10 rounded-full blur-[100px] group-hover:bg-blue-600/20 transition-colors" />
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                            <Check className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-emerald-900 font-bold">Profile Finalized</h4>
                            <p className="text-emerald-700 text-sm">This risk profile has been confirmed and is now active.</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Finalized On</p>
                          <p className="text-sm font-bold text-emerald-900">{new Date(data.finalized_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: IPS EDITOR */}
              {activeTab === 'ips' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {ipsDocument ? (
                    <div className="space-y-6">
                      <IPSEditor 
                        ips={ipsDocument} 
                        client={client} 
                        onSave={handleSaveIPS} 
                        onAccept={handleAcceptIPS}
                        viewerRole="advisor"
                      />
                      
                      {portfolioError && (
                        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-bold text-sm">Portfolio Construction Failed</h4>
                            <p className="text-sm">{portfolioError}</p>
                          </div>
                        </div>
                      )}

                      {ipsDocument.status === 'Active' && !portfolio && (
                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl flex items-center justify-between">
                          <div>
                            <h4 className="text-emerald-900 font-bold">IPS is Active</h4>
                            <p className="text-emerald-700 text-sm">You can now build the initial portfolio for this client.</p>
                          </div>
                          <button
                            onClick={handleBuildPortfolio}
                            disabled={buildingPortfolio}
                            className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                          >
                            {buildingPortfolio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                            Build Portfolio
                          </button>
                        </div>
                      )}

                      {portfolio && (
                        <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl flex items-center justify-between">
                          <div>
                            <h4 className="text-blue-900 font-bold">Portfolio Built</h4>
                            <p className="text-blue-700 text-sm">
                              Status: <span className="font-bold">{portfolio.approval_status}</span>
                              {portfolio.approval_status === 'Pending' ? ' (Waiting for Investor Approval)' : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-blue-600 font-medium text-sm">
                            <Check className="w-4 h-4" />
                            Constructed
                          </div>
                        </div>
                      )}
                    </div>
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

              {/* TAB: PORTFOLIO */}
              {activeTab === 'portfolio' && portfolio && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <PortfolioEditor 
                    portfolio={portfolio} 
                    onSave={handleSavePortfolio}
                    viewerRole="advisor"
                    client={client}
                  />
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
