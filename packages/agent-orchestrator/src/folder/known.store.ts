/**
 * What the store knows of where workflows, agents and skills are kept besides its own folders: the repositories its factories work on
 * and the trees of those made from a template, read through the Factory door (`knownIn`) as data (`Known`), which the synchronous
 * judgement of a write (`write.store.ts`, `agents.store.ts`, `skills.store.ts`) is given, so none of them reads the keyspace itself.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { listedAt } from '../factory/door/factories.store.ts';
import { workedOn, type FactoryListing } from '../factory/factory.ts';

/** The repositories and the trees the store's factories name, each resolved. */
export type Known = { readonly repos: ReadonlySet<string>; readonly trees: ReadonlySet<string> };

/** What a store knows where it is given no factory: none. */
export const NO_KNOWN: Known = { repos: new Set(), trees: new Set() };

/**
 * What `listing`, the store's factories as the Factory door lists them, names: each factory's repositories that read, and the tree of each
 * made from a template.
 * @param listing The store's factories, each as it reads or with why it does not.
 */
const knownOf = (listing: readonly FactoryListing[]) =>
  ({
    repos: new Set(listing.flatMap((f) => ('volumes' in f ? workedOn(f).map((r) => path.resolve(r)) : []))),
    trees: new Set(listing.flatMap((f) => ('tree' in f && f.tree !== undefined ? [path.resolve(f.tree)] : []))),
  }) satisfies Known;

/**
 * What the store `home` knows, read now through the Factory door at its root.
 * @param home The store's root folder.
 */
export const knownIn = (home: string) => Effect.map(listedAt(home), knownOf);

/**
 * Whether `repo` is a repository `known` names or the caller's own `named`, each resolved.
 * @param known What the store knows.
 * @param at The folder to judge, resolved.
 * @param named A repository the caller names besides, or undefined for none.
 */
export const knownHolds = (known: Known, at: string, named?: string) =>
  known.repos.has(at) || (named !== undefined && named !== '' && path.resolve(named) === at) || known.trees.has(at);
