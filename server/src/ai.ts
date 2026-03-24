import fetch from 'node-fetch';
import { logger } from './logger';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export interface ClaudeResult {
  outputText: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000
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
      model: MODEL,
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
