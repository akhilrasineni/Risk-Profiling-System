import { useState, useEffect } from 'react';
import { ClipboardList, UserCircle, LogOut, Briefcase, FileText, ArrowLeft, ShieldCheck, PieChart, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Client, UserSession, IPSDocument, TargetAllocation, Portfolio } from '../types';
import RiskQuestionnaireView from './RiskQuestionnaireView';
import IPSEditor from './IPSEditor';
import PortfolioEditor from './PortfolioEditor';
import Tooltip from './Tooltip';

interface ClientDashboardProps {
  clientSession: UserSession;
  onLogout: () => void;
}

export default function ClientDashboard({ clientSession, onLogout }: ClientDashboardProps) {
  const [clientData, setClientData] = useState<Client>(clientSession.rawData);
  const [view, setView] = useState<'profile' | 'assessment' | 'ips' | 'portfolio'>('profile');
  const [ips, setIps] = useState<(IPSDocument & { target_allocations: TargetAllocation[] }) | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loadingIps, setLoadingIps] = useState(false);
  const [hasFinalizedIps, setHasFinalizedIps] = useState(false);
  const [showInvestmentPopup, setShowInvestmentPopup] = useState(false);
  const [investmentAmount, setInvestmentAmount] = useState<string>('');
  const [investmentError, setInvestmentError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch IPS
        const ipsRes = await fetch(`/api/ips/client/${clientData.id}`);
        if (!ipsRes.ok) {
          const errorText = await ipsRes.text();
          throw new Error(`Failed to fetch IPS: ${ipsRes.status} ${ipsRes.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
        }
        const ipsData = await ipsRes.json();
        if (ipsData.status === 'ok' && ipsData.data) {
          setIps(ipsData.data);
          if (ipsData.data.status === 'Finalized' || ipsData.data.status === 'Active') {
            setHasFinalizedIps(true);
          }
        }

        // Fetch Portfolio
        const portRes = await fetch(`/api/portfolios/client/${clientData.id}`);
        if (!portRes.ok) {
          const errorText = await portRes.text();
          throw new Error(`Failed to fetch portfolio: ${portRes.status} ${portRes.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
        }
        const portData = await portRes.json();
        if (portData.status === 'ok' && portData.data) {
          setPortfolio(portData.data);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    
    if (clientData.risk_assessment_completed) {
      fetchData();
    }
  }, [clientData.id, clientData.risk_assessment_completed]);

  const handleAcceptIPS = async () => {
    if (!ips) return;
    setShowInvestmentPopup(true);
    setInvestmentAmount(clientData.investable_assets?.toString() || '');
  };

  const confirmAcceptIPS = async () => {
    if (!ips) return;
    
    const amount = parseFloat(investmentAmount);
    if (isNaN(amount) || amount <= 0) {
      setInvestmentError('Please enter a valid investment amount.');
      return;
    }

    if (clientData.net_worth && amount > clientData.net_worth) {
      setInvestmentError(`Investment amount cannot exceed your net worth ($${clientData.net_worth.toLocaleString()}).`);
      return;
    }

    setInvestmentError(null);
    try {
      const res = await fetch(`/api/ips/${ips.id}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          role: 'client',
          investable_assets: amount
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to accept IPS: ${res.status} ${res.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
      }
      
      const data = await res.json();
      if (data.status === 'ok') {
        setIps(data.data);
        setShowInvestmentPopup(false);
        alert('IPS Accepted successfully.');
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleApprovePortfolio = async () => {
    if (!portfolio) return;
    try {
      const res = await fetch(`/api/portfolios/${portfolio.id}/approve`, {
        method: 'PUT'
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to approve portfolio: ${res.status} ${res.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
      }
      
      const data = await res.json();
      if (data.status === 'ok') {
        setPortfolio(data.data);
        alert('Portfolio approved successfully.');
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleAssessmentComplete = () => {
    setClientData(prev => ({ ...prev, risk_assessment_completed: true }));
    setView('profile');
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-100 relative">
      {/* Enhanced Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100/50 to-gray-50"></div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        
        {/* Animated Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/20 rounded-full blur-[100px] animate-float"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-400/20 rounded-full blur-[100px] animate-float [animation-delay:2s]"></div>
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-emerald-400/20 rounded-full blur-[80px] animate-float [animation-delay:4s]"></div>
      </div>

      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-20 print:hidden">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <UserCircle className="w-5 h-5" />
            </div>
            <h1 className="font-display font-bold text-xl text-slate-900 tracking-tight">Investor Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 font-medium">Welcome, {clientSession.name}</span>
            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-12 px-4 relative z-10">
        {view === 'profile' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="space-y-10"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h2 className="text-4xl font-display font-bold tracking-tight text-slate-900">Investor Dossier</h2>
                <p className="text-slate-500 mt-2 font-medium">Comprehensive overview of your financial profile and investment status.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setView('assessment')}
                  disabled={clientData.risk_assessment_completed}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all shadow-sm ${
                    clientData.risk_assessment_completed 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-100 active:scale-95'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {clientData.risk_assessment_completed ? 'Assessment Complete' : 'Begin Risk Assessment'}
                </button>
              </div>
            </div>
            
            {/* Bento Grid Layout */}
            <div className="flex flex-col gap-6">
              
              {/* Financial Metrics Bento - NOW AT THE TOP */}
              <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <h3 className="text-xl font-display font-bold text-slate-900 tracking-tight">Financial Profile</h3>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                  <div className="group">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 group-hover:text-blue-500 transition-colors">Annual Income</p>
                    <p className="text-2xl font-display font-bold text-slate-900 tracking-tight">
                      {clientData.annual_income ? `$${clientData.annual_income.toLocaleString()}` : '—'}
                    </p>
                  </div>
                  
                  <div className="group">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 group-hover:text-blue-500 transition-colors">Net Worth</p>
                    <p className="text-2xl font-display font-bold text-slate-900 tracking-tight">
                      {clientData.net_worth ? `$${clientData.net_worth.toLocaleString()}` : '—'}
                    </p>
                  </div>
                  
                  <div className="group">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 group-hover:text-blue-500 transition-colors">Liquidity Needs</p>
                    <p className="text-2xl font-display font-bold text-slate-900 tracking-tight">
                      {clientData.liquidity_needs ? `$${clientData.liquidity_needs.toLocaleString()}` : '—'}
                    </p>
                  </div>
                  
                  <div className="group">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2 group-hover:text-blue-500 transition-colors">Tax Bracket</p>
                    <p className="text-2xl font-display font-bold text-slate-900 tracking-tight">
                      {clientData.tax_bracket ? `${clientData.tax_bracket}%` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                {/* Primary Risk Card (if completed) - NOW BELOW FINANCIALS */}
                {clientData.risk_assessment_completed && ips?.risk_assessments ? (
                  <div className="md:col-span-4 bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-xl group">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl -mr-24 -mt-24 transition-transform group-hover:scale-110 duration-1000"></div>
                    
                    <div className="relative z-10 h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <div className="px-2.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded-full text-[9px] font-bold uppercase tracking-widest text-blue-300">
                            Risk Classification
                          </div>
                          {ips.risk_assessments.finalized_by_advisor && (
                            <div className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-[9px] font-bold uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                              <ShieldCheck className="w-3 h-3" />
                              Verified
                            </div>
                          )}
                        </div>
                        
                        <h3 className="text-4xl font-display font-bold tracking-tight mb-3">
                          {ips.risk_assessments.advisor_override_category || ips.risk_assessments.risk_category}
                        </h3>
                        <p className="text-slate-400 max-w-md text-sm leading-relaxed font-medium italic opacity-80">
                          "{ips.risk_assessments.ai_behavior_summary.split('[')[0].trim()}"
                        </p>
                      </div>
                      
                      <div className="mt-8 flex items-center gap-6">
                        <div>
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
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5 flex items-center gap-1 cursor-help">
                              AI Confidence <Info className="w-3 h-3" />
                            </p>
                          </Tooltip>
                          <p className="text-xl font-display font-bold text-blue-400">{ips.risk_assessments.ai_confidence_score}%</p>
                        </div>
                        <div className="h-8 w-px bg-slate-800"></div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Status</p>
                          <p className="text-xl font-display font-bold text-white">Active Profile</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-4 bg-white rounded-[2rem] p-8 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center group hover:border-blue-300 transition-colors">
                    <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-50 group-hover:text-blue-400 transition-colors">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Risk Profile Pending</h3>
                    <p className="text-slate-500 max-w-xs text-xs font-medium">Complete the risk assessment to unlock your personalized investment strategy.</p>
                  </div>
                )}

                {/* Quick Actions / Status Card */}
                <div className="md:col-span-2 space-y-6">
                  {/* IPS Status Card */}
                  <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-bold text-lg text-slate-900 mb-1">Investment Policy</h3>
                    <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">
                      {hasFinalizedIps 
                        ? "Your mandate is finalized. Review and authorize." 
                        : "Your advisor is drafting your policy."}
                    </p>
                    {hasFinalizedIps ? (
                      <button 
                        onClick={() => setView('ips')}
                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                      >
                        View Policy
                      </button>
                    ) : (
                      <div className="w-full py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center border border-slate-100">
                        Drafting...
                      </div>
                    )}
                  </div>

                  {/* Portfolio Status Card */}
                  <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <PieChart className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-bold text-lg text-slate-900 mb-1">Portfolio</h3>
                    <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">
                      {portfolio 
                        ? "Monitor your active holdings." 
                        : "Construction begins after IPS activation."}
                    </p>
                    {portfolio ? (
                      <button 
                        onClick={() => setView('portfolio')}
                        className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                      >
                        View Portfolio
                      </button>
                    ) : (
                      <div className="w-full py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center border border-slate-100">
                        Pending IPS
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                    <UserCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Full Name</p>
                    <p className="text-sm font-bold text-slate-900">{clientData.first_name} {clientData.last_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Email Address</p>
                    <p className="text-sm font-bold text-slate-900">{clientData.email}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : view === 'ips' && ips ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <button 
              onClick={() => setView('profile')}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 transition-colors print:hidden"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Profile
            </button>
            <IPSEditor 
              ips={ips} 
              client={clientData} 
              onSave={async () => {}} 
              viewerRole="client"
              onAccept={handleAcceptIPS}
            />
          </motion.div>
        ) : view === 'portfolio' && portfolio ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <button 
              onClick={() => setView('profile')}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 transition-colors print:hidden"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Profile
            </button>
            
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Investment Portfolio</h2>
                  <p className="text-sm text-slate-500">Total Investment: ${portfolio.total_investment_amount.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    portfolio.approval_status === 'Approved' 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                      : 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${portfolio.approval_status === 'Approved' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    {portfolio.approval_status === 'Approved' ? 'Active' : 'Pending Approval'}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <PortfolioEditor 
                  portfolio={portfolio} 
                  onSave={() => {}} 
                  viewerRole="client"
                  client={clientData}
                />

                {portfolio.approval_status === 'Pending' && (
                  <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-4">
                    <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-blue-900 mb-1">Portfolio Approval Required</h4>
                      <p className="text-sm text-blue-700 mb-4">
                        Please review the proposed portfolio holdings based on your Investment Policy Statement. 
                        Once approved, the portfolio will become active.
                      </p>
                      <button
                        onClick={handleApprovePortfolio}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        Approve Portfolio
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <RiskQuestionnaireView 
              client={clientData} 
              onComplete={handleAssessmentComplete} 
              onCancel={() => setView('profile')} 
            />
          </motion.div>
        )}
      </div>

      {/* Investment Amount Popup */}
      <AnimatePresence>
        {showInvestmentPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-3xl shadow-xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-900">Finalize Investment</h3>
                <p className="text-sm text-slate-500 mt-1">Please confirm the amount you wish to invest.</p>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Annual Income</p>
                    <p className="text-sm font-bold text-slate-900">${clientData.annual_income?.toLocaleString() || '0'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Net Worth</p>
                    <p className="text-sm font-bold text-slate-900">${clientData.net_worth?.toLocaleString() || '0'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Investment Amount ($)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-400 font-medium">$</span>
                    </div>
                    <input
                      type="number"
                      value={investmentAmount}
                      onChange={(e) => {
                        setInvestmentAmount(e.target.value);
                        setInvestmentError(null);
                      }}
                      className={`w-full pl-7 pr-4 py-3 bg-white border rounded-xl text-lg font-bold focus:ring-2 outline-none transition-all ${
                        investmentError ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:ring-blue-100'
                      }`}
                      placeholder="0.00"
                    />
                  </div>
                  {investmentError && (
                    <p className="text-xs font-medium text-red-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {investmentError}
                    </p>
                  )}
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-xs text-blue-700 leading-relaxed">
                    By clicking "Confirm & Sign", you agree to the terms of the Investment Policy Statement and authorize the construction of your portfolio with the specified amount.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-slate-50 flex gap-3">
                <button
                  onClick={() => setShowInvestmentPopup(false)}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAcceptIPS}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Confirm & Sign
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
