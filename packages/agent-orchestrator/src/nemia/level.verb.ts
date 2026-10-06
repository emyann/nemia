/**
 * `nemia level`: the person's switch for Nemia, an entry of the command table. Bare, where she is: her level, her session's phase, how to
 * reach it, and what a person allowed her at a prompt beyond what ships. Given `semi-auto` or `manual`, the level written for the keeper
 * (`keep.verb.ts`) to act on at its next beat. The api serves the write on the route the table generates, and the read by a route of its
 * own, which calls the same handler.
 */
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { Conflict } from '../refusal/refusal.ts';
import { EngineService, asked, tried, trustedFolder, type Engine } from '../runtime-client.ts';
import { dollars, taskSpend, type Spend } from '../status/status.ts';
import { nemiaDir, promptAllows, readLevel, writeLevel } from './level.store.ts';
import { LEVEL_FORM, LEVELS, levelRefusal, nemiaTaskId, type Level, type LevelFile } from './nemia.ts';

/**
 * Where Nemia is, as `nemia level` answers: her `level` and since when; her task, its phase and its session where one is filed; how a
 * person reaches her session (`reach`); whether her task was stopped from outside (`stopped`); what her sessions cost (`spend`, counted as
 * each ends, as a step's; null where none is filed); and the allow rules a person gave her at a prompt (`allows`).
 */
export type NemiaLevel = {
  level: Level;
  since: string | null;
  task: string | null;
  phase: string | null;
  sessionId: string | null;
  reach: string[];
  stopped: boolean;
  spend: Spend | null;
  allows: string[];
};

/** The command a person runs once to trust her folder, which her session's harness refuses to start in until they do. */
export const trustCommand = (): string => `mkdir -p ${nemiaDir()} && cd ${nemiaDir()} && ${DEFAULT_HARNESS}`;

/** How a person reaches her session `sessionId`, as measured: attached on this machine, or through the link its bridge shows. */
const reachOf = (sessionId: string | null): string[] =>
  sessionId === null
    ? []
    : [`${DEFAULT_HARNESS} attach ${sessionId.slice(0, 8)}`, 'or the web link her session shows once its bridge is up, from a phone too'];

/** What her sessions cost, off her task's view: a `Spend`, its share of the step's (`taskSpend`). */
const spendOf = (view: Parameters<typeof taskSpend>[0]): Spend | null => {
  const spent = taskSpend(view);
  return spent === undefined ? null : { usd: spent.usd, measured: spent.measured, unmeasured: spent.unmeasured };
};

/** Where she is, off the level file and her task's view. */
const levelNow = (e: Engine) =>
  Effect.gen(function* () {
    const file = yield* tried(readLevel);
    const view = file?.task === undefined ? undefined : yield* asked('view', e.view(file.task));
    const filed = view !== undefined && Boolean(view.state.filedAt);
    const sessionId = filed ? view.sessionId : null;
    return {
      level: file?.level ?? 'manual',
      since: file?.since ?? null,
      task: file?.task ?? null,
      phase: filed ? view.phase : null,
      sessionId,
      reach: filed && !view.state.settled ? reachOf(sessionId) : [],
      stopped: file?.level === 'semi-auto' && filed && (Boolean(view.state.settled) || view.state.stopRequested),
      spend: filed ? spendOf(view) : null,
      allows: yield* tried(promptAllows),
    } satisfies NemiaLevel;
  });

/**
 * The level file `level` asks for, after `now`: at `semi-auto`, the file there is where it names a task still open or not yet filed, and
 * a fresh task otherwise; at `manual`, the task kept named so the keeper stops it. Refused (`Conflict`): `semi-auto` while her folder is
 * not trusted, naming the command that trusts it.
 */
const levelAsked = (level: Level, now: NemiaLevel, at: string): LevelFile => {
  if (level === 'manual') return { level, since: at, ...(now.task === null ? {} : { task: now.task }) };
  if (trustedFolder(DEFAULT_HARNESS, nemiaDir()) === false)
    throw new Conflict({
      message: `Nemia's folder ${nemiaDir()} is not trusted, and her session would be refused at its start. Trust it once: ${trustCommand()}, accept the prompt and exit; then nemia level semi-auto.`,
    });
  const kept = now.level === 'semi-auto' && now.task !== null && !now.stopped;
  return kept ? { level, since: now.since!, task: now.task! } : { level, since: at, task: nemiaTaskId(at) };
};

/** `nemia level`'s handler: where she is, after the level asked is written, where one is. */
const levelBy = (args: Args) =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    const asked = typeof args.level === 'string' ? (args.level as Level) : undefined;
    const now = yield* levelNow(e);
    if (asked === undefined) return now;
    const file = yield* tried(() => levelAsked(asked, now, new Date().toISOString()));
    yield* tried(() => writeLevel(file));
    return yield* levelNow(e);
  });

/** What her sessions cost, as `nemia level` says it: each counted as it ends, her open one not yet. */
const spendLine = ({ usd, measured, unmeasured }: Spend): string =>
  `spent ${dollars(usd)} over ${measured} session${measured === 1 ? '' : 's'} ended${unmeasured ? `, ${unmeasured} not measured` : ''}; her open one counts once it ends`;

/** What `nemia level` prints of where she is. */
function levelLines(data: NemiaLevel): string[] {
  const head = `Nemia: ${data.level}${data.since === null ? '' : ` since ${data.since}`}`;
  const session =
    data.task === null
      ? []
      : data.phase === null
        ? [`her session ${data.task}: not filed yet, the keeper files it at its next beat (nemia up, or the api, keeps her)`]
        : [`her session ${data.task}: ${data.phase}`];
  const spent = data.spend === null ? [] : [spendLine(data.spend)];
  const stopped = data.stopped ? ['it was stopped from outside and is not filed again: nemia level semi-auto starts a fresh one'] : [];
  const reach = data.reach.length ? ['reach her:', ...data.reach.map((line) => `  ${line}`)] : [];
  const allows = data.allows.length
    ? ['allowed at a prompt, beyond what ships (her folder’s local settings):', ...data.allows.map((rule) => `  ${rule}`)]
    : [];
  return [head, ...session, ...spent, ...stopped, ...reach, ...allows];
}

/**
 * `nemia level`: bare, where Nemia is; `semi-auto` or `manual`, the level the keeper acts on. Refused: a word that is no level, `auto`
 * named as to come (`Invalid`); `semi-auto` while her folder is untrusted (`Conflict`); a level file that does not read (`Invalid`).
 */
export const LEVEL: Command<NemiaLevel> = {
  name: 'level',
  usage: '[manual|semi-auto]',
  help: [
    "Nemia, the store's own agent: bare, where she is and how to reach her;",
    'semi-auto keeps her session, every write she proposes asked of you;',
    'manual stops it',
  ],
  spec: {
    positionals: [{ key: 'level', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia level takes one level, not ${arg}: ${LEVEL_FORM}.`,
  },
  check: (args) => (typeof args.level === 'string' ? (levelRefusal(args.level) ?? null) : null),
  writes: true,
  nemia: { bare: 'read', sets: 'prompts', setsBy: LEVELS },
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
