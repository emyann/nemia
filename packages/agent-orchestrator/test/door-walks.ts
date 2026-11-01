/**
 * A door's contract, as walks: for every method of a door (`<group>.<method>`), the sequences a layer is asked and the one answer each
 * must give (`says`), written once and run on each of its layers (`walksOn`), so the memory stand-in is held to what the files say. The
 * pattern of every door (`src/door/door.store.ts`), as `place-walks.ts` is the place's: a door names its own rows and sides, and this
 * file names no aggregate.
 *
 * A walk's acts are Effects, run at once (`act`): what one succeeds with, or `{ refused: <kind> }` for a refusal, since each layer words
 * its own. An answer is compared after `told`, the side's root read as `<root>`. What one layer alone can be asked — a file planted on
 * disk, the store's pause — is a test of that layer's own file, never a walk. `unwalked` names a method with no walk.
 */
import assert from 'node:assert/strict';
import { Cause, Effect, Exit, Layer, type Context } from 'effect';

/** One side of a door's contract: the door as its layer gives it, the root its paths are named under, and the layer's name. */
export type DoorSide<D> = { readonly door: D; readonly root: string; readonly layer: string };

/** One walk: what it shows, what it asks of a side, and the one answer every side gives. */
export type DoorWalk<D> = { readonly name: string; readonly walk: (side: DoorSide<D>) => unknown; readonly says: unknown };

/** An act of a door, run at once: what it succeeded with, or `{ refused }` naming the refusal's kind. A defect throws. */
export function act<A>(effect: Effect.Effect<A, { readonly _tag: string }>): A | { refused: string } {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  if (failed) return { refused: failed.error._tag };
  throw Cause.squash(exit.cause);
}

/** An act of a door that must succeed: what it succeeded with; a refusal fails the walk. */
export function done<A>(effect: Effect.Effect<A, { readonly _tag: string }>): A {
  const answer = act(effect);
  if (typeof answer === 'object' && answer !== null && 'refused' in answer) assert.fail(`refused as ${String(answer.refused)}`);
  return answer;
}

/** The service `tag` gives over `layer`, built once: what a side's walks ask. */
export const doorFrom = <I, D>(tag: Context.Key<I, D>, layer: Layer.Layer<I>): D => Effect.runSync(Effect.provide(tag, layer));

/** `value` with the side's root as `<root>`, wherever a string holds it. */
export function told(value: unknown, root: string): unknown {
  if (typeof value === 'string') return value.replaceAll(root, '<root>');
  if (Array.isArray(value)) return value.map((one) => told(one, root));
  if (value instanceof Map) return told(Object.fromEntries(value), root);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, told(one, root)]));
}

/** Every method of a door, as `<group>.<method>`. */
export const methodsOf = (door: object): string[] =>
  Object.entries(door).flatMap(([group, methods]) => Object.keys(methods as object).map((m) => `${group}.${m}`));

/** The methods of `door` no walk of `walks` names in its `<group>.<method>` key. */
export const unwalked = (door: object, walks: Readonly<Record<string, readonly unknown[]>>): string[] =>
  methodsOf(door).filter((m) => !walks[m]?.length);

/**
 * Each walk of `walks` on the side `sideOf` makes, new for each walk, as a test's name and body; first, that every method of the side's
 * door has a walk.
 */
export function walksOn<D extends object>(
  walks: Readonly<Record<string, readonly DoorWalk<D>[]>>,
  sideOf: () => DoorSide<D>,
): Array<readonly [name: string, body: () => void]> {
  const first = sideOf();
  const covered: readonly [string, () => void] = [
    `every method of the door has a walk, on ${first.layer}`,
    () => assert.deepEqual(unwalked(first.door, walks), []),
  ];
  return [
    covered,
    ...Object.entries(walks).flatMap(([method, list]) =>
      list.map(
        (w) =>
          [
            `${method}: ${w.name}`,
            () => {
              const side = sideOf();
              assert.deepEqual(told(w.walk(side), side.root), w.says);
            },
          ] as const,
      ),
    ),
  ];
}
