/**
 * What the stories' network holds with no browser: a request no story's handler answers, to the board's api or to another origin, is
 * recorded and answered with a network error by the preview's fallback (`strayHandler`, `.storybook/network.ts`), so it never leaves
 * the browser; the stories' own files are passed through it; a story's own handler, put before it, wins; and the story is failed
 * naming each stray (`straysSaid`, which the preview's `afterEach` runs). Which request is a stray is proved by
 * `contracts/story-stray.contract.ts`.
 */
import assert from 'node:assert/strict';
import { getResponse, http, HttpResponse, isPassthroughResponse } from 'msw';
import { test } from 'vitest';
import { strayHandler, straysSaid } from '../.storybook/network.ts';

/** The origin of the story's page in these tests. */
const ORIGIN = 'http://story.test';

/**
 * What the fallback, after `own`, answers to a GET of `url`, and the strays it recorded.
 * @param url The address asked.
 * @param own The handlers a story names, put before the fallback as MSW's `use` puts them.
 */
const asked = async (url: string, own: Parameters<typeof getResponse>[0] = []) => {
  const strays: string[] = [];
  const response = await getResponse([...own, strayHandler(ORIGIN, (request) => strays.push(request))], new Request(url));
  return { type: response && isPassthroughResponse(response) ? 'passthrough' : response?.type, strays };
};

test("REFUSED: the board's api and another origin are answered with a network error and recorded", async () => {
  assert.deepEqual(await asked(`${ORIGIN}/api/runs/x/lines`), { type: 'error', strays: ['GET /api/runs/x/lines'] });
  assert.deepEqual(await asked('https://elsewhere.test/a'), { type: 'error', strays: ['GET https://elsewhere.test/a'] });
});

test("the stories' own files pass through, and a story's own handler wins over the fallback", async () => {
  assert.deepEqual(await asked(`${ORIGIN}/src/x.tsx`), { type: 'passthrough', strays: [] });
  const own = [http.get(`${ORIGIN}/api/runs/:name/lines`, () => HttpResponse.json({ lines: [] }))];
  assert.deepEqual(await asked(`${ORIGIN}/api/runs/x/lines`, own), { type: 'default', strays: [] });
});

test('REFUSED: a story that sent strays is failed naming each; one that sent none is not', () => {
  assert.equal(straysSaid([]), undefined);
  const said = straysSaid(['GET /api/runs/a/lines', 'GET https://elsewhere.test/a']) ?? '';
  assert.ok(said.includes('GET /api/runs/a/lines'), said);
  assert.ok(said.includes('GET https://elsewhere.test/a'), said);
});
