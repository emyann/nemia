/**
 * The whole engine, as data and one pure function.
 *
 * Two states, one join key:
 *
 *   DESIRED   what I asked for            -> the journal, append-only JSONL      (ours)
 *   OBSERVED  what the machine is doing   -> `claude agents --json`, run files   (the harness's)
 *   join key  a NAME we choose before spawning and pass as `--name`
 *
 * The name is the whole trick, and it is Kubernetes' label selector: because we decide it rather
 * than learning it, a session we started is findable after a crash that lost every other trace of
 * it. The harness's own session id is a handle we look up when we need one — never a key.
 *
 * `decide()` compares the two states and names ONE step. It touches no database, spawns no
 * process and reads no clock it was not handed — so the interesting half of this engine is a pure
 * function with an exhaustive test, and the I/O half has no decisions in it.
 *
 * Why there are no leases here: for a harness that keeps its own registry, the session is owned by
 * the harness and outlives us, so "is it still running" is a question we ASK. For one that does
 * not, `harness/detached/detached.ts` keeps the registry and a heartbeat, and answers the same question with
 * the same word. Either way the answer arrives as a `SessionState` — A2A's word for a task's state — and nothing in this
 * file can tell which kind of harness produced it.
 */

import type { HarnessArgs } from '../harness/args.ts';
import type { TranscriptMark } from '../harness/seam.ts';
import {
  transition,
  VERBS,
  type LifecycleEvent,
  type LifecycleState,
  type Move,
  type Refusal,
  type VerbGuard,
  type VerbName,
} from './lifecycle.ts';
import { elapsedMs, type Instant, type Monotonic } from './clock.ts';
import { endOf, isLive, NEEDS_HUMAN, RUNNING, waitsOnPerson, type Outcome, type SessionState } from './session.ts';

/** Ended by the session itself, not stopped under it: an end on record that no deadline overrules. */
const ENDED_OWN: ReadonlySet<SessionState> = new Set(['completed', 'failed', 'rejected']);

/**
 * One session as the machine sees it. Keyed by name, because the name is ours.
 *
 * `nativeId` is the harness's own identifier — the thing `--resume` takes. It is not the key and
 * is often not known until the session has started, which is exactly why it is not the key.
 * `usage` is present only when the runner can see inside a session, `exitCode` only for a harness
 * that ends by exiting.
 */
export type Sighting = {
  sessionId: string;
  state: SessionState;
  /**
   * Is the session's process doing something *right now*?
   *
   * A second, independent fact — not a finer grade of `state`. `working` means "a turn is running
   * OR the session is between steps of work it drives itself"; `busy` is what tells those apart.
   * So `working` + not busy is a session that believes it has work and is computing nothing, which
   * is what a stalled step looks like from outside. Reported, not acted on: being between steps is
   * legitimate, and only a deadline can honestly end an ambiguous wait.
   */
  busy?: boolean;
  nativeId?: string;
  /** What the session has consumed, as far as its runner could measure. Absent when it could not. */
  usage?: Usage;
  /** How the harness's process exited. A fact about the process, not a verdict on the work. */
  exitCode?: number;
  /**
   * What the workload said when it finished, and WHEN it said it — present only for a harness that
   * can take a structured final answer, and only once one was given.
   *
   * The time is not decoration. A resumed session can carry a statement its parent made, and the
   * engine keeps one only if it was made after this attempt began. A runner whose session cannot carry
   * another attempt's statement gives no time, and the engine keeps the statement whatever the clock says:
   * a remote agent's, and a detached run's, whose spawn cleared the last one's before it launched it. So
   * does a runner that told the statement is its session's own: Claude Code's `--bg`, by the call's id,
   * against the parent's last call it recorded at spawn.
   */
  closeout?: { payload: unknown; at?: number };
  /**
   * How long the session has been quiet — nothing written — present once that is long enough that its runner holds it
   * has stopped rather than paused between steps it drives itself (Claude Code: ninety seconds).
   *
   * **A sighting can be `busy` and quiet at once**: a session whose
   * process is doing something other than the work — a background shell it left running — while the last word in its
   * conversation is its own closing statement. Whether a runner can tell those apart is its harness's business; this
   * field is the answer, and `busy` is a separate fact about the process. So a reader of a sighting, and a runner
   * written against this type, must not take quiet to mean not busy. (`closedOut` in `engine.ts` does refuse to act on
   * a statement from a busy session — a verdict it may yet revise — which is why quiet, not the statement, is what
   * ends such an attempt.)
   *
   * A fact about the session, not a verdict on the work: a quiet session has ended, and `decide` records it `succeeded` —
   * with `stated: false` where its task asked for a closing statement and was told none, which the layer above judges.
   * Only the journal knows the task, so `decide` reads this, and no runner turns it into `succeeded`.
   */
  quietMs?: number;
  /**
   * What the harness says this session is waiting for, in the harness's own words — `permission prompt`, as
   * `claude agents --json` prints it beside `state: 'blocked'`. Absent from a harness that says nothing, and from
   * a session that is not waiting on anybody.
   *
   * **Its words are carried, never judged.** The engine owns no vocabulary for it and no enum of it: it is a container's
   * `state.waiting.reason`, a word a person reads, and Claude Code may add another in any release. `decide` never reads its
   * words, and nothing here turns it into a state — `state` already says a session waits on a person (`input-required`, or
   * `auth-required` to sign in), and this says what it waits on. Only whether it is there is read, and only for a
   * long-lived task (`idleOf`): one waiting on a person for something it names is not idle. Level-triggered like every
   * other field of a sighting: read afresh each pass, so a session that stops waiting simply stops carrying it.
   */
  waitingFor?: string;
  /**
   * A limit its configuration set that the harness says it ended the session at, in one word — `budget`, when `claude -p`'s
   * result says `subtype: error_max_budget_usd` (the cap its `config` gave it). As the harness printed it, never a measure
   * compared with a limit, which nothing here does. **Carried, never judged**: written on the attempt's end, and `decide`
   * does not read it — the session's end is its state, and whether a limit reached is a failure is the caller's to say.
   */
  limit?: string;
  /**
   * Every tool call the harness denied the session, as the harness recorded it, in the order it first did: a session
   * with no approval surface carries on past a denial, and this is the only trace of it. Absent when the harness denied
   * nothing, or cannot say (`claude --bg` records no denial anywhere the runner reads). **Carried, never judged**:
   * `decide` does not read it; a person, and the upper layer, do.
   */
  denials?: Denial[];
  /**
   * Every skill the session loaded, one per call, by its name without its plugin's: `[]` when it loaded none. Absent when the
   * harness cannot say. **Carried, never judged**: `decide` does not read it.
   */
  skills?: string[];
  /**
   * Every file the session read or wrote through its file tools, once, relative to its folder: `[]` when it touched none. Absent
   * when the harness cannot say. **Carried, never judged**: `decide` does not read it.
   */
  files?: string[];
  /**
   * What the session really ran on, as the harness resolved the alias it was asked for — `opus` is an alias, and which model it
   * names is the harness's to decide and moves with its version. Absent when the harness cannot say. **Carried, never judged**:
   * `decide` does not read it, and nothing here compares it with what was asked for. Named for what happened rather than for the
   * harness argument that asked for it, which the core may not so much as spell (`test/core-reads.test.ts`).
   */
  ranOn?: string;
  /**
   * Whether the harness still holds the session's process — Claude Code's registry lists a pid for it. A fact about the
   * process, beside `state`, which is the turn's: a turn that ended (`completed`, or Claude Code's idle `blocked`) leaves a
   * process that is still there. Absent from a harness that cannot say, which reads as not held. Read by `decide` only for a
   * long-lived task (`restartPolicy`): held, its idle session is open (`idleOf`); listed live and not held, its harness is
   * respawning it (`respawning`).
   */
  held?: boolean;
  /** The id of the process the harness holds the session in, when it says. Journalled for a long-lived task as it changes. */
  pid?: number;
  /**
   * The link that opens the session in a browser or on a phone, where its harness bridged it there, or why there is none as a
   * sentence: Claude Code's Remote Control, read off the registration it writes for the process. Absent from a harness that cannot
   * say, and from a session it holds no process for. **Carried, never judged**: `decide` does not read it, and the view says
   * whether it was asked for (`TaskView.bridge`).
   */
  bridge?: Bridge;
  /**
   * The tool call the session is in, the earliest of those in flight, and since when (ISO), for a harness that sees its calls start and
   * end (Claude Code attached on the Agent SDK). Absent between two calls, and from a harness that cannot say. **Carried, never
   * judged**: `decide` does not read it; a person learns from it which call a stop of the engine's process waits for.
   */
  calling?: { tool: string; since: string };
  /**
   * The questions the session is waiting on a person for, each held open where its task may ask one (`config.mayAsk`), for a harness
   * that holds such a call (Claude Code attached on the Agent SDK). `[]` from such a harness while none waits, and absent from one
   * that cannot say. **Carried, never judged**: `decide` does not read it; a layer above draws each question and answers it
   * (`RunnerOps.answer`).
   */
  asks?: SessionAsk[];
  /**
   * The asks of this session whose held call took the person's answer, by their ids, for the same harness. What tells an answer that
   * reached the session through its own call from one whose call was cut — a turn ended, a holder let go — which the layer above owes
   * the session as words instead. **Carried, never judged.**
   */
  asksTaken?: string[];
};

/**
 * One question a session is waiting on a person for, as its harness recorded the call: the call's own id, when it was made, and the
 * questions it asked. Carried whole, in the harness's own shape — what a question means, and which of them a person sees first, is the
 * layer above's.
 */
export type SessionAsk = { id: string; at: string; questions: AskQuestion[] };

/**
 * One question of an ask: what it asks, the short word it is labelled by, the choices offered, and whether a person may pick several.
 * Carried, never judged.
 */
export type AskQuestion = { question: string; header: string; options: AskOption[]; multiSelect: boolean };

/** One choice of a question: what it reads as, what it means, and the mock-up it carries where it has one. Carried, never judged. */
export type AskOption = { label: string; description: string; preview?: string };

/** A session's bridge: the link that opens it, or no link and why, in words that say what to do. */
export type Bridge = { url: string } | { url: null; why: string };

/**
 * One tool call a harness denied: the tool, and what it was asked for — a command's first word, a skill's name, a
 * file's path — when the harness said. Printed `Tool(what)`, as a permission rule is written.
 */
export type Denial = { tool: string; what?: string };

/** A denial as a person reads it, and as a permission rule is written: `Bash(pytest)`, `Skill(look)`, `WebFetch`. */
export const denialText = (d: Denial): string => (d.what ? `${d.tool}(${d.what})` : d.tool);

/**
 * What a session consumed, as its runner measured it.
 *
 * Every field is a measurement. A count the runner could not see is absent, never 0, and a runner
 * that measured nothing reports no usage at all, so its attempt records `null`. A zero that means
 * "nobody counted" reads as "cost nothing", which is the one reading a record must never allow.
 */
export type Usage = {
  /**
   * Model responses, each counted once however many lines it was written as. Absent from a runner
   * that cannot see them: Codex's stream reports turns of a prompt, not the responses inside one.
   */
  turns?: number;
  /** Tool calls the model made. Absent when its runner could not count them. */
  toolCalls?: number;
  /**
   * Every input token the model read, cached ones included: the sum of the three classes below when its runner measured
   * them, and a field of its own so a journal an older runtime wrote, which has only this, still folds.
   */
  inputTokens?: number;
  /**
   * The input tokens in their three classes, as the runner measured them — priced some twenty-fold apart, so a sum hides
   * what an attempt cost: read from the cache, written to it, and neither. Each absent when its runner could not see it.
   */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  uncachedTokens?: number;
  /**
   * How large the attempt's context got: the largest input — the three classes together — any one of its responses read.
   * A resumed attempt's first response carries its parent's conversation, so its peak starts where its parent ended.
   */
  peakContextTokens?: number;
  /**
   * The attempt's first response: the context it read, and how much of it was written to the cache. A continuation's first
   * response reads its parent's conversation — from the cache, or, where the cache missed, written to it again at a write's
   * price. Absent where the runner saw no single response.
   */
  firstContextTokens?: number;
  firstCacheWriteTokens?: number;
  /**
   * How many times the attempt compacted its conversation: past about its window, a session summarises and carries on. Absent where none
   * was seen.
   */
  compactions?: number;
  outputTokens?: number;
  /**
   * What the session cost, in dollars, as its harness priced it — never computed here from tokens. Claude Code writes a
   * session's total into its transcript as its process exits (`cost-state`), and `claude -p` prints it as it exits
   * (`total_cost_usd`). This attempt's own: a resumed session's total, which carries the one before it, less that one.
   */
  costUsd?: number;
  /** Milliseconds spent waiting on the model's API, as the harness counted them. This attempt's own, as `costUsd` is. */
  apiMs?: number;
  /** Milliseconds spent running tools, as the harness counted them. This attempt's own, as `costUsd` is. */
  toolMs?: number;
  /**
   * The harness used a model it has no price for, so its total is not the whole cost: `costUsd` is absent rather than
   * too low, and this says why (Claude Code's `hasUnknownModelCost`).
   */
  unpricedModel?: true;
};

/** The join key. Deterministic, so it survives anything that kills this process. */
export const nameFor = (taskId: string, attempt: number) => `ae/${taskId}/${attempt}`;

/** The runtime's task and the attempt a session name carries, or `undefined` for a name that is not `ae/<task>/<n>`. */
export const nameParts = (name: string): { taskId: string; n: number } | undefined => {
  const [, taskId, n] = /^ae\/(.+)\/([1-9][0-9]*)$/.exec(name) ?? [];
  if (taskId === undefined || n === undefined) return undefined;
  const parts = { taskId, n: Number(n) };
  return nameFor(parts.taskId, parts.n) === name ? parts : undefined;
};

/**
 * Why an attempt ended, in the only categories the engine can tell apart.
 *
 *   `harness`      the harness reported a terminal state — or the session went quiet, which is the only end it has.
 *                  It ran, and this is what it concluded. Whether it gave the closing statement its task asked for
 *                  is `stated` on the end, a fact beside the reason: the layer above judges it, not the engine.
 *   `lost`         we never heard: the session vanished, or a detached worker stopped beating.
 *                  The work in the transcript is real; nobody said it was finished.
 *   `unsigned`     only in a journal an older runtime wrote, whose engine judged a session that ended without the
 *                  closing statement its task asked for, and recorded it `failed`. This engine judges no such end: it
 *                  is `harness` with `stated: false`. A task whose last attempt ended `unsigned` settles `failed`
 *                  with a note that says so (`attemptNote` in `lifecycle.ts`).
 *   `unstartable`  the spawn failed and the harness vouched that nothing started. Nothing ran.
 *                  A harness that ended the session at a limit its configuration set — a spend cap — ends it `harness`
 *                  too, with the limit beside it (`limit`), a fact the layer above judges. A journal an older runtime
 *                  wrote may record such an end `budget`, which is read as `harness` with `limit: 'budget'`
 *                  (`upgrade` in `journal.ts`).
 *   `operator`     a person asked the task to stop, and the attempt was stopped before its harness ended it. Recorded
 *                  `stopped`. A journal an older runtime wrote may settle such an attempt without ending it.
 *   `deadline`     the task ran past its deadline, and the attempt was stopped before its harness ended it. Recorded
 *                  `failed`, and the task settles `failed`.
 *
 * Every ended attempt carries the agent's statement, untouched, or one of these as the reason it has none — never
 * neither, and never words the machine wrote in the agent's name. (`harness` on a task that asked for no statement:
 * the harness's own state is all it has, and all it was asked for.)
 *
 * The runtime makes one attempt per start: whatever the reason, an attempt that did not succeed and
 * was not stopped settles its task `failed`. The reason is recorded rather than inferred later so that the layer
 * above, which decides whether to try again and which session to continue, can tell a lost session's unjudged work
 * from a conclusion and from a spawn that ran nothing.
 */
export type EndReason = 'harness' | 'lost' | 'unsigned' | 'unstartable' | 'operator' | 'deadline';

/**
 * One entry of a task's journal. Every side effect is bracketed by two entries: the intent, then the result. That bracket
 * is what makes a crash between them recoverable — `decide` can always tell which side it is on.
 *
 * - `filed`: the desired state, stated once. A `filed` an older runtime wrote may also carry keys folded unread:
 *   `maxAttempts` and `resume`, how many attempts a turn had and which session a later one continued — the runtime makes
 *   one attempt per start, and trying again is the layer above's. It may carry the spend
 *   cap beside `config`, read as one of the harness's arguments, under it (`upgrade` in `journal.ts`).
 * - `starting`: INTENT — the engine is about to spawn `nameFor(taskId, attempt)`. `nudge` is what a continued session is
 *   told instead of the brief — a later turn's answer; in a journal an older runtime wrote, also why a session that
 *   stopped unsigned was back — decided here with `resumeFrom`, and never re-derived.
 * - `spawned`: RESULT — the spawn call returned, and the session is the harness's problem now. `error` when the call
 *   failed without the harness vouching that nothing started: whether a session exists is then the grace window's to
 *   find out.
 * - `ended`: an attempt reached a terminal state, as observed — never as assumed. `usage`, `exitCode`, `denials`, `skills`,
 *   `files`, `ranOn` and `limit` come from the same sighting, when its runner measured them; `decide` reads none of them.
 *   `stated`, on an end read off a sighting of a task that asked for a closing statement: whether one came. A fact, never a
 *   verdict — `decide` does not read it, and the layer above judges what a missing statement means. Absent from an end an older runtime
 *   wrote, and from an end with no sighting behind it (`lost`, `unstartable`, a cut).
 * - `measured`: what an ended attempt consumed, read once its session was let go — for a harness that writes part of it
 *   only as the session's process exits, which is after the end was written (Claude Code's cost). Merged into the
 *   attempt's `usage`. A fact for the record, written once; `decide` never reads it.
 * - `counted`: what a long-lived attempt in flight has consumed so far, its counts and never a cost, written by the engine off a
 *   sighting each time they differ from the record (`countedFacts`). Replaces the attempt's `usage` whole, so a count its runner
 *   no longer gives — tokens past a compaction — is dropped, not kept stale; an end that carries none keeps it. `decide` never
 *   reads it.
 * - `denied`: a tool call the harness refused the attempt in flight, as it said so while the attempt ran: written by the engine
 *   off a working sighting, once per denial past those the attempt holds (`deniedFacts`). Joins the attempt's `denials`; an
 *   end that names its own replaces them. `decide` never reads it.
 * - `stop-requested`: the operator asked for it to stop.
 * - `said`: a person's words, handed to the session of the attempt in flight through its harness (`say`). Written once
 *   the harness took them, so it means they were handed over — not that the session read them, or did what they asked.
 *   `after` is the last event the session's transcript held just before they were handed over, read on the session's own
 *   record, so whatever the session wrote of them stands after it in that order; null when it held none or could not be read.
 *   `decide` never reads it: what was said to a session is a fact for whoever reviews the work, not a judgement on it.
 * - `input`: a person's answer to a task held open and waiting (A2A's follow-up message on an `INPUT_REQUIRED` task): the
 *   words its next turn is told, continuing the session that signed, and what that turn's configuration gives for itself
 *   when they gave any — its spend cap. Read by `decide`: an input starts a turn. Refused by `answer` unless the task
 *   waits for one.
 * - `closed`: a person's word that a task held open is finished with: it settles once no attempt of it runs. Read by
 *   `decide`.
 * - `admitted`: the layer above's word that a queued task's current turn may start: the next pass starts it. Names no
 *   turn: it admits the turn current when it is written, and a later turn — a person's answer to a task held open — waits
 *   for one of its own. Written by `admit`, and only while the task waits for it.
 * - `gap`: a long-lived attempt's session was first listed live with no process — its harness respawning it — at `at`.
 *   Written once per gap, by the engine off a sighting (`sightingFacts`); `decide` reads when it opened (`gapSince`).
 * - `process`: the same attempt's session was listed held in a process — `pid`, when its harness said — after a gap, or
 *   in a process it had not been seen in. Closes the gap. Written by the engine off a sighting; reported, never acted on.
 * - `settled`: terminal. Nothing moves after this. `nativeId` is the session of an attempt it left open — stopped by a
 *   person, or past its deadline, with no `ended` to carry it — as the harness still listed it: what `logs` reads once
 *   that session has been let go. `decide` never reads it.
 */
export type Event =
  | {
      kind: 'filed';
      at: string;
      brief: string;
      cwd: string;
      /** Which harness runs it: the adapter's name. */
      harness?: string;
      deadlineSeconds?: number;
      /** A session of this harness that the task's attempt should continue rather than start cold. */
      resumeFrom?: string;
      /**
       * The harness's arguments — model, permission mode, effort, tools, MCP servers, context window, worktree, bridge —
       * as one object, `HarnessArgs`. Carried, never read here: a runner hands them to its harness, and `decide` never
       * learns what any of them is. A journal an older runtime wrote may have them beside it, and is read as though it
       * had them here (`upgrade` in `journal.ts`).
       */
      config?: HarnessArgs;
      /**
       * A JSON Schema for the workload's closing statement, handed to the harness verbatim.
       *
       * The workload's own word on whether it has finished, which is worth more than anything we
       * can infer from outside. The engine passes the schema through and records what comes back;
       * it never learns the shape, because the shape is somebody else's vocabulary.
       */
      closeoutSchema?: object;
      /**
       * Filed to wait for the layer above's word: each turn starts only once an `admitted` entry names it, and a task not
       * queued starts on the next pass. Written on every filing, `false` when not asked for; a journal an older runtime
       * wrote has no key and reads as queued, so a store an older daemon filed into is held for the layer above's
       * admission rather than started all at once. A Job's `suspend: true`.
       */
      queued?: boolean;
      /**
       * Which waiting task a free slot of its pool goes to first, higher first: a Pod's priority. Carried for the pass's
       * admission (`core/admission.ts`), never read by `decide`. Absent reads as 0.
       */
      priority?: number;
      /**
       * Held open: an attempt that ends signed leaves the task waiting on a person — `input-required`, no process
       * running — rather than settled. Their answer (`input`) is a new turn, an attempt continuing the session; a `closed`
       * settles it. Absent on a task not held open, which settles on its first signed end.
       */
      holdOpen?: true;
      /**
       * Filed long-lived, a Pod's `restartPolicy: Always`: a session that stays open while idle, whose end of a turn, idle
       * listing or silence is not its end, and that only a stop from outside ends. Absent on a job, which runs to its end.
       */
      restartPolicy?: 'Always';
      /**
       * The layer above's labels, a Pod's `metadata.labels`: names to texts its sessions' telemetry says beside the task's id.
       * Carried for the runner, never read by `decide`. Absent when none were given.
       */
      labels?: Record<string, string>;
      /** The W3C trace context of the span that filed the task, when its engine exports. Carried for the runner, never read by `decide`. */
      traceparent?: string;
    }
  | { kind: 'starting'; at: string; attempt: number; resumeFrom?: string; nudge?: string; mono?: Monotonic }
  | { kind: 'spawned'; at: string; attempt: number; error?: string; mono?: Monotonic }
  | {
      kind: 'ended';
      at: string;
      attempt: number;
      sessionId: string;
      observed: Outcome;
      reason: EndReason;
      nativeId?: string;
      closeout?: unknown;
      stated?: boolean;
      usage?: Usage;
      exitCode?: number;
      denials?: Denial[];
      skills?: string[];
      files?: string[];
      ranOn?: string;
      limit?: string;
      error?: string;
      mono?: Monotonic;
    }
  | { kind: 'measured'; at: string; attempt: number; usage: Usage }
  | { kind: 'counted'; at: string; attempt: number; usage: Usage }
  | ({ kind: 'denied'; at: string; attempt: number } & Denial)
  | { kind: 'gap'; at: string; attempt: number; mono?: Monotonic }
  | { kind: 'process'; at: string; attempt: number; pid?: number }
  | { kind: 'stop-requested'; at: string }
  | ({ kind: 'said' } & Said)
  | ({ kind: 'input' } & Input)
  | { kind: 'closed'; at: string }
  | { kind: 'admitted'; at: string }
  | { kind: 'settled'; at: string; outcome: Outcome; note?: string; nativeId?: string };

/**
 * Words said to a running attempt's session, when the engine wrote them down, and where its transcript stood as they were handed over
 * (`after`): a fold gives every entry one, null where the journal holds none. See the `said` event.
 */
export type Said = { at: string; attempt: number; text: string; after?: TranscriptMark | null };

/**
 * A person's answer to a task held open, and what the turn it starts gives its configuration for itself when they gave any
 * (`TURN_ARGS` in `harness/args.ts`: its spend cap), over the task's own. Carried whole, never opened here. See the `input` event.
 */
export type Input = { at: string; text: string; config?: HarnessArgs };

export type Attempt = {
  n: number;
  /** When the intent was journalled. The deadline runs from the FIRST of these, not from filing:
   *  a task queued for admission has not started burning its time. */
  startedAt: string;
  /** The same moment on the monotonic clock, when the engine that journalled it read one. */
  startedMono?: Monotonic;
  /** Null until the spawn call returned: the window a crash can land in. */
  spawnedAt: string | null;
  /** The spawn's moment on the monotonic clock, when the engine that journalled it read one. */
  spawnedMono?: Monotonic;
  ended: Outcome | null;
  /** The `at` of the `ended` entry: when the engine wrote the end down. Null while the attempt runs. */
  endedAt: string | null;
  /** The end's moment on the monotonic clock, when the engine that journalled it read one. */
  endedMono?: Monotonic;
  reason: EndReason | null;
  /** The harness's own id for this attempt, once something has seen it. What `--resume` takes. */
  nativeId: string | null;
  /** What this attempt was told to continue, decided when it started and never re-derived. */
  resumeFrom?: string;
  /**
   * What it was told instead of the task's brief: a later turn's answer (in a journal an older runtime wrote, also why an unsigned session
   * was back). Carried, never read.
   */
  nudge?: string;
  /** What the workload said when this attempt ended, if it said anything. Carried, never read. */
  closeout?: unknown;
  /**
   * Whether the closing statement its task asked for came, as its end reported it: `false` is a session its harness
   * let go with none. Absent where its task asked for none, where no sighting ended it, and on an end an older runtime
   * wrote. Carried, never read: whether that is a failure is the caller's judgement, not the runtime's.
   */
  stated?: boolean;
  /** What this attempt consumed; `null` when its runner measured nothing, never zeros. Carried, never read. */
  usage: Usage | null;
  /** How its process exited; `null` for a harness whose process is not ours, or one that never exited. */
  exitCode: number | null;
  /** The tool calls its harness denied, when it denied any and said so. Carried, never read. */
  denials?: Denial[];
  /** The skills its session loaded, `[]` for none, when its harness said. Carried, never read. */
  skills?: string[];
  /** The files its session read or wrote, relative to its folder, `[]` for none, when its harness said. Carried, never read. */
  files?: string[];
  /**
   * What its session really ran on, as its harness resolved the alias the task asked for, when its harness said. Absent from an
   * attempt an older runtime recorded, and from one whose harness cannot say. Carried, never read.
   */
  ranOn?: string;
  /** The limit its configuration set that its harness says it ended the session at — `budget` — when it said one. Carried, never read. */
  limit?: string;
  /**
   * Which turn of a task held open it belongs to: how many `input`s were journalled before it started. Absent for turn 0,
   * so every attempt of a task not held open — and of a journal an older runtime wrote — folds as turn 0.
   */
  turn?: number;
  /** What a failed spawn call said: the refusal behind `unstartable`, or an error after which a session may still exist. */
  error?: string;
  /** When its session was first listed with no process, while no process has been seen since: an open gap. See `gap`. */
  gapSince?: string;
  /** The moment the open gap began on the monotonic clock, when the engine that journalled it read one. */
  gapMono?: Monotonic;
  /** The processes its session was seen held in, in order, as journalled. Carried, never read but for the last. See `process`. */
  processes?: number[];
};

export type State = {
  taskId: string;
  /** The `at` of its `filed` entry. `decide` never reads it: which waiting task a pass admits first is the pass's order. */
  filedAt?: string;
  /** Which waiting task a free slot goes to first, as filed. See the `filed` event. `decide` never reads it. */
  priority?: number;
  brief: string;
  cwd: string;
  /** Which harness runs it. `decide` never reads this — only the runner dispatches on it. */
  harness?: string;
  /** Wall clock across all attempts. Absent means no limit. */
  deadlineSeconds?: number;
  /** What the task's first turn continues. Set at filing. */
  resumeFrom?: string;
  /** The harness's arguments, as filed. See the `filed` event. `decide` never reads them. */
  config?: HarnessArgs;
  /** The shape of the workload's closing statement. See the `filed` event. */
  closeoutSchema?: object;
  attempts: Attempt[];
  /** What a person said to the task's sessions while they ran, in the order it was said. Carried, never read. */
  said: Said[];
  /** Filed to be held open: a signed end waits on a person. See the `filed` event. */
  holdOpen?: true;
  /** Filed long-lived: only a stop from outside ends its session. See the `filed` event. */
  restartPolicy?: 'Always';
  /** The layer above's labels, as filed. See the `filed` event. `decide` never reads them. */
  labels?: Record<string, string>;
  /** The trace context of the span that filed the task. See the `filed` event. `decide` never reads it. */
  traceparent?: string;
  /** Filed to wait for the layer above's word: absent on a journal an older runtime wrote, which reads as queued. See the `filed` event. */
  queued?: boolean;
  /** The turn the last `admitted` entry admitted, which is the turn current when it was written. See the `admitted` event. */
  admitted?: number;
  /** A person's answers to a task held open, in the order given. Each starts a turn; the current turn is how many there are. */
  inputs: Input[];
  /** A person closed a task held open: it settles once no attempt of it runs. */
  closed: boolean;
  stopRequested: boolean;
  settled: Outcome | null;
};

/**
 * Ends the attempt `a` as the `ended` event `e` says: an empty list of skills or files kept, an empty one of denials not, and an end with
 * no usage keeping what was counted while it ran (`counted`).
 */
function endAttempt(a: Attempt, e: Extract<Event, { kind: 'ended' }>): void {
  a.ended = e.observed;
  a.endedAt = e.at;
  if (e.mono) a.endedMono = e.mono;
  a.reason = e.reason;
  a.nativeId = e.nativeId ?? a.nativeId;
  a.closeout = e.closeout;
  if (e.stated !== undefined) a.stated = e.stated;
  a.usage = e.usage ?? a.usage;
  a.exitCode = e.exitCode ?? null;
  if (e.denials?.length) a.denials = e.denials;
  if (e.skills) a.skills = e.skills;
  if (e.files) a.files = e.files;
  if (e.ranOn) a.ranOn = e.ranOn;
  if (e.limit) a.limit = e.limit;
  a.error = e.error ?? a.error;
}

/** An event about one attempt, `e`, written into that attempt's fold `a`. */
function foldInto(
  a: Attempt,
  e: Extract<Event, { kind: 'spawned' | 'ended' | 'measured' | 'counted' | 'denied' | 'gap' | 'process' }>,
): void {
  switch (e.kind) {
    case 'spawned':
      a.spawnedAt = e.at;
      if (e.mono) a.spawnedMono = e.mono;
      a.error = e.error;
      return;
    case 'ended':
      return endAttempt(a, e);
    case 'measured':
      a.usage = { ...a.usage, ...e.usage };
      return;
    case 'counted':
      a.usage = e.usage;
      return;
    case 'denied':
      a.denials = [...(a.denials ?? []), e.what === undefined ? { tool: e.tool } : { tool: e.tool, what: e.what }];
      return;
    case 'gap':
      if (a.gapSince === undefined && e.mono) a.gapMono = e.mono;
      a.gapSince ??= e.at;
      return;
    case 'process':
      delete a.gapSince;
      delete a.gapMono;
      if (e.pid !== undefined) a.processes = [...(a.processes ?? []), e.pid];
  }
}

/** The task as the `filed` event `e` states it, written into the fold `s`. */
function fileInto(s: State, e: Extract<Event, { kind: 'filed' }>): void {
  s.filedAt = e.at;
  s.brief = e.brief;
  s.cwd = e.cwd;
  s.harness = e.harness;
  s.deadlineSeconds = e.deadlineSeconds;
  s.resumeFrom = e.resumeFrom;
  s.config = e.config;
  s.closeoutSchema = e.closeoutSchema;
  if (e.holdOpen) s.holdOpen = true;
  if (e.restartPolicy === 'Always') s.restartPolicy = 'Always';
  if (e.queued !== undefined) s.queued = e.queued;
  if (e.priority !== undefined) s.priority = e.priority;
  if (e.labels !== undefined) s.labels = e.labels;
  if (e.traceparent !== undefined) s.traceparent = e.traceparent;
}

/** Observed state, folded. A `State` is never stored — it is always re-derived from the journal. */
export function fold(taskId: string, events: readonly Event[]): State {
  const s: State = {
    taskId,
    brief: '',
    cwd: '',
    attempts: [],
    said: [],
    inputs: [],
    closed: false,
    stopRequested: false,
    settled: null,
  };
  for (const e of events) {
    switch (e.kind) {
      case 'filed':
        fileInto(s, e);
        break;
      case 'admitted':
        s.admitted = s.inputs.length;
        break;
      case 'starting':
        s.attempts.push({
          n: e.attempt,
          startedAt: e.at,
          ...(e.mono ? { startedMono: e.mono } : {}),
          spawnedAt: null,
          ended: null,
          endedAt: null,
          reason: null,
          nativeId: null,
          resumeFrom: e.resumeFrom,
          ...(e.nudge ? { nudge: e.nudge } : {}),
          usage: null,
          exitCode: null,
          ...(s.inputs.length ? { turn: s.inputs.length } : {}),
        });
        break;
      case 'spawned':
      case 'ended':
      case 'measured':
      case 'counted':
      case 'denied':
      case 'gap':
      case 'process': {
        const a = s.attempts.find((x) => x.n === e.attempt);
        if (a) foldInto(a, e);
        break;
      }
      case 'stop-requested':
        s.stopRequested = true;
        break;
      case 'said':
        s.said.push({ at: e.at, attempt: e.attempt, text: e.text, after: e.after ?? null });
        break;
      case 'input':
        s.inputs.push({ at: e.at, text: e.text, ...(e.config ? { config: e.config } : {}) });
        break;
      case 'closed':
        s.closed = true;
        break;
      case 'settled': {
        s.settled = e.outcome;
        const open = s.attempts.at(-1);
        if (open && open.ended === null && e.nativeId) open.nativeId = e.nativeId;
        break;
      }
    }
  }
  return s;
}

/**
 * Turn `n` of a task (the current one by default), by pure arithmetic over the fold, so `decide` reads a turn and not the
 * journal's order: its attempts; the session it continues — for a later turn, the one that signed the turn before it,
 * and none if its harness recorded none; for the first, what the task was filed against; the words it is told instead of
 * the brief — every answer given since the turn before it started, so two answers that raced are both heard; and what its
 * configuration gives for itself — the last one given with those words, whole, which the engine lays over the filing's
 * (`configForTurn`). Turn 0 is the task as filed: every attempt of a task not held open, told the brief, with nothing of
 * its own.
 */
export function turnOf(state: State, n = state.inputs.length) {
  const attempts = state.attempts.filter((a) => (a.turn ?? 0) === n);
  const before = state.attempts.filter((a) => (a.turn ?? 0) < n);
  const given = n === 0 ? [] : state.inputs.slice(before.at(-1)?.turn ?? 0, n);
  return {
    n,
    attempts,
    continues: n === 0 ? state.resumeFrom : (before.at(-1)?.nativeId ?? undefined),
    words: given.length ? given.map((i) => i.text).join('\n\n') : undefined,
    config: [...given].reverse().find((i) => i.config)?.config,
  };
}

/**
 * A task held open, its current turn ended `succeeded` (with its statement or without), not closed and not settled: it waits on a person's
 * answer, with no process running.
 */
export function waitsForInput(state: State): boolean {
  const last = state.attempts.at(-1);
  return (
    state.holdOpen === true && !state.settled && !state.closed && last?.ended === 'succeeded' && (last.turn ?? 0) === state.inputs.length
  );
}

/** A task a person may ask to stop (`requestStop`): not settled, and not asked to stop already. */
export const stoppable = (state: State): boolean => !state.settled && !state.stopRequested;

/** A task a person may answer or close: waiting on their word (`waitsForInput`), and not asked to stop, which outranks it. */
export const awaitsWord = (state: State): boolean => waitsForInput(state) && !state.stopRequested;

/** Each guard a verb of `VERBS` names, by that name: the predicate its refusal asks of the task's state. */
export const VERB_GUARDS: Record<VerbGuard, (state: State) => boolean> = { stoppable, awaitsWord };

/** Whether a person's verb is taken in this state: the guard `VERBS` names for it, asked of the state. */
export const verbTakes = (verb: VerbName, state: State): boolean => {
  const guard = VERBS.find((v) => v.verb === verb)?.guard;
  return guard !== undefined && VERB_GUARDS[guard](state);
};

/**
 * Whether the task waits for the layer above's word to start its current turn: queued — or filed by an older runtime,
 * without the key, which reads as queued — not settled, not asked to stop, no attempt in flight, its turn not yet
 * started, not waiting on a person and not closed, and no `admitted` entry for this turn. The one reading of it:
 * `decide` holds the start on it, `admit` writes an entry only while it holds, and a view says `queued` by it.
 */
export function awaitsAdmission(state: State): boolean {
  return admissionOf(state) === 'queued';
}

/**
 * Where a queued task stands with the layer above, for a view: `queued` while it waits for its word, `admitted`
 * once given and until the turn starts — a slot the upper layer has handed out — and nothing for a task not queued, or
 * one whose turn has started or has nothing left to start, which the phase says.
 */
export function admissionOf(state: State): 'queued' | 'admitted' | undefined {
  if (state.queued === false || state.settled || state.stopRequested) return undefined;
  const last = state.attempts.at(-1);
  if (last && last.ended === null) return undefined;
  if (state.holdOpen && (state.closed || waitsForInput(state))) return undefined;
  const turn = turnOf(state);
  if (turn.attempts.length > 0) return undefined;
  return state.admitted === turn.n ? 'admitted' : 'queued';
}

/**
 * The one step `decide` names:
 *
 * - `nothing`: nothing to do. Not an error — the common case on a busy board. `refused` when the lifecycle has no edge for
 *   what was seen.
 * - `start`: journal the intent to run attempt N, continuing `resumeFrom`, what its turn continues — told `nudge`, a later
 *   turn's answer, instead of the brief.
 * - `spawn`: an intent with no spawn behind it. Named in advance, so this cannot double-start.
 * - `record-end`: the harness says this attempt is over — or, `unstartable`, refused to start it, in its words (`error`).
 *   Write it down.
 * - `stop`: stop a session its harness still holds — for a person, for the deadline, or to continue it. Its end is read
 *   on a later pass.
 * - `settle`: the task's terminal entry, its outcome and, where one says why, a `note`.
 */
export type Action =
  | { do: 'nothing'; why: string; refused?: Refusal }
  | { do: 'start'; attempt: number; resumeFrom?: string; nudge?: string }
  | { do: 'spawn'; attempt: number; name: string }
  | {
      do: 'record-end';
      attempt: number;
      sessionId: string;
      observed: Outcome;
      reason: EndReason;
      nativeId?: string;
      closeout?: unknown;
      stated?: boolean;
      error?: string;
    }
  | { do: 'stop'; sessionId: string; why: string }
  | { do: 'settle'; outcome: Outcome; note?: string };

/**
 * The clock, and how long a spawned session may go unregistered before it is lost. How many sessions may be at work at
 * once is not here: the layer above chooses what starts and `admit`s it, and a task it has admitted starts.
 */
export type Now = {
  at: Date;
  /**
   * The same moment on the monotonic clock: a duration from a journalled moment stamped in the same boot is measured on it
   * (`elapsedMs`), and on the wall clock `at` otherwise. Absent where the machine gives no monotonic reading.
   */
  mono?: Monotonic;
  graceMs: number;
  /**
   * The session names the pass's observation could not read (`Observation.unread`): its harness failed to list them, so a
   * name here that no sighting has is neither there nor gone. Absent, every name was read.
   */
  unread?: ReadonlySet<string>;
};

/**
 * How long a long-lived task's session may be listed with no process before the runtime ends its attempt `lost`: Claude Code
 * respawns a process it lost within some ten seconds, and one listed so for two minutes is not coming back.
 */
export const RESPAWN_GAP_MS = 120_000;

/**
 * How long a long-lived task waits to restart a session that ended, a kubelet's back-off: `initialMs` after one end,
 * `factor` times longer after each end in a row, never past `maxMs`; an attempt that ran `resetAfterMs` counts them again.
 */
export const RESTART_BACKOFF = { initialMs: 10_000, factor: 2, maxMs: 300_000, resetAfterMs: 600_000 } as const;

/** What a restarted session is told instead of the brief, on the conversation it continues. */
export const RESTART_WORDS = 'Your session was restarted after its process ended. Carry on where you left off.';

/**
 * A settled task: nothing is observed of it and nothing is decided, on any pass. `decide`'s first question, ahead of the
 * lifecycle — a settled task's state is final and takes no event, so asking would refuse every settled task in the store
 * on every pass — and the one a pass may ask to skip a settled task before it reads anything else of it.
 */
export const settledQuiet = (state: State): boolean => state.settled !== null;

/**
 * One step toward the desired state. Pure, total, and safe to call as often as you like —
 * calling it twice in a row with the same inputs returns the same answer, which is the whole
 * definition of level-triggered.
 *
 * Three readings and a move: where the task stands, read off its journal (`lifecycleOf`);
 * what the pass saw of it (`observe`); and the lifecycle's edge for that event in that state (`transition`, in
 * `lifecycle.ts`), which names the next state and the one action. An event with no edge is refused, and the refusal is
 * the answer: nothing is done, and the pass reports it. `move` is the lifecycle's; a test hands another to plant a refusal.
 */
export function decide(state: State, observed: ReadonlyMap<string, Sighting>, now: Now, move: Move = transition): Action {
  if (settledQuiet(state)) return { do: 'nothing', why: `settled: ${state.settled}` };
  const from = lifecycleOf(state);
  const event = observe(state, observed, now);
  const moved = move(from, event);
  return 'refused' in moved
    ? { do: 'nothing', why: `refused: no edge from ${from} on ${event.type}`, refused: moved.refused }
    : moved.action;
}

/**
 * Where a task stands in its lifecycle, off its journal alone: the state `decide` moves it from. The same journal reads the
 * same state after any restart, so the machine keeps nothing, and a state is only what the record can tell apart — a
 * session blocked on a person is `working` here, and its sighting says the rest.
 *
 * The rules, in order, the first that holds answering:
 *
 * 1. Settled: the final state its outcome names — `completed`, `canceled` or `failed`.
 * 2. A person asked it to stop: `stopping`. The operator's intent outranks everything except a terminal state.
 * 3. Its last attempt has not ended: `working` once spawned, else `starting`.
 * 4. Held open and closed by a person: `ending`.
 * 5. Held open and waiting on a person's answer (`waitsForInput`): `input-required`.
 * 6. Its current turn has an attempt, all ended: `ending`; else `submitted`.
 */
export function lifecycleOf(state: State): LifecycleState {
  if (state.settled) return state.settled === 'succeeded' ? 'completed' : state.settled === 'stopped' ? 'canceled' : 'failed';
  if (state.stopRequested) return 'stopping';
  const last = state.attempts.at(-1);
  if (last && last.ended === null) return last.spawnedAt ? 'working' : 'starting';
  if (state.holdOpen && state.closed) return 'ending';
  if (waitsForInput(state)) return 'input-required';
  return turnOf(state).attempts.length > 0 ? 'ending' : 'submitted';
}

/**
 * What a pass saw of a task: one event, from its journal and the pass's sightings, recomputed on every pass. It names what
 * was seen — the harness let the session go, the deadline passed, nothing runs and the turn ended `failed` — and never
 * what to do about it, which is the edge's.
 *
 * The deadline is measured over the time the task has been RUNNING — its current turn, for a task held open — from the
 * first attempt's intent rather than from filing: a task queued for admission has not started burning its time, and a
 * deadline that expired in the queue would be a ceiling that quietly fails work instead of delaying it. It is also the
 * only thing that ends a blocked session: one waiting on a person is running, forever, as far as every other rule here is
 * concerned. Every duration judged here — the deadline, the grace window, a respawn's gap, a restart's backoff and its
 * reset — is measured by `elapsedMs`: on the monotonic clock between two moments journalled in one boot, so a stepped wall
 * clock ends none early nor holds one past its due, and on the wall clock otherwise.
 *
 * With an attempt in flight, the first rule that holds answers:
 *
 * 1. `DEADLINE_PASSED`, when it is overdue, a person has not asked it to stop, and its sighting has not ended on its own.
 *    The deadline stops what runs and ends what it cut; an end its harness recorded is judged by that end, as it would be
 *    in time, since a pass steps a task until nothing moves and so reads an end recorded past the deadline past it too. A
 *    person's stop outranks the deadline.
 * 2. Its sighting, read before the journal's own `spawnedAt`: a crash between the spawn call and its journal entry leaves
 *    a session running under a name that can still be found, so it is adopted rather than started a second time — the
 *    whole reason the name is ours. A long-lived task's session its harness is respawning (`respawning`),
 *    `SESSION_RESPAWNING` — or `RESPAWN_OVERDUE`, listed so `RESPAWN_GAP_MS` since the gap opened. Its idle session
 *    (`idleOf`), `SESSION_IDLE`: its turn's end, its idle listing and its silence are not its end. Waiting on a person,
 *    `SESSION_BLOCKED`. At work, `SESSION_QUIET` once quiet — its runner holds it has stopped, and that is its end; whether
 *    it gave the statement its task asked for is recorded beside it (`stated`) and judged by the layer above, for the
 *    engine reports and never nudges — else `SESSION_LIVE`.
 *    Canceled, `SESSION_STOPPED`; any other end, `SESSION_ENDED`.
 * 3. `UNREAD`, when its harness could not be read this pass: nothing is known of the session, and an absence read off a
 *    failed look is no absence, so it never counts toward `lost`. Read before `spawnedAt` for the reason above: an intent
 *    with no spawn on the record may be a session a crash left running, which an unread harness cannot rule out, so it is
 *    neither spawned again nor cut. The deadline, read above, still bounds it; for a person's stop, the edge reads
 *    `overdue`.
 * 4. `UNSPAWNED`, when its spawn is not on the record.
 * 5. Spawned, and the harness has never heard of the name: either it has not registered yet — a race measured in seconds
 *    — or the session is gone. A grace window tells the two apart: `UNSEEN_IN_GRACE` inside it, `LOST` past it.
 *
 * With nothing in flight, the first rule that holds answers:
 *
 * 1. `NOTHING_OPEN`, when a person asked it to stop.
 * 2. `CLOSED`, for a task held open and closed: it settles on how its last attempt ended.
 * 3. `AWAITING_INPUT`, for a task held open whose turn signed: it waits on a person for as long as they take — ahead of
 *    the deadline, which times work, not a person reading it.
 * 4. `DEADLINE_SPENT`, when it is overdue and its last attempt ended at the deadline.
 * 5. For a long-lived task whose attempt ended, no stop asked: its restart (`restartOf`) — unless its harness refused the
 *    spawn (`unstartable`), which waiting would not change, and it settles on that end, as a job does.
 * 6. `ATTEMPT_ENDED`, judged on the current turn's attempts, which are all of them for a task not held open. One attempt
 *    per start. For an `unstartable` end, the harness's words (`error`).
 * 7. `NO_SESSION_TO_CONTINUE`, for a later turn with no session to continue.
 * 8. `QUEUED`, while the turn waits for the layer above's word; it is started by the pass after the one that wrote it.
 *    Read after every terminal answer, so a queued task can still settle.
 * 9. `PREVIOUS_LIVE`, when the session the turn continues — for the first turn, what the task was filed against; for a
 *    later one, the session that signed the turn before it — is still held by its harness: it is stopped first.
 * 10. `READY` otherwise: in a later turn, told the person's answer; else the brief.
 */
export function observe(state: State, observed: ReadonlyMap<string, Sighting>, now: Now): LifecycleEvent {
  if (state.settled) return { type: 'SETTLED', outcome: state.settled };
  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(state.taskId, last.n)) : undefined;
  const turn = turnOf(state);

  const first = turn.attempts[0];
  const ranFor = first === undefined ? 0 : elapsedMs(startedWhen(first), instantOf(now));
  const overdue = state.deadlineSeconds !== undefined && first !== undefined && ranFor > state.deadlineSeconds * 1000;

  if (last && last.ended === null) return flightEvent(state, last, sighting, now, overdue);

  if (state.stopRequested) return { type: 'NOTHING_OPEN' };
  if (state.holdOpen && state.closed) return { type: 'CLOSED', ...(last ? { last: { n: last.n, ended: last.ended } } : {}) };
  if (waitsForInput(state)) return { type: 'AWAITING_INPUT' };
  if (overdue && last?.reason === 'deadline') return { type: 'DEADLINE_SPENT', seconds: Math.round(ranFor / 1000) };
  const ended = turn.attempts.at(-1);
  if (ended && restarts(state, ended)) return restartOf(state, ended, sighting, now);
  if (ended) return attemptEnded(ended, turn.attempts.length, turn.n);
  if (turn.n > 0 && !turn.continues) return { type: 'NO_SESSION_TO_CONTINUE', turn: turn.n };
  if (awaitsAdmission(state)) return { type: 'QUEUED' };
  if (turn.continues && sighting && isLive(sighting.state)) return { type: 'PREVIOUS_LIVE', sessionId: sighting.sessionId };
  return { type: 'READY', attempt: state.attempts.length + 1, resumeFrom: turn.continues, ...(turn.words ? { nudge: turn.words } : {}) };
}

/**
 * Whether `ended`, the last attempt of a task with nothing in flight and no stop asked, is restarted: for a long-lived task,
 * unless its harness refused the spawn (`unstartable`), which waiting would not change.
 */
const restarts = (state: State, ended: Attempt): boolean => state.restartPolicy === 'Always' && ended.reason !== 'unstartable';

/**
 * `ATTEMPT_ENDED` for `ended`, the last of `attempts` in turn `turn`: with the harness's words (`error`) only when it
 * refused the spawn, since a spawn error on an attempt that ended otherwise is not why it ended.
 */
function attemptEnded(ended: Attempt, attempts: number, turn: number): LifecycleEvent {
  const refusal = ended.reason === 'unstartable' && ended.error !== undefined ? { error: ended.error } : {};
  return { type: 'ATTEMPT_ENDED', ended: ended.ended, reason: ended.reason, attempts, turn, ...refusal };
}

/** Whether an overdue attempt's session is live, with the sighting that says so: a stop needs a session to send to. */
const liveOf = (sighting: Sighting | undefined): { live: true; sighting: Sighting } | { live: false; sighting?: Sighting } =>
  sighting && isLive(sighting.state) ? { live: true, sighting } : { live: false, sighting };

/** What `observe` reads off an attempt in flight, by its rules 2 to 4: its deadline, its sighting, or its absence. */
function flightEvent(state: State, last: Attempt, sighting: Sighting | undefined, now: Now, overdue: boolean): LifecycleEvent {
  const endedOwn = sighting !== undefined && ENDED_OWN.has(sighting.state);
  if (overdue && !state.stopRequested && !endedOwn) return { type: 'DEADLINE_PASSED', attempt: last.n, ...liveOf(sighting) };
  if (sighting) return sessionEvent(state, last, sighting, now);
  if (now.unread?.has(nameFor(state.taskId, last.n))) return { type: 'UNREAD', attempt: last.n, overdue };
  if (!last.spawnedAt) return { type: 'UNSPAWNED', attempt: last.n, name: nameFor(state.taskId, last.n) };
  return elapsedMs({ at: Date.parse(last.spawnedAt), mono: last.spawnedMono }, instantOf(now)) < now.graceMs
    ? { type: 'UNSEEN_IN_GRACE', attempt: last.n }
    : { type: 'LOST', attempt: last.n };
}

/**
 * Whether a long-lived task's session is idle as `sighting` shows it, open between turns: its harness still holds its process
 * (`held`), it computes nothing (`busy`), and its turn has ended — waiting on nobody it names (`input-required` with no
 * `waitingFor`, Claude Code's idle `blocked`), `completed`, or at work and quiet. Never for a job, whose turn's end is its end,
 * and never for a session that waits on a person for something it names, or to sign in.
 */
export const idleOf = (state: State, sighting: Sighting | undefined): boolean => {
  if (state.restartPolicy !== 'Always' || sighting?.held !== true || sighting.busy === true) return false;
  if (sighting.state === 'input-required') return sighting.waitingFor === undefined;
  return sighting.state === 'completed' || (RUNNING.has(sighting.state) && sighting.quietMs !== undefined);
};

/**
 * Whether a long-lived task's harness is respawning its session as `sighting` shows it: listed live, with no process
 * (`held: false`) — Claude Code's row for a session whose process died, which it restarts on the same conversation. Never for
 * a job, for a task asked to stop, or for a harness that cannot say whether it holds a process.
 */
export const respawning = (state: State, sighting: Sighting | undefined): boolean =>
  state.restartPolicy === 'Always' && !state.stopRequested && sighting?.held === false && isLive(sighting.state);

/**
 * What the sighting of the attempt in flight, `last`, says of its session: the second of `observe`'s rules for an attempt in
 * flight, with what ending it now would lead to.
 */
function sessionEvent(state: State, last: Attempt, sighting: Sighting, now: Now): LifecycleEvent {
  const ending = endOf(sighting.state);
  const seen = {
    attempt: last.n,
    sighting,
    asked: state.closeoutSchema !== undefined,
    holds: state.holdOpen === true && !state.closed && ending === 'succeeded' && (last.turn ?? 0) === state.inputs.length,
  };
  if (respawning(state, sighting)) {
    const gap = last.gapSince === undefined ? 0 : elapsedMs({ at: Date.parse(last.gapSince), mono: last.gapMono }, instantOf(now));
    return { type: gap < RESPAWN_GAP_MS ? 'SESSION_RESPAWNING' : 'RESPAWN_OVERDUE', ...seen };
  }
  if (idleOf(state, sighting)) return { type: 'SESSION_IDLE', ...seen };
  if (NEEDS_HUMAN.has(sighting.state)) return { type: 'SESSION_BLOCKED', ...seen };
  if (RUNNING.has(sighting.state)) return { type: sighting.quietMs !== undefined ? 'SESSION_QUIET' : 'SESSION_LIVE', ...seen };
  return { type: sighting.state === 'canceled' ? 'SESSION_STOPPED' : 'SESSION_ENDED', ...seen };
}

/**
 * The answer to a spawn its harness refused — nothing started — as the lifecycle gives it: the attempt's `unstartable` end,
 * in the harness's words, or the refusal when the lifecycle has no edge for it. Asked by the engine, the one place that
 * learns of it, so that every move of a task is an edge.
 */
export function spawnRefused(state: State, attempt: number, error: string, move: Move = transition): Action {
  const from = lifecycleOf(state);
  const moved = move(from, { type: 'SPAWN_REFUSED', attempt, error });
  return 'refused' in moved
    ? { do: 'nothing', why: `refused: no edge from ${from} on SPAWN_REFUSED`, refused: moved.refused }
    : moved.action;
}

/** Is this task waiting on a person? The one thing a fleet operator must be told about. A long-lived task's idle session is not. */
export function needsHuman(state: State, observed: ReadonlyMap<string, Sighting>): boolean {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return false;
  const seen = observed.get(nameFor(state.taskId, last.n));
  return waitsOnPerson(seen?.state) && !idleOf(state, seen) && !respawning(state, seen);
}

/**
 * The restart of a long-lived task whose last attempt, `last`, ended with no stop asked, and not refused at its spawn (that settles),
 * `observe`'s fifth rule with nothing in flight:
 * `UNREAD` while its harness could not read the old name, `PREVIOUS_LIVE` while it still holds the old session, `BACKING_OFF`
 * within `backoffOf` the end, then `RESTART_DUE` — continuing the latest session an attempt recorded, told `RESTART_WORDS`;
 * with none recorded, what the turn continues, told the brief.
 */
function restartOf(state: State, last: Attempt, sighting: Sighting | undefined, now: Now): LifecycleEvent {
  if (now.unread?.has(nameFor(state.taskId, last.n))) return { type: 'UNREAD', attempt: last.n, overdue: false };
  if (sighting && (sighting.held === true || isLive(sighting.state))) return { type: 'PREVIOUS_LIVE', sessionId: sighting.sessionId };
  const backoffMs = backoffOf(state.attempts);
  if (elapsedMs(endedWhen(last), instantOf(now)) < backoffMs) return { type: 'BACKING_OFF', attempt: last.n, backoffMs };
  const session = [...state.attempts].reverse().find((a) => a.nativeId !== null)?.nativeId ?? undefined;
  const from = session ? { resumeFrom: session, nudge: RESTART_WORDS } : { resumeFrom: turnOf(state).continues };
  return { type: 'RESTART_DUE', attempt: state.attempts.length + 1, ...from };
}

/** When an attempt started, on both clocks it was stamped on. */
const startedWhen = (a: Attempt): Instant => ({ at: Date.parse(a.startedAt), mono: a.startedMono });

/** When an attempt ended, on both clocks; one not ended yet reads as its start. The one reading of an end's time `decide` makes. */
const endedWhen = (a: Attempt): Instant => (a.endedAt === null ? startedWhen(a) : { at: Date.parse(a.endedAt), mono: a.endedMono });

/** Now as `decide` is handed it, as an `Instant`. */
const instantOf = (now: Now): Instant => ({ at: now.at.getTime(), mono: now.mono });

/**
 * How long a long-lived task waits after its last end before restarting (`RESTART_BACKOFF`): the initial wait, doubled for each
 * attempt before it that ended in a row too soon to reset it, up to the cap. Pure arithmetic over the attempts' times.
 */
export function backoffOf(attempts: readonly Attempt[]): number {
  const { initialMs, factor, maxMs, resetAfterMs } = RESTART_BACKOFF;
  let ends = 0;
  for (const a of [...attempts].reverse()) {
    if (a.ended === null || elapsedMs(startedWhen(a), endedWhen(a)) >= resetAfterMs) break;
    ends++;
  }
  return Math.min(initialMs * factor ** Math.max(0, ends - 1), maxMs);
}

/**
 * What the engine journals of a long-lived attempt in flight off its sighting, before it decides: a `gap` the first time its
 * session is seen respawning, and a `process` once it is seen held again after one, or held in a process it had not been
 * seen in. Nothing for a job, a settled task, an ended attempt or a session the pass did not see. Each is stamped `at`; a gap
 * also `mono`, the same moment on the monotonic clock when the engine read one, since `decide` bounds how long it lasts.
 */
export function sightingFacts(state: State, sighting: Sighting | undefined, at: string, mono?: Monotonic): Event[] {
  const last = state.attempts.at(-1);
  if (state.restartPolicy !== 'Always' || state.settled || !sighting || !last || last.ended !== null) return [];
  if (respawning(state, sighting))
    return last.gapSince === undefined ? [{ kind: 'gap', at, attempt: last.n, ...(mono ? { mono } : {}) }] : [];
  if (sighting.held !== true) return [];
  const moved = sighting.pid !== undefined && sighting.pid !== last.processes?.at(-1);
  if (last.gapSince === undefined && !moved) return [];
  return [{ kind: 'process', at, attempt: last.n, ...(sighting.pid !== undefined ? { pid: sighting.pid } : {}) }];
}
