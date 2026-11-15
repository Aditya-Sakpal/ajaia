import { describe, expect, it } from 'vitest';
import {
  AI_ACTIONS,
  buildCompletionMessages,
  buildGenerateMessages,
  parseGenerateResult,
  resolvePlacement,
} from './aiPrompts';

describe('buildGenerateMessages', () => {
  it('meeting notes uses the document as context and asks for markdown', () => {
    const msgs = buildGenerateMessages({ action: 'meeting_notes', context: 'Kickoff with Bob' });
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toMatch(/Markdown/);
    expect(msgs.at(-1)!.content).toContain('Kickoff with Bob');
    expect(msgs.at(-1)!.content.toLowerCase()).toContain('meeting notes');
  });

  it('custom requires a prompt', () => {
    expect(() => buildGenerateMessages({ action: 'custom', context: 'x' })).toThrow(/prompt/i);
    const msgs = buildGenerateMessages({ action: 'custom', prompt: 'Write a haiku about Q3', context: '' });
    expect(msgs.at(-1)!.content).toContain('Write a haiku about Q3');
  });

  it('custom prompts ask the model to choose replace vs insert', () => {
    const msgs = buildGenerateMessages({ action: 'custom', prompt: 'shorten the essay', context: 'Essay…' });
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toMatch(/"replace"/);
    expect(all).toMatch(/"insert"/);
  });

  it('rewrite actions with a selection target the selection', () => {
    const msgs = buildGenerateMessages({ action: 'fix_grammar', context: 'doc', selection: 'teh cat sat' });
    expect(msgs.at(-1)!.content).toContain('teh cat sat');
  });

  it('rewrite actions without a selection target the whole document instead of failing', () => {
    const msgs = buildGenerateMessages({ action: 'shorter', context: 'The whole essay text.' });
    const user = msgs.at(-1)!.content;
    expect(user).toContain('The whole essay text.');
    expect(user.toLowerCase()).toContain('entire document');
  });

  it('rewrite actions on an empty document are rejected', () => {
    expect(() => buildGenerateMessages({ action: 'shorter', context: '   ' })).toThrow(/nothing/i);
  });

  it('keeps only the tail of very long documents', () => {
    const long = 'a'.repeat(50_000) + 'THE_END';
    const msgs = buildGenerateMessages({ action: 'continue', context: long });
    const user = msgs.at(-1)!.content;
    expect(user).toContain('THE_END');
    expect(user.length).toBeLessThan(15_000);
  });

  it('every action has a label', () => {
    for (const a of AI_ACTIONS) expect(a.label.length).toBeGreaterThan(0);
  });
});

describe('resolvePlacement', () => {
  it('preset rewrites replace the selection, or the document when nothing is selected', () => {
    for (const a of ['improve', 'shorter', 'longer', 'fix_grammar'] as const) {
      expect(resolvePlacement(a, true, 'insert')).toBe('replace_selection');
      expect(resolvePlacement(a, false, 'insert')).toBe('replace_document');
    }
  });
  it('preset generators always insert, whatever the model says', () => {
    for (const a of ['continue', 'summarize', 'meeting_notes', 'email_draft'] as const) {
      expect(resolvePlacement(a, false, 'replace')).toBe('insert');
      expect(resolvePlacement(a, true, 'replace')).toBe('insert');
    }
  });
  it('custom prompts follow the model decision', () => {
    expect(resolvePlacement('custom', false, 'replace')).toBe('replace_document');
    expect(resolvePlacement('custom', true, 'replace')).toBe('replace_selection');
    expect(resolvePlacement('custom', false, 'insert')).toBe('insert');
    expect(resolvePlacement('custom', true, 'insert')).toBe('insert');
  });
});

describe('parseGenerateResult', () => {
  it('parses valid structured output', () => {
    expect(parseGenerateResult('{"placement":"replace","markdown":"# Short"}')).toEqual({
      placement: 'replace',
      markdown: '# Short',
    });
  });
  it('strips code fences around the markdown', () => {
    expect(parseGenerateResult('{"placement":"insert","markdown":"```markdown\\n- a\\n```"}').markdown).toBe('- a');
  });
  it('accepts JSON wrapped in a code fence', () => {
    expect(parseGenerateResult('```json\n{"placement":"insert","markdown":"x"}\n```').markdown).toBe('x');
  });
  it('rejects malformed output', () => {
    expect(() => parseGenerateResult('not json')).toThrow();
    expect(() => parseGenerateResult('{"markdown":"x"}')).toThrow();
    expect(() => parseGenerateResult('{"placement":"delete","markdown":"x"}')).toThrow();
    expect(() => parseGenerateResult('{"placement":"insert","markdown":42}')).toThrow();
    expect(() => parseGenerateResult('')).toThrow();
  });
});

describe('buildCompletionMessages', () => {
  it('sends only the last part of the text before the cursor', () => {
    const msgs = buildCompletionMessages('x'.repeat(5000) + 'Our goals are');
    expect(msgs.at(-1)!.content.endsWith('Our goals are')).toBe(true);
    expect(msgs.at(-1)!.content.length).toBeLessThanOrEqual(1500);
  });
});
