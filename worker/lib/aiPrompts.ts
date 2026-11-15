/** Prompt construction and output parsing for the AI writing assistant. Pure functions, unit-tested. */

export type AiAction =
  | 'continue'
  | 'summarize'
  | 'meeting_notes'
  | 'email_draft'
  | 'improve'
  | 'shorter'
  | 'longer'
  | 'fix_grammar'
  | 'custom';

/** Where the client puts the generated text. */
export type Placement = 'replace_selection' | 'replace_document' | 'insert';
/** What the model reports: does its text replace the target, or add new content? */
export type ModelPlacement = 'replace' | 'insert';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const AI_ACTIONS: { id: AiAction; label: string; rewrite: boolean }[] = [
  { id: 'continue', label: 'Continue writing', rewrite: false },
  { id: 'summarize', label: 'Summarize', rewrite: false },
  { id: 'meeting_notes', label: 'Meeting notes', rewrite: false },
  { id: 'email_draft', label: 'Email draft', rewrite: false },
  { id: 'improve', label: 'Improve writing', rewrite: true },
  { id: 'shorter', label: 'Make shorter', rewrite: true },
  { id: 'longer', label: 'Make longer', rewrite: true },
  { id: 'fix_grammar', label: 'Fix spelling & grammar', rewrite: true },
  { id: 'custom', label: 'Custom prompt', rewrite: false },
];

const isRewrite = (a: AiAction) => AI_ACTIONS.find((x) => x.id === a)?.rewrite ?? false;

const CONTEXT_CHARS = 12_000;
const COMPLETION_CHARS = 1_500;

/** JSON schema for OpenAI structured outputs (strict mode). */
export const GENERATE_SCHEMA = {
  name: 'ajaia_ai_edit',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['placement', 'markdown'],
    properties: {
      placement: {
        type: 'string',
        enum: ['replace', 'insert'],
        description: '"replace" when the markdown is a rewritten version of the target text; "insert" when it is new content to add.',
      },
      markdown: { type: 'string', description: 'The text to put in the document, as Markdown.' },
    },
  },
} as const;

const SYSTEM = [
  'You are the writing assistant inside Ajaia Docs, a collaborative document editor.',
  'Respond with JSON: {"placement": "replace" | "insert", "markdown": string}.',
  '"markdown" is only the text to put into the document, formatted as Markdown (headings with #, **bold**, *italic*, bulleted or numbered lists):',
  'no preamble, no code fences, no commentary about what you did. Match the language and tone of the document.',
  'Use "replace" when your markdown is a transformed version of the target text (shortened, expanded, rewritten, corrected, translated, reformatted, restructured),',
  'so it should take the place of that text. Use "insert" when you are adding new content (continuing, drafting, adding a section, answering a question).',
  'When replacing, return the complete replacement for the whole target text, not just the changed part.',
].join(' ');

const INSTRUCTIONS: Record<Exclude<AiAction, 'custom'>, string> = {
  continue: 'Continue the document naturally from where it ends with one or two short paragraphs. placement: insert.',
  summarize: 'Write a concise summary of the document as a short heading followed by 3-6 bullet points. placement: insert.',
  meeting_notes:
    'Write meeting notes for this document: a heading, then Attendees, Agenda, Discussion, Decisions and Action items (with owners) sections. Use the document for facts and clear placeholders like [Name] where facts are missing. placement: insert.',
  email_draft:
    'Write a short, professional email draft based on the document: a Subject line, greeting, body and sign-off. Use [Name] placeholders where needed. placement: insert.',
  improve: 'Rewrite the target text to be clearer and more polished. Keep its meaning, structure and approximate length. placement: replace.',
  shorter: 'Rewrite the target text to be about half as long while keeping the key points and its structure. placement: replace.',
  longer: 'Expand the target text with more detail and examples, keeping the same voice and structure. placement: replace.',
  fix_grammar: 'Fix spelling, grammar and punctuation in the target text. Change nothing else. placement: replace.',
};

const tail = (s: string, n: number) => (s.length > n ? s.slice(s.length - n) : s);

export function buildGenerateMessages(input: {
  action: AiAction;
  context: string;
  selection?: string;
  prompt?: string;
}): ChatMessage[] {
  if (!AI_ACTIONS.some((a) => a.id === input.action)) throw new Error('Unknown action.');
  const prompt = input.prompt?.trim();
  if (input.action === 'custom' && !prompt) throw new Error('Write a prompt first.');
  const context = input.context ?? '';
  const selection = input.selection?.trim();

  if (isRewrite(input.action) && !selection) {
    // No selection: the rewrite applies to the entire document.
    if (!context.trim()) throw new Error('There is nothing in the document to rewrite yet.');
    return [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          `Task: ${INSTRUCTIONS[input.action as Exclude<AiAction, 'custom'>]}`,
          'Target text: the entire document below. Return the full rewritten document.',
          `Entire document:\n"""\n${context.slice(0, CONTEXT_CHARS)}\n"""`,
        ].join('\n\n'),
      },
    ];
  }

  const parts: string[] = [];
  if (input.action === 'custom') {
    parts.push(`Request: ${prompt}`);
    parts.push(
      selection
        ? 'Target text: the selected text below. If the request transforms it, use placement "replace" and return the full replacement for the selection.'
        : 'Target text: the entire document below. If the request transforms the existing document (e.g. shorten, rewrite, translate, fix, reformat it), use placement "replace" and return the full new document. If it asks for new content, use "insert".',
    );
  } else {
    parts.push(`Task: ${INSTRUCTIONS[input.action]}`);
  }
  parts.push(`Document so far:\n"""\n${tail(context, CONTEXT_CHARS)}\n"""`);
  if (selection) parts.push(`Selected text:\n"""\n${selection.slice(0, CONTEXT_CHARS)}\n"""`);
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** Presets are deterministic; only custom prompts follow the model's choice. */
export function resolvePlacement(action: AiAction, hasSelection: boolean, model: ModelPlacement): Placement {
  if (isRewrite(action)) return hasSelection ? 'replace_selection' : 'replace_document';
  if (action !== 'custom') return 'insert';
  if (model === 'replace') return hasSelection ? 'replace_selection' : 'replace_document';
  return 'insert';
}

const stripFences = (s: string) =>
  s
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

/** Parses the model's structured output; throws on anything malformed. */
export function parseGenerateResult(raw: string): { placement: ModelPlacement; markdown: string } {
  const parsed: unknown = JSON.parse(stripFences(raw ?? ''));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('AI output is not an object.');
  const { placement, markdown } = parsed as { placement?: unknown; markdown?: unknown };
  if (placement !== 'replace' && placement !== 'insert') throw new Error('AI output has an invalid placement.');
  if (typeof markdown !== 'string') throw new Error('AI output has no markdown.');
  return { placement, markdown: stripFences(markdown) };
}

export function buildCompletionMessages(before: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an autocomplete engine in a document editor. Continue the text with the most likely next words: at most 15 words, ending at a natural point. Output only the continuation as plain text, without repeating the given text, without quotes or Markdown. If no sensible continuation exists, output nothing.',
    },
    { role: 'user', content: tail(before, COMPLETION_CHARS) },
  ];
}
