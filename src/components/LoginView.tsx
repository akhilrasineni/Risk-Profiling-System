import React, { useState } from 'react';
import { 
  AlertCircle, Loader2, UserCircle, Briefcase, X,
  Layers, Code2, Database, Server, Cpu, Info
} from 'lucide-react';
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans relative">
      <button
        onClick={() => setShowTechStack(true)}
        className="absolute top-6 right-6 p-2.5 bg-white text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full shadow-sm border border-slate-200 transition-colors"
        title="View Tech Stack"
      >
        <Info className="w-5 h-5" />
      </button>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Portfolio System</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to access your dashboard</p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-lg mb-6">
          <button
            onClick={() => setRole('advisor')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${role === 'advisor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Advisor
          </button>
          <button
            onClick={() => setRole('client')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${role === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Investor
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {role === 'advisor' ? 'Advisor ID' : 'Investor ID'}
            </label>
            <input
              type="text"
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !idInput.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCircle className="w-4 h-4" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      {showTechStack && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 text-slate-400 p-8 rounded-2xl max-w-2xl w-full relative shadow-2xl border border-slate-800">
            <button
              onClick={() => setShowTechStack(false)}
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold text-white mb-2 flex items-center gap-2">
                  <Layers className="w-6 h-6 text-blue-400" />
                  Tech Stack Overview
                </h2>
                <p className="text-sm leading-relaxed">
                  This application is built using a modern, full-stack JavaScript/TypeScript architecture, designed for performance, scalability, and clean code.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
                  <div className="flex items-center gap-2 text-white font-medium mb-3">
                    <Code2 className="w-4 h-4 text-emerald-400" />
                    Frontend
                  </div>
                  <ul className="text-sm space-y-2">
                    <li><strong className="text-slate-300">React 18</strong> - Core UI library</li>
                    <li><strong className="text-slate-300">TypeScript</strong> - Static typing</li>
                    <li><strong className="text-slate-300">Vite</strong> - Build tool & bundler</li>
                    <li><strong className="text-slate-300">Tailwind CSS</strong> - Utility styling</li>
                    <li><strong className="text-slate-300">Lucide React</strong> - SVG icons</li>
                  </ul>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
                  <div className="flex items-center gap-2 text-white font-medium mb-3">
                    <Server className="w-4 h-4 text-blue-400" />
                    Backend
                  </div>
                  <ul className="text-sm space-y-2">
                    <li><strong className="text-slate-300">Node.js</strong> - Runtime environment</li>
                    <li><strong className="text-slate-300">Express.js</strong> - API framework</li>
                    <li><strong className="text-slate-300">Vite Middleware</strong> - SSR/SPA serving</li>
                  </ul>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
                  <div className="flex items-center gap-2 text-white font-medium mb-3">
                    <Database className="w-4 h-4 text-orange-400" />
                    Database
                  </div>
                  <ul className="text-sm space-y-2">
                    <li><strong className="text-slate-300">Supabase</strong> - Backend-as-a-Service</li>
                    <li><strong className="text-slate-300">PostgreSQL</strong> - Relational database</li>
                    <li><strong className="text-slate-300">supabase-js</strong> - Client SDK</li>
                  </ul>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
                  <div className="flex items-center gap-2 text-white font-medium mb-3">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    Logic & Analysis
                  </div>
                  <ul className="text-sm space-y-2">
                    <li><strong className="text-slate-300">Deterministic Rules</strong> - Scoring</li>
                    <li><strong className="text-slate-300">Variance Math</strong> - Consistency</li>
                    <li><strong className="text-slate-300">Custom Algorithms</strong> - Analysis</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}