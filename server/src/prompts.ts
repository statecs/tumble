export interface CategorizationResult {
  category: string;
  suggestedTags: string[];
  confidence: number;
}

export function buildCategorizationSystem(): string {
  return `You are a text classifier. Given a text, classify it into one of these categories: blog-post, email, social-media, technical-doc, personal-note, presentation, marketing-copy, other.

Also suggest 2-5 relevant tags (single words or short phrases) that describe the content or topic.

Return ONLY valid JSON in this exact format with no other text:
{"category": "blog-post", "suggestedTags": ["technology", "tutorial"], "confidence": 0.9}`;
}

export function buildCategorizationUser(content: string): string {
  return content.slice(0, 3000);
}

export function parseCategorizationResult(text: string): CategorizationResult {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      category: parsed.category || 'other',
      suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0
    };
  } catch {
    return { category: 'other', suggestedTags: [], confidence: 0 };
  }
}

export function buildRewriteSystem(examples: Array<{ title: string; content: string; category: string }>, preferences?: string, language: string = 'English'): string {
  const examplesBlock = examples
    .map((ex, i) => {
      const excerpt = ex.content.slice(0, 800);
      return `--- Example ${i + 1} (${ex.category}) ---\nTitle: ${ex.title}\n${excerpt}`;
    })
    .join('\n\n');

  const preferencesBlock = preferences?.trim()
    ? `\n---\nAdditional preferences from the author:\n${preferences.trim()}\n---\n`
    : '';

  return `You are a writing assistant that rewrites text to match a specific author's voice and style.

Study these writing samples from the author's library carefully:

${examplesBlock}
${preferencesBlock}
When rewriting, preserve:
- Sentence rhythm and length patterns
- Vocabulary level and word choices
- Tone (formal/informal, warm/clinical, etc.)
- Structural patterns (how paragraphs are opened/closed)
- Any distinctive quirks or recurring phrases

Rewrite the text to sound authentically like this author. Do not add explanations or meta-commentary — return only the rewritten text.

Write the output in ${language}.`;
}

export function buildRewriteUser(inputText: string): string {
  return `Rewrite the following text in the author's voice:\n\n${inputText}`;
}
