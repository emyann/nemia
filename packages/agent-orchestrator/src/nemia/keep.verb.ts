/**
 * The keeper of Nemia: each beat, the levels read again (`levelsNow`), the keeper's record of her session (`session.json`: her tasks and
 * the marks of her current one), her current task read off the engine, her subscription off the store and her chat's files, and what is
 * owed done (`nemiaDue`). Two roles on one session. **Conversation**: a word of the person's in her chat files her where no task of hers is
 * open, at any level, as a new task continuing her last session (`resumeFrom`), after her harness's trust is given to her own folder where
 * it is not (`trustHer`), why where that write is refused recorded for the person (`writeUntrusted`); at `manual`, once her session has
 * been idle `restAfter` since the last word said to her (`quietOf`), she is put to rest: the record marked, then her task stopped.
 * **Operating**: while any factory is above `manual` she is filed and kept, subscribed with her floor (`NEMIA_FLOOR`), and never rests;
 * once none is, her subscription is dropped and the conversation goes on until it is quiet. While the keeper speaks to her session, the
 * person's custom words are said to it (`sayCustom`) once they are not those she was last filed or told with (`customChanged`), and, while
 * it is live, the person's chat words (`sayOutbox`), the questions it holds open written down (`recordAsks`) and the person's answers
 * carried (`answersDue`). A task that ended with no rest of the keeper's is marked so, and filed again only on a word of the person's after
 * the mark. Level-triggered: it carries nothing between beats, so a restart owes what the files and the engine say.
 *
 * A controller: it reaches the runtime through the client (`EngineService`), run by `up` (`daemon/up.verb.ts`) beside the deliverer, and
 * her subscription through the Subscription door (`SubscriptionDoor`) and the person's custom words for her through the Agent door
 * (`AgentDoor`), each at the store root `up` is given.
 */
import { listedAtOnce } from '../factory/door/factories.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Duration, Effect, Metric } from 'effect';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { ownOf } from '../tick/told.verb.ts';
import { factoryMounts } from '../factory/factory.ts';
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
  herTasks,
  memoryDir,
  nemiaDir,
  ownBin,
  promptAllows,
  readLevel,
  readNemia,
  readSession,
  readTold,
  SHIPPED_NEMIA,
  storeDenies,
  writePrompt,
  writeSession,
  writeTold,
  writeUntrusted,
} from './level.store.ts';
import { readAnswers, readOutbox } from '../chat/chat.store.ts';
import { nemiaFence, widened } from '../admission/index.ts';
import { TABLE } from '../command/commands.verb.ts';
import { CLI_VERBS } from '../command/command.ts';
import { levelsNow } from '../level/levels.verb.ts';
import { SESSION_TOKEN, mountOf } from '../filed/filed.ts';
import { TokenDoor } from '../token/token.store.ts';
import {
  NEMIA_DIGEST_EVERY,
  NEMIA_FLOOR,
  NEMIA_REST_AFTER,
  NEMIA_SUBSCRIPTION,
  NEMIA_SELECTORS,
  customChanged,
  nemiaDue,
  nemiaPrompt,
  nemiaSettings,
  nemiaTaskId,
  quietOf,
  toldCustom,
  folderUnmade,
  trustRefused,
  type HerSubscription,
  type HerTask,
  type NemiaAct,
  type NemiaSession,
} from './nemia.ts';

/** What the keeper did, each act counted once done. */
const NEMIA_ACTS = Metric.counter('nemia.acts', {
  description:
    "the keeper's acts on Nemia's session: her folder trusted, filed, subscribed, put to rest, dropped, marked, her custom words said, the outbox said",
});

/**
 * How often the keeper reads the level, her task and her subscription again (`every`), and how long the conversation is quiet before
 * she rests at `manual` (`restAfter`).
 */
export type KeepOptions = { every: Duration.Input; restAfter: Duration.Input };

/** The keeper's pace and her rest when it is given none. */
const KEEP_DEFAULTS: KeepOptions = { every: '5 seconds', restAfter: NEMIA_REST_AFTER };

/**
 * Her priority among the tasks waiting for a slot: above every step and above a person's turn (`ASKED_PRIORITY`), so the person's agent
 * is never queued behind the work, and takes the room kept for a person's turn while she works. Exported only for the test that holds
 * that order.
 */
export const NEMIA_PRIORITY = 1_000_000;

/**
 * What her session is told first, once filed: what she does while the person writes to her, and, while a factory is above `manual`
 * (`operating`), that the feed is said to her; and that she reads the quota with `nemia quota`, a verb of her fence, which sends her
 * session token as every `nemia` she runs does.
 */
const nemiaBrief = (operating: boolean) =>
  [
    'You are on. Read your memory, then answer what the person wrote in your chat, if anything; then wait for their next words.',
    ...(operating ? ['The feed is said to you when it needs the person.'] : []),
    "At auto, `nemia policy nemia` lists the answers the person's confirmed rules let you give unasked; propose rules from their custom",
    'instruction with `nemia policy propose nemia --file -`.',
    'The quota and its pace: `nemia quota`.',
  ].join(' ');

/**
 * Each factory's folders, read-only: what she reads of the work and never writes, as the runtime takes a mount (`mountOf`), with no
 * volume's switch. A factory that does not read is left out.
 */
const factoryFolders = (home: string) => {
  const volumes = listedAtOnce(home).flatMap((f) => ('volumes' in f ? f.volumes : []));
  return factoryMounts({ volumes }, undefined).map(mountOf);
};

/**
 * Her task as the engine is asked to file it under `id`: long-lived (`restartPolicy: 'Always'`), on the Agent SDK, bridged, in her
 * folder, by her definition; with her fence derived from the command table and the verbs the api serves beside it (`nemiaFence`,
 * `CLI_VERBS`), less each prompt the person allowed in her folder (`widened`, `promptAllows`), the store's denies (`storeDenies`) and
 * the daemon's own bin first on her path (`ownBin`) in the harness's settings, and her admission (`nemia admit`, with her floor and
 * her rules for auto) asked before each of her shell calls. A prompt allowed while she runs is widened the next time she is filed. Her
 * instruction is composed with the person's custom words for her, `custom` (`herCustom`), and her session token, minted as she is
 * filed (`herToken`), is in her environment as `SESSION_TOKEN`. A task that continues her last session (`resumeFrom`) starts with her
 * memory of the conversation.
 * @param id The id her task is filed under.
 * @param custom The person's custom words for her, or undefined where there are none.
 * @param token Her session token, minted as she is filed.
 * @param home The store's root folder.
 * @param resumeFrom The session of her last task to continue, or undefined to start cold.
 * @param operating Whether a factory is above `manual`, so her brief says the feed is said to her.
 */
export function nemiaSpec(id: string, custom: string | undefined, token: string, home: string, resumeFrom?: string, operating = true) {
  const step = readNemia();
  const prompt = composePrompt(home, step.body, custom);
  const memory = `Edit(/${memoryDir(home)}/**)`;
  const fence = widened(nemiaFence([...TABLE, ...CLI_VERBS]), promptAllows(home));
  const bin = ownBin();
  const settings = nemiaSettings({ ask: fence.ask, deny: [...fence.deny, ...storeDenies(home)] }, bin, process.env.PATH ?? '');
  return {
    id,
    brief: nemiaBrief(operating),
    cwd: nemiaDir(home),
    ...(resumeFrom === undefined ? {} : { resumeFrom }),
    harness: step.harness ?? DEFAULT_HARNESS,
    restartPolicy: 'Always',
    priority: NEMIA_PRIORITY,
    config: {
      ...(step.model === undefined ? {} : { model: step.model }),
      permissionMode: step.permissionMode,
      mayAsk: true,
      ...(step.disallowedTools === undefined ? {} : { disallowedTools: step.disallowedTools }),
      allowedTools: [...(step.allowedTools ?? []), ...fence.allow, memory],
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
  } satisfies Parameters<Engine['file']>[0];
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

/**
 * The session of her latest filed task before `id` among `tasks`, which a new task continues, or undefined where none of them holds one.
 */
const lastSession = (e: Engine, tasks: readonly string[], id: string) =>
  Effect.gen(function* () {
    const at = tasks.indexOf(id);
    for (const task of tasks.slice(0, at < 0 ? tasks.length : at).reverse()) {
      const view = yield* asked('view', e.view(task));
      if (view.state.filedAt && view.sessionId !== null) return view.sessionId;
    }
    return undefined;
  });

/**
 * A task of hers filed: under the record's last task where it is not filed yet, else under a new id named for `now` and appended to the
 * record first, its marks cleared, so a filing that fails is filed again under the same id; continuing the session of her task before it
 * (`resumeFrom`). Warned of where no nemia of the daemon's is first on her path.
 */
const fileHer = (e: Engine, beat: Beat) =>
  Effect.gen(function* () {
    if (ownBin() === undefined)
      yield* Effect.logWarning(`Nemia is filed with no nemia of the daemon's first on her path: none links ${SHIPPED_NEMIA}/../bin.`);
    const home = beat.home;
    const tasks = herTasks(home);
    const last = tasks.at(-1);
    const minted = (n: number) => (n === 0 ? nemiaTaskId(beat.at) : `${nemiaTaskId(beat.at)}-${n}`);
    let fresh = 0;
    while (tasks.includes(minted(fresh))) fresh++;
    const id = last !== undefined && !beat.filed ? last : minted(fresh);
    const listed = id === last ? tasks : [...tasks, id];
    writeSession(home, { tasks: listed });
    const resumeFrom = yield* lastSession(e, listed, id);
    const custom = yield* herCustom();
    yield* asked('file', e.file(nemiaSpec(id, custom, yield* herToken(id), home, resumeFrom, beat.above)));
  });

/** The keeper's record of her session with `marks` laid over it, written whole. */
const marked = (home: string, marks: Omit<NemiaSession, 'tasks'>) =>
  Effect.sync(() => writeSession(home, { ...(readSession(home) ?? { tasks: herTasks(home) }), ...marks }));

/**
 * Her open task `id` told the person's custom words as they read now (`toldCustom`), and only once the runtime took them, her instruction
 * written with them, so an attempt it starts again reads them too, and the words recorded as told: words she was not told are never
 * written as hers.
 */
const sayCustom = (e: Engine, { id }: Beat) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const custom = yield* herCustom();
    yield* asked('say', e.say(id, toldCustom(custom)));
    writePrompt(home, nemiaPrompt(readNemia().body, custom));
    writeTold(home, custom);
  });

/**
 * What an act reads of its beat: the store, her current task's id (empty where she has none), whether it is filed, whether a factory is
 * above `manual`, and the beat's moment as an ISO time.
 */
type Beat = { home: string; id: string; filed: boolean; above: boolean; at: string };

/**
 * Each act the keeper owes on her current task, but the trust of her folder (`trustHer`): a stop or a drop already done by another is no
 * failure, and a rest marks the record before her task is stopped, so a stop it asked is never read as one from outside.
 */
const ACTS: Record<Exclude<NemiaAct, 'trust'>, (e: Engine, beat: Beat) => Effect.Effect<void, Refusal, StoreRoot>> = {
  file: fileHer,
  rest: (e, beat) =>
    marked(beat.home, { rested: beat.at }).pipe(
      Effect.andThen(asked('stop', e.stop(beat.id).pipe(Effect.catchTag('StopRefused', () => Effect.void)))),
    ),
  markIdle: (_e, beat) => marked(beat.home, { idleSince: beat.at }),
  markStopped: (_e, beat) => marked(beat.home, { stoppedSeen: beat.at }),
  subscribe: (_e, { id }) =>
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
  sayOutbox: (e, { home, id }) => sayOutbox(id, nemiaDir(home)).pipe(over(e), Effect.asVoid),
  record: (e, { home, id }) => recordAsks(id, nemiaDir(home)).pipe(over(e), Effect.asVoid),
  answer: (e, { home, id }) => answersDue(id, nemiaDir(home)).pipe(over(e), Effect.asVoid),
};

/** One act owed on her current task, counted once done. */
const act = (e: Engine, beat: Beat, owed: Exclude<NemiaAct, 'trust'>) =>
  ACTS[owed](e, beat).pipe(Effect.andThen(Metric.update(NEMIA_ACTS, 1)));

/** The words of what the write of her folder's trust threw. */
const threwWords = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Her folder made, where it is not yet, and her harness's trust given to it (`trustFolder`), which is safe since the folder is Nemia's
 * own: the store makes it and only Nemia writes it. Why it is not given, where making the folder threw (`folderUnmade`) or the write
 * left it so or threw (`trustRefused`), recorded for the person (`writeUntrusted`), and the record taken away once it is. Answers whether
 * her folder is trusted now, counted where so.
 */
const trustHer = (home: string) =>
  Effect.gen(function* () {
    const dir = nemiaDir(home);
    const refused = (() => {
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
 * Her task's record off the engine, undefined where none is filed under `id`, whether her session is live (`upOf`) and idle between
 * turns (the runtime's phase `idle`), when each word the runtime journalled as said to it was said (`said`),
 * whether it holds a question open on the person (`asking`, off the view's `asks`) and whether the chat holds one whose mark no longer
 * says what became of its call (`closing`, `closesOwed` read against the same view).
 */
const herTask = (e: Engine, id: string | undefined) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const none = { task: undefined, up: false, idle: false, said: [], asking: false, closing: false };
    if (id === undefined) return none;
    const { state, phase, asks } = yield* asked('view', e.view(id));
    if (!state.filedAt) return none;
    return {
      task: { settled: Boolean(state.settled), stopRequested: state.stopRequested } satisfies HerTask,
      up: upOf(phase),
      idle: phase === 'idle',
      said: (state.said ?? []).map((one) => one.at),
      asking: (asks ?? []).length > 0,
      closing: closesOwed(nemiaDir(home), asks),
    };
  });

/** The latest of `times`, ISO times, in milliseconds, or null where none reads as one. */
const latest = (times: readonly (string | undefined)[]) =>
  times.reduce<number | null>((max, at) => {
    const ms = at === undefined ? Number.NaN : Date.parse(at);
    return Number.isNaN(ms) || (max !== null && max >= ms) ? max : ms;
  }, null);

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
 * One beat: the levels, the keeper's record of her session (`readSession`, her tasks by `herTasks`), her current task, her subscription,
 * her folder's trust (`trustedFolder`), her chat's files and the person's custom words read (words that do not read are owed as changed, so
 * their refusal is said by the act that tells her them, as the beat's failure once every other act owed is done: none waits on it); whether
 * the conversation is quiet enough for her to rest (`quietOf`, her idle mark against the latest word said or answered to her, at least
 * `restAfterMs` old on the wall clock); whether the person spoke after her task was seen ended with no rest (a chat entry, an answer, or a
 * level set after the mark); her folder trusted by the keeper before she is filed where it is not (`trustHer`, the filing left undone where
 * the trust was refused), the keeper's record of a refusal taken away on a beat that owes no trust; each act owed (`nemiaDue`) done in
 * order. Answers the acts done: those owed, but past a trust refused.
 * @param restAfterMs How long the conversation is quiet before she rests at `manual`, in milliseconds.
 */
export const keepOnce = Effect.fn('keepOnce')(function* (
  restAfterMs: number = Duration.toMillis(Duration.fromInputUnsafe(NEMIA_REST_AFTER)),
) {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const now = Date.now();
  const record = readSession(home);
  const id = herTasks(home).at(-1);
  const levelFile = readLevel(home);
  const above = (yield* levelsNow()).some((row) => row.level !== 'manual');
  const { task, up, idle, said, asking, closing } = yield* herTask(e, id);
  const dir = nemiaDir(home);
  const answers = readAnswers(dir);
  const ms = (at: string | undefined) => latest([at]);
  const lastSaid = latest([...said, ...answers.map((a) => a.at)]);
  const quiet = quietOf({ idleSince: ms(record?.idleSince), lastSaid, now, restAfterMs });
  const spoke = latest([...readOutbox(dir).map((entry) => entry.at), ...answers.map((a) => a.at), levelFile?.asked]);
  const seen = ms(record?.stoppedSeen);
  const trusted = trustedFolder(DEFAULT_HARNESS, dir);
  const keeping = {
    above,
    ...(id === undefined ? {} : { task: id }),
    ...(trusted === undefined ? {} : { trusted }),
    rested: record?.rested !== undefined,
    stoppedMarked: seen !== null,
    heard: seen !== null && spoke !== null && spoke > seen,
    idle,
    idleMarked: quiet.marked,
    quiet: quiet.quiet,
    stale: yield* herCustom().pipe(
      Effect.map((custom) => customChanged(readTold(home), custom, filedPrompt(home))),
      Effect.orElseSucceed(() => true),
    ),
    up,
    asking,
    closing,
    owed: outboxOwed(dir),
    answered: answersOwed(dir),
  };
  const owed = nemiaDue(keeping, task, yield* herSubscription());
  if (!owed.includes('trust')) writeUntrusted(home, undefined);
  const beat: Beat = { home, id: id ?? '', filed: task !== undefined, above, at: new Date(now).toISOString() };
  const done: NemiaAct[] = [];
  let refused: Effect.Error<ReturnType<typeof act>> | undefined;
  for (const one of owed) {
    if (one === 'trust' && !(yield* trustHer(home))) break;
    if (one === 'sayCustom') refused = yield* act(e, beat, one).pipe(Effect.as(undefined), Effect.catch(Effect.succeed));
    else if (one !== 'trust') yield* act(e, beat, one);
    if (one !== 'sayCustom' || refused === undefined) done.push(one);
  }
  if (refused !== undefined) return yield* Effect.fail(refused);
  return done;
});

/**
 * The keeper, for as long as it runs: a beat each `every`; a beat that fails is a warning, and the next is tried a beat later.
 * @param options The keeper's pace, each one left out taken from `KEEP_DEFAULTS`.
 */
export const keep = (options: Partial<KeepOptions> = {}) => {
  const o = { ...KEEP_DEFAULTS, ...options };
  const restAfterMs = Duration.toMillis(Duration.fromInputUnsafe(o.restAfter));
  const beat = Effect.suspend(() => keepOnce(restAfterMs)).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`Nemia could not be kept this beat: ${Cause.pretty(cause)}`)),
  );
  return Effect.forever(beat.pipe(Effect.andThen(Effect.sleep(o.every))));
};
