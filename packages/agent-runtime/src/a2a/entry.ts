/**
 * A remote agent's registry, `remote/` under the store: one entry a session, `<name>.json` with the name URI-encoded, moved to
 * `remote/done/` once let go of. What an entry holds, how an older one is read, and how a session's entry is forgotten.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { formerStateOf, isSessionState, type Sighting } from '../core/index.ts';
import { forgetFiles, keptOf, type RunnerOps } from '../harness/index.ts';
import type { Monotonic } from '../core/clock.ts';

/** One session's entry in the registry. */
export type Entry = {
  name: string;
  /** The harness it was sent through: the engine's name for the agent, never its address. */
  agent: string;
  messageId: string;
  contextId?: string;
  sentAt: string;
  /** The Task the agent made of the message, once its answer is back. */
  taskId?: string;
  /** How it was last seen: read when the agent cannot be asked. */
  seen?: Sighting;
  /** The Task has ended, and `seen` is how: read from here, with no call to the agent. */
  ended?: true;
  /** The agent answered with a Message, not a Task: the whole of the session, in its words. */
  reply?: string;
  /**
   * The send is under way in the process `pid`, which gives it up at `until`, `mono` its start on the monotonic clock: while that
   * process lives and the send holds its lease (`sendHeld`), the entry is a Task `submitted`. Gone once the answer, or its
   * failure, is written.
   */
  sending?: { pid: number; until: string; mono?: Monotonic };
  /** The agent refused the message after the spawn had returned: its words, the session ended `rejected`. */
  refused?: string;
  /** The send failed on the way, or was not answered in time: its words, the Task in doubt. */
  doubt?: string;
  /** How many of the Task's artifacts were whole when it was last seen with its turn over: a later turn's are not, until it ends. */
  whole?: number;
};

/**
 * An entry as this code reads it. An entry an older runtime wrote may say how it was last seen in the runtime's former
 * words — `done`, `blocked`, `stopped` — and is read in A2A's, as the Task it was seen in said them (`blocked` waiting for
 * `authentication` is `AUTH_REQUIRED`, `WAITS`). The file keeps its words until it is next written. A word neither
 * vocabulary has is `failed`, as the other drivers read one: no session the runtime can wait on.
 */
const upgraded = (e: Entry): Entry => {
  const seen = e.seen as (Omit<Sighting, 'state'> & { state: string }) | undefined;
  if (!seen || isSessionState(seen.state)) return e;
  const state =
    seen.state === 'blocked' && seen.waitingFor === 'authentication' ? 'auth-required' : (formerStateOf(seen.state) ?? 'failed');
  return { ...e, seen: { ...seen, state } };
};

/** The file of the session `name`'s entry in the registry folder `under`. */
export const entryFileOf = (under: string, name: string): string => path.join(under, `${encodeURIComponent(name)}.json`);

/** The entry in `file`, read as this code reads it (`upgraded`); `undefined` when there is none. */
export const readEntry = (file: string): Entry | undefined => {
  try {
    return upgraded(JSON.parse(fs.readFileSync(file, 'utf8')) as Entry);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
};

/** Where the registry in `dir` keeps the entry of the session `name`: open, and let go of. */
const entryFilesOf = (dir: string, name: string): string[] => [entryFileOf(dir, name), entryFileOf(path.join(dir, 'done'), name)];

/**
 * The remote harness `harness`'s `forget`, its registry in `dir`: the session's entry, open or let go of, removed or with `dry`
 * listed, and the Task the agent made of it named as left, since the remote party keeps it.
 */
export const forgetEntryOf =
  (harness: string, dir: string): NonNullable<RunnerOps['forget']> =>
  (session, options) => {
    const files = entryFilesOf(dir, session.name);
    const left = () => {
      const e = readEntry(files[0]) ?? readEntry(files[1]);
      return e?.taskId ? [`the Task ${e.taskId}, the \`${harness}\` agent's to keep`] : [];
    };
    return forgetFiles(harness, files, left, options.dry);
  };

/**
 * The remote harness `harness`'s `kept`, its registry in `dir`: each session's entry, open or let go of. It names no record: the
 * Task the agent made of a session is the remote party's, and on no disk of ours.
 */
export const keptEntryOf =
  (harness: string, dir: string): NonNullable<RunnerOps['kept']> =>
  (sessions) =>
    keptOf(harness, sessions, ({ name }) => ({ files: entryFilesOf(dir, name), records: [] }));

/** The names of the entries in `under`; none for a folder not made yet. */
const entryNames = (under: string): string[] => {
  try {
    return fs.readdirSync(under).filter((f) => f.endsWith('.json'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
};

/**
 * The registry of the remote harness `harness` beneath the store `root`: `remote/` (`dir`) and `remote/done/` (`done`). `fileOf` is
 * a session's entry file, open or under `done`; `write` writes an entry whole, to a temporary file renamed; `open` reads the open
 * entries sent through this harness; `bySession` an entry open or let go of, by the Task's id, the id it was seen under, the
 * message's id, or its context — the latest Task sent in it.
 */
export const registryOf = (harness: string, root: string) => {
  const dir = path.join(root, 'remote');
  const done = path.join(dir, 'done');
  const fileOf = (name: string, under = dir) => entryFileOf(under, name);
  const write = (e: Entry, under = dir) => {
    fs.mkdirSync(under, { recursive: true });
    const tmp = `${fileOf(e.name, under)}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(e)}\n`);
    fs.renameSync(tmp, fileOf(e.name, under));
  };
  const entriesIn = (under: string): Entry[] =>
    entryNames(under).flatMap((f) => {
      const e = readEntry(path.join(under, f));
      return e?.agent === harness ? [e] : [];
    });
  const open = (): Entry[] => entriesIn(dir);
  const bySession = (sessionId: string): Entry | undefined => {
    const all = [...entriesIn(dir), ...entriesIn(done)];
    return (
      all.find((e) => e.taskId === sessionId || e.seen?.sessionId === sessionId || e.messageId === sessionId) ??
      all
        .filter((e) => e.contextId === sessionId && e.taskId)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
        .at(-1)
    );
  };
  return { dir, done, fileOf, write, open, bySession };
};
