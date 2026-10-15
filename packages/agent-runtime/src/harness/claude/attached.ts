/**
 * Claude Code attached to the engine's process on the Agent SDK: a session run by `query()` in the process that holds the engine's
 * attached sessions, durable by resume rather than by detaching.
 *
 * - **Who holds them.** One process at a time, the one whose engine took `hold` in a scope: it spawns, adopts and resumes. Any other
 *   engine reads the run files and writes a stop, or words to say, beside one; a Claude Code task it starts runs as a job
 *   (`claudeCodeOps`).
 * - **Let go.** As the holder's scope closes, new calls are held at their hook, it waits with no bound for each call in flight to end,
 *   then writes each session `parked` and aborts it; a call held at its hook then is never written in flight.
 * - **Taken up.** On each look, a holder adopts a session parked, or one whose holder's process is gone: it kills what is left of its
 *   Claude Code's process group, unless that pid is another process's now (`childOf`), and resumes it under the same session id, told
 *   it was paused (`CARRY_ON`), or, when its holder ended mid-call, which call did not finish (`crashNote`).
 * - **The drain.** A file naming the holder's pid and when it started (`putDrain`): while it names this process, its new calls wait at
 *   their hook, so a restart can wait for the calls in flight before it signals.
 * - **What it keeps.** Its run file, and a capture of the messages a reader reads (denials as they come, the result's statement and
 *   usage); the conversation is Claude Code's own transcript.
 */
import { Effect, type Scope } from 'effect';
import fs from 'node:fs';
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
  keptRequest,
  readRun,
  thisHolder,
  writeRun,
  type AttachedRun,
} from './attached-file.ts';
import { gone, hear, killGroup, startSession, type Live } from './attached-session.ts';

/** The attached sessions of one engine: the runner's verbs, and `hold`, which makes this process their holder for a scope. */
export type Attached = {
  readonly ops: Pick<RunnerOps, 'spawn' | 'observe' | 'observeFor' | 'stop' | 'logs' | 'transcript' | 'say'>;
  readonly hold: Effect.Effect<void, never, Scope.Scope>;
  readonly holding: () => boolean;
  readonly has: (name: string) => boolean;
};

/** Waits `ms`, as a promise. */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** A run file's sighting: its state, its call in flight, and what its capture says it stated, used and was denied. */
const sightingOf = (root: string, run: AttachedRun): Sighting => {
  const { denials, usage, ...said } = saidBy(root, run.name);
  const own = usage && run.carried ? lessCarried(usage, run.carried) : usage;
  return {
    sessionId: run.name,
    state: attachedStateOf(run),
    ...(run.sessionId ? { nativeId: run.sessionId } : {}),
    ...said,
    ...(own ? { usage: own } : {}),
    ...(denials?.length ? { denials } : {}),
    ...(run.calling && run.state === 'working' ? { calling: run.calling } : {}),
  };
};

/** Whether a holder takes `run` up: parked, or at work under a process that is gone, its pid taken by another since included. */
const orphaned = (run: AttachedRun): boolean => run.state === 'parked' || (run.state === 'working' && holderGone(run));

/** What a resumed session is told first: why it was stopped, by its run file. */
const noteOf = (run: AttachedRun): string => (run.state !== 'parked' && run.calling ? crashNote(run.calling.tool) : CARRY_ON);

/**
 * The attached sessions under `root`: `executable` the Claude Code they run, the SDK's own when absent (a test's stand-in otherwise).
 */
export const attachedSessions = (root: string, executable?: string): Attached => {
  const live = new Map<string, Live>();
  let holding = false;
  let draining = false;
  const held = () => draining || drainsThis(root);
  const start = (r: SpawnRequest, run: AttachedRun, first: string, resume?: string) =>
    live.set(run.name, startSession(root, r, run, first, { held, ...(executable ? { executable } : {}), ...(resume ? { resume } : {}) }));

  const stopped = (run: AttachedRun) => fs.existsSync(filesOf(root, run.name).stop);

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
    if (at && stopped(run) && at.run.state === 'working') at.abort.abort();
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

  const letGo = Effect.promise(async () => {
    draining = true;
    while ([...live.values()].some((l) => l.calls?.size)) await pause(100);
    for (const l of live.values()) {
      if (!l.abort || l.run.state !== 'working') continue;
      const { calling: _, childPid: __, childStart: ___, ...rest } = l.run;
      l.run = { ...rest, state: 'parked' };
      writeRun(root, l.run);
      l.letGo = true;
      l.abort.abort();
    }
    await Promise.all([...live.values()].map((l) => l.done));
    while ([...live.values()].some((l) => l.waiting)) await pause(50);
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
        const { out, stop, say } = filesOf(root, r.name);
        for (const f of [out, stop, say]) fs.rmSync(f, { force: true });
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
  say: (session, text) =>
    Effect.try({
      try: () => {
        const { run: file, say } = filesOf(root, session.name);
        const run = readRun(file);
        if (run?.state !== 'working' && run?.state !== 'parked')
          throw new Error(`\`${session.name}\` is ${run ? run.state : 'not an attached session'}, so nothing said to it would be heard.`);
        fs.appendFileSync(say, `${JSON.stringify({ text })}\n`);
        const at = live.get(session.name);
        if (at?.input) hear(root, at);
      },
      catch: failed('say'),
    }),
});
