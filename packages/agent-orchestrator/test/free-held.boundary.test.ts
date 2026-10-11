/**
 * The daemon's retention of worktrees (`freeOnce`), over what git alone holds: a worktree a person locked, and a checkout on no branch,
 * are left by a sweep and said once, beside a worktree that holds a change. The test place models no lock and no checkout on no branch,
 * so this walk keeps the git place, on the runtime itself as free.test.ts walks the rest.
 *
 * `WF_KEEP_WORKTREES` is deleted at its head, so the rule is read at its shipped default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect, Logger, References } from 'effect';
import { Engine, type Sighting } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';
import { runGiven } from './placed.ts';
import type { PlaceRequests, PlaceVerb } from '../src/place/place.ts';

const ROOT = scratch('wf-free-held-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '50';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_KEEP_WORKTREES;
const { startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { tickRun, freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { shippedGitPlace } = await import('../src/place/shipped.store.ts');
const { freeOnce, freshFreeMemory } = await import('../src/prune/free.verb.ts');

type Pass = Awaited<ReturnType<typeof tick>>;
type Memory = ReturnType<typeof freshFreeMemory>;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one commit on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'readme\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** A workflow of one step, `work`. */
const WORK = fs.mkdtempSync(path.join(ROOT, 'wf-work-'));
fs.writeFileSync(path.join(WORK, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

const tasks = new Map<string, unknown[]>();
const starts = new Map<string, number>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    if (event.kind === 'starting') starts.set(`ae/${taskId}/${event.attempt}`, Date.parse(event.at));
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<AsyncJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

const sessions = new Map<string, Sighting>();
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = plainEngine(
  Engine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

/** Whether a session of the run `id` is at work. */
const atWork = (id: string): boolean => [...sessions].some(([name, s]) => name.startsWith(`ae/${id}-`) && s.state === 'working');

/** Each session of the run `id` at work signs off, `done` unless told `blocked`. */
const sign = (id: string, outcome: 'done' | 'blocked' = 'done') => {
  for (const [name, s] of sessions) {
    if (!name.startsWith(`ae/${id}-`) || s.state !== 'working') continue;
    const payload = { outcome, summary: 'did it', artifacts: [], needs: outcome === 'done' ? null : 'a person' };
    sessions.set(name, { ...s, state: 'completed', busy: false, closeout: { payload, at: starts.get(name)! + 1 } });
  }
};

/** What the place was asked, verb by verb, and through which door: `ask`, off the loop, or `askNow`, which holds the process. */
type Asked = Array<{ verb: PlaceVerb; request: PlaceRequests[PlaceVerb]; door: 'ask' | 'askNow' }>;

/** The shipped git place, every question noted in `asked`, with its door, before it is answered. */
const counting = (asked: Asked) =>
  PlaceService.layer({
    declared: shippedGitPlace.declared,
    ask: (verb, request, options) => {
      asked.push({ verb, request, door: 'ask' });
      return shippedGitPlace.ask(verb, request, options);
    },
    askNow: (verb, request, options) => {
      asked.push({ verb, request, door: 'askNow' });
      return shippedGitPlace.askNow(verb, request, options);
    },
  });

const tick = (memo?: ReturnType<typeof freshRestMemo>) =>
  runEngine(e, tickRun({ repo: ROOT, ...(memo ? { memo } : {}) }).pipe(Effect.provide(gitPlaceLayer)));

/** Passes until `ok` holds of one, a dozen at most. */
async function ticked(ok: (pass: Pass) => boolean, what: string): Promise<Pass> {
  for (let k = 0; k < 12; k++) {
    const pass = await tick();
    if (ok(pass)) return pass;
  }
  return assert.fail(`twelve passes, and never: ${what}`);
}

const answerOf = (pass: Pass, id: string) => pass.runs.find((a) => a.run.id === id);
const rests = (pass: Pass, id: string, status: string) => answerOf(pass, id)?.status === status && answerOf(pass, id)?.feed.atRest === true;

/**
 * One sweep over what `pass` answered of the runs `ids`, in that order, with what it logged and what it asked of the place: refused
 * here, for every test, when a question went through `askNow`.
 */
async function sweep(pass: Pass, ids: readonly string[], memory: Memory) {
  const asked: Asked = [];
  const logged: string[] = [];
  const keeper = Logger.make(({ message }) => void logged.push((Array.isArray(message) ? message : [message]).join(' ')));
  const answers = ids.flatMap((id) => answerOf(pass, id) ?? []);
  const done = await runEngine(
    e,
    freeOnce(answers, memory).pipe(
      Effect.provide(counting(asked)),
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Info'),
    ),
  );
  assert.deepEqual(
    asked.filter((a) => a.door === 'askNow').map((a) => a.verb),
    [],
    'a sweep asks its place nothing that holds the process: every question goes off the loop',
  );
  return { ...done, logged, asked, verbs: asked.map((a) => a.verb) };
}

const lane = (id: string, step = 'work') => readRun(id).steps[step].workspace!;
const whole = (id: string) => fs.existsSync(lane(id)) && !fs.existsSync(path.join(ROOT, 'runs', `${id}.pruned`));
const gone = (id: string) => !fs.existsSync(path.join(ROOT, 'worktrees', id));

/** A run of `folder` started on `repo`, its `work` at work in its worktree. */
async function started(folder: string, repo = aRepo()) {
  const run = await runPlaced(startRun({ brief: 'do it', repo, workflowDir: folder }));
  return { id: run.id, repo };
}

/** `work` does its work on its branch — a file of the run's own — and signs off; passes until its session is over. */
async function worked(id: string, outcome: 'done' | 'blocked' = 'done') {
  await ticked(() => atWork(id), `${id}'s work at work`);
  const at = lane(id);
  fs.writeFileSync(path.join(at, `${id}.txt`), 'work\n');
  git(at, 'add', '-A');
  git(at, 'commit', '-q', '-m', `work of ${id}`);
  sign(id, outcome);
  return ticked((pass) => !atWork(id) && answerOf(pass, id)?.status !== 'running', `${id} past its work`);
}

/** A one-step run that succeeded, its branch merged into main by hand: finished, with no ending. */
async function merged(repo = aRepo()) {
  const run = await started(WORK, repo);
  await worked(run.id);
  git(repo, 'merge', '-q', '--no-ff', '-m', `merge ${run.id}`, readRun(run.id).steps.work.branch!);
  return run;
}

test('REFUSED at shipped defaults: a landed run whose worktree holds a change, is locked, or is on no branch is left, and said once across seven sweeps; seen to, it is freed', async () => {
  const repo = aRepo();
  const [dirty, locked, detached] = [await merged(repo), await merged(repo), await merged(repo)];
  fs.writeFileSync(path.join(lane(dirty.id), 'left.txt'), 'not committed\n');
  git(repo, 'worktree', 'lock', lane(locked.id));
  git(lane(detached.id), 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(lane(detached.id), 'more.txt'), 'on no branch\n');
  git(lane(detached.id), 'add', '-A');
  git(lane(detached.id), 'commit', '-q', '-m', 'on no branch');
  const ids = [dirty.id, locked.id, detached.id];
  const memory = freshFreeMemory();
  const logged: string[] = [];
  for (let k = 0; k < 7; k++) {
    const done = await sweep(await tick(), ids, memory);
    assert.deepEqual(done.freed, []);
    logged.push(...done.logged);
  }
  assert.deepEqual(ids.map(whole), [true, true, true]);
  assert.equal(logged.length, 3, `each said once, though each was judged three times: ${logged.join('\n')}`);
  assert.match(logged.find((l) => l.startsWith(`${dirty.id}  not freed: `)) ?? '', /holds changes no commit has \(left\.txt\)/);
  assert.match(logged.find((l) => l.startsWith(`${locked.id}  not freed: `)) ?? '', /is locked, and git will not remove it/);
  assert.match(logged.find((l) => l.startsWith(`${detached.id}  not freed: `)) ?? '', /is on no branch — its HEAD is detached/);

  fs.rmSync(path.join(lane(dirty.id), 'left.txt'));
  git(repo, 'worktree', 'unlock', lane(locked.id));
  const freed: string[] = [];
  for (let k = 0; k < 3; k++) freed.push(...(await sweep(await tick(), ids, memory)).freed.map((p) => p.id));
  assert.deepEqual(new Set(freed), new Set([dirty.id, locked.id]), 'the same memory, and the two a person saw to are freed');
  assert.deepEqual([gone(dirty.id), gone(locked.id), whole(detached.id)], [true, true, true]);
});
