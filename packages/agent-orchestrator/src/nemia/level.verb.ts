/**
 * `nemia level`: the person's switch for Nemia, an entry of the command table. Bare, where she is: the store's level and each factory's,
 * her session's phase, how to reach it, and what a person allowed her at a prompt beyond what is built in. Given `auto`, `semi-auto` or
 * `manual`, the store's level, or with `--factory` a factory's default, a raise of it for a stretch (`--for`) or the raise ended
 * (`--end`), written for the keeper (`keep.verb.ts`) to act on at its next beat. The api serves the write on the route the table
 * generates, and the read by a route of its own, which calls the same handler.
 */
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { factoryNames } from '../factory/factory.store.ts';
import {
  durationOf,
  durationRefusal,
  factoryAsked,
  factoryLevelWords,
  levelsAfter,
  type FactoryAsk,
  type FactoryLevel,
  type FactoryLevelFile,
} from '../level/level.ts';
import { readFactoryLevel, writeFactoryLevel } from '../level/level.store.ts';
import { levelsNow } from '../level/levels.verb.ts';
import { EngineService, asked, tried, trustedFolder, type Engine } from '../runtime-client.ts';
import { dollars, taskSpend, type Spend } from '../status/status.ts';
import { bridgeOf, type Bridge } from '../views/views.verb.ts';
import type { EnginePhase } from '../views/views-words.ts';
import { nemiaDir, promptAllows, readLevel, writeLevel } from './level.store.ts';
import { LEVEL_FORM, LEVELS, levelRefusal, nemiaTaskId, type Level, type LevelFile } from './nemia.ts';

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
export const trustCommand = (): string => `mkdir -p ${nemiaDir()} && cd ${nemiaDir()} && ${DEFAULT_HARNESS}`;

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
    const file = yield* tried(readLevel);
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
      allows: yield* tried(promptAllows),
      factories,
      trust: trustedFolder(DEFAULT_HARNESS, nemiaDir()) === false ? trustCommand() : null,
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
function factoryFileAsked(ask: FactoryAsk, store: Level, at: Date): FactoryLevelFile {
  if (!factoryNames().includes(ask.factory))
    throw new Missing({
      message: `no factory is named ${ask.factory}: nemia factory ls lists the store's factories. Nothing was written.`,
    });
  let current: FactoryLevelFile | undefined;
  try {
    current = readFactoryLevel(ask.factory);
  } catch {
    current = undefined;
  }
  const asked = factoryAsked(ask, current, store, at);
  if ('conflict' in asked) throw new Conflict({ message: `${asked.conflict} Nothing was written.` });
  if ('invalid' in asked) throw new Invalid({ message: `${asked.invalid} Nothing was written.` });
  return asked.file;
}

/** The factory write `args` asks for, or undefined where they ask the store's level or nothing. */
const factoryAskOf = (args: Args): FactoryAsk | undefined =>
  typeof args.factory !== 'string' || (args.level === undefined && args.end !== true)
    ? undefined
    : {
        factory: args.factory,
        ...(typeof args.level === 'string' ? { level: args.level as Level } : {}),
        ...(typeof args.for === 'string' ? { forMs: durationOf(args.for) } : {}),
        ...(args.end === true ? { end: true } : {}),
      };

/**
 * `nemia level`'s handler: where she is, after the level asked is written, where one is. Her task is named in the store's file first, then
 * the factory's file written: a failure between them leaves a task named and nothing above `manual`, which the keeper leaves alone.
 */
const levelBy = (args: Args) =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    const now = yield* levelNow(e);
    const factory = factoryAskOf(args);
    const storeSet = factory === undefined && typeof args.level === 'string';
    if (factory === undefined && !storeSet) return now;
    const at = new Date();
    const store = storeSet ? (args.level as Level) : now.level;
    const file = factory === undefined ? undefined : yield* tried(() => factoryFileAsked(factory, now.level, at));
    const changed = factory === undefined || file === undefined ? undefined : { factory: factory.factory, file };
    const above = levelsAfter(now.factories, store, changed, at.getTime(), DEFAULT_FACTORY).some((row) => row.level !== 'manual');
    const storeFile = yield* tried(() => storeAsked(store, storeSet, above, now, at.toISOString()));
    if (storeFile !== undefined) yield* tried(() => writeLevel(storeFile));
    if (changed !== undefined) yield* tried(() => writeFactoryLevel(changed.factory, changed.file));
    return yield* levelNow(e);
  });

/** What her sessions cost, as `nemia level` says it: each counted as it ends, her open one not yet. */
const spendLine = ({ usd, measured, unmeasured }: Spend): string =>
  `spent ${dollars(usd)} over ${measured} session${measured === 1 ? '' : 's'} ended${unmeasured ? `, ${unmeasured} not measured` : ''}; her open one counts once it ends`;

/** What `nemia level` prints of her folder not trusted: the command `trust` to run once, and what then follows. */
const trustLine = (trust: string): string =>
  `her folder is not trusted yet, and her session starts only once it is: run once in a terminal ${trust}, accept the prompt, then /exit; the keeper files her at its next beat`;

/** What `nemia level` prints of where she is. */
function levelLines(data: NemiaLevel): string[] {
  const head = `Nemia: the store at ${data.level}${data.since === null ? '' : ` since ${data.since}`}`;
  const factories = [
    'factories (a raise ends by itself, read as it passes):',
    ...data.factories.map((row) => `  ${factoryLevelWords(row, DEFAULT_FACTORY)}`),
  ];
  const session =
    data.task === null
      ? []
      : data.phase === null
        ? [
            `her session ${data.task}: not filed yet, ${data.trust === null ? 'the keeper files it at its next beat (nemia up, or the api, keeps her)' : 'it waits for her folder to be trusted'}`,
          ]
        : [`her session ${data.task}: ${data.phase}`];
  const spent = data.spend === null ? [] : [spendLine(data.spend)];
  const stopped = data.stopped ? ['it was stopped from outside and is not filed again: a level set above manual starts a fresh one'] : [];
  const trust = data.trust === null ? [] : [trustLine(data.trust)];
  const reach = data.reach.length ? ['reach her:', ...data.reach.map((line) => `  ${line}`)] : [];
  const allows = data.allows.length
    ? ['allowed at a prompt, beyond what is built in (her folder’s local settings):', ...data.allows.map((rule) => `  ${rule}`)]
    : [];
  return [head, ...factories, ...session, ...trust, ...spent, ...stopped, ...reach, ...allows];
}

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
  if (args.factory === DEFAULT_FACTORY)
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
export const LEVEL: Command<NemiaLevel> = {
  name: 'level',
  usage: '[manual|semi-auto|auto] [--factory <name> [--for <duration> | --end]]',
  help: [
    "Nemia, the store's own agent: bare, where she is, each factory's level and",
    "how to reach her; a level sets the store's, which every factory follows",
    "unless it has its own; --factory sets that factory's, --for raises it for",
    'a stretch (90m, 2h, 1d; up to 7d) and --end ends the raise. semi-auto keeps',
    "her session: what waits on you (a gate, a step's question, a loop out of",
    'rounds, a cap) is asked of you, and a write that cannot be undone or',
    'changes your settings or a factory; the rest is hers. auto is semi-auto,',
    "but an answer your confirmed list allows in the run's state is given",
    'unasked (nemia policy <agent>), in a session of hers filed since auto came:',
    'one kept from before asks every answer until filed again (manual, then',
    'auto once it is off). A factory at manual is left alone, and her session',
    'stops once none is above manual',
  ],
  spec: {
    positionals: [{ key: 'level', takes: 'optional', kind: 'name' }],
    flags: [
      { flag: '--factory', kind: 'name', key: 'factory', takes: `--factory takes the factory whose level is set: ${LEVEL_FORM}.` },
      { flag: '--for', kind: 'name', key: 'for', takes: `--for takes the stretch a raise lasts, like 2h: ${LEVEL_FORM}.` },
      { flag: '--end', kind: 'switch', key: 'end' },
    ],
    unknown: (arg) => `nemia level takes one level, not ${arg}: ${LEVEL_FORM}.`,
  },
  check: (args) => (typeof args.level === 'string' ? levelRefusal(args.level) : undefined) ?? factoryArgsRefusal(args),
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: [...LEVELS, '--factory', '--for', '--end'] },
  route: [
    {
      method: 'GET',
      path: '/api/level',
      status: 200,
      hand: 'a read of a command that writes: the api serves it by a route of its own, which calls the same handler',
    },
    { method: 'PUT', path: '/api/level', status: 200 },
  ],
  handler: levelBy,
  print: levelLines,
};
