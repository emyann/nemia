/**
 * The levels now: the store's own (`nemia/level.json`, which `nemia level <level>` sets) for the default factory and every factory that
 * names none, and each factory's own file over it (`level.store.ts`), a raise counted until its end; and the factory a run was started in.
 * Read again on each call, carrying nothing between them, so a raise past its end reads as gone with no write.
 *
 * A controller beneath the CLI: it joins the factory's level store with the store's (`nemia/level.store.ts`), which no store file imports.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { tried } from '../runtime-client.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { FactoryDoor, type FactoryDoorShape } from '../factory/door/factories.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { readLevel } from '../nemia/level.store.ts';
import { factoryLevelOf, type FactoryLevel, type FactoryLevelFile, type Level } from './level.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { runNamespace } from '../run-list/index.ts';

/** Each factory level file that does not read said once a process: the deliverer and the keeper read the levels every beat. */
const saidAlready = new Set<string>();

/**
 * The factory `name`'s file, read through the door, none for the default factory, whose level is the store's; one that does not read is
 * said once on stderr and read as `manual`, so the factory is left alone.
 */
const fileOrManual = (door: FactoryDoorShape, name: string): Effect.Effect<FactoryLevelFile | undefined> =>
  door.level.read(FactoryName.read(name)).pipe(
    Effect.catch((err) =>
      Effect.sync(() => {
        const line = `nemia: ${err.message} Until then ${name} reads as manual.`;
        if (!saidAlready.has(line)) process.stderr.write(`${line}\n`);
        saidAlready.add(line);
        return { level: 'manual' as const, since: new Date(0).toISOString() };
      }),
    ),
  );

/** The store's own level: what `nemia level <level>` set, `manual` where it never was. */
const storeLevel = (home: string): Level => readLevel(home)?.level ?? 'manual';

/** The levels of the factories `names` at `at` (ms), each its own file over the store's level, read through the door. */
const rowsOf = (door: FactoryDoorShape, names: readonly string[], at: number): Effect.Effect<FactoryLevel[], Refusal, StoreRoot> =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const store = yield* tried(() => storeLevel(home));
    const rows: FactoryLevel[] = [];
    for (const name of names) rows.push(factoryLevelOf(name, yield* fileOrManual(door, name), store, at));
    return rows;
  });

/** Every factory's level at `at`, the default factory first, then each factory of the store that reads, by name. */
export const levelsNow = (at: number = Date.now()): Effect.Effect<FactoryLevel[], Refusal, StoreRoot> =>
  Effect.gen(function* () {
    const door = yield* FactoryDoor;
    const unread = new Set((yield* door.factories.listed()).flatMap((l) => ('error' in l ? [l.name] : [])));
    return yield* rowsOf(
      door,
      (yield* door.factories.list()).filter((name) => !unread.has(name)),
      at,
    );
  });

/** The level at `at` of the factory `name`, the default factory where none is named. */
export const levelOfFactory = (name: string | undefined, at: number = Date.now()): Effect.Effect<Level, Refusal, StoreRoot> =>
  Effect.gen(function* () {
    const [row] = yield* rowsOf(yield* FactoryDoor, [runNamespace(name)], at);
    return row?.level ?? storeLevel(yield* StoreRoot);
  });

/** The factory the run `runId` was started in, frozen on its record: the default factory where it names none. Refused: no such run. */
export const runFactory = (runId: string): Effect.Effect<string, Refusal> =>
  Effect.map(
    Effect.flatMap(RunDoor, (door) => door.runs.read(RunId.read(runId))),
    (run) => runNamespace(run.factory),
  );
