import { describe, expect, it } from 'vitest';
import { buildCompletionMessages, buildGenerateMessages, AI_ACTIONS } from './aiPrompts';

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

  it('rewrite actions require a selection and include it', () => {
    expect(() => buildGenerateMessages({ action: 'shorter', context: 'doc' })).toThrow(/select/i);
    const msgs = buildGenerateMessages({ action: 'fix_grammar', context: 'doc', selection: 'teh cat sat' });
    expect(msgs.at(-1)!.content).toContain('teh cat sat');
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

describe('buildCompletionMessages', () => {
  it('sends only the last part of the text before the cursor', () => {
    const msgs = buildCompletionMessages('x'.repeat(5000) + 'Our goals are');
    expect(msgs.at(-1)!.content.endsWith('Our goals are')).toBe(true);
    expect(msgs.at(-1)!.content.length).toBeLessThanOrEqual(1500);
  });
});
