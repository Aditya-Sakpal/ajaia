import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { loadDocWithAccess } from '../lib/access';
import {
  GENERATE_SCHEMA,
  buildCompletionMessages,
  buildGenerateMessages,
  parseGenerateResult,
  resolvePlacement,
  type ChatMessage,
} from '../lib/aiPrompts';
import { ApiError } from '../lib/errors';
import { parseBody } from '../lib/validation';

const ACTIONS = [
  'continue',
  'summarize',
  'meeting_notes',
  'email_draft',
  'improve',
  'shorter',
  'longer',
  'fix_grammar',
  'custom',
] as const;

const completeSchema = z.object({ before: z.string().max(20_000) });
const generateSchema = z.object({
  action: z.enum(ACTIONS, { error: 'Unknown AI action.' }),
  context: z.string().max(200_000).default(''),
  selection: z.string().max(50_000).optional(),
  prompt: z.string().max(2_000).optional(),
});

function requireAi(c: Context<AppEnv>) {
  const ai = c.var.ai;
  if (!ai) throw new ApiError(503, 'ai_unavailable', 'AI writing is not configured on this server.');
  return ai;
}

const aiFailed = () => new ApiError(502, 'ai_failed', 'The AI assistant could not respond. Please try again.');

export const aiRoutes = new Hono<AppEnv>()
  .post('/:id/ai/complete', async (c) => {
    await loadDocWithAccess(c, c.req.param('id'), 'edit');
    const ai = requireAi(c);
    const { before } = await parseBody(c, completeSchema);
    if (!before.trim()) return c.json({ completion: '' });
    let text: string;
    try {
      text = await ai.complete(buildCompletionMessages(before), { maxTokens: 300 });
    } catch (err) {
      console.error('AI completion failed', err);
      throw aiFailed();
    }
    return c.json({ completion: text.replace(/\s+/g, ' ').trim() });
  })
  .post('/:id/ai/generate', async (c) => {
    await loadDocWithAccess(c, c.req.param('id'), 'edit');
    const ai = requireAi(c);
    const input = await parseBody(c, generateSchema);
    let messages: ChatMessage[];
    try {
      messages = buildGenerateMessages(input);
    } catch (err) {
      throw new ApiError(400, 'invalid_request', (err as Error).message);
    }
    let result: ReturnType<typeof parseGenerateResult>;
    try {
      result = parseGenerateResult(await ai.completeJson(messages, GENERATE_SCHEMA, { maxTokens: 6000 }));
    } catch (err) {
      console.error('AI generation failed', err);
      throw aiFailed();
    }
    const markdown = result.markdown.trim();
    if (!markdown) throw aiFailed();
    const hasSelection = Boolean(input.selection?.trim());
    return c.json({ markdown, placement: resolvePlacement(input.action, hasSelection, result.placement) });
  });
