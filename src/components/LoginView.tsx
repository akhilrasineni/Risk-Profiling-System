import React, { useState } from 'react';
import { 
  AlertCircle, Loader2, UserCircle, Briefcase, X,
  Layers, Code2, Database, Server, Cpu, Info, BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserSession } from '../types';

export default function LoginView({ onLogin }: { onLogin: (user: UserSession) => void }) {
  const [role, setRole] = useState<'advisor' | 'client'>('advisor');
  const [idInput, setIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechStack, setShowTechStack] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idInput.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idInput.trim(), role })
      });
      
      const data = await response.json();
      
      if (response.ok && data.status === 'ok') {
        const user = data.user;
        const firstName = user.first_name || user.firstName || '';
        const lastName = user.last_name || user.lastName || '';
        const name = role === 'advisor' ? user.full_name : ((firstName || lastName) ? `${firstName} ${lastName}`.trim() : (user.email || user.id || 'User'));
          
        onLogin({ id: user.id, role, name, rawData: user });
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans relative selection:bg-blue-100">
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

      <button
        onClick={() => setShowTechStack(true)}
        className="absolute top-8 right-8 p-2.5 bg-white text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full shadow-sm border border-slate-200 transition-all hover:scale-110 active:scale-95 z-20"
        title="View Tech Stack"
      >
        <Info className="w-5 h-5" />
      </button>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-6">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <Briefcase className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-display font-bold tracking-tight text-slate-900">Portfolio System</h1>
          <p className="text-slate-500 text-xs mt-1 font-medium">Secure access to your wealth dashboard</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] shadow-xl shadow-slate-200/60 p-8 relative overflow-hidden">
          {/* Subtle accent line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-20"></div>

          <div className="flex p-1 bg-slate-100 rounded-2xl mb-8 relative">
            <div className="absolute inset-1 flex">
                <motion.div 
                    className="w-1/2 bg-white rounded-xl shadow-sm"
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    animate={{ x: role === 'advisor' ? '0%' : '100%' }}
                />
            </div>
            <button
              onClick={() => setRole('advisor')}
              className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all relative z-10 ${role === 'advisor' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Advisor
            </button>
            <button
              onClick={() => setRole('client')}
              className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all relative z-10 ${role === 'client' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Investor
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2.5 ml-1">
                {role === 'advisor' ? 'Advisor ID' : 'Investor ID'}
              </label>
              <input
                type="text"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                placeholder="Enter your unique ID"
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono placeholder:text-slate-300 transition-all"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-800 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs font-medium leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !idInput.trim()}
              className="w-full flex items-center justify-center gap-3 py-4 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCircle className="w-5 h-5" />}
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="mt-8 flex items-center justify-center gap-6 opacity-40">
          <div className="h-px w-12 bg-slate-300"></div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Secure</p>
          <div className="h-px w-12 bg-slate-300"></div>
        </div>
      </div>

      <AnimatePresence>
      {showTechStack && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="bg-slate-900 text-slate-400 p-6 md:p-8 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative shadow-2xl border border-slate-800 scrollbar-hide"
          >
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
            
            <button
              onClick={() => setShowTechStack(false)}
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors bg-slate-800 rounded-full z-20"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="space-y-6 md:space-y-8 relative z-10">
              <div>
                <h2 className="text-2xl font-display font-bold text-white mb-2 flex items-center gap-3">
                  <Layers className="w-6 h-6 text-blue-400" />
                  Tech Stack
                </h2>
                <p className="text-xs md:text-sm leading-relaxed text-slate-400 font-medium">
                  Built with a modern, full-stack architecture designed for precision, security, and a premium user experience.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 text-white font-bold text-[10px] uppercase tracking-widest mb-3">
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    Frontend
                  </div>
                  <ul className="text-xs space-y-2">
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-400 rounded-full"></div><strong className="text-slate-200">React 18</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-400 rounded-full"></div><strong className="text-slate-200">TypeScript</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-400 rounded-full"></div><strong className="text-slate-200">Vite</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-400 rounded-full"></div><strong className="text-slate-200">Tailwind CSS</strong></li>
                  </ul>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 text-white font-bold text-[10px] uppercase tracking-widest mb-3">
                    <Server className="w-3.5 h-3.5 text-blue-400" />
                    Backend
                  </div>
                  <ul className="text-xs space-y-2">
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-blue-400 rounded-full"></div><strong className="text-slate-200">Node.js</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-blue-400 rounded-full"></div><strong className="text-slate-200">Express.js</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-blue-400 rounded-full"></div><strong className="text-slate-200">Vite Middleware</strong></li>
                  </ul>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 text-white font-bold text-[10px] uppercase tracking-widest mb-3">
                    <Database className="w-3.5 h-3.5 text-orange-400" />
                    Database
                  </div>
                  <ul className="text-xs space-y-2">
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-orange-400 rounded-full"></div><strong className="text-slate-200">Supabase</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-orange-400 rounded-full"></div><strong className="text-slate-200">PostgreSQL</strong></li>
                  </ul>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 text-white font-bold text-[10px] uppercase tracking-widest mb-3">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    Intelligence
                  </div>
                  <ul className="text-xs space-y-2">
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-purple-400 rounded-full"></div><strong className="text-slate-200">Gemini AI</strong></li>
                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-purple-400 rounded-full"></div><strong className="text-slate-200">Behavioral Logic</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}