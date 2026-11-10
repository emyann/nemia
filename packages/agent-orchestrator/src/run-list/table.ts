/**
 * A page of the runs as a table (`runTable`), Kubernetes' server-side printing of a list (`objects`' `Table`): the columns `nemia ls`
 * prints on a run's head line — its name, its brief's first line cut at 56, what it cost, whether it was cancelled or pruned — and its
 * labels, shown when asked wide; a row per run of the page, its cells in the columns' order, and the run's metadata beside them, as
 * Kubernetes gives a row's object (`PartialObjectMetadata`). A run of the page that could not be judged is a row too, its note saying why,
 * as `nemia ls` says it unreadable. The api answers it to a list asked for a `Table` (`TABLE_ACCEPT`), so no client keeps a printer of
 * the runs. Pure.
 */
import type { Run, RunList, RunUnjudged, Table, TableColumnDefinition } from 'objects';

/** How much of a brief's first line a row shows, as `nemia ls` cuts it. */
const BRIEF_WIDTH = 56;

/** The columns of a run's row, in the order its cells are. */
export const RUN_COLUMNS: readonly TableColumnDefinition[] = [
  { name: 'Name', type: 'string', format: 'name', description: "The run's name, its id.", priority: 0 },
  { name: 'Brief', type: 'string', format: '', description: "The first line of the run's brief, cut at 56 characters.", priority: 0 },
  { name: 'Cost', type: 'string', format: '', description: 'What the run has cost, where measured.', priority: 0 },
  {
    name: 'Note',
    type: 'string',
    format: '',
    description: 'Whether the run was cancelled or pruned, or why it could not be read.',
    priority: 0,
  },
  { name: 'Labels', type: 'string', format: '', description: "The run's labels, key=value, comma-separated.", priority: 1 },
];

/** `text` up to its first line's end. */
const firstLine = (text: string): string => {
  const at = text.indexOf('\n');
  return at === -1 ? text : text.slice(0, at);
};

/** A run's labels, `key=value` by key, comma-separated: empty for none. */
const labelsCell = (labels: Readonly<Record<string, string>>): string =>
  Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key] ?? ''}`)
    .join(',');

/** Whether a run was cancelled or pruned, as `nemia ls` marks its head line; empty for neither. */
const calledOff = (run: Run): string =>
  [...(run.status.cancelledAt ? ['cancelled'] : []), ...(run.status.pruned ? ['pruned'] : [])].join(', ');

/** A row's object, as Kubernetes gives one beside a table's row: the item's metadata alone. */
const partialOf = (metadata: Run['metadata']) => ({ kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata });

/** The cells of `run`'s row, in `RUN_COLUMNS`' order. */
export const runCells = (run: Run): readonly unknown[] => [
  run.metadata.name,
  firstLine(run.spec.brief).slice(0, BRIEF_WIDTH),
  run.status.cost?.said ?? '',
  calledOff(run),
  labelsCell(run.metadata.labels),
];

/** The cells of a run that could not be judged: its name, and why, as its note. */
const unjudgedCells = (run: RunUnjudged): readonly unknown[] => [run.name, '', '', `unreadable: ${run.error}`, ''];

/** `list` as a table: its page's place (`continue`), `RUN_COLUMNS`, and a row per run of the page, the judged first. */
export const runTable = (list: RunList): Table => ({
  kind: 'Table',
  apiVersion: 'meta.k8s.io/v1',
  metadata: list.metadata.continue === undefined ? {} : { continue: list.metadata.continue },
  columnDefinitions: RUN_COLUMNS,
  rows: [
    ...list.items.map((run) => ({ cells: runCells(run), object: partialOf(run.metadata) })),
    ...(list.unjudged ?? []).map((run) => ({ cells: unjudgedCells(run) })),
  ],
});
