import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronRight, Loader2, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DriftEvent } from '../types';
import { aiService } from '../services/aiService';

interface DriftAlertProps {
  events: DriftEvent[];
  onDetailsClick: (event: DriftEvent) => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  onClose: () => void;
}

export default function DriftAlert({ events, onDetailsClick, isMinimized, onToggleMinimize, onClose }: DriftAlertProps) {
  if (events.length === 0) return null;

  const highestSeverity = events.some(e => e.severity === 'HIGH') ? 'HIGH' : 
                         events.some(e => e.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW';

  const bgColor = highestSeverity === 'HIGH' ? 'bg-red-50' : 
                 highestSeverity === 'MEDIUM' ? 'bg-amber-50' : 'bg-blue-50';
  const borderColor = highestSeverity === 'HIGH' ? 'border-red-200' : 
                     highestSeverity === 'MEDIUM' ? 'border-amber-200' : 'border-blue-200';
  const textColor = highestSeverity === 'HIGH' ? 'text-red-800' : 
                   highestSeverity === 'MEDIUM' ? 'text-amber-800' : 'text-blue-800';
  const iconColor = highestSeverity === 'HIGH' ? 'text-red-500' : 
                   highestSeverity === 'MEDIUM' ? 'text-amber-500' : 'text-blue-500';

  if (isMinimized) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={onToggleMinimize}
        className={`p-2 rounded-full ${bgColor} ${borderColor} ${iconColor} shadow-sm border`}
      >
        <AlertTriangle className="w-4 h-4" />
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className={`px-4 py-2 rounded-2xl border-2 ${bgColor} ${borderColor} ${textColor} shadow-xl backdrop-blur-2xl border-white/40 w-full`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg bg-white shadow-sm ${iconColor} shrink-0`}>
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[11px] tracking-tight leading-none">Portfolio Drift</h3>
            <p className="text-[9px] opacity-80 leading-relaxed font-medium">
              {events.length} asset class{events.length > 1 ? 'es' : ''} drifted.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => onDetailsClick(events[0])} 
              className="px-1.5 py-0.5 bg-white hover:bg-slate-50 rounded-md text-[8px] font-bold uppercase tracking-widest transition-all border border-black/10 shadow-sm"
            >
              Details
            </button>
            <button onClick={onToggleMinimize} className="p-0.5 hover:bg-black/5 rounded-md transition-colors">
              <ChevronRight className="w-3 h-3 rotate-90" />
            </button>
            <button onClick={onClose} className="p-0.5 hover:bg-black/5 rounded-md transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {events.map(event => (
            <div
              key={event.id}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-white rounded-md text-[8px] font-bold uppercase tracking-widest border border-black/10 shadow-sm"
            >
              <span className="truncate">{event.asset_class}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface DriftDetailsModalProps {
  event: DriftEvent;
  onClose: () => void;
  onAnalysisComplete?: (updatedEvent: DriftEvent) => void;
}

export function DriftDetailsModal({ event, onClose, onAnalysisComplete }: DriftDetailsModalProps) {
  const [analyzing, setAnalyzing] = useState(!event.ai_analysis);
  const [analysis, setAnalysis] = useState<DriftEvent['ai_analysis'] | null>(event.ai_analysis || null);
  const [rebalanceSuggestion, setRebalanceSuggestion] = useState<any>(null);
  const [suggestingRebalance, setSuggestingRebalance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!event.ai_analysis) {
      performAnalysis();
    }
  }, [event.id]);

  const performAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      // Prepare data for AI
      const driftData = {
        portfolio_id: event.portfolio_id,
        allocation: { [event.asset_class]: event.actual_percent },
        target: { [event.asset_class]: event.target_percent },
        bands: { [event.asset_class]: [event.lower_band, event.upper_band] as [number, number] },
        severity: event.severity
      };

      const result = await aiService.analyzeDrift(driftData);
      setAnalysis(result);
      
      // Save to backend
      const response = await fetch(`/api/drift/${event.id}/ai-analysis`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_analysis: result })
      });
      
      if (response.ok) {
        const updated = await response.json();
        if (onAnalysisComplete) onAnalysisComplete(updated.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const getRebalanceSuggestion = async () => {
    setSuggestingRebalance(true);
    setError(null);
    try {
      // 1. Fetch portfolio data
      const portfolioRes = await fetch(`/api/portfolios/${event.portfolio_id}`);
      const portfolioData = await portfolioRes.json();
      if (portfolioData.status !== 'ok') throw new Error('Failed to fetch portfolio');
      const portfolio = portfolioData.data;

      // 2. Fetch all securities
      const securitiesRes = await fetch(`/api/portfolios/securities/all`);
      const securitiesData = await securitiesRes.json();
      if (securitiesData.status !== 'ok') throw new Error('Failed to fetch securities');
      const availableSecurities = securitiesData.data;

      // 3. Call AI service
      const result = await aiService.suggestRebalanceActions(
        portfolio.ips,
        portfolio.ips.target_allocations,
        availableSecurities,
        portfolio.holdings
      );
      setRebalanceSuggestion(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSuggestingRebalance(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-slate-50 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-900 tracking-tight">Drift Analysis</h2>
              <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">{event.asset_class} • {event.severity} SEVERITY</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-8 pt-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Actual</p>
              <p className="text-xl font-display font-bold text-slate-900">{event.actual_percent}%</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target</p>
              <p className="text-xl font-display font-bold text-slate-900">{event.target_percent}%</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Band</p>
              <p className="text-sm font-bold text-slate-900">{event.lower_band}% – {event.upper_band}%</p>
            </div>
          </div>

          <div className="space-y-6">
            {analyzing ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-100 rounded-full"></div>
                  <div className="absolute inset-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-sm font-medium text-slate-500 animate-pulse">AI is analyzing portfolio drift...</p>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-800 text-sm">
                {error}
              </div>
            ) : analysis ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <section>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <Info className="w-4 h-4" />
                    Why it happened
                  </h4>
                  <p className="text-slate-600 text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    {analysis.reason}
                  </p>
                </section>

                <section>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <AlertTriangle className="w-4 h-4" />
                    Risk Impact
                  </h4>
                  <p className="text-slate-600 text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    {analysis.risk_impact}
                  </p>
                </section>

                <section>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <Loader2 className="w-4 h-4" />
                    Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-slate-600 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <button
                    onClick={getRebalanceSuggestion}
                    disabled={suggestingRebalance}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {suggestingRebalance ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Suggest Rebalance Actions'}
                  </button>

                  {rebalanceSuggestion && (
                    <div className="mt-6 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-2">Rebalance Summary</h4>
                      <p className="text-sm text-slate-600 mb-4">{rebalanceSuggestion.rebalance_summary}</p>
                      <h4 className="text-sm font-bold text-slate-900 mb-2">Suggestions</h4>
                      <ul className="space-y-2">
                        {rebalanceSuggestion.suggestions.map((s: any, i: number) => (
                          <li key={i} className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-100">
                            <span className="font-bold">{s.security_name} ({s.ticker})</span>: {s.current_allocation}% → {s.suggested_allocation}%
                            <p className="text-slate-500 mt-1">{s.action}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <div className="p-6 bg-blue-600 rounded-3xl text-white shadow-lg shadow-blue-200">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">Advisor Message</p>
                  <p className="text-sm font-medium leading-relaxed italic">"{analysis.advisor_message}"</p>
                </div>
              </motion.div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
