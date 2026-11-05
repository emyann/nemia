/**
 * The runs as a list of objects (`runListOf`, run-list.verb.ts), over runs given and a stand-in judge that counts what it is asked: a
 * namespace keeps its factory's runs, `default` a run that names none; a label selector keeps by the record's map; `limit` and `continue`
 * walk the runs by name; a run that cannot be judged is named in `unjudged`, never in `items`; a bad selector, limit or token is
 * `Invalid` before any run is judged; and only the page's runs are judged. One run is `Missing` under a namespace it is not in
 * (`runIn`). Kinds are asserted, never sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import type { Run as RunObject } from 'objects';
import { runIn, runListOf, type RunQuery } from './run-list.verb.ts';
import type { RunObjectAnswer } from '../object/run.verb.ts';

type Listed = { id: string; factory?: string; workflowDir: string; labels?: Record<string, string> };

const runs: Listed[] = [
  { id: 'c-3', workflowDir: '/w/build', labels: { team: 'core' } },
  { id: 'a-1', workflowDir: '/w/build', factory: 'foo' },
  { id: 'b-2', workflowDir: '/w/quick', labels: { team: 'web' } },
  { id: 'd-4', workflowDir: '/w/build', factory: 'foo', labels: { team: 'core' } },
];

/** A stand-in judgement: a `Run` naming the run, or none for the runs `broken` names. */
const judgeOf = (broken: readonly string[] = []) => {
  const asked: string[] = [];
  const judge = (run: Listed) =>
    Effect.sync((): RunObjectAnswer => {
      asked.push(run.id);
      return broken.includes(run.id)
        ? { unjudged: 'its journal does not read' }
        : ({ apiVersion: 'nemia/v1', kind: 'Run', metadata: { name: run.id } } as unknown as RunObject);
    });
  return { asked, judge };
};

const listed = (query: RunQuery, broken?: readonly string[]) => {
  const { asked, judge } = judgeOf(broken);
  const exit = Effect.runSyncExit(runListOf(runs, query, judge));
  return { exit, asked };
};

const valueOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw new Error(`failed: ${String(exit.cause)}`);
};
const kindOf = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isSuccess(exit)) return 'ok';
  const failed = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return failed && 'error' in failed ? String((failed.error as { _tag?: unknown })._tag) : 'defect';
};

const names = (query: RunQuery, broken?: readonly string[]) => valueOf(listed(query, broken).exit).items.map((r) => r.metadata.name);

test('across namespaces every run is listed by name; a namespace keeps its factory runs, default those that name none', () => {
  const all = valueOf(listed({}).exit);
  assert.equal(all.kind, 'RunList');
  assert.deepEqual(
    all.items.map((r) => r.metadata.name),
    ['a-1', 'b-2', 'c-3', 'd-4'],
  );
  assert.equal(all.metadata.remainingItemCount, 0);
  assert.equal(all.metadata.continue, undefined, 'the last page carries no token');
  assert.deepEqual(names({ namespace: 'default' }), ['b-2', 'c-3']);
  assert.deepEqual(names({ namespace: 'foo' }), ['a-1', 'd-4']);
  assert.deepEqual(names({ namespace: 'bar' }), []);
});

test("a label selector keeps the runs whose record's map it takes, its workflow and factory among them, given again OR'd", () => {
  assert.deepEqual(names({ labelSelector: ['team=core'] }), ['c-3', 'd-4']);
  assert.deepEqual(names({ labelSelector: ['workflow=quick'] }), ['b-2']);
  assert.deepEqual(names({ labelSelector: ['factory=default,team=core'] }), ['c-3']);
  assert.deepEqual(names({ labelSelector: ['team=web', 'factory=foo'] }), ['a-1', 'b-2', 'd-4']);
  assert.deepEqual(names({ namespace: 'foo', labelSelector: ['team=core'] }), ['d-4']);
});

test('limit cuts a page with a token and the count left; the token reads the next page by name, and the selection is before the page', () => {
  const first = valueOf(listed({ limit: 1, labelSelector: ['team=core'] }).exit);
  assert.deepEqual(
    first.items.map((r) => r.metadata.name),
    ['c-3'],
  );
  assert.equal(first.metadata.remainingItemCount, 1, 'remainingItemCount counts what the selector keeps');
  assert.ok(first.metadata.continue);
  const next = valueOf(listed({ limit: 1, labelSelector: ['team=core'], continue: first.metadata.continue }).exit);
  assert.deepEqual(
    next.items.map((r) => r.metadata.name),
    ['d-4'],
  );
  assert.equal(next.metadata.continue, undefined);
});

test('only the runs of the page are judged, after they are selected', () => {
  const { exit, asked } = listed({ limit: 2, namespace: 'default' });
  assert.equal(kindOf(exit), 'ok');
  assert.deepEqual(asked, ['b-2', 'c-3'], 'one judgement per run of the page, and none of another namespace');
});

test('a run that cannot be judged is named in unjudged, never in items, and the page still answers the others', () => {
  const page = valueOf(listed({}, ['b-2']).exit);
  assert.deepEqual(
    page.items.map((r) => r.metadata.name),
    ['a-1', 'c-3', 'd-4'],
  );
  assert.deepEqual(
    page.unjudged?.map((u) => u.name),
    ['b-2'],
  );
  assert.equal(Object.hasOwn(valueOf(listed({}).exit), 'unjudged'), false, 'a page whose runs are all judged has no unjudged');
});

test('REFUSED: a selector, a limit or a token that is not one is Invalid, and no run is judged', () => {
  for (const query of [{ labelSelector: ['team=='] }, { limit: 0 }, { limit: 1.5 }, { continue: '***' }] satisfies RunQuery[]) {
    const { exit, asked } = listed(query);
    assert.equal(kindOf(exit), 'Invalid', JSON.stringify(query));
    assert.deepEqual(asked, [], `${JSON.stringify(query)} judges nothing`);
  }
});

test('one run is in its own namespace alone: REFUSED Missing under another', () => {
  assert.equal(kindOf(Effect.runSyncExit(runIn({ id: 'a-1', factory: 'foo' }, 'foo'))), 'ok');
  assert.equal(kindOf(Effect.runSyncExit(runIn({ id: 'a-1', factory: 'foo' }, 'default'))), 'Missing');
  assert.equal(kindOf(Effect.runSyncExit(runIn({ id: 'b-2' }, 'default'))), 'ok');
  assert.equal(kindOf(Effect.runSyncExit(runIn({ id: 'b-2' }, 'foo'))), 'Missing');
});
