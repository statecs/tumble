// Mirrors server/src/models.ts. Keep the two lists in sync when adding a model.

export interface ModelOption {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai';
  /** Set when the model sits behind a limited-access program. */
  gated?: string;
}

export const MODELS: ModelOption[] = [
  { id: 'claude-sonnet', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-fable', label: 'Claude Fable 5', provider: 'anthropic' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'anthropic' },
  { id: 'gpt-5-4', label: 'GPT-5.4', provider: 'openai' },
  { id: 'gpt-5-6-sol', label: 'GPT-5.6 Sol', provider: 'openai' },
  {
    id: 'gpt-6-astra',
    label: 'GPT-6 Astra',
    provider: 'openai',
    gated: "Rolling out through OpenAI's Trusted Access Program — your key may not have access yet."
  }
];

export const DEFAULT_MODEL_ID = 'claude-sonnet';
