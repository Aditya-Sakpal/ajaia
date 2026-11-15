/** Prompt construction for the AI writing assistant. Pure functions, unit-tested. */

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

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const AI_ACTIONS: { id: AiAction; label: string; needsSelection: boolean }[] = [
  { id: 'continue', label: 'Continue writing', needsSelection: false },
  { id: 'summarize', label: 'Summarize', needsSelection: false },
  { id: 'meeting_notes', label: 'Meeting notes', needsSelection: false },
  { id: 'email_draft', label: 'Email draft', needsSelection: false },
  { id: 'improve', label: 'Improve writing', needsSelection: true },
  { id: 'shorter', label: 'Make shorter', needsSelection: true },
  { id: 'longer', label: 'Make longer', needsSelection: true },
  { id: 'fix_grammar', label: 'Fix spelling & grammar', needsSelection: true },
  { id: 'custom', label: 'Custom prompt', needsSelection: false },
];

const CONTEXT_CHARS = 12_000;
const COMPLETION_CHARS = 1_500;

const SYSTEM = [
  'You are the writing assistant inside Ajaia Docs, a collaborative document editor.',
  'Reply with only the text to insert into the document, formatted as Markdown',
  '(headings with #, **bold**, *italic*, bulleted or numbered lists). No preamble, no code fences,',
  'no commentary about what you did. Match the language and tone of the document.',
].join(' ');

const INSTRUCTIONS: Record<AiAction, string> = {
  continue: 'Continue the document naturally from where it ends with one or two short paragraphs.',
  summarize: 'Write a concise summary of the document as a short heading followed by 3-6 bullet points.',
  meeting_notes:
    'Write meeting notes for this document: a heading, then Attendees, Agenda, Discussion, Decisions and Action items (with owners) sections. Use the document for facts and clear placeholders like [Name] where facts are missing.',
  email_draft:
    'Write a short, professional email draft based on the document: a Subject line, greeting, body and sign-off. Use [Name] placeholders where needed.',
  improve: 'Rewrite the selected text to be clearer and more polished. Keep its meaning and approximate length.',
  shorter: 'Rewrite the selected text to be about half as long while keeping the key points.',
  longer: 'Expand the selected text with more detail and examples, keeping the same voice.',
  fix_grammar: 'Fix spelling, grammar and punctuation in the selected text. Change nothing else.',
  custom: '',
};

const tail = (s: string, n: number) => (s.length > n ? s.slice(s.length - n) : s);

export function buildGenerateMessages(input: {
  action: AiAction;
  context: string;
  selection?: string;
  prompt?: string;
}): ChatMessage[] {
  const def = AI_ACTIONS.find((a) => a.id === input.action);
  if (!def) throw new Error('Unknown action.');
  const prompt = input.prompt?.trim();
  if (input.action === 'custom' && !prompt) throw new Error('Write a prompt first.');
  const selection = input.selection?.trim();
  if (def.needsSelection && !selection) throw new Error('Select some text first.');

  const parts = [
    input.action === 'custom' ? `Request: ${prompt}` : `Task: ${INSTRUCTIONS[input.action]}`,
    `Document so far:\n"""\n${tail(input.context ?? '', CONTEXT_CHARS)}\n"""`,
  ];
  if (selection) parts.push(`Selected text:\n"""\n${selection.slice(0, CONTEXT_CHARS)}\n"""`);
  if (input.action === 'custom' && selection) parts.push('Apply the request to the selected text.');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ];
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
