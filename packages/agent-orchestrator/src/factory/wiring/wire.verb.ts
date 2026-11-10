/**
 * A person's change of a factory, through the Factory door (`FactoryDoor`): its wiring — a workflow attached or detached, a hire, a fire,
 * a schedule — read, judged and written back (`wire`).
 * What `nemia factory`'s verbs and `nemia factory schedule` run; the judgement is `wiring.ts`'s, the disk's facts the verb's own
 * (`onDisk`).
 */
import { Effect } from 'effect';
import { tried } from '../../runtime-client.ts';
import type { Refusal } from '../../refusal/refusal.ts';
import type { Factory } from '../factory.ts';
import { FactoryDoor, filedFactory, wiringChecked, wiringNamesRefused } from '../door/factories.store.ts';
import type { WiringChange } from './wiring.ts';

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
    const was = yield* filedFactory(name, change.verb);
    const now = yield* tried(() => wiringChecked(was, change, onDisk));
    return { was, now, file: yield* door.factories.rewrite(now) };
  });
