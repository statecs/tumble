// Single source of truth for selectable models. Adding a model here is all that
// is needed server-side; the frontend list in src/lib/models.ts must match.

export type Provider = 'anthropic' | 'openai';

export interface ModelSpec {
  /** Stable id used on the wire and stored in the UI. */
  id: string;
  label: string;
  provider: Provider;
  /** The string the provider's API expects. */
  apiModel: string;
  /** Set for models behind a limited-access program, so failures can be explained. */
  gated?: string;
}

export const MODELS: ModelSpec[] = [
  { id: 'claude-sonnet', label: 'Claude Sonnet 4.6', provider: 'anthropic', apiModel: 'claude-sonnet-4-6' },
  { id: 'claude-fable', label: 'Claude Fable 5', provider: 'anthropic', apiModel: 'claude-fable-5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'anthropic', apiModel: 'claude-fable-5-1' },
  { id: 'gpt-5-4', label: 'GPT-5.4', provider: 'openai', apiModel: 'gpt-5.4' },
  { id: 'gpt-5-6-sol', label: 'GPT-5.6 Sol', provider: 'openai', apiModel: 'gpt-5.6-sol' },
  {
    id: 'gpt-6-astra',
    label: 'GPT-6 Astra',
    provider: 'openai',
    apiModel: 'gpt-6-astra',
    gated: "GPT-6 Astra is rolling out through OpenAI's Trusted Access Program; your API key may not have access yet."
  }
];

export const DEFAULT_MODEL_ID = 'claude-sonnet';

/** Ids sent by older frontend builds. */
const LEGACY_IDS: Record<string, string> = {
  claude: 'claude-sonnet',
  fable: 'claude-fable',
  openai: 'gpt-5-4'
};

export function resolveModel(id?: string): ModelSpec {
  const wanted = (id && LEGACY_IDS[id]) || id || DEFAULT_MODEL_ID;
  return MODELS.find(m => m.id === wanted)
    ?? MODELS.find(m => m.id === DEFAULT_MODEL_ID)!;
}
