import { describe, expect, it } from 'vitest';
import { canUseKeepalive } from './client';

describe('canUseKeepalive', () => {
  it('allows small bodies', () => {
    expect(canUseKeepalive('{"a":1}')).toBe(true);
  });
  it('measures UTF-8 bytes, not characters (CJK text is 3 bytes per char)', () => {
    const cjk = '文'.repeat(25_000); // 25k chars, 75 KB
    expect(cjk.length).toBeLessThan(60_000);
    expect(canUseKeepalive(cjk)).toBe(false);
  });
  it('rejects bodies over the 64 KB browser cap', () => {
    expect(canUseKeepalive('x'.repeat(70_000))).toBe(false);
  });
});
