/**
 * The board's workflow components (`src/components/workflow/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';
import { routedWith, textsOf } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');

/**
 * The builder's banner for a save that did not go through, as the api answered it: the head line, and whether it offers to read the folder
 * again.
 */
async function refusedMarkup(
  message: string,
  steps: string[],
  status: number | null,
): Promise<{ head: string; reread: boolean; said: string }> {
  const { SaveRefused } = await import('../src/components/workflow/WorkflowBuilder.tsx');
  const { BuildRefusal } = await import('../src/lib/api.ts');
  const html = renderToStaticMarkup(
    createElement(SaveRefused, {
      refusal: new BuildRefusal(message, steps, status),
      rereading: false,
      onReread: () => {},
    }),
  );
  const texts = textsOf(html);
  return { head: texts[0], reread: /Read the folder again/.test(html), said: texts[1] };
}

test('a save the api refused — a 4xx — says nothing was written, and only a 409 offers to read the folder again', async () => {
  const refused = await refusedMarkup('review: waits on "x", which is not a step here', ['review'], 422);
  assert.equal(refused.head, 'Not saved, and nothing written. The api refused it, for review:');
  assert.equal(refused.said, 'review: waits on "x", which is not a step here');
  assert.equal(refused.reread, false, 'nothing to read again: the folder is as the draft read it');
  const cycle = await refusedMarkup('these steps wait on each other: implement, review', ['implement', 'review'], 422);
  assert.equal(cycle.head, 'Not saved, and nothing written. The api refused it, for implement and review:');
  const folder = await refusedMarkup('no steps to write to /w, and a workflow has at least one.', [], 400);
  assert.equal(folder.head, 'Not saved, and nothing written. The api refused it:', 'no steps named, no clause');
  const stale = await refusedMarkup('/w has changed since it was read at version 3. Nothing was written. Read the folder again', [], 409);
  assert.equal(
    stale.head,
    'Not saved, and nothing written. The api refused it:',
    'the folder changed since it was read: nothing written either',
  );
  assert.equal(stale.reread, true, 'and the way on is to read it again');
});

test('REFUSED at shipped defaults: a save the api broke off — a 500 — does not say nothing was written; it says the folder may have been, and offers to read it again', async () => {
  const broke = await refusedMarkup("EACCES: permission denied, open '/w/plan.md'", [], 500);
  assert.equal(
    broke.head,
    'Not saved. The folder may have been written all the same: the api broke off (500), and what the folder holds is what is on disk:',
  );
  assert.doesNotMatch(broke.head, /nothing written/, 'a 500 is a write that broke off partway, and the api cannot say what it wrote');
  assert.equal(broke.said, "EACCES: permission denied, open '/w/plan.md'");
  assert.equal(broke.reread, true);
});

test('REFUSED at shipped defaults: a save with no status — a fetch that never landed, and an answer without what it wrote — does not say nothing was written; it says the folder may have been, names no status, and offers to read it again', async () => {
  const said =
    'Not saved. The folder may have been written all the same: the api did not say what it wrote, and what the folder holds is what is on disk:';
  const lost = await refusedMarkup('Failed to fetch', [], null);
  assert.equal(lost.head, said);
  assert.doesNotMatch(lost.head, /nothing written/, 'the api may have carried the write out and died before answering');
  assert.equal(lost.said, 'Failed to fetch');
  assert.equal(lost.reread, true);

  const shapeless = await refusedMarkup(
    'PUT /api/namespaces/default/workflows/mine answered what this board does not read: at status, the value is missing. The folder may be written: reload the Workflows page before writing it again.',
    [],
    null,
  );
  assert.equal(
    shapeless.head,
    said,
    "the other refusal with no status of its own (`saveWorkflow` in lib/api/workflows.ts): the head says what the api's answer did not say",
  );
  assert.doesNotMatch(
    shapeless.head,
    /did not answer/,
    'it answered: 200, without what it wrote; a head that says it said nothing would contradict its message on the line below',
  );
  assert.equal(shapeless.reread, true);
});

test('REFUSED: a place that lists no workflows is said on the page — a factory on several repositories asks which, each a link, and one refused says why — and a place that lists draws nothing', async () => {
  const { Unplaced } = await import('../src/components/workflow/WorkflowParts.tsx');
  const draw = (where: unknown) =>
    routedWith(
      createElement(Unplaced, {
        where: where as never,
        back: 'the way out',
        onRepo: (repo: string, name: string) => createElement('a', { href: `?repo=${repo}` }, name),
      }),
    );
  const pick = await draw({ kind: 'pick', factory: 'quay', repos: ['/code/a', '/code/b'] });
  assert.match(pick, /data-pick-repo="quay"[^]*works on 2 repositories/);
  assert.match(
    pick,
    /title="\/code\/a"[^]*<a href="\?repo=\/code\/a">a<\/a>[^]*title="\/code\/b"[^]*<a href="\?repo=\/code\/b">b<\/a>[^]*the way out\./,
  );
  const refused = await draw({ kind: 'refused', factory: 'gone', why: 'No factory is named gone.' });
  assert.match(refused, /data-unplaced="gone"[^>]*>No factory is named gone\. the way out\.</);
  assert.equal(await draw({ kind: 'every' }), '');
  assert.equal(await draw({ kind: 'in', place: { factory: 'f', repo: '/r' }, repos: ['/r'] }), '');
});

test('the workflows a list leaves out are said under it, each by name with why it does not read — and nothing when every one reads', async () => {
  const { WorkflowsUnread } = await import('../src/components/workflow/WorkflowOptions.tsx');
  const listing = (name: string, error: string | null, from = 'repo') => ({ name, from, error }) as never;
  const html = renderToStaticMarkup(
    createElement(WorkflowsUnread, { workflows: [listing('ok', null), listing('dev', 'implement: `agent: implementer` fills this step')] }),
  );
  assert.equal(
    html,
    '<div data-workflows-unread="true" class="space-y-1 text-body-small text-yours"><p>Not offered until it reads:</p><p data-unread="dev" class="whitespace-pre-wrap break-words"><span class="font-mono">dev</span>: implement: `agent: implementer` fills this step</p></div>',
  );
  assert.equal(renderToStaticMarkup(createElement(WorkflowsUnread, { workflows: [listing('ok', null)] })), '');
});
