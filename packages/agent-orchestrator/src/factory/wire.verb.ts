/**
 * A person's change of a factory, through the Factory door (`FactoryDoor`): its wiring — a workflow attached or detached, a hire, a fire,
 * a schedule — read, judged and written back (`wire`), and the store's root a verb's handler was given provided to the door (`rooted`).
 * What `nemia factory`'s verbs and `nemia factory schedule` run; the judgement is `wiring.ts`'s, the disk's facts the verb's own
 * (`onDisk`).
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { rootGiven, StoreRoot } from '../config/root.store.ts';
import type { Factory } from './factory.ts';
import { FactoryName } from './factory.model.ts';
import { FactoryDoor } from './factories.store.ts';
import { wiringChecked, wiringNamesRefused } from './factory.store.ts';
import type { WiringChange } from './wiring.ts';

/** `program`, given the store's root `home` the handler of `verb` was given, refused (`rootGiven`) where it was given none. */
export const rooted = <A, R>(
  home: string | undefined,
  verb: string,
  program: Effect.Effect<A, Refusal, R>,
): Effect.Effect<A, Refusal, Exclude<R, StoreRoot>> =>
  Effect.flatMap(
    tried(() => rootGiven(home, verb)),
    (root) => Effect.provideService(program, StoreRoot, root),
  );

/**
 * The factory `name` changed by `change` through the door: the names refused first (`wiringNamesRefused`), the factory read, judged
 * (`wiringChecked`, with `onDisk`'s facts) and written back, which writes no file whose words it leaves as they were. Answers what it
 * was, what it is — the very factory it was where the change changes nothing (an attach of one offered) — and the file written back.
 */
export const wire = (
  name: string,
  change: WiringChange,
  onDisk?: (factory: Factory) => Error | undefined,
): Effect.Effect<{ was: Factory; now: Factory; file: string }, Refusal> =>
  Effect.gen(function* () {
    yield* tried(() => wiringNamesRefused(name, change));
    const door = yield* FactoryDoor;
    const was = yield* door.factories.read(FactoryName.read(name));
    const now = yield* tried(() => wiringChecked(was, change, onDisk));
    return { was, now, file: yield* door.factories.rewrite(now) };
  });
