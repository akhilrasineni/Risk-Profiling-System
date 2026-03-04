import { useState, useEffect } from 'react';
import { aiService } from '../services/aiService';
import { AIModel } from '../types';

export function useAIModel() {
  const [model, setModel] = useState<AIModel>(aiService.getModel());

  useEffect(() => {
    const handleChange = (newModel: AIModel) => setModel(newModel);
    aiService.subscribe(handleChange);
    return () => aiService.unsubscribe(handleChange);
  }, []);

  const updateModel = (newModel: AIModel) => {
    aiService.setModel(newModel);
  };

  return { model, updateModel };
}
