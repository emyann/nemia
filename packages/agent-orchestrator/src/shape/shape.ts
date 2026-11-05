/**
 * What the output shapes (`"x-shape"`: questions, budgets) read a value and a schema by: an object's own fields and a list's items as fresh
 * values, and whether a field's schema is one a shape expands to. Pure, and read without a type predicate or a cast, so that what a step's
 * status reads through it (`closeoutRefusals`) is checked pure by the contracts' verifier, which also counts only a spread as an array
 * allocated here: a key list is spread before it is sorted, where the linter would call the spread useless.
 */

/** `value`'s own fields, as a fresh record, where it is an object that is no list; else undefined. */
export const fieldsOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;

/** `value`'s items, as a fresh list, where it is a list; else undefined. */
export const itemsOf = (value: unknown): unknown[] | undefined => (Array.isArray(value) ? Array.from<unknown>(value) : undefined);

/** A value's JSON with every object's keys sorted, so two schemas compare whatever order their keys were written in. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => {
    const fields = fieldsOf(v);
    if (!fields) return v;
    // oxlint-disable-next-line unicorn/no-useless-spread -- the verifier sees only a spread as allocated here (`fieldsOf`)
    const entries = [...Object.entries(fields)];
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  });

/** Whether a field's schema is one of `known`, its `description` aside. */
export const sameSchema = (schema: unknown, known: readonly unknown[]): boolean => {
  const fields = fieldsOf(schema);
  if (!fields) return false;
  const { description: _, ...rest } = fields;
  return known.some((k) => canonical(rest) === canonical(k));
};
