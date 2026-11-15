import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { generateJSON } from '@tiptap/core';
import { FileUp, LoaderCircle } from 'lucide-react';
import type { DocJSON, Document } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { editorExtensions } from '../editor/extensions';
import { IMPORT_ACCEPT, IMPORT_HELP, fileToHtml, titleFromFilename, validateImportFile } from '../import/fileImport';

/** "Import file" tile for the documents home: .txt/.md/.docx → new editable document. */
export function ImportTile({ onError }: { onError(message: string | null): void }) {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    onError(null);
    const invalid = validateImportFile(file);
    if (invalid) {
      onError(`${file.name}: ${invalid}`);
      return;
    }
    setBusy(true);
    try {
      const html = await fileToHtml(file);
      const content = generateJSON(html || '<p></p>', editorExtensions) as DocJSON;
      const doc = await api.post<Document>('/documents', { title: titleFromFilename(file.name), content });
      navigate(`/d/${doc.id}`);
    } catch (err) {
      onError(err instanceof ApiError || err instanceof Error ? `${file.name}: ${err.message}` : 'Import failed.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-describedby="import-help"
        className="relative flex h-[188px] w-[144px] items-center justify-center rounded border border-dashed border-line bg-white px-3 text-center transition-colors hover:border-action disabled:opacity-60"
      >
        {busy ? (
          <LoaderCircle className="size-10 animate-spin text-action" aria-hidden />
        ) : (
          <FileUp className="size-14 stroke-[1.25] text-action" aria-hidden />
        )}
        <span id="import-help" className="absolute inset-x-2 bottom-3 text-[12px] leading-4 text-ink-3">
          {IMPORT_HELP}
        </span>
      </button>
      <p className="mt-2 text-[14px] font-medium text-ink">{busy ? 'Importing…' : 'Import a file'}</p>
      <input
        ref={input}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handle(f);
        }}
      />
    </div>
  );
}
