/**
 * `nemia resend <run>`, as a person meets it: a run no card started, waiting on them at a gate, is sent on as a card of its own,
 * `<run>-resent`, made from the run's brief, queued on the workflow named and handed the run, and the run is cancelled by who asked.
 * Refused by kind, exit 2, with nothing filed: a run still at work, a run a card started (the card is sent on instead), a run that is
 * not there, and a workflow that is no workflow's name. Each story one describe on the stage (`story.ts`).
 *
 * The store is the file's own, at `ROOT`, given as `ENV`, with `WF_DEFAULT_FACTORY_STARTS` in it: its cards name no factory.
 */
import { cardNames, plantCard, runRecord } from '../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { staged, story, type Board } from './story.ts';
import { advanceRun, runWith as runEngine, startFromInbox, startRun } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { RESEND } from '../src/inbox/commands.verb.ts';
import type { Env } from '../src/config/config.store.ts';
import { told } from './typed.ts';

const ROOT = scratch('wf-resend-run-');
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

/** A repository with `workflows/deliver`, plan then implement. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  const dir = path.join(repo, 'workflows', 'deliver');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nafter: plan\n---\nimplement it\n');
  return repo;
};

/** One pass of the tick over the run `id`. */
const pass = (b: Board, id: string) => stage.runWith(b.e, advanceRun(runRecord(ROOT, id)));

/** The run `id` sent on, as the api's `resend` asks it, by the person. */
const resend = (b: Board, id: string, workflow?: string) =>
  stage.runWith(b.e, RESEND.handler({ runId: id, ...(workflow === undefined ? {} : { workflow }), actor: ACTOR }));

/** A run no card started, on `deliver`, gated at plan, its plan in flight: answers its id. */
const loose = async (b: Board, repo: string) => {
  const run = await stage.runPlaced(
    startRun({ brief: 'add a flag', repo, workflowDir: path.join(repo, 'workflows', 'deliver'), gates: ['plan'] }),
  );
  await pass(b, run.id);
  return run.id;
};

/** Refused as `tag`, exit 2. */
const refusedAs = (tag: string) => (err: Error & { _tag?: string; exitCode?: number }) => {
  assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
  return true;
};

describe('a run no card started, waiting on its person at a gate, is sent on as a card, and the run is cancelled', () => {
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
  s.test('a run still at work is refused Conflict, and nothing is filed', async () => {
    id = await loose(b, repo);
    await assert.rejects(resend(b, id, 'triage'), refusedAs('Conflict'));
    assert.deepEqual([...cardNames(ROOT)], []);
  });
  s.test('once it waits at its gate, it is filed as <run>-resent from its brief, queued on the workflow named, handed the run', async () => {
    b.settle(`${id}-plan`, 'succeeded', SIGNED);
    assert.deepEqual((await pass(b, id)).filed, [], 'held at its gate');
    const done = await resend(b, id, 'triage');
    assert.equal(done.card.name, `${id}-resent`);
    assert.equal(done.card.workflow, 'triage');
    assert.ok(done.card.queued !== undefined, 'queued');
    assert.deepEqual(done.card.from, [id]);
    assert.match(done.card.body ?? '', /add a flag/);
    assert.equal(done.cancelled, id);
    assert.deepEqual([...cardNames(ROOT)], [`${id}-resent`]);
  });
  s.test('the run is cancelled, by who sent it on', () => {
    const run = runRecord(ROOT, id);
    assert.ok(run.cancelledAt !== undefined, 'cancelled');
    assert.deepEqual(run.cancelledBy, ACTOR);
  });
  s.test('sent on again, it is refused Conflict: a run is sent on once', async () => {
    await assert.rejects(resend(b, id, 'deliver'), refusedAs('Conflict'));
  });
  s.test('a run that is not there is refused Missing, and a workflow that is a path Invalid', async () => {
    await assert.rejects(resend(b, 'no-such-run-k2q9'), refusedAs('Missing'));
    await assert.rejects(resend(b, id, 'a/b'), refusedAs('Invalid'));
  });
});

describe('a run a card started is refused Invalid, naming the card to send on instead', () => {
  let repo!: string;
  let b!: Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  s.test('nothing is filed, and the run stays as it was', async () => {
    plantCard(ROOT, 'parse-the-flag-k2q9', '---\nworkflow: deliver\n---\nParse the flag.\n');
    const id = (await stage.runPlaced(startFromInbox({ name: 'parse-the-flag-k2q9', callerRepo: repo }))).run.id;
    await pass(b, id);
    await assert.rejects(resend(b, id, 'triage'), refusedAs('Invalid'));
    assert.deepEqual([...cardNames(ROOT)], ['parse-the-flag-k2q9']);
    assert.equal(runRecord(ROOT, id).cancelledAt, undefined);
  });
});
