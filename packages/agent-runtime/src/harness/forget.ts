/**
 * What every harness's `forget` (`RunnerOps.forget`) and `kept` (`RunnerOps.kept`) share: the files it keeps of a session,
 * removed or, dry, only listed, what it leaves that is not its own, and the same files named for a measure.
 */
import fs from 'node:fs';
import { Effect } from 'effect';
import { RunnerError } from './error.ts';
import type { SessionForgotten, SessionKept } from './seam.ts';

/**
 * The answer of the harness `harness`'s `forget`: each of `files` that is there, removed unless `dry`, and what `left` names,
 * asked as the files are. A file already gone is no error, and not in the answer; one that cannot be removed fails the verb.
 */
export const forgetFiles = (
  harness: string,
  files: readonly string[],
  left: () => readonly string[],
  dry: boolean,
): Effect.Effect<SessionForgotten, RunnerError> =>
  Effect.try({
    try: () => {
      const there = files.filter((file) => fs.existsSync(file));
      if (!dry) for (const file of there) fs.rmSync(file, { force: true });
      return { files: there, left: [...left()] };
    },
    catch: (cause) => new RunnerError({ verb: 'forget', message: `${harness}: ${cause instanceof Error ? cause.message : String(cause)}` }),
  });

/**
 * The answer of the harness `harness`'s `kept`: for each of `sessions`, the paths `of` names for it that are there, and no key
 * for a session with none. `of` is asked once a session; a throw fails the verb.
 */
export const keptOf = <S extends { name: string }>(
  harness: string,
  sessions: readonly S[],
  of: (session: S) => SessionKept,
): Effect.Effect<Record<string, SessionKept>, RunnerError> =>
  Effect.try({
    try: () => {
      const kept: Record<string, SessionKept> = {};
      for (const session of sessions) {
        const { files, records } = of(session);
        const there = { files: files.filter((file) => fs.existsSync(file)), records: records.filter((file) => fs.existsSync(file)) };
        if (there.files.length || there.records.length) kept[session.name] = there;
      }
      return kept;
    },
    catch: (cause) => new RunnerError({ verb: 'kept', message: `${harness}: ${cause instanceof Error ? cause.message : String(cause)}` }),
  });
