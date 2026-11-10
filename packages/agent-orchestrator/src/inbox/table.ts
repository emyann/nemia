/**
 * The inbox as a table (`objects`' `Table`, Kubernetes' server-side printing): the columns `nemia inbox` prints of each entry and a row's
 * cells, in their order, from the same judgement as its lines (`inboxLines`): the name, the first line of the card or why the entry does
 * not read as one, its workflow, repository, gate and factory, its place in the queue, the tick's last missed start of it, its state as a
 * person reads it beside its run, the runs it was started as, and its labels. A client prints the cells and keeps no printer of its own.
 * Pure.
 */
import type { TableColumnDefinition } from 'objects';
import { labelsText } from '../labels/labels.ts';
import { cardLabels, phaseSaid, triedClause, type InboxListing } from './inbox.ts';

/** A column of the inbox's table: a string, shown by default (`priority` 0) unless it is only asked wide. */
const column = (
  name: string,
  description: string,
  priority = 0,
  type: TableColumnDefinition['type'] = 'string',
): TableColumnDefinition => ({
  name,
  type,
  format: name === 'Name' ? 'name' : '',
  description,
  priority,
});

/** The columns of the inbox's table, in the order of a row's cells (`inboxCells`). */
export const INBOX_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "the card's name, as `nemia inbox` and every verb of a card name it"),
  column('Title', "the first line of the card's body, or, for an entry that does not read as a card, why"),
  column('Workflow', 'the workflow the card names, empty where it names none'),
  column('Repo', 'the repository the card is about, empty where it names none'),
  column('Gate', 'the step whose closeout waits for a person in the run the card starts, empty where it names none', 1),
  column('Factory', 'the factory the card is started in, empty for the default one'),
  column('Queued', 'the place of a queued card among every card queued, from 1; null where it is not queued', 0, 'integer'),
  column('Last start', "the tick's last start of the queued card that did not happen, and what to do, empty where none", 1),
  column('State', 'where the card is in its life: its run\'s phase once started, "waiting on you" where its run waits on a person'),
  column('Runs', 'the runs the card was started as, comma-separated'),
  column('Labels', "the labels a selector reads of the card: a person's, its workflow and its factory", 1),
];

/**
 * The cells of the entry `l`, in `INBOX_COLUMNS`' order. A card that names no factory is said to start on a repository only where
 * `unfactoredStarts` lets it (`WF_DEFAULT_FACTORY_STARTS=1`), as its line says it (`triedClause`).
 */
export const inboxCells = (l: InboxListing, unfactoredStarts = false): readonly unknown[] => [
  l.name,
  l.error ?? l.title ?? '',
  l.workflow ?? '',
  l.repo ?? '',
  l.gate ?? '',
  l.factory ?? '',
  l.queued?.place ?? null,
  triedClause(l, unfactoredStarts).replace(/^ — /, ''),
  phaseSaid(l.state),
  l.startedAs.join(', '),
  labelsText(cardLabels(l)),
];
