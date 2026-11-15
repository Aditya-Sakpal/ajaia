import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** US Letter at 96 dpi with 1-inch margins, like the page in the reference. */
export const PAGE = { height: 1056, margin: 96, gap: 20 };
const CONTENT = PAGE.height - 2 * PAGE.margin; // 864px of text per page
const STRIDE = CONTENT + 2 * PAGE.margin + PAGE.gap; // distance between page tops, in content coordinates

interface Break {
  pos: number;
  height: number; // spacer height
  rest: number; // white space left at the bottom of the previous page (excluding its margin)
}
interface State {
  breaks: Break[];
  tail: number; // filler that completes the last page
}

const key = new PluginKey<State>('pagination');
const EMPTY: State = { breaks: [], tail: 0 };
const enabled = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

/**
 * Splits the document into pages visually: before a block that would cross the bottom margin,
 * a non-editable spacer draws the end of the page, a grey gap and the next page's top margin.
 * Pure presentation: nothing is stored in the document.
 */
function measure(view: EditorView, current: State): State {
  if (!enabled()) return EMPTY;
  const spacerBefore = new Map(current.breaks.map((b) => [b.pos, b.height]));
  const breaks: Break[] = [];
  let removed = 0; // spacer height above the current block in the measured DOM
  let shift = 0; // spacer height above the current block in the new layout
  let origin: number | null = null;
  let lastBottom = 0;

  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    removed += spacerBefore.get(offset) ?? 0;
    const style = getComputedStyle(dom);
    const top = dom.offsetTop - removed - parseFloat(style.marginTop || '0');
    if (origin === null) origin = top;
    const y = top - origin + shift;
    const h = dom.offsetHeight + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
    const page = Math.floor(y / STRIDE);
    const pageEnd = page * STRIDE + CONTENT;
    const atPageTop = y - page * STRIDE < 1;
    if (y + h > pageEnd + 1 && h <= CONTENT && !atPageTop) {
      const rest = Math.max(0, pageEnd - y);
      const height = rest + 2 * PAGE.margin + PAGE.gap;
      breaks.push({ pos: offset, height, rest });
      shift += height;
    }
    lastBottom = top - (origin ?? 0) + shift + h;
  });

  const lastPage = Math.floor(Math.max(0, lastBottom - 1) / STRIDE);
  const tail = Math.max(0, lastPage * STRIDE + CONTENT - lastBottom);
  return { breaks, tail };
}

const same = (a: State, b: State) =>
  Math.abs(a.tail - b.tail) < 1 &&
  a.breaks.length === b.breaks.length &&
  a.breaks.every((x, i) => x.pos === b.breaks[i]!.pos && Math.abs(x.height - b.breaks[i]!.height) < 1);

function spacer(b: Break): HTMLElement {
  const el = document.createElement('div');
  el.className = 'page-break';
  el.contentEditable = 'false';
  el.style.height = `${b.height}px`;
  const bottom = b.rest + PAGE.margin;
  el.style.setProperty('--page-bottom', `${bottom}px`);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export const Pagination = Extension.create({
  name: 'pagination',
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const next = tr.getMeta(key) as State | undefined;
            if (next) return next;
            if (!tr.docChanged) return prev;
            // Keep spacers attached to their blocks until the next measurement.
            return {
              tail: prev.tail,
              breaks: prev.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) })),
            };
          },
        },
        props: {
          decorations(state) {
            const s = key.getState(state);
            if (!s || (!s.breaks.length && !s.tail)) return null;
            const decos = s.breaks
              .filter((b) => b.pos < state.doc.content.size)
              .map((b) =>
                Decoration.widget(b.pos, () => spacer(b), {
                  side: -1,
                  ignoreSelection: true,
                  key: `pb-${b.pos}-${Math.round(b.height)}`,
                }),
              );
            if (s.tail > 0) {
              decos.push(
                Decoration.widget(
                  state.doc.content.size,
                  () => {
                    const el = document.createElement('div');
                    el.className = 'page-tail';
                    el.contentEditable = 'false';
                    el.style.height = `${s.tail}px`;
                    return el;
                  },
                  { side: 1, ignoreSelection: true, key: `pt-${Math.round(s.tail)}` },
                ),
              );
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
        view(view) {
          let frame = 0;
          const run = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (view.isDestroyed) return;
              const current = key.getState(view.state) ?? EMPTY;
              const next = measure(view, current);
              if (!same(current, next)) view.dispatch(view.state.tr.setMeta(key, next).setMeta('addToHistory', false));
            });
          };
          const onResize = () => run();
          window.addEventListener('resize', onResize);
          run();
          void document.fonts?.ready.then(run);
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc)) run();
            },
            destroy() {
              cancelAnimationFrame(frame);
              window.removeEventListener('resize', onResize);
            },
          };
        },
      }),
    ];
  },
});
