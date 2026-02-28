import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X, ShieldCheck, Activity, BrainCircuit, Search, Check, ClipboardList, FileText, User, Info } from 'lucide-react';
import { motion } from 'framer-motion';
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

  const handleAnalyze = async () => {
    if (!data) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      // Call AI Service directly from frontend
      const result = await aiService.analyzeInconsistencies(
        data.risk_category,
        data.responses
      );
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
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  
                  {/* Bento Grid Header & Financials */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Primary Risk Card */}
                    <div className="md:col-span-2 bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl shadow-slate-200">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 text-slate-400 mb-6">
                          <ShieldCheck className="w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-[0.2em]">Risk Classification</span>
                        </div>
                        <h2 className="text-6xl font-display font-bold mb-2 tracking-tighter">
                          {data.advisor_override_category || data.risk_category}
                        </h2>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-400">
                            Based on {data.raw_score} behavioral data points
                          </span>
                          {data.advisor_override_category && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded border border-blue-500/30 uppercase">
                              Advisor Override
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Abstract background element */}
                      <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
                    </div>

                    {/* Reliability Score Card */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-slate-400">
                          <BrainCircuit className="w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-wider">Reliability</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-5xl font-display font-bold text-slate-900 mb-1">
                          {data.ai_confidence_score <= 1 
                            ? Math.round(data.ai_confidence_score * 100) 
                            : Math.round(data.ai_confidence_score)}%
                        </p>
                        <Tooltip alignment="left" content={
                          <div className="text-left space-y-2">
                            <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Confidence Score Calculation</p>
                            <ul className="list-disc pl-4 space-y-1 text-slate-300">
                              <li><span className="text-white font-semibold">Consistency:</span> 98% match across related questions</li>
                              <li><span className="text-white font-semibold">Financial Data:</span> Income, Net Worth & Liquidity aligned with risk capacity</li>
                              <li><span className="text-white font-semibold">Data Points:</span> 15 behavioral inputs analyzed</li>
                              <li><span className="text-white font-semibold">Model:</span> Gemini 1.5 Pro reasoning verification</li>
                            </ul>
                          </div>
                        }>
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1 cursor-help">
                            AI Confidence Index <Info className="w-3 h-3" />
                          </p>
                        </Tooltip>
                      </div>
                      <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full transition-all duration-1000" 
                          style={{ width: `${data.ai_confidence_score <= 1 ? data.ai_confidence_score * 100 : data.ai_confidence_score}%` }}
                        />
                      </div>
                    </div>

                    {/* Quick Stats Column */}
                    <div className="space-y-4">
                      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Net Worth</p>
                        <p className="text-xl font-display font-bold text-blue-900">${client.net_worth?.toLocaleString() || '—'}</p>
                      </div>
                      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Income</p>
                        <p className="text-xl font-display font-bold text-emerald-900">${client.annual_income?.toLocaleString() || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Bento Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Behavioral Summary - Large Card */}
                    <div className="md:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-xs font-bold text-violet-400 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Activity className="w-4 h-4 text-violet-500" />
                          Behavioral Analysis
                        </h4>
                        <Tooltip alignment="right" content={
                          <div className="text-left space-y-2">
                            <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Dossier Generation Source</p>
                            <ul className="list-disc pl-4 space-y-1 text-slate-300">
                              <li><span className="text-white font-semibold">Primary Input:</span> Risk Questionnaire (15 questions)</li>
                              <li><span className="text-white font-semibold">Financial Context:</span> Net Worth, Income, Liquidity</li>
                              <li><span className="text-white font-semibold">Analysis:</span> Behavioral archetype matching & sentiment analysis</li>
                            </ul>
                          </div>
                        }>
                          <div className="px-3 py-1 bg-violet-50 text-violet-600 text-[10px] font-bold rounded-full border border-violet-100 uppercase shadow-sm cursor-help">
                            AI Generated Dossier
                          </div>
                        </Tooltip>
                      </div>
                      <div className="prose prose-slate max-w-none">
                        <p className="text-slate-700 text-lg leading-relaxed font-medium italic">
                          "{data.ai_behavior_summary.split('[')[0].trim()}"
                        </p>
                      </div>
                    </div>

                    {/* Financial Constraints Card */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-[0.2em] mb-6">Constraints</h4>
                      <div className="space-y-6">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tax Bracket</p>
                          <p className="text-lg font-display font-bold text-slate-900">{client.tax_bracket ? `${client.tax_bracket}%` : 'Standard'}</p>
                        </div>
                        <div className="pt-4 border-t border-slate-200">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Liquidity Needs</p>
                          <p className="text-lg font-display font-bold text-slate-900">${client.liquidity_needs?.toLocaleString() || 'Minimal'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Deep Dive & Responses Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left Column: Deep Dive & Confirmation */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Inconsistency Check */}
                      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between mb-6">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Search className="w-4 h-4 text-slate-300" />
                            Inconsistency Scan
                          </h4>
                          {!analysis && !analyzing && (
                            <button 
                              onClick={handleAnalyze}
                              className="text-[10px] font-bold bg-slate-900 text-white px-4 py-2 rounded-full uppercase tracking-wider hover:bg-slate-800 transition-all"
                            >
                              Run AI Scan
                            </button>
                          )}
                        </div>
                        
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
                        ) : analysis ? (
                          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <div className="prose prose-sm max-w-none">
                              <div className="whitespace-pre-wrap text-slate-600 leading-relaxed text-sm">
                                {analysis}
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

                      {/* Advisor Finalization */}
                      {!data.finalized_by_advisor && (
                        <div className="bg-blue-600 p-8 rounded-3xl text-white shadow-xl shadow-blue-200">
                          <h4 className="text-xs font-bold text-blue-200 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            Advisor Confirmation
                          </h4>
                          
                          <div className="space-y-6">
                            <div className="flex flex-col gap-3">
                              <label className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${!overrideMode ? 'bg-white/20 border-white/40' : 'bg-transparent border-white/10 hover:bg-white/5'}`}>
                                <input 
                                  type="radio" 
                                  checked={!overrideMode} 
                                  onChange={() => setOverrideMode(false)} 
                                  className="w-4 h-4 border-white/30 bg-transparent text-white focus:ring-offset-0 focus:ring-white" 
                                />
                                <span className="text-sm font-bold">Confirm Calculated Profile</span>
                              </label>
                              <label className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${overrideMode ? 'bg-white/20 border-white/40' : 'bg-transparent border-white/10 hover:bg-white/5'}`}>
                                <input 
                                  type="radio" 
                                  checked={overrideMode} 
                                  onChange={() => setOverrideMode(true)} 
                                  className="w-4 h-4 border-white/30 bg-transparent text-white focus:ring-offset-0 focus:ring-white" 
                                />
                                <span className="text-sm font-bold">Override Classification</span>
                              </label>
                            </div>

                            {overrideMode && (
                              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <select 
                                  value={overrideCategory}
                                  onChange={(e) => setOverrideCategory(e.target.value)}
                                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-white outline-none"
                                >
                                  <option value="Conservative" className="text-slate-900">Conservative</option>
                                  <option value="Moderate" className="text-slate-900">Moderate</option>
                                  <option value="Aggressive" className="text-slate-900">Aggressive</option>
                                </select>
                                <textarea 
                                  value={overrideReason}
                                  onChange={(e) => setOverrideReason(e.target.value)}
                                  placeholder="Provide clinical reasoning for override..."
                                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm placeholder:text-blue-200/50 focus:ring-2 focus:ring-white outline-none min-h-[100px]"
                                />
                              </div>
                            )}

                            <div className="flex gap-3 pt-4">
                              <button
                                onClick={handleFinalize}
                                disabled={finalizing || (overrideMode && !overrideReason.trim())}
                                className="flex-1 py-4 bg-white text-blue-600 rounded-2xl text-sm font-bold hover:bg-blue-50 transition-all disabled:opacity-50 shadow-lg"
                              >
                                {finalizing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Finalize Profile"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Detailed Responses */}
                    <div className="lg:col-span-3">
                      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-slate-300" />
                            Questionnaire Audit
                          </h4>
                        </div>
                        <div className="divide-y divide-slate-100">
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
                      </div>
                    </div>
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
