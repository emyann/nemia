/**
 * The keeper of Nemia: each beat, the levels read again (`levelsNow`), her task read off the engine and her subscription off the store, and
 * what is owed done (`nemiaDue`) — her harness's trust given to her own folder where it is not, before she is filed in the same beat
 * (`trustHer`), the folder being Nemia's own, and why where that write is refused recorded for the person (`writeUntrusted`); her task
 * filed long-lived while any factory is above `manual`, her subscription put once it is open with her floor (`NEMIA_FLOOR`), both taken
 * away once none is, whether a level set or a raise's end made it so; and while she is kept, the person's custom words said to her open
 * task (`sayCustom`) once they are not those she was last filed or told with (`customChanged`), which are recorded, and her instruction
 * written, only after she was told: a change to her builtin instruction alone tells her nothing; and while she is kept and her session
 * live, the person's chat words said to her (`sayOutbox`), the questions her session holds open written down (`recordAsks`) and the
 * person's answers to them carried to her (`answersDue`). Level-triggered: it carries nothing between beats, so a restart owes what the
 * files and the engine say. A task stopped from outside is never filed again.
 *
 * A controller: it reaches the runtime through the client (`EngineService`), run by `up` (`daemon/up.verb.ts`) beside the deliverer, and
 * her subscription through the Subscription door (`SubscriptionDoor`) and the person's custom words for her through the Agent door
 * (`AgentDoor`), each at the store root `up` is given.
 */
import { listedAtOnce } from '../factory/door/factories.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Metric, type Duration } from 'effect';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { ownOf } from '../tick/told.verb.ts';
import { factoryMounts } from '../factory/factory.ts';
import type { Mount } from '../record/record.ts';
import { FeedDoor } from '../feed/feed.store.ts';
import { SubscriptionDoor } from '../subscription/subscription.store.ts';
import { SubscriptionName } from '../feed/feed.model.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName } from '../agents/agents.model.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { EngineService, asked, folderTrust, over, trustedFolder, trustFolder, type Engine } from '../runtime-client.ts';
import { answersDue, answersOwed, closesOwed, sayOutbox, outboxOwed, recordAsks } from '../chat/say.verb.ts';
import { upOf } from '../chat/index.ts';
import {
  composePrompt,
  filedPrompt,
  memoryDir,
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
  writeUntrusted,
} from './level.store.ts';
import { nemiaFence, widened } from '../admission/index.ts';
import { TABLE } from '../command/commands.verb.ts';
import { daemonFile, parseDaemonFile } from '../daemon/daemon.store.ts';
import { levelsNow } from '../level/levels.verb.ts';
import { SESSION_TOKEN } from '../filed/filed.ts';
import { TokenDoor } from '../token/token.store.ts';
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
  folderUnmade,
  trustRefused,
  type HerSubscription,
  type HerTask,
  type NemiaAct,
} from './nemia.ts';

/** What the keeper did, each act counted once done. */
export const NEMIA_ACTS = Metric.counter('nemia.acts', {
  description:
    "the keeper's acts on Nemia's session: her folder trusted, filed, subscribed, stopped, dropped, her custom words said, the outbox said",
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
const quotaUrl = (home: string): string | undefined => {
  try {
    const held = parseDaemonFile(fs.readFileSync(daemonFile(home), 'utf8'));
    return held?.url !== undefined && held.stoppedAt === undefined ? `${held.url}/api/quota` : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The call that reads the quota at `quota`, allowed her unasked: a read of the daemon's own api.
 * @param quota The quota's URL, `<url>/api/quota` at the address the daemon's api serves.
 */
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
const factoryFolders = (home: string): Mount[] => {
  const volumes = listedAtOnce(home).flatMap((f) => ('volumes' in f ? f.volumes : []));
  return factoryMounts({ volumes }, undefined);
};

/**
 * Her task as the engine is asked to file it under `id`: long-lived (`restartPolicy: 'Always'`), on the Agent SDK, bridged, in her
 * folder, by her definition; with her fence derived from the command table (`nemiaFence`), less each prompt the person allowed in her
 * folder (`widened`, `promptAllows`), the store's denies (`storeDenies`) and the daemon's own bin first on her path (`ownBin`) in the
 * harness's settings, and her admission (`nemia admit`, with her floor and her rules for auto) asked before each of her shell calls. A
 * prompt allowed while she runs is widened the next time she is filed. Her instruction is composed with the person's custom words for
 * her, `custom` (`herCustom`), and her session token, minted as she is filed (`herToken`), is in her environment as `SESSION_TOKEN`.
 * @param id The id her task is filed under.
 * @param custom The person's custom words for her, or undefined where there are none.
 * @param token Her session token, minted as she is filed.
 * @param home The store's root folder.
 */
export function nemiaSpec(id: string, custom: string | undefined, token: string, home: string): Parameters<Engine['file']>[0] {
  const step = readNemia();
  const prompt = composePrompt(home, step.body, custom);
  const memory = `Edit(/${memoryDir(home)}/**)`;
  const quota = quotaUrl(home);
  const fence = widened(nemiaFence(TABLE), promptAllows(home));
  const bin = ownBin();
  const settings = nemiaSettings({ ask: fence.ask, deny: [...fence.deny, ...storeDenies(home)] }, bin, process.env.PATH ?? '');
  return {
    id,
    brief: nemiaBrief(quota),
    cwd: nemiaDir(home),
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
      mounts: factoryFolders(home),
      env: { [SESSION_TOKEN]: token },
      ...ownOf(
        { harness: step.harness, remote: true },
        { appendSystemPromptFile: prompt, pluginDir: [SHIPPED_NEMIA], settings },
        () => undefined,
      ),
    },
  };
}

/** Her name, as the Agent door takes it. */
const NEMIA = AgentName.read('nemia');

/**
 * The person's custom words for her, as the Agent door reads them with no place checked (she is the store's own agent, whom no place
 * names), or undefined where there are none.
 */
const herCustom = Effect.fnUntraced(function* () {
  return yield* (yield* AgentDoor).custom.read(NEMIA);
});

/**
 * Her session token for her task `id`, minted through the token door at the store's root the keeper is given: in no factory, since she
 * works in every one, and no run's; live while `id` is filed and unsettled (`liveSession`).
 */
const herToken = (id: string) =>
  Effect.flatMap(TokenDoor, (door) => door.tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task: id }));

/** Her task `id` filed, warned of where no nemia of the daemon's is first on her path. */
const fileHer = (e: Engine, id: string) =>
  Effect.gen(function* () {
    if (ownBin() === undefined)
      yield* Effect.logWarning(`Nemia is filed with no nemia of the daemon's first on her path: none links ${SHIPPED_NEMIA}/../bin.`);
    const custom = yield* herCustom();
    yield* asked('file', e.file(nemiaSpec(id, custom, yield* herToken(id), yield* StoreRoot)));
  });

/**
 * Her open task `id` told the person's custom words as they read now (`toldCustom`), and only once the runtime took them, her instruction
 * written with them, so an attempt it starts again reads them too, and the words recorded as told: words she was not told are never
 * written as hers.
 */
const sayCustom = (e: Engine, id: string) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const custom = yield* herCustom();
    yield* asked('say', e.say(id, toldCustom(custom)));
    writePrompt(home, nemiaPrompt(readNemia().body, custom));
    writeTold(home, custom);
  });

/**
 * Each act the keeper owes on her task `id`, but the trust of her folder (`trustHer`): a stop or a drop already done by another is no
 * failure.
 */
const ACTS: Record<Exclude<NemiaAct, 'trust'>, (e: Engine, id: string) => Effect.Effect<void, Refusal, StoreRoot>> = {
  file: fileHer,
  stop: (e, id) => asked('stop', e.stop(id).pipe(Effect.catchTag('StopRefused', () => Effect.void))),
  subscribe: (_e, id) =>
    Effect.gen(function* () {
      yield* (yield* SubscriptionDoor).subscriptions.put(HERS, {
        task: id,
        selectors: [...NEMIA_SELECTORS],
        digestEvery: NEMIA_DIGEST_EVERY,
        from: (yield* (yield* FeedDoor).lines.end())?.cursor ?? 0,
        scope: { atLeast: NEMIA_FLOOR },
      });
    }),
  drop: () =>
    Effect.gen(function* () {
      const door = yield* SubscriptionDoor;
      if ((yield* door.subscriptions.list()).listed.some((s) => s.name === NEMIA_SUBSCRIPTION)) yield* door.subscriptions.drop(HERS);
    }),
  sayCustom,
  sayOutbox: (e, id) => Effect.flatMap(StoreRoot, (home) => sayOutbox(id, nemiaDir(home))).pipe(over(e), Effect.asVoid),
  record: (e, id) => Effect.flatMap(StoreRoot, (home) => recordAsks(id, nemiaDir(home))).pipe(over(e), Effect.asVoid),
  answer: (e, id) => Effect.flatMap(StoreRoot, (home) => answersDue(id, nemiaDir(home))).pipe(over(e), Effect.asVoid),
};

/** One act owed on her task `id`, counted once done. */
const act = (e: Engine, id: string, owed: Exclude<NemiaAct, 'trust'>) =>
  ACTS[owed](e, id).pipe(Effect.andThen(Metric.update(NEMIA_ACTS, 1)));

/** The words of what the write of her folder's trust threw. */
const threwWords = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Her folder made, where it is not yet, and her harness's trust given to it (`trustFolder`), which is safe since the folder is Nemia's
 * own: the store makes it and only Nemia writes it. Why it is not given, where making the folder threw (`folderUnmade`) or the write
 * left it so or threw (`trustRefused`), recorded for the person (`writeUntrusted`), and the record taken away once it is. Answers whether
 * her folder is trusted now, counted where so.
 */
const trustHer = (home: string) =>
  Effect.gen(function* () {
    const dir = nemiaDir(home);
    const refused = ((): string | undefined => {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        return folderUnmade(dir, threwWords(err));
      }
      try {
        const given = trustFolder(DEFAULT_HARNESS, dir);
        return given === undefined || given.trusted ? undefined : trustRefused(given);
      } catch (err) {
        const asked = folderTrust(DEFAULT_HARNESS, dir);
        return trustRefused(
          { ...(asked ?? { harness: DEFAULT_HARNESS, folder: dir, file: '', never: null }), refused: null },
          threwWords(err),
        );
      }
    })();
    writeUntrusted(home, refused);
    if (refused === undefined) yield* Metric.update(NEMIA_ACTS, 1);
    return refused === undefined;
  });

/**
 * Her task's record off the engine, undefined where none is filed under `id`, whether her session is live (`upOf`), whether it
 * holds a question open on the person (`asking`, off the view's `asks`) and whether the chat holds one whose mark no longer says what
 * became of its call (`closing`, `closesOwed` read against the same view).
 */
const herTask = (e: Engine, id: string | undefined) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    if (id === undefined) return { task: undefined, up: false, asking: false, closing: false };
    const { state, phase, asks } = yield* asked('view', e.view(id));
    if (!state.filedAt) return { task: undefined, up: false, asking: false, closing: false };
    return {
      task: { settled: Boolean(state.settled), stopRequested: state.stopRequested } satisfies HerTask,
      up: upOf(phase),
      asking: (asks ?? []).length > 0,
      closing: closesOwed(nemiaDir(home), asks),
    };
  });

/** Her subscription's name, as the Subscription door takes it. */
const HERS = SubscriptionName.read(NEMIA_SUBSCRIPTION);

/**
 * Her subscription as the keeper reads it through the door: the task it tells, whether it carries her floor and whether her selectors
 * as they ship, or undefined where there is none. A file left out of the listing is the deliverer's to say.
 */
const herSubscription = Effect.fn('herSubscription')(function* () {
  const { listed } = yield* (yield* SubscriptionDoor).subscriptions.list();
  const sub = listed.find((s) => s.name === NEMIA_SUBSCRIPTION)?.subscription;
  return sub === undefined
    ? undefined
    : ({
        task: sub.task,
        scoped: sub.scope?.atLeast === NEMIA_FLOOR,
        selected: sub.selectors.join('\n') === NEMIA_SELECTORS.join('\n'),
      } satisfies HerSubscription);
});

/**
 * One beat: the levels, her task, her subscription and her folder's trust read (`trustedFolder`), her folder trusted by the keeper before
 * she is filed where it is not (`trustHer`, so no task is filed where her harness would refuse its start, and the filing left undone where
 * the trust was refused), the keeper's record of a refusal taken away on a beat that owes no trust, and, while she is kept, the person's
 * custom words against those she was last filed or told with (`customChanged`); each act owed done in order. Answers the acts done: those
 * owed, but past a trust refused.
 */
export const keepOnce = Effect.fn('keepOnce')(function* () {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const id = readLevel(home)?.task;
  const above = (yield* levelsNow()).some((row) => row.level !== 'manual');
  const { task, up, asking, closing } = yield* herTask(e, id);
  const trusted = trustedFolder(DEFAULT_HARNESS, nemiaDir(home));
  const keeping = { above, ...(id === undefined ? {} : { task: id }), ...(trusted === undefined ? {} : { trusted }) };
  const subscribed = yield* herSubscription();
  const kept = nemiaState(keeping, task, subscribed) === 'kept';
  const stale = kept && customChanged(readTold(home), yield* herCustom(), filedPrompt(home));
  const owed = nemiaDue(
    { ...keeping, stale, up, asking, closing, owed: kept && outboxOwed(nemiaDir(home)), answered: kept && answersOwed(nemiaDir(home)) },
    task,
    subscribed,
  );
  if (!owed.includes('trust')) writeUntrusted(home, undefined);
  const done: NemiaAct[] = [];
  for (const one of owed) {
    if (one === 'trust' && !(yield* trustHer(home))) break;
    if (one !== 'trust' && (id !== undefined || one === 'drop')) yield* act(e, id ?? '', one);
    done.push(one);
  }
  return done;
});

/**
 * The keeper, for as long as it runs: a beat each `every`; a beat that fails is a warning, and the next is tried a beat later.
 * @param options The keeper's pace, each one left out taken from `KEEP_DEFAULTS`.
 */
export const keep = (options: Partial<KeepOptions> = {}): Effect.Effect<never, never, EngineService | StoreRoot> => {
  const o = { ...KEEP_DEFAULTS, ...options };
  const beat = Effect.suspend(() => keepOnce()).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`Nemia could not be kept this beat: ${Cause.pretty(cause)}`)),
  );
  return Effect.forever(beat.pipe(Effect.andThen(Effect.sleep(o.every))));
};
