/**
 * What every story of the look is drawn in, in Storybook and in `npm run stories` alike: the board's styles, in the theme the toolbar
 * picks (dark, Nemia's default, unless a person switches it: the class it sets on `<html>`, `scheme.ts`), the look's ground, and a router
 * of its own over a history kept in memory, so a link of a story leads somewhere and moves no address but its
 * own. Where that router stands is written on the story's wrapper (`data-at`), and how many times it moved (`data-moves`). A story's
 * parameters say `at`, the address it opens on, and `scrollMark: false`, for a story nothing marks the scrolls of.
 *
 * A page body's queries resolve against a query client made once for each story, retrying nothing, so a refused read is said at once;
 * its requests are answered by MSW (`mswLoader`) from the handlers a story names in `parameters.msw`, over fixtures typed by `objects`
 * (`.storybook/fixtures/`). Every story is held to axe in the accessibility addon as `error`, so a violation fails `npm run stories`; a
 * story that fails it today has its a11y test set to warn only, in its own file, a count `test/stories.test.ts` holds to its
 * baseline. A story the holder caught throwing, or one that draws nothing, fails after it is drawn (`afterEach`, `undrawn`), so a
 * broken story is a failing test and not a quiet `data-broken`. Once Storybook has finished a story, its play function and `afterEach`
 * run, the document's body says which (`data-story-finished`), so a browser test that opens it alone (`test/e2e/stories/built.ts`)
 * presses nothing while the play still moves the focus.
 */
import { Component, createContext, useContext, useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter, useRouterState } from '@tanstack/react-router';
import type { Preview, ReactRenderer } from '@storybook/react-vite';
import { withThemeByClassName } from '@storybook/addon-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { STORY_FINISHED, type StoryFinishedPayload } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { ariaNavigate } from '@/components/nav/ariaNavigate';
import '../src/styles.css';
import { ScanLines } from '../src/components/look';
import { useScrollMark } from '../src/lib/useScrollMark';
import { undrawn } from './drawn';
import { SCHEME_CLASSES } from './scheme';

/** What a story's router draws: the story, and whether its scrolls are marked. */
type Drawn = { Story: ComponentType; marked: boolean };

const Drawing = createContext<Drawn | null>(null);

/** The story's ground, a page column as the frame's main is (`@container/page`), so a part's `@<size>/page:` layout reads its room. */
const GROUND: CSSProperties = { padding: 24, containerType: 'inline-size', containerName: 'page' };

/**
 * What holds a story: one that throws is said in its place (`data-broken`), by what it threw, before the router under it takes the
 * error for its own.
 */
class Held extends Component<{ children: ReactNode }, { broken: string | null }> {
  override state = { broken: null as string | null };

  static getDerivedStateFromError(err: unknown): { broken: string } {
    return { broken: err instanceof Error ? err.message : String(err) };
  }

  override render(): ReactNode {
    return this.state.broken === null ? this.props.children : <p data-broken>{this.state.broken}</p>;
  }
}

/** What marks a story's scrollers while they scroll, as the board's frame does. */
function ScrollMark() {
  useScrollMark();
  return null;
}

/** The story on the look's ground, its links the router's to follow as under the board's root, and where the router stands. */
function Stage() {
  const router = useRouter();
  const at = useRouterState({ select: (state) => state.location.href });
  const [moves, setMoves] = useState(0);
  useEffect(() => router.history.subscribe(() => setMoves((n) => n + 1)), [router]);
  const drawn = useContext(Drawing);
  if (!drawn) return null;
  return (
    <AriaRouterProvider navigate={ariaNavigate(router)}>
      {drawn.marked && <ScrollMark />}
      <ScanLines>
        <div data-story-ground data-at={at} data-moves={moves} style={GROUND}>
          <Held>
            <drawn.Story />
          </Held>
        </div>
      </ScanLines>
    </AriaRouterProvider>
  );
}

/** A router of the story's own, standing on `at` in a history kept in memory. */
const routerAt = (at: string) =>
  createRouter({ routeTree: createRootRoute({ component: Stage }), history: createMemoryHistory({ initialEntries: [at] }) });

/** A query client of the story's own, which retries nothing, so a read the handlers refuse is said at once. */
const clientOfAStory = () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });

/** One story under a router and a query client of its own, each made once for as long as the story is drawn. */
function Routed({ Story, at, marked }: Drawn & { at: string }) {
  const [router] = useState(() => routerAt(at));
  const [client] = useState(clientOfAStory);
  return (
    <QueryClientProvider client={client}>
      <Drawing.Provider value={{ Story, marked }}>
        <RouterProvider router={router} />
      </Drawing.Provider>
    </QueryClientProvider>
  );
}

/** The attribute of the document's body that names the story Storybook last finished. */
const FINISHED = 'data-story-finished';

let marking = false;

/**
 * Has the body name each story Storybook finishes, once: its channel is listened to from the first story drawn, since it is set only
 * after this file is read.
 */
function markFinished(): void {
  if (marking) return;
  marking = true;
  addons.getChannel().on(STORY_FINISHED, ({ storyId }: StoryFinishedPayload) => document.body.setAttribute(FINISHED, storyId));
}

const preview: Preview = {
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  loaders: [mswLoader()],
  afterEach: ({ canvasElement, id }) => {
    const broken = canvasElement.querySelector('[data-broken]');
    const drawn = canvasElement.querySelector('[data-story-ground] > *')?.getBoundingClientRect().height ?? 0;
    const faults = undrawn([{ id, broken: broken ? (broken.textContent ?? '') : null, height: drawn }]);
    if (faults.length) throw new Error(`the story did not draw as it should: ${faults.join('; ')}`);
  },
  decorators: [
    withThemeByClassName<ReactRenderer>({ themes: { ...SCHEME_CLASSES }, defaultTheme: 'dark', parentSelector: 'html' }),
    (Story, { parameters }) => {
      markFinished();
      return <Routed Story={Story} at={typeof parameters.at === 'string' ? parameters.at : '/'} marked={parameters.scrollMark !== false} />;
    },
  ],
};

export default preview;
