/**
 * The bound of a moved read (`src/objects.ts`): on a stand-in api that takes the connection and never answers, a read gives up once its
 * bound is gone, refused with the exit code of a usage refusal and naming what to type next. The shipped bound, `READ_BOUND_MS`, is not
 * waited out: the test shortens it at the seam `asked` gives for it, and floors the wait there. And the page follower (`everyPage`): a
 * list printed whole is asked for pages of `LIST_PAGE.most`, each `continue` sent back as answered, until a page answers none, its
 * objects (or its `Table`'s rows) read as one list in order; a page answering back the `continue` it was asked with is refused.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Effect } from 'effect';
import { LIST_PAGE } from 'objects';
import { asked, everyPage, type PageAsked } from '../src/objects.ts';
import { Refused } from '../src/refused.ts';

/** The bound the test gives the read, in place of the shipped one. */
const SHORT_MS = 200;

/** What a floor at `SHORT_MS` forgives: a timer fires up to a millisecond before a clock read around it says its delay is gone. */
const TIMER_SLACK_MS = 5;

/** A server that accepts every request and answers none, held open until the file ends. */
const silent = http.createServer(() => {});
await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
after(() => {
  silent.closeAllConnections();
  silent.close();
});

test('REFUSED: a moved read the api never answers gives up at its bound, exit 2, naming the status and the restart', async () => {
  const root = path.join(scratch('nemia-bound-'), 'store');
  fs.mkdirSync(root, { recursive: true });
  const { port } = silent.address() as AddressInfo;
  fs.writeFileSync(path.join(root, 'daemon.json'), JSON.stringify({ url: `http://127.0.0.1:${port}` }));
  const env: NodeJS.ProcessEnv = { WF_ROOT: root, NEMIA_DAEMON_START: 'off' };

  const began = performance.now();
  const refused = await asked('show', (client) => client.runs.show({ params: { name: 'any' } }), env, SHORT_MS).then(
    () => assert.fail('the read answered, though the api never did'),
    (err: unknown) => err,
  );
  const waited = performance.now() - began;

  assert.ok(refused instanceof Refused, `a Refused, not ${String(refused)}`);
  assert.equal(refused.code, 2);
  assert.match(refused.message, /nemia service status/, 'it names the status');
  assert.match(refused.message, /nemia service restart/, 'and the restart');
  assert.doesNotMatch(refused.message, /--local/, 'never --local, which is refused');
  assert.ok(waited >= SHORT_MS - TIMER_SLACK_MS, `it waited out its bound before it gave up: ${waited} ms`);
});

/** A list served in `pages`, each page's `continue` the index of the next as a word: what was asked, and the follower's answer. */
async function followed<
  P extends { readonly metadata: { readonly continue?: string } } & (
    | { readonly items: readonly unknown[] }
    | { readonly rows: readonly unknown[] }
  ),
>(pages: readonly P[]) {
  const sent: PageAsked[] = [];
  const read = await Effect.runPromise(
    everyPage((page: PageAsked) => {
      sent.push(page);
      const at = page.continue === undefined ? 0 : Number(page.continue.slice('page-'.length));
      const answered = pages[at];
      return answered === undefined ? Effect.die(new Error(`no page ${at}`)) : Effect.succeed(answered);
    }),
  );
  return { sent, read };
}

/** A page of runs named `names`, which says `next` is the page after it, where there is one. */
const runsPage = (names: readonly string[], next?: number) => ({
  kind: 'RunList',
  metadata: next === undefined ? {} : { continue: `page-${next}` },
  items: names.map((name) => ({ metadata: { name } })),
});

test('everyPage reads every page of a list, sending back each `continue`, and stops at the page that answers none', async () => {
  const { sent, read } = await followed([runsPage(['a', 'b'], 1), runsPage(['c'], 2), runsPage(['d', 'e'])]);
  assert.deepEqual(
    read.items.map((item) => item.metadata.name),
    ['a', 'b', 'c', 'd', 'e'],
    "every page's objects, in order",
  );
  assert.equal(read.kind, 'RunList');
  assert.equal(read.metadata.continue, undefined, 'the list read whole says no page is left');
  assert.deepEqual(
    sent,
    [
      { limit: String(LIST_PAGE.most) },
      { limit: String(LIST_PAGE.most), continue: 'page-1' },
      { limit: String(LIST_PAGE.most), continue: 'page-2' },
    ],
    'a page of the most the api answers, each `continue` sent back as answered, and no page asked past the last',
  );
});

test("everyPage reads a list asked for its Table as one table: the first page's columns, every page's rows", async () => {
  const columns = [{ name: 'Name', type: 'string', format: 'name', priority: 0 }];
  const table = (rows: readonly string[], next?: number) => ({
    kind: 'Table' as const,
    metadata: next === undefined ? {} : { continue: `page-${next}` },
    columnDefinitions: columns,
    rows: rows.map((name) => ({ cells: [name] })),
  });
  const { sent, read } = await followed([table(['a'], 1), table(['b', 'c'])]);
  assert.deepEqual(read.columnDefinitions, columns);
  assert.deepEqual(
    read.rows.map((row) => row.cells[0]),
    ['a', 'b', 'c'],
  );
  assert.equal(sent.length, 2);
});

test('REFUSED: a page answering back the `continue` it was asked with is refused, not asked again forever', async () => {
  const again = { kind: 'RunList', metadata: { continue: 'page-1' }, items: [] };
  await assert.rejects(followed([again, again]));
});
