/** Ajaia Docs mark: a folded page carrying an "A" — our own, not a third-party logo. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size * 0.75} height={size} viewBox="0 0 30 40" aria-hidden="true">
      <path d="M3 0h17l10 10v27a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill="#2f6fde" />
      <path d="M20 0l10 10h-7a3 3 0 0 1-3-3V0Z" fill="#a8c7fa" />
      <path d="M9.2 31 15 15.5h.1L20.8 31h-2.7l-1.2-3.5h-3.8L11.9 31H9.2Zm4.6-5.8h2.4l-1.2-3.7-1.2 3.7Z" fill="#fff" />
    </svg>
  );
}
