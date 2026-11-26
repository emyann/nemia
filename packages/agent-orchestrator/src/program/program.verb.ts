/**
 * The programs' controller: each beat, the factories' programs read again (`declaredPrograms`: each factory whose template declares some,
 * from its tree's wiring), the controller's record of the tasks it filed (`<home>/programs.json`) read against the engine, and what is owed
 * done (`programsDue`): a program declared and held by no task is filed, a task whose declaration or factory is gone is asked to stop. A
 * program's task is the runtime's command harness, long-lived (`restartPolicy: 'Always'`): its restart and its back-off are the
 * runtime's, never this controller's, and a task the runtime settled is not filed again under its id. The program runs in its factory's
 * tree with the factory's carried files (`WF_CARRIED_FILES`) and its own session token (`WF_SESSION_TOKEN`), minted as it is filed, in
 * the factory and no run's, so what it writes through the api (`nemia condition set`) is a token holder's. Level-triggered: it carries
 * nothing between beats, so a restart owes what the record and the engine say.
 *
 * A controller: it reaches the runtime through the client (`EngineService`), run by `up` (`daemon/up.verb.ts`) beside the keeper, and the
 * token door (`TokenDoor`) at the store root `up` is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Duration, Effect } from 'effect';
import { listedAt } from '../factory/door/factories.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { EngineService, asked, type Engine } from '../runtime-client.ts';
import { TokenDoor } from '../token/token.store.ts';
import { SESSION_TOKEN } from '../filed/filed.ts';
import { needsEnv } from '../needs/needs.verb.ts';
import { ownBin } from '../nemia/level.store.ts';
import { CARRIED_FOLDER } from '../step/step.ts';
import { programTaskId, programsDue } from './program.ts';
import type { FactoryListing, Program } from '../factory/factory.ts';

/** How often the controller reads the factories' programs and the engine again. */
const PROGRAMS_EVERY = '5 seconds';

/** The controller's record of the tasks it filed: its file in the store. */
const recordFile = (home: string) => path.join(home, 'programs.json');

/** The ids the controller filed, or none where it kept no record or one that does not read as a list of ids. */
const filedIds = (home: string) => {
  try {
    const read: unknown = JSON.parse(fs.readFileSync(recordFile(home), 'utf8'));
    return Array.isArray(read) ? read.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/** The record, written whole. */
const recorded = (home: string, ids: readonly string[]) => {
  fs.writeFileSync(recordFile(home), `${JSON.stringify(ids, null, 2)}\n`);
};

/** A program a factory declares, with what its task is filed from. */
type Declared = { readonly id: string; readonly name: string; readonly factory: string; readonly tree: string; readonly program: Program };

/**
 * Every program the listed factories declare: a factory with no tree, or none declared, gives none, and a factory the listing could not
 * read gives none.
 * @param listing The store's factories, as the Factory door lists them.
 */
export const declaredPrograms = (listing: readonly FactoryListing[]) =>
  listing.flatMap((f): Declared[] => {
    if ('error' in f || f.tree === undefined || f.programs === undefined) return [];
    const { tree, programs, name, generation } = f;
    return Object.entries(programs).map(([program, one]) => ({
      id: programTaskId(name, program, one, generation, tree),
      name: program,
      factory: name,
      tree,
      program: one,
    }));
  });

/**
 * A program's task as the engine is asked to file it: the command harness, long-lived, its line run by the shell in the factory's tree,
 * its stdout and stderr one stream, the tools folder and the daemon's own bin first on its path, the factory's name and carried files
 * and its session token in its environment.
 * @param d The program, as `declaredPrograms` gives it.
 * @param token The program's session token, minted as it is filed.
 * @param home The store's root folder.
 */
export const programSpec = (d: Declared, token: string, home: string) => {
  const bin = ownBin();
  const base = { ...process.env, ...(bin === undefined ? {} : { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` }) };
  return {
    id: d.id,
    harness: 'command',
    restartPolicy: 'Always',
    brief: `program ${d.name} of ${d.factory}: ${d.program.run}`,
    cwd: d.tree,
    config: {
      command: ['sh', '-c', `exec 2>&1\n${d.program.run}`],
      env: {
        ...needsEnv(home, base, { factory: d.factory, carriedFiles: path.join(d.tree, 'workflows', CARRIED_FOLDER) }),
        [SESSION_TOKEN]: token,
      },
    },
  } satisfies Parameters<Engine['file']>[0];
};

/** The program's token for its task `id`, minted through the token door: in its factory, no run's, live while its task is unsettled. */
const programToken = (d: Declared) =>
  Effect.flatMap(TokenDoor, (door) =>
    door.tokens.mint({ agent: d.name, factory: d.factory, run: null, step: null, attempt: 1, task: d.id }),
  );

/** The engine's view of the tasks `ids`, a task it holds none under left out. */
const heldOf = (e: Engine, ids: readonly string[]) =>
  Effect.gen(function* () {
    const held: { id: string; settled: boolean; stopRequested: boolean }[] = [];
    for (const id of ids) {
      const { state } = yield* asked('view', e.view(id));
      if (state.filedAt) held.push({ id, settled: Boolean(state.settled), stopRequested: Boolean(state.stopRequested) });
    }
    return held;
  });

/**
 * One beat: the programs declared read, the tasks of the record read off the engine, each task owed filed (its id recorded first, so a
 * filing that fails is tried again under the same id) and each owed a stop asked. Answers what it filed and what it stopped.
 */
export const programsOnce = Effect.fn('programsOnce')(function* () {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const declared = declaredPrograms(yield* listedAt(home));
  const ids = filedIds(home);
  const held = yield* heldOf(e, ids);
  const due = programsDue(
    declared.map((d) => d.id),
    held,
  );
  recorded(home, [...new Set([...ids.filter((id) => declared.some((d) => d.id === id) || held.some((h) => h.id === id && !h.settled)), ...due.file])]);
  for (const id of due.file) {
    const d = declared.find((one) => one.id === id);
    if (d !== undefined) yield* asked('file', e.file(programSpec(d, yield* programToken(d), home)));
  }
  for (const id of due.stop) yield* asked('stop', e.stop(id).pipe(Effect.catchTag('StopRefused', () => Effect.void)));
  return due;
});

/** The controller, for as long as it runs: a beat each `every`; a beat that fails is a warning, and the next is tried a beat later. */
export const programs = (every: Duration.Input = PROGRAMS_EVERY) =>
  Effect.forever(
    Effect.suspend(programsOnce).pipe(
      Effect.catchCause((cause) => Effect.logWarning(`The programs could not be kept this beat: ${Cause.pretty(cause)}`)),
      Effect.andThen(Effect.sleep(every)),
    ),
  );
