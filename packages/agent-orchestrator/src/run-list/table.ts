/**
 * A page of the runs as a table (`runTable`), Kubernetes' server-side printing of a list (`objects`' `Table`): the columns `nemia ls`
 * prints of a run — its name, where it stands (its word, held, and each step that waits on a person in that step's word: `BLOCKED`,
 * `rounds exhausted`, `over budget`…), its brief's first line cut at 56, what it cost, whether it was cancelled or pruned, and what waits
 * on you with the command that answers it (`→ to decide`, `→ waiting on you`, a hold) — and, shown when asked wide, its labels and each
 * step with its word and branch; a row per run of the page, its cells in the columns' order, and the run's metadata beside them, as
 * Kubernetes gives a row's object (`PartialObjectMetadata`). Every cell is read off the `Run` the list judged, in the words its status
 * already carries. A run of the page that could not be judged is a row too, its note saying why, as `nemia ls` says it unreadable. The
 * api answers it to a list asked for a `Table` (`TABLE_ACCEPT`), so no client keeps a printer of the runs. Pure.
 */
import { headline, type Run, type RunList, type RunStepStatus, type RunUnjudged, type Table, type TableColumnDefinition } from 'objects';
import { ranOnWords } from '../release/index.ts';

/** How much of a brief's first line a row shows, as `nemia ls` cuts it. */
const BRIEF_WIDTH = 56;

/** The columns of a run's row, in the order its cells are. */
export const RUN_COLUMNS: readonly TableColumnDefinition[] = [
  { name: 'Name', type: 'string', format: 'name', description: "The run's name, its id.", priority: 0 },
  {
    name: 'Status',
    type: 'string',
    format: '',
    description:
      "The run's word, `held` where a person holds it, and each step that waits on you in its own word (BLOCKED, rounds exhausted…).",
    priority: 0,
  },
  { name: 'Brief', type: 'string', format: '', description: "The first line of the run's brief, cut at 56 characters.", priority: 0 },
  { name: 'Cost', type: 'string', format: '', description: 'What the run has cost, where measured.', priority: 0 },
  {
    name: 'Note',
    type: 'string',
    format: '',
    description: 'Whether the run was cancelled or pruned, or why it could not be read.',
    priority: 0,
  },
  {
    name: 'Waits',
    type: 'string',
    format: '',
    description:
      'What waits on you and the command that answers it: what to decide, the steps waiting on you, a hold, and the result branches; empty for nothing.',
    priority: 0,
  },
  { name: 'Labels', type: 'string', format: '', description: "The run's labels, key=value, comma-separated.", priority: 1 },
  {
    name: 'Steps',
    type: 'string',
    format: '',
    description: 'Each step in its word, with its cost, its branch where it has one and its note, semicolon-separated.',
    priority: 1,
  },
];

/** A run's labels, `key=value` by key, comma-separated: empty for none. */
const labelsCell = (labels: Readonly<Record<string, string>>): string =>
  Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key] ?? ''}`)
    .join(',');

/** Whether a run was cancelled or pruned, as `nemia ls` marks its head line; empty for neither. */
const calledOff = (run: Run): string =>
  [...(run.status.cancelledAt ? ['cancelled'] : []), ...(run.status.pruned ? ['pruned'] : [])].join(', ');

/** The engine's bare word for a session that waits on its harness, which a step's `waitingFor` words. */
const NEEDS_HUMAN = 'needs-human';

/** A step's word as `nemia ls` shows it: a session at `needs-human` says what it waits for. */
const stepWordOf = (step: RunStepStatus): string =>
  step.waitingFor && step.message.startsWith(NEEDS_HUMAN)
    ? `${NEEDS_HUMAN}: ${step.waitingFor.words}${step.message.slice(NEEDS_HUMAN.length)}`
    : step.message;

/** Where the run stands: its word, `held` under a person's hold, then each step waiting on you in its word. */
const statusCell = ({ status }: Run): string => {
  const word = [status.status, ...(status.holding ? ['held'] : [])].join(', ');
  const asking = status.waitingOnYou.map((name) => {
    const step = status.steps.find((s) => s.name === name);
    return step ? `${name} ${stepWordOf(step)}` : name;
  });
  return asking.length ? `${word} — ${asking.join('; ')}` : word;
};

/** A hold in `nemia ls`'s words, with what lifts it: its advice where a run it names never lands, nothing while the tick lifts it. */
const holdWords = (name: string, holding: NonNullable<Run['status']['holding']>): string => {
  const lifting = holding.runs.length > 0 && holding.runs.every((r) => r.landed);
  if (holding.waitingOnYou) return `${holding.word}: ${holding.advice}`;
  return lifting ? holding.word : `${holding.word} — nemia hold ${name} --off lifts it`;
};

/**
 * Whether no result branch is left to name: none at all, or what to decide names every one already — it names only those ahead of the
 * base, so a result branch that is not is still named.
 */
const resultNamed = ({ result = [], toDecide }: Run['status']): boolean =>
  result.every((branch) => toDecide?.kind === 'result' && toDecide.branches.includes(branch));

/**
 * What waits on you, as `nemia ls` said it under a run (`asksLines`): what to decide with its command, the steps waiting on you (an
 * approval named once) with `nemia decide`, a run waited on that never lands with what to do, a hold with what lifts it, and where its
 * work ended up (`result`), landed or not, unless what to decide names those branches already.
 */
const waitsCell = ({ metadata: { name }, status }: Run): string => {
  const { toDecide, waiting, holding } = status;
  const asked = status.waitingOnYouWords.filter((said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`));
  return [
    ...(toDecide ? [`to decide: ${toDecide.said}`] : []),
    ...(asked.length ? [`waiting on you: ${asked.join(', ')} — nemia decide ${name}`] : []),
    ...(waiting?.waitingOnYou ? [`waiting on you: ${waiting.advice}`] : []),
    ...(holding ? [holdWords(name, holding)] : []),
    ...(resultNamed(status) ? [] : [`result: ${(status.result ?? []).join(', ')} — nemia decide ${name}`]),
  ].join('; ');
};

/**
 * What the session of a step at work runs on (`ranOnWords`): `on v1.2.0, <harness> <version>`, off its current try's latest attempt while
 * that has not ended; nothing for one that ended, or recorded neither.
 */
const ranOnOf = ({ attempts: { latest } }: RunStepStatus): string | undefined =>
  latest && latest.ended === null ? (ranOnWords(latest.release, latest.harness) ?? undefined) : undefined;

/** How many questions a step's closeout asks of you, as `nemia ls` notes it; nothing where it asks none. */
const asksWords = ({ asks }: RunStepStatus): string | undefined => (asks ? `asks ${asks} question${asks === 1 ? '' : 's'}` : undefined);

/**
 * Each step in its word, its cost, its branch and its note — its own, the questions it asks, what it runs on and what it was denied — as
 * `nemia ls` printed a line per step.
 */
const stepsCell = ({ status }: Run): string =>
  status.steps
    .map((step) => {
      const note = [step.note, asksWords(step), ranOnOf(step), step.denied?.words].filter(Boolean).join(' · ');
      const said = [step.name, stepWordOf(step), step.spent?.said, step.branch].filter(Boolean).join(' ');
      return note ? `${said} · ${note}` : said;
    })
    .join('; ');

/** A row's object, as Kubernetes gives one beside a table's row: the item's metadata alone. */
const partialOf = (metadata: Run['metadata']) => ({ kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata });

/** The cells of `run`'s row, in `RUN_COLUMNS`' order. */
export const runCells = (run: Run): readonly unknown[] => [
  run.metadata.name,
  statusCell(run),
  headline(run.spec.brief).slice(0, BRIEF_WIDTH),
  run.status.cost?.said ?? '',
  calledOff(run),
  waitsCell(run),
  labelsCell(run.metadata.labels),
  stepsCell(run),
];

/** The steps of a run that could not be judged, each in its word off the run's record and its branch, as `nemia ls` printed them. */
const unjudgedStepsCell = ({ steps = [] }: RunUnjudged): string =>
  steps.map((step) => [step.name, step.message, step.branch].filter(Boolean).join(' ')).join('; ');

/** The cells of a run that could not be judged: its name, why as its note, and its steps as its record says them. */
const unjudgedCells = (run: RunUnjudged): readonly unknown[] => [
  run.name,
  '',
  '',
  '',
  `unreadable: ${run.error}`,
  '',
  '',
  unjudgedStepsCell(run),
];

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
