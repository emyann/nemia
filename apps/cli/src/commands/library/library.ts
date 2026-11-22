/**
 * `nemia library`'s runners: the store's library read a kind at a time, in no namespace, a line an item with its origin and the factories
 * that add it; and an item added to a factory or its add taken off (`libraryadds.put`, `libraryadds.delete`), printed with its state.
 */
import { Effect } from 'effect';
import { LIBRARY_ADD_WORDS, LIBRARY_RM_WORDS, LIBRARY_WORDS, type Args, type LibraryAdd } from 'objects';
import { asked, everyPage, pageOf, type ObjectsClient } from '../../objects.ts';
import { answered } from '../answer.ts';
import { said, textArg } from '../requests.ts';

/** What a line of the library says of an item: its name, its origin and the factories that add it. */
type Held = {
  readonly metadata: { readonly name: string };
  readonly status?: { readonly origin?: string; readonly factories?: readonly string[] };
};

/** The kinds the library is read in, in the order a bare `nemia library` prints them. */
const KINDS = ['skills', 'agents', 'mcpservers', 'workflows'] as const;

/** The items of a list, as a line reads them. */
const items = (list: { readonly items: readonly Held[] }) => list.items satisfies readonly Held[];

/** Every item of the library's `kind`, page after page. */
const heldOf = (c: ObjectsClient, kind: (typeof KINDS)[number]) => {
  if (kind === 'skills') return Effect.map(pageOf(everyPage((page) => c.skills.listLibrary({ query: page }))), items);
  if (kind === 'agents') return Effect.map(pageOf(everyPage((page) => c.agents.listLibrary({ query: page }))), items);
  if (kind === 'workflows') return Effect.map(pageOf(everyPage((page) => c.workflows.listLibrary({ query: page }))), items);
  return Effect.map(pageOf(everyPage((page) => c.mcpservers.listLibrary({ query: page }))), items);
};

/** A line of the library: the kind and name, the origin, and who adds it. */
const heldLine = (kind: string, item: Held) => {
  const factories = item.status?.factories ?? [];
  return `${kind}/${item.metadata.name}  ${item.status?.origin ?? ''}  ${factories.length === 0 ? 'added by none' : `added by ${factories.join(', ')}`}`;
};

/**
 * `nemia library [<kind> [<name>]] [--factory <factory>]`'s runner: each kind's items, or the one kind's, or one item whole; with a
 * factory, its adds.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function libraryListed(args: Args) {
  const factory = textArg(args, 'factory');
  if (factory !== undefined) return factoryAddsListed(factory);
  const asked1 = textArg(args, 'kind');
  const name = textArg(args, 'name');
  if (asked1 !== undefined && name !== undefined) return libraryItem(asked1, name, args);
  const kinds = KINDS.filter((k) => asked1 === undefined || k === asked1);
  const lines: string[] = [];
  for (const kind of kinds) {
    const held = await asked(LIBRARY_WORDS.name, (c) => heldOf(c, kind));
    lines.push(...held.map((item) => heldLine(kind, item)));
  }
  said(lines.length === 0 ? ['the library holds nothing yet'] : lines);
  return 0;
}

/** `nemia library <kind> <name>`: the one item, read whole (`<kind>.getLibrary`), printed as YAML, or JSON with `--json`. */
const libraryItem = (kind: string, name: string, args: Args) => {
  const params = { name };
  const verb = LIBRARY_WORDS.name;
  if (kind === 'skills') return answered(verb, args, (c) => c.skills.getLibrary({ params, query: {} }));
  if (kind === 'agents') return answered(verb, args, (c) => c.agents.getLibrary({ params, query: {} }));
  if (kind === 'workflows') return answered(verb, args, (c) => c.workflows.getLibrary({ params, query: {} }));
  return answered(verb, args, (c) => c.mcpservers.getLibrary({ params }));
};

/** `nemia library --factory <factory>`: each add of the factory, with its state. */
async function factoryAddsListed(namespace: string) {
  const adds = await asked(LIBRARY_WORDS.name, (c) =>
    Effect.map(pageOf(everyPage((page) => c.libraryadds.list({ params: { namespace }, query: page }))), (list) => list.items),
  );
  said(adds.length === 0 ? [`${namespace} has added nothing from the library`] : adds.map((add) => addLine(add, 'added')));
  return 0;
}

/** The line of an add: its name in the factory, and its state. */
const addLine = (add: LibraryAdd, done: string) =>
  `${add.metadata.name} ${done} in ${add.metadata.namespace ?? ''}: ${add.status.state}${add.status.message ? `, ${add.status.message}` : ''}`;

/** The factory and the add's object name `args` name. */
const addOf = (args: Args) => ({
  namespace: textArg(args, 'factory') ?? '',
  name: `${textArg(args, 'kind') ?? ''}.${textArg(args, 'name') ?? ''}`,
});

/**
 * `nemia library add <kind> <name> --factory <factory>`'s runner: the item added, and its state.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function libraryAdd(args: Args) {
  const params = addOf(args);
  said([addLine(await asked(LIBRARY_ADD_WORDS.name, (c) => c.libraryadds.put({ params })), 'added')]);
  return 0;
}

/**
 * `nemia library rm <kind> <name> --factory <factory>`'s runner: the add taken off, the item left in the library.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function libraryRm(args: Args) {
  const params = addOf(args);
  said([addLine(await asked(LIBRARY_RM_WORDS.name, (c) => c.libraryadds.delete({ params })), 'taken off')]);
  return 0;
}
