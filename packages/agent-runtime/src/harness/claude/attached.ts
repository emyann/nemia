/**
 * Claude Code attached to the engine's process on the Agent SDK: a session run by `query()` in the process that holds the engine's
 * attached sessions, durable by resume rather than by detaching.
 *
 * - **Who holds them.** One process at a time, the one whose engine took `hold` in a scope: it spawns, adopts and resumes. Any other
 *   engine reads the run files and writes a stop, or words to say, beside one; a Claude Code task it starts runs as a job
 *   (`claudeCodeOps`).
 * - **Let go.** As the holder's scope closes, the new calls of each session with none in flight are held at their hook, it waits at
 *   most `LET_GO_MS` for each call in flight to end, then writes each session `parked` and aborts it; a call held at its hook then is
 *   never written in flight. A call that belongs to a call in flight is answered throughout, or the call it belongs to could never
 *   end and the let-go would wait on what it forbids. Past the bound the call in flight is cut, kept on the run file as `calling` and
 *   said on the log, so the next holder resumes the session told which call did not finish.
 * - **Taken up.** On each look, a holder adopts a session parked, or one whose holder's process is gone: it kills what is left of its
 *   Claude Code's process group, unless that pid is another process's now (`childOf`), and resumes it under the same session id, told
 *   it was paused (`CARRY_ON`), or, when its holder ended mid-call, which call did not finish (`crashNote`).
 * - **The drain.** A file naming the holder's pid and when it started (`putDrain`): while it names this process, the new calls of each
 *   session with none in flight wait at their hook, so a restart can wait for the calls in flight before it signals.
 * - **What it keeps.** Its run file, and a capture of the messages a reader reads (denials as they come, the result's statement and
 *   usage); the conversation is Claude Code's own transcript.
 */
import { Effect, Option, Schedule, type Scope } from 'effect';
import fs from 'node:fs';
import { instantNow } from '../../core/engine/now.ts';
import { purseOf, type Purse } from '../../core/clock.ts';
import type { Sighting } from '../../core/index.ts';
import { RunnerError } from '../error.ts';
import type { Observation, RunnerOps, SpawnRequest } from '../seam.ts';
import { readTranscript } from '../transcript.ts';
import { claudeStreamOutput } from '../detached/output.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './transcript.ts';
import { lessCarried } from '../detached/detached.ts';
import {
  attachedStateOf,
  CARRY_ON,
  crashNote,
  childOf,
  drainsThis,
  everyRun,
  filesOf,
  holderGone,
  isOpen,
  keptRequest,
  readRun,
  thisHolder,
  writeRun,
  type AttachedRun,
} from './attached-file.ts';
import { gone, hear, interruptTurn, killGroup, startSession, type Held, type Live } from './attached-session.ts';

/** The attached sessions of one engine: the runner's verbs, and `hold`, which makes this process their holder for a scope. */
export type Attached = {
  readonly ops: Pick<RunnerOps, 'spawn' | 'observe' | 'observeFor' | 'stop' | 'logs' | 'transcript' | 'say' | 'interrupt'>;
  readonly hold: Effect.Effect<void, never, Scope.Scope>;
  readonly holding: () => boolean;
  readonly has: (name: string) => boolean;
};

/**
 * How long a holder's whole let-go takes at most, in milliseconds: the budget its three waits share, not the bound of each, so the
 * process always ends within it. Whatever waits for a holder to stop — the systemd unit's `TimeoutStopSec`, the restart's wait for
 * the lease — is set above it, and a test reads this number rather than repeat it.
 */
export const LET_GO_MS = 60_000;

/** How often a let-go reads whether what it waits for is over, in milliseconds. */
const LET_GO_EVERY_MS = 50;

/**
 * What share of a let-go's budget the wait for the calls in flight may take at most, the rest kept for the waits after the park:
 * each session ending, and each call held at a hook being let go. A call that ends sooner leaves the whole remainder to them
 * (`leftOf`), so the share is a ceiling on the one wait that can run long, never a floor on the short ones.
 */
const LET_GO_CALLS_SHARE = 0.8;

/**
 * Waits until `over` answers true, read at once and every `LET_GO_EVERY_MS` after, at most `ms`.
 *
 * @returns whether it was over within `ms`
 */
const waitedOut = (over: () => boolean, ms: number): Effect.Effect<boolean> =>
  Effect.repeat(Effect.sync(over), { schedule: Schedule.spaced(LET_GO_EVERY_MS), until: (done) => done }).pipe(
    Effect.timeoutOption(ms),
    Effect.map(Option.isSome),
  );

/** What the capture of the session under `name` says, as `claude -p`'s stream is read. */
const saidBy = (root: string, name: string) => {
  try {
    return claudeStreamOutput(fs.readFileSync(filesOf(root, name).out, 'utf8'));
  } catch {
    return claudeStreamOutput('');
  }
};

/**
 * What a session resuming Claude Code's session `resumeFrom` carries on of its parent's: the totals the latest attached run of that
 * session printed, which the resumed one's own result prints on in its. None found: nothing, and the measure is dropped, never
 * counted twice (`lessCarried`).
 */
const carriedFrom = (root: string, resumeFrom: string): NonNullable<AttachedRun['carried']> => {
  const parent = [...everyRun(root).values()]
    .filter((r) => r.sessionId === resumeFrom)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const { costUsd, apiMs } = (parent && saidBy(root, parent.name).usage) || {};
  return { ...(costUsd !== undefined ? { costUsd } : {}), ...(apiMs !== undefined ? { apiMs } : {}) };
};

/** The bridge a run file kept, as a sighting says it: the link where one was opened, else why there is none. */
const bridgeOf = (run: AttachedRun): Pick<Sighting, 'bridge'> => {
  const bridge = run.bridge;
  if (bridge === undefined) return {};
  if (bridge.url !== undefined) return { bridge: { url: bridge.url } };
  return bridge.why === undefined ? {} : { bridge: { url: null, why: bridge.why } };
};

/**
 * A run file's sighting: its state, whether a process still holds the session and which (`held`, `pid`), its bridge, its call in
 * flight, and what its capture says it stated, used and was denied.
 *
 * A session a holder still runs (`isOpen`) says whether its process is there, which `decide` reads for a long-lived task alone: held,
 * its idle session is open (`idleOf`); with its holder gone it is one the harness is taking up again (`respawning`), and is not
 * restarted under its feet. A session that has ended says nothing of a process, as it did before.
 */
const sightingOf = (root: string, run: AttachedRun): Sighting => {
  const { denials, usage, ...said } = saidBy(root, run.name);
  const own = usage && run.carried ? lessCarried(usage, run.carried) : usage;
  const held = isOpen(run.state) ? !holderGone(run) : undefined;
  return {
    sessionId: run.name,
    state: attachedStateOf(run),
    ...(run.sessionId ? { nativeId: run.sessionId } : {}),
    ...said,
    ...(own ? { usage: own } : {}),
    ...(denials?.length ? { denials } : {}),
    ...(held === undefined ? {} : { held }),
    ...(held === true ? { pid: run.owner } : {}),
    ...bridgeOf(run),
    ...(run.calling && run.state === 'working' ? { calling: run.calling } : {}),
  };
};

/** Whether a holder takes `run` up: parked, or at work under a process that is gone, its pid taken by another since included. */
const orphaned = (run: AttachedRun): boolean => run.state === 'parked' || (isOpen(run.state) && holderGone(run));

/**
 * What a resumed session is told first, by its run file: which call did not finish, where one was in flight when its holder ended or
 * cut it at its bound (`crashNote`), else that it was paused between two calls (`CARRY_ON`).
 */
const noteOf = (run: AttachedRun): string => (run.calling ? crashNote(run.calling.tool) : CARRY_ON);

/** The sessions of `live` at work with a call in flight. */
const inCallOf = (live: Map<string, Live>): Live[] => [...live.values()].filter((l) => l.calls?.size && l.run.state === 'working');

/** The tool of the call `l` is in, as a line names it. */
const toolOf = (l: Live): string => l.run.calling?.tool ?? 'a tool';

/**
 * Each session of `live` at work or idle between turns written `parked`, aborted and its Claude Code's process group killed, its file its holder's last
 * word; the call it was cut in kept as `calling` where `cut`, which is what tells the next holder which call did not finish. The park
 * ends the session's Claude Code itself rather than leave it to the waits after it, which a spent budget can cut short: a parked
 * session never leaves a process behind. The group it kills is the one `childOf` answers, so a pid another process has taken since
 * is left alone. Uninterruptible as one: a second signal leaves no session neither parked nor running.
 */
const parked = (root: string, live: Map<string, Live>, cut: boolean): Effect.Effect<void> =>
  Effect.sync(() => {
    for (const l of live.values()) {
      if (!l.abort || (l.run.state !== 'working' && l.run.state !== 'idle')) continue;
      const kept = cut && l.calls?.size ? l.run.calling : undefined;
      const group = childOf(l.run);
      const { calling: _, childPid: __, childStart: ___, ...rest } = l.run;
      l.run = { ...rest, state: 'parked', ...(kept ? { calling: kept } : {}) };
      writeRun(root, l.run);
      l.letGo = true;
      l.abort.abort();
      killGroup(group);
    }
  }).pipe(Effect.uninterruptible);

/**
 * The holder's let-go of the sessions in `live`: it says what it is waiting for, waits for the calls in flight to end, says which
 * session it cut and in what call where they did not, then parks each session at work (`parked`) and waits for each to end and for
 * each call held at its hook to be let go. Its three waits take from one `purse` of `letGoMs` (`purseOf`), the wait for the calls in
 * flight capped at `LET_GO_CALLS_SHARE` of it and the rest spent as they go, so the whole let-go ends within the budget rather than
 * taking their sum: it always returns, and within the bound, so a signal always ends the process and whatever waits for the process
 * — a service unit's stop timeout, a restart's wait for the lease — can be set above one number. `purse` is the caller's so a test
 * can read what each wait was given (`Purse.given`) and show they add up to no more than the budget.
 */
export const letGoOf = (
  root: string,
  live: Map<string, Live>,
  letGoMs: number,
  purse: Purse = purseOf(letGoMs, instantNow),
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const waited = inCallOf(live);
    if (waited.length)
      yield* Effect.logInfo(
        `letting go of ${live.size} session(s): waiting at most ${letGoMs} ms for ${waited.length} call(s) in flight ` +
          `(${waited.map((l) => `${l.run.name} ${toolOf(l)}`).join(', ')})`,
      );
    const quiet = yield* waitedOut(() => inCallOf(live).length === 0, purse.take(LET_GO_CALLS_SHARE));
    for (const l of quiet ? [] : inCallOf(live))
      yield* Effect.logWarning(
        `${l.run.name} is cut in its call to ${toolOf(l)}: it did not end within ${letGoMs} ms, and the next holder resumes the ` +
          'session told the call did not finish',
      );
    yield* parked(root, live, !quiet);
    yield* Effect.promise(() => Promise.all([...live.values()].map((l) => l.done))).pipe(Effect.timeoutOption(purse.take()));
    yield* waitedOut(() => ![...live.values()].some((l) => l.waiting), purse.take());
  });

/**
 * The attached sessions under `root`: `executable` the Claude Code they run, the SDK's own when absent (a test's stand-in otherwise).
 */
export const attachedSessions = (root: string, executable?: string, options: { letGoMs?: number } = {}): Attached => {
  const live = new Map<string, Live>();
  const letGoMs = options.letGoMs ?? LET_GO_MS;
  let holding = false;
  let draining = false;
  const held: Held = (l) => (draining || drainsThis(root)) && l.calls.size === 0;
  const start = (r: SpawnRequest, run: AttachedRun, first: string, resume?: string) =>
    live.set(run.name, startSession(root, r, run, first, { held, ...(executable ? { executable } : {}), ...(resume ? { resume } : {}) }));

  const stopped = (run: AttachedRun) => fs.existsSync(filesOf(root, run.name).stop);

  const interrupted = (run: AttachedRun) => {
    const file = filesOf(root, run.name).interrupt;
    if (!fs.existsSync(file)) return;
    const at = live.get(run.name);
    if (at === undefined) return;
    if (run.state !== 'working') {
      fs.rmSync(file, { force: true });
      return;
    }
    void interruptTurn(at)
      .then((sent) => void (sent && fs.rmSync(file, { force: true })))
      .catch(() => undefined);
  };

  const adopt = async (run: AttachedRun): Promise<void> => {
    const child = childOf(run);
    killGroup(child);
    await gone(child);
    const { childPid: _, childStart: __, calling: ___, ownerStart: ____, ...rest } = run;
    const mine: AttachedRun = { ...rest, ...thisHolder() };
    if (stopped(run) || !run.sessionId) return writeRun(root, { ...mine, state: stopped(run) ? 'canceled' : 'failed' });
    start({ ...(run.request as Omit<SpawnRequest, 'brief'>), brief: '' }, { ...mine, state: 'working' }, noteOf(run), run.sessionId);
  };

  const looked = (run: AttachedRun): AttachedRun => {
    const at = live.get(run.name);
    if (!holding) return run;
    if (at && stopped(run) && isOpen(at.run.state)) at.abort.abort();
    interrupted(run);
    if (at?.input) hear(root, at);
    if (!at && orphaned(run)) {
      const placeholder = { run, letGo: true } as Live;
      live.set(run.name, placeholder);
      void adopt(run).catch(() => live.delete(run.name));
      return { ...run, state: 'working' };
    }
    return run;
  };

  const runs = (names?: readonly string[]): Map<string, Sighting> => {
    const found = names
      ? new Map(names.flatMap((n) => [readRun(filesOf(root, n).run) ?? []].flat().map((r) => [n, r] as const)))
      : everyRun(root);
    return new Map([...found].map(([name, run]) => [name, sightingOf(root, looked(run))]));
  };

  const letGo = Effect.gen(function* () {
    draining = true;
    yield* letGoOf(root, live, letGoMs);
    live.clear();
    holding = false;
    draining = false;
  });

  return {
    hold: Effect.acquireRelease(
      Effect.sync(() => void (holding = true)),
      () => letGo,
    ),
    holding: () => holding,
    has: (name) => fs.existsSync(filesOf(root, name).run),
    ops: opsOf(root, live, start, runs),
  };
};

/** Why a verb failed, as the runner's error. */
const failed = (verb: string) => (cause: unknown) =>
  new RunnerError({ verb, message: `claude: ${cause instanceof Error ? cause.message : String(cause)}` });

/**
 * The runner's verbs over the sessions under `root`: `live`, those at work in this process, and `start`, how one is started. A name is
 * the engine's (`ae/<task>/<n>`), and every verb reads the session's run file, so another process reads and stops what the holder runs.
 */
const opsOf = (
  root: string,
  live: Map<string, Live>,
  start: (r: SpawnRequest, run: AttachedRun, first: string, resume?: string) => void,
  runs: (names?: readonly string[]) => Map<string, Sighting>,
): Attached['ops'] => ({
  spawn: (r) =>
    Effect.try({
      try: () => {
        const { out, stop, interrupt, say } = filesOf(root, r.name);
        for (const f of [out, stop, interrupt, say]) fs.rmSync(f, { force: true });
        const run: AttachedRun = {
          name: r.name,
          state: 'working',
          ...thisHolder(),
          startedAt: new Date().toISOString(),
          ...(r.resumeFrom ? { carried: carriedFrom(root, r.resumeFrom) } : {}),
          request: keptRequest(r),
        };
        start(r, run, r.brief, r.resumeFrom);
      },
      catch: failed('spawn'),
    }),
  observe: Effect.sync(() => runs()),
  observeFor: (expected) => Effect.sync((): Observation => ({ seen: runs(expected.map((e) => e.name)), unread: new Set<string>() })),
  stop: (name) =>
    Effect.try({
      try: () => {
        fs.writeFileSync(filesOf(root, name).stop, String(process.pid));
        live.get(name)?.abort?.abort();
      },
      catch: failed('stop'),
    }),
  logs: (name) =>
    Effect.try({
      try: () => {
        const run = readRun(filesOf(root, name).run);
        return `${run?.state ?? 'unknown'}${run?.sessionId ? ` ${run.sessionId}` : ''}${run?.calling ? `, calling ${run.calling.tool}` : ''}`;
      },
      catch: failed('logs'),
    }),
  transcript: (name, after) =>
    Effect.tryPromise({
      try: () => {
        const id = readRun(filesOf(root, name).run)?.sessionId;
        return readTranscript(id ? claudeTranscriptFile(id) : undefined, after, claudeTranscriptEvents);
      },
      catch: failed('transcript'),
    }),
  interrupt: (session) =>
    Effect.tryPromise({
      try: async () => {
        const { run: file, interrupt } = filesOf(root, session.name);
        const run = readRun(file);
        if (run?.state !== 'working')
          throw new Error(
            `\`${session.name}\` is ${run ? run.state : 'not an attached session'}, so it has no turn to end. Interrupt it while it answers.`,
          );
        fs.writeFileSync(interrupt, String(process.pid));
        if (await interruptTurn(live.get(session.name))) fs.rmSync(interrupt, { force: true });
      },
      catch: failed('interrupt'),
    }),
  say: (session, text) =>
    Effect.try({
      try: () => {
        const { run: file, say } = filesOf(root, session.name);
        const run = readRun(file);
        if (run === undefined || !isOpen(run.state))
          throw new Error(`\`${session.name}\` is ${run ? run.state : 'not an attached session'}, so nothing said to it would be heard.`);
        fs.appendFileSync(say, `${JSON.stringify({ text })}\n`);
        const at = live.get(session.name);
        if (at?.input) hear(root, at);
      },
      catch: failed('say'),
    }),
});
