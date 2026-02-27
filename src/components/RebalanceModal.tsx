import { useState, useEffect } from 'react';
import { Loader2, BrainCircuit, Trash2, AlertCircle, X, TrendingUp, Wallet, PackageOpen, Plus, Info } from 'lucide-react';
import { Portfolio, PortfolioHolding } from '../types';
import { aiService } from '../services/aiService';

interface RebalanceModalProps {
  portfolio: Portfolio;
  securities: any[];
  onClose: () => void;
  onSave: (updatedHoldings: PortfolioHolding[], updatedCashBalance: number) => Promise<void>;
}

export default function RebalanceModal({ portfolio, securities, onClose, onSave }: RebalanceModalProps) {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [previouslyHeld, setPreviouslyHeld] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [walletAmount, setWalletAmount] = useState<number>(portfolio.cash_balance || 0);

  useEffect(() => {
    // Separate holdings into current and previously held
    const current = portfolio.holdings?.filter(h => h.allocated_percent > 0) || [];
    const previous = portfolio.holdings?.filter(h => h.allocated_percent === 0) || [];
    setHoldings(current);
    setPreviouslyHeld(previous);
  }, [portfolio]);

  const handleGenerateAISuggestions = async () => {
    setLoadingAi(true);
    setError(null);
    try {
      const ips = Array.isArray(portfolio.ips) ? portfolio.ips[0] : portfolio.ips;
      const targetAllocations = ips?.target_allocations || [];
      const result = await aiService.suggestRebalanceActions(
        ips,
        targetAllocations,
        securities,
        holdings
      );
      setAiSuggestions(result);
    } catch (err: any) {
      setError(err.message || 'Failed to get AI suggestions.');
    } finally {
      setLoadingAi(false);
    }
  };

  const totalPortfolioValue = portfolio.total_investment_amount + (portfolio.cash_balance || 0);

  const handleAllocationChange = (index: number, newPercent: number) => {
    const newHoldings = [...holdings];
    const holding = newHoldings[index];

    holding.allocated_percent = newPercent;
    holding.allocated_amount = totalPortfolioValue * (newPercent / 100);
    if (holding.security && holding.security.current_price > 0) {
      holding.units = holding.allocated_amount / holding.security.current_price;
    } else {
      holding.units = 0;
    }

    setHoldings(newHoldings);
    
    const newTotalAllocated = newHoldings.reduce((sum, h) => sum + h.allocated_amount, 0);
    setWalletAmount(totalPortfolioValue - newTotalAllocated);
  };

  const handleSellHolding = (index: number) => {
    const newHoldings = [...holdings];
    const soldHolding = newHoldings.splice(index, 1)[0];

    if (soldHolding) {
      soldHolding.allocated_percent = 0;
      setPreviouslyHeld(prev => [...prev, soldHolding]);
      setHoldings(newHoldings);
      
      const newTotalAllocated = newHoldings.reduce((sum, h) => sum + h.allocated_amount, 0);
      setWalletAmount(totalPortfolioValue - newTotalAllocated);
    }
  };

  const handleAddHolding = () => {
    if (securities.length === 0) return;
    const firstSec = securities[0];
    setHoldings([...holdings, {
      id: `temp-${Date.now()}`,
      portfolio_id: portfolio.id,
      security_id: firstSec.id,
      allocated_percent: 0,
      allocated_amount: 0,
      units: 0,
      security: firstSec
    }]);
  };

  const handleSecurityChange = (index: number, securityId: string) => {
    const newHoldings = [...holdings];
    const holding = newHoldings[index];
    const sec = securities.find(s => s.id === securityId);
    if (sec) {
      holding.security_id = sec.id;
      holding.security = sec;
      if (holding.allocated_amount > 0 && sec.current_price > 0) {
        holding.units = holding.allocated_amount / sec.current_price;
      } else {
        holding.units = 0;
      }
      setHoldings(newHoldings);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rebalance Portfolio</h2>
            <p className="text-sm text-slate-500">Adjust allocations and review AI-powered suggestions.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* AI Suggestions Section */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 group relative">
                <BrainCircuit className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-blue-800 flex items-center gap-1">
                  AI Rebalancing Assistant
                  <Info className="w-3.5 h-3.5 text-blue-400 cursor-help" />
                </h3>
                
                {/* Tooltip */}
                <div className="absolute left-0 top-full mt-2 w-80 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
                  <p className="font-bold mb-1 text-slate-200">Data Considered for AI Analysis:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li><span className="font-semibold text-white">IPS Risk Category:</span> {Array.isArray(portfolio.ips) ? portfolio.ips[0]?.risk_category : portfolio.ips?.risk_category || 'N/A'}</li>
                    <li><span className="font-semibold text-white">Target Allocations:</span> {(Array.isArray(portfolio.ips) ? portfolio.ips[0]?.target_allocations : portfolio.ips?.target_allocations)?.length || 0} asset classes</li>
                    <li><span className="font-semibold text-white">Current Holdings:</span> {holdings.length} securities</li>
                    <li><span className="font-semibold text-white">Available Securities:</span> {securities.length} options</li>
                  </ul>
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-800 rotate-45"></div>
                </div>
              </div>
              <button 
                onClick={handleGenerateAISuggestions}
                disabled={loadingAi}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
                {loadingAi ? 'Analyzing...' : 'Generate Suggestions'}
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

          {/* Holdings Editor */}
          <div className='space-y-2'>
            <h3 className='text-base font-bold text-slate-800'>Current Holdings</h3>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Security</th>
                    <th className="px-3 py-2 text-right">Current %</th>
                    <th className="px-3 py-2 text-center">Suggested %</th>
                    <th className="px-3 py-2 text-right">New %</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Units</th>
                    <th className="px-3 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holdings.map((holding, index) => {
                    const suggestion = Array.isArray(aiSuggestions?.suggestions) 
                      ? aiSuggestions.suggestions.find((s: any) => s.ticker === holding.security?.ticker)
                      : null;
                    return (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {holding.id?.startsWith('temp-') ? (
                            <select
                              value={holding.security_id}
                              onChange={(e) => handleSecurityChange(index, e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded p-1 text-sm"
                            >
                              {securities.map(s => (
                                <option key={s.id} value={s.id}>{s.security_name}</option>
                              ))}
                            </select>
                          ) : (
                            holding.security?.security_name
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{holding.allocated_percent.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-center font-mono">
                          {suggestion && typeof suggestion.suggested_allocation === 'number' ? (
                            <span className='text-blue-600 font-semibold' title={suggestion.action}>{suggestion.suggested_allocation.toFixed(2)}%</span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2"><input type="number" value={holding.allocated_percent} onChange={(e) => handleAllocationChange(index, parseFloat(e.target.value) || 0)} className="w-20 bg-white border border-slate-200 rounded text-right font-mono p-1" /></td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">${holding.allocated_amount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{holding.units.toFixed(4)}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => handleSellHolding(index)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Security Button */}
          <button
            onClick={handleAddHolding}
            className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Security to Rebalance
          </button>

          {/* Wallet / Sell Section */}
          <div className='flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200'>
            <Wallet className='w-6 h-6 text-slate-500' />
            <div>
              <h4 className='text-xs font-semibold text-slate-500 uppercase'>Cash Proceeds from Sales</h4>
              <p className='text-lg font-mono font-bold text-slate-900'>${walletAmount.toLocaleString()}</p>
            </div>
          </div>

          {/* Previously Held Section */}
          {previouslyHeld.length > 0 && (
            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                 <PackageOpen className='w-5 h-5 text-slate-400' />
                 <h3 className='text-sm font-bold text-slate-500'>Previously Held Securities</h3>
              </div>
              <div className='p-3 border border-slate-200 rounded-xl text-xs text-slate-500'>
                {previouslyHeld.map(h => h.security?.security_name).join(', ')}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm">Cancel</button>
          <button onClick={() => onSave(holdings, walletAmount)} disabled={walletAmount < 0} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 text-sm">Save Rebalance</button>
        </div>
      </div>
    </div>
  );
}
