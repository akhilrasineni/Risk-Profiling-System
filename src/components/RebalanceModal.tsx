import { useState, useMemo } from 'react';
import { Loader2, BrainCircuit, X, TrendingUp, Wallet, Trash2, Plus, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import { Portfolio, PortfolioHolding, RebalanceHolding } from '../types';
import { aiService } from '../services/aiService';
import Tooltip from './Tooltip';

interface RebalanceModalProps {
  portfolio: Portfolio;
  securities: any[];
  onClose: () => void;
  onSave: (updatedHoldings: PortfolioHolding[], updatedCashBalance: number) => Promise<void>;
}

export default function RebalanceModal({ portfolio, securities, onClose, onSave }: RebalanceModalProps) {
  const [holdings, setHoldings] = useState<RebalanceHolding[]>(() => JSON.parse(JSON.stringify(portfolio.holdings?.filter(h => h.allocated_percent > 0) || [])));
  const [cashBalance, setCashBalance] = useState<number>(portfolio.cash_balance || 0);
  const [loading, setLoading] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const totalPortfolioValue = portfolio.total_investment_amount + (portfolio.cash_balance || 0);

  const chartData = useMemo(() => {
    return holdings.map(h => ({
      name: h.security?.ticker || h.security?.security_name || 'Unknown',
      current: parseFloat((portfolio.holdings?.find(ph => ph.id === h.id)?.allocated_percent || 0).toFixed(2)),
      new: parseFloat(h.allocated_percent.toFixed(2)),
      ai: h.suggested_percent !== undefined ? parseFloat(h.suggested_percent.toFixed(2)) : null
    }));
  }, [holdings, portfolio.holdings]);

  const handleGenerateAISuggestions = async () => {
    setLoadingAi(true);
    setError(null);
    try {
      const ips = Array.isArray(portfolio.ips) ? portfolio.ips[0] : portfolio.ips;
      const result = await aiService.suggestRebalanceActions(ips, ips?.target_allocations || [], securities, holdings);
      setAiSuggestions(result);

      if (result && Array.isArray(result.suggestions)) {
        setHoldings(prev => {
          // Update existing holdings
          const updatedHoldings = prev.map(h => {
            const suggestion = result.suggestions.find((s: any) => {
              const tickerMatch = s.ticker && h.security?.ticker && s.ticker.toUpperCase() === h.security.ticker.toUpperCase();
              const nameMatch = s.security_name && h.security?.security_name && s.security_name.toLowerCase() === h.security.security_name.toLowerCase();
              return tickerMatch || nameMatch;
            });
            return {
              ...h,
              suggested_percent: suggestion?.suggested_allocation
            };
          });

          // Add new suggested holdings that aren't in the current list
          const newHoldings = result.suggestions
            .filter((s: any) => {
              const alreadyExists = prev.some(h => {
                const tickerMatch = s.ticker && h.security?.ticker && s.ticker.toUpperCase() === h.security.ticker.toUpperCase();
                const nameMatch = s.security_name && h.security?.security_name && s.security_name.toLowerCase() === h.security.security_name.toLowerCase();
                return tickerMatch || nameMatch;
              });
              return !alreadyExists;
            })
            .map((s: any) => {
              const security = securities.find(sec => {
                const tickerMatch = s.ticker && sec.ticker && s.ticker.toUpperCase() === sec.ticker.toUpperCase();
                const nameMatch = s.security_name && sec.security_name && s.security_name.toLowerCase() === sec.security_name.toLowerCase();
                return tickerMatch || nameMatch;
              });
              if (!security) return null;
              return {
                id: `new-${s.ticker || s.security_name}-${Date.now()}`,
                portfolio_id: portfolio.id,
                security_id: security.id,
                security: security,
                allocated_percent: 0,
                allocated_amount: 0,
                units: 0,
                suggested_percent: s.suggested_allocation
              };
            })
            .filter((h): h is RebalanceHolding => h !== null);

          return [...updatedHoldings, ...newHoldings];
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get AI suggestions.');
    } finally {
      setLoadingAi(false);
    }
  };

  const recalculateCashBalance = (currentHoldings: PortfolioHolding[]) => {
    const totalAllocated = currentHoldings.reduce((sum, h) => sum + h.allocated_amount, 0);
    setCashBalance(totalPortfolioValue - totalAllocated);
  };

  const handleAllocationChange = (index: number, newPercent: number) => {
    const newHoldings = [...holdings];
    const holding = newHoldings[index];
    const clampedPercent = Math.max(0, Math.min(100, newPercent));

    holding.allocated_percent = clampedPercent;
    holding.allocated_amount = totalPortfolioValue * (clampedPercent / 100);
    if (holding.security && holding.security.current_price > 0) {
      holding.units = holding.allocated_amount / holding.security.current_price;
    } else {
      holding.units = 0;
    }
    setHoldings(newHoldings);
    recalculateCashBalance(newHoldings);
  };

  const handleSellHolding = (index: number) => {
    const newHoldings = holdings.filter((_, i) => i !== index);
    setHoldings(newHoldings);
    recalculateCashBalance(newHoldings);
  };

  const handleAddHolding = () => {
    if (securities.length > 0) {
      const currentSecurityIds = new Set(holdings.map(h => h.security_id));
      const firstAvailableSecurity = securities.find(s => !currentSecurityIds.has(s.id));

      if (firstAvailableSecurity) {
        const newHolding: PortfolioHolding = {
          id: `temp-${Date.now()}`,
          portfolio_id: portfolio.id,
          security_id: firstAvailableSecurity.id,
          security: firstAvailableSecurity,
          allocated_percent: 0,
          allocated_amount: 0,
          units: 0,
        };
        setHoldings([...holdings, newHolding]);
      }
    }
  };

  const handleSecurityChange = (index: number, securityId: string) => {
    const newHoldings = [...holdings];
    const security = securities.find(s => s.id === securityId);
    if (security) {
      newHoldings[index].security_id = securityId;
      newHoldings[index].security = security;
      if (newHoldings[index].allocated_amount > 0 && security.current_price > 0) {
          newHoldings[index].units = newHoldings[index].allocated_amount / security.current_price;
      } else {
          newHoldings[index].units = 0;
      }
      setHoldings(newHoldings);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(holdings, cashBalance);
      onClose();
    } catch (error) {
      console.error("Failed to save rebalance:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" 
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between relative z-10 bg-white/80 backdrop-blur-sm rounded-t-3xl">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rebalance Portfolio</h2>
            <p className="text-sm text-slate-500">Adjust allocations and review AI-powered suggestions.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 relative overflow-hidden bg-gray-50">
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

          <div className="absolute inset-0 z-10 overflow-y-auto p-6 space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6 shadow-sm relative">
            <div className="flex items-center justify-between">
              <Tooltip alignment="left" position="bottom" content={
                <div className="text-left space-y-2">
                  <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">Rebalancing Engine</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li><span className="text-white font-semibold">Drift Analysis:</span> Deviations &gt;5% from target</li>
                    <li><span className="text-white font-semibold">Tax Efficiency:</span> Long-term vs. short-term gain minimization</li>
                    <li><span className="text-white font-semibold">Market Context:</span> Volatility adjustment (VIX)</li>
                  </ul>
                </div>
              }>
                <div className="flex items-center gap-3 cursor-help">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <BrainCircuit className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-blue-900">AI Rebalancing Assistant</h3>
                    <p className="text-xs text-blue-700">Get intelligent allocation suggestions based on your IPS and market conditions.</p>
                  </div>
                </div>
              </Tooltip>
              <button 
                onClick={handleGenerateAISuggestions}
                disabled={loadingAi}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {loadingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {loadingAi ? 'Analyzing Portfolio...' : 'Generate Suggestions'}
              </button>
            </div>
            {aiSuggestions && (
              <div className='text-xs text-blue-700 bg-white/50 p-3 rounded-lg space-y-3'>
                <p className='font-semibold'>{aiSuggestions.rebalance_summary || 'Analysis complete.'}</p>
                {Array.isArray(aiSuggestions.suggestions) && aiSuggestions.suggestions.length > 0 && (
                  <div className="space-y-2 mt-2 border-t border-blue-100 pt-2">
                    <p className="font-bold text-blue-800">Recommended Actions:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {aiSuggestions.suggestions.map((s: any, i: number) => (
                        <li key={i}>
                          <span className="font-semibold">{s.security_name} ({s.ticker}):</span> {s.action}
                          <span className="ml-2 text-blue-600 font-mono">
                            (Target: {s.suggested_allocation}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <h3 className='text-base font-bold text-slate-800'>Current Holdings</h3>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Security</th>
                    <th className="px-3 py-2 text-right">Current %</th>
                    <th className="px-3 py-2 text-center">AI Sug %</th>
                    <th className="px-3 py-2 text-right">New %</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Units</th>
                    <th className="px-3 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holdings.map((holding, index) => (
                    <tr key={holding.id || `temp-${index}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900 w-1/3">
                        {holding.id.startsWith('temp-') ? (
                          <select 
                            value={holding.security_id} 
                            onChange={(e) => handleSecurityChange(index, e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded p-1 text-sm"
                          >
                            {securities.map(s => <option key={s.id} value={s.id}>{s.security_name} ({s.ticker})</option>)}
                          </select>
                        ) : (
                          <span>
                            {holding.security?.security_name}
                            {holding.security?.ticker && <span className="text-slate-400 ml-1">({holding.security.ticker})</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{(portfolio.holdings?.find(h => h.id === holding.id)?.allocated_percent || 0).toFixed(2)}%</td>
                      <td className="px-3 py-2 text-center font-mono text-blue-600 font-semibold">
                        {holding.suggested_percent !== undefined ? `${holding.suggested_percent.toFixed(2)}%` : '-'}
                      </td>
                      <td className="px-3 py-2"><input type="number" step="0.01" value={holding.allocated_percent} onChange={(e) => handleAllocationChange(index, parseFloat(e.target.value) || 0)} className="w-24 bg-white border border-slate-200 rounded text-right font-mono p-1" /></td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">${holding.allocated_amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{holding.units.toFixed(4)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => handleSellHolding(index)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual Comparison Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-5 h-5 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-800">Allocation Comparison (%)</h3>
            </div>
            <div className="h-64 w-full" style={{ minHeight: '256px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    unit="%"
                  />
                  <RechartsTooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                  <Bar dataKey="current" name="Current" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="new" name="New" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                  {chartData.some(d => d.ai !== null) && (
                    <Bar dataKey="ai" name="AI Suggested" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <button
            onClick={handleAddHolding}
            className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Security
          </button>

          <div className='flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm'>
            <Wallet className='w-6 h-6 text-slate-500' />
            <div>
              <h4 className='text-xs font-semibold text-slate-500 uppercase'>Resulting Cash Balance</h4>
              <p className={`text-lg font-mono font-bold ${cashBalance < 0 ? 'text-red-600' : 'text-slate-900'}`}>${cashBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
          </div>
        </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3 relative z-10 bg-white/80 backdrop-blur-sm rounded-b-3xl">
          <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm">Cancel</button>
          <button onClick={handleSave} disabled={loading || cashBalance < 0} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 text-sm">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Rebalance'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
