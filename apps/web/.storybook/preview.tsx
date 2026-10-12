/**
 * What every story of the look is drawn in, in Storybook and on the page the checks read alike: the board's styles, the look's
 * ground, and a router of its own over a history kept in memory, so a link of a story leads somewhere and moves no address but its
 * own. Where that router stands is written on the story's wrapper (`data-at`), and how many times it moved (`data-moves`). A story's
 * parameters say `at`, the address it opens on, and `scrollMark: false`, for a story nothing marks the scrolls of.
 */
import { createContext, useContext, useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter, useRouterState } from '@tanstack/react-router';
import type { Preview } from '@storybook/react-vite';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import '../src/styles.css';
import { ScanLines } from '../src/components/look';
import { useScrollMark } from '../src/lib/useScrollMark';

/** What a story's router draws: the story, and whether its scrolls are marked. */
type Drawn = { Story: ComponentType; marked: boolean };

const Drawing = createContext<Drawn | null>(null);

const GROUND: CSSProperties = { padding: 24 };

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
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      {drawn.marked && <ScrollMark />}
      <ScanLines>
        <div data-story-ground data-at={at} data-moves={moves} style={GROUND}>
          <drawn.Story />
        </div>
      </ScanLines>
    </AriaRouterProvider>
  );
}

/** A router of the story's own, standing on `at` in a history kept in memory. */
const routerAt = (at: string) =>
  createRouter({ routeTree: createRootRoute({ component: Stage }), history: createMemoryHistory({ initialEntries: [at] }) });

/** One story under a router of its own, made once for as long as the story is drawn. */
function Routed({ Story, at, marked }: Drawn & { at: string }) {
  const [router] = useState(() => routerAt(at));
  return (
    <Drawing.Provider value={{ Story, marked }}>
      <RouterProvider router={router} />
    </Drawing.Provider>
  );
}

const preview: Preview = {
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, { parameters }) => (
      <Routed Story={Story} at={typeof parameters.at === 'string' ? parameters.at : '/'} marked={parameters.scrollMark !== false} />
    ),
  ],
};

export default preview;
