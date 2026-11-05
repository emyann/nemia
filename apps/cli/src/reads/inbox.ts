/**
 * `nemia inbox`, read from the api through the objects' client (`GET /api/cards`, a `CardList`): each card a line, then how to start, queue
 * or drop one — or that the inbox is empty — printed as the in-process command prints it (`inboxLines`, the orchestrator's
 * `inbox/inbox.ts`, ported word for word), each `Card` made the printer's row in one place (`rowOf`). Where a card that names no factory
 * is said to start is this process's `WF_DEFAULT_FACTORY_STARTS`, and the folder named in the last line this store's, as the in-process
 * command reads both.
 *
 * The list holds every card, each started card in its run's phase; the cards in play are those the api says are (`status.inPlay`), and
 * `--all` keeps every card. `-l <selector>` is sent as `labelSelector`, given again for another; a queued card's place is the one the api
 * answers (`status.place`), among every card queued, whatever the selector kept; the repository a card's factory picks for it is
 * read off `GET /api/factories` where a line says it. `--show-labels` and `-L <key>` are read here; any other words after `inbox` go to
 * the old path: `inbox add`, `inbox rm` and the rest are commands of their own there.
 */
import path from 'node:path';
import { type Card, type CardState, DEFAULT_NAMESPACE } from 'objects';
import type { FactoryAnswer } from '../../../api/src/client/client.ts';
import { get } from '../client.ts';
import { spawned } from '../local.ts';
import { asked } from '../objects.ts';
import { storeRoot } from '../where.ts';
import { labelSegments, labelsAsked, type LabelMap, type LabelsAsked } from './labels.ts';

/**
 * A card as the printer reads it, the in-process `InboxListing`'s keys it reads: its factory null for one of the default factory, its
 * place in the queue null for a card started, and the repository its factory picks for it (`factoryRepo`) null where it picks none.
 */
export type InboxRow = {
  name: string;
  title: string | null;
  workflow: string | null;
  repo: string | null;
  gate?: string;
  factory: string | null;
  startedAs: readonly string[];
  labels: LabelMap;
  state: CardState;
  error: string | null;
  queued?: { at: string; place: number | null };
  tried?: { at: string; repo: string; why: string; refused: boolean };
  factoryRepo: string | null;
};

/** The factory a card's namespace names: none for the default one. */
const factoryOf = (card: Card): string | null => {
  const namespace = card.metadata.namespace ?? DEFAULT_NAMESPACE;
  return namespace === DEFAULT_NAMESPACE ? null : namespace;
};

/** The card `card` as the printer's row: its queued place the api's (`status.place`), the repository its factory picks `repos`'s. */
export const rowOf = (card: Card, repos: ReadonlyMap<string, string> = new Map()): InboxRow => {
  const { metadata, spec, status } = card;
  const factory = factoryOf(card);
  const only = factory === null || spec.repo !== undefined ? undefined : repos.get(factory);
  return {
    name: metadata.name,
    title: status.title ?? null,
    workflow: spec.workflow ?? null,
    repo: spec.repo ?? null,
    ...(spec.gate !== undefined ? { gate: spec.gate } : {}),
    factory,
    startedAs: status.runs,
    labels: metadata.labels ?? {},
    state: status.state,
    error: status.error ?? null,
    ...(spec.queued !== undefined ? { queued: { at: spec.queued, place: status.place ?? null } } : {}),
    ...(status.lastStart !== undefined ? { tried: { ...status.lastStart } } : {}),
    factoryRepo: only ?? null,
  };
};

/** The cards in the order the in-process listing reads them: by file name, `<name>.md`, as `localeCompare` orders them. */
const byFile = (cards: readonly Card[]): Card[] =>
  [...cards].sort((a, b) => `${a.metadata.name}.md`.localeCompare(`${b.metadata.name}.md`));

/** Why a queued card's last start did not happen, as the in-process `triedClause` says it. */
function triedClause(l: InboxRow, unfactoredStarts: boolean): string {
  const t = l.tried;
  if (!t) return '';
  const said = l.error === null && !l.repo && (l.factory !== null || unfactoredStarts);
  const its = t.repo === l.factoryRepo ? ", its factory's one repository" : '';
  const on = said ? ` on ${t.repo}${its}` : '';
  const why = t.why !== l.error ? `: ${t.why}` : '';
  if (!t.refused) return ` — failed at ${t.at}${on}${why} — not a refusal: the tick tries it again on every pass, where it keeps its place`;
  const elsewhere = said && l.factoryRepo === null ? ', or run nemia up in the repository it is about' : '';
  return ` — not started at ${t.at}${on}${why} Edit the card, or take it back and queue it again${elsewhere}, and the tick tries it again`;
}

/**
 * The map a selector reads of an entry: its person labels, then its `workflow:` where set, and its `factory:` (`default` where it names
 * none) — the in-process `cardLabels`.
 */
const cardLabels = (l: Pick<InboxRow, 'labels' | 'workflow' | 'factory'>): LabelMap => ({
  ...l.labels,
  ...(l.workflow ? { workflow: l.workflow } : {}),
  factory: l.factory || 'default',
});

/** A started card's state beside its run, as the in-process `phaseSaid` says it: `waiting on you` for a run that waits on a person. */
const phaseSaid = (state: CardState): string => (state === 'waiting' ? 'waiting on you' : state);

/** No label asked shown: the lines as they were. */
const NONE_SHOWN: LabelsAsked = { selector: [], showLabels: false, columns: [] };

/** A line per entry of the inbox, each ending on its labels' segments where `asked` shows them: the in-process `inboxLines`. */
function inboxLines(listing: readonly InboxRow[], unfactoredStarts: boolean, asked: LabelsAsked): string[] {
  const width = Math.max(0, ...listing.map((l) => l.name.length));
  const inLine = listing.filter((l) => l.queued?.place).length;
  return listing.map((l) => {
    const started = l.startedAs.length ? `  started as ${l.startedAs.join(', ')}, ${phaseSaid(l.state)}` : '';
    const queued = l.queued?.place ? `  queued ${l.queued.place} of ${inLine}` : '';
    const tried = triedClause(l, unfactoredStarts);
    const labelled = labelSegments(cardLabels(l), asked);
    if (l.error !== null) return `${l.name.padEnd(width)}  ${l.error}${queued}${tried}${started}${labelled}`;
    return `${l.name.padEnd(width)}  ${(l.title ?? '').slice(0, 56).trimEnd()}${l.workflow ? `  workflow: ${l.workflow}` : ''}${l.repo ? `  repo: ${l.repo}` : ''}${l.gate ? `  gate: ${l.gate}` : ''}${l.factory ? `  factory: ${l.factory}` : ''}${queued}${tried}${started}${labelled}`;
  });
}

/**
 * What `nemia inbox` prints of the cards, in a process whose environment is `env`, of those `asked`'s selectors took: with none taken,
 * how many were left out for their run having ended (`ended`), else that none matches where a selector was given, else that the inbox
 * is empty — the in-process `INBOX`'s `print`.
 */
export const inboxPrinted = (
  cards: readonly InboxRow[],
  env: NodeJS.ProcessEnv = process.env,
  asked: LabelsAsked = NONE_SHOWN,
  ended = 0,
): string[] =>
  cards.length
    ? [
        ...inboxLines(cards, env.WF_DEFAULT_FACTORY_STARTS === '1', asked),
        `\nstart one: nemia start ${path.join(storeRoot(env), 'inbox', '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`,
      ]
    : ended
      ? [
          `no card in play${asked.selector.length ? ` matches -l ${asked.selector.join(' -l ')}` : ''}, and ${ended} whose run ended — list them with nemia inbox --all`,
        ]
      : asked.selector.length
        ? [`no card of the inbox matches -l ${asked.selector.join(' -l ')} — see them all with nemia inbox --show-labels`]
        : [`the inbox is empty — park an idea with nemia inbox add "<idea>"`];

/** The repository each factory picks for a card that names none: its one repository, for a factory with exactly one. */
const reposOf = (factories: readonly Pick<FactoryAnswer, 'name' | 'repos'>[]): Map<string, string> =>
  new Map(factories.flatMap(({ name, repos }) => (repos.length === 1 && repos[0] !== undefined ? [[name, repos[0]]] : [])));

export async function inbox(args: readonly string[]): Promise<number> {
  const all = args.includes('--all');
  const read = labelsAsked(args.filter((word) => word !== '--all'));
  if (read === null || read.rest.length) return spawned(['inbox', ...args]);
  const { selector } = read.asked;
  const listed = (labelSelector: readonly string[]) =>
    asked('inbox', (client) => client.cards.listAll({ query: labelSelector.length ? { labelSelector } : {} }));
  const selected = byFile((await listed(selector)).items);
  const shown = all ? selected : selected.filter((card) => card.status.inPlay);
  const picks = shown.some((c) => c.status.lastStart !== undefined && c.spec.repo === undefined && factoryOf(c) !== null);
  const repos = picks ? reposOf(await get<FactoryAnswer[]>('inbox', '/api/factories')) : new Map<string, string>();
  const rows = shown.map((card) => rowOf(card, repos));
  for (const line of inboxPrinted(rows, process.env, read.asked, selected.length - shown.length)) process.stdout.write(`${line}\n`);
  return 0;
}
