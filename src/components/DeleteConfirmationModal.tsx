import React from 'react';
import { X, DollarSign, SlidersHorizontal, AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  holdingName: string;
  onClose: () => void;
  onSell: () => void;
  onRebalance: () => void;
}

export default function DeleteConfirmationModal({ holdingName, onClose, onSell, onRebalance }: DeleteConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="mx-auto bg-amber-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Remove {holdingName}?</h3>
          <p className="text-sm text-slate-500 mt-2">
            How would you like to handle the proceeds from this security?
          </p>
        </div>

        <div className="p-6 space-y-3">
            <button 
              onClick={onSell}
              className='w-full flex items-center gap-3 text-left p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors'
            >
                <DollarSign className='w-5 h-5 text-slate-500' />
                <div>
                    <p className='font-semibold text-slate-800'>Sell Security</p>
                    <p className='text-xs text-slate-500'>Move proceeds to cash wallet and remove from portfolio.</p>
                </div>
            </button>
            <button 
              onClick={onRebalance}
              className='w-full flex items-center gap-3 text-left p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors'
            >
                <SlidersHorizontal className='w-5 h-5 text-slate-500' />
                <div>
                    <p className='font-semibold text-slate-800'>Rebalance Portfolio</p>
                    <p className='text-xs text-slate-500'>Remove and re-distribute allocation to other holdings.</p>
                </div>
            </button>
        </div>

        <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
