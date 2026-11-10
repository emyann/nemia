/**
 * A factory's wiring and policy planted for a test through the Factory door at the store `home`, as the person's verbs write them
 * (`nemia factory detach`, `fire`, `revisions`): run at once, a refusal thrown as its kind. The planters the module-root writers were,
 * now that a factory is written only through the door. Import it after `WF_ROOT` is set, as the package's modules are.
 */

import { Effect } from 'effect';
import { StoreRoot } from '../src/config/root.store.ts';
import { FactoryDoor, filedFactory } from '../src/factory/door/factories.store.ts';
import { unhiredFireRefusal, type RevisionsPolicy } from '../src/factory/factory.ts';
import { wire } from '../src/factory/wiring/wire.verb.ts';
import { Missing, type Refusal } from '../src/refusal/refusal.ts';

/** `program` run at once at the store `home`, its refusal thrown. */
const atOnce = <A>(home: string, program: Effect.Effect<A, Refusal>): A => Effect.runSync(Effect.provideService(program, StoreRoot, home));

/** The workflow `workflow` taken from the factory `factory`, as `nemia factory detach` takes it: the file written back. */
export const detached = (home: string, factory: string, workflow: string): string =>
  atOnce(
    home,
    Effect.map(wire(factory, { verb: 'detach', workflow }), ({ file }) => file),
  );

/** The hire of the step `step` taken back from the factory `factory`, as `nemia factory fire` takes it: the agent fired. */
export const fired = (home: string, factory: string, step: string): string =>
  atOnce(
    home,
    Effect.gen(function* () {
      const { was } = yield* wire(factory, { verb: 'fire', step });
      const agent = was.hires[step];
      return agent ?? (yield* Effect.fail(new Missing({ message: unhiredFireRefusal(factory, step, was.hires) })));
    }),
  );

/** Whether the factory `factory`'s runs follow merged revisions, written as `nemia factory revisions` writes it: the file. */
export const followed = (home: string, factory: string, revisions: RevisionsPolicy): string =>
  atOnce(
    home,
    Effect.gen(function* () {
      const filed = yield* filedFactory(factory, 'revisions');
      return yield* (yield* FactoryDoor).factories.rewrite({ ...filed, revisions });
    }),
  );
