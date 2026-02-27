import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Users, LogOut, Briefcase, UserPlus, BrainCircuit, Settings, Info } from 'lucide-react';
import { Client, UserSession, AIModel } from '../types';
import AddClientModal from './AddClientModal';
import RiskProfileModal from './RiskProfileModal';
import { aiService } from '../services/aiService';

export default function AdvisorDashboard({ advisor, onLogout }: { advisor: UserSession, onLogout: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingProfileFor, setViewingProfileFor] = useState<Client | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModel>(aiService.getModel());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchClients();
  }, [advisor.id]);

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
    aiService.setModel(model);
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/advisors/${advisor.id}/clients`);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch clients: ${res.status} ${res.statusText}${errorText ? ` - ${errorText.slice(0, 100)}` : ''}`);
      }
      
      const data = await res.json();
      if (data.status === 'ok') {
        setClients(data.data);
      } else {
        setError(data.message || 'Failed to fetch clients');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
            <h1 className="font-semibold text-slate-900">Advisor Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200">
              <BrainCircuit className="w-4 h-4 text-blue-600" />
              <select 
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value as AIModel)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
              </select>
            </div>
            <span className="text-sm text-slate-500 font-medium">Welcome, {advisor.name}</span>
            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Your Investors</h2>
            <p className="text-sm text-slate-500 mt-1">Manage your clients and view their profiles.</p>
          </div>
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Investor
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Clients Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-slate-900">No investors found</h3>
              <p className="text-sm text-slate-500 mt-1">Get started by adding your first investor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-medium">Name</th>
                    <th className="px-6 py-4 font-medium">Email</th>
                    <th className="px-6 py-4 font-medium">Income</th>
                    <th className="px-6 py-4 font-medium">Net Worth</th>
                    <th className="px-6 py-4 font-medium">ID (For Login)</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{client.first_name} {client.last_name}</td>
                      <td className="px-6 py-4 text-slate-500">{client.email}</td>
                      <td className="px-6 py-4 text-slate-500">{client.annual_income ? `$${client.annual_income.toLocaleString()}` : '-'}</td>
                      <td className="px-6 py-4 text-slate-500">{client.net_worth ? `$${client.net_worth.toLocaleString()}` : '-'}</td>
                      <td className="px-6 py-4">
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">{client.id}</code>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {client.risk_assessment_completed ? (
                          <button 
                            onClick={() => setViewingProfileFor(client)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            View Profile
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400 italic">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showAddForm && (
        <AddClientModal 
          advisorId={advisor.id} 
          onClose={() => setShowAddForm(false)} 
          onSuccess={() => {
            setShowAddForm(false);
            fetchClients();
          }} 
        />
      )}

      {viewingProfileFor && (
        <RiskProfileModal 
          client={viewingProfileFor} 
          onClose={() => setViewingProfileFor(null)} 
          onSuccess={() => {
            setViewingProfileFor(null);
            fetchClients();
          }}
        />
      )}
    </div>
  );
}