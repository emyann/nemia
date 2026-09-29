/**
 * `main`, the verbs' table: the help for a verb it does not know and for one given too little, and the lines of the verbs no other test
 * reads — `wf cancel`, `wf show`, `wf logs` and `wf accept` — over a store and a repository of their own, with git for real.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { TaskPhase } from '../run.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-main-');
process.env.WF_ROOT = ROOT;
const { advance, readRun, start } = await import('../runner.ts');
const { main } = await import('./main.ts');

type Engine = NonNullable<Parameters<typeof main>[1]>;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return dir;
};

/** A loop: `implement`, then `review`, which may send it back once. */
const looping = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\noutput: review.schema.json\nloop: implement\nrounds: 1\n---\nreview it\n',
  );
  fs.writeFileSync(
    path.join(dir, 'review.schema.json'),
    JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
  );
  return dir;
};

/** Just enough engine: each task's phase, its closeout on its one attempt once it has one, and its logs. */
const board = () => {
  const tasks = new Map<string, { phase: TaskPhase; closeout?: unknown }>();
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '',
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null }],
        },
      };
    },
    file: async (spec: { id: string }) => {
      tasks.set(spec.id, { phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    logs: async (id: string) => `the output of ${id}`,
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** `wf <verb>`, through the CLI, as a person types it: each line it printed on stdout, and on stderr. */
const typed = async (t: TestContext, e: Engine, ...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
  const error = t.mock.method(console, 'error', (...a: unknown[]) => err.push(a.join(' ')));
  try {
    await main(argv, e);
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { out, err };
};

test('the help, once and alone, for no verb, a verb it does not know, and a name every object has', async (t) => {
  const { e } = board();
  const help = (await typed(t, e)).out;
  assert.equal(help.length, 1);
  assert.match(help[0], /^wf — run a workflow of agent steps\n/);
  for (const verb of ['nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])
    assert.deepEqual(await typed(t, e, verb), { out: help, err: [] }, `wf ${verb}`);
});

test('the help, once and alone, for a verb given too little to act on', async (t) => {
  const { e } = board();
  const help = (await typed(t, e)).out;
  for (const argv of [
    ['start'],
    ['start', '--repo'],
    ['plan'],
    ['plan', '--repo'],
    ['cancel'],
    ['rm'],
    ['decide'],
    ['retry', 'r-1'],
    ['retry', 'r-1', '--fresh'],
    ['approve', 'r-1'],
    ['round'],
    ['round', '--budget'],
    ['accept'],
    ['say', 'r-1'],
    ['show'],
    ['logs', 'r-1'],
    ['agents', 'card'],
    ['agents', 'card', '--repo'],
    ['agents', 'nope'],
  ])
    assert.deepEqual(await typed(t, e, ...argv), { out: help, err: [] }, `wf ${argv.join(' ')}`);
});

test('wf cancel: a run with a step in flight, the same run again, and a run already finished', async (t) => {
  const b = board();
  const repo = aRepo();
  const run = start({ brief: 'still going', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(run.id));
  assert.deepEqual(await typed(t, b.e, 'cancel', run.id), {
    out: [`${run.id}  cancelled`, `   asked to stop: implement  (the engine stops it on its next tick)`],
    err: [],
  });
  const at = readRun(run.id).cancelledAt;
  assert.deepEqual(await typed(t, b.e, 'cancel', run.id), {
    out: [`${run.id}  already cancelled at ${at}`, `   asked to stop: implement  (the engine stops it on its next tick)`],
    err: [],
  });

  const done = start({ brief: 'done', repo, workflowDir: oneStep() });
  await advance(b.e, readRun(done.id));
  b.settle(`${done.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(done.id));
  assert.deepEqual(await typed(t, b.e, 'cancel', done.id), { out: [`${done.id}  already succeeded — nothing to stop`], err: [] });
});

test('wf cancel of a run with nothing filed yet says so, a line more', async (t) => {
  const b = board();
  const run = start({ brief: 'not filed', repo: aRepo(), workflowDir: oneStep() });
  assert.deepEqual(await typed(t, b.e, 'cancel', run.id), {
    out: [`${run.id}  cancelled`, `   nothing was in flight — no further steps will be filed`],
    err: [],
  });
});

test('wf show prints the record as JSON, the brief and each step body cut short', async (t) => {
  const b = board();
  const brief = `${'a long brief, '.repeat(12)}and more`;
  const run = start({ brief, repo: aRepo(), workflowDir: oneStep() });
  const { out, err } = await typed(t, b.e, 'show', run.id);
  assert.deepEqual(err, []);
  assert.equal(out.length, 1);
  const record = readRun(run.id);
  const workflow = record.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  assert.equal(out[0], JSON.stringify({ ...record, brief: `${brief.slice(0, 120)}…`, workflow }, null, 2));
  assert.equal((JSON.parse(out[0]) as { workflow: { body: string }[] }).workflow[0].body, 'implement it…');
});

test('wf logs: a step that has not run, and the output of one that has, from the engine', async (t) => {
  const b = board();
  const run = start({ brief: 'go', repo: aRepo(), workflowDir: oneStep() });
  assert.deepEqual(await typed(t, b.e, 'logs', run.id, 'implement'), { out: ['implement has not run yet'], err: [] });
  await advance(b.e, readRun(run.id));
  assert.deepEqual(await typed(t, b.e, 'logs', run.id, 'implement'), { out: [`the output of ${run.id}-implement`], err: [] });
});

test('wf accept of a loop out of rounds: what it accepted, and the file it wrote', async (t) => {
  const b = board();
  const loop = start({ brief: 'a loop', repo: aRepo(), workflowDir: looping() });
  await advance(b.e, readRun(loop.id));
  b.settle(`${loop.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(loop.id));
  b.settle(`${loop.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await advance(b.e, readRun(loop.id));
  b.settle(readRun(loop.id).steps.implement.taskId!, 'succeeded', SIGNED);
  await advance(b.e, readRun(loop.id));
  b.settle(readRun(loop.id).steps.review.taskId!, 'succeeded', { ...SIGNED, again: true });
  await advance(b.e, readRun(loop.id));
  const { out, err } = await typed(t, b.e, 'accept', loop.id, '--message', 'as it stands');
  assert.deepEqual(err, []);
  assert.equal(out.length, 2, out.join('\n'));
  assert.match(
    out[0],
    new RegExp(`^${loop.id}  accepted: try 1 of review as it stands, its findings open — nothing waits on it: its run can be decided$`),
  );
  assert.match(out[1], /^ {3}\/.+/);
  assert.ok(fs.existsSync(out[1].trim()), out[1]);
});
