import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { TokenPage } from './components/frame/TokenPage';
import { tokenAsked } from './lib/api/read';
import { claimLinkOnLoad } from './lib/linkClaim';
import { useTokenAsked } from './lib/token';
import { routeTree } from './routeTree.gen';
import './styles.css';

/** How many times a read that failed is made again, as Query's default: never once the api has asked for a token, which no retry brings. */
const RETRIES = 3;

/** The board's query cache: a failed read is made again, unless the api asked this browser for a token (`tokenAsked`). */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (failures) => tokenAsked() === null && failures < RETRIES } },
});

/** The board's router: its loaders read through the query cache, so it holds no data of its own and caches no preload. */
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** The page takes the whole space beside the menu, rather than the reading column. */
    fullBleed?: boolean;
    /** The page is Nemia's chat itself, so her docked face is not drawn over it. */
    ownsChat?: boolean;
  }
}

/**
 * The board, or the token page in place of every page once the api has asked this browser for a token (`useTokenAsked`): whichever read
 * or write it refused, so no page says the refusal on its own.
 */
function Board() {
  const ask = useTokenAsked();
  return ask ? <TokenPage asked={ask} /> : <RouterProvider router={router} />;
}

/**
 * Draws the board once a first-visit link the address carries is claimed (`claimLinkOnLoad`), so its first read is made with the cookie
 * the claim set; an address with no link is drawn at once.
 */
function render(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Board />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void claimLinkOnLoad().then(render);
