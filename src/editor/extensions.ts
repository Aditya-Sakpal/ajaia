import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { SuggestionDelete, SuggestionInsert } from './suggestions';

/** The single editor schema, shared by the editor and file import (generateJSON). */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: true },
  }),
  // Tracked-change marks live in the shared schema so suggestions round-trip everywhere.
  SuggestionInsert,
  SuggestionDelete,
  Placeholder.configure({ placeholder: 'Start writing…' }),
];
