import { AIModel } from "../types";

export const AVAILABLE_MODELS: AIModel[] = [
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'groq/compound',
  'groq/compound-mini'
];

export const AI_MODEL_OPTIONS: { value: AIModel; label: string }[] = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash (Latest)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Reasoning)' },
  { value: 'qwen/qwen3-32b', label: 'Groq: Qwen 3 32B' },
  { value: 'llama-3.1-8b-instant', label: 'Groq: LLaMA 3.1 8B Instant' },
  { value: 'llama-3.3-70b-versatile', label: 'Groq: LLaMA 3.3 70B Versatile' },
  { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Groq: LLaMA 4 Scout 17B' },
  { value: 'moonshotai/kimi-k2-instruct-0905', label: 'Groq: Kimi K2 Instruct' },
  { value: 'groq/compound', label: 'Groq: Compound' },
  { value: 'groq/compound-mini', label: 'Groq: Compound Mini' }
];
