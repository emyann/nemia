/**
 * Claude Code attached to the engine's process on the Agent SDK: a session run by `query()` in the process that holds the engine's
 * attached sessions, durable by resume rather than by detaching.
 *
 * - **Who holds them.** One process at a time, the one whose engine took `hold` in a scope: it spawns, adopts and resumes. Any other
 *   engine reads the run files and writes a stop beside one; a Claude Code task it starts runs as a job (`claudeCodeOps`).
 * - **Let go.** As the holder's scope closes, new calls are held at their hook, it waits with no bound for each call in flight to end,
 *   then aborts each session and writes it `parked`.
 * - **Taken up.** On each look, a holder adopts a session parked, or one whose holder's process is gone: it kills what is left of its
 *   Claude Code's process group, and resumes it under the same session id, told it was paused (`CARRY_ON`), or, when its holder ended
 *   mid-call, which call did not finish (`crashNote`).
 * - **The drain.** A file naming the holder's pid (`putDrain`): while it names this process, its new calls wait at their hook, so a
 *   restart can wait for the calls in flight before it signals.
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
import {
  alive,
  attachedStateOf,
  CARRY_ON,
  crashNote,
  drainedPid,
  everyRun,
  filesOf,
  keptRequest,
  readRun,
  writeRun,
  type AttachedRun,
} from './attached-file.ts';
import { killGroup, startSession, type Live } from './attached-session.ts';

/** The attached sessions of one engine: the runner's verbs, and `hold`, which makes this process their holder for a scope. */
export type Attached = {
  readonly ops: Pick<RunnerOps, 'spawn' | 'observe' | 'observeFor' | 'stop' | 'logs' | 'transcript' | 'say'>;
  readonly hold: Effect.Effect<void, never, Scope.Scope>;
  readonly holding: () => boolean;
  readonly has: (name: string) => boolean;
};

/** Waits `ms`, as a promise. */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A run file's sighting: its state, its call in flight, and what its capture says it stated, used and was denied. */
const sightingOf = (root: string, run: AttachedRun): Sighting => {
  let text = '';
  try {
    text = fs.readFileSync(filesOf(root, run.name).out, 'utf8');
  } catch {
    text = '';
  }
  const said = claudeStreamOutput(text);
  return {
    sessionId: run.name,
    state: attachedStateOf(run),
    ...(run.sessionId ? { nativeId: run.sessionId } : {}),
    ...(said.closeout ? { closeout: { payload: said.closeout.payload } } : {}),
    ...(said.usage ? { usage: said.usage } : {}),
    ...(said.limit ? { limit: said.limit } : {}),
    ...(said.denials?.length ? { denials: said.denials } : {}),
    ...(said.skills ? { skills: said.skills } : {}),
    ...(said.files ? { files: said.files } : {}),
    ...(run.calling && run.state === 'working' ? { calling: run.calling } : {}),
  };
};

/** Whether a holder takes `run` up: parked, or at work under a process that is gone. */
const orphaned = (run: AttachedRun): boolean =>
  run.state === 'parked' || (run.state === 'working' && run.owner !== process.pid && !alive(run.owner));

/** What a resumed session is told first: why it was stopped, by its run file. */
const noteOf = (run: AttachedRun): string => (run.state !== 'parked' && run.calling ? crashNote(run.calling.tool) : CARRY_ON);

/** Waits until the process `pid` is gone. */
const gone = async (pid: number | undefined): Promise<void> => {
  while (pid !== undefined && alive(pid)) await pause(50);
};

/**
 * The attached sessions under `root`: `executable` the Claude Code they run, the SDK's own when absent (a test's stand-in otherwise).
 */
export const attachedSessions = (root: string, executable?: string): Attached => {
  const live = new Map<string, Live>();
  let holding = false;
  let draining = false;
  const held = () => draining || drainedPid(root) === process.pid;
  const start = (r: SpawnRequest, run: AttachedRun, first: string, resume?: string) =>
    live.set(run.name, startSession(root, r, run, first, { held, ...(executable ? { executable } : {}), ...(resume ? { resume } : {}) }));

  const stopped = (run: AttachedRun) => fs.existsSync(filesOf(root, run.name).stop);

  const adopt = async (run: AttachedRun): Promise<void> => {
    killGroup(run.childPid);
    await gone(run.childPid);
    const { childPid: _, calling: __, ...rest } = run;
    const mine: AttachedRun = { ...rest, owner: process.pid };
    if (stopped(run) || !run.sessionId) return writeRun(root, { ...mine, state: stopped(run) ? 'canceled' : 'failed' });
    start({ ...(run.request as Omit<SpawnRequest, 'brief'>), brief: '' }, { ...mine, state: 'working' }, noteOf(run), run.sessionId);
  };

  const looked = (run: AttachedRun): AttachedRun => {
    const at = live.get(run.name);
    if (!holding) return run;
    if (at && stopped(run) && at.run.state === 'working') at.abort.abort();
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
      l.letGo = true;
      const { calling: _, ...rest } = l.run;
      writeRun(root, { ...rest, state: 'parked' });
      l.abort.abort();
    }
    await Promise.all([...live.values()].map((l) => l.done));
    live.clear();
    holding = false;
    draining = false;
  });

  const failed = (verb: string) => (cause: unknown) =>
    new RunnerError({ verb, message: `claude: ${cause instanceof Error ? cause.message : String(cause)}` });

  return {
    hold: Effect.acquireRelease(
      Effect.sync(() => void (holding = true)),
      () => letGo,
    ),
    holding: () => holding,
    has: (name) => fs.existsSync(filesOf(root, name).run),
    ops: {
      spawn: (r) =>
        Effect.try({
          try: () => {
            for (const f of [filesOf(root, r.name).out, filesOf(root, r.name).stop]) fs.rmSync(f, { force: true });
            const run: AttachedRun = {
              name: r.name,
              state: 'working',
              owner: process.pid,
              startedAt: new Date().toISOString(),
              request: keptRequest(r),
            };
            start(r, run, r.brief, r.resumeFrom);
          },
          catch: failed('spawn'),
        }),
      observe: Effect.sync(() => runs()),
      observeFor: (expected) =>
        Effect.sync((): Observation => ({ seen: runs(expected.map((e) => e.name)), unread: new Set<string>() })),
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
            const at = live.get(session.name);
            if (!at?.input || at.input.closed)
              throw new Error(`\`${session.name}\` is not at work in this process, so nothing can be said to it now. Say it once it is.`);
            at.input.push(text);
          },
          catch: failed('say'),
        }),
    },
  };
};
