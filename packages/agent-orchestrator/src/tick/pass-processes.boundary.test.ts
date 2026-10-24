/**
 * The git processes a pass's place starts, counted by the meter on git for real (`place.spawned`): as many on a store of finished runs as
 * on none, and one more a repository whose runs' tips are read; and two factories on two repositories asking the one place the pass is
 * given, each process it starts counted once. The test place starts no process, so an equality on what it started would hold of
 * nothing: these keep the git place. The questions a pass asks (`place.calls`), on two hundred runs, are counted in rest-store.test.ts.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal and a harness the test signs by hand. `WF_ROOT` is read as
 * the module loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nameFor, Engine, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from '../../test/promised.ts';
import type { Run } from '../run.ts';
import type { PassCost } from '../meter/meter.ts';
import { scratch } from '../../test/scratch.ts';
import { Effect } from 'effect';
import { plainEngine } from '../../test/promised.ts';
import { runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-pass-processes-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10000';
delete process.env.WF_MAX_RUNS;
const { startRun } = await import('../runner.ts');
const { listRuns } = await import('../record/record.store.ts');
const { tickRun, freshRestMemo } = await import('./tick.verb.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const { gitPlaceLayer, builtinGitPlace } = await import('../place/builtin.store.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { PlaceService } = await import('../place/place.store.ts');
const { addFactory, attachWorkflow, hireAgent } = await import('../factory/factory.store.ts');
type Place = import('../place/place.store.ts').Place;

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/**
 * A workflow folder of the steps given, each `after` the one before it, on codex: a job that is not held open, so it settles as it signs.
 */
const folder = (...steps: string[]) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  steps.forEach((name, k) =>
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\nplace: git\nharness: codex\n${k ? `after: ${steps[k - 1]}\n` : ''}---\n${name} it\n`,
    ),
  );
  return dir;
};

/**
 * The engine's store, in memory, as its own tests keep one, noting in `starts` when each attempt began, by its session's name; `journal` is
 * kept so a test can append to a task as the runtime would.
 */
const memoryJournal = (starts: Map<string, number>): AsyncJournal => {
  const tasks = new Map<string, Parameters<AsyncJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
      if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };

/**
 * The runtime, with a harness whose sessions work until `signAll` ends them. The harness reports its own words (`done`, `stopped`), as a
 * runner written in Promises may still report them: the runtime reads them as A2A's. `signAll` signs every session at work but those of
 * the runs `keep` names, which stay in flight, with `closeout`, or `SIGNED` where it names none, stamped a millisecond after the journal
 * says its attempt began.
 */
const engine = () => {
  const sessions = new Map<string, Sighting>();
  let n = 0;
  const runner: AsyncRunner = {
    async spawn(r) {
      n++;
      sessions.set(r.name, { sessionId: `s-${n}`, nativeId: `native-${n}`, state: 'working', busy: true });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop(id) {
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
    },
    async logs() {
      return '';
    },
  };
  const starts = new Map<string, number>();
  const journal = memoryJournal(starts);
  const e = plainEngine(
    Engine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: asyncStore(journal),
      harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
      defaultHarness: 'claude',
    }),
  );
  const signAll = (keep: readonly Run[] = [], closeout: (name: string) => object | undefined = () => undefined) => {
    for (const [name, s] of sessions) {
      if (s.state !== 'working' || keep.some((r) => name.startsWith(`ae/${r.id}-`))) continue;
      sessions.set(name, {
        ...s,
        state: 'completed',
        busy: false,
        closeout: { payload: closeout(name) ?? SIGNED, at: starts.get(name)! + 1 },
      });
    }
  };
  return { e, journal, signAll };
};

const h = engine();
const REPO = aRepo();
const ONE = folder('work');
const TWO = folder('plan', 'work');
const inFlight: Run[] = [];

/** The memo every pass here keeps, as the daemon keeps its engine's: handed in, so a test can read what it holds. */
const MEMO = freshRestMemo();
/** A pass that judges every run the memo answers again in full, and throws where the two differ. */
const verified = () => runWith(h.e, tickRun({ repo: ROOT, memo: MEMO, verifyRest: true }));
/** A pass as the daemon makes it: the memo trusted. */
const measured = async (memo = MEMO): Promise<PassCost> => (await runWith(h.e, tickRun({ repo: ROOT, memo, verifyRest: false }))).cost!;

/**
 * Passes until every run but those in flight has finished and the memo answers it: filed, admitted, started, signed, settled, at rest. A
 * session whose name holds one of `blocking` signs blocked.
 */
const finish = async (blocking: readonly string[] = []): Promise<PassCost> => {
  for (let k = 0; k < 12; k++) {
    await verified();
    h.signAll(inFlight, (name) => (blocking.some((id) => name.startsWith(`ae/${id}-`)) ? BLOCKED : undefined));
    const pass = await measured();
    const finished = listRuns().filter((r) => !inFlight.some((f) => f.id === r.id)).length;
    if (pass.rested === finished) return pass;
  }
  assert.fail('the store did not come to rest in twelve passes');
};

/** One pass, measured once the memo is steady: the pass that follows is the one compared. */
const steady = async (): Promise<PassCost> => {
  await finish();
  return measured();
};

const started = async (n: number, workflowDir = ONE, repo = REPO, isolate = false) => {
  const runs: Run[] = [];
  for (let k = 0; k < n; k++) runs.push(await runPlaced(startRun({ brief: `run ${k}`, repo, workflowDir, isolate })));
  return runs;
};

/** The git processes a pass's place started: what `place.spawned` counts, each question itself a call and no process. */
const places = (c: PassCost) => c.phases.place.spawned;

/** The store at each size, and the pass each was measured at: built once, read by the tests that follow. */
const sizes: Array<{ finished: number; cost: PassCost; fresh?: PassCost }> = [];
const ISOLATED_REPOS = [aRepo(), aRepo()];

test("a pass starts as many git processes on 10 and on 20 finished runs as on none, and one more a repository whose runs' tips are read", async () => {
  inFlight.push(...(await started(3)));
  sizes.push({ finished: 0, cost: await steady() });

  await started(3, TWO, ISOLATED_REPOS[0], true);
  await started(3, TWO, ISOLATED_REPOS[1], true);
  await started(4);
  sizes.push({ finished: 10, cost: await steady() });
  await started(10);
  sizes.push({ finished: 20, cost: await steady() });

  const [none, ten, twenty] = sizes.map((s) => s.cost) as [PassCost, PassCost, PassCost];
  for (const [at, c] of [
    [10, ten],
    [20, twenty],
  ] as const) {
    assert.equal(c.rested, at, `every finished run of ${at} answered from memory`);
    assert.equal(
      places(c),
      places(none) + ISOLATED_REPOS.length,
      `${at} finished runs: one for-each-ref a repository whose runs' tips are read (three runs on each of two), and no more`,
    );
    assert.equal(c.spawned, none.spawned + ISOLATED_REPOS.length, `${at} finished runs: no process more than those`);
  }
  assert.equal(none.rested, 0);
});

/** The ids of the runs a test has taken with `aResting`, each taken once. */
const touched = new Set<string>();

test('two factories on two repositories ask one place, the instance the pass is given: each question of it a call of the place phase, each git process it starts counted once', async () => {
  const [left, right] = [aRepo(), aRepo()];
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  const dir = path.join(team, 'hired');
  fs.mkdirSync(path.join(team, 'agents'));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(team, 'agents', 'worker.md'), '---\nname: worker\n---\nDo the work.\n');
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\nharness: codex\n---\nWork it.\n');
  for (const [name, repo] of [
    ['left', left],
    ['right', right],
  ] as const) {
    addFactory({ name, repos: [repo] });
    attachWorkflow({ factory: name, workflow: 'hired' });
    hireAgent({ factory: name, agent: 'worker', step: 'hired/work' });
  }
  for (const [factory, repo] of [
    ['left', left],
    ['right', right],
  ] as const)
    touched.add((await runPlaced(startRun({ brief: `in ${factory}`, repo, workflowDir: dir, isolate: true, factory }))).id);
  const asked: Array<{ verb: string; repo?: string }> = [];
  const noted = (verb: string, request: object): void => {
    asked.push({ verb, ...('repo' in request && typeof request.repo === 'string' ? { repo: path.resolve(request.repo) } : {}) });
  };
  const one: Place = {
    declared: builtinGitPlace.declared,
    ask: (verb, request, options) => {
      noted(verb, request);
      return builtinGitPlace.ask(verb, request, options);
    },
    askNow: (verb, request, options) => {
      noted(verb, request);
      return builtinGitPlace.askNow(verb, request, options);
    },
  };
  const pass = await runWith(
    h.e,
    tickRun({ repo: ROOT, memo: freshRestMemo(), verifyRest: false }).pipe(Effect.provide(PlaceService.layer(one))),
  );
  const of = (verb: string, repo: string) => asked.filter((a) => a.verb === verb && a.repo === path.resolve(repo)).length;
  assert.deepEqual(
    [of('standing', left), of('standing', right), of('make', left), of('make', right)],
    [1, 1, 1, 1],
    'the one instance was asked where each repository stands, and for the worktree of each run, whatever its factory',
  );
  const { calls, spawned } = pass.cost!.phases.place;
  assert.equal(calls, asked.length, 'each question asked of the instance is one call of the place phase, and nothing else is');
  assert.ok(
    spawned >= of('standing', left) + of('standing', right) + 2,
    `what is counted as started is git, a process or more a question: ${spawned}`,
  );
});
