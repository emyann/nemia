/**
 * What a namespace serves of the definitions — the Workflows, Agents and Skills a factory resolves — and where a write of one goes: two
 * pure deciders the api's handlers read, so which definition a factory resolves stays the orchestrator's meaning.
 *
 * `definitionServed`: of the origins that hold one name, in the order the factory looks a name up (its tree, the repository, yours, the
 * builtin), the one served — the first, or, with an origin asked, that origin where it holds the name — and what shadows it. Its laws are
 * `contracts/definition-served.contract.ts`'s.
 *
 * `definitionWriteRefusal`: the api writes your library alone, and only in `default`, where every definition of yours is served; a
 * factory's own definitions change the factory's way. Its laws are `contracts/definition-write.contract.ts`'s.
 */
import type { DefinitionServedOf } from '../../contracts/definition-served.contract.ts';
import type { DefinitionWriteRefusal } from '../../contracts/definition-write.contract.ts';

export type { DefinitionOrigin, DefinitionServed } from '../../contracts/definition-served.contract.ts';
export type { DefinitionWrite, WriteRefused, WriteThere, WriteWay } from '../../contracts/definition-write.contract.ts';

export const definitionServed: DefinitionServedOf = (held, asked) => {
  const first = held.at(0);
  if (first === undefined) return null;
  if (asked === undefined) return { origin: first, shadowedBy: null };
  return held.includes(asked) ? { origin: asked, shadowedBy: first === asked ? null : first } : null;
};

/** A factory's own definitions are its tree: today `nemia workflows write factory` writes it. */
const FACTORYS_WAY =
  "A factory's own definitions are its tree, and change the factory's way, never through this path: write them with `nemia workflows write factory <factory>`.";

/** Yours are written in `default`, where every one of them is served. */
const DEFAULTS_WAY =
  'Your definitions are written in the `default` namespace, which serves every one of them: send the write to `/api/namespaces/default/…`.';

/** Nothing of that name to change. */
const NONE = 'Nothing is at that name in `default`: list the namespace for the names it holds, or make it with a POST to the list’s path.';

/** The repository's and Nemia's definitions are no write of the api's. */
const NOT_YOURS =
  "The api writes your library alone, never the repository's checkout nor what Nemia builds in: copy the definition to yours, then write that.";

/** The namespace every definition of yours is served and written in. */
const DEFAULT = 'default';

export const definitionWriteRefusal: DefinitionWriteRefusal = (namespace, does, there) => {
  if (does !== 'create' && there === 'factory') return { kind: 'Invalid', way: 'factory', message: FACTORYS_WAY };
  if (namespace !== DEFAULT)
    return does === 'create'
      ? { kind: 'Invalid', way: 'factory', message: FACTORYS_WAY }
      : { kind: 'Invalid', way: 'default', message: DEFAULTS_WAY };
  if (does === 'create' || there === 'yours') return null;
  if (there === 'none') return { kind: 'Missing', message: NONE };
  return does === 'act' ? null : { kind: 'Invalid', message: NOT_YOURS };
};
