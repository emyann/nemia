/**
 * The machine's needs, read: each declared check run as a shell command (`checkRan`), under a time limit, with the tools folder first on
 * its PATH, and what it said kept in this process's memory of the readings (`NeedsMemory`), which the pass hands `assess` for each run
 * (`runNeeds`, read by `readRun`) and the readiness read lists. The sweep (`needsOnce`) runs beside the passes, as the disk's does
 * (`needs`, run by `sweepLoop`): every check of the places Nemia ships, of every factory's workflows, and of every run that has filed
 * nothing and asked since the last sweep. Level-triggered: each sweep reads every check again, and a reading is never a transition.
 * A controller: it reads the store's factories and folders and runs the checks.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Context, Effect, Layer, type Duration } from 'effect';
import type { Need, NeedState } from 'objects';
import { pathLedByTools, StoreRoot, toolsDir } from '../config/root.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { workflowNeedsRead } from '../folder/folder.store.ts';
import { carriedDirOf, carriedFilesDir, workflowFilesDir } from '../frozen/frozen.store.ts';
import { hasStarted } from '../wait/wait.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { fixCommandOf, needsOfRun, needStateOf, type NeedHeld, type NeedRan } from './needs.ts';

/** How long one check may run before it is stopped and read `unknown`: a check answers at once, or says nothing. */
export const NEEDS_CHECK_MS = 10_000;

/** The sweep's pace: a need met by hand is read on the next sweep, and a fix settled is read at once (`fix.verb.ts`). */
export const NEEDS_EVERY: Duration.Input = '1 minute';

/** How many checks a sweep runs at once. */
const AT_ONCE = 4;

/**
 * Where a check runs: its command, and the folders a workflow's check is told as a step's is — its workflow's (`WF_WORKFLOW_FILES`) and
 * its carried files' (`WF_CARRIED_FILES`) — none for a place's.
 */
export type CheckAt = { readonly check: string; readonly workflowFiles?: string; readonly carriedFiles?: string };

/** The key a reading is kept under: the check and the folders it runs with, so one check of two factories is read twice. */
export const checkKey = (at: CheckAt): string => [at.carriedFiles ?? '', at.workflowFiles ?? '', at.check].join('\n');

/**
 * One process's memory of its needs' readings, kept to be read and never to decide: the store it reads for (`home`), each check's last
 * reading by its key (`readings`), the checks a read asked for since the last sweep (`asked`), which the next sweep reads again, the
 * needs of the places Nemia ships as the daemon's place declared them (`placeNeeds`), the count of readings changed (`version`, what the
 * informer checks a run that has filed nothing against), and how long a check may run (`checkMs`). Lost at a restart, and read afresh.
 */
export type NeedsMemo = {
  readonly home: string;
  readonly readings: Map<string, NeedState>;
  readonly asked: Map<string, CheckAt>;
  placeNeeds: readonly Need[];
  version: number;
  readonly checkMs: number;
};

/** A memory that has read nothing yet, of the store at `home`, its checks limited to `checkMs` (`NEEDS_CHECK_MS`). */
export const needsMemo = (home: string, checkMs: number = NEEDS_CHECK_MS): NeedsMemo => ({
  home,
  readings: new Map(),
  asked: new Map(),
  placeNeeds: [],
  version: 0,
  checkMs,
});

/**
 * This process's memory of its needs' readings, a `Context.Reference` whose default is none: a daemon gives one (`up`, or the api's
 * `needsMemoryLayer`), which its sweep fills and its passes and requests read; a program given none holds no run on a need.
 */
export const NeedsMemory = Context.Reference<NeedsMemo | undefined>('agent-orchestrator/NeedsMemory', { defaultValue: () => undefined });

/** One memory for a process, of the store at `home`: the api gives one per app, read by the daemon's sweep and every request alike. */
export const needsMemoryLayer = (home: string): Layer.Layer<never> => Layer.sync(NeedsMemory, () => needsMemo(home));

/**
 * The environment a check or a fix runs in, over `base`: PATH led by the tools folder's `bin/` (`pathLedByTools`), `NEMIA_TOOLS` the
 * tools folder of the store at `home`, and a workflow's folders as a step is told them, where `at` names them.
 */
export const needsEnv = (home: string, base: Readonly<Record<string, string | undefined>>, at: Omit<CheckAt, 'check'> = {}) => ({
  ...base,
  PATH: pathLedByTools(home, base.PATH),
  NEMIA_TOOLS: toolsDir(home),
  ...(at.workflowFiles === undefined ? {} : { WF_WORKFLOW_FILES: at.workflowFiles }),
  ...(at.carriedFiles === undefined ? {} : { WF_CARRIED_FILES: at.carriedFiles }),
});

/** How a check is run: the shell it is handed to (`sh` unless a test names another) and how long it may run, in milliseconds. */
export type CheckOptions = { readonly shell?: string; readonly ms: number };

/**
 * How the check `at` ran, in the store `home`: `shell -c <check>` in the store's folder, with `needsEnv`'s environment, its output
 * dropped. Ended with its exit (`exited`, one killed by a signal read as exit 128: missing); stopped with its whole process group at
 * `ms` (`timed-out`); or a shell that did not start (`unstartable`). Never fails.
 */
export const checkRan = (home: string, at: CheckAt, { shell = 'sh', ms }: CheckOptions): Effect.Effect<NeedRan> =>
  Effect.callback<NeedRan>((resume) => {
    let settled = false;
    const done = (ran: NeedRan) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resume(Effect.succeed(ran));
    };
    const child = spawn(shell, ['-c', at.check], {
      cwd: home,
      env: needsEnv(home, process.env, at),
      stdio: 'ignore',
      detached: true,
    });
    const stop = () => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      stop();
      done({ kind: 'timed-out' });
    }, ms);
    child.on('error', () => done({ kind: 'unstartable' }));
    child.on('exit', (code) => done(code === null ? { kind: 'exited', code: 128 } : { kind: 'exited', code }));
    return Effect.sync(() => {
      if (!settled) stop();
      clearTimeout(timer);
    });
  });

/** The checks of the places Nemia ships, as the memory holds them: each run with no workflow's folders. */
const placeChecks = (memo: NeedsMemo): CheckAt[] => memo.placeNeeds.map((need) => ({ check: need.check }));

/** A factory's workflow: its factory, its folder's name, and the folder its live files are in. */
export type FactoryWorkflow = { readonly factory: string; readonly workflow: string; readonly dir: string };

/**
 * The workflows of `factories` as their files are now, each with its folder: under the factory's tree where it was made from a template,
 * else under its first repository's `workflows/`. A factory that does not read has none.
 */
export const factoryWorkflows = (factories: readonly FactoryListing[]): FactoryWorkflow[] =>
  factories.flatMap((f) => {
    if ('error' in f) return [];
    const root = f.tree ?? f.repos[0];
    if (root === undefined) return [];
    return f.workflows.map((workflow) => ({ factory: f.name, workflow, dir: path.join(root, 'workflows', workflow) }));
  });

/** The checks of a factory's workflow, each with its live folders: what the readiness read lists and the sweep reads. */
export const workflowChecks = (w: FactoryWorkflow, needs: readonly Need[]): CheckAt[] =>
  needs.map((need) => ({ check: need.check, workflowFiles: w.dir, carriedFiles: carriedDirOf(w.dir) }));

/**
 * One sweep over the needs of the store `memo` reads for: every check of the places Nemia ships, of every factory's workflows as their
 * files are now, and of each run that asked since the last sweep (`asked`), each run once at most `AT_ONCE` at a time under the memory's
 * limit, its reading kept and each that changed counted (`version`). A key no longer asked for is forgotten. Answers the readings by key.
 */
export const needsOnce = Effect.fn('needsOnce')(function* (memo: NeedsMemo, options: { shell?: string } = {}) {
  const home = memo.home;
  const workflows = factoryWorkflows(yield* Effect.sync(() => listedAtOnce(home)));
  const targets = new Map<string, CheckAt>();
  for (const at of placeChecks(memo)) targets.set(checkKey(at), at);
  for (const w of workflows) for (const at of workflowChecks(w, workflowNeedsRead(w.dir).needs)) targets.set(checkKey(at), at);
  for (const [key, at] of memo.asked) targets.set(key, at);
  memo.asked.clear();
  const read = yield* Effect.forEach(
    [...targets],
    ([key, at]) => Effect.map(checkRan(home, at, { ms: memo.checkMs, ...options }), (ran) => [key, needStateOf(ran)] as const),
    { concurrency: AT_ONCE },
  );
  for (const key of memo.readings.keys()) if (!targets.has(key)) memo.readings.delete(key);
  for (const [key, state] of read) kept(memo, key, state);
  return new Map(read);
});

/** `state` kept under `key`, the memory's version counted where it changed the reading. */
const kept = (memo: NeedsMemo, key: string, state: NeedState): void => {
  if (memo.readings.get(key) === state) return;
  memo.readings.set(key, state);
  memo.version++;
};

/**
 * The needs of `run`, each as the pass hands it to `assess` (`NeedHeld`): its workflow's, read from the run's frozen copy of its folder
 * (`workflowFiles`), and its place's where it is a repository run, as one list (`needsOfRun`), each read off `memo` under the folders the
 * run's check is told. Read only of a run that has filed nothing, the one a need holds: none otherwise, none where no memory is kept, and
 * none of a run frozen with no copy of its folder. A check the memory has no reading of is run now, once (`checkRan`), and kept, and its
 * key asked for again on the next sweep, so a run started between two sweeps is held on its first pass.
 */
export const runNeeds = Effect.fnUntraced(function* (memo: NeedsMemo | undefined, run: Run) {
  if (memo === undefined || hasStarted(run) || run.cancelledAt || run.workflowFiles === undefined) return [] as NeedHeld[];
  const workflowFiles = workflowFilesDir(memo.home, run, run.workflowFiles);
  const carriedFiles = run.carriedFiles === undefined ? undefined : carriedFilesDir(memo.home, run, run.carriedFiles);
  const own = workflowNeedsRead(workflowFiles).needs;
  const placed = isRepositoryRun(run) ? memo.placeNeeds : [];
  if (!own.length && !placed.length) return [] as NeedHeld[];
  const workflow = run.factory === undefined ? undefined : { factory: run.factory, workflow: path.basename(run.workflowDir) };
  const held: NeedHeld[] = [];
  for (const need of needsOfRun(own, placed)) {
    const fromPlace = placed.some((p) => p.name === need.name);
    const at: CheckAt = fromPlace
      ? { check: need.check }
      : { check: need.check, workflowFiles, ...(carriedFiles === undefined ? {} : { carriedFiles }) };
    const key = checkKey(at);
    memo.asked.set(key, at);
    let state = memo.readings.get(key);
    if (state === undefined) {
      state = needStateOf(yield* checkRan(memo.home, at, { ms: memo.checkMs }));
      kept(memo, key, state);
    }
    held.push({ name: need.name, state, message: need.message, fix: fixWords(need, fromPlace, workflow) });
  }
  return held;
});

/**
 * What puts `need` in place, as a run waiting on it says it: the command that starts its first fix on the server, by the run's factory
 * and workflow where it has one (a workflow's fix that fills a place's need comes first there), else by the need's name for a place's —
 * or, for a workflow's need of a run in no factory, which the server starts no fix for, its first fix's command to type; its own words
 * where it declares no fix.
 */
const fixWords = (need: Need, fromPlace: boolean, workflow: { factory: string; workflow: string } | undefined): string => {
  const first = need.fixes?.[0];
  if (first === undefined) return need.message;
  if (fromPlace || workflow !== undefined) return fixCommandOf(need.name, workflow);
  return first.command;
};

/** Where the memory's version stands for `run`: what the informer keeps beside a run that has filed nothing, and none for any other. */
export const needsVersionOf = (memo: NeedsMemo | undefined, run: Run): number | undefined =>
  memo === undefined || hasStarted(run) ? undefined : memo.version;

/** `StoreRoot`'s memory, made where a program was given none: what a daemon composes its passes over. */
export const needsMemoOf = Effect.gen(function* () {
  return (yield* NeedsMemory) ?? needsMemo(yield* StoreRoot);
});
