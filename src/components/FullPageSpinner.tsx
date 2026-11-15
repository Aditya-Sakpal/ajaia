import { LoaderCircle } from 'lucide-react';

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center" role="status">
      <LoaderCircle className="size-7 animate-spin text-action" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
