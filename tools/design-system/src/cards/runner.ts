/**
 * What draws a card's stories in its page, bundled into each card's script. A card has no network: a read a story makes is noted
 * (`window.__asked`) and never answered, an event source never opens, and what asks the system for its scheme (React Flow's
 * `colorMode="system"`) is answered from the root's theme. A story of the board is first given its fate from what its module declares
 * (`storyFate`), and only a card's story is drawn, under `NemiaRoot`; a kit's story is drawn as it is. With `?cells` in the address
 * each story is drawn in its turn and what its cell threw, drew, covered, asked and showed is left on `window.__cells`, for the
 * build's verification; `window.__drawn` says every story was handed to React.
 */
import { Component, createElement as h, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CellDrawn, StoryFate } from '../../contracts/produce.contract.ts';
import { storyFate } from '../decide.ts';
import { declaredOf, type Annotated } from '../stories/declared.ts';

/** A story as its module exports it, or the meta its file's default export is. */
type Told = Annotated & {
  readonly args?: Record<string, unknown>;
  readonly render?: (args: Record<string, unknown>, context: unknown) => ReactNode;
  readonly decorators?: readonly ((story: ComponentType, context: unknown) => ReactNode)[];
  readonly component?: ComponentType<Record<string, unknown>>;
  readonly title?: string;
};

/** One story file of the card, with the stories it shows. */
export type Shown = { readonly module: Record<string, unknown>; readonly shown: readonly string[] };

/** What the build reads of one story after the page drew it. */
export type CellReport = { readonly name: string; readonly fate: StoryFate; readonly cell: CellDrawn | null };

declare global {
  interface Window {
    __asked: string[];
    __cells?: CellReport[];
    __drawn?: boolean;
    Nemia: { NemiaRoot: ComponentType<{ at: string; marked: boolean; children?: ReactNode }> };
  }
}

const WAITING = '[data-slot="skeleton"], [data-reading], [aria-busy="true"]';

/** Notes every read and answers none, so a part that waits on one draws its waiting state. */
const stillNetwork = () => {
  window.__asked = [];
  window.fetch = (input: RequestInfo | URL) => {
    window.__asked.push(input instanceof Request ? input.url : String(input));
    return new Promise<Response>(() => undefined);
  };
  window.EventSource = class {
    readyState = 0;
    constructor(url: string) {
      window.__asked.push(`events ${url}`);
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  } as unknown as typeof EventSource;
  const media = window.matchMedia.bind(window);
  window.matchMedia = (query: string) =>
    /prefers-color-scheme/.test(query)
      ? ({
          matches: /dark/.test(query) === (document.documentElement.dataset.theme !== 'light'),
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent: () => false,
        } as unknown as MediaQueryList)
      : media(query);
};

/** A story's name as words, its first capitalised. */
const words = (name: string) => {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Says what a story threw in its place (`data-failed`). */
class Held extends Component<{ name: string; children: ReactNode }, { failed: unknown }> {
  override state = { failed: null as unknown };

  static getDerivedStateFromError(failed: unknown) {
    return { failed };
  }

  override render() {
    return this.state.failed
      ? h('pre', { 'data-failed': this.props.name, style: { margin: 0, whiteSpace: 'pre-wrap' } }, String(this.state.failed))
      : this.props.children;
  }
}

/** The component that draws one story, its decorators around it and, for the board's, `NemiaRoot` around them. */
const drawnOf = (module: Record<string, unknown>, name: string, rooted: boolean) => {
  const meta = (module.default ?? {}) as Told;
  const story = module[name];
  const told = (typeof story === 'function' ? { render: story } : (story ?? {})) as Told;
  const parameters: Record<string, unknown> = { ...meta.parameters, ...told.parameters };
  const args = { ...meta.args, ...told.args };
  const context = { args, parameters, globals: {}, name, viewMode: 'story', id: name, title: meta.title };
  const render = told.render ?? meta.render ?? ((given: Record<string, unknown>) => (meta.component ? h(meta.component, given) : null));
  const decorators = [...(told.decorators ?? []), ...(meta.decorators ?? [])];
  const Story = decorators.reduce<ComponentType>(
    (Inner, decorate) => () => decorate(Inner, context),
    () => render(args, context),
  );
  const at = typeof parameters.at === 'string' ? parameters.at : '/';
  const Rooted = () => h(window.Nemia.NemiaRoot, { at, marked: parameters.scrollMark !== false }, h(Story));
  const wide = rooted || parameters.layout === 'padded' || parameters.layout === 'fullscreen';
  return { Drawn: rooted ? Rooted : Story, wide, fate: rooted ? storyFate(declaredOf(meta, told)) : ('card' as const) };
};

/** A cell for a story: its name above the box it is drawn in. */
const cellFor = (name: string, wide: boolean) => {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.story = name;
  if (wide) cell.dataset.wide = '';
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = words(name);
  const body = document.createElement('div');
  body.className = 'story';
  cell.append(label, body);
  return { cell, body };
};

/** The share of the window the largest fixed layer among `elements` covers, from 0 to 1. */
const coveredBy = (elements: readonly Element[]) =>
  Math.min(
    1,
    Math.max(
      0,
      ...elements
        .filter((element) => getComputedStyle(element).position === 'fixed')
        .map((element) => {
          const box = element.getBoundingClientRect();
          return (box.width * box.height) / (innerWidth * innerHeight);
        }),
    ),
  );

/** Whether any picture among `elements` has an address for its source, where a card's own pictures are all data. */
const servedPicture = (elements: readonly Element[]) =>
  elements
    .filter((element) => ['IMG', 'VIDEO', 'IFRAME'].includes(element.tagName))
    .map((element) => element.getAttribute('src') ?? '')
    .some((source) => source !== '' && !source.startsWith('data:') && !source.startsWith('blob:'));

/** What one cell drew, read once the story settled. */
const factsOf = (cell: HTMLElement, body: HTMLElement, asked: number, layers: ReadonlySet<Element>) => {
  const failed = cell.querySelector('[data-failed],[data-broken]');
  const ground = body.querySelector('[data-story-ground]') ?? body;
  const said = (ground.textContent ?? '').trim();
  const fresh = [...document.body.children]
    .filter((element) => !layers.has(element))
    .flatMap((element) => [element, ...element.querySelectorAll('*')]);
  return {
    threw: failed ? (failed.textContent ?? '').slice(0, 240) : null,
    height: Math.round(Math.max(0, ...[...ground.children].map((child) => child.getBoundingClientRect().height))),
    covered: coveredBy(fresh),
    asked: window.__asked.length - asked,
    waiting: body.querySelector(WAITING) !== null || /Reading…|Reading\.\.\.|Loading…/.test(said) || /reading/i.test(said.slice(0, 90)),
    apiPicture: servedPicture([...cell.querySelectorAll('*'), ...fresh]),
  } satisfies CellDrawn;
};

const settle = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Draws a card's stories into `#root`, each in a cell of its own.
 * @param files the card's story files, each with the stories it shows.
 * @param rooted true for a card of the board's stories, drawn under `NemiaRoot` and only where its fate is a card.
 */
export const show = async (files: readonly Shown[], rooted: boolean) => {
  stillNetwork();
  const root = document.getElementById('root');
  const measuring = /[?&]cells/.test(location.search);
  const reports: CellReport[] = [];
  for (const { module, shown } of files)
    for (const name of shown) {
      const { Drawn, wide, fate } = drawnOf(module, name, rooted);
      if (fate !== 'card') {
        reports.push({ name, fate, cell: null });
        continue;
      }
      const { cell, body } = cellFor(name, wide);
      root?.append(cell);
      const asked = window.__asked.length;
      const layers = new Set(document.body.children);
      createRoot(body).render(h(Held, { name, children: h(Drawn) }));
      if (!measuring) {
        reports.push({ name, fate, cell: null });
        continue;
      }
      await settle(450);
      reports.push({ name, fate, cell: factsOf(cell, body, asked, layers) });
    }
  window.__cells = reports;
  window.__drawn = true;
};
