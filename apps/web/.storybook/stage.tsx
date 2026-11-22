/**
 * What a story is drawn on, in Storybook (`preview.tsx`) and in the design system's cards (`tools/design-system`, which bundles this
 * file as `Nemia.NemiaRoot`): the look's ground with its scan lines, a page column as the frame's main is, a router of the story's own
 * over a history kept in memory and React Aria's router provider over it, a query client of its own that retries nothing, and the
 * scroll marks the board's frame writes. It imports nothing of Storybook, so the cards draw under the very stage the stories do.
 */
import { Component, createContext, useContext, useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter, useRouterState } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { ariaNavigate } from '@/components/nav/ariaNavigate';
import { ScanLines } from '../src/components/look';
import { useScrollMark } from '../src/lib/useScrollMark';

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

  static getDerivedStateFromError(err: unknown) {
    return { broken: err instanceof Error ? err.message : String(err) };
  }

  override render() {
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
export function Routed({ Story, at, marked }: Drawn & { at: string }) {
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
