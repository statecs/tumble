import fetch from 'node-fetch';
import { logger } from './logger';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const FABLE_MODEL = 'claude-fable-5';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-5.4';

export interface ClaudeResult {
  outputText: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000,
  model: string = MODEL
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
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
    logger.error(`[AI] Anthropic API error ${response.status}:`, JSON.stringify(errorData));
    throw new Error(`Anthropic API error (${response.status}): ${errorData.error?.message || errorData.message || 'Request failed'}`);
  }

  const data = await response.json() as any;

  if (data?.stop_reason === 'refusal') {
    logger.error('[AI] Anthropic request refused:', JSON.stringify(data.stop_details));
    throw new Error('The model declined to complete this rewrite. Try rephrasing the input.');
  }

  if (!data?.content?.[0]?.text || !data?.usage) {
    logger.error('[AI] Unexpected response structure:', JSON.stringify(data));
    throw new Error('Anthropic API returned unexpected response structure');
  }

  return {
    outputText: data.content[0].text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens
  };
}

export async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000
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
      model: OPENAI_MODEL,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
    logger.error(`[AI] OpenAI API error ${response.status}:`, JSON.stringify(errorData));
    throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || errorData.message || 'Request failed'}`);
  }

  const data = await response.json() as any;

  if (!data?.choices?.[0]?.message?.content || !data?.usage) {
    logger.error('[AI] Unexpected OpenAI response structure:', JSON.stringify(data));
    throw new Error('OpenAI API returned unexpected response structure');
  }

  return {
    outputText: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens
  };
}

export async function callAI(
  provider: 'claude' | 'openai' | 'fable',
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<ClaudeResult> {
  if (provider === 'openai') return callOpenAI(systemPrompt, userMessage, maxTokens);
  if (provider === 'fable') return callClaude(systemPrompt, userMessage, maxTokens, FABLE_MODEL);
  return callClaude(systemPrompt, userMessage, maxTokens);
}
