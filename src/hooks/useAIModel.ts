import { useState, useEffect } from 'react';
import { aiService } from '../services/aiService';
import { AIModel } from '../types';

/**
 * Custom hook to manage the selected AI model.
 * It provides the current model and a function to update it,
 * while staying in sync with the global aiService.
 * 
 * @returns An object containing the current model and an update function.
 */
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
