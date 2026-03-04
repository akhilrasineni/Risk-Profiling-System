import { AIModel } from "../types";

export const MODEL_FALLBACK_ORDER: AIModel[] = [
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash-latest',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash'
];

export const AI_MODEL_OPTIONS: { value: AIModel; label: string }[] = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash (Latest)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Reasoning)' },
  { value: 'gemini-2.5-flash-latest', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Exp)' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Legacy)' },
];
