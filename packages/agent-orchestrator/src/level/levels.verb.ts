/**
 * The levels now: the store's own (`nemia/level.json`, which `nemia level <level>` sets) for the default factory and every factory that
 * names none, and each factory's own file over it (`level.store.ts`), a raise counted until its end; and the factory a run was started in.
 * Read again on each call, carrying nothing between them, so a raise past its end reads as gone with no write.
 *
 * A controller beneath the CLI: it joins the factory's level store with the store's (`nemia/level.store.ts`), which no store file imports.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { factoryNames } from '../factory/factory.store.ts';
import { readLevel } from '../nemia/level.store.ts';
import { readFactoryLevel } from './level.store.ts';
import { factoryLevelOf, type FactoryLevel, type FactoryLevelFile, type Level } from './level.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** Each factory level file that does not read said once a process: the deliverer and the keeper read the levels every beat. */
const saidAlready = new Set<string>();

/** The factory `name`'s file; one that does not read is said once on stderr and read as `manual`, so the factory is left alone. */
function fileOrManual(name: string): FactoryLevelFile | undefined {
  try {
    return readFactoryLevel(name);
  } catch (err) {
    const line = `nemia: ${(err as Error).message} Until then ${name} reads as manual.`;
    if (!saidAlready.has(line)) process.stderr.write(`${line}\n`);
    saidAlready.add(line);
    return { level: 'manual', since: new Date(0).toISOString() };
  }
}

/** The store's own level: what `nemia level <level>` set, `manual` where it never was. */
const storeLevel = (): Level => readLevel()?.level ?? 'manual';

/** The factory `name`'s level at `at` (ms), the store's level `store` under it; the default factory's is the store's alone. */
const rowOf = (name: string, store: Level, at: number): FactoryLevel =>
  factoryLevelOf(name, name === DEFAULT_FACTORY ? undefined : fileOrManual(name), store, at);

/** Every factory's level at `at`, the default factory first, then each factory of the store that reads, by name. */
export const levelsNow = (at: number = Date.now()): Effect.Effect<FactoryLevel[], Refusal> =>
  tried(() => {
    const store = storeLevel();
    return [DEFAULT_FACTORY, ...factoryNames()].map((name) => rowOf(name, store, at));
  });

/** The level at `at` of the factory `name`, the default factory where none is named. */
export const levelOfFactory = (name: string | undefined, at: number = Date.now()): Effect.Effect<Level, Refusal> =>
  tried(() => rowOf(name ?? DEFAULT_FACTORY, storeLevel(), at).level);

/** The factory the run `runId` was started in, frozen on its record: the default factory where it names none. Refused: no such run. */
export const runFactory = (runId: string): Effect.Effect<string, Refusal> =>
  Effect.map(
    Effect.flatMap(RunDoor, (door) => door.runs.read(RunId.read(runId))),
    (run) => run.factory ?? DEFAULT_FACTORY,
  );
