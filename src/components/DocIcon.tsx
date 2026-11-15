export function DocIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size * 0.75} height={size} viewBox="0 0 15 20" aria-hidden="true" className="shrink-0">
      <path d="M1.5 0H10l5 5v13.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 0 18.5v-17A1.5 1.5 0 0 1 1.5 0Z" fill="#2f6fde" />
      <path d="M10 0l5 5h-3.5A1.5 1.5 0 0 1 10 3.5V0Z" fill="#a8c7fa" />
      <path d="M3.5 9.5h8M3.5 12h8M3.5 14.5h5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
