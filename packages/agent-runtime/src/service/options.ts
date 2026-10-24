/**
 * What `Engine.layer` is built from and what it answers with: the harnesses it names, its options, the task it files and the
 * reports it gives — and what the engine refuses of its options before it builds anything.
 */
import { Layer } from 'effect';
import type { Event } from '../core/index.ts';
import type { HarnessArgs, RunnerOps } from '../harness/index.ts';
import { Admission, type IoCounts, type ObserveCount, type RefusedMove, type StoreOps, type TaskView } from '../core/engine/index.ts';

export type { ObserveCount } from '../core/engine/index.ts';
import { claudeCodeOps, type Attached } from '../harness/claude/index.ts';
import { DEFAULT_HARNESSES } from './default-harnesses.ts';
import { detachedOps, type HarnessSpec } from '../harness/detached/detached.ts';
import { telemetered, telemetryRefusalOf, type Telemetry } from '../harness/telemetry.ts';
import {
  holderRefusal,
  remoteConfigRefusal,
  remoteOps,
  type Credentials,
  type HolderAgent,
  type MissingCredential,
  type RemoteAgent,
} from '../a2a/index.ts';

/**
 * A harness, as one of four things:
 *   `'claude'`      Claude Code as the engine runs it, every session on the Agent SDK: each task a job (its own process,
 *                   detached by us, or attached beside the held sessions while this process holds them), and a long-lived
 *                   one (`restartPolicy: 'Always'`) held attached
 *   a `HarnessSpec` any CLI that runs a prompt and exits — we keep the registry
 *   a `RemoteAgent` an A2A agent another party runs, by its URL or its card (`a2a/remote.ts`) — we keep the registry of
 *                   what we sent it; its secrets come from `credentials`
 *   a `RunnerOps`   anything else at all: a runner the consumer wrote, its sightings in A2A's names
 *
 * Each counts its sessions under the engine's ceiling (`maxConcurrent`) in a pool of its own, named as the harness is; one brought as
 * an object may name a `pool` instead (`Pooled`), so two harnesses under one rate limit share one ceiling.
 */
export type HarnessConfig = 'claude' | (HarnessSpec & Pooled) | (RemoteAgent & Pooled) | (RunnerOps & Pooled);

/** The pool a harness brought as an object counts its sessions in, when not its own: a name of one or more characters. */
export type Pooled = { pool?: string };

/**
 * What `Engine.layer` builds an engine from. `maxConcurrent` is the engine's ceiling: how many sessions of each pool may be at work at
 * once, a whole number from 1. With it, a pass admits the tasks filed `queued` while their pool has room, the highest `priority`
 * first, then the earliest filed; without it, a queued task waits for `admit`. A task filed unqueued starts on the next pass, ceiling
 * or not.
 */
export type EngineOptions = {
  /** The sessions at work at once in each pool: a whole number from 1. Absent: no ceiling, and nothing is admitted but by `admit`. */
  maxConcurrent?: number;
  /**
   * Asked on every pass before it admits: while it says true the pass admits no queued task, as a node marked `unschedulable` takes no
   * new Pod; what is at work goes on, `admit` still admits, and a task filed unqueued still starts. Absent: always schedulable.
   */
  unschedulable?: () => boolean;
  /**
   * Where the file-backed store lives. Required, and with no default: an engine made with no root would write into the person's own
   * `~/.agent-engine`, so the caller that knows where the store is says so (`AE_ROOT`, read in `src/cli/main.ts` alone). Ignored when
   * you bring your own `journal`, which is where the records then go.
   */
  root: string;
  /**
   * The store to keep the engine's records in, instead of the files under `root`: any `StoreOps`, a `JournalOps` among them. Every
   * `append` goes on its `feed` too, and a store that can signal an append (`subscribe`) wakes `watch` at once.
   */
  journal?: StoreOps;
  harnesses?: Record<string, HarnessConfig>;
  defaultHarness?: string;
  /**
   * The secret for a remote agent's security scheme, asked on every request that needs one: `scheme` is the scheme's name on
   * the agent's card, `agentUrl` the agent's configured URL (for an agent given by its card, the URL of the interface it is
   * reached on), `harness` the name the agent is configured under. `undefined` when there is none, and a task on an agent
   * whose card asks for it is refused before anything is sent. A secret is sent as a header and written nowhere: not on the
   * task, the journal, the registry or the feed.
   */
  credentials?: Credentials;
  /**
   * What to do when `credentials` gives no secret for a scheme, in words: the end of the refusal a task on that agent is
   * refused with, `unstartable`. A caller that keeps its secrets somewhere of its own names the place — the variable to
   * set, say. Absent, the refusal says to give `Engine.layer` a `credentials` that answers for the scheme.
   */
  missingCredential?: MissingCredential;
  /**
   * Where the sessions this engine starts export their telemetry: an OTLP/HTTP collector the process chose, handed to every spawn
   * (`telemetered`), tagged with the task's id and labels, and with the trace context of the span that filed the task. A harness that
   * exports says it in its own variables; one that does not ignores it. Absent: no session exports, whatever the process's
   * environment.
   */
  telemetry?: Telemetry;
  /**
   * The Claude Code the attached sessions are run with (`pathToClaudeCodeExecutable`), where it is not the Agent SDK's own bundled
   * CLI: a command of this runtime's own, as a container's is. Read by both roads the SDK runs — a held session (`hold`) and a
   * job's own process (`claudeJobSpec`, as `AE_CLAUDE_EXECUTABLE`) — and by the session a state read opens (`mcpState`), which is
   * the same road. Absent: the SDK's own.
   */
  claudeExecutable?: string;
  /**
   * The engines that hold the sessions this one only reads, by the harness each holds: for each, a function asked at every follow
   * of that harness's sessions, answering the card that engine served on its own port (`Served.cards`), as the JSON it answered, or
   * `undefined` for a harness no one holds now. Given a card, this engine's `follow` of that session is dialled on that port
   * (`holderSeamOf`) and nothing else is: a spawn, a stop, words said, a view, a transcript, logs and output are read here, off the
   * files both engines share, so this engine still answers with the holder down — just not live, which is also what `undefined`
   * answers: that follow reads the files, exactly as an engine given no holder at all does.
   *
   * A function and not a value, because a holder's port is ephemeral while a layer above may build its engine once for its whole
   * process: a value would be the holder that was up when the engine was built, and a viewer would dial a dead port after any
   * restart of the holder. The token is not here: `credentials` gives it for the card's `bearer` scheme, and a `holder` with no
   * `credentials` that answers is refused at the first follow, in words naming the fix.
   *
   * Named for a harness this engine does not run, or does not run as Claude Code attached (`'claude'`), it is refused before the
   * engine builds (`holderRefusal`): no other harness's sessions are held by a process of ours. What the function answers is
   * refused at the follow that asked for it (`holderAgentRefusal`), since there is nothing to read until then.
   */
  holder?: Record<string, () => HolderAgent | undefined>;
};

/** A task to file (`Engine.file`). */
export type TaskSpec = {
  brief: string;
  /**
   * The brief cut into parts, for storage alone: a store that keeps bodies keeps each long part once, however many tasks file it,
   * and a session is told `brief`, whole, as ever. Refused unless the parts, put end to end, are `brief`.
   */
  briefParts?: string[];
  cwd: string;
  harness?: string;
  deadlineSeconds?: number;
  /** Continue an existing session of this harness instead of starting cold. */
  resumeFrom?: string;
  /**
   * How the harness starts the session — its model, permission mode, tools, effort, MCP servers, context window, Remote
   * Control, worktree and spend cap (`HarnessArgs`, each key described there). The adapter's configuration: carried on the task,
   * handed to the runner at every spawn, and read by nothing else — `decide` and the loop never open it. Refused, before
   * anything is journalled, when a key is no harness argument, a value is one no harness could use, or its harness does
   * not take it; and a harness argument filed beside `config` rather than in it is refused, naming where it goes.
   */
  config?: HarnessArgs;
  /**
   * A JSON Schema for the workload's closing statement, handed to the harness verbatim.
   *
   * A harness that can take a structured final answer uses it — Claude Code as its StructuredOutput
   * tool, Codex as `--output-schema` — and the moment the workload gives one, the attempt is over.
   * The statement is recorded on the attempt (`state.attempts[n].closeout`) and never read by the
   * engine: its shape is yours.
   */
  closeoutSchema?: object;
  /**
   * Hold the task open when an attempt ends, rather than settle it: the task waits, phase `input-required` — A2A's
   * `TASK_STATE_INPUT_REQUIRED` — with no process running, until a person `answer`s it, which starts its next turn, or
   * `close`s it, which settles it. A turn is one attempt, under `deadlineSeconds` and a budget of its own, so a task may
   * wait on a person for as long as they take; a turn that does not end `succeeded` settles the task `failed`. `stop` settles it `stopped`,
   * waiting or not. Refused unless `true`.
   */
  holdOpen?: true;
  /**
   * Wait for the word to start: the task is filed and a pass starts nothing of it until `admit` names it — then
   * the next pass starts it. A task held open waits for the word again before each later
   * turn. For a layer above that decides itself what runs when; `view` says `admission: 'queued'` while it waits, and its
   * phase stays `pending`. Absent, or `false`, starts it on the next pass. Refused unless true or false.
   */
  queued?: boolean;
  /**
   * Long-lived, a Pod's `restartPolicy: Always`: the session stays open while idle — the end of a turn, an idle listing and silence are not
   * its end — and only `stop` ends it; a person can `say` it words, or attach to it, at any time. A session that ends with no stop asked
   * settles the task `failed`. Taken only by Claude Code (`'claude'`), whose long-lived session runs attached in the process that holds the
   * sessions (a spawn with no holder ends `unstartable`), and a `RunnerOps` brought as its own; refused beside `holdOpen`,
   * `deadlineSeconds` or `closeoutSchema`, and unless `'Always'`.
   */
  restartPolicy?: 'Always';
  /** Choose the id yourself, to keep it in step with a row in your own database. */
  id?: string;
  /**
   * Which queued task a free slot of its pool goes to first, higher first, as a Pod's priority: a whole number in int32. Absent is 0;
   * tasks of one priority go in the order they were filed. Read by the pass's admission alone (`maxConcurrent`).
   */
  priority?: number;
  /**
   * The caller's labels, a Pod's `metadata.labels`: names to texts, said on each of the task's sessions' telemetry beside `task`, its
   * id. Carried, never judged. Refused unless at most 16 entries, each named by a lowercase word other than `task`, with a text of 1
   * to 256 characters and no control character.
   */
  labels?: Record<string, string>;
};

/**
 * One pass: how many tasks it read, how many actions it took, the sessions at work on each harness as it left them — its
 * last attempt open, and `working` or not yet listed; a `blocked` one is not — and the
 * view of every task it left unsettled — built off the pass's one observation of each harness and the fold it made, so a
 * layer above that decides what to `admit` reads the store without asking any harness again — and what the pass
 * cost, as facts: `ms`, its wall time, and `observed`, each harness's observes made during it (`ObserveCount`). Nothing decides on
 * them.
 *
 * `refused` is every move the task's lifecycle had no edge for in this pass, off the same steps: the task, the state
 * it was in and the event it was handed. Such a task did nothing and will be asked again next pass, so a refusal that persists
 * is on every report until something changes; a layer above says it once (`wf up`). Empty on a healthy store, and a settled
 * task is never on it.
 *
 * `unreadable` says why each task whose journal did not read was left out of the pass, naming its file, the entry and the field —
 * on every report while it lasts, as a refusal is — and each feed entry no runtime wrote that the pass skipped, on the report of
 * the pass that met it. Every other task is moved all the same. Empty on a healthy store.
 *
 * `unobserved` says why a harness's look failed this pass, one sentence each, naming the harness and in its words (a registry row
 * that does not decode names the row, its field and the fix): on every report while it lasts, on none after. The names that look
 * was to find are unread (`observed`'s `unread` counts it), and no rule reads the words. Empty on a healthy store.
 */
export type TickReport = {
  tasks: number;
  actions: number;
  running: Record<string, number>;
  views: TaskView[];
  ms: number;
  observed: Record<string, ObserveCount>;
  refused: RefusedMove[];
  unreadable: string[];
  unobserved: string[];
};

/**
 * What this engine's reads and spawns have cost, as running totals: the runtime's own reads and spawns (`IoCounts`, per process), and
 * each harness's observes, whichever call made them — a pass, a `view`, a `transcript` (per engine). Read inside `Engine.tallied`, the
 * same totals of that program's own work alone. A caller that wants one call's cost takes the difference before and after it.
 */
export type EngineIo = IoCounts & { observed: Record<string, ObserveCount> };

/**
 * The session an attempt ended as, as its harness named it then (the `ended` entry's `sessionId`, the sighting's): what an
 * observe would have listed it by. Undefined for an attempt no harness ever named, whose end says so in parentheses.
 */
export const handleOf = (events: readonly Event[], attempt: number): string | undefined => {
  const end = [...events].reverse().find((e) => e.kind === 'ended' && e.attempt === attempt);
  return end?.kind === 'ended' && !['(never seen)', '(never started)'].includes(end.sessionId) ? end.sessionId : undefined;
};

export const isSpec = (h: HarnessConfig): h is HarnessSpec => typeof h === 'object' && 'command' in h;
/** A remote A2A agent: an object that is neither a spec (`command`) nor a runner (`spawn`). */
export const isRemote = (h: HarnessConfig): h is RemoteAgent => typeof h === 'object' && h !== null && !('command' in h) && !('spawn' in h);
/** Claude Code as the engine runs it itself. */
export const isClaude = (h: HarnessConfig): h is 'claude' => h === 'claude';

/**
 * Each configured harness as the seam's value, by name: composed into one `Runner`, and asked directly for a task's logs. With
 * `telemetry`, each spawn is told where to export (`telemetered`).
 */
export const runnersOf = (
  harnesses: Record<string, HarnessConfig>,
  root: string,
  credentials?: Credentials,
  missingCredential?: MissingCredential,
  telemetry?: Telemetry,
  attached?: Attached,
  claudeExecutable?: string,
): Record<string, RunnerOps> =>
  Object.fromEntries(
    Object.entries(harnesses).map(([name, h]): [string, RunnerOps] => {
      const ops = runnerOf(name, h, root, credentials, missingCredential, attached, claudeExecutable);
      return [name, telemetry ? telemetered(ops, telemetry) : ops];
    }),
  );

/** The harness `h`, configured under `name`, as the seam's value. */
const runnerOf = (
  name: string,
  h: HarnessConfig,
  root: string,
  credentials?: Credentials,
  missingCredential?: MissingCredential,
  attached?: Attached,
  claudeExecutable?: string,
): RunnerOps =>
  h === 'claude'
    ? claudeCodeOps({ root, ...(claudeExecutable ? { claudeExecutable } : {}) }, attached)
    : isSpec(h)
      ? detachedOps(h, root)
      : isRemote(h)
        ? remoteOps(name, h, root, credentials, undefined, { missingCredential })
        : h;

/**
 * Which of `harnesses` a holder can hold: the names configured as the literal `'claude'`, and no other. Those are the sessions one
 * process holds attached, and the only ones another process cannot read live off the files both engines share — a remote agent's are
 * the other party's, a detached one's and a command's are on the store. One rule, read by what a holder serves (`servingOf` in
 * `engine.ts`), by what `holder` may name (`holdersRefusalOf`), and by a layer above that configures a viewer off the runtime's door:
 * a copy of the literal elsewhere drifts the day the rule changes.
 */
export const heldHarnessesOf = (harnesses: Record<string, HarnessConfig>): string[] =>
  Object.entries(harnesses)
    .filter(([, h]) => h === 'claude')
    .map(([name]) => name);

/**
 * Why one of `options.holder`'s names cannot be taken, or `undefined`: the first `holderRefusal` refuses, in the options' order.
 * The harnesses it is read against are the ones the engine will run — `DEFAULT_HARNESSES` where the options name none, as `make`
 * reads them — so a holder of the `claude` harness is taken by an engine that was given no `harnesses` at all. Only the names
 * are read here, and that each entry is a function at all: what a function *answers* is refused at the follow that asks it
 * (`holderAgentRefusal`).
 */
const holdersRefusalOf = (options: Omit<EngineOptions, 'root'>): string | undefined => {
  const harnesses = options.harnesses ?? DEFAULT_HARNESSES;
  const names = Object.keys(harnesses);
  const held = heldHarnessesOf(harnesses);
  for (const [name, holder] of Object.entries(options.holder ?? {})) {
    const refused = holderRefusal(name, holder, { harnesses: names, claude: held.includes(name) });
    if (refused) return refused;
  }
  return undefined;
};

/** Why `maxConcurrent` is not a ceiling, or `undefined`: anything but a whole number from 1. */
const ceilingRefusalOf = (maxConcurrent: unknown): string | undefined =>
  maxConcurrent === undefined || (Number.isInteger(maxConcurrent) && (maxConcurrent as number) >= 1)
    ? undefined
    : `\`maxConcurrent: ${typeof maxConcurrent === 'number' ? maxConcurrent : JSON.stringify(maxConcurrent)}\` is not a ceiling. Give the sessions each pool may have at work at once, a whole number from 1, or leave it out for none.`;

/**
 * Why the harness `name` cannot be taken as given, or `undefined`: a word other than `'claude'` — `'claude-bg'`, the `claude --bg`
 * road a former runtime had, named with what replaced it — a `pool` that is not a name, and a remote agent's config.
 */
const harnessConfigRefusalOf = (name: string, h: HarnessConfig): string | undefined => {
  if ((h as unknown) === 'claude-bg') {
    return `the \`${name}\` harness is \`'claude-bg'\`, Claude Code's \`--bg\` sessions, which this runtime no longer runs: every Claude Code session runs on the Agent SDK. Configure it as \`'claude'\`, and file a session meant to stay open with \`restartPolicy: 'Always'\`, which runs attached while a daemon holds the sessions.`;
  }
  if (typeof h !== 'object' && h !== 'claude') {
    return `the \`${name}\` harness is ${JSON.stringify(h) ?? String(h)}, which is no harness: give \`'claude'\`, a \`HarnessSpec\`, a remote agent or a \`RunnerOps\`.`;
  }
  const pooled: Record<string, unknown> = typeof h === 'object' && h !== null ? h : {};
  if (Object.hasOwn(pooled, 'pool') && (typeof pooled.pool !== 'string' || !pooled.pool.trim())) {
    return `the \`${name}\` harness names the \`pool\` ${JSON.stringify(pooled.pool) ?? String(pooled.pool)}, which is not a name. Give the name of the pool its sessions share a ceiling in, or leave it out for a pool of its own.`;
  }
  const { pool: _, ...agent } = pooled;
  return typeof h === 'object' && h !== null && isRemote(h) ? remoteConfigRefusal(name, agent) : undefined;
};

/**
 * Why an engine cannot be built from these options, in a sentence that says what to do instead — or `undefined`. Asked of the options as
 * handed in, untyped, and refuses, in this order: a `sayTimeoutMs`, which no harness reads now; a `maxConcurrent` that is not a whole
 * number from 1; a harness named by a word other than `'claude'`, or brought as an object whose `pool` is not a name; a remote agent's
 * entry `remoteConfigRefusal` refuses, its `pool` aside; a `holder` entry `holderRefusal` refuses; an `unschedulable`, a `credentials` or a
 * `missingCredential` that is not a function; and a `telemetry` that names no collector.
 */
export const optionsRefusalOf = (options: Omit<EngineOptions, 'root'>): string | undefined => {
  if (Object.hasOwn(options, 'sayTimeoutMs')) {
    return "`sayTimeoutMs` bounded a `say` to a Claude Code `--bg` session's inbox, and this runtime runs no such session: a job and a held session take words on their own input. Leave `sayTimeoutMs` out.";
  }
  const ceiling = ceilingRefusalOf(options.maxConcurrent);
  if (ceiling) return ceiling;
  for (const [name, h] of Object.entries(options.harnesses ?? {})) {
    const refused = harnessConfigRefusalOf(name, h);
    if (refused) return refused;
  }
  const holders = holdersRefusalOf(options);
  if (holders) return holders;
  if (options.unschedulable !== undefined && typeof options.unschedulable !== 'function') {
    return '`unschedulable` is a function, `() => boolean`, asked on every pass: give one, or leave it out.';
  }
  if (options.credentials !== undefined && typeof options.credentials !== 'function') {
    return '`credentials` is a function, `(scheme, agentUrl, harness) => secret | undefined`: give one, or leave it out.';
  }
  if (options.missingCredential !== undefined && typeof options.missingCredential !== 'function') {
    return '`missingCredential` is a function, `(scheme, agentUrl, harness) => words`: give one, or leave it out.';
  }
  return telemetryRefusalOf(options.telemetry);
};

/**
 * What an engine over `options` admits under (`Admission`): its `maxConcurrent`, its `unschedulable`, and the pool each of `harnesses`
 * counts in — the `pool` it names, else its own name; a task with no harness counts in `default`.
 */
export const admissionOf = (options: EngineOptions, harnesses: Record<string, HarnessConfig>) =>
  Layer.succeed(Admission)({
    ...(options.maxConcurrent !== undefined ? { ceiling: options.maxConcurrent } : {}),
    ...(options.unschedulable !== undefined ? { unschedulable: options.unschedulable } : {}),
    poolOf: (harness) => {
      const h = harness !== undefined && Object.hasOwn(harnesses, harness) ? harnesses[harness] : undefined;
      return typeof h === 'object' && h !== null && typeof h.pool === 'string' ? h.pool : (harness ?? 'default');
    },
  });

/** Why a record is no record of remote servers to read the state of, as a sentence that says what to do, or `undefined`. */
export const mcpStateRefusal = (servers: unknown): string | undefined => {
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    return `takes a map of remote MCP servers by name, as a record holds them; it was handed ${JSON.stringify(servers)}. Give { "<name>": { "type": "http", "url": "https://..." } }.`;
  }
  const names = Object.keys(servers);
  if (!names.length) {
    return 'takes at least one server, and was handed none: a state is read of the servers a record holds. Ask it of a record that holds one, or do not ask.';
  }
  for (const name of names) {
    const server = (servers as Record<string, unknown>)[name];
    if (typeof server !== 'object' || server === null || !('url' in server)) {
      return `\`${name}\` is not a remote server, and a state is read of one alone: a server the harness starts has no connection to report. Give it a \`url\`, or take it off the ask.`;
    }
  }
  return undefined;
};
