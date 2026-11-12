/**
 * A need's fix, started and followed: `startFix` finds the fix a person asks for — of a builtin place, of a harness the runtime declares,
 * of a factory's workflow, or of a place's repository need in a factory's repository — refuses one a person types (`typed`), one that
 * takes a need away while an unfinished run needs it (`removes`, `runsHoldingRemoval`), and one a workflow or a repository of an
 * untrusted factory declares (`fixRefusal`), and files it on the runtime as a command task, so its output is
 * kept whole and it outlives the request that started it (a device-code sign-in waits minutes on a person); `fixOf` reads it back through
 * the engine, its phase and the end of what it printed; `followFix` follows that output as it grows, then the fix as it ended. Once a fix
 * is seen settled, the machine's needs are read again at once (`needsOnce`), so a run held on what it fixed starts on the next pass. A
 * controller, reaching the runtime through the client.
 */
import { randomBytes } from 'node:crypto';
import { Effect, Option, Stream } from 'effect';
import type { Fix, FixPhase, FixStart, Need, NeedFix } from 'objects';
import { asked, EngineService, tried, type Engine, type TaskView } from '../runtime-client.ts';
import { pathLedByTools, StoreRoot, toolsDir } from '../config/root.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import { noFactoryLine, type FactoryListing } from '../factory/factory.ts';
import { workflowNeedsRead } from '../folder/folder.store.ts';
import { carriedDirOf } from '../frozen/frozen.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { assess } from '../tick/assess.ts';
import { readRun } from '../tick/told.verb.ts';
import { MOMENTUM } from '../status/status.ts';
import { trustCommandOf } from '../trust/trust.ts';
import { untrustedPlaces } from '../trust/untrusted.verb.ts';
import { runsHoldingRemoval, type RunNeeding } from './harness.ts';
import { fixRefusal, type FixOrigin } from './needs.ts';
import {
  declaredHarnessNeeds,
  factoryRepository,
  factoryWorkflows,
  isRepositoryNeed,
  NeedsMemory,
  needsOnce,
  runNeedNames,
} from './needs.verb.ts';
import { readFixRecord, writeFixRecord, type FixRecord } from './fix.store.ts';

/** How long a fix may run: a device-code sign-in waits on a person for minutes, and a code lives about as long. */
export const FIX_DEADLINE_SECONDS = 900;

/** How much of the end of a fix's output its read carries (`fixOf`). */
export const FIX_TAIL_BYTES = 16_384;

/** How often a follow of a fix's output reads it again while the fix runs (`followFix`). */
export const FIX_FOLLOW_MS = 500;

/** The variable an ask's answer reaches a fix's command in: `NEMIA_ANSWER_` and its name in capitals, any other character `_`. */
export const answerVariable = (name: string): string => `NEMIA_ANSWER_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/**
 * Where a fix was declared: a builtin place's machine need, a harness's need, a factory's workflow, or a place's need of a factory's
 * repository (`repository`), run there.
 */
type Origin = 'place' | 'harness' | 'workflow' | 'repository';

/**
 * A fix found: the need, the fix, its index among the need's fixes, where it was declared, a workflow's live folders for its env, and the
 * repository a repository need's fix runs in.
 */
type FixFound = {
  readonly need: Need;
  readonly fix: NeedFix;
  readonly index: number;
  readonly origin: Origin;
  readonly listing?: Extract<FactoryListing, { repos: readonly string[] }>;
  readonly folders?: { readonly workflowFiles: string; readonly carriedFiles: string };
  readonly repository?: string;
};

/** The fixes of a need, each with where it was declared: a workflow's that `fills` a place need first, then the place's own. */
type Declared = { readonly fix: NeedFix; readonly origin: Origin };

/** The factory `name` of the store `home`, read; refused (`Missing`) where there is none, or its file does not read. */
function factoryNamed(home: string, name: string): Extract<FactoryListing, { repos: readonly string[] }> {
  const all = listedAtOnce(home);
  const found = all.find((f) => f.name === name);
  if (found === undefined)
    throw new Missing({
      message: `${noFactoryLine(
        name,
        all.map((f) => f.name),
      )} Name a factory nemia factory ls lists with --factory.`,
    });
  if ('error' in found) throw new Missing({ message: `${found.file} ${found.error}: fix or remove the file (nemia factory rm ${name}).` });
  return found;
}

/** A need with its fixes as declared, and, for a workflow's, its factory and the folders its fix runs with. */
type Declaring = Pick<FixFound, 'listing' | 'folders' | 'repository'> & {
  readonly need: Need | undefined;
  readonly declared: readonly Declared[];
};

/**
 * The need `start` names of the factory and workflow it names, as its files are now: the workflow's own, or a place need it fills, its
 * fixes before the place's. Refused (`Missing`) for a factory or a workflow that is not there.
 */
function workflowDeclaring(home: string, placeNeeds: readonly Need[], start: FixStart & { factory: string; workflow: string }): Declaring {
  const listing = factoryNamed(home, start.factory);
  const workflow = factoryWorkflows([listing]).find((w) => w.workflow === start.workflow);
  if (workflow === undefined)
    throw new Missing({
      message: `the factory ${start.factory} offers no workflow ${start.workflow}: name one of ${listing.workflows.join(', ') || 'its workflows (it offers none)'} with --workflow.`,
    });
  const folders = { workflowFiles: workflow.dir, carriedFiles: carriedDirOf(workflow.dir) };
  const own = workflowNeedsRead(workflow.dir).needs;
  const ofWorkflow = (fixes: readonly NeedFix[] | undefined): Declared[] => (fixes ?? []).map((fix) => ({ fix, origin: 'workflow' }));
  const mine = own.find((n) => n.name === start.need && (n.fills === undefined || !placeNeeds.some((p) => p.name === n.fills)));
  if (mine !== undefined) return { need: mine, declared: ofWorkflow(mine.fixes), listing, folders };
  const placed = placeNeeds.find((p) => p.name === start.need);
  const fillers = own.filter((n) => placed !== undefined && n.fills === placed.name).flatMap((n) => ofWorkflow(n.fixes));
  const places = (placed?.fixes ?? []).map((fix): Declared => ({ fix, origin: 'place' }));
  return { need: placed, declared: [...fillers, ...places], listing, folders };
}

/**
 * The need `start` names of the factory it names alone: a place's repository need, its fix run in the factory's repository
 * (`factoryRepository`). Refused (`Missing`) for a factory that is not there, and (`Invalid`) for a need of no repository, which a
 * workflow names with the factory.
 */
function repositoryDeclaring(home: string, placeNeeds: readonly Need[], start: FixStart & { factory: string }): Declaring {
  const need = placeNeeds.find((p) => p.name === start.need && isRepositoryNeed(p));
  if (need === undefined)
    throw new Invalid({
      message: `${start.need} is no need of a factory's repository: name a workflow's need with --factory ${start.factory} --workflow <workflow>, or a place's or a harness's with neither (nemia doctor lists each with the command that fixes it).`,
    });
  const listing = factoryNamed(home, start.factory);
  const repository = factoryRepository(listing);
  return {
    need,
    declared: (need.fixes ?? []).map((fix) => ({ fix, origin: 'repository' })),
    listing,
    ...(repository === undefined ? {} : { repository }),
  };
}

/**
 * The need `start` names where it is declared, with its fixes: of the workflow named of the factory named (`workflowDeclaring`), of the
 * factory named alone (`repositoryDeclaring`), else a machine need of the builtin places (`placeNeeds`) or of a harness (`harnessNeeds`).
 */
function declaringOf(home: string, placeNeeds: readonly Need[], harnessNeeds: readonly Need[], start: FixStart): Declaring {
  const { factory, workflow } = start;
  if (factory !== undefined && workflow !== undefined) return workflowDeclaring(home, placeNeeds, { ...start, factory, workflow });
  if (factory !== undefined) return repositoryDeclaring(home, placeNeeds, { ...start, factory });
  const placed = placeNeeds.find((p) => p.name === start.need && !isRepositoryNeed(p));
  const harnessed = placed === undefined ? harnessNeeds.find((h) => h.name === start.need) : undefined;
  if (harnessed !== undefined) return { need: harnessed, declared: (harnessed.fixes ?? []).map((fix) => ({ fix, origin: 'harness' })) };
  return { need: placed, declared: (placed?.fixes ?? []).map((fix) => ({ fix, origin: 'place' })) };
}

/**
 * The fix `start` asks for, found where it was declared: a machine need of the builtin places (`placeNeeds`) or of a harness
 * (`harnessNeeds`) when no factory is named, a place's repository need of the factory named alone (`repositoryDeclaring`), else a need of
 * the workflow named of the factory named (`workflowDeclaring`). Refused (`Missing`) for a factory, a workflow or a need that is not
 * there, and (`Invalid`) for a workflow named without its factory, and an index no fix of the need has.
 */
function fixFound(home: string, placeNeeds: readonly Need[], harnessNeeds: readonly Need[], start: FixStart): FixFound {
  const index = start.index ?? 0;
  const { factory, workflow } = start;
  if (factory === undefined && workflow !== undefined)
    throw new Invalid({
      message: `nemia doctor fix ${start.need}: a workflow's need is named by its factory and its workflow together: give both, --factory <factory> --workflow <workflow>, or neither for a place's or a harness's need.`,
    });
  const { need, declared, listing, folders, repository } = declaringOf(home, placeNeeds, harnessNeeds, start);
  if (need === undefined)
    throw new Missing({
      message: `no need ${start.need} is declared ${workflow === undefined ? 'by a builtin place nor a harness' : `by ${factory}'s workflow ${workflow} nor its place`}: nemia doctor lists every need with the command that fixes it.`,
    });
  const chosen = declared[index];
  if (chosen === undefined || !Number.isInteger(index))
    throw new Invalid({
      message: declared.length
        ? `${need.name} has ${declared.length} fix${declared.length === 1 ? '' : 'es'}: give --index from 0 to ${declared.length - 1}, or leave it out for the first.`
        : `${need.name} declares no fix the server can start: ${need.message}. Put it in place by hand, then nemia doctor reads it again.`,
    });
  return {
    need,
    fix: chosen.fix,
    index,
    origin: chosen.origin,
    ...(listing && { listing }),
    ...(folders && { folders }),
    ...(repository === undefined ? {} : { repository }),
  };
}

/** The answers `start` gives, each to the ask of the fix its name names; refused (`Invalid`) where one is left out or none asks it. */
function answersOf(found: FixFound, start: FixStart): Record<string, string> {
  const asks = found.fix.asks ?? [];
  const given = start.answers ?? {};
  const left = asks.filter((a) => !given[a.name]?.trim());
  const unasked = Object.keys(given).filter((name) => !asks.some((a) => a.name === name));
  if (left.length || unasked.length)
    throw new Invalid({
      message: `${found.need.name}'s fix ${unasked.length ? `asks no ${unasked.join(', ')}` : `asks ${left.map((a) => `${a.name} (${a.message})`).join(', ')}`}: give ${asks.length ? asks.map((a) => `--answer ${a.name}=<value>`).join(' ') : 'no --answer'}.`,
    });
  return Object.fromEntries(asks.map((a) => [answerVariable(a.name), given[a.name] ?? '']));
}

/**
 * Starts the fix `start` asks for, and answers it as a `Fix`, `pending`: found where it was declared (`fixFound`); refused (`Invalid`,
 * naming its command) where it is one a person types (`typed`); refused (`Invalid`, naming `nemia factory trust <factory>`) where a
 * workflow or a repository of a factory whose places are not trusted declares it (`fixRefusal`); refused (`Conflict`, naming `nemia cancel
 * <run>` for each) where it takes a need away (`removes`) that an unfinished run needs (`runsHoldingRemoval`); and refused where an answer
 * it asks is left out (`answersOf`); then filed on the runtime as a command task (`harness: 'command'`, as a script condition is), its
 * stdout and stderr one stream, under `FIX_DEADLINE_SECONDS`, in the store's folder (a repository need's in the factory's repository), with
 * the tools folder first on its PATH and as `NEMIA_TOOLS`, each answer as `NEMIA_ANSWER_<NAME>`, and a workflow's fix its factory's live
 * folders as a step is told them (`WF_WORKFLOW_FILES`, `WF_CARRIED_FILES`); its record kept under `<home>/fixes/<id>.json`. The runtime
 * runs it on the daemon's next pass.
 */
export const startFix = Effect.fn('startFix')(function* (start: FixStart) {
  const home = yield* StoreRoot;
  const place = yield* PlaceService;
  const e = yield* EngineService;
  const placeNeeds = place.declared.needs ?? [];
  const harnessNeeds = (yield* NeedsMemory)?.harnessNeeds ?? declaredHarnessNeeds();
  const found = yield* tried(() => fixFound(home, placeNeeds, harnessNeeds, start));
  yield* refusedStart(e, home, { placeNeeds, harnessNeeds }, found);
  const answers = yield* tried(() => answersOf(found, start));
  const id = `fix-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const env = {
    PATH: pathLedByTools(home, process.env.PATH),
    NEMIA_TOOLS: toolsDir(home),
    ...(found.origin === 'workflow' && found.folders
      ? { WF_WORKFLOW_FILES: found.folders.workflowFiles, WF_CARRIED_FILES: found.folders.carriedFiles }
      : {}),
    ...answers,
  };
  yield* asked(
    'file',
    e.file({
      id,
      harness: 'command',
      priority: MOMENTUM,
      brief: `fix ${found.need.name}: ${found.fix.message}`,
      cwd: found.origin === 'repository' && found.repository !== undefined ? found.repository : home,
      deadlineSeconds: FIX_DEADLINE_SECONDS,
      config: { command: ['sh', '-c', `exec 2>&1\n${found.fix.command}`], env },
    }),
  );
  const record: FixRecord = {
    id,
    need: found.need.name,
    ...(start.factory === undefined ? {} : { factory: start.factory }),
    ...(start.workflow === undefined ? {} : { workflow: start.workflow }),
    index: found.index,
    ...(found.fix.code === undefined ? {} : { code: found.fix.code }),
    taskId: id,
    startedAt: new Date().toISOString(),
  };
  yield* tried(() => writeFixRecord(home, record));
  return fixRead(record, undefined, '');
});

/**
 * Whether `found` may be started, failing where not: a fix a person types (`Invalid`, naming its command); a workflow's or a repository's
 * fix of a factory whose places are not trusted (`fixRefusal`, `Invalid`, naming the trust); a fix that takes a need away while an
 * unfinished run needs it (`runsHoldingRemoval`, `Conflict`, naming `nemia cancel <run>` for each).
 */
const refusedStart = Effect.fnUntraced(function* (
  e: Engine,
  home: string,
  needs: { readonly placeNeeds: readonly Need[]; readonly harnessNeeds: readonly Need[] },
  found: FixFound,
) {
  if (found.fix.kind === 'typed')
    return yield* Effect.fail(
      new Invalid({
        message: `${found.need.name}'s fix is typed by a person on the server, as the user the daemon runs as, since it asks what no fix the server starts can read: type ${found.fix.command} there, then nemia doctor reads the need again.`,
      }),
    );
  if (found.listing !== undefined && (found.origin === 'workflow' || found.origin === 'repository')) {
    const factory = found.listing.name;
    const untrusted = yield* untrustedPlaces([found.listing]);
    const origin: FixOrigin = { kind: 'workflow', trusted: untrusted.length === 0 };
    if (fixRefusal(origin) === 'untrusted')
      return yield* Effect.fail(
        new Invalid({
          message: `${found.need.name}'s fix is declared ${found.origin === 'workflow' ? `by the factory ${factory}'s workflow` : `for the factory ${factory}'s repository`}, and its places are not trusted (${untrusted.map((u) => u.place).join(', ')}): ${trustCommandOf(factory)} trusts them, then start the fix again.`,
        }),
      );
  }
  if (found.fix.kind !== 'removes') return;
  const holding = runsHoldingRemoval(found.need.name, yield* unfinishedNeeding(e, home, needs, found.need.name));
  if (holding.length)
    return yield* Effect.fail(
      new Conflict({
        message: `${found.need.name} is needed by ${holding.length === 1 ? 'a run that has not finished' : `${holding.length} runs that have not finished`}: let ${holding.length === 1 ? 'it' : 'them'} finish, or stop each (${holding.map((id) => `nemia cancel ${id}`).join(', ')}), then nemia doctor fix ${found.need.name} --index ${found.index} again.`,
        users: holding,
      }),
    );
});

/** The statuses of a run that has not finished: what a fix that takes a need away waits on. */
const UNFINISHED: ReadonlySet<string> = new Set(['running', 'waiting', 'awaiting approval']);

/**
 * The unfinished runs of the store `home` whose needs (`runNeedNames`) name `need`, each with its needs: every run not cancelled whose
 * needs name it, judged by its one read (`readRun`, `assess`) as the listing judges it — a run whose read fails counts as unfinished, and
 * `nemia cancel` lets it go. A run whose steps do not load is read with none.
 */
const unfinishedNeeding = Effect.fnUntraced(function* (
  e: Engine,
  home: string,
  needs: { readonly placeNeeds: readonly Need[]; readonly harnessNeeds: readonly Need[] },
  need: string,
) {
  const out: RunNeeding[] = [];
  for (const run of yield* (yield* RunDoor).runs.list()) {
    if (run.cancelledAt) continue;
    const steps = yield* stepsOf(run).pipe(Effect.orElseSucceed(() => []));
    const names = runNeedNames(home, needs, run, steps);
    if (!names.includes(need)) continue;
    const status = yield* readRun(e, run, { steps }).pipe(
      Effect.map(({ read }) => assess(read).status as string),
      Effect.orElseSucceed(() => 'running'),
    );
    if (UNFINISHED.has(status)) out.push({ run: run.id, needs: names });
  }
  return out;
});

/** A fix's phase off its task's view: as it settled (`succeeded`, else `failed`), `running` once an attempt began, else `pending`. */
export const fixPhaseOf = (view: TaskView | undefined): FixPhase => {
  if (view === undefined) return 'pending';
  if (view.state.settled) return view.state.settled === 'succeeded' ? 'succeeded' : 'failed';
  return view.state.attempts.length ? 'running' : 'pending';
};

/** The `Fix` of `record` over its task's view and the end of its output. */
const fixRead = (record: FixRecord, view: TaskView | undefined, output: string): Fix => {
  const exitCode = view?.state.settled ? view.state.attempts.at(-1)?.exitCode : undefined;
  return {
    id: record.id,
    need: record.need,
    ...(record.factory === undefined ? {} : { factory: record.factory }),
    ...(record.workflow === undefined ? {} : { workflow: record.workflow }),
    phase: fixPhaseOf(view),
    output,
    ...(record.code === undefined ? {} : { code: record.code }),
    ...(typeof exitCode === 'number' ? { exitCode } : {}),
  };
};

/** The record of the fix `id`, refused (`Missing`) where the store has none, naming how one is started. */
const recordOf = (home: string, id: string): Effect.Effect<FixRecord, Missing> => {
  const record = readFixRecord(home, id);
  return record === undefined
    ? Effect.fail(new Missing({ message: `no fix ${id} was started here: nemia doctor fix <need> starts one, and prints its id.` }))
    : Effect.succeed(record);
};

/**
 * Once the fix of `record` has settled, the machine's needs read again at once over this process's memory (`needsOnce`), and the record
 * marked so it is done once: a run held on the need starts on the next pass, with no sweep's rest waited out. Nothing where the process
 * keeps no memory, which reads them afresh on every read.
 */
const sweptAfter = Effect.fnUntraced(function* (home: string, record: FixRecord, view: TaskView) {
  if (!view.state.settled || record.swept) return;
  const memo = yield* NeedsMemory;
  if (memo !== undefined) yield* needsOnce(memo);
  yield* tried(() => writeFixRecord(home, { ...record, swept: true }));
});

/**
 * The fix `id` as it stands, read through the engine: its phase, the end of what it printed (`FIX_TAIL_BYTES`), its exit code once
 * ended, and the pattern of its code. Refused (`Missing`) for an id no fix was started under. A fix seen settled for the first time has
 * the needs read again (`sweptAfter`).
 */
export const fixOf = Effect.fn('fixOf')(function* (id: string) {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const record = yield* recordOf(home, id);
  const view = yield* asked('view', e.view(record.taskId));
  const output = (yield* asked('output', e.output(record.taskId, 'stdout', FIX_TAIL_BYTES))) ?? '';
  yield* sweptAfter(home, record, view);
  return fixRead(record, view, output);
});

/** One moment of a fix followed: a piece of what it printed, in order, or its end, the fix as it ended. */
export type FixFollowed = { readonly kind: 'output'; readonly text: string } | { readonly kind: 'ended'; readonly fix: Fix };

/**
 * The fix `id`'s output followed as it grows (`FIX_FOLLOW_MS`): each piece it printed since the last read, once and in order, from its
 * first byte, then its end (`ended`, `fixOf`), after which the stream is over. Refused (`Missing`) for an id no fix was started under.
 * Read off the runtime's kept stream every time, never remembered past the follow: a reader that comes back reads it whole again.
 */
export const followFix = (id: string, everyMs: number = FIX_FOLLOW_MS) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    yield* recordOf(home, id);
    return Stream.paginate({ sent: 0, first: true }, (s: { sent: number; first: boolean }) =>
      Effect.gen(function* () {
        if (!s.first) yield* Effect.sleep(everyMs);
        const e = yield* EngineService;
        const record = yield* recordOf(home, id);
        const view = yield* asked('view', e.view(record.taskId));
        const whole = (yield* asked('output', e.output(record.taskId, 'stdout'))) ?? '';
        const text = whole.slice(s.sent);
        const pieces: FixFollowed[] = text ? [{ kind: 'output', text }] : [];
        if (!view.state.settled) return [pieces, Option.some({ sent: whole.length, first: false })] as const;
        yield* sweptAfter(home, record, view);
        const tail = whole.length > FIX_TAIL_BYTES ? whole.slice(-FIX_TAIL_BYTES) : whole;
        return [[...pieces, { kind: 'ended', fix: fixRead(record, view, tail) } satisfies FixFollowed], Option.none()] as const;
      }),
    );
  });
