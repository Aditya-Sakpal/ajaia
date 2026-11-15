import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { LogOut, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Avatar } from './Avatar';

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  async function switchAccount() {
    setOpen(false);
    await signOut();
    navigate('/login');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        className="rounded-full p-1 transition-colors hover:bg-hover"
      >
        <Avatar user={user} size={32} title="" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-72 rounded-3xl bg-[#e9eef6] p-2 shadow-[0_4px_16px_rgb(0_0_0/0.14),0_1px_3px_rgb(0_0_0/0.1)]"
        >
          <div className="flex flex-col items-center rounded-2xl bg-white px-4 pt-5 pb-4 text-center">
            <Avatar user={user} size={56} title="" />
            <p className="mt-3 text-[16px] text-ink">Hi, {user.name.split(' ')[0]}!</p>
            <p className="text-[13px] text-ink-2">{user.email}</p>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={switchAccount}
            className="mt-2 flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-[14px] text-ink hover:bg-white/70"
          >
            <Users className="size-5 text-ink-2" aria-hidden /> Switch account
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={switchAccount}
            className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-[14px] text-ink hover:bg-white/70"
          >
            <LogOut className="size-5 text-ink-2" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
