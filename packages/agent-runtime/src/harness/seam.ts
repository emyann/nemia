/**
 * The compute seam — the ONLY file that knows what runs an agent.
 *
 * Four verbs the engine cannot run without: spawn one, observe all, stop one, read one's logs. A
 * fifth, `release`, is optional — letting go of a session whose end is on the record, for a harness
 * whose registry would otherwise keep it for ever. So is a sixth, `transcript`: the same session's
 * conversation as events, for a person to follow, and nothing the engine acts on. And a seventh, `say`:
 * a person's words handed to a session while it runs, which the engine journals and never acts on. And an
 * eighth, `find`: one session by its name, without observing every other, for a read that needs only which
 * session it is. And a ninth, `quota`: what the harness's subscription has left, asked of the harness and of no session. Swap the
 * layer and the same engine drives a different harness; `Runner.test()` drives
 * nothing at all, which is how the engine's tests cost zero dollars.
 *
 * Several harnesses, one seam (`composite`). A task says which harness it wants; this dispatches `spawn` to that one and
 * MERGES what all of them observe. The merge is safe without any coordination because the key is `ae/<task>/<attempt>` —
 * unique by construction — so two harnesses can never claim the same name. `decide` does not change, and does not learn
 * that harnesses exist. That is the test of whether the seam was drawn in the right place.
 *
 * `RunnerError` is in `error.ts`, beneath this file and Claude Code's `--bg` runner (`claudeOps`, in `claude/bg.ts`):
 * `Runner.claude` needs that runner as a value, and the runner builds the error, so each would import the other.
 */
import { Context, Effect, Layer, type Stream } from 'effect';
import type { SessionState, Sighting, Usage } from '../core/index.ts';
import { argsRefusalOf, type HarnessArgs } from './args.ts';
import { claudeOps, type ClaudeOptions } from './claude/bg.ts';
import { causeWords, RunnerError } from './error.ts';
import type { Telemetry } from './telemetry.ts';

export { RunnerError } from './error.ts';

export type SpawnRequest = {
  /** The join key, ours, chosen before the session exists. */
  name: string;
  brief: string;
  cwd: string;
  /** Which harness should run it. The composite runner dispatches on this; others ignore it. */
  harness?: string;
  /** The harness's arguments, as the task was filed with them: this runner's to read, and nobody else's. Absent: none. */
  config?: HarnessArgs;
  /** A previous session of this harness to continue instead of starting cold. */
  resumeFrom?: string;
  /** A JSON Schema the workload's final answer must satisfy. Passed through; never interpreted. */
  closeoutSchema?: object;
  /**
   * The task's restart policy, as it was filed with it — a Pod's `restartPolicy`. `'Always'`: a session that stays open between
   * turns until it is stopped, which a runner that keeps one open reads to know a turn's end is not the session's. Absent: a session
   * that runs its brief to its end.
   */
  restartPolicy?: 'Always';
  /**
   * What the session's telemetry says it is: the labels its task was filed with, and `task`, its id. Set by the engine at every spawn;
   * a harness that exports says it on its session's resource, and only when `telemetry` is set.
   */
  resource?: Record<string, string>;
  /** The W3C trace context of the span that filed the task, journalled when its engine exports: the session's spans join that trace. */
  traceparent?: string;
  /**
   * Where the session exports its telemetry, and whether its tools' inputs too (`toolDetails`): set by an engine given a collector
   * (`telemetered`), absent otherwise, and then none is.
   */
  telemetry?: Telemetry;
};

/**
 * One MCP server — a process the harness starts beside the session, or an address it connects to —
 * in the shape a `.mcp.json` entry gives it: Claude Code's own, so a task's servers are written for
 * it as they are. Harness vocabulary: carried on the task, read by a runner, never by `decide`. A
 * `url` needs its `type`, because Claude Code loads nothing from one without it.
 */
export type McpServer = LocalMcpServer | RemoteMcpServer;

/** A server the harness starts beside the session, as a `.mcp.json` entry gives it. */
export type LocalMcpServer = { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

/**
 * A server the harness connects to, as a `.mcp.json` entry gives it, with the facts of an OAuth client where one signs in.
 *
 * `oauth` is **not declared** on the SDK's type for an HTTP server (`sdk.d.ts:1083-1098`): it was measured working at SDK 0.3.270 — a
 * server handed inline with it reported `needs-auth`, signed in, and a second session with the same config found the sign-in — and
 * it rides the untyped seam, so an SDK that renames or validates it breaks the sign-in with nothing failing the typecheck. It carries
 * no secret: Claude Code reads the client secret from its own store alone, and `oauth` sits outside the sign-in key's hash
 * (`name|sha256({type,url,headers})[:16]`), which is why changing it asks for no new sign-in.
 */
export type RemoteMcpServer = {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  oauth?: { clientId: string; callbackPort?: number };
};

/**
 * One thing that happened in a session's conversation, in the same shape for every harness.
 *
 * `id` is the harness's own, so the same record read again gives the same id. A `tool_result` carries
 * its call's `id`: that is how a result pairs to its call, and why an event is unique by `id` and
 * `kind` together, not by `id` alone. `at` is the time on the harness's own record, never the time it
 * was read — so a resumed Claude session's inherited conversation keeps its parent's times, and the
 * caller decides what to show. A tool result is `user`, as the model receives it.
 */
export type TranscriptEvent = {
  id: string;
  /** ISO 8601, from the harness's record. */
  at: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';
  text?: string;
  tool?: { name: string; input: unknown };
  result?: { text: string; isError: boolean };
  /**
   * Where the words came from, as the harness said it, for a `user` event: `human` where a person wrote them into the session itself
   * — Claude Code's own face, a claude.ai bridge — and absent where the host pushed them on the session's input, which the caller
   * already knows it did. **Carried, never judged**: `decide` does not read it; a layer that draws a conversation does.
   */
  origin?: { kind: string };
};

/** One event of a session's transcript, named as an event is unique: by its `kind` and `id` together. */
export type TranscriptMark = { kind: TranscriptEvent['kind']; id: string };

/**
 * Where a transcript read stopped, to hand back to the next: the byte offset after the last whole line
 * read, and a hash of the bytes just before it. The offset alone cannot tell a file that was replaced
 * and has grown past it from the same file grown longer; the hash can, and so can it a file cut shorter.
 */
export type TranscriptCursor = string;

/** A read of a session's conversation: the events from the cursor asked with, and the cursor to ask again with. */
export type Transcript = { events: TranscriptEvent[]; cursor: TranscriptCursor };

/**
 * One moment of a session followed live (`RunnerOps.follow`): its state, the first moment and again at each change; whole events of
 * its transcript as they are written, with the cursor after them; or a piece of the text block it is writing, under the block's
 * `key`, added to what came before under that key (`append`) or the whole text so far, and `last` once the block is written whole.
 */
export type Followed =
  | { kind: 'state'; state: SessionState }
  | { kind: 'events'; events: TranscriptEvent[]; cursor: TranscriptCursor }
  | { kind: 'partial'; key: string; text: string; append: boolean; last: boolean };

/**
 * One limit of a harness's subscription, as the harness reported it: `key` is the harness's own name for it (Claude Code's `five_hour`,
 * `seven_day`, …), `usedPercentage` how much of it is used, and `resetsAt` when it begins again, ISO, or null when none was given.
 */
export type QuotaLimit = { key: string; usedPercentage: number; resetsAt: string | null };

/**
 * What a harness's quota came to, asked once (`RunnerOps.quota`):
 *
 *   windows     the plan's limits, each with a finite use (`QuotaLimit`), in the harness's order, and its subscription; none, when the
 *               harness listed limits and none had a number
 *   no-plan     the harness has no plan limits: it is not signed in to a subscription
 *   unanswered  it is signed in to `subscription`, and the service it asks gave it nothing
 *   unknown     it answered in a shape the runtime does not read: `what` it found
 *   missing     the harness's program is not on PATH
 *   timeout     no answer within `ms`
 *   failed      the process ended, or could not start, before it answered: its exit code or signal, and its stderr's last line
 */
export type HarnessQuota =
  | { kind: 'windows'; limits: QuotaLimit[]; subscription: string | null }
  | { kind: 'no-plan' }
  | { kind: 'unanswered'; subscription: string | null }
  | { kind: 'unknown'; what: string }
  | { kind: 'missing' }
  | { kind: 'timeout'; ms: number }
  | { kind: 'failed'; code: number | null; signal: string | null; said: string };

/**
 * A session the journal expects a harness to list: an attempt's name (`ae/<task>/<n>`), the harness its task was filed on, and,
 * for a long-lived task's attempt, when the journal says it began, in ms (`since`): what a runner that counts the session's usage
 * counts it from, across every process its harness ran it in. Absent for a job, whose runner counts from its own start.
 */
export type ExpectedSession = { name: string; harness?: string; since?: number };

/**
 * What a look told what to expect saw (`observeFor`): the sessions it listed, by name, and the names expected of it that it could
 * not look for this time — a harness, or one mode of it, whose read failed (`claude agents` timing out, the registry busy). A name
 * in `unread` is neither there nor gone: nobody looked. Kept apart from `seen` because the pass reads an absence as the session
 * gone — it forgets a finished one it was letting go, and ends an attempt past its grace `lost` — and a look that failed is not
 * an absence. `why` is what each part of the look that failed said, one sentence each, in the harness's words; absent when every
 * part read. `unreadWhy` is why one session alone was unread, by its name, in the harness's words: every name in it is in `unread`,
 * built by the look that answers it and kept by none; absent when no session alone was left unread. Said for a person, never decided
 * on.
 */
export type Observation = {
  seen: Map<string, Sighting>;
  unread: ReadonlySet<string>;
  why?: readonly string[];
  unreadWhy?: ReadonlyMap<string, string>;
};

/**
 * The seam itself, as a plain value.
 *
 * Four verbs. A harness that cannot do one of them is not a harness this engine can drive, and a
 * harness that needs another to be driven is asking the engine to learn something about it — which is
 * the line this type exists to hold. `release` does not cross it: optional, told only what the record
 * already says, and answering nothing the engine acts on. Nor does `transcript`: optional, and read
 * for a person, never by `decide`. Nor does `say`: optional, a person's words carried in, and nothing
 * the engine decides on. Nor does `find`: optional, a cheaper way to one session's id than `observe`, and never
 * its state. Nor does `observeFor`: optional, `observe` told what the journal already names, and answering the same. Nor does
 * `quota`: optional, and asked of the harness, never of a session.
 */
export type RunnerOps = {
  readonly spawn: (r: SpawnRequest) => Effect.Effect<void, RunnerError>;
  /** Every session this runner knows about, BY NAME. One call per pass, never per task. */
  readonly observe: Effect.Effect<Map<string, Sighting>, RunnerError>;
  /**
   * `observe`, told which sessions the journal expects: at least every one named in `expected` that the harness lists,
   * and whatever else it lists for no more. Optional — for a harness that can leave out a costly registry when nothing
   * expected can be in it (Claude Code: `claude agents`, when every name expected is a job's). A runner without it is
   * observed in full. Told names, never asked for them: the pass reads them off the journal on every pass, so a session
   * started before a restart is expected on the first pass after it. `harness` is the harness the task was filed on, for
   * a runner that routes (`composite`), and read by no other.
   *
   * Answers what it listed and what it could not read (`Observation`): a runner that reads in parts — several harnesses,
   * or Claude Code's jobs and its registry — says which expected names a failed part left unread, and fails as a whole only
   * when it read nothing. `observe` keeps its Map: a full listing is read by views and verbs, where an unread harness is
   * nothing observed, and by no rule that ends or forgets on an absence.
   */
  readonly observeFor?: (expected: readonly ExpectedSession[]) => Effect.Effect<Observation, RunnerError>;
  /**
   * The one session running under `name`, found without observing every other: which session it is, and nothing of
   * its state. Optional — for a harness that can answer by name for less than `observe` costs (Claude Code: the
   * session's registration file, where `observe` runs `claude agents`). Resolves `undefined` when none runs under the
   * name. A read that needs a session's state asks `observe`, and where the two differ, `observe`'s word is taken.
   */
  readonly find?: (name: string) => Effect.Effect<{ sessionId: string } | undefined, RunnerError>;
  readonly stop: (sessionId: string) => Effect.Effect<void, RunnerError>;
  readonly logs: (sessionId: string) => Effect.Effect<string, RunnerError>;
  /**
   * One stream of the session under `name`, `stdout` or `stderr`, as the harness kept it whole — or its last `lastBytes` bytes —
   * read from that stream alone; `undefined` when it kept none under the name. Optional: a harness that keeps no stream apart
   * from the other has `logs`, and that is all.
   */
  readonly output?: (name: string, stream: 'stdout' | 'stderr', lastBytes?: number) => Effect.Effect<string | undefined, RunnerError>;
  /**
   * Let go of a session whose attempt's end the engine has written down: stop it if it still runs,
   * and take it out of the harness's registry. Optional — a harness whose registry is the record
   * (a detached runner's run files, which `logs` reads) has nothing to let go of.
   *
   * Asked on every pass that still observes such a session, so it must be idempotent and needs no
   * memory: one that fails is asked again next pass. Given the session as observed, to tell a live one
   * from one that has exited, and the task's `worktree`, since a harness may remove the one it cut.
   *
   * Resolves with what the session consumed, read once this call has stopped it, for a harness that writes part of that
   * only as a session's process exits — after its end was written (Claude Code's cost). The engine records it on the
   * attempt. Nothing when it stopped nothing.
   */
  readonly release?: (session: Sighting, task: { worktree?: string | boolean }) => Effect.Effect<Usage | void, RunnerError>;
  /**
   * The session's conversation as events, from `after` on, and the cursor to ask again with. Optional:
   * a harness that keeps no record of its conversation has `logs`, and that is all. Pull-only and
   * level-triggered — a caller polls with the cursor it was given, nothing is pushed, and nothing is
   * remembered between reads that the cursor does not carry.
   */
  readonly transcript?: (sessionId: string, after?: TranscriptCursor) => Effect.Effect<Transcript, RunnerError>;
  /**
   * The session followed live, from now on (`Followed`): its state first, then each moment once and in order, ending once the session
   * is over and its last words read. Optional: a harness that cannot say what a session writes while it writes it has `transcript`,
   * read again. Fails with a refusal (`refused`) where the session is not one this harness streams.
   */
  readonly follow?: (sessionId: string) => Stream.Stream<Followed, RunnerError>;
  /**
   * Hand `text` to a session that is running, as a person's words: optional, for a harness with a channel
   * into a live session. Given the session as the engine knows it — the name it chose, and the id `observe`
   * listed it under on the pass just made — and resolves once the harness has taken the words; rejects when
   * it did not, and then nothing was said. What the session does with them is its own affair: the engine
   * journals that they were said, and `decide` never reads that.
   */
  readonly say?: (session: { name: string; sessionId: string }, text: string) => Effect.Effect<void, RunnerError>;
  /**
   * End the turn the session is in, and leave the session open to hear the next words: the running turn stops where it is, its own
   * result closes it, and the session answers again under the same id. Optional, and left off every harness that cannot end a turn
   * without ending its session — only a session on streaming input takes it. Journals nothing and answers nothing the engine acts on:
   * the next pass reads the session's state as it reads any other.
   */
  readonly interrupt?: (session: { name: string; sessionId: string }) => Effect.Effect<void, RunnerError>;
  /**
   * Answer a call of the session's that is held open waiting on a person (`Sighting.asks`): the ask by the id the sighting gave it,
   * and the person's answer to each question, by the question's own text. Optional, and left off every harness that holds no such
   * call. Resolves once the harness has taken the answer; rejects when it did not, and then nothing was answered. Journals nothing
   * and answers nothing the engine acts on: the next pass reads the session's asks as it reads any other fact of it.
   */
  readonly answer?: (
    session: { name: string; sessionId: string },
    answer: { id: string; answers: Record<string, string> },
  ) => Effect.Effect<void, RunnerError>;
  /**
   * What the harness's subscription has left, asked of the harness once: one process, or one request, a call, and nothing kept between
   * calls. Optional, for a harness that can tell (Claude Code: its `get_usage` control request). It touches no session and is journalled
   * nowhere. Every way an ask can go is a `HarnessQuota`, so it fails only where the seam between it and its caller does.
   */
  readonly quota?: Effect.Effect<HarnessQuota, RunnerError>;
  /**
   * Why this runner would not take a task, as a sentence that says what to write instead — or `undefined`. Asked by `file`
   * before anything is journalled, so a task no harness could start is never a promise the loop keeps trying to honour.
   * Optional: every runner made a `Runner` by `Runner.layer` refuses what no harness could use (`argsRefusalOf`) before
   * it is asked, so a runner answers for its own vocabulary alone; `file` asks those checks itself too, for a runner built
   * with `Runner.of` and no layer.
   */
  readonly refuses?: (task: Omit<SpawnRequest, 'name'>) => string | undefined;
  /**
   * Remove what this harness keeps of a session whose task is settled and forgotten: optional, for a harness that keeps files
   * of its own per session. Given the name the engine gave the session and the id the harness knew it by, when it had one;
   * with `dry`, nothing is removed and the answer says what would be. Answers the files removed, and what it leaves that is
   * not its own to remove (a conversation's transcript, a remote party's Task). Idempotent: a file already gone is no error,
   * and not in the answer.
   */
  readonly forget?: (
    session: { name: string; nativeId?: string },
    options: { dry: boolean },
  ) => Effect.Effect<SessionForgotten, RunnerError>;
  /**
   * Where this harness keeps what it has of each of `sessions`, by the session's name: optional, for a harness that keeps files
   * of its own per session. Given every session asked of this harness at once, each by the name the engine gave it and the id
   * the harness knew it by, when it had one, so a harness lists a folder once an ask and never once a session. It removes
   * nothing and reads no file's content. A session it keeps nothing of has no key, and a path is one that was there when asked.
   */
  readonly kept?: (sessions: readonly { name: string; nativeId?: string }[]) => Effect.Effect<Record<string, SessionKept>, RunnerError>;
  /**
   * Rewrite each capture this harness keeps of a session whose worker has ended to what its readers read, as a capture is once its
   * session ends: optional, for a harness that keeps less of an ended capture (`HarnessSpec.keepOutput`). With `dry`, nothing is
   * written and the answer says what would be. One capture at a time; a capture already kept is counted and left as it is.
   */
  readonly compact?: (options: { dry: boolean }) => Effect.Effect<SessionsCompacted, RunnerError>;
};

/**
 * What a harness's `compact` did, or would do: `captures`, the capture files it found; `compacted`, those it rewrote; their bytes
 * `before` and `after`, as their sizes say, a capture left counted alike in both; and `left`, each capture it did not rewrite that
 * still holds more than its readers read, or could not be told, by file name, and why.
 */
export type SessionsCompacted = {
  captures: number;
  compacted: number;
  before: number;
  after: number;
  left: { name: string; why: string }[];
};

/** What a harness removed of a session (`RunnerOps.forget`), or would remove, by path, and what it leaves, by name. */
export type SessionForgotten = { files: string[]; left: string[] };

/**
 * Where a harness keeps what it has of a session (`RunnerOps.kept`), by path: `files`, what its `forget` would remove, and
 * `records`, its own record of the session, which `forget` leaves, a file or a folder found by the session's id; and `output`, the
 * session's streams the runtime keeps whole, which its `forget` removes too and which are in no `files`, absent from a harness that
 * keeps none apart.
 */
export type SessionKept = { files: string[]; records: string[]; output?: string[] };

export class Runner extends Context.Service<Runner, RunnerOps>()('engine/Runner') {
  /**
   * Any implementation becomes a Layer. This is the only way a runner reaches the engine. Its `refuses` asks first what
   * no harness could use (`argsRefusalOf`), then the runner's own: the harness arguments are the adapter's, so they are
   * refused on the adapter's side of the seam, beneath every runner, whoever calls it.
   */
  static layer = (ops: RunnerOps) =>
    Layer.succeed(Runner)(
      Runner.of({
        ...ops,
        refuses: (task) => argsRefusalOf(task) ?? ops.refuses?.(task),
      }),
    );

  static claude = (options: ClaudeOptions) => Runner.layer(claudeOps(options));

  static test = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }) => Runner.layer(testOps(control));
}

/**
 * A harness that costs nothing: sessions are a map, and a test moves them by hand. Every spawn request is pushed to
 * `spawned`, so a test can assert what the harness was actually asked for. It can end a turn (`interrupt`), which changes nothing of
 * its sessions: a turn ended leaves the session as it was, at work.
 */
export const testOps = (control?: { sessions: Map<string, Sighting>; spawned?: SpawnRequest[] }): RunnerOps => {
  const sessions = control?.sessions ?? new Map<string, Sighting>();
  const spawned = control?.spawned ?? [];
  let n = 0;
  return {
    spawn: (r) =>
      Effect.sync(() => {
        const id = `fake-${++n}`;
        sessions.set(r.name, { sessionId: id, state: 'working', nativeId: id });
        spawned.push(r);
      }),
    observe: Effect.sync(() => new Map(sessions)),
    stop: (id) =>
      Effect.sync(() => {
        for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled' });
      }),
    logs: () => Effect.succeed('(fake runner: no logs)'),
    interrupt: () => Effect.void,
  };
};

/**
 * Each harness's observation merged into one, and `owner` told which harness reported each session id. Takes the observations by
 * harness name; returns every sighting, every unread name, what failed (`why`) after its harness's name, and why each session alone
 * was unread (`unreadWhy`) as its harness said it.
 */
const merged = (results: readonly (readonly [string, Observation])[], owner: Map<string, string>): Observation => {
  const seen = new Map<string, Sighting>();
  const unread = new Set<string>();
  for (const [harness, o] of results) {
    for (const [sessionName, sighting] of o.seen) {
      seen.set(sessionName, sighting);
      owner.set(sighting.sessionId, harness);
    }
    for (const name of o.unread) unread.add(name);
  }
  const why = results.flatMap(([harness, o]) => (o.why ?? []).map((words) => `harness \`${harness}\`: ${words}`));
  const unreadWhy = new Map(results.flatMap(([, o]) => [...(o.unreadWhy ?? [])]));
  return { seen, unread, ...(why.length ? { why } : {}), ...(unreadWhy.size ? { unreadWhy } : {}) };
};

/**
 * One runner over `harnesses`, a task routed to the harness it names, or to `fallback` when it names none.
 *
 * A task that names a harness this engine does not have — one it was filed on by an engine that had it, such as a remote
 * agent whose entry has been refused or removed — is routed nowhere (`routeOf`): sent to the fallback, it would be spawned
 * there as a session of another harness nobody asked for, and a session of it in flight would be looked for there, not
 * found, and ended `lost`. Its spawn is refused (`notHere`): nothing is started, and the attempt ends in those words.
 *
 * Every harness is observed at once and the listings merged (`observeAll`, what `observe` and `observeFor` both are). A
 * harness whose look failed is unread — nothing listed, and every name it was to find there not looked for — so one
 * harness being unreachable blinds the engine neither to the others nor to the fact that it could not look: read as an
 * empty listing, a failed look would have the pass read each session on it gone. What each harness's look said failed (`why`:
 * its failure's words, or the words of the parts of it that failed) is kept, each sentence after the harness's name, and why each
 * session alone was unread (`unreadWhy`) is kept as its harness said it; a harness whose look failed says none.
 *
 * Which harness runs which session (`owner`) is learned from the last observation: `stop`, `logs` and `release` are given
 * a session id and nothing else, and a session id means something different to each harness. It is never persisted — a
 * stale map would send a stop to the wrong harness, and the pass that needs it has always just observed.
 *
 * - `refuses` asks the harness the task names, as a spawn is routed: its vocabulary is its own. One this engine does not
 *   have is refused at the door that files (`harnessRefusalOf`), which names the harnesses it has.
 * - `observe` lists every harness; one that cannot be read contributes nothing: a full listing is read by views and verbs,
 *   which read an unread harness as nothing observed, and never by the pass (`observeFor`).
 * - `observeFor` tells each harness only the names routed to it, as a spawn is routed: a flat list would have Claude Code
 *   take a Codex task's name for a background session it must look for. Every harness is still observed — one with
 *   nothing expected is told so, and one without the verb lists everything — so a session no journal names is not hidden
 *   from a harness. A harness that could not be read leaves every name routed to it unread, whichever verb it was read by,
 *   and a harness this engine does not have is one nobody can read: its names are neither there nor gone, so none is
 *   spawned again or ended `lost` until the harness is back.
 * - `release` goes only to the harness that reported the session, and only if it has the verb: sent to the fallback
 *   instead, a release would ask the wrong registry to remove something by an id it never gave.
 */
/** `answer` routed to `ops`, or refused where that harness holds no call open for a person. */
const answerOn = (
  ops: RunnerOps,
  session: { name: string; sessionId: string },
  given: { id: string; answers: Record<string, string> },
): Effect.Effect<void, RunnerError> =>
  ops.answer
    ? ops.answer(session, given)
    : Effect.fail(
        new RunnerError({
          verb: 'answer',
          message: `the \`${session.sessionId}\` session's harness holds no call open for a person to answer.`,
          refused: true,
        }),
      );

export const composite = (harnesses: Record<string, RunnerOps>, fallback: string): RunnerOps => {
  const pick = (name?: string) => harnesses[name ?? fallback] ?? harnesses[fallback];

  const owner = new Map<string, string>();

  const routeOf = (asked?: string): string | undefined => {
    const name = asked ?? fallback;
    return Object.hasOwn(harnesses, name) ? name : undefined;
  };

  const notHere = (asked: string) =>
    Effect.fail(
      new RunnerError({
        verb: 'spawn',
        refused: true,
        message: `\`harness: ${asked}\` is not a harness this engine has, so nothing was started: the task was filed by an engine that had it. Its harnesses are: ${Object.keys(harnesses).join(', ')}. Give the engine that harness again, then ask for the task again.`,
      }),
    );

  const observeAll = (
    look: (name: string, ops: RunnerOps) => { read: Effect.Effect<Observation, RunnerError>; expected: readonly string[] },
  ) =>
    Effect.forEach(
      Object.entries(harnesses),
      ([name, ops]) => {
        const { read, expected } = look(name, ops);
        return read.pipe(
          Effect.map((o) => [name, o] as const),
          Effect.catchCause((cause) =>
            Effect.succeed<readonly [string, Observation]>([
              name,
              { seen: new Map<string, Sighting>(), unread: new Set(expected), why: [causeWords(cause)] },
            ]),
          ),
        );
      },
      { concurrency: 'unbounded' },
    ).pipe(Effect.map((results) => merged(results, owner)));

  const listing = (ops: RunnerOps) => ops.observe.pipe(Effect.map((seen): Observation => ({ seen, unread: new Set() })));

  return {
    spawn: (r) => {
      const route = routeOf(r.harness);
      return route === undefined ? notHere(r.harness ?? fallback) : harnesses[route].spawn(r);
    },

    refuses: (task) => {
      const route = routeOf(task.harness);
      return route === undefined ? undefined : harnesses[route].refuses?.(task);
    },

    observe: observeAll((_, ops) => ({ read: listing(ops), expected: [] })).pipe(Effect.map((o) => o.seen)),

    observeFor: (expected) =>
      observeAll((name, ops) => {
        const mine = expected.filter((e) => routeOf(e.harness) === name);
        return { read: ops.observeFor ? ops.observeFor(mine) : listing(ops), expected: mine.map((e) => e.name) };
      }).pipe(
        Effect.map((o): Observation => {
          const nowhere = expected.filter((e) => routeOf(e.harness) === undefined);
          return nowhere.length ? { ...o, unread: new Set([...o.unread, ...nowhere.map((e) => e.name)]) } : o;
        }),
      ),

    stop: (sessionId) => pick(owner.get(sessionId)).stop(sessionId),
    interrupt: (session) => {
      const ops = pick(owner.get(session.sessionId));
      return ops.interrupt
        ? ops.interrupt(session)
        : Effect.fail(
            new RunnerError({
              verb: 'interrupt',
              message: `the \`${session.sessionId}\` session's harness cannot end a turn.`,
              refused: true,
            }),
          );
    },

    answer: (session, given) => answerOn(pick(owner.get(session.sessionId)), session, given),

    logs: (sessionId) =>
      owner.has(sessionId)
        ? pick(owner.get(sessionId)).logs(sessionId)
        : Effect.fail(new RunnerError({ verb: 'logs', message: `no harness owns ${sessionId} — run a pass first` })),

    release: (session, task) => {
      const ops = owner.has(session.sessionId) ? pick(owner.get(session.sessionId)) : undefined;
      return ops?.release ? ops.release(session, task) : Effect.succeed(undefined);
    },
  };
};
