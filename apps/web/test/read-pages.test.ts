/**
 * The board reads through the api's pages (`src/lib/api/objects.ts`, `steps.ts`, `decision.ts`): a list it shows whole is asked for pages
 * of `LIST_PAGE.most` and read on from each `continue` until a page answers none (`everyPage`), the runs not judged joined as their items
 * are, and a list asked for one page (`limit`) is read that once; a step's conversation is read on at once from each page's `cursor`
 * while the api says `more` (`readTranscript`); a step's tries are asked with every output field (`fields=*`) and each closeout's body
 * read on from its `bodyNext`; and a decision asks every diff whole (`diffs=*`). Each read on a stand-in `fetch` that answers by the query.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_PAGE, LIST_PAGE, TRANSCRIPT_PAGE } from 'objects';
import { decisionQuery, type RunDecision } from '../src/lib/api/decision.ts';
import { everyPage, runs, steps, workflows } from '../src/lib/api/objects.ts';
import { readTranscript } from '../src/lib/api/steps.ts';
import { listOfItems, workflow, workflowObject } from './library-fixtures.ts';
import { decidable, step, transcript } from './run-fixtures.ts';

/** Every request the test's `fetch` was asked, its url read against a stand-in origin, answered by `answer` as JSON. */
function answering(t: { after: (fn: () => void) => void }, answer: (url: URL) => unknown): URL[] {
  const asked: URL[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://board.invalid');
    asked.push(url);
    return new Response(JSON.stringify(answer(url)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return asked;
}

/** A page of `items` of `kind` that says `next` is the page after it, where there is one. */
const pageOf = <T>(kind: string, items: readonly T[], next?: string) => ({
  ...listOfItems(kind, items),
  metadata: next === undefined ? {} : { continue: next },
});

test('a list the board shows whole is read page by page, from each continue, and stops at the page that answers none', async (t) => {
  const names = [['a', 'b'], ['c'], ['d']];
  const asked = answering(t, (url) => {
    const at = Number(url.searchParams.get('continue') ?? 0);
    const items = (names[at] ?? []).map((name) => workflowObject(workflow({ name })));
    return pageOf('Workflow', items, at + 1 < names.length ? String(at + 1) : undefined);
  });
  const listed = await workflows.list('default');
  assert.deepEqual(
    listed.map((w) => w.metadata.name),
    ['a', 'b', 'c', 'd'],
    "every page's items, in order",
  );
  assert.deepEqual(
    asked.map((url) => url.searchParams.get('continue')),
    [null, '1', '2'],
    'each continue sent back as answered, and no page asked past the last',
  );
  assert.ok(
    asked.every((url) => url.searchParams.get('limit') === String(LIST_PAGE.most)),
    'each page asked of the most a page holds',
  );
});

test('the runs: every page with no limit, the runs not judged joined; one page where a limit or a continue names it', async (t) => {
  const asked = answering(t, (url) => {
    const at = url.searchParams.get('continue');
    return {
      ...pageOf('Run', [], at === null ? 'next' : undefined),
      unjudged: [{ name: at === null ? 'r-1' : 'r-2', error: 'its record does not read' }],
    };
  });
  const whole = await runs.listAll();
  assert.deepEqual(
    whole.unjudged?.map((run) => run.name),
    ['r-1', 'r-2'],
  );
  assert.equal(whole.metadata.continue, undefined, 'the list read whole says no page is left');
  assert.equal(asked.length, 2);

  asked.length = 0;
  const one = await runs.list('nightly', { fieldSelector: 'status.state=finished', limit: 9 });
  assert.equal(one.metadata.continue, 'next', 'the page asked, its continue kept for the pager');
  assert.equal(asked.length, 1, 'a page asked by its limit is read once');
  assert.equal(asked[0]?.searchParams.get('limit'), '9');
});

test('REFUSED: a page that answers back the continue it was asked with is refused, never asked again forever', async (t) => {
  answering(t, () => pageOf('Workflow', [], 'again'));
  await assert.rejects(workflows.list('default'));
});

test('everyPage joins the pages a caller reads: the first page’s shape, every page’s items, the last page’s metadata', async () => {
  const pages = [pageOf('Hire', ['x'], 'p1'), pageOf('Hire', ['y'])];
  const asked: Array<string | undefined> = [];
  const joined = await everyPage(async (page) => {
    asked.push(page.continue);
    return pages[page.continue === undefined ? 0 : 1] ?? pageOf('Hire', []);
  });
  assert.deepEqual(joined, { ...pageOf('Hire', ['x', 'y']), metadata: {} });
  assert.deepEqual(asked, [undefined, 'p1']);
});

test("a step's conversation is read on at once from each cursor while the api says more, and the last page's cursor is followed", async (t) => {
  const [said, called, result] = transcript().events;
  const asked = answering(t, (url) => {
    const after = url.searchParams.get('after');
    if (after === null) return transcript({ events: [said].flatMap((e) => (e ? [e] : [])), cursor: 'c-1~1', more: true });
    if (after === 'c-1~1') return transcript({ events: [called].flatMap((e) => (e ? [e] : [])), cursor: 'c-1~2', more: true });
    return transcript({ events: [result].flatMap((e) => (e ? [e] : [])), cursor: 'c-3', live: false });
  });
  const read = await readTranscript('r-1', 'implement');
  assert.deepEqual(read.events, transcript().events, "every page's events, in order");
  assert.equal(read.cursor, 'c-3', "the last page's cursor, where the stream follows from");
  assert.equal(read.live, false, "the last page's word on the task");
  assert.deepEqual(
    asked.map((url) => url.searchParams.get('after')),
    [null, 'c-1~1', 'c-1~2'],
  );
  assert.ok(asked.every((url) => url.searchParams.get('limit') === String(TRANSCRIPT_PAGE.most)));
});

test("a step's tries are asked with every output field, and a closeout's body read on from its bodyNext until none is left", async (t) => {
  const closeout = step().closeout;
  assert.ok(closeout !== null && closeout !== undefined);
  const [first, current] = step().tries;
  assert.ok(first !== undefined && current !== undefined);
  const asked = answering(t, (url) => {
    if (url.pathname.endsWith('/tries')) return { tries: [first, { ...current, closeout: { ...closeout, body: 'AB', bodyNext: 2 } }] };
    const from = url.searchParams.get('bodyFrom');
    const page = from === '2' ? { body: 'CD', bodyNext: 4 } : { body: 'E' };
    return { try: current.try, closeout: { ...closeout, ...page }, unreadable: null };
  });
  const { tries } = await steps.tries('r-1', 'implement');
  const read = tries.at(-1)?.closeout;
  assert.equal(read?.body, 'ABCDE', 'every page of the body, in order');
  assert.equal(read?.bodyNext, undefined, 'the body read whole says no page is left');
  assert.deepEqual(tries[0], first, 'a try whose closeout was answered whole is as it was');
  assert.equal(asked[0]?.searchParams.get('fields'), '*');
  assert.deepEqual(
    asked.slice(1).map((url) => [url.pathname, url.searchParams.get('bodyFrom'), url.searchParams.get('bodyLimit')]),
    [
      [`/api/runs/r-1/steps/implement/tries/${current.try}/closeout`, '2', String(BODY_PAGE.most)],
      [`/api/runs/r-1/steps/implement/tries/${current.try}/closeout`, '4', String(BODY_PAGE.most)],
    ],
  );
});

test('a decision asks every diff whole, which the gate shows in full', async (t) => {
  const asked = answering(t, () => decidable());
  const readDecision = decisionQuery('r-1', 'stamp').queryFn as unknown as () => Promise<RunDecision>;
  await readDecision();
  assert.equal(asked[0]?.searchParams.get('diffs'), '*');
});
