/**
 * `decodes<T>()(schema)`: the schema itself at run time, refused by the compiler where what it decodes is not `T` both ways — narrower (a
 * word left out, a `null` refused, a `?` key required), wider, or `any`. `Same` is the equality it holds, which `test/wire.test.ts` holds
 * between each mirror and the api's type. A sibling that imports none, never handed out by the barrel.
 */
import type { Schema } from 'effect';

/** Marks a key that may be left out, so an optional key is told from a required one and from none at all. */
declare const optional: unique symbol;

/** `T` with its arrays mutable and each optional key required and marked, through unions, arrays and objects. */
type Shape<T> = unknown extends T
  ? T
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends ReadonlyArray<infer E>
      ? number extends T['length']
        ? Shape<E>[]
        : { -readonly [K in keyof T]: Shape<T[K]> }
      : { -readonly [K in keyof T]-?: Shape<T[K]> | ({} extends Pick<T, K> ? typeof optional : never) };

type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * True when neither side is `any` and each is assignable to the other, key by key, with an optional key apart from a required one; else
 * the words of which side is not the other's.
 */
export type Same<A, B> =
  IsAny<A> extends true
    ? 'the first is any'
    : IsAny<B> extends true
      ? 'the second is any'
      : [Shape<A>] extends [Shape<B>]
        ? [Shape<B>] extends [Shape<A>]
          ? true
          : 'the second does not fit the first'
        : 'the first does not fit the second';

/** Only `true`: a `Same` that is not fails to compile where it is held. */
export type Holds<T extends true> = T;

/** What the compiler says at a schema that does not decode `T`. */
type Refused<T> = { readonly 'decodes: the schema does not decode its type both ways; make it match': T };

/** `schema`, typed as it is, where it decodes exactly `T`. */
export const decodes =
  <T>() =>
  <S extends Schema.Top>(schema: S & (Same<S['Type'], T> extends true ? unknown : Refused<T>)): S =>
    schema;
