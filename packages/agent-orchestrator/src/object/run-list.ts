/**
 * The pure parts of a run's list on the generic path: a run's namespace (`runNamespace`, proved by contracts/run-namespace.contract.ts),
 * the factory its record names, `default` for one that names none, as a card's is.
 */
import { DEFAULT_NAMESPACE } from 'objects';
import type { RunNamespace } from '../../contracts/run-namespace.contract.ts';

/** The namespace of a run whose record names `factory`: that factory, or `default` for none. */
export const runNamespace: RunNamespace = (factory) => factory ?? DEFAULT_NAMESPACE;
