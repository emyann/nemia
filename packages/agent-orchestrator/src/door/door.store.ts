/**
 * A door's pattern: what every aggregate's door is built from, and names no aggregate. A door is one Effect service (`Context.Service`)
 * through which an aggregate is read and written, each method an Effect whose failure is a refusal (`Refusal`); its layers — the files
 * and a memory stand-in — are each a plain value of synchronous methods turned into the door's shape by `doorOf`, and the write a layer
 * takes is checked first, on every layer, by the aggregate's own schema (`checked`), so a write that breaks an invariant is refused the
 * same way whichever layer holds the records. A door whose records are in the keyspace answers its shape's Effects itself, with no
 * synchronous layer under it: the Proposal door (`src/proposal/proposal.store.ts`, over `src/keyspace/keyspace.store.ts`), whose
 * stand-in is the same code over a keyspace in memory. The walks that hold the layers to one table are the tests' (`test/door-walks.ts`,
 * `walkedOn` for a door that answers its Effects itself).
 *
 * A door whose files are under the store's root is rooted (`rootedDoor`): its default reads the root the program is given, `StoreRoot`,
 * when a method runs, and is refused where none was given, so a door never reads a root of its own module's.
 *
 * A store file by its name, as the kinds go (`test/boundary.test.ts`): it touches no disk, and a pure file loads no Effect but
 * `effect/Data`. The client builds `tried` on `fromThrow`, so a controller's read and a door's act fail and die alike.
 */
import { Effect, Option, Result, Schema } from 'effect';
import { refusedIn, type RefusedPlace } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { Invalid, isRefusal, type Refusal } from '../refusal/refusal.ts';

/**
 * A synchronous act as an Effect: what `act` returns, or the refusal it threw as the failure (`isRefusal`); anything else it threw, the
 * program dies of.
 * @param act The synchronous act to run.
 */
export const fromThrow = <A>(act: () => A) =>
  Effect.try({ try: act, catch: (err) => err }).pipe(Effect.catch((err) => (isRefusal(err) ? Effect.fail(err) : Effect.die(err))));

/** A method of a layer, turned into the door's: its first parameter, where it is a string, the door's id `I`, and an Effect answered. */
type Doored<F, I> = F extends (...args: infer P) => infer R
  ? (...args: P extends [string, ...infer Rest] ? [I, ...Rest] : P) => Effect.Effect<R, Refusal>
  : never;

/** A door's shape from its layer's: each group of synchronous methods, each method answering an Effect (`Doored`). */
export type DoorOf<T, I extends string> = {
  readonly [G in keyof T]: { readonly [M in keyof T[G]]: Doored<T[G][M], I> };
};

/**
 * A layer's plain value of synchronous methods as a door: each method's act run by `fromThrow` when the Effect runs, never when it is
 * built, so a read is made where the program yields it.
 * @param layer The layer's plain value: groups of synchronous methods.
 */
export function doorOf<T extends Record<string, Record<string, (...args: never[]) => unknown>>, I extends string>(layer: T) {
  return Object.fromEntries(
    Object.entries(layer).map(([group, methods]) => [
      group,
      Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (...args: never[]) => fromThrow(() => method(...args))])),
    ]),
  ) as DoorOf<T, I>;
}

/**
 * A door as a layer's plain value again: each method runs the door's Effect at once, its refusal thrown and a defect thrown as it was.
 * What a synchronous caller that no program yields yet reads a door through, its writes checked as the door checks them.
 * @param door The door to read and write through.
 */
export function atOnce<T, I extends string>(door: DoorOf<T, I>) {
  return Object.fromEntries(
    Object.entries(door as Record<string, Record<string, (...args: never[]) => Effect.Effect<unknown, Refusal>>>).map(
      ([group, methods]) => [
        group,
        Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (...args: never[]) => Effect.runSync(method(...args))])),
      ],
    ),
  ) as T;
}

const shownValue = (value: unknown) => {
  const json = JSON.stringify(value) ?? 'undefined';
  return json.length > 60 ? `${json.slice(0, 60)}…` : json;
};

const placeWords = (place: RefusedPlace | undefined) => {
  if (place === undefined) return 'is not what the schema says';
  if (place.message !== undefined) return place.message;
  return place._tag === 'MissingKey' ? 'is missing' : `is ${shownValue(place.input)}, where the schema takes ${place.expected}`;
};

/**
 * Why `value` breaks `schema`: its first refused place, read by its `_tag` (objects' `refusedIn`), or null when it decodes. The words
 * are the check's own where the schema declared them (each says its fix); else a missing key `is missing`, and any other place the value
 * found there, quoted as JSON to at most 60 characters, and what the schema takes. What a layer refuses a write by.
 * @param schema The aggregate's schema.
 * @param value The value to decode.
 */
export function brokenBy(schema: Schema.Top, value: unknown) {
  const decoded = Schema.decodeUnknownResult(schema as Schema.Codec<unknown>)(value, { reportInput: true });
  if (Result.isSuccess(decoded)) return null;
  const [place] = refusedIn(decoded.failure.issue);
  const at = (place?.path ?? []).map(String).join('.');
  return `${at ? `its \`${at}\` ` : ''}${placeWords(place)}`;
}

/**
 * The write check of a door: `value` as given, or `Invalid` naming what of `subject` it breaks (`brokenBy`), before any layer writes it.
 * @param schema The aggregate's schema the write is checked by.
 * @param subject Names what is written, for the refusal, from the value.
 */
export const checked =
  <S extends Schema.Top>(schema: S, subject: (value: never) => string) =>
  <A>(value: A) => {
    const broken = brokenBy(schema, value);
    return broken === null
      ? Effect.succeed(value)
      : Effect.fail(new Invalid({ message: `${subject(value as never)} is not written: ${broken}` }));
  };

/**
 * A door whose layer is built at the store's root a program is given (`StoreRoot`), when each method runs: `over(root)`'s method, or,
 * given no root, `Invalid` naming the fix — a program reads no store it was not pointed at. What a definition door defaults to, so a
 * program given `StoreRoot` (the CLI's, the api's) reads its files and a test gives the door's memory layer with no root at all. `over`
 * is built once with no root for its methods' names, none of which runs; `door` names the door in the refusal.
 * @param over Builds the door's layer at a store's root.
 * @param door The door's name, said in the refusal.
 */
export function rootedDoor<D extends object>(over: (root: string) => D, door: string) {
  const unrooted = new Invalid({
    message: `the ${door} was given no store root: provide StoreRoot where the program is composed (storeRootLayer, src/config/root.store.ts), or give the program the door's memory layer. Nothing was read or written.`,
  });
  const at = (root: string) => over(root) as Record<string, Record<string, (...args: never[]) => Effect.Effect<unknown, Refusal>>>;
  return Object.fromEntries(
    Object.entries(at('')).map(([group, methods]) => [
      group,
      Object.fromEntries(
        Object.keys(methods).map((name) => [
          name,
          (...args: never[]) =>
            Effect.flatMap(Effect.serviceOption(StoreRoot), (root) => {
              const method = Option.isSome(root) ? at(root.value)[group]?.[name] : undefined;
              return method === undefined ? Effect.fail(unrooted) : method(...args);
            }),
        ]),
      ),
    ]),
  ) as D;
}
