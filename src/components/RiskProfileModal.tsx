import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X, ShieldCheck, Activity, BrainCircuit, Search, Check, ClipboardList, FileText, User, Info, ChevronDown, Sparkles, TrendingUp, Heart, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Client, IPSDocument, TargetAllocation, AIModel, DriftEvent } from '../types';
import IPSEditor from './IPSEditor';
import PortfolioEditor from './PortfolioEditor';
import { aiService } from '../services/aiService';
import { ALLOCATION_MODELS, RiskCategory } from '../constants/allocationModels';
import Tooltip from './Tooltip';
import AIModelSelector from './AIModelSelector';
import { useAIModel } from '../hooks/useAIModel';
import DriftAlert, { DriftDetailsModal } from './DriftAlert';

const AIErrorDisplay = ({ error, onRetry }: { error: string, onRetry?: () => void }) => {
  let title = "Analysis Unavailable";
  let message = "An unexpected error occurred during the analysis. Please try again.";
  
  try {
    // Try to parse if it's a JSON string
    if (error && error.trim().startsWith('{')) {
      const parsed = JSON.parse(error);
      if (parsed.error) {
         if (parsed.error.code === 429 || parsed.error.status === "RESOURCE_EXHAUSTED") {
            title = "System Capacity Reached";
            message = "We are currently experiencing high demand for our AI models. Please wait a moment and try again.";
         } else {
            message = parsed.error.message || "An error returned from the AI service.";
         }
      }
    } else if (error) {
       // Check for common text patterns if not JSON
       if (error.includes("429") || error.includes("quota") || error.includes("RESOURCE_EXHAUSTED")) {
          title = "System Capacity Reached";
          message = "We are currently experiencing high demand for our AI models. Please wait a moment and try again.";
       } else {
          message = error;
       }
    }
  } catch (e) {
    message = error;
  }

  return (
    <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col items-center text-center gap-3 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-1">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div>
        <h5 className="text-sm font-bold text-slate-900">{title}</h5>
        <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="mt-2 px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all active:scale-95 uppercase tracking-wider"
        >
          Retry Analysis
        </button>
      )}
    </div>
  );
};

/**
 * Props for the RiskProfileModal component.
 */
interface RiskProfileModalProps {
  /** The client object whose risk profile is being managed. */
  client: Client;
  /** Callback function to close the modal. */
  onClose: () => void;
  /** Optional callback function to be executed on successful completion of a profile action. */
  onSuccess?: () => void;
}

const MissingDataModal = ({ description, onClose, onSubmit }: { description: string, onClose: () => void, onSubmit: (data: string) => void }) => {
  const [input, setInput] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h4 className="text-lg font-bold text-slate-900 mb-2">Incomplete Data</h4>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        <textarea 
          className="w-full p-3 border border-slate-200 rounded-lg text-sm mb-4"
          rows={4}
          placeholder="Enter missing information..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={() => onSubmit(input)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Submit</button>
        </div>
      </div>
    </div>
  );
};

/**
 * RiskProfileModal component provides a multi-tabbed interface for advisors to manage a client's risk profile.
 * It includes tabs for viewing/analyzing the risk profile, drafting/finalizing the Investment Policy Statement (IPS),
 * and constructing/managing the client's portfolio. It leverages AI services for deep analysis and document generation.
 * 
 * @param props - The component props.
 * @returns A JSX element representing the risk profile modal.
 */
export default function RiskProfileModal({ client, onClose, onSuccess }: RiskProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'ips' | 'portfolio'>('profile');
  
  const [data, setData] = useState<any>(null);

  const getDependentsCount = () => {
    if (client.dependents !== null && client.dependents !== undefined) {
      return client.dependents;
    }
    if (!data?.responses) return '—';
    
    const dependentResponse = data.responses.find((r: any) => {
      const qText = (r.risk_questions?.question_text || r.question_text || '').toLowerCase();
      return qText.includes('dependent') || qText.includes('rely on your income');
    });
    
    if (dependentResponse) {
      const optionText = (dependentResponse.risk_answer_options?.option_text || dependentResponse.option_text || '');
      const match = optionText.match(/\d+/);
      if (match) return parseInt(match[0]);
      if (optionText.toLowerCase().includes('none') || optionText.toLowerCase() === '0') return 0;
    }
    
    return '—';
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<{
    stability_flag: string;
    contradictions_detected: string[];
    explanation: string;
  } | null>(null);
  const [dualScoring, setDualScoring] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingDual, setAnalyzingDual] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [dualError, setDualError] = useState<string | null>(null);

  const [overrideMode, setOverrideMode] = useState<boolean>(false);
  const [overrideCategory, setOverrideCategory] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [finalizing, setFinalizing] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showDualScoring, setShowDualScoring] = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);
  const [showBiasAnalysis, setShowBiasAnalysis] = useState(true);
  const [analyzingBiases, setAnalyzingBiases] = useState(false);
  const [biasError, setBiasError] = useState<string | null>(null);
  const [biasAnalysis, setBiasAnalysis] = useState<{
    biases: { bias_name: string; likelihood: string; description: string }[];
    dominant_pattern: string;
  } | null>(null);
  
  const [generatingIPS, setGeneratingIPS] = useState(false);
  const [ipsError, setIpsError] = useState<string | null>(null);
  const [ipsDocument, setIpsDocument] = useState<(IPSDocument & { target_allocations: TargetAllocation[] }) | null>(null);
  const [ipsVersions, setIpsVersions] = useState<(IPSDocument & { target_allocations: TargetAllocation[] })[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [buildingPortfolio, setBuildingPortfolio] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [driftEvents, setDriftEvents] = useState<DriftEvent[]>([]);
  const [selectedDriftEvent, setSelectedDriftEvent] = useState<DriftEvent | null>(null);
  const [missingDataInfo, setMissingDataInfo] = useState<{description: string} | null>(null);
  const { model: selectedModel, updateModel: setSelectedModel } = useAIModel();

  useEffect(() => {
    if (client) {
      // Fetch IPS versions
      fetch(`/api/ips/client/${client.id}/versions`)
        .then(res => res.json())
        .then(json => {
          if (json.status === 'ok' && json.data && json.data.length > 0) {
            setIpsVersions(json.data);
            setIpsDocument(json.data[0]); // Latest version
          } else {
            setIpsVersions([]);
            setIpsDocument(null);
          }
        })
        .catch(() => {});
        
      // Fetch portfolio
      fetch(`/api/portfolios/client/${client.id}`)
        .then(res => res.json())
        .then(json => {
          if (json.status === 'ok' && json.data) {
            setPortfolio(json.data);
          } else {
            setPortfolio(null);
          }
        })
        .catch(() => {});

      // Fetch drift events
      fetch(`/api/drift/pending/${client.id}`)
        .then(res => res.json())
        .then(json => {
          if (json.status === 'ok') {
            setDriftEvents(json.data);
          }
        })
        .catch(() => {});
    }
  }, [client]);


  const handleAnalyze = async (assessmentData?: any, force: boolean = false) => {
    const targetData = assessmentData || data;
    if (!targetData) return;
    
    // If we already have analysis in the data, use it
    if (!force && targetData.consistency_analysis && !analyzing) {
      setAnalysis(targetData.consistency_analysis);
      setShowConsistency(true);
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    setShowConsistency(true);
    try {
      // Call AI Service directly from frontend
      const result = await aiService.analyzeInconsistencies(
        targetData.risk_category,
        targetData.responses,
        client,
        selectedModel
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
        
      }
    } catch (err: any) {
      
      setAnalysisError(err.message || 'Network error occurred during AI analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDualScoring = async (assessmentData?: any, force: boolean = false) => {
    const targetData = assessmentData || data;
    if (!targetData) return;

    if (!force && targetData.dual_scoring_analysis && !analyzingDual) {
      setDualScoring(targetData.dual_scoring_analysis);
      setShowDualScoring(true);
      return;
    }

    setAnalyzingDual(true);
    setDualError(null);
    setShowDualScoring(true);
    try {
      const response = await fetch(`/api/assessments/${targetData.id}/deterministic-scoring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to calculate deterministic score');
      }
      
      const resultData = await response.json();
      if (resultData.status === 'error') {
        throw new Error(resultData.message);
      }
      
      setDualScoring(resultData.data);
    } catch (err: any) {
      
      setDualError(err.message || 'Network error occurred during deterministic scoring');
    } finally {
      setAnalyzingDual(false);
    }
  };

  const handleAnalyzeBiases = async (assessmentData?: any, force: boolean = false) => {
    const targetData = assessmentData || data;
    if (!targetData) return;

    if (!force && targetData.behavioral_bias_analysis && !analyzingBiases) {
      setBiasAnalysis(targetData.behavioral_bias_analysis);
      setShowBiasAnalysis(true);
      return;
    }

    setAnalyzingBiases(true);
    setBiasError(null);
    setShowBiasAnalysis(true);
    try {
      const result = await aiService.analyzeBehavioralBiases(
        targetData.responses,
        client,
        selectedModel
      );
      setBiasAnalysis(result);

      // Save the analysis back to the database
      try {
        await fetch(`/api/assessments/${targetData.id}/behavioral-bias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: result })
        });
      } catch (saveErr) {
        console.error("Failed to save behavioral bias analysis:", saveErr);
      }
    } catch (err: any) {
      setBiasError(err.message || 'Network error occurred during behavioral bias analysis');
    } finally {
      setAnalyzingBiases(false);
    }
  };


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let fetchedProfileData = null;
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
          fetchedProfileData = jsonProfile.data;
          
          if (jsonProfile.data.behavioral_bias_analysis) {
            setBiasAnalysis(jsonProfile.data.behavioral_bias_analysis);
          }
          if (jsonProfile.data.consistency_analysis) {
            setAnalysis(jsonProfile.data.consistency_analysis);
          }
          if (jsonProfile.data.dual_scoring_analysis) {
            setDualScoring(jsonProfile.data.dual_scoring_analysis);
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
      
    } finally {
      setFinalizing(false);
      setShowRejectConfirm(false);
    }
  };

  const handleGenerateIPS = async (existingIpsId?: string) => {
    if (!data) return;
    setGeneratingIPS(true);
    setIpsError(null);
    try {
      const riskCategory = data.risk_category as RiskCategory;
      const model = ALLOCATION_MODELS[riskCategory];
      if (!model) {
        throw new Error(`Invalid risk category: ${riskCategory}`);
      }

      // 2. Determine Time Horizon from Responses
      let timeHorizon = 5; // Default
      const horizonResponse = data.responses?.find((r: any) => 
        (r.risk_questions?.question_text || '').toLowerCase().includes('what is your primary investment horizon')
      );

      if (horizonResponse) {
        const text = horizonResponse.risk_answer_options?.option_text || '';
        // Match ranges like "7-12", "7 to 12", "7–12"
        const rangeMatch = text.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1]);
          const max = parseInt(rangeMatch[2]);
          // User requested years between the range (e.g., 8,9,10,11,12 for 7-12)
          // We pick a random one in that specific sub-range
          const rangeSize = max - min;
          timeHorizon = Math.floor(Math.random() * rangeSize) + min + 1;
        } else {
          // Match single numbers
          const match = text.match(/(\d+)/);
          if (match) {
            timeHorizon = parseInt(match[1]);
          }
        }
      }

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
        data.responses || [],
        selectedModel
      );

      // 4. Save to Backend
      const res = await fetch('/api/ips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          risk_assessment_id: data.id,
          existing_ips_id: existingIpsId,
          ips_data: {
            risk_category: riskCategory,
            investment_objective: aiResponse.investment_objective,
            time_horizon_years: timeHorizon,
            liquidity_needs: client.liquidity_needs || 0,
            tax_considerations: client.tax_bracket || 0,
            rebalancing_frequency: aiResponse.rebalancing_frequency || model.Rebalance,
            rebalancing_band_percent: aiResponse.rebalancing_band_percent || 5,
            rebalancing_strategy_description: aiResponse.rebalancing_strategy_description.replace(/\d+%/g, `${aiResponse.rebalancing_band_percent}%`),
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
        // Refresh versions
        fetch(`/api/ips/client/${client.id}/versions`)
          .then(res => res.json())
          .then(vJson => {
            if (vJson.status === 'ok' && vJson.data) {
              setIpsVersions(vJson.data);
            }
          })
          .catch(() => {});
      } else {
        setIpsError(json.message || 'Failed to save IPS');
      }
    } catch (err: any) {
      
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
      const newIps = { ...ipsDocument, ...json.data, target_allocations: updatedIps.allocations };
      setIpsDocument(newIps);
      setIpsVersions(prev => prev.map(v => v.id === newIps.id ? newIps : v));
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
        const newIps = data.data;
        setIpsDocument(newIps);
        setIpsVersions(prev => prev.map(v => v.id === newIps.id ? newIps : v));
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
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: aiService.getModel() })
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

  const isEligibleForIPS = data && data.finalized_by_advisor;



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
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <AIModelSelector
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                className="w-56"
              />
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
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
            {missingDataInfo && (
            <MissingDataModal 
              description={missingDataInfo.description} 
              onClose={() => setMissingDataInfo(null)} 
              onSubmit={(input) => {
                
                setMissingDataInfo(null);
                // Here we could trigger a re-analysis with the new data
              }}
            />
          )}
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
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Risk Classification</span>
                              <Tooltip alignment="left" content={
                                <div className="text-left space-y-1">
                                  <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Risk Profile Analysis</p>
                                  <div className="text-[10px] text-slate-300 space-y-2">
                                    <p>The system determines the optimal risk category by synthesizing multiple data dimensions:</p>
                                    <ul className="list-disc pl-3 space-y-1">
                                      <li><span className="text-white font-semibold">Willingness:</span> Psychological comfort with volatility from behavioral questions.</li>
                                      <li><span className="text-white font-semibold">Ability:</span> Financial capacity based on Net Worth, Income, and Time Horizon.</li>
                                      <li><span className="text-white font-semibold">Context:</span> Age, dependents, and stated financial goals.</li>
                                    </ul>
                                  </div>
                                </div>
                              }>
                                <div className="p-1 bg-white/10 text-slate-400 rounded border border-white/10 cursor-help hover:text-white transition-colors">
                                  <Info className="w-3 h-3" />
                                </div>
                              </Tooltip>
                            </div>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-blue-200 transition-colors">
                          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-2">Net Worth</p>
                          <p className="text-2xl font-display font-bold text-slate-900 group-hover:text-blue-600 transition-colors">${client.net_worth?.toLocaleString() || '—'}</p>
                        </div>
                        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-emerald-200 transition-colors">
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Income</p>
                          <p className="text-2xl font-display font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">${client.annual_income?.toLocaleString() || '—'}</p>
                        </div>
                        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-indigo-200 transition-colors">
                          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2">Age</p>
                          <p className="text-2xl font-display font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {client.dob ? (new Date().getFullYear() - new Date(client.dob).getFullYear()) : '—'}
                          </p>
                        </div>
                        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-center group hover:border-violet-200 transition-colors">
                          <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-2">Dependents</p>
                          <p className="text-2xl font-display font-bold text-slate-900 group-hover:text-violet-600 transition-colors">{getDependentsCount()}</p>
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

                  {/* SECTION: ADVANCED ANALYSIS & INSIGHTS */}
                  <div className="space-y-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-6 bg-violet-600 rounded-full" />
                        <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight">Advanced Analysis & Insights</h3>
                      </div>
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
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Deterministic Dual Scoring Model</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {!dualScoring && !analyzingDual && (
                            <div
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDualScoring();
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-violet-700 transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              Run Analysis
                            </div>
                          )}
                          {dualScoring && !analyzingDual && (
                            <div
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDualScoring(undefined, true);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Activity className="w-3 h-3" />
                              Re-run
                            </div>
                          )}
                          {analyzingDual && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Analyzing...
                            </div>
                          )}
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Dual Scoring Analysis Logic</p>
                              <div className="text-[10px] text-slate-300 space-y-2">
                                <p>This analysis evaluates the divergence between financial reality and psychological preference using:</p>
                                <div>
                                  <p className="font-bold text-white uppercase tracking-widest text-[9px] mb-0.5">Capacity Data (Ability):</p>
                                  <ul className="list-disc pl-3 space-y-0.5">
                                    <li>Client Profile (Age, Dependents)</li>
                                    <li>Financials (Net Worth, Annual Income)</li>
                                    <li>Liquidity Needs & Tax Bracket</li>
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-bold text-white uppercase tracking-widest text-[9px] mb-0.5">Tolerance Data (Willingness):</p>
                                  <ul className="list-disc pl-3 space-y-0.5">
                                    <li>Behavioral Questionnaire Responses</li>
                                    <li>Risk vs Reward Trade-off Preferences</li>
                                    <li>Historical Market Reaction Patterns</li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                          }>
                            <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                              <Info className="w-3 h-3" />
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
                            <AIErrorDisplay error={dualError} onRetry={handleDualScoring} />
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
                          {!analysis && !analyzing && (
                            <div
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAnalyze();
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              Run Scan
                            </div>
                          )}
                          {analysis && !analyzing && (
                            <div
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAnalyze(undefined, true);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Search className="w-3 h-3" />
                              Re-scan
                            </div>
                          )}
                          {analyzing && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-wider animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Scanning...
                            </div>
                          )}
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Consistency Scan Logic</p>
                              <div className="text-[10px] text-slate-300 space-y-1">
                                <p className="font-bold text-white uppercase tracking-widest text-[9px]">Data Points Analyzed:</p>
                                <ul className="list-disc pl-3 space-y-0.5">
                                  <li>Cross-referencing all 15+ Behavioral Responses</li>
                                  <li>Alignment of Time Horizon with Risk Appetite</li>
                                  <li>Consistency between Income Stability & Loss Tolerance</li>
                                  <li>Validation of Stated Goals vs. Selected Risk Level</li>
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
                                onClick={() => handleAnalyze(undefined, true)}
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
                            <AIErrorDisplay error={analysisError} onRetry={handleAnalyze} />
                          ) : analysis ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center group/card transition-all hover:border-blue-200">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Stability Status</p>
                                  <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                                    <Activity className="w-8 h-8" />
                                  </div>
                                  <p className={`text-sm font-bold uppercase tracking-widest ${
                                    analysis.stability_flag === 'Stable' ? 'text-emerald-600' : 
                                    analysis.stability_flag === 'Slightly Inconsistent' ? 'text-amber-600' : 'text-red-600'
                                  }`}>
                                    {analysis.stability_flag}
                                  </p>
                                </div>

                                <div className="md:col-span-2 bg-slate-50 rounded-2xl p-6 border border-slate-100 relative overflow-hidden group/card">
                                  <div className="relative z-10">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <AlertTriangle className="w-3 h-3" />
                                      Detected Contradictions
                                    </h5>
                                    {analysis?.contradictions_detected && analysis.contradictions_detected.length > 0 ? (
                                      <div className="space-y-3">
                                        {analysis.contradictions_detected?.map((c: string, idx: number) => (
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

                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                      <button 
                        onClick={() => setShowBiasAnalysis(!showBiasAnalysis)}
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
                          <div
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyzeBiases(undefined, true);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 transition-all shadow-sm active:scale-95 cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                            {biasAnalysis ? 'Re-run' : 'Run Analysis'}
                          </div>
                          <Tooltip alignment="right" content={
                            <div className="text-left space-y-1">
                              <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Behavioral Bias Analysis Logic</p>
                              <div className="text-[10px] text-slate-300 space-y-2">
                                <p>Detects psychological patterns in questionnaire responses that may lead to irrational decisions:</p>
                                <ul className="list-disc pl-3 space-y-1">
                                  <li><span className="text-white font-semibold">Loss Aversion:</span> Over-weighting potential losses vs gains.</li>
                                  <li><span className="text-white font-semibold">Recency Bias:</span> Over-emphasizing recent market events.</li>
                                  <li><span className="text-white font-semibold">Overconfidence:</span> Misjudging personal risk-taking ability.</li>
                                </ul>
                              </div>
                            </div>
                          }>
                            <div className="p-1 bg-violet-50 text-violet-600 rounded border border-violet-100 shadow-sm cursor-help">
                              <Sparkles className="w-3 h-3" />
                            </div>
                          </Tooltip>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showBiasAnalysis ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {showBiasAnalysis && (
                        <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                          {analyzingBiases ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                              {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-32 bg-slate-50 rounded-2xl animate-pulse border border-slate-100" />
                              ))}
                            </div>
                          ) : biasError ? (
                            <AIErrorDisplay error={biasError} onRetry={() => handleAnalyzeBiases(undefined, true)} />
                          ) : biasAnalysis?.biases ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {biasAnalysis.biases?.map((bias, idx) => (
                                  <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:border-violet-200 group/bias">
                                    <div className="flex items-center justify-between mb-4">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                        bias.bias_name === 'OVERCONFIDENCE' ? 'bg-blue-50 text-blue-600' :
                                        bias.bias_name === 'LOSS AVERSION' ? 'bg-rose-50 text-rose-600' :
                                        bias.bias_name === 'UNREALISTIC RETURN' ? 'bg-amber-50 text-amber-600' :
                                        'bg-violet-50 text-violet-600'
                                      }`}>
                                        {bias.bias_name === 'OVERCONFIDENCE' && <ShieldCheck className="w-4 h-4" />}
                                        {bias.bias_name === 'LOSS AVERSION' && <Activity className="w-4 h-4" />}
                                        {bias.bias_name === 'UNREALISTIC RETURN' && <AlertTriangle className="w-4 h-4" />}
                                        {bias.bias_name === 'RECENCY BIAS' && <Search className="w-4 h-4" />}
                                      </div>
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                        bias.likelihood === 'HIGH' ? 'bg-red-50 text-red-600 border border-red-100' :
                                        bias.likelihood === 'MEDIUM' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                        'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                      }`}>
                                        {bias.likelihood}
                                      </span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{bias.bias_name}</p>
                                    
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                      <p className="text-xs text-slate-600 leading-relaxed">{bias.description}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden group">
                                <div className="relative z-10">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Sparkles className="w-4 h-4 text-violet-400" />
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dominant Behavioral Pattern</h5>
                                  </div>
                                  <p className="text-sm font-medium leading-relaxed text-slate-200">
                                    {biasAnalysis.dominant_pattern}
                                  </p>
                                </div>
                                <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <BrainCircuit className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                              <p className="text-sm text-slate-500 font-medium">No behavioral analysis data available.</p>
                              <button 
                                onClick={() => handleAnalyzeBiases()}
                                className="mt-4 px-6 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                              >
                                Run Psychological Profiling
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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
                              <label 
                                onClick={() => setOverrideMode(false)} 
                                className={`flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer group/label ${!overrideMode ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                              >
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
                                    <option value="Moderately Conservative" className="text-slate-900">Moderately Conservative</option>
                                    <option value="Moderate" className="text-slate-900">Moderate</option>
                                    <option value="Moderately Aggressive" className="text-slate-900">Moderately Aggressive</option>
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
                                  By finalizing, you confirm that you have reviewed the AI-generated insights and that the selected risk category is appropriate for the client's financial situation and goals.
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
                      <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                        <div className="flex items-start sm:items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200 shrink-0">
                            <Check className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-emerald-900 font-bold">Profile Finalized</h4>
                            <p className="text-emerald-700 text-sm">This risk profile has been confirmed and is now active.</p>
                            {data.advisor_override_reason && (
                              <div className="mt-3 p-3 bg-white/60 rounded-xl border border-emerald-200/50 text-sm text-emerald-800">
                                <p><strong>Override Reason:</strong> {data.advisor_override_reason}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
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
                      {ipsError && (
                        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-bold text-sm">IPS Generation Failed</h4>
                            <p className="text-sm">{ipsError}</p>
                          </div>
                        </div>
                      )}
                      <IPSEditor 
                        ips={ipsDocument} 
                        client={{...client, dependents: getDependentsCount() === '—' ? client.dependents : getDependentsCount() as number}} 
                        onSave={handleSaveIPS} 
                        onAccept={handleAcceptIPS}
                        onRegenerate={() => handleGenerateIPS(ipsDocument.id)}
                        ipsVersions={ipsVersions}
                        onVersionSelect={(versionId) => {
                          const selected = ipsVersions.find(v => v.id === versionId);
                          if (selected) setIpsDocument(selected);
                        }}
                        generatingIPS={generatingIPS}
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
                          : "You must finalize the risk profile before generating an IPS."}
                      </p>
                      
                      {isEligibleForIPS && (
                        <div className="flex flex-col items-center gap-4">
                          <button
                            onClick={() => handleGenerateIPS()}
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
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
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

        <AnimatePresence>
          {selectedDriftEvent && (
            <DriftDetailsModal 
              event={selectedDriftEvent}
              onClose={() => setSelectedDriftEvent(null)}
              onAnalysisComplete={(updated) => {
                setDriftEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
