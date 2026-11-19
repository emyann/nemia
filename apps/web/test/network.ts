/**
 * The board's node tests' network: MSW's server, listening while a file that imports this runs, which refuses a request no handler
 * answers (`onUnhandledFrame: 'error'`), and drops what a test answered once the test ends. A test answers the board's api with
 * `apiAnswers`; nothing of `src` gains a seam for it.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/** What the board sent, as a test reads it: the method, the headers, the body's text (none where it is empty) and the signal that aborts it. */
export type Sent = { method: string; headers: Headers; body: string | undefined; signal: AbortSignal };

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Answers every request the board sends its api, for the rest of the test, with what `answer` gives for it. A `TypeError` it throws is
 * the network failing (`Failed to fetch`), as when nothing answers.
 * @param answer Given the request's path and query, as a page would send them, and what was sent; gives the response.
 */
export function apiAnswers(answer: (url: string, sent: Sent) => Response | Promise<Response>) {
  server.use(
    http.all('http://board.invalid/*', async ({ request }) => {
      const url = new URL(request.url);
      try {
        return await answer(`${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers,
          body: (await request.text()) || undefined,
          signal: request.signal,
        });
      } catch (err) {
        if (err instanceof TypeError) return HttpResponse.error();
        throw err;
      }
    }),
  );
}
