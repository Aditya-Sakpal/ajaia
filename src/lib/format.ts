import type { Access } from '../../shared/types';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "5 minutes ago", "Yesterday", or a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

const AVATAR_COLORS = ['#1a73e8', '#188038', '#a142f4', '#e8710a', '#d01884', '#007b83', '#5f6368'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export const ACCESS_LABEL: Record<Access, string> = { owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' };
/** Badge colours per role: editors stand out, read-only roles stay quiet. */
export const ACCESS_BADGE: Record<Access, string> = {
  owner: 'bg-[#d3e3fd] text-[#041e49]',
  editor: 'bg-[#d3e3fd] text-[#041e49]',
  commenter: 'bg-[#e8def8] text-[#21005d]',
  viewer: 'bg-[#e3e3e3] text-ink-2',
};
