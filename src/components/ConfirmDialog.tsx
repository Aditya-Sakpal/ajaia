import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/** Small native <dialog> confirmation (focus trap + Esc come from the platform). */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(400px,calc(100vw-32px))] rounded-[28px] bg-white p-6 text-ink shadow-xl"
    >
      <h2 className="text-[22px] leading-7">{title}</h2>
      <div className="mt-3 text-[14px] leading-5 text-ink-2">{children}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-[14px] font-medium text-action hover:bg-hover">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-full px-5 py-2 text-[14px] font-medium text-white disabled:opacity-60 ${
            danger ? 'bg-danger hover:bg-[#8c1d18]' : 'bg-action hover:bg-action-hover'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
