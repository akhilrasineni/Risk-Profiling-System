import { useState, useEffect } from 'react';
import { ClipboardList, UserCircle, LogOut, Briefcase, FileText, ArrowLeft, ShieldCheck, PieChart, TrendingUp, AlertCircle } from 'lucide-react';
import { Client, UserSession, IPSDocument, TargetAllocation, Portfolio } from '../types';
import RiskQuestionnaireView from './RiskQuestionnaireView';
import IPSEditor from './IPSEditor';
import PortfolioEditor from './PortfolioEditor';

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
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <UserCircle className="w-4 h-4" />
            </div>
            <h1 className="font-semibold text-slate-900">Investor Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 font-medium">Welcome, {clientSession.name}</span>
            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-12 px-4">
        {view === 'profile' ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Your Profile</h2>
                <p className="text-sm text-slate-500 mt-1">View your personal and financial details.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setView('assessment')}
                  disabled={clientData.risk_assessment_completed}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    clientData.risk_assessment_completed 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {clientData.risk_assessment_completed ? 'Assessment Completed' : 'Take Risk Assessment'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* IPS Card */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Investment Policy Statement</h3>
                <p className="text-sm text-slate-500 mb-6">
                  {hasFinalizedIps 
                    ? "Your investment mandate has been finalized. Please review and sign." 
                    : "Your advisor is currently drafting your investment policy."}
                </p>
                {hasFinalizedIps ? (
                  <button 
                    onClick={() => setView('ips')}
                    className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    View Investment Policy
                  </button>
                ) : (
                  <button disabled className="w-full py-2 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed">
                    Draft in Progress
                  </button>
                )}
              </div>

              {/* Portfolio Card */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-4">
                  <PieChart className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Investment Portfolio</h3>
                <p className="text-sm text-slate-500 mb-6">
                  {portfolio 
                    ? "View your constructed portfolio and holdings." 
                    : "Portfolio construction will begin once the IPS is active."}
                </p>
                {portfolio ? (
                  <button 
                    onClick={() => setView('portfolio')}
                    className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    View Portfolio
                  </button>
                ) : (
                  <button disabled className="w-full py-2 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed">
                    Pending IPS Activation
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">First Name</p>
                <p className="text-base font-medium text-slate-900">{clientData.first_name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Last Name</p>
                <p className="text-base font-medium text-slate-900">{clientData.last_name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Email</p>
                <p className="text-base font-medium text-slate-900">{clientData.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Date of Birth</p>
                <p className="text-base font-medium text-slate-900">{clientData.dob || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Annual Income</p>
                <p className="text-base font-medium text-slate-900">{clientData.annual_income ? `$${clientData.annual_income.toLocaleString()}` : 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Net Worth</p>
                <p className="text-base font-medium text-slate-900">{clientData.net_worth ? `$${clientData.net_worth.toLocaleString()}` : 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Liquidity Needs</p>
                <p className="text-base font-medium text-slate-900">{clientData.liquidity_needs ? `$${clientData.liquidity_needs.toLocaleString()}` : 'Not provided'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Tax Bracket</p>
                <p className="text-base font-medium text-slate-900">{clientData.tax_bracket ? `${clientData.tax_bracket}%` : 'Not provided'}</p>
              </div>
            </div>
          </>
        ) : view === 'ips' && ips ? (
          <div>
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
          </div>
        ) : view === 'portfolio' && portfolio ? (
          <div>
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
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    portfolio.approval_status === 'Approved' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {portfolio.approval_status === 'Approved' ? 'Active' : 'Pending Approval'}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <PortfolioEditor 
                  portfolio={portfolio} 
                  onSave={() => {}} 
                  viewerRole="client"
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
          </div>
        ) : (
          <RiskQuestionnaireView 
            client={clientData} 
            onComplete={handleAssessmentComplete} 
            onCancel={() => setView('profile')} 
          />
        )}
      </div>

      {/* Investment Amount Popup */}
      {showInvestmentPopup && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
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
          </div>
        </div>
      )}
    </div>
  );
}
