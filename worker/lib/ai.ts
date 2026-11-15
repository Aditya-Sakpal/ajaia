import type { ChatMessage } from './aiPrompts';

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface AiClient {
  /** Plain-text completion. */
  complete(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string>;
  /** Structured output constrained to `schema`; returns the raw JSON text for the caller to validate. */
  completeJson(messages: ChatMessage[], schema: JsonSchemaSpec, opts?: { maxTokens?: number }): Promise<string>;
}

export const DEFAULT_AI_MODEL = 'gpt-5.4-mini';

/** Minimal OpenAI Chat Completions client (fetch-based, Workers-friendly). */
export function openAiClient(apiKey: string, model = DEFAULT_AI_MODEL): AiClient {
  async function call(body: Record<string, unknown>): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, reasoning_effort: 'low', ...body }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
    };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new Error(`OpenAI refused: ${choice.message.refusal}`);
    if (choice?.finish_reason === 'length') throw new Error('OpenAI output was cut off (length).');
    return choice?.message?.content ?? '';
  }

  return {
    complete: (messages, opts = {}) => call({ messages, max_completion_tokens: opts.maxTokens ?? 1500 }),
    completeJson: (messages, schema, opts = {}) =>
      call({
        messages,
        max_completion_tokens: opts.maxTokens ?? 4000,
        response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } },
      }),
  };
}
