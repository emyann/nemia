/**
 * `main`, the in-process CLI of the verbs about this machine: the help for a verb it does not know and for a store verb, whose words the
 * client holds; the alias's hint. And what the handlers of the store verbs no other test reads answer, reached through `test/typed.ts`
 * as the api calls them — `nemia cancel`, `nemia show`, `nemia logs` and `nemia approve` of a loop — over a store and a repository of
 * their own, on the test place; the lines a person reads of them are the client's (`apps/cli/test/runs-lines.test.ts`).
 *
 * The root test below types `factory servers default`: a `factory servers` read is the factory's own existence (`factoryThere`) and its
 * record, both through the Factory door at the root the handler is given as it is typed (`StoreRoot`, `storeConfigLayer` of the
 * process's environment), which is what that test pins. `default` has a record and no file, so the test plants only the record.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskPhase } from '../run.ts';
import { scratch } from 'test-kit/scratch';
import { promised } from '../../test/promised.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { advanceRun, CLI, TABLE, startRun, runWith as runEngine } from '../runner.ts';
import { runRecord, writeRun } from '../record/record.store.ts';
import { aliased, main, VERBS } from './main.ts';
import { HELP, WF_HINT } from './flags.ts';
import { SHOW } from '../object/commands.verb.ts';
import { handled, typed as handlerOf } from '../../test/typed.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-main-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);

type Engine = NonNullable<Parameters<typeof main>[1]>;

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  stand().world.repository(repo, { 'README.md': 'readme\n' });
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** A loop: `implement`, then `review`, which may send it back once. */
const looping = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 1\n---\nreview it\n',
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
  const e = promised({
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
    mcpState: async () => ({ read: false as const, why: 'no harness is run in this test, so no state is read' }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => tasks.set(id, { phase, closeout });
  return { e, settle };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * `nemia <verb>`, through the CLI over `env` (unset: the process's own, as `main` defaults it), as a person types it: each line it
 * printed on stdout, and on stderr.
 */
const typedIn =
  (env: Env | undefined) =>
  async (t: TestContext, e: Engine, ...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const log = t.mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
    const error = t.mock.method(console, 'error', (...a: unknown[]) => err.push(a.join(' ')));
    try {
      await main(argv, e, undefined, stand().place, env);
    } finally {
      log.mock.restore();
      error.mock.restore();
    }
    return { out, err };
  };
/** `typedIn` this file's store, `ENV`. */
const typed = typedIn(ENV);

test('wf, the alias, writes its one hint line on stderr before the help, and nothing of it on stdout', async (t: TestContext) => {
  const out: string[] = [];
  const err: string[] = [];
  t.mock.method(process.stderr, 'write', (chunk: string) => err.push(chunk) > 0);
  t.mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
  await aliased([]);
  assert.deepEqual(err, [`${WF_HINT}\n`]);
  assert.deepEqual(out, [HELP]);
  assert.match(WF_HINT, new RegExp(`\\b${CLI} <args>`), 'the hint names what to type next');
});

/** What the handler of the store verb `argv` names answers, over `e` and this file's store. */
const answered = (e: Engine, ...argv: string[]) => handlerOf(argv, e, undefined, stand().place, ENV);

test('nemia auto, a renamed group, is read as nemia policy, answering what the new name answers', async () => {
  const { e } = board();
  assert.deepEqual(await answered(e, 'auto', 'nemia'), await answered(e, 'policy', 'nemia'));
});

test('a read is run against the root the process names when it is typed, not one a module pinned as it loaded', async () => {
  const { e } = board();
  const other = scratch('wf-main-other-');
  const file = path.join(other, 'factories', 'default', 'servers.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ servers: { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } } })}\n`);
  const was = process.env.WF_ROOT;
  const read = async () => JSON.stringify(await handlerOf(['factory', 'servers', 'default'], e, undefined, stand().place));
  try {
    process.env.WF_ROOT = other;
    assert.ok(
      (await read()).includes('https://api.githubcopilot.com/mcp/'),
      "the record under the root the process names is the one read, by servers.store.ts's required home",
    );
    process.env.WF_ROOT = was;
    assert.ok(!(await read()).includes('githubcopilot'), "and this root records none, so the read follows the root rather than a module's");
  } finally {
    process.env.WF_ROOT = was;
  }
});

test('a handler reads the environment it is handed, not the process’s: `logs` reads the run planted under the WF_ROOT it is given', async () => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'planted elsewhere', repo: aRepo(), workflowDir: oneStep() }));
  const given = scratch('wf-main-given-');
  const planted = { ...runRecord(ROOT, run.id), id: `${run.id}-given` };
  writeRun(given, planted);
  const elsewhere = scratch('wf-main-process-');
  const was = process.env.WF_ROOT;
  try {
    process.env.WF_ROOT = elsewhere;
    assert.deepEqual(
      await handlerOf(['logs', planted.id, 'implement'], b.e, undefined, stand().place, { WF_ROOT: given }),
      {},
      'the run under the root it was handed is read: its step has not run',
    );
    await assert.rejects(handlerOf(['logs', run.id, 'implement'], b.e, undefined, stand().place, { WF_ROOT: given }));
  } finally {
    process.env.WF_ROOT = was;
  }
});

test('the verbs the help names are the verbs main runs, and no other', () => {
  const lines = [...HELP.matchAll(new RegExp(`^ {2}${CLI} (.+)$`, 'gm'))].map((m) => m[1]);
  const served = TABLE.filter((c) => c.only?.side !== 'api').map((c) => c.name);
  const names = [...VERBS.keys(), ...served];
  const first = (words: string) => words.split(' ')[0];
  assert.deepEqual([...new Set(lines.map(first))].sort(), [...new Set(names.map(first))].sort());
  assert.deepEqual(
    names.filter((name) => !lines.some((line) => line === name || line.startsWith(`${name} `))),
    [],
    'each name of two words opens a line of the help',
  );
});

test('the help, once and alone, for no verb, a verb it does not know, and a name every object has', async (t) => {
  const { e } = board();
  const help = (await typed(t, e)).out;
  assert.equal(help.length, 1);
  assert.match(help[0], /^nemia — run a workflow of agent steps\n/);
  for (const verb of ['nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])
    assert.deepEqual(await typed(t, e, verb), { out: help, err: [] }, `nemia ${verb}`);
});

test('the help, once and alone, for a store verb, whose words the client holds, typed whole, given too little, or by a former name', async (t) => {
  const { e } = board();
  const help = (await typed(t, e)).out;
  for (const argv of [
    ['start', 'a brief', '--workflows', 'w'],
    ['start'],
    ['cancel', 'r-1'],
    ['retry', '--round'],
    ['round'],
    ['accept'],
    ['show', 'r-1'],
    ['agents', 'card'],
  ])
    assert.deepEqual(await typed(t, e, ...argv), { out: help, err: [] }, `nemia ${argv.join(' ')}`);
});

test('nemia cancel: a run with a step in flight, the same run again, and a run already finished', async () => {
  const b = board();
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'still going', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
  const stopped = (plan: unknown) => (plan as { stop: { name: string }[] }).stop.map((f) => f.name);
  const first = (await answered(b.e, 'cancel', run.id)) as { id: string; plan: { kind: string } };
  assert.deepEqual([first.id, first.plan.kind, stopped(first.plan)], [run.id, 'cancel', ['implement']]);
  const at = runRecord(ROOT, run.id).cancelledAt;
  const again = (await answered(b.e, 'cancel', run.id)) as { plan: { kind: string; at?: string } };
  assert.deepEqual([again.plan.kind, again.plan.at, stopped(again.plan)], ['already-cancelled', at, ['implement']]);

  const done = await runPlaced(startRun({ brief: 'done', repo, workflowDir: oneStep() }));
  await runWith(b.e, advanceRun(runRecord(ROOT, done.id)));
  b.settle(`${done.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(runRecord(ROOT, done.id)));
  assert.deepEqual(await answered(b.e, 'cancel', done.id), { id: done.id, plan: { kind: 'finished', status: 'succeeded' } });
});

test('nemia cancel of a run with nothing filed yet stops nothing', async () => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'not filed', repo: aRepo(), workflowDir: oneStep() }));
  assert.deepEqual(await answered(b.e, 'cancel', run.id), { id: run.id, plan: { kind: 'cancel', stop: [] } });
});

test('nemia show --raw answers the record, the brief and each step body cut short', async () => {
  const b = board();
  const brief = `${'a long brief, '.repeat(12)}and more`;
  const run = await runPlaced(startRun({ brief, repo: aRepo(), workflowDir: oneStep() }));
  const raw = await handled(SHOW, { runId: run.id, raw: true }, { e: b.e, place: stand().place, env: ENV });
  const record = runRecord(ROOT, run.id);
  const workflow = record.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  assert.deepEqual(raw, { ...record, brief: `${brief.slice(0, 120)}…`, workflow });
  assert.equal((raw as { workflow: { body: string }[] }).workflow[0].body, 'implement it…');
});

test('nemia logs: a step that has not run, and the output of one that has, from the engine', async () => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'go', repo: aRepo(), workflowDir: oneStep() }));
  assert.deepEqual(await answered(b.e, 'logs', run.id, 'implement'), {});
  await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
  assert.deepEqual(await answered(b.e, 'logs', run.id, 'implement'), {
    taskId: `${run.id}-implement`,
    output: `the output of ${run.id}-implement`,
  });
  assert.deepEqual(await answered(b.e, 'logs', run.id, 'deploy'), {}, 'a step the run lacks has not run');
});

test("REFUSED at shipped defaults, by a store verb's own words: a word or a flag where a verb takes none, Invalid with exit 2, and nothing done", async (t) => {
  const b = board();
  const run = await runPlaced(startRun({ brief: 'not cancelled', repo: aRepo(), workflowDir: oneStep() }));
  const rows: Array<[string, string[], string[]]> = [
    ["cancel, a word after the run's id", ['cancel', run.id, 'extra'], ['nemia cancel', "one run's id", 'not extra.']],
    ["cancel, a flag after the run's id", ['cancel', run.id, '--now'], ['nemia cancel', "one run's id", 'not --now.']],
    ['logs, a flag where the run stands', ['logs', '--x', 'implement'], ['nemia logs', "one run's id and one step's name", 'not --x.']],
    ['logs, a flag where the step stands', ['logs', 'r-1', '--x'], ['nemia logs', "one run's id and one step's name", 'not --x.']],
    ["cancel, a flag before the run's id", ['cancel', '--now', run.id], ['nemia cancel', "one run's id", 'not --now.']],
  ];
  for (const [row, argv, said] of rows)
    await t.test(row, () =>
      assert.rejects(answered(b.e, ...argv), (err: Error & { _tag?: string; exitCode?: number }) => {
        assert.equal(err._tag, 'Invalid');
        assert.equal(err.exitCode, 2);
        for (const fix of said) assert.ok(err.message.includes(fix), `${err.message} names ${fix}`);
        return true;
      }),
    );
  await t.test('nothing cancelled', () => assert.equal(runRecord(ROOT, run.id).cancelledAt, undefined));
});

test('nemia approve of a loop out of rounds: what it accepted, and the file it wrote', async () => {
  const b = board();
  const loop = await runPlaced(startRun({ brief: 'a loop', repo: aRepo(), workflowDir: looping() }));
  await runWith(b.e, advanceRun(runRecord(ROOT, loop.id)));
  b.settle(`${loop.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(runRecord(ROOT, loop.id)));
  b.settle(`${loop.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(runRecord(ROOT, loop.id)));
  b.settle(runRecord(ROOT, loop.id).steps.implement.taskId!, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(runRecord(ROOT, loop.id)));
  b.settle(runRecord(ROOT, loop.id).steps.review.taskId!, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(runRecord(ROOT, loop.id)));
  const approved = (await answered(b.e, 'approve', loop.id, '--message', 'as it stands')) as {
    step: string;
    try: number;
    message: string | null;
    loop: boolean;
    file: string;
  };
  assert.deepEqual([approved.step, approved.try, approved.message, approved.loop], ['review', 1, 'as it stands', true]);
  assert.ok(fs.existsSync(approved.file), approved.file);
});
