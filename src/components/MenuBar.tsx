import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface Item {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run(): void;
}
type Section = Item[];

interface Props {
  editor: Editor | null;
  editable: boolean;
  isOwner: boolean;
  onNew(): void;
  onRename(): void;
  onShare(): void;
  onDelete(): void;
  onHome(): void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

/** Docs-style menu row. Only real commands — nothing decorative. */
export function MenuBar({ editor, editable, isOwner, onNew, onRename, onShare, onDelete, onHome }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chain = () => editor!.chain().focus();
  const noEdit = !editable || !editor;

  const menus: Record<string, Section[]> = {
    File: [
      [{ label: 'New document', run: onNew }],
      [
        { label: 'Rename', disabled: !editable, run: onRename },
        { label: 'Share…', run: onShare },
        { label: 'Delete', disabled: !isOwner, run: onDelete },
      ],
      [{ label: 'Back to documents', run: onHome }],
    ],
    Edit: [
      [
        { label: 'Undo', shortcut: `${mod}Z`, disabled: noEdit, run: () => chain().undo().run() },
        { label: 'Redo', shortcut: `${mod}Y`, disabled: noEdit, run: () => chain().redo().run() },
      ],
    ],
    Format: [
      [
        { label: 'Normal text', disabled: noEdit, run: () => chain().setParagraph().run() },
        { label: 'Heading 1', shortcut: `${mod}Alt+1`, disabled: noEdit, run: () => chain().setHeading({ level: 1 }).run() },
        { label: 'Heading 2', shortcut: `${mod}Alt+2`, disabled: noEdit, run: () => chain().setHeading({ level: 2 }).run() },
        { label: 'Heading 3', shortcut: `${mod}Alt+3`, disabled: noEdit, run: () => chain().setHeading({ level: 3 }).run() },
      ],
      [
        { label: 'Bold', shortcut: `${mod}B`, disabled: noEdit, run: () => chain().toggleBold().run() },
        { label: 'Italic', shortcut: `${mod}I`, disabled: noEdit, run: () => chain().toggleItalic().run() },
        { label: 'Underline', shortcut: `${mod}U`, disabled: noEdit, run: () => chain().toggleUnderline().run() },
      ],
      [
        { label: 'Bulleted list', disabled: noEdit, run: () => chain().toggleBulletList().run() },
        { label: 'Numbered list', disabled: noEdit, run: () => chain().toggleOrderedList().run() },
      ],
      [{ label: 'Clear formatting', shortcut: `${mod}\\`, disabled: noEdit, run: () => chain().unsetAllMarks().setParagraph().run() }],
    ],
  };

  return (
    <div ref={ref} role="menubar" aria-label="Document menu" className="relative flex h-7 items-center">
      {Object.entries(menus).map(([name, sections]) => (
        <div key={name} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === name}
            onClick={() => setOpen((o) => (o === name ? null : name))}
            onMouseEnter={() => open && setOpen(name)}
            className={`rounded px-2 py-0.5 text-[14px] text-ink ${open === name ? 'bg-active' : 'hover:bg-hover'}`}
          >
            {name}
          </button>
          {open === name && (
            <div
              role="menu"
              aria-label={name}
              className="absolute left-0 z-40 mt-1 min-w-[260px] rounded-lg bg-white py-1.5 shadow-[0_2px_6px_2px_rgb(60_64_67/0.15),0_1px_2px_rgb(60_64_67/0.3)]"
            >
              {sections.map((section, i) => (
                <div key={i} className={i > 0 ? 'mt-1.5 border-t border-line-soft pt-1.5' : ''}>
                  {section.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setOpen(null);
                        item.run();
                      }}
                      className="flex w-full items-center justify-between gap-6 px-4 py-1.5 text-left text-[14px] text-ink hover:bg-hover disabled:text-ink-3/60 disabled:hover:bg-transparent"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="text-[12px] text-ink-3">{item.shortcut}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
