/**
 * What the git place reads of a request before it acts on it: `readable[verb](request)` throws `Malformed`, naming the first field that
 * is not what the verb asks, and returns nothing for a request the verb can read. A request reaches the place typed, and one that is not
 * what its type says is answered unread in these words, never acted on.
 */
import type { PlaceVerb } from '../../src/place/place.ts';

/** A request as it arrived, before its fields are read. */
type Request = Readonly<Record<string, unknown>>;

/** A request the place cannot read: its message is what the verb's unread outcome says. */
export class Malformed extends Error {}

/** How a field that is not what was asked is said: its value, or that it is missing. */
const said = (value: unknown): string => JSON.stringify(value) ?? 'missing';

/** Refuses a `key` of `request` that is no string. */
function text(request: Request, key: string): void {
  if (typeof request[key] !== 'string') throw new Malformed(`the request's \`${key}\` is ${said(request[key])}, where a string is asked`);
}

/** Refuses a `key` of `request` that is no object of strings. */
function strings(request: Request, key: string): void {
  const value = request[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.values(value).some((v) => typeof v !== 'string'))
    throw new Malformed(`the request's \`${key}\` is ${said(value)}, where an object of strings is asked`);
}

/** Refuses a `key` of `request` that is no list of strings. */
function texts(request: Request, key: string): void {
  const value = request[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    throw new Malformed(`the request's \`${key}\` is ${said(value)}, where a list of strings is asked`);
}

/** Refuses a `key` of `request` that is no boolean. */
function flag(request: Request, key: string): void {
  if (typeof request[key] !== 'boolean') throw new Malformed(`the request's \`${key}\` is ${said(request[key])}, where a boolean is asked`);
}

/** Whether `value` is what `standing` was last told of a branch: `{ tip, pastBase }`, a string or null and a boolean or null. */
const isKnown = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const { tip, pastBase } = value as Record<string, unknown>;
  return (typeof tip === 'string' || tip === null) && (typeof pastBase === 'boolean' || pastBase === null);
};

/** Refuses `branches` of `request` that is no list, and the first of them that is no branch `standing` can read. */
function branches(request: Request): void {
  const value = request.branches;
  if (!Array.isArray(value)) throw new Malformed(`the request's \`branches\` is ${said(value)}, where a list of branches is asked`);
  value.forEach((b: unknown, i) => {
    const one = (b ?? {}) as Record<string, unknown>;
    const { tip, known } = one;
    const wellFormed =
      typeof one.branch === 'string' &&
      typeof one.baseRef === 'string' &&
      (tip === undefined || typeof tip === 'string') &&
      (known === undefined || isKnown(known));
    if (!wellFormed)
      throw new Malformed(
        `the request's \`branches[${i}]\` is ${JSON.stringify(b)}, where { branch, tip?, baseRef, known?: { tip, pastBase } } is asked`,
      );
  });
}

/** Refuses `trials` of `request` that is no list of pairs, each a string `onto` and `branch`. */
function pairs(request: Request): void {
  const value = request.trials;
  const valid =
    Array.isArray(value) &&
    value.every((p: unknown) => {
      const one = (p ?? {}) as Record<string, unknown>;
      return typeof p === 'object' && typeof one.onto === 'string' && typeof one.branch === 'string';
    });
  if (!valid) throw new Malformed(`the request's \`trials\` is ${said(value)}, where a list of { onto, branch } is asked`);
}

/** Refuses an `act` of `request` that is neither commit nor abort, and a commit with no message. */
function act(request: Request): void {
  text(request, 'act');
  if (request.act !== 'commit' && request.act !== 'abort')
    throw new Malformed(`the request's \`act\` is ${JSON.stringify(request.act)}, where commit or abort is asked`);
  if (request.act === 'commit') text(request, 'message');
}

/** `check` of each of `keys`, in order. */
const each =
  (check: (request: Request, key: string) => void, ...keys: string[]) =>
  (request: Request) =>
    keys.forEach((key) => check(request, key));

/** What each verb reads of its request, in the order it names what it cannot read. */
const READS: { readonly [V in PlaceVerb]: readonly ((request: Request) => void)[] } = {
  root: [each(text, 'dir')],
  open: [each(text, 'root'), each(flag, 'isolate')],
  make: [each(text, 'repo', 'at', 'name', 'from'), each(texts, 'also')],
  handoff: [each(text, 'workspace', 'step', 'why')],
  report: [each(text, 'repo', 'baseRef', 'onto'), each(texts, 'branches', 'diffOf', 'present', 'atBase')],
  standing: [each(text, 'repo', 'base'), branches],
  trial: [each(text, 'repo'), pairs],
  status: [each(text, 'checkout'), each(strings, 'tips')],
  land: [each(text, 'checkout'), act],
  inventory: [each(text, 'repo', 'under', 'prefix', 'base')],
  remove: [each(text, 'repo'), each(texts, 'workspaces', 'branches')],
  export: [each(text, 'repo', 'tag', 'into')],
  seal: [each(text, 'tree')],
};

/** Throws `Malformed` for a `request` that `verb` cannot read. */
export function readable(verb: PlaceVerb, request: object): void {
  for (const read of READS[verb]) read(request as Request);
}
