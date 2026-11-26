/**
 * `nemia inbox resend`, as a person meets it: a card started as a run that waits on them at a gate is sent on to another workflow as a
 * card of its own, `<run>-resent`, queued and handed that run, and the run is cancelled by who asked; sent on with no workflow, the card
 * names none and is left unqueued for its factory's card triggers; a card whose run has ended is sent on and no cancel asked. Refused by
 * kind, exit 2, with nothing filed: a card whose run is still at work, one sent on already, one never started, one not there, and a
 * workflow that is no workflow's name, or one the card's factory does not offer. A cancel that fails leaves the card filed and says so,
 * and asking again names the cancel to type. Each story one describe on the stage (`story.ts`).
 *
 * The store is the file's own, at `ROOT`, given as `ENV`, with `WF_DEFAULT_FACTORY_STARTS` in it: its cards name no factory.
 */
import { cardNames, plantCard, plantRecord, runKey, runRecord } from '../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { staged, story, type Board } from './story.ts';
import { advanceRun, runWith as runEngine, startFromInbox } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { INBOX_RESEND } from '../src/inbox/commands.verb.ts';
import { CANCEL } from '../src/cancel/commands.verb.ts';
import type { Env } from '../src/config/config.store.ts';
import { told } from './typed.ts';
import { Effect } from 'effect';
import { RunDoor } from '../src/runs/runs.store.ts';
import { addFactoryAt } from '../src/factory/factory.store.ts';

const ROOT = scratch('wf-resend-card-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
  WF_DEFAULT_FACTORY_STARTS: '1',
};
const stage = staged({ runWith: runEngine, main: told, engineOf, env: ENV });

const SIGNED = { outcome: 'done', summary: 'the plan: parse the flag', artifacts: [], needs: null };
const ACTOR = { kind: 'person', token: 'laptop' } as const;

/** A repository with `workflows/deliver`, plan then implement, which a card names by its name. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  const dir = path.join(repo, 'workflows', 'deliver');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nafter: plan\n---\nimplement it\n');
  return repo;
};

/** Files the card `name` in the store's inbox, on `deliver`, gated at plan, labelled. */
const fileCard = (name: string) =>
  plantCard(ROOT, name, '---\nworkflow: deliver\ngate: plan\nlabels: { door: front }\n---\nParse the flag.\n');

/** The inbox's cards, by name. */
const cards = () => [...cardNames(ROOT)].sort() satisfies string[];

/** One pass of the tick over the run `id`. */
const pass = (b: Board, id: string) => stage.runWith(b.e, advanceRun(runRecord(ROOT, id)));

/** The card `name` sent on, as the api's `resend` asks it, by the person. */
const resend = (b: Board, name: string, workflow?: string) =>
  stage.runWith(b.e, INBOX_RESEND.handler({ name, ...(workflow === undefined ? {} : { workflow }), actor: ACTOR }));

/** `program` given a Run door whose cancel fails, as a disk that refuses the cancellation's file would. */
const cancelRefused = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const door = yield* RunDoor;
    const refused = { ...door.runs, cancel: () => Effect.die(new Error('EACCES: the cancellation could not be written')) };
    return yield* program.pipe(Effect.provideService(RunDoor, { ...door, runs: refused }));
  });

/** The card `name` filed and started on `repo`, its run filed and plan in flight: answers the run's id. */
const started = async (b: Board, name: string, repo: string) => {
  fileCard(name);
  const id = (await stage.runPlaced(startFromInbox({ name, callerRepo: repo }))).run.id;
  await pass(b, id);
  return id;
};

/** The card `name` started, its plan signed off, its run waiting at plan's gate: answers the run's id. */
const atGate = async (b: Board, name: string, repo: string) => {
  const id = await started(b, name, repo);
  b.settle(`${id}-plan`, 'succeeded', SIGNED);
  assert.deepEqual((await pass(b, id)).filed, [], 'held at its gate');
  return id;
};

/** Refused as `tag`, exit 2. */
const refusedAs = (tag: string) => (err: Error & { _tag?: string; exitCode?: number }) => {
  assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
  return true;
};

describe('a card waiting on its person at a gate is sent on to another workflow, and its run is cancelled', () => {
  let repo!: string;
  let b!: Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  let id = '';
  s.test('a card whose run is still at work is refused Conflict, and nothing is filed', async () => {
    id = await started(b, 'parse-the-flag-k2q9', repo);
    await assert.rejects(resend(b, 'parse-the-flag-k2q9', 'triage'), refusedAs('Conflict'));
    assert.deepEqual(cards(), ['parse-the-flag-k2q9']);
  });
  s.test('once it waits at its gate, it is filed as <run>-resent, queued on the workflow named, handed the run', async () => {
    b.settle(`${id}-plan`, 'succeeded', SIGNED);
    assert.deepEqual((await pass(b, id)).filed, [], 'held at its gate');
    const done = await resend(b, 'parse-the-flag-k2q9', 'triage');
    assert.equal(done.card.name, `${id}-resent`);
    assert.deepEqual(done.from, { card: 'parse-the-flag-k2q9', run: id });
    assert.equal(done.card.workflow, 'triage');
    assert.ok(done.card.queued !== undefined, 'queued');
    assert.deepEqual(done.card.from, [id]);
    assert.deepEqual(done.card.labels, { door: 'front' }, 'its labels kept');
    assert.equal(done.card.gate, undefined, "the gate named deliver's step, and is dropped");
    assert.deepEqual(cards(), [`${id}-resent`, 'parse-the-flag-k2q9'].sort());
  });
  s.test('the run it came from is cancelled, by who sent the card on', () => {
    const run = runRecord(ROOT, id);
    assert.ok(run.cancelledAt !== undefined, 'cancelled');
    assert.deepEqual(run.cancelledBy, ACTOR);
  });
  s.test('sent on again, it is refused Conflict: a card is sent on once', async () => {
    await assert.rejects(resend(b, 'parse-the-flag-k2q9', 'deliver'), refusedAs('Conflict'));
  });
  s.test('the card sent on, never started, is refused Invalid', async () => {
    await assert.rejects(resend(b, `${id}-resent`), refusedAs('Invalid'));
  });
  s.test('a name with no card is refused Missing, and a workflow that is a path Invalid', async () => {
    await assert.rejects(resend(b, 'no-such-card-k2q9'), refusedAs('Missing'));
    await assert.rejects(resend(b, 'parse-the-flag-k2q9', 'a/b'), refusedAs('Invalid'));
  });
});

describe('a card sent on naming no workflow is left unqueued, for its factory’s card triggers', () => {
  let repo!: string;
  let b!: Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  s.test('it names no workflow, is not queued, keeps its labels, and its run is cancelled', async () => {
    const id = await atGate(b, 'store-the-flag-3z4w', repo);
    const done = await resend(b, 'store-the-flag-3z4w');
    assert.equal(done.card.workflow, undefined);
    assert.equal(done.card.queued, undefined);
    assert.deepEqual(done.card.labels, { door: 'front' });
    assert.equal(done.cancelled, id);
  });
});

describe('a card whose run has ended is sent on, and no cancel is asked', () => {
  let repo!: string;
  let b!: Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  s.test('a cancelled run is sent on from, and the answer says no run cancelled', async () => {
    const id = await atGate(b, 'show-the-flag-a1b2', repo);
    await stage.runWith(b.e, CANCEL.handler({ runId: id }));
    await pass(b, id);
    const done = await resend(b, 'show-the-flag-a1b2', 'triage');
    assert.equal(done.card.name, `${id}-resent`);
    assert.equal(done.cancelled, undefined);
    assert.equal(done.cancelLeft, undefined);
    assert.equal(runRecord(ROOT, id).cancelledBy, undefined, 'the first cancellation stands');
  });
});

describe('a cancel that fails leaves the card filed and says so, and asking again names the cancel to type', () => {
  let repo!: string;
  let b!: Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  let id = '';
  s.test('the card is filed, `cancelLeft` says why the run was not called off, and the run still stands', async () => {
    id = await atGate(b, 'cache-the-rows-q7w2', repo);
    const done = await stage.runWith(
      b.e,
      cancelRefused(INBOX_RESEND.handler({ name: 'cache-the-rows-q7w2', workflow: 'triage', actor: ACTOR })),
    );
    assert.equal(done.card.name, `${id}-resent`);
    assert.ok(cards().includes(`${id}-resent`), 'the card stays filed');
    assert.equal(done.cancelled, undefined);
    assert.ok(done.cancelLeft?.includes(`nemia cancel ${id}`), done.cancelLeft);
    assert.equal(runRecord(ROOT, id).cancelledAt, undefined, 'the run was not called off');
  });
  s.test('sent on again, it is refused Conflict, naming the cancel of the run that has not ended', async () => {
    await assert.rejects(resend(b, 'cache-the-rows-q7w2', 'triage'), (err: Error & { _tag?: string; exitCode?: number }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2], err.message);
      assert.ok(err.message.includes(`nemia cancel ${id}`), err.message);
      return true;
    });
  });
});

describe('a card of a factory sent on to a workflow its factory does not offer is refused, and nothing is filed', () => {
  let b!: Board;
  beforeAll(() => {
    const t = teardowns();
    b = stage.board();
    addFactoryAt(ROOT, { name: 'acme', volumes: [`${aRepo()}:rw`] });
    plantCard(ROOT, 'tidy-the-docs-m3n8', '---\nfactory: acme\n---\nTidy the docs.\n');
    plantRecord(
      ROOT,
      runKey('tidy-the-docs-m3n8-r1'),
      JSON.stringify({
        id: 'tidy-the-docs-m3n8-r1',
        repo: '/code/app',
        workspace: '/code/app',
        baseRef: 'abc123',
        branch: 'main',
        isolate: true,
        brief: 'Tidy the docs.',
        workflowDir: '/code/app/workflows',
        createdAt: '2026-11-05T00:00:00.000Z',
        workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
        steps: { implement: { taskId: null } },
        from: { inbox: 'tidy-the-docs-m3n8' },
      }),
    );
    fs.writeFileSync(path.join(ROOT, 'runs', 'tidy-the-docs-m3n8-r1.cancelled'), '2026-11-05T01:00:00.000Z');
    return t.end;
  });
  const s = story(test);
  s.test('refused Invalid, and no card is filed', async () => {
    await assert.rejects(resend(b, 'tidy-the-docs-m3n8', 'triage'), refusedAs('Invalid'));
    assert.ok(!cards().includes('tidy-the-docs-m3n8-r1-resent'), 'nothing filed');
  });
});
