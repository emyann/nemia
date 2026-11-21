/**
 * The card triggers of the store's factories as the inbox and the api read them: each factory's own, in its file, and its template's, in
 * its tree's rendered wiring (`factory.json`), its own winning on a shared name, each marked where it is defined (`from`). Read afresh on
 * every call: nothing is carried between passes.
 */
import type { Factory } from '../factory.ts';
import { readTreeWiring } from '../applied/applied.store.ts';

/** A card trigger as it is defined: its factory, its name, its selector, its target, when it was set, and where it is defined. */
export type TriggerDefined = {
  readonly factory: string;
  readonly name: string;
  readonly selector: string;
  readonly target: { readonly kind: 'Workflow'; readonly name: string };
  readonly since: string;
  readonly from: 'factory' | 'template';
};

/**
 * The card triggers of `factory`: its template's, from its tree's wiring where it reads, then its own over them by name, sorted by name.
 * @param home The store's root.
 * @param factory The factory as read.
 */
export function cardTriggersOf(home: string, factory: Pick<Factory, 'name' | 'template' | 'triggers'>) {
  const byName = new Map<string, TriggerDefined>();
  const tree = factory.template === undefined ? undefined : readTreeWiring(home, factory.name);
  const rendered = tree !== undefined && 'wiring' in tree ? (tree.wiring.triggers ?? {}) : {};
  for (const [name, t] of Object.entries(rendered))
    byName.set(name, { factory: factory.name, name, selector: t.selector, target: t.target, since: t.since, from: 'template' });
  for (const [name, t] of Object.entries(factory.triggers ?? {}))
    byName.set(name, { factory: factory.name, name, selector: t.selector, target: t.target, since: t.since, from: 'factory' });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every card trigger of `factories`, the store's that read as the Factory door lists them.
 * @param home The store's root.
 * @param factories The store's factories that read.
 */
export function everyCardTrigger(home: string, factories: Iterable<Pick<Factory, 'name' | 'template' | 'triggers'>>) {
  return [...factories].flatMap((f) => cardTriggersOf(home, f));
}
