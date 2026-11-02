/**
 * Context without a wait, as the board reads and writes it: `GET /api/runs/:runId/concluded`, the section a run started with `--from` would
 * be handed; `PUT` and `DELETE /api/inbox/:name/from`, a card's `from:` set and taken off; and a step's `taskParts` on `GET /api/runs/:id`,
 * each `## From run` section labelled by how the run was handed it — in the harness's scratch store (`root`), on the stand-ins: the
 * runtime's test engine and the test place.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import { story } from './checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from '../src/detail/detail.ts';
import type { InboxFromAnswer } from '../src/inbox/inbox.ts';
import { addToInbox, StoreRoot } from 'agent-orchestrator';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, eachTest, engineFor } from './placed.ts';

/** `program`, one of the package's inbox verbs, run on the harness's store (`root`): its refusal thrown as itself. */
const onStore = <A, E>(program: Effect.Effect<A, E>): A => Effect.runSync(Effect.provideService(program, StoreRoot, root));

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const JSON_TYPE = { 'content-type': 'application/json' };

const writeRun = (run: { id: string } & Record<string, unknown>) => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${run.id}.json`),
    JSON.stringify({
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${run.id}`,
      workflowDir: '/code/app/workflows',
      createdAt: '2026-09-12T00:00:00.000Z',
      steps: { implement: { taskId: null } },
      ...run,
    }),
  );
};

/** A task filed with `brief` and waiting for a slot: the package's engine files every task queued. */
const queuedTask = (taskId: string, brief: string) =>
  Effect.runSync(engine().file({ id: taskId, brief, cwd: '/code/app', harness: 'codex' }));

const section = (run: string, asked: string) =>
  ['', `## From run ${run}`, '', `Words about ${run}.`, '', 'What it was asked, the first line:', '```', asked, '```'].join('\n');

test("context without a wait: a run's concluded section read, a card's from: set and taken off, and a step's From run sections labelled by how each was handed", async (t) => {
  const s = story(t);
  await s.test(
    'GET /api/runs/:runId/concluded answers the run, whether it landed and its section in context words; an unknown run is a 404',
    async () => {
      writeRun({ id: 'source-c1' });
      const res = await app().request('/api/runs/source-c1/concluded');
      assert.equal(res.status, 200);
      const answer = (await res.json()) as { run: string; landed: boolean; section: string };
      assert.equal(answer.run, 'source-c1');
      assert.equal(answer.landed, false, 'a run with nothing on its base has not landed');
      assert.match(answer.section, /^\n## From run source-c1\n/);
      assert.match(answer.section, /Not landed, not judged/);

      const missing = await app().request('/api/runs/nobody-z9/concluded');
      assert.equal(missing.status, 404);
      assert.match(((await missing.json()) as { error: string }).error, /the store has no run nobody-z9/);
    },
  );
  await s.test(
    'GET /api/runs/:runId/concluded refuses an id that is not a name, never reading the record a path names — REFUSED: `..%2Fescape`',
    async () => {
      writeRun({ id: '../escape' });
      const res = await app().request('/api/runs/..%2Fescape/concluded');
      assert.equal(res.status, 422);
      const { error } = (await res.json()) as { error: string };
      assert.match(error, /"\.\.\/escape" is not a run's id/);
      assert.doesNotMatch(error, /The brief of/);
    },
  );
  await s.test(
    "PUT /api/inbox/:name/from sets a card's from:, DELETE takes it off — REFUSED: a run the store does not have is a 404, nothing written",
    async () => {
      writeRun({ id: 'source-f1' });
      const { card } = onStore(addToInbox({ text: 'Read what source-f1 concluded' }));
      const file = path.join(root, 'inbox', `${card.name}.md`);
      const put = (runs: string[]) =>
        app().request(`/api/inbox/${card.name}/from`, { method: 'PUT', headers: JSON_TYPE, body: JSON.stringify({ runs }) });

      const set = await put(['source-f1']);
      assert.equal(set.status, 200);
      const answer = (await set.json()) as InboxFromAnswer;
      assert.deepEqual({ ...answer, file: undefined }, { name: card.name, file: undefined, from: ['source-f1'], was: [] });
      assert.match(fs.readFileSync(file, 'utf8'), /^from: source-f1$/m);

      const before = fs.readFileSync(file, 'utf8');
      const unknown = await put(['nobody-z9']);
      assert.equal(unknown.status, 404);
      assert.match(((await unknown.json()) as { error: string }).error, /nobody-z9/);
      assert.equal(fs.readFileSync(file, 'utf8'), before, 'a refused from: writes nothing');

      const off = await app().request(`/api/inbox/${card.name}/from`, { method: 'DELETE', headers: JSON_TYPE, body: '{}' });
      assert.equal(off.status, 200);
      assert.deepEqual(((await off.json()) as InboxFromAnswer).was, ['source-f1']);
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /^from:/m);
    },
  );
  await s.test(
    "a step's taskParts label each From run section by how its run was handed it: waited on for --after, read for --from",
    async () => {
      const brief = ['Do the work.', section('waited-a1', 'Build the cache.'), section('read-b2', 'Measure the cache.'), ''].join('\n');
      queuedTask('t-context', brief);
      writeRun({
        id: 'child-c3',
        after: ['waited-a1'],
        context: ['read-b2'],
        workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
        steps: { implement: { taskId: 't-context' } },
      });

      const res = await app().request('/api/runs/child-c3');
      assert.equal(res.status, 200);
      const detail = (await res.json()) as RunDetail;
      assert.deepEqual(detail.context, ['read-b2']);
      const parts = detail.steps[0].taskParts ?? [];
      assert.deepEqual(
        parts.map((p) => (p.kind === 'from' ? [p.run, p.how, p.asked] : [p.kind])),
        [['text'], ['waited-a1', 'waited', 'Build the cache.'], ['read-b2', 'read', 'Measure the cache.']],
      );
    },
  );
});
