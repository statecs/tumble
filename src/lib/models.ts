// Mirrors server/src/models.ts. Keep the two lists in sync when adding a model.

export interface ModelOption {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'google';
  /** Set when the model sits behind a limited-access program. */
  gated?: string;
}

export const MODELS: ModelOption[] = [
  { id: 'claude-sonnet', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', provider: 'anthropic' },
  { id: 'claude-fable', label: 'Claude Fable 5', provider: 'anthropic' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'anthropic' },
  { id: 'gpt-5-4', label: 'GPT-5.4', provider: 'openai' },
  { id: 'gpt-5-6-sol', label: 'GPT-5.6 Sol', provider: 'openai' },
  { id: 'gemini-3-8-flash', label: 'Gemini 3.8 Flash', provider: 'google' },
  {
    id: 'gemini-3-1-pro',
    label: 'Gemini 3.1 Pro',
    provider: 'google',
    gated: 'Preview-only — your key may not have access yet.'
  },
  {
    id: 'gpt-6-astra',
    label: 'GPT-6 Astra',
    provider: 'openai',
    gated: "Rolling out through OpenAI's Trusted Access Program — your key may not have access yet."
  }
];

export const DEFAULT_MODEL_ID = 'claude-sonnet';
