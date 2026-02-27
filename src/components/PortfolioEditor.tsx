import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, AlertCircle, Check, SlidersHorizontal, Wallet } from 'lucide-react';
import RebalanceModal from './RebalanceModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface Security {
  id: string;
  security_name: string;
  ticker?: string;
  asset_class: string;
  current_price?: number;
}

interface Holding {
  id?: string;
  security_id: string;
  allocated_percent: number;
  allocated_amount: number;
  units: number;
  security?: Security;
}

interface PortfolioEditorProps {
  portfolio: any;
  onSave: () => void;
  viewerRole: 'advisor' | 'client';
}

export default function PortfolioEditor({ portfolio, onSave, viewerRole }: PortfolioEditorProps) {
  const [holdings, setHoldings] = useState<Holding[]>(portfolio.holdings || []);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [walletAmount, setWalletAmount] = useState<number>(portfolio.cash_balance || 0);
  const [holdingToDelete, setHoldingToDelete] = useState<number | null>(null);

  useEffect(() => {
    const fetchSecurities = async () => {
      const res = await fetch('/api/portfolios/securities/all');
      const data = await res.json();
      if (data.status === 'ok') {
        setSecurities(data.data);
      }
    };
    fetchSecurities();
  }, []);

  const handleAddHolding = () => {
    if (securities.length === 0) return;
    const firstSec = securities[0];
    setHoldings([...holdings, {
      security_id: firstSec.id,
      allocated_percent: 0,
      allocated_amount: 0,
      units: 0,
      security: firstSec
    }]);
  };

  const handleRebalanceRemove = async (index: number) => {
    const removedHolding = holdings[index];
    const newHoldings = holdings.filter((_, i) => i !== index);

    // After removing, re-distribute the removed percentage among remaining holdings
    const remainingTotalPercent = newHoldings.reduce((sum, h) => sum + h.allocated_percent, 0);
    
    let finalHoldings = newHoldings;
    if (remainingTotalPercent > 0 && newHoldings.length > 0 && removedHolding) {
      const targetTotalPercent = remainingTotalPercent + removedHolding.allocated_percent;
      const factor = targetTotalPercent / remainingTotalPercent;
      finalHoldings = newHoldings.map(h => {
        const newPercent = h.allocated_percent * factor;
        const newAmount = totalPortfolioValue * (newPercent / 100);
        const newUnits = h.security && h.security.current_price > 0 ? newAmount / h.security.current_price : 0;
        return { 
          ...h, 
          allocated_percent: newPercent,
          allocated_amount: newAmount,
          units: newUnits
        };
      });
    }
    setHoldings(finalHoldings);
    const newTotalAllocated = finalHoldings.reduce((sum, h) => sum + h.allocated_amount, 0);
    const newWalletAmount = totalPortfolioValue - newTotalAllocated;
    setWalletAmount(newWalletAmount);
    await handleSave(finalHoldings, newWalletAmount);
  };

  const handleSellAndRemove = async (index: number) => {
    const soldHolding = holdings[index];
    let newWalletAmount = walletAmount;
    if (soldHolding) {
      newWalletAmount += soldHolding.allocated_amount;
      setWalletAmount(newWalletAmount);
    }
    const newHoldings = holdings.filter((_, i) => i !== index);
    setHoldings(newHoldings);
    await handleSave(newHoldings, newWalletAmount);
  };

  const totalPortfolioValue = portfolio.total_investment_amount + (portfolio.cash_balance || 0);

  const handleUpdateHolding = (index: number, updates: Partial<Holding>) => {
    const newHoldings = [...holdings];
    const current = newHoldings[index];
    
    if (updates.security_id) {
      const sec = securities.find(s => s.id === updates.security_id);
      if (sec) {
        updates.security = sec;
        if (current.allocated_amount > 0) {
          updates.units = sec.current_price > 0 ? current.allocated_amount / sec.current_price : 0;
        }
      }
    }

    if (updates.allocated_amount !== undefined) {
      const price = updates.security?.current_price || current.security?.current_price || 0;
      updates.units = price > 0 ? updates.allocated_amount / price : 0;
      updates.allocated_percent = totalPortfolioValue > 0 
        ? (updates.allocated_amount / totalPortfolioValue) * 100 
        : 0;
    } else if (updates.allocated_percent !== undefined) {
      updates.allocated_amount = totalPortfolioValue * (updates.allocated_percent / 100);
      const price = updates.security?.current_price || current.security?.current_price || 0;
      updates.units = price > 0 ? updates.allocated_amount / price : 0;
    }

    newHoldings[index] = { ...current, ...updates };
    setHoldings(newHoldings);
    
    const newTotalAllocated = newHoldings.reduce((sum, h) => sum + h.allocated_amount, 0);
    setWalletAmount(totalPortfolioValue - newTotalAllocated);
  };

  const handleSave = async (updatedHoldings?: Holding[], updatedCashBalance?: number) => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/portfolios/${portfolio.id}/holdings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          holdings: updatedHoldings || holdings,
          cash_balance: updatedCashBalance !== undefined ? updatedCashBalance : walletAmount
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setSuccess(true);
        onSave();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPercent = holdings.reduce((sum, h) => sum + h.allocated_percent, 0);
  const totalAmount = holdings.reduce((sum, h) => sum + h.allocated_amount, 0);

  const isAdvisor = viewerRole === 'advisor';
  const isHolding = portfolio.approval_status !== 'Pending';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Portfolio Construction</h3>
          <p className="text-sm text-slate-500">
            Status: <span className="font-semibold text-blue-600">
              {portfolio.approval_status === 'Pending' ? 'Portfolio Drafted' : 'Holdings'}
            </span>
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            <Wallet className="w-5 h-5 text-slate-500" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Cash</span>
              <span className="font-mono font-bold text-slate-900 leading-none">${walletAmount.toLocaleString()}</span>
            </div>
          </div>

          {isAdvisor && (
            <div className='flex items-center gap-3'>
              {!isHolding && (
                <button
                  onClick={() => handleSave()}
                  disabled={saving || totalPercent > 100.01 || walletAmount < -0.01}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              )}

              <button
                onClick={() => setShowRebalanceModal(true)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Rebalance
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-emerald-700">
          <Check className="w-5 h-5 shrink-0" />
          <p className="text-sm">Portfolio holdings updated successfully.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {holdings.map((holding, index) => (
          <div key={index} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col md:flex-row items-start md:items-center p-4 gap-4 md:gap-6">
            
            <div className="flex-1 min-w-0 w-full md:w-auto border-b md:border-b-0 border-slate-100 pb-4 md:pb-0">
              {isAdvisor ? (
                <select
                  value={holding.security_id}
                  onChange={(e) => handleUpdateHolding(index, { security_id: e.target.value })}
                  className="w-full bg-transparent border-none focus:ring-0 font-bold text-slate-900 text-base p-0 truncate"
                >
                  {securities.map(s => (
                    <option key={s.id} value={s.id}>{s.security_name}</option>
                  ))}
                </select>
              ) : (
                <h4 className="font-bold text-slate-900 text-base truncate">{holding.security?.security_name}</h4>
              )}
              <p className="text-xs text-slate-500 font-mono truncate">{holding.security?.ticker} • {holding.security?.asset_class}</p>
            </div>

            {/* Allocation, Value, Units - Flex container for medium screens up */}
            <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-4 md:gap-6 text-sm">
              
              {/* Allocation */}
              <div className='flex md:flex-col justify-between md:justify-start items-center md:items-start w-full md:w-auto'>
                <p className="md:hidden text-xs text-slate-400 uppercase font-bold">Allocation</p>
                <p className="hidden md:block text-xs text-slate-400 uppercase font-bold mb-1">Allocation</p>
                {isAdvisor ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={holding.allocated_percent}
                      onChange={(e) => handleUpdateHolding(index, { allocated_percent: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-slate-50 border border-slate-200 rounded-md text-right font-mono p-1 text-sm font-bold text-slate-900"
                    />
                    <span className="text-sm font-bold text-slate-500">%</span>
                  </div>
                ) : (
                  <p className="text-base md:text-lg font-mono font-bold text-slate-900">{holding.allocated_percent.toFixed(2)}%</p>
                )}
              </div>

              {/* Market Value */}
              <div className='flex md:flex-col justify-between md:justify-start items-center md:items-start w-full md:w-auto'>
                <p className="md:hidden text-xs text-slate-400 uppercase font-bold">Market Value</p>
                <p className="hidden md:block text-xs text-slate-400 uppercase font-bold mb-1">Market Value</p>
                {isAdvisor ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-slate-500">$</span>
                    <input
                      type="number"
                      value={holding.allocated_amount}
                      onChange={(e) => handleUpdateHolding(index, { allocated_amount: parseFloat(e.target.value) || 0 })}
                      className="w-28 bg-slate-50 border border-slate-200 rounded-md text-right font-mono p-1 text-sm font-bold text-slate-900"
                    />
                  </div>
                ) : (
                  <p className="text-base md:text-lg font-mono font-bold text-slate-900">${holding.allocated_amount.toLocaleString()}</p>
                )}
              </div>

              {/* Units & Price */}
              <div className="flex md:flex-col justify-between md:justify-start items-center md:items-end text-xs font-mono text-slate-500 min-w-[120px] w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 mt-4 md:mt-0">
                <p className="md:hidden text-xs text-slate-400 uppercase font-bold">Details</p>
                <div className="flex flex-col md:items-end">
                  <span>UNITS: <span className='font-semibold text-slate-600'>{holding.units.toFixed(4)}</span></span>
                  <span>PRICE: <span className='font-semibold text-slate-600'>${holding.security?.current_price?.toLocaleString() || '0'}</span></span>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            {isAdvisor && (
              <div className="w-full md:w-auto md:ml-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 mt-4 md:mt-0 flex justify-end">
                <button
                  onClick={() => setHoldingToDelete(index)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Summary */}
      <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl mt-4">
        <span className="font-bold text-slate-700">Total Allocation</span>
        <span className={`font-mono font-bold text-lg ${totalPercent > 100.01 ? 'text-red-600' : totalPercent < 99.99 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {totalPercent.toFixed(2)}%
        </span>
      </div>

      {isAdvisor && (
        <button
          onClick={handleAddHolding}
          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Security Holding
        </button>
      )}

      {totalPercent > 100.01 && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3 text-amber-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">Total allocation cannot exceed 100%. Current: {totalPercent.toFixed(2)}%</p>
        </div>
      )}

      {showRebalanceModal && (
        <RebalanceModal 
          portfolio={{...portfolio, cash_balance: walletAmount}}
          securities={securities}
          onClose={() => setShowRebalanceModal(false)}
          onSave={async (updatedHoldings, updatedCashBalance) => {
            setHoldings(updatedHoldings);
            setWalletAmount(updatedCashBalance);
            await handleSave(updatedHoldings, updatedCashBalance);
            setShowRebalanceModal(false);
          }}
        />
      )}

      {holdingToDelete !== null && (
        <DeleteConfirmationModal 
          holdingName={holdings[holdingToDelete]?.security?.security_name || 'this security'}
          onClose={() => setHoldingToDelete(null)}
          onSell={() => {
            handleSellAndRemove(holdingToDelete);
            setHoldingToDelete(null);
          }}
          onRebalance={() => {
            handleRebalanceRemove(holdingToDelete);
            setHoldingToDelete(null);
          }}
        />
      )}
    </div>
  );
}
