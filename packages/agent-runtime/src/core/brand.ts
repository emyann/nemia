/**
 * One identifier of the model in its two forms (decision Q22): checked on create, nominal on read, so a record written before the
 * check still reads. Built on Effect's `Brand` (`Brand.check` takes the same `Schema` check the create schema runs, so the rule has
 * one home), and keyed by its name alone: two layers that name the same key hold the same type with no import between them.
 *
 * `Schema.brand` proves a single concrete key, which a generic `K` cannot, so the key alone is passed through `never` here; `brand`
 * changes no runtime AST (Schema.d.ts, `brand`), only the type, and the type is the `Id<K>` this file states.
 */
import { Brand, Schema, type SchemaAST } from 'effect';

/** A string identifier of the model, nominal by its key. */
export type Id<K extends string> = string & Brand.Brand<K>;

/** A count of the model (an attempt's number, a feed's cursor), nominal by its key. */
export type Count<K extends string> = number & Brand.Brand<K>;

const forms = <const K extends string, A extends Brand.Brand<K>, S extends Schema.Top>(
  name: K,
  base: S,
  checks: readonly [SchemaAST.Check<Brand.Brand.Unbranded<A>>, ...Array<SchemaAST.Check<Brand.Brand.Unbranded<A>>>],
) => ({
  name,
  create: Brand.check<A>(...checks),
  read: Brand.nominal<A>(),
  OnCreate: base.pipe(Schema.check(...(checks as never as [never])), Schema.brand<K>(name as never)).annotate({ identifier: name }),
  OnRead: base.pipe(Schema.brand<K>(name as never)).annotate({ identifier: name }),
});

/**
 * An id this layer mints. `rule` is its writer's own: the pattern constant, or the refusal function that returns what is wrong with
 * a value (and nothing for a good one), imported rather than copied, so the model and the writer cannot disagree.
 */
export const brandedId = <const K extends string>(name: K, rule: RegExp | ((value: string) => string | null | undefined)) =>
  forms<K, Id<K>, typeof Schema.String>(name, Schema.String, [
    rule instanceof RegExp
      ? Schema.isPattern(rule, { expected: `a ${name}` })
      : Schema.makeFilter<string>((value) => rule(value) ?? true, { expected: `a ${name}` }),
  ]);

/** A whole number at least `minimum`. */
export const brandedCount = <const K extends string>(name: K, minimum: number) =>
  forms<K, Count<K>, typeof Schema.Number>(name, Schema.Number, [
    Schema.isInt({ expected: `a whole ${name}` }),
    Schema.isGreaterThanOrEqualTo(minimum, { expected: `a ${name} of at least ${minimum}` }),
  ]);

/** An id another layer mints: this layer holds it as a relation and never checks its shape, so it has the read form only. */
export const foreignId = <const K extends string>(name: K) => ({
  name,
  read: Brand.nominal<Id<K>>(),
  OnRead: Schema.String.pipe(Schema.brand<K>(name as never)).annotate({ identifier: name }),
});
