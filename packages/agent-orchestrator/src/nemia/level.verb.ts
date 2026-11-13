/**
 * `nemia level`: the person's switch for Nemia, an entry of the command table. Bare, where she is: the store's level and each factory's,
 * her session's phase, how to reach it, and what a person allowed her at a prompt beyond what is built in. Given `auto`, `semi-auto` or
 * `manual`, the store's level, or with `--factory` a factory's default, a raise of it for a stretch (`--for`) or the raise ended
 * (`--end`), written for the keeper (`keep.verb.ts`) to act on at its next beat. The api serves the read and the write as the nemia group's
 * `level` and `setLevel` (`objects`' Api), each calling its handler by type (`LevelInput`).
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect } from 'effect';
import { LEVEL_WORDS, NemiaLevelSet, DEFAULT_NAMESPACE } from 'objects';
import type { Args } from '../command/command.ts';
import type { Served } from '../command/entry.verb.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import {
  durationOf,
  durationRefusal,
  factoryAsked,
  levelsAfter,
  type FactoryAsk,
  type FactoryLevel,
  type FactoryLevelFile,
} from '../level/level.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { FactoryDoor } from '../factory/door/factories.store.ts';
import { levelsNow } from '../level/levels.verb.ts';
import { EngineService, asked, tried, trustedFolder, type Engine } from '../runtime-client.ts';
import { taskSpend, type Spend } from '../status/status.ts';
import { bridgeOf, type Bridge } from '../views/views.verb.ts';
import type { EnginePhase } from '../views/views-words.ts';
import { nemiaDir, promptAllows, readLevel, writeLevel } from './level.store.ts';
import { LEVEL_FORM, nemiaTaskId, type Level, type LevelFile } from './nemia.ts';

/**
 * Where Nemia is, as `nemia level` answers: the store's `level` and since when; each factory's level (`factories`), the default factory
 * first; her task, its phase and its session where one is filed; how a person reaches her session (`reach`), and her session's web link
 * where it was asked (`bridge`, null where not; `bridgeOf`); whether her task was stopped
 * from outside (`stopped`); what her sessions cost (`spend`, counted as each ends, as a step's; null where none is filed); and the allow
 * rules a person gave her at a prompt (`allows`); and the command a person runs once to trust her folder (`trust`, `trustCommand`), null
 * where her harness trusts it or keeps no trust: while it is not, her session waits for it.
 */
export type NemiaLevel = {
  level: Level;
  since: string | null;
  task: string | null;
  phase: EnginePhase | null;
  sessionId: string | null;
  reach: string[];
  bridge: Bridge | null;
  stopped: boolean;
  spend: Spend | null;
  allows: string[];
  factories: FactoryLevel[];
  trust: string | null;
};

/**
 * The command a person runs once to trust her folder, which her session's harness refuses to start in until they do: accepted at its
 * prompt and exited, it is the one approval her harness asks; it offers no program a way to give it.
 */
export const trustCommand = (home: string): string => `mkdir -p ${nemiaDir(home)} && cd ${nemiaDir(home)} && ${DEFAULT_HARNESS}`;

/**
 * How a person reaches her session `sessionId`: attached on this machine, then through its web link (`bridge`) where it is up, or why it
 * is not where it was asked; nothing more where it was not.
 */
const reachOf = (sessionId: string | null, bridge: Bridge | null): string[] => {
  if (sessionId === null) return [];
  const attach = `${DEFAULT_HARNESS} attach ${sessionId.slice(0, 8)}`;
  if (bridge === null) return [attach];
  return [attach, bridge.url ?? `her web link is not up: ${bridge.why ?? 'its bridge says nothing'}`];
};

/** What her sessions cost, off her task's view: a `Spend`, its share of the step's (`taskSpend`). */
const spendOf = (view: Parameters<typeof taskSpend>[0]): Spend | null => {
  const spent = taskSpend(view);
  return spent === undefined ? null : { usd: spent.usd, measured: spent.measured, unmeasured: spent.unmeasured };
};

/** Where she is, off the level files and her task's view. */
const levelNow = (e: Engine) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const file = yield* tried(() => readLevel(home));
    const factories = yield* levelsNow();
    const above = factories.some((row) => row.level !== 'manual');
    const view = file?.task === undefined ? undefined : yield* asked('view', e.view(file.task));
    const filed = view !== undefined && Boolean(view.state.filedAt);
    const sessionId = filed ? view.sessionId : null;
    const open = filed && !view.state.settled;
    const bridge = open ? bridgeOf(new Map([[view.id, view]]))(view.id) : null;
    return {
      level: file?.level ?? 'manual',
      since: file?.since ?? null,
      task: file?.task ?? null,
      phase: filed ? view.phase : null,
      sessionId,
      reach: open ? reachOf(sessionId, bridge) : [],
      bridge,
      stopped: above && filed && (Boolean(view.state.settled) || view.state.stopRequested),
      spend: filed ? spendOf(view) : null,
      allows: yield* tried(() => promptAllows(home)),
      factories,
      trust: trustedFolder(DEFAULT_HARNESS, nemiaDir(home)) === false ? trustCommand(home) : null,
    } satisfies NemiaLevel;
  });

/**
 * The store's level file once the store's level is `level` (the same where only a factory changes, `storeSet` false) and some factory is
 * above `manual` or none (`above`), after `now`; undefined where nothing of it changes. Above `manual`, her task is kept where it is open
 * or not yet filed and some factory already was, and a fresh one named otherwise, whatever her folder's trust, which the keeper reads; at
 * none, the task stays named, so the keeper stops it.
 */
function storeAsked(level: Level, storeSet: boolean, above: boolean, now: NemiaLevel, at: string): LevelFile | undefined {
  const since = storeSet && level !== now.level ? at : (now.since ?? at);
  if (!above) return storeSet ? { level, since: at, ...(now.task === null ? {} : { task: now.task }) } : undefined;
  const wasAbove = now.factories.some((row) => row.level !== 'manual');
  if (wasAbove && now.task !== null && !now.stopped) return storeSet ? { level, since, task: now.task } : undefined;
  return { level, since, task: nemiaTaskId(at) };
}

/** The factory's file a person's write asks for at `at`, or refused: no such factory (`Missing`), no raise to end, a raise of nothing. */
const factoryFileAsked = (ask: FactoryAsk, store: Level, at: Date): Effect.Effect<FactoryLevelFile, Refusal> =>
  Effect.gen(function* () {
    const door = yield* FactoryDoor;
    if (!(yield* door.factories.list()).includes(ask.factory))
      return yield* Effect.fail(
        new Missing({ message: `no factory is named ${ask.factory}: nemia factory ls lists the store's factories. Nothing was written.` }),
      );
    const current = yield* door.level.read(FactoryName.read(ask.factory)).pipe(Effect.catch(() => Effect.succeed(undefined)));
    const asked = factoryAsked(ask, current, store, at);
    if ('conflict' in asked) return yield* Effect.fail(new Conflict({ message: `${asked.conflict} Nothing was written.` }));
    if ('invalid' in asked) return yield* Effect.fail(new Invalid({ message: `${asked.invalid} Nothing was written.` }));
    return asked.file;
  });

/** What `nemia level` takes: the store's level, or a factory's, raised for a stretch or its raise ended (`objects`' `NemiaLevelSet`). */
export type LevelInput = typeof NemiaLevelSet.Type;

/** The factory write `args` asks for, or undefined where they ask the store's level or nothing. */
const factoryAskOf = (args: LevelInput): FactoryAsk | undefined =>
  args.factory === undefined || (args.level === undefined && args.end !== true)
    ? undefined
    : {
        factory: args.factory,
        ...(args.level === undefined ? {} : { level: args.level }),
        ...(args.for === undefined ? {} : { forMs: durationOf(args.for) }),
        ...(args.end === true ? { end: true } : {}),
      };

/**
 * `nemia level`'s handler: where she is, after the level asked is written, where one is; refused (`Invalid`) as `factoryArgsRefusal`
 * refuses, so a caller that runs no `check` is refused the same. Her task is named in the store's file first, then
 * the factory's file written: a failure between them leaves a task named and nothing above `manual`, which the keeper leaves alone.
 */
const levelBy = (args: LevelInput, home: string) =>
  Effect.gen(function* () {
    const wrong = factoryArgsRefusal(args);
    if (wrong !== null) return yield* Effect.fail(new Invalid({ message: wrong }));
    const e = yield* EngineService;
    const now = yield* levelNow(e);
    const factory = factoryAskOf(args);
    const asked = factory === undefined ? args.level : undefined;
    const storeSet = asked !== undefined;
    if (factory === undefined && !storeSet) return now;
    const at = new Date();
    const store = asked ?? now.level;
    const file = factory === undefined ? undefined : yield* factoryFileAsked(factory, now.level, at);
    const changed = factory === undefined || file === undefined ? undefined : { factory: factory.factory, file };
    const above = levelsAfter(now.factories, store, changed, at.getTime(), DEFAULT_NAMESPACE).some((row) => row.level !== 'manual');
    const storeFile = yield* tried(() => storeAsked(store, storeSet, above, now, at.toISOString()));
    if (storeFile !== undefined) yield* tried(() => writeLevel(home, storeFile));
    if (changed !== undefined)
      yield* Effect.flatMap(FactoryDoor, (door) => door.level.write(FactoryName.read(changed.factory), changed.file));
    return yield* levelNow(e);
  });

/**
 * The refusal of a factory write's arguments, or null: `--for` or `--end` with no factory, a raise with no level, an end with one, both,
 * the default factory named (the store's level is its own), and a stretch that is none (`durationRefusal`).
 */
function factoryArgsRefusal(args: Args): string | null {
  const level = typeof args.level === 'string';
  const given = typeof args.for === 'string';
  if ((given || args.end === true) && typeof args.factory !== 'string')
    return `--for and --end take the factory raised, --factory <name>: ${LEVEL_FORM}.`;
  if (given && args.end === true) return `--for raises a factory and --end ends its raise: give one, ${LEVEL_FORM}.`;
  if (given && !level)
    return `--for takes the level the factory is raised to: nemia level semi-auto --factory ${String(args.factory)} --for ${String(args.for)}.`;
  if (args.end === true && level)
    return `--end takes no level, it ends the raise in force: nemia level --factory ${String(args.factory)} --end.`;
  if (args.factory === DEFAULT_NAMESPACE)
    return `the default factory's level is the store's own, set with no --factory: nemia level ${level ? String(args.level) : '<level>'}.`;
  return given ? (durationRefusal(String(args.for)) ?? null) : null;
}

/**
 * `nemia level`: bare, where Nemia is; `auto`, `semi-auto` or `manual`, the store's level, or with `--factory` a factory's default, raised
 * for a stretch with `--for`, its raise ended with `--end`: the levels the keeper acts on. Refused: a word that is no level, arguments that
 * ask no write (`Invalid`); no such factory (`Missing`); a raise that raises nothing over the factory's default
 * (`Invalid`); an end with no raise in force (`Conflict`); a level file that does not read (`Invalid`). Never refused for her folder's
 * trust: her session waits for it, and `trust` names the command that gives it.
 */
export const LEVEL: Served<NemiaLevel, LevelInput> = {
  ...LEVEL_WORDS,
  input: NemiaLevelSet,
  handler: (args) => Effect.flatMap(StoreRoot, (home) => levelBy(args, home)),
};
