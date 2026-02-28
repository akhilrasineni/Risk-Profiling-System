import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Users, LogOut, Briefcase, UserPlus, BrainCircuit, Trash2, User, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
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

  const handleDeleteClient = async (clientId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (res.ok && data.status === 'ok') {
        setDeletingClient(null);
        fetchClients();
      } else {
        setError(data.message || 'Failed to delete investor');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
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
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Briefcase className="w-5 h-5" />
            </div>
            <h1 className="font-display font-bold text-xl text-slate-900 tracking-tight">Advisor Portal</h1>
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

      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-display font-bold tracking-tight text-slate-900">Your Investors</h2>
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
                      <th className="px-6 py-4 font-medium">Investor ID</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
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
                          <div className="flex items-center justify-end gap-3">
                            {client.risk_assessment_completed ? (
                              <button 
                                onClick={() => setViewingProfileFor(client)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors group relative"
                                title="View Profile"
                              >
                                <User className="w-5 h-5" />
                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">View Profile</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                Pending
                              </span>
                            )}
                            <button 
                              onClick={() => setDeletingClient(client)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Investor"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
        {deletingClient && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Delete Investor Profile?</h3>
                <p className="text-sm text-slate-500 mt-2">
                  This will permanently remove <strong>{deletingClient.first_name} {deletingClient.last_name}</strong> and all associated data, including exam results and portfolio. This action cannot be undone.
                </p>
              </div>
              <div className="px-6 py-4 bg-white flex justify-end gap-3">
                <button 
                  onClick={() => setDeletingClient(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteClient(deletingClient.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm"
                >
                  Delete Profile
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}