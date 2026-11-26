/**
 * The machine's needs, read: each declared check run as a shell command (`checkRan`), under a time limit, with the tools folder first on
 * its PATH, and what it said kept in this process's memory of the readings (`NeedsMemory`), which the pass hands `assess` for each run
 * (`runNeeds`, read by `readRun`) and the readiness read lists. The sweep (`needsOnce`) runs beside the passes, as the disk's does
 * (`needs`, run by `sweepLoop`): every check of the builtin places, of every declared harness (`harnessNeedsOf`), of every factory's
 * workflows, of each repository-scoped need in every trusted factory's repository, and of every run that has filed nothing and asked
 * since the last sweep. Level-triggered: each sweep reads every check again, and a reading is never a transition.
 * A controller: it reads the store's factories and folders and runs the checks.
 */
import { workedOn } from '../factory/factory.ts';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Context, Effect, Layer, type Duration } from 'effect';
import { DEFAULT_HARNESS, DEFAULT_SIGN_IN, HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import type { Need, NeedState } from 'objects';
import { pathLedByTools, toolsDir } from '../config/root.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { workflowNeedsRead } from '../folder/folder.store.ts';
import { carriedDirOf, carriedFilesDir, workflowFilesDir } from '../frozen/frozen.store.ts';
import { untrustedPlaces } from '../trust/untrusted.verb.ts';
import { hasStarted } from '../wait/wait.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { isScript } from '../script/script.store.ts';
import { loadClaudeToken, TOKEN_NAME } from '../sign-in/sign-in.store.ts';
import type { StepSpec } from '../step/step.ts';
import { harnessesOfRun, harnessesWithNeeds, harnessNeedsOf, signInNeedOf } from './harness.ts';
import { fixCommandOf, needsOfRun, needStateOf, type FixAt, type NeedHeld, type NeedRan } from './needs.ts';

/** How long one check may run before it is stopped and read `unknown`: a check answers at once, or says nothing. */
const NEEDS_CHECK_MS = 10_000;

/** The sweep's pace: a need met by hand is read on the next sweep, and a fix settled is read at once (`fix.verb.ts`). */
export const NEEDS_EVERY: Duration.Input = '1 minute';

/** How many checks a sweep runs at once. */
const AT_ONCE = 4;

/**
 * Where a check runs: its command, the folders a workflow's check is told as a step's is — its workflow's (`WF_WORKFLOW_FILES`) and
 * its carried files' (`WF_CARRIED_FILES`) — none for a place's, the folder it runs in (`cwd`: a factory's repository for a place's or a
 * workflow's need of `scope: repository`, the store's folder where left out), and whether the default harness's kept token is in its
 * environment (`token`).
 */
export type CheckAt = {
  readonly check: string;
  readonly workflowFiles?: string;
  readonly carriedFiles?: string;
  readonly cwd?: string;
  readonly token?: true;
};

/**
 * The key a reading is kept under: the check, the folders it runs with and the folder it runs in, so one check of two factories, or of
 * two repositories, is read twice.
 * @param at The check and the folders it runs with and in.
 */
export const checkKey = (at: CheckAt) =>
  [at.carriedFiles ?? '', at.workflowFiles ?? '', at.cwd ?? '', at.token ? 'token' : '', at.check].join('\n');

/**
 * One process's memory of its needs' readings, kept to be read and never to decide: the store it reads for (`home`), each check's last
 * reading by its key (`readings`), the checks a read asked for since the last sweep (`asked`), which the next sweep reads again, the
 * needs of the builtin places as the daemon's place declared them (`placeNeeds`), the needs of every harness the runtime declares
 * (`harnessNeeds`, `declaredHarnessNeeds`), the count of readings changed (`version`, what the
 * informer checks a run that has filed nothing against), and how long a check may run (`checkMs`). Lost at a restart, and read afresh.
 */
export type NeedsMemo = {
  readonly home: string;
  readonly readings: Map<string, NeedState>;
  readonly asked: Map<string, CheckAt>;
  placeNeeds: readonly Need[];
  readonly harnessNeeds: readonly Need[];
  version: number;
  readonly checkMs: number;
};

/**
 * The needs of every harness the runtime declares (`HARNESS_DECLARATIONS`, `harnessNeedsOf`), the default harness's token offered with
 * the command that keeps it in the store (`nemia <token> set`).
 */
export const declaredHarnessNeeds = () =>
  harnessNeedsOf(HARNESS_DECLARATIONS, { harness: DEFAULT_HARNESS, maker: DEFAULT_SIGN_IN.maker, keep: `nemia ${TOKEN_NAME} set` });

/** The names of the harnesses whose adapters declare needs, in the runtime's order. */
const HARNESSES_WITH_NEEDS: readonly string[] = harnessesWithNeeds(HARNESS_DECLARATIONS);

/**
 * A memory that has read nothing yet, of the store at `home`, its checks limited to `checkMs` (`NEEDS_CHECK_MS`).
 * @param home The store's root folder the memory reads for.
 * @param checkMs How long a check may run, in ms, `NEEDS_CHECK_MS` when absent.
 */
export const needsMemo = (home: string, checkMs: number = NEEDS_CHECK_MS) =>
  ({
    home,
    readings: new Map(),
    asked: new Map(),
    placeNeeds: [],
    harnessNeeds: declaredHarnessNeeds(),
    version: 0,
    checkMs,
  }) satisfies NeedsMemo as NeedsMemo;

/**
 * This process's memory of its needs' readings, a `Context.Reference` whose default is none: a daemon gives one (`up`, or the api's
 * `needsMemoryLayer`), which its sweep fills and its passes and requests read; a program given none holds no run on a need.
 */
export const NeedsMemory = Context.Reference<NeedsMemo | undefined>('agent-orchestrator/NeedsMemory', { defaultValue: () => undefined });

/**
 * One memory for a process, of the store at `home`: the api gives one per app, read by the daemon's sweep and every request alike.
 * @param home The store's root folder the memory reads for.
 */
export const needsMemoryLayer = (home: string) => Layer.sync(NeedsMemory, () => needsMemo(home));

/**
 * The environment a check or a fix runs in, over `base`: PATH led by the tools folder's `bin/` (`pathLedByTools`), `NEMIA_TOOLS` the
 * tools folder of the store at `home`, and a workflow's folders as a step is told them, where `at` names them.
 * @param home The store's root folder, whose tools folder leads PATH.
 * @param base The environment to build on, as this process's.
 * @param at The workflow's folders the check or fix is told, none when absent.
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
 * `env` given the default harness's token the store `home` keeps (`loadClaudeToken`), where it is unset: a token file others may read, or
 * an empty one, loads nothing, so the check runs as a session would, with no token.
 */
const tokenLoaded = (env: Record<string, string | undefined>, home: string) => {
  try {
    loadClaudeToken(env, home);
  } catch {
    return;
  }
};

/**
 * The environment the check `at` runs in: `needsEnv`'s over this process's, and, where `at` asks for it (`token`), the default harness's
 * token the store keeps (`loadClaudeToken`), as a session is given it; a token file that does not load gives none, and the readiness read
 * says why.
 */
const checkEnv = (home: string, at: CheckAt) => {
  const env: Record<string, string | undefined> = needsEnv(home, process.env, at);
  if (at.token) tokenLoaded(env, home);
  return env;
};

/**
 * How the check `at` ran, in the store `home`: `shell -c <check>` in the folder `at` names, else the store's, with `checkEnv`'s
 * environment, its output dropped. Ended with its exit (`exited`, one killed by a signal read as exit 128: missing); stopped with its whole
 * process group at `ms` (`timed-out`); or a shell that did not start (`unstartable`). Never fails.
 * @param home The store's root folder, the folder the check runs in where `at` names none.
 * @param at The check, the folders it runs with and in, and whether it is given the kept token.
 */
export const checkRan = (home: string, at: CheckAt, { shell = 'sh', ms }: CheckOptions) =>
  Effect.callback<NeedRan>((resume) => {
    let settled = false;
    const done = (ran: NeedRan) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resume(Effect.succeed(ran));
    };
    const child = spawn(shell, ['-c', at.check], {
      cwd: at.cwd ?? home,
      env: checkEnv(home, at),
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

/**
 * Whether `need` is checked and fixed in each factory's repository (`scope: repository`) rather than once on the machine.
 * @param need The need, with its scope.
 */
export const isRepositoryNeed = (need: Need) => need.scope === 'repository';

/** The checks of the builtin places' machine needs, as the memory holds them: each run with no workflow's folders. */
const placeChecks = (memo: NeedsMemo) => memo.placeNeeds.filter((need) => !isRepositoryNeed(need)).map((need) => ({ check: need.check }));

/**
 * Where a harness's need is checked: its check, the default harness's sign-in with the kept token in its environment.
 * @param need The harness's need: its install or its sign-in.
 */
export const harnessCheckOf = (need: Need) =>
  (need.name === signInNeedOf(DEFAULT_HARNESS) ? { check: need.check, token: true } : { check: need.check }) satisfies CheckAt;

/** The checks of every declared harness's needs. */
const harnessChecks = (memo: NeedsMemo) => memo.harnessNeeds.map(harnessCheckOf) satisfies CheckAt[];

/**
 * The repository a factory's repository needs are checked and fixed in: its first; none for a factory that does not read.
 * @param factory The factory as listed, or its error where it does not read.
 */
export const factoryRepository = (factory: FactoryListing) => ('error' in factory ? undefined : workedOn(factory)[0]);

/**
 * Where a repository need is checked for a repository: its check, run in that repository.
 * @param need The repository need.
 * @param repository The path of the repository to check it in.
 */
export const repositoryCheckOf = (need: Need, repository: string) => ({ check: need.check, cwd: repository });

/** The checks of the places' repository needs in each of `factories`' repositories: what the sweep reads of the trusted ones. */
const repositoryChecks = (memo: NeedsMemo, factories: readonly FactoryListing[]) =>
  factories.flatMap((f) => {
    const repository = factoryRepository(f);
    if (repository === undefined) return [];
    return memo.placeNeeds.filter(isRepositoryNeed).map((need) => repositoryCheckOf(need, repository));
  });

/**
 * A factory's workflow: its factory, its folder's name, the folder its live files are in, and its factory's first repository
 * (`factoryRepository`), where its needs of `scope: repository` are checked and fixed, absent for a factory with none.
 */
export type FactoryWorkflow = {
  readonly factory: string;
  readonly workflow: string;
  readonly dir: string;
  readonly repository?: string;
};

/**
 * The workflows of `factories` as their files are now, each with its folder: under the factory's tree where it was made from a template,
 * else under its first repository's `workflows/`. A factory that does not read has none.
 * @param factories The factories as listed, each or its error.
 */
export const factoryWorkflows = (factories: readonly FactoryListing[]) =>
  factories.flatMap((f) => {
    if ('error' in f) return [];
    const root = f.tree ?? workedOn(f)[0];
    if (root === undefined) return [];
    const repository = factoryRepository(f);
    return f.workflows.map((workflow) => ({
      factory: f.name,
      workflow,
      dir: path.join(root, 'workflows', workflow),
      ...(repository === undefined ? {} : { repository }),
    }));
  });

/**
 * The factories of `factories` whose places a harness trusts now (`untrustedPlaces`): a factory's workflow's checks run on the daemon
 * only where they would run in its session, as its fixes do (`fixRefusal`). A factory that does not read has no place, and stays.
 */
export const trustedOf = Effect.fnUntraced(function* (factories: readonly FactoryListing[]) {
  const untrusted = new Set((yield* untrustedPlaces(factories)).map((u) => u.factory));
  return factories.filter((f) => !untrusted.has(f.name));
});

/**
 * The checks of a factory's workflow, each with its live folders: what the readiness read lists and the sweep reads.
 * @param w The factory's workflow, with the folder its live files are in.
 * @param needs The needs the workflow declares.
 */
const workflowChecks = (w: FactoryWorkflow, needs: readonly Need[]) =>
  needs.flatMap((need) => {
    const at = workflowCheckOf(w, need);
    return at === undefined ? [] : [at];
  });

/**
 * Where a factory's workflow's `need` is checked (`ownCheckOf`): with the workflow's live folders, and in its factory's first repository
 * for a need of `scope: repository`; undefined for such a need of a factory with no repository, which is never run and reads unmet.
 * @param w The factory's workflow, with its live folder and its factory's repository.
 * @param need The need the workflow declares.
 */
export const workflowCheckOf = (w: FactoryWorkflow, need: Need) =>
  ownCheckOf(need, { workflowFiles: w.dir, carriedFiles: carriedDirOf(w.dir) }, w.repository) satisfies CheckAt | undefined as
    | CheckAt
    | undefined;

/**
 * Where a workflow's own `need` is checked: with the workflow's `folders` as a step is told them, in the store's folder where it says
 * no scope, and in `repository` where it says `scope: repository`, as a place's repository need is (`repositoryCheckOf`); undefined
 * for a repository need where there is no repository, which is never run and reads unmet (`noRepositoryMessage`).
 * @param need The workflow's need.
 * @param folders The workflow's folders the check is told: its own, and its carried files' where it has them.
 * @param repository The repository a need of `scope: repository` is checked in, absent where there is none.
 */
export const ownCheckOf = (
  need: Need,
  folders: { readonly workflowFiles: string; readonly carriedFiles?: string },
  repository: string | undefined,
) => {
  if (!isRepositoryNeed(need)) return { check: need.check, ...folders };
  return repository === undefined ? undefined : { check: need.check, ...folders, cwd: repository };
};

/**
 * What a workflow's need of `scope: repository` says where there is no repository to check it in: unmet, and why.
 * @param need The workflow's repository need.
 */
export const noRepositoryMessage = (need: Need) =>
  `${need.message}: unmet, since it is checked in its factory's repository and there is none: file the factory on a repository, then nemia doctor reads it`;

/**
 * One sweep over the needs of the store `memo` reads for: every check of the builtin places, of every declared harness (the default
 * harness's sign-in with the kept token), of every trusted factory's workflows as their files are now and of the places' repository needs
 * in every trusted factory's repository (`trustedOf`: an untrusted factory's are never run), and of each run that asked since the last
 * sweep (`asked`), each run once at most `AT_ONCE` at a time under the memory's limit, its reading kept and each that changed counted
 * (`version`). A key no longer asked for is forgotten. Answers the readings by key.
 */
export const needsOnce = Effect.fn('needsOnce')(function* (memo: NeedsMemo, options: { shell?: string } = {}) {
  const home = memo.home;
  const listed = yield* Effect.sync(() => listedAtOnce(home));
  const trusted = yield* trustedOf(listed);
  const workflows = factoryWorkflows(trusted);
  const targets = new Map<string, CheckAt>();
  for (const at of placeChecks(memo)) targets.set(checkKey(at), at);
  for (const at of harnessChecks(memo)) targets.set(checkKey(at), at);
  for (const at of repositoryChecks(memo, trusted)) targets.set(checkKey(at), at);
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
const kept = (memo: NeedsMemo, key: string, state: NeedState) => {
  if (memo.readings.get(key) === state) return;
  memo.readings.set(key, state);
  memo.version++;
};

/**
 * The harnesses a run's frozen `steps` run sessions on, among those that declare needs (`harnessesOfRun`): a script condition runs none.
 * @param steps The run's frozen steps.
 */
export const runHarnesses = (steps: readonly StepSpec[]) =>
  harnessesOfRun(
    steps.map((step) => ({ harness: step.harness, runsSession: !isScript(step) })),
    DEFAULT_HARNESS,
    HARNESSES_WITH_NEEDS,
  );

/**
 * Whether `run`'s needs may hold it (`runNeeds`): it has filed nothing, nobody called it off, and it froze its folder's files, the copy
 * its needs are read from. Any other run waits on no need.
 * @param run The run's record.
 */
export const heldOnNeeds = (run: Run) => !hasStarted(run) && !run.cancelledAt && run.workflowFiles !== undefined;

/**
 * The harnesses `run` would be held on, from its frozen `steps` (`runHarnesses`), none where its needs hold it no more (`heldOnNeeds`):
 * what `runNeeds` holds a run by, and what the readiness read names of each run, so the two cannot drift.
 * @param run The run's record.
 * @param steps The run's frozen steps.
 */
export const harnessesHolding = (run: Run, steps: readonly StepSpec[]) => (heldOnNeeds(run) ? runHarnesses(steps) : []);

/** The needs of `harnessNeeds` of each harness a run's frozen `steps` run sessions on (`runHarnesses`). */
const harnessNeedsOfRun = (harnessNeeds: readonly Need[], steps: readonly StepSpec[]) =>
  needsOfHarnesses(harnessNeeds, runHarnesses(steps));

/** The needs of `harnessNeeds` of each of `harnesses`: its install and its sign-in. */
const needsOfHarnesses = (harnessNeeds: readonly Need[], harnesses: readonly string[]) =>
  harnessNeeds.filter((need) => harnesses.some((h) => need.name === h || need.name === signInNeedOf(h)));

/**
 * The names of every need of `run` (`needsOfRun`), in the store `home`: its workflow's, read from its frozen copy of its folder, its
 * place's (`placeNeeds`) where it is a repository run, and its harnesses' (`harnessNeeds`) of its frozen `steps`, read or not. What a fix
 * that takes a need away asks of each unfinished run (`runsHoldingRemoval`).
 * @param home The store's root folder, where the run's frozen copy of its folder is.
 * @param needs The builtin places' needs and every declared harness's.
 * @param run The run's record.
 * @param steps The run's frozen steps.
 */
export const runNeedNames = (
  home: string,
  needs: { readonly placeNeeds: readonly Need[]; readonly harnessNeeds: readonly Need[] },
  run: Run,
  steps: readonly StepSpec[],
) => {
  const own = run.workflowFiles === undefined ? [] : workflowNeedsRead(workflowFilesDir(home, run, run.workflowFiles)).needs;
  const placed = isRepositoryRun(run) ? needs.placeNeeds : [];
  return needsOfRun(own, placed, harnessNeedsOfRun(needs.harnessNeeds, steps)).map((need) => need.name);
};

/**
 * The needs of `run`, each as the pass hands it to `assess` (`NeedHeld`): its workflow's, read from the run's frozen copy of its folder
 * (`workflowFiles`), its place's where it is a repository run, and the needs of each harness its frozen `steps` run sessions on
 * (`runHarnesses`), as one list (`needsOfRun`), each read off `memo` under the folders the run's check is told. Read only of a run that has
 * filed nothing, the one a need holds: none otherwise, none where no memory is kept, and none of a run frozen with no copy of its folder.
 * A workflow's or a place's machine check the memory has no reading of is run now, once (`checkRan`), and kept, and its key asked for
 * again on the next sweep, so a run started between two sweeps is held on its first pass. A harness's check and a repository need's
 * (checked in the run's repository) are read off the memory alone, which every sweep fills: one not read yet is `unknown`, and holds
 * nothing, so a process that never sweeps holds no run on a harness. A workflow's own need of `scope: repository` is checked in the run's
 * repository (`ownCheckOf`), and reads missing for a run in none, saying so (`noRepositoryMessage`).
 */
export const runNeeds = Effect.fnUntraced(function* (memo: NeedsMemo | undefined, run: Run, steps: readonly StepSpec[] = []) {
  if (memo === undefined || run.workflowFiles === undefined || !heldOnNeeds(run)) return [] as NeedHeld[];
  const workflowFiles = workflowFilesDir(memo.home, run, run.workflowFiles);
  const carriedFiles = run.carriedFiles === undefined ? {} : { carriedFiles: carriedFilesDir(memo.home, run, run.carriedFiles) };
  const own = workflowNeedsRead(workflowFiles).needs;
  const repository = isRepositoryRun(run) ? run.repo : undefined;
  const placed = repository === undefined ? [] : memo.placeNeeds;
  const harnessed = needsOfHarnesses(memo.harnessNeeds, harnessesHolding(run, steps));
  const workflow = run.factory === undefined ? undefined : { factory: run.factory, workflow: path.basename(run.workflowDir) };
  const held: NeedHeld[] = [];
  for (const need of needsOfRun(own, placed, harnessed)) {
    const fromPlace = placed.some((p) => p.name === need.name);
    const swept = sweptOnly(need, { fromPlace, own, harnessed, repository: repository ?? memo.home });
    if (swept !== undefined) {
      const fixAt = fromPlace && run.factory !== undefined ? { factory: run.factory } : undefined;
      const state = memo.readings.get(checkKey(swept)) ?? 'unknown';
      held.push({ name: need.name, state, message: need.message, fix: fixWords(need, true, fixAt) });
      continue;
    }
    held.push(
      yield* checkedHeld(
        memo,
        need,
        fromPlace ? { check: need.check } : ownCheckOf(need, { workflowFiles, ...carriedFiles }, repository),
        fixWords(need, fromPlace, workflow),
      ),
    );
  }
  return held;
});

/**
 * A run's `need` read where it is checked (`at`, through `readOrCheck`), with the words of its `fix`; missing, saying why, where it has
 * no place to be checked: a workflow's need of `scope: repository` of a run in no repository (`noRepositoryMessage`).
 */
const checkedHeld = Effect.fnUntraced(function* (memo: NeedsMemo, need: Need, at: CheckAt | undefined, fix: string) {
  if (at === undefined)
    return { name: need.name, state: 'missing', message: noRepositoryMessage(need), fix: noRepositoryMessage(need) } satisfies NeedHeld;
  return { name: need.name, state: yield* readOrCheck(memo, at), message: need.message, fix } satisfies NeedHeld;
});

/**
 * Where a run's `need` is read off the memory alone, which every sweep fills: a harness's need (`harnessCheckOf`), and a place's repository
 * need, in the run's `repository` (`repositoryCheckOf`); undefined for a workflow's or a place's machine need, which a run checks itself
 * where no sweep has read it.
 */
const sweptOnly = (need: Need, of: { fromPlace: boolean; own: readonly Need[]; harnessed: readonly Need[]; repository: string }) => {
  if (of.fromPlace) return (isRepositoryNeed(need) ? repositoryCheckOf(need, of.repository) : undefined) satisfies CheckAt | undefined;
  if (of.own.some((n) => n.name === need.name)) return undefined;
  return (of.harnessed.some((h) => h.name === need.name) ? harnessCheckOf(need) : undefined) satisfies CheckAt | undefined;
};

/**
 * The reading `memo` keeps of the check `at`, its key asked for again on the next sweep; where it keeps none, the check run now, once
 * (`checkRan`), and kept.
 */
const readOrCheck = Effect.fnUntraced(function* (memo: NeedsMemo, at: CheckAt) {
  const key = checkKey(at);
  memo.asked.set(key, at);
  const read = memo.readings.get(key);
  if (read !== undefined) return read;
  const state = needStateOf(yield* checkRan(memo.home, at, { ms: memo.checkMs }));
  kept(memo, key, state);
  return state;
});

/**
 * What puts `need` in place, as a run waiting on it says it: the command that starts its first fix on the server, by the run's factory
 * and workflow where it has one (a workflow's fix that fills a place's need comes first there), by the factory alone for a repository
 * need, else by the need's name for a place's or a harness's — or, for a workflow's need of a run in no factory, which the server starts
 * no fix for, its first fix's command to type; its own words where it declares no fix.
 */
const fixWords = (need: Need, fromPlace: boolean, at: FixAt | undefined) => {
  const first = need.fixes?.[0];
  if (first === undefined) return need.message;
  if (fromPlace || at !== undefined) return fixCommandOf(need.name, at);
  return first.command;
};

/**
 * Where the memory's version stands for `run`: what the informer keeps beside a run that has filed nothing, and none for any other.
 * @param memo The process's memory of its needs, or undefined where none is kept.
 * @param run The run's record.
 */
export const needsVersionOf = (memo: NeedsMemo | undefined, run: Run) => (memo === undefined || hasStarted(run) ? undefined : memo.version);
