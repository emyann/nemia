/**
 * What a story may not ask of the network: its strays. A story's reads are answered by the handlers it names (`parameters.msw`, over
 * `.storybook/fixtures/`); a request none of them answers, to the board's api or to another origin, would leave the browser, and on
 * the api's path Vite would forward it to an api the stories never have. The preview's worker lists `strayHandler` as its one
 * handler, after every story's own, so it answers only what no story did: it records a stray and answers it with a network error, and
 * the preview fails the story after it draws, naming each (`straysSaid`, `preview.tsx`). The stories' own files it passes through.
 * Which request is a stray is proved by `contracts/story-stray.contract.ts`.
 */
import { http, HttpResponse, passthrough } from 'msw';
import type { StrayOf } from '../contracts/story-stray.contract.ts';

/**
 * Whether a request of a story's page is a stray: the board's api on the page's own origin, or another origin.
 * @param request Whether the request is to the page's own origin, and its path.
 */
export const strayOf: StrayOf = (request) => !request.sameOrigin || request.path === '/api' || request.path.startsWith('/api/');

/**
 * The handler that answers what no story's handler answered: a stray is recorded, as `METHOD path` on the page's origin and `METHOD
 * url` on another, and answered with a network error, so it never leaves the browser; any other request, the stories' own files, is
 * passed through to the network (`passthrough`), so the worker, strict, leaves no request unhandled.
 * @param origin The origin of the story's page.
 * @param record Where each stray is recorded.
 */
export const strayHandler = (origin: string, record: (request: string) => void) =>
  http.all('*', ({ request }) => {
    const url = new URL(request.url);
    const sameOrigin = url.origin === origin;
    if (!strayOf({ sameOrigin, path: url.pathname })) return passthrough();
    record(`${request.method} ${sameOrigin ? url.pathname : url.href}`);
    return HttpResponse.error();
  });

/**
 * Why a story fails for its strays, naming each and the fix, or nothing where it sent none.
 * @param strays Each stray the story sent, as `strayHandler` recorded it.
 */
export const straysSaid = (strays: readonly string[]) =>
  strays.length === 0
    ? undefined
    : `the story asked the network for what no handler of its own answers: ${strays.join(', ')}; ` +
      "answer each with a handler in the story's parameters.msw, over the fixtures of .storybook/fixtures/";
