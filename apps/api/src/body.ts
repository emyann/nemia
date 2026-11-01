/**
 * A request's JSON body, decoded with its route's schema — or refused in the route's own words. A schema says what each key must be; a
 * route's `words` say why the first key that is not is refused. No schema's message reaches a response.
 */
import { Result, Schema, SchemaIssue } from 'effect';
import type { SchemaAST } from 'effect';
import type { Refusal } from './guard.ts';

/**
 * The first thing a schema refused in a body: where (`path`, the keys from the body down to the value, `[]` for the body itself), what
 * (`kind`), and the value there as the body has it (`input`, undefined for a key left out).
 *
 * `missing` is a required key left out; `type` a value of the wrong type, or not one of the values allowed — the body itself where `path`
 * is empty, which is not an object; `check` a value of the right type that fails a check the schema adds; `excess` a key the schema does
 * not have, under `onExcessProperty: 'error'`.
 */
export type BodyIssue = {
  path: ReadonlyArray<PropertyKey>;
  kind: 'missing' | 'type' | 'check' | 'excess';
  input: unknown;
};

/** A route's words for the first issue of `body`: a sentence, answered 400, or a refusal with its own status. */
export type Words = (issue: BodyIssue, body: unknown) => string | Refusal;

/** A string with something in it but spaces: a name, as a command line takes one. */
export const NotBlank = Schema.String.check(Schema.makeFilter((s: string) => s.trim() !== ''));

/** The first leaf of an issue tree, with the path to it: the first pointer at each level, and a failed check read as the check. */
function firstLeaf(issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>): Omit<BodyIssue, 'input'> {
  switch (issue._tag) {
    case 'Pointer':
      return firstLeaf(issue.issue, [...path, ...issue.path]);
    case 'Composite':
      return firstLeaf(issue.issues[0], path);
    case 'AnyOf': {
      const [first] = issue.issues;
      return first === undefined ? { path, kind: 'type' } : firstLeaf(first, path);
    }
    case 'Encoding':
      return firstLeaf(issue.issue, path);
    case 'Filter':
      return { path, kind: 'check' };
    case 'MissingKey':
      return { path, kind: 'missing' };
    case 'UnexpectedKey':
      return { path, kind: 'excess' };
    case 'InvalidType':
    case 'InvalidValue':
    case 'Forbidden':
    case 'OneOf':
      return { path, kind: 'type' };
  }
}

/** The value at `path` in `value`, or undefined where a key on the way is not there. */
export function valueAt(value: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let at = value;
  for (const key of path) {
    if (typeof at !== 'object' || at === null || !Object.hasOwn(at, key)) return undefined;
    at = Reflect.get(at, key);
  }
  return at;
}

/** The first issue of a failed decode of `value`, as a route's words read it. */
export function issueOf(issue: SchemaIssue.Issue, value: unknown): BodyIssue {
  const leaf = firstLeaf(issue, []);
  return { ...leaf, input: valueAt(value, leaf.path) };
}

/** `value` decoded with `schema`, or the refusal `words` make of its first issue (400 for a sentence). */
export function decodeBody<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  words: Words,
  options?: SchemaAST.ParseOptions,
): { body: S['Type'] } | Refusal {
  const decoded = Schema.decodeUnknownResult(schema, options)(value);
  if (Result.isSuccess(decoded)) return { body: decoded.success };
  const said = words(issueOf(decoded.failure.issue, value), value);
  return typeof said === 'string' ? { status: 400, error: said } : said;
}

/**
 * A request's body read as JSON and decoded with `schema`: a body that is not JSON is refused with `notJson` (400), and one the schema
 * refuses in the route's `words`.
 */
export async function readBody<S extends Schema.ConstraintDecoder<unknown>>(
  req: { json: () => Promise<unknown> },
  schema: S,
  notJson: string,
  words: Words,
  options?: SchemaAST.ParseOptions,
): Promise<{ body: S['Type'] } | Refusal> {
  let value: unknown;
  try {
    value = await req.json();
  } catch {
    return { status: 400, error: notJson };
  }
  return decodeBody(schema, value, words, options);
}
