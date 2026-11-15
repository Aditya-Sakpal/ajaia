import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';

/** The single editor schema, shared by the editor and file import (generateJSON). */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: true },
  }),
  Placeholder.configure({ placeholder: 'Start writing…' }),
];
