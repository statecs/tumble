import fetch from 'node-fetch';
import { logger } from './logger';
import { ModelSpec, resolveModel } from './models';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ClaudeResult {
  outputText: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseError(body: string): any {
  try { return JSON.parse(body); } catch { return { message: body }; }
}

async function callAnthropic(
  spec: ModelSpec,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: spec.apiModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
  });

  if (!response.ok) {
    const errorData = parseError(await response.text());
    logger.error(`[AI] Anthropic API error ${response.status} (${spec.apiModel}):`, JSON.stringify(errorData));
    const detail = errorData.error?.message || errorData.message || 'Request failed';
    if ((response.status === 403 || response.status === 404) && spec.gated) {
      throw new Error(`${spec.label} is unavailable: ${spec.gated}`);
    }
    throw new Error(`Anthropic API error (${response.status}): ${detail}`);
  }

  const data = await response.json() as any;

  if (data?.stop_reason === 'refusal') {
    logger.error('[AI] Anthropic request refused:', JSON.stringify(data.stop_details));
    throw new Error(`${spec.label} declined to answer that. Try rephrasing, or switch models.`);
  }

  const text = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
    : '';

  if (!text || !data?.usage) {
    logger.error('[AI] Unexpected Anthropic response structure:', JSON.stringify(data));
    throw new Error('Anthropic API returned unexpected response structure');
  }

  return {
    outputText: text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens
  };
}

async function callOpenAI(
  spec: ModelSpec,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<ClaudeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: spec.apiModel,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ]
    })
  });

  if (!response.ok) {
    const errorData = parseError(await response.text());
    logger.error(`[AI] OpenAI API error ${response.status} (${spec.apiModel}):`, JSON.stringify(errorData));
    const detail = errorData.error?.message || errorData.message || 'Request failed';
    if ((response.status === 403 || response.status === 404) && spec.gated) {
      throw new Error(`${spec.label} is unavailable: ${spec.gated}`);
    }
    throw new Error(`OpenAI API error (${response.status}): ${detail}`);
  }

  const data = await response.json() as any;
  const choice = data?.choices?.[0];

  // Reasoning models spend max_completion_tokens on reasoning before any visible
  // output, so a too-small budget returns finish_reason "length" with empty content.
  if (!choice?.message?.content && choice?.finish_reason === 'length') {
    logger.error(`[AI] ${spec.apiModel} exhausted the token budget before producing output`);
    throw new Error(`${spec.label} ran out of tokens before answering. Try a shorter input.`);
  }

  if (!choice?.message?.content || !data?.usage) {
    logger.error('[AI] Unexpected OpenAI response structure:', JSON.stringify(data));
    throw new Error('OpenAI API returned unexpected response structure');
  }

  return {
    outputText: choice.message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens
  };
}

async function callGemini(
  spec: ModelSpec,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<ClaudeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const response = await fetch(`${GEMINI_ENDPOINT}/${spec.apiModel}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      // Gemini takes the system prompt as its own field, not as a message,
      // and calls the assistant role "model".
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    logger.error(`[AI] Gemini API error ${response.status} (${spec.apiModel}):`, raw || '(empty body)');

    // A credential that authenticates but cannot generate content gets a 404
    // with no body at all - metadata calls still succeed, which makes this
    // very hard to read without the hint. Live API ephemeral tokens ("AQ....")
    // behave this way; content generation needs an AI Studio key ("AIza...").
    if (response.status === 404 && !raw.trim()) {
      throw new Error(
        'Gemini rejected the request: GEMINI_API_KEY authenticates but is not authorized to generate content. Use a Google AI Studio API key (starts with "AIza").'
      );
    }

    const errorData = parseError(raw);
    const detail = errorData.error?.message || errorData.message || 'Request failed';
    if ((response.status === 403 || response.status === 404) && spec.gated) {
      throw new Error(`${spec.label} is unavailable: ${spec.gated}`);
    }
    throw new Error(`Gemini API error (${response.status}): ${detail}`);
  }

  const data = await response.json() as any;

  if (data?.promptFeedback?.blockReason) {
    logger.error('[AI] Gemini blocked the prompt:', JSON.stringify(data.promptFeedback));
    throw new Error(`${spec.label} blocked that request (${data.promptFeedback.blockReason}). Try rephrasing, or switch models.`);
  }

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p: any) => p?.text)
    .filter(Boolean)
    .join('');

  if (!text) {
    // Gemini 3.x models think before answering, so a tight budget can be spent
    // entirely on reasoning - same failure shape as the OpenAI reasoning models.
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error(`${spec.label} ran out of tokens before answering. Try a shorter input.`);
    }
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
      throw new Error(`${spec.label} declined to answer that. Try rephrasing, or switch models.`);
    }
    logger.error('[AI] Unexpected Gemini response structure:', JSON.stringify(data));
    throw new Error('Gemini API returned unexpected response structure');
  }

  return {
    outputText: text,
    inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0
  };
}

/** Multi-turn. `modelId` is a registry id; unknown ids fall back to the default. */
export async function callAIChat(
  modelId: string | undefined,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<ClaudeResult> {
  const spec = resolveModel(modelId);
  if (spec.provider === 'openai') return callOpenAI(spec, systemPrompt, messages, maxTokens);
  if (spec.provider === 'google') return callGemini(spec, systemPrompt, messages, maxTokens);
  return callAnthropic(spec, systemPrompt, messages, maxTokens);
}

/** Single-turn convenience wrapper. */
export function callAI(
  modelId: string | undefined,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<ClaudeResult> {
  return callAIChat(modelId, systemPrompt, [{ role: 'user', content: userMessage }], maxTokens);
}
