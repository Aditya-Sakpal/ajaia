import type { User } from '../../shared/types';
import { avatarColor, initials } from '../lib/format';

export function Avatar({ user, size = 32, title }: { user: User; size?: number; title?: string }) {
  return (
    <span
      title={title ?? `${user.name} (${user.email})`}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: avatarColor(user.email), fontSize: size * 0.4 }}
      aria-hidden={title === undefined ? undefined : true}
    >
      {initials(user.name)}
    </span>
  );
}
