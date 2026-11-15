import type { ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  ChevronDown,
  Eye,
  Italic,
  List,
  ListOrdered,
  MessageSquareDiff,
  Pencil,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
} from 'lucide-react';
import { isSuggesting } from '../editor/suggestions';
import { SuggestionsMenu } from './SuggestionsMenu';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

type Block = 'p' | 'h1' | 'h2' | 'h3';
const BLOCK_LABEL: Record<Block, string> = { p: 'Normal text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3' };

export function Toolbar({ editor, editable, viewHint }: { editor: Editor; editable: boolean; viewHint?: string }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      block: (e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p') as Block,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canSuggest: e.extensionManager.extensions.some((x) => x.name === 'suggestionMode'),
      suggesting: isSuggesting(e.state),
    }),
  });

  const chain = () => editor.chain().focus();

  function setBlock(b: Block) {
    if (b === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(b[1]) as 1 | 2 | 3 }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={`flex h-10 items-center gap-0.5 overflow-x-auto rounded-full bg-pill px-2 [scrollbar-width:none] ${editable ? 'max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]' : ''}`}
    >
      {editable ? (
        <>
          <ToolButton label="Undo" shortcut={`${mod}Z`} onClick={() => chain().undo().run()} disabled={!s.canUndo}>
            <Undo2 />
          </ToolButton>
          <ToolButton label="Redo" shortcut={`${mod}Y`} onClick={() => chain().redo().run()} disabled={!s.canRedo}>
            <Redo2 />
          </ToolButton>
          <Divider />
          <label className="relative flex h-7 items-center rounded px-1 hover:bg-pill-hover">
            <span className="sr-only">Text style</span>
            <select
              value={s.block}
              onChange={(e) => setBlock(e.target.value as Block)}
              className="h-full w-[118px] cursor-pointer appearance-none bg-transparent pr-6 pl-1.5 text-[14px] text-ink focus:outline-none"
            >
              {(Object.keys(BLOCK_LABEL) as Block[]).map((b) => (
                <option key={b} value={b}>
                  {BLOCK_LABEL[b]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 size-4 text-ink-2" aria-hidden />
          </label>
          <Divider />
          <ToolButton label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()}>
            <Bold />
          </ToolButton>
          <ToolButton label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
            <Italic />
          </ToolButton>
          <ToolButton
            label="Underline"
            shortcut={`${mod}U`}
            active={s.underline}
            onClick={() => chain().toggleUnderline().run()}
          >
            <Underline />
          </ToolButton>
          <Divider />
          <ToolButton
            label="Bulleted list"
            shortcut={`${mod}Shift+8`}
            active={s.bullet}
            onClick={() => chain().toggleBulletList().run()}
          >
            <List />
          </ToolButton>
          <ToolButton
            label="Numbered list"
            shortcut={`${mod}Shift+7`}
            active={s.ordered}
            onClick={() => chain().toggleOrderedList().run()}
          >
            <ListOrdered />
          </ToolButton>
          <Divider />
          <ToolButton
            label="Clear formatting"
            shortcut={`${mod}\\`}
            onClick={() => chain().unsetAllMarks().setParagraph().run()}
          >
            <RemoveFormatting />
          </ToolButton>
        </>
      ) : (
        <span className="px-2 text-[14px] text-ink-2">View only</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <SuggestionsMenu editor={editor} canResolve={editable} />
        {editable && s.canSuggest ? (
          <label className="relative flex h-7 items-center rounded px-1 text-ink-2 hover:bg-pill-hover">
            <span className="sr-only">Mode</span>
            {s.suggesting ? (
              <MessageSquareDiff className="pointer-events-none absolute left-2 size-4 text-[#137333]" aria-hidden />
            ) : (
              <Pencil className="pointer-events-none absolute left-2 size-4" aria-hidden />
            )}
            <select
              value={s.suggesting ? 'suggesting' : 'editing'}
              onChange={(e) => chain().setSuggesting(e.target.value === 'suggesting').run()}
              title="Editing changes the document directly; Suggesting proposes changes others can accept or reject"
              className={`h-full cursor-pointer appearance-none bg-transparent pr-6 pl-7 text-[14px] focus:outline-none ${s.suggesting ? 'text-[#137333]' : 'text-ink-2'}`}
            >
              <option value="editing">Editing</option>
              <option value="suggesting">Suggesting</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 size-4 text-ink-2" aria-hidden />
          </label>
        ) : (
          <span
            title={editable ? undefined : viewHint}
            className={`shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[14px] text-ink-2 ${editable ? 'hidden sm:flex' : 'flex'}`}
          >
            {editable ? <Pencil className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {editable ? 'Editing' : 'Viewing'}
          </span>
        )}
      </span>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={`flex size-7 shrink-0 items-center justify-center rounded text-ink-2 transition-colors disabled:opacity-35 [&_svg]:size-[18px] [&_svg]:stroke-[2.25] ${
        active ? 'bg-active text-[#041e49]' : 'hover:bg-pill-hover'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}
