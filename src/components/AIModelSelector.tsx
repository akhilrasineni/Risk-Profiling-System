import { ChevronDown } from 'lucide-react';
import { AIModel } from '../types';
import { AI_MODEL_OPTIONS } from '../constants/aiModels';

interface AIModelSelectorProps {
  selectedModel: AIModel;
  onSelectModel: (model: AIModel) => void;
  className?: string;
}

export default function AIModelSelector({ selectedModel, onSelectModel, className = '' }: AIModelSelectorProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={selectedModel}
        onChange={(e) => onSelectModel(e.target.value as AIModel)}
        className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:bg-slate-100 transition-colors w-full"
      >
        {AI_MODEL_OPTIONS.map(model => (
          <option key={model.value} value={model.value}>{model.label}</option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
