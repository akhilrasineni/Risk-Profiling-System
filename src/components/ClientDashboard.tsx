import { useState, useEffect } from 'react';
import { ClipboardList, UserCircle, LogOut, Briefcase, FileText, ArrowLeft } from 'lucide-react';
import { Client, UserSession, IPSDocument, TargetAllocation } from '../types';
import RiskQuestionnaireView from './RiskQuestionnaireView';
import IPSEditor from './IPSEditor';

interface ClientDashboardProps {
  clientSession: UserSession;
  onLogout: () => void;
}

export default function ClientDashboard({ clientSession, onLogout }: ClientDashboardProps) {
  const [clientData, setClientData] = useState<Client>(clientSession.rawData);
  const [view, setView] = useState<'profile' | 'assessment' | 'ips'>('profile');
  const [ips, setIps] = useState<(IPSDocument & { target_allocations: TargetAllocation[] }) | null>(null);
  const [loadingIps, setLoadingIps] = useState(false);
  const [hasFinalizedIps, setHasFinalizedIps] = useState(false);

  useEffect(() => {
    const checkIPS = async () => {
      try {
        const res = await fetch(`/api/ips/client/${clientData.id}`);
        const data = await res.json();
        if (data.status === 'ok' && data.data) {
          setIps(data.data);
          if (data.data.status === 'Finalized') {
            setHasFinalizedIps(true);
          }
        }
      } catch (err) {
        console.error('Error checking IPS:', err);
      }
    };
    if (clientData.risk_assessment_completed) {
      checkIPS();
    }
  }, [clientData.id, clientData.risk_assessment_completed]);

  const fetchIPS = async () => {
    // IPS is likely already fetched by the useEffect, but we set view here
    if (ips) {
      setView('ips');
    }
  };

  const handleAcceptIPS = async () => {
    if (!ips) return;
    try {
      const res = await fetch(`/api/ips/${ips.id}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'client' })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setIps(prev => prev ? { ...prev, client_accepted_at: new Date().toISOString() } : null);
        alert('IPS Accepted successfully.');
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to accept IPS: ' + err.message);
    }
  };

  const handleAssessmentComplete = () => {
    setClientData(prev => ({ ...prev, risk_assessment_completed: true }));
    setView('profile');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
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
                {hasFinalizedIps && (
                  <button 
                    onClick={fetchIPS}
                    disabled={loadingIps}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    View Investment Policy
                  </button>
                )}
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
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Profile
            </button>
            <IPSEditor 
              ips={ips} 
              client={clientData} 
              onSave={async () => {}} // Client cannot save edits
              viewerRole="client"
              onAccept={handleAcceptIPS}
            />
          </div>
        ) : (
          <RiskQuestionnaireView 
            client={clientData} 
            onComplete={handleAssessmentComplete} 
            onCancel={() => setView('profile')} 
          />
        )}
      </div>
    </div>
  );
}
