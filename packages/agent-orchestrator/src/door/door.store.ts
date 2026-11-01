/**
 * A door's pattern: what every aggregate's door is built from, and names no aggregate. A door is one Effect service (`Context.Service`)
 * through which an aggregate is read and written, each method an Effect whose failure is a refusal (`Refusal`); its layers — the files
 * and a memory stand-in — are each a plain value of synchronous methods turned into the door's shape by `doorOf`, and the write a layer
 * takes is checked first, on every layer, by the aggregate's own schema (`checked`), so a write that breaks an invariant is refused the
 * same way whichever layer holds the records. The walks that hold the layers to one table are the tests' (`test/door-walks.ts`).
 *
 * A door whose files are under the store's root is rooted (`rootedDoor`): its default reads the root the program is given, `StoreRoot`,
 * when a method runs, and is refused where none was given, so a door never reads a root of its own module's. The Run door's default is
 * not rooted yet: its files store still reads the module's (`test/global-roots.baseline.ts`).
 *
 * A store file by its name, as the kinds go (`test/boundary.test.ts`): it touches no disk, and a pure file loads no Effect but
 * `effect/Data`. The client builds `tried` on `fromThrow`, so a controller's read and a door's act fail and die alike.
 */
import { Effect, Option, Result, Schema, SchemaIssue } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { Invalid, isRefusal, type Refusal } from '../refusal/refusal.ts';

/**
 * A synchronous act as an Effect: what `act` returns, or the refusal it threw as the failure (`isRefusal`); anything else it threw, the
 * program dies of.
 */
export const fromThrow = <A>(act: () => A): Effect.Effect<A, Refusal> =>
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
 */
export function doorOf<T extends Record<string, Record<string, (...args: never[]) => unknown>>, I extends string>(layer: T): DoorOf<T, I> {
  return Object.fromEntries(
    Object.entries(layer).map(([group, methods]) => [
      group,
      Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (...args: never[]) => fromThrow(() => method(...args))])),
    ]),
  ) as DoorOf<T, I>;
}

/**
 * Why `value` breaks `schema`: the words of its first issue, the check's own where a check refused it (each says its fix), or null when
 * it decodes. What a layer refuses a write by.
 */
export function brokenBy(schema: Schema.Top, value: unknown): string | null {
  const decoded = Schema.decodeUnknownResult(schema as Schema.Codec<unknown>)(value);
  if (Result.isSuccess(decoded)) return null;
  const [first] = SchemaIssue.makeFormatterStandardSchemaV1()(decoded.failure.issue).issues;
  const at = (first?.path ?? []).map((p) => String(typeof p === 'object' && p !== null && 'key' in p ? p.key : p)).join('.');
  return `${at ? `its \`${at}\` ` : ''}${first?.message ?? 'is not what the schema says'}`;
}

/**
 * The write check of a door: `value` as given, or `Invalid` naming what of `subject` it breaks (`brokenBy`), before any layer writes it.
 */
export const checked =
  <S extends Schema.Top>(schema: S, subject: (value: never) => string) =>
  <A>(value: A): Effect.Effect<A, Invalid> => {
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
 */
export function rootedDoor<D extends object>(over: (root: string) => D, door: string): D {
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
