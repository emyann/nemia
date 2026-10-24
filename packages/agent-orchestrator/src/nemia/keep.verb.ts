/**
 * The keeper of Nemia: each beat, the levels read again (`levelsNow`), her task read off the engine and her subscription off the store, and
 * what is owed done (`nemiaDue`) — her task filed long-lived while any factory is above `manual`, her subscription put once it is open with
 * her floor (`NEMIA_FLOOR`), both taken away once none is, whether a level set or a raise's end made it so; and while she is kept, the
 * person's custom words said to her open task (`sayCustom`) once they are not those she was last filed or told with (`customChanged`),
 * which are recorded, and her instruction written, only after she was told: a change to her builtin instruction alone tells her nothing;
 * and while she is kept and her session live, the person's chat words said to her (`sayOutbox`), the questions her session holds open
 * written down (`recordAsks`) and the person's answers to them carried to her (`answersDue`). Level-triggered: it carries nothing between
 * beats, so a restart owes what the files and the engine say. A task stopped from outside is never filed again.
 *
 * A controller: it reaches the runtime through the client (`EngineService`), run by `up` (`daemon/up.verb.ts`) beside the deliverer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Metric, type Duration } from 'effect';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { ownOf } from '../tick/told.verb.ts';
import { factoryMounts } from '../factory/factory.ts';
import type { Mount } from '../record/record.ts';
import { readFactories } from '../factory/factory.store.ts';
import { feedSize } from '../feed/feed.store.ts';
import { dropSubscription, listSubscriptions, putSubscription } from '../subscription/subscription.store.ts';
import { EngineService, asked, over, trustedFolder, type Engine } from '../runtime-client.ts';
import { answersDue, answersOwed, closesOwed, sayOutbox, outboxOwed, recordAsks } from '../chat/say.verb.ts';
import { upOf } from '../chat/chat.ts';
import {
  composePrompt,
  filedPrompt,
  memoryDir,
  nemiaCustom,
  nemiaDir,
  ownBin,
  promptAllows,
  readLevel,
  readNemia,
  readTold,
  SHIPPED_NEMIA,
  storeDenies,
  writePrompt,
  writeTold,
} from './level.store.ts';
import { nemiaFence, widened } from '../admission/index.ts';
import { TABLE } from '../command/commands.verb.ts';
import { daemonFile, parseDaemonFile } from '../daemon/daemon.store.ts';
import { levelsNow } from '../level/levels.verb.ts';
import {
  NEMIA_DIGEST_EVERY,
  NEMIA_FLOOR,
  NEMIA_SUBSCRIPTION,
  NEMIA_SELECTORS,
  customChanged,
  nemiaDue,
  nemiaPrompt,
  nemiaSettings,
  nemiaState,
  toldCustom,
  type HerSubscription,
  type HerTask,
  type NemiaAct,
} from './nemia.ts';

/** What the keeper did, each act counted once done. */
export const NEMIA_ACTS = Metric.counter('nemia.acts', {
  description: "the keeper's acts on Nemia's session: filed, subscribed, stopped, dropped, her custom words said, the outbox said",
});

/** How often the keeper reads the level, her task and her subscription again. */
export type KeepOptions = { every: Duration.Input };

/** The keeper's pace when it is given none. */
export const KEEP_DEFAULTS: KeepOptions = { every: '5 seconds' };

/** Her priority among the tasks waiting for a slot: above every step, so the person's agent is never queued behind the work. */
const NEMIA_PRIORITY = 1_000_000;

/**
 * Where the store's quota is read, `<url>/api/quota` at the address its daemon's api serves (`daemon.json`); undefined with no daemon, one
 * stopped, one serving no board (`nemia up`), or a file that does not read.
 */
const quotaUrl = (): string | undefined => {
  try {
    const held = parseDaemonFile(fs.readFileSync(daemonFile(), 'utf8'));
    return held?.url !== undefined && held.stoppedAt === undefined ? `${held.url}/api/quota` : undefined;
  } catch {
    return undefined;
  }
};

/** The call that reads the quota at `quota`, allowed her unasked: a read of the daemon's own api. */
export const quotaCall = (quota: string): string => `curl -s ${quota}`;

/** What her session is told first, once filed, and how she reads the quota at `quota`, where the daemon serves one. */
const nemiaBrief = (quota: string | undefined): string =>
  [
    'You are on. Read your memory, then wait: the feed is said to you when it needs the person, and the person may open you.',
    "At auto, `nemia policy nemia` lists the answers the person's confirmed rules let you give unasked; propose rules from their custom",
    'instruction with `nemia policy propose nemia --file -`.',
    ...(quota === undefined ? [] : [`The quota and its pace: \`${quotaCall(quota)}\`.`]),
  ].join(' ');

/** Each factory's folders, read-only: what she reads of the work and never writes. A factory that does not read is left out. */
const factoryFolders = (): Mount[] => {
  const repos = readFactories().flatMap((f) => ('repos' in f ? f.repos : []));
  return factoryMounts({ repos }, undefined);
};

/**
 * Her task as the engine is asked to file it under `id`: long-lived (`restartPolicy: 'Always'`), on the Agent SDK, bridged, in her
 * folder, by her definition; with her fence derived from the command table (`nemiaFence`), less each prompt the person allowed in her
 * folder (`widened`, `promptAllows`), the store's denies (`storeDenies`) and the daemon's own bin first on her path (`ownBin`) in the
 * harness's settings, and her admission (`nemia admit`, with her floor and her rules for auto) asked before each of her shell calls. A
 * prompt allowed while she runs is widened the next time she is filed.
 */
export function nemiaSpec(id: string): Parameters<Engine['file']>[0] {
  const step = readNemia();
  const prompt = composePrompt(step.body);
  const memory = `Edit(/${memoryDir()}/**)`;
  const quota = quotaUrl();
  const fence = widened(nemiaFence(TABLE), promptAllows());
  const bin = ownBin();
  const settings = nemiaSettings({ ask: fence.ask, deny: [...fence.deny, ...storeDenies()] }, bin, process.env.PATH ?? '');
  return {
    id,
    brief: nemiaBrief(quota),
    cwd: nemiaDir(),
    harness: step.harness ?? DEFAULT_HARNESS,
    restartPolicy: 'Always',
    priority: NEMIA_PRIORITY,
    config: {
      ...(step.model === undefined ? {} : { model: step.model }),
      permissionMode: step.permissionMode,
      mayAsk: true,
      ...(step.disallowedTools === undefined ? {} : { disallowedTools: step.disallowedTools }),
      allowedTools: [...(step.allowedTools ?? []), ...fence.allow, memory, ...(quota === undefined ? [] : [`Bash(${quotaCall(quota)})`])],
      callAdmission: {
        command: [bin === undefined ? 'nemia' : path.join(bin, 'nemia'), 'admit', '--at-least', NEMIA_FLOOR, '--auto', 'nemia'],
        tools: ['Bash'],
      },
      mounts: factoryFolders(),
      ...ownOf(
        { harness: step.harness, remote: true },
        { appendSystemPromptFile: prompt, pluginDir: [SHIPPED_NEMIA], settings },
        () => undefined,
      ),
    },
  };
}

/** Her task `id` filed, warned of where no nemia of the daemon's is first on her path. */
const fileHer = (e: Engine, id: string) =>
  Effect.gen(function* () {
    if (ownBin() === undefined)
      yield* Effect.logWarning(`Nemia is filed with no nemia of the daemon's first on her path: none links ${SHIPPED_NEMIA}/../bin.`);
    yield* asked('file', e.file(nemiaSpec(id)));
  });

/**
 * Her open task `id` told the person's custom words as they read now (`toldCustom`), and only once the runtime took them, her instruction
 * written with them, so an attempt it starts again reads them too, and the words recorded as told: words she was not told are never
 * written as hers.
 */
const sayCustom = (e: Engine, id: string) =>
  Effect.gen(function* () {
    const custom = nemiaCustom();
    yield* asked('say', e.say(id, toldCustom(custom)));
    writePrompt(nemiaPrompt(readNemia().body, custom));
    writeTold(custom);
  });

/** Each act the keeper owes on her task `id`: a stop or a drop already done by another is no failure. */
const ACTS: Record<NemiaAct, (e: Engine, id: string) => Effect.Effect<void>> = {
  file: fileHer,
  stop: (e, id) => asked('stop', e.stop(id).pipe(Effect.catchTag('StopRefused', () => Effect.void))),
  subscribe: (_e, id) =>
    Effect.sync(() =>
      putSubscription(NEMIA_SUBSCRIPTION, {
        task: id,
        selectors: [...NEMIA_SELECTORS],
        digestEvery: NEMIA_DIGEST_EVERY,
        from: feedSize(),
        scope: { atLeast: NEMIA_FLOOR },
      }),
    ),
  drop: () =>
    Effect.sync(() => {
      if (listSubscriptions().some((s) => s.name === NEMIA_SUBSCRIPTION)) dropSubscription(NEMIA_SUBSCRIPTION);
    }),
  sayCustom,
  sayOutbox: (e, id) => sayOutbox(id, nemiaDir()).pipe(over(e), Effect.asVoid),
  record: (e, id) => recordAsks(id, nemiaDir()).pipe(over(e), Effect.asVoid),
  answer: (e, id) => answersDue(id, nemiaDir()).pipe(over(e), Effect.asVoid),
};

/** One act owed on her task `id`, counted once done. */
const act = (e: Engine, id: string, owed: NemiaAct) => ACTS[owed](e, id).pipe(Effect.andThen(Metric.update(NEMIA_ACTS, 1)));

/**
 * Her task's record off the engine, undefined where none is filed under `id`, whether her session is live (`upOf`), whether it
 * holds a question open on the person (`asking`, off the view's `asks`) and whether the chat holds one whose mark no longer says what
 * became of its call (`closing`, `closesOwed` read against the same view).
 */
const herTask = (e: Engine, id: string | undefined) =>
  Effect.gen(function* () {
    if (id === undefined) return { task: undefined, up: false, asking: false, closing: false };
    const { state, phase, asks } = yield* asked('view', e.view(id));
    if (!state.filedAt) return { task: undefined, up: false, asking: false, closing: false };
    return {
      task: { settled: Boolean(state.settled), stopRequested: state.stopRequested } satisfies HerTask,
      up: upOf(phase),
      asking: (asks ?? []).length > 0,
      closing: closesOwed(nemiaDir(), asks),
    };
  });

/** Her subscription as the keeper reads it: the task it tells and whether it carries her floor, or undefined where there is none. */
const herSubscription = (): HerSubscription | undefined => {
  const sub = listSubscriptions().find((s) => s.name === NEMIA_SUBSCRIPTION)?.subscription;
  return sub === undefined ? undefined : { task: sub.task, scoped: sub.scope?.atLeast === NEMIA_FLOOR };
};

/**
 * One beat: the levels, her task, her subscription and her folder's trust read (`trustedFolder`, so no task is filed where her harness
 * would refuse its start), and, while she is kept, the person's custom words against those she was last
 * filed or told with (`customChanged`); each act owed done in order. Answers the acts done.
 */
export const keepOnce = Effect.fn('keepOnce')(function* () {
  const e = yield* EngineService;
  const id = readLevel()?.task;
  const above = (yield* levelsNow()).some((row) => row.level !== 'manual');
  const { task, up, asking, closing } = yield* herTask(e, id);
  const trusted = trustedFolder(DEFAULT_HARNESS, nemiaDir());
  const keeping = { above, ...(id === undefined ? {} : { task: id }), ...(trusted === undefined ? {} : { trusted }) };
  const subscribed = herSubscription();
  const kept = nemiaState(keeping, task, subscribed) === 'kept';
  const stale = kept && customChanged(readTold(), nemiaCustom(), filedPrompt());
  const owed = nemiaDue(
    { ...keeping, stale, up, asking, closing, owed: kept && outboxOwed(nemiaDir()), answered: kept && answersOwed(nemiaDir()) },
    task,
    subscribed,
  );
  for (const one of owed) if (id !== undefined || one === 'drop') yield* act(e, id ?? '', one);
  return owed;
});

/** The keeper, for as long as it runs: a beat each `every`; a beat that fails is a warning, and the next is tried a beat later. */
export const keep = (options: Partial<KeepOptions> = {}): Effect.Effect<never, never, EngineService> => {
  const o = { ...KEEP_DEFAULTS, ...options };
  const beat = Effect.suspend(() => keepOnce()).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`Nemia could not be kept this beat: ${Cause.pretty(cause)}`)),
  );
  return Effect.forever(beat.pipe(Effect.andThen(Effect.sleep(o.every))));
};
