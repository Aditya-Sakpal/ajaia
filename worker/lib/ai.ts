import type { ChatMessage } from './aiPrompts';

export interface AiClient {
  complete(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string>;
}

export const DEFAULT_AI_MODEL = 'gpt-5.4-mini';

/** Minimal OpenAI Chat Completions client (fetch-based, Workers-friendly). */
export function openAiClient(apiKey: string, model = DEFAULT_AI_MODEL): AiClient {
  return {
    async complete(messages, opts = {}) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          reasoning_effort: 'low',
          max_completion_tokens: opts.maxTokens ?? 1500,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}
