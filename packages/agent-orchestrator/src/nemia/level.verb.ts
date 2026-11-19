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
import { durationOf, durationRefusal, factoryAsked, type FactoryAsk, type FactoryLevel, type FactoryLevelFile } from '../level/level.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { FactoryDoor } from '../factory/door/factories.store.ts';
import { levelsNow } from '../level/levels.verb.ts';
import { EngineService, asked, tried, trustedFolder, type Engine } from '../runtime-client.ts';
import { taskSpend, type Spend } from '../status/status.ts';
import { bridgeOf, type Bridge } from '../views/views.verb.ts';
import type { EnginePhase } from '../views/views-words.ts';
import { herTasks, nemiaDir, promptAllows, readLevel, readSession, readUntrusted, writeLevel } from './level.store.ts';
import { LEVEL_FORM, type Level, type LevelFile } from './nemia.ts';

/**
 * Where Nemia is, as `nemia level` answers: the store's `level` and since when; each factory's level (`factories`), the default factory
 * first; her task, its phase and its session where one is filed; how a person reaches her session (`reach`), and her session's web link
 * where it was asked (`bridge`, null where not; `bridgeOf`); whether her task ended with no rest of the keeper's (`stopped`, filed again on
 * the person's next word); whether no task of hers is open and a message in her chat would start one (`rests`); what her sessions cost
 * (`spend`, counted as each ends, as a step's; null where none is filed); and the allow rules a person gave her at a prompt (`allows`); and
 * why the keeper could not trust her folder, naming the fix (`untrusted`, the keeper's record), null where her harness trusts it or keeps
 * no trust, or where the keeper's write was not refused: the keeper trusts her own folder itself before it files her, and no person runs a
 * command for it.
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
  rests: boolean;
  spend: Spend | null;
  allows: string[];
  factories: FactoryLevel[];
  untrusted: string | null;
};

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

/** Why the keeper could not trust her folder, off its record, while her folder is still not trusted; null otherwise. */
const untrustedNow = (home: string): string | null =>
  trustedFolder(DEFAULT_HARNESS, nemiaDir(home)) === false ? (readUntrusted(home) ?? null) : null;

/** Where she is, off the level files, the keeper's record of her session and her current task's view. */
const levelNow = (e: Engine) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const file = yield* tried(() => readLevel(home));
    const task = (yield* tried(() => herTasks(home))).at(-1);
    const rested = (yield* tried(() => readSession(home)))?.rested !== undefined;
    const factories = yield* levelsNow();
    const view = task === undefined ? undefined : yield* asked('view', e.view(task));
    const filed = view !== undefined && Boolean(view.state.filedAt);
    const sessionId = filed ? view.sessionId : null;
    const open = filed && !view.state.settled;
    const ended = filed && (Boolean(view.state.settled) || view.state.stopRequested);
    const bridge = open ? bridgeOf(new Map([[view.id, view]]))(view.id) : null;
    const untrusted = yield* tried(() => untrustedNow(home));
    return {
      level: file?.level ?? 'manual',
      since: file?.since ?? null,
      task: task ?? null,
      phase: filed ? view.phase : null,
      sessionId,
      reach: open ? reachOf(sessionId, bridge) : [],
      bridge,
      stopped: ended && !rested,
      rests: !(open && !view.state.stopRequested) && untrusted === null,
      spend: filed ? spendOf(view) : null,
      allows: yield* tried(() => promptAllows(home)),
      factories,
      untrusted,
    } satisfies NemiaLevel;
  });

/**
 * The store's level file once the person set a level at `at`, the store's (`level`) or a factory's (`level` the store's as it is):
 * `since` moved where the store's level changed, `asked` always, and a former task the file named carried on as it is read.
 */
function storeAsked(level: Level, now: NemiaLevel, former: LevelFile | undefined, at: string): LevelFile {
  const since = level !== now.level || now.since === null ? at : now.since;
  return { level, since, asked: at, ...(former?.task === undefined ? {} : { task: former.task }) };
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
 * refuses, so a caller that runs no `check` is refused the same. The store's file is written first, saying when the person set a level
 * (`asked`), then the factory's: a failure between them leaves a set the keeper reads as the person speaking and no level changed.
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
    const former = yield* tried(() => readLevel(home));
    yield* tried(() => writeLevel(home, storeAsked(store, now, former, at.toISOString())));
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
 * trust: the keeper gives it, and `untrusted` says why where its write was refused.
 */
export const LEVEL: Served<NemiaLevel, LevelInput> = {
  ...LEVEL_WORDS,
  input: NemiaLevelSet,
  handler: (args) => Effect.flatMap(StoreRoot, (home) => levelBy(args, home)),
};
