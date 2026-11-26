/**
 * A page of workflows or templates as a table (`workflowTable`, `templateTable`), Kubernetes' server-side printing of a list (`objects`'
 * `Table`), as `kind-table.ts` gives the agents' and skills': the columns `nemia get workflows` and `nemia get templates` print,
 * priority 0 by default and 1 when asked wide, a row per item of the page in its order, and the item's metadata beside its cells
 * (`PartialObjectMetadata`). It reads only what a list serves of each, never a file's content (`LISTED_WITHOUT`). Pure.
 */
import type { ProgramList, Table, TableColumnDefinition, TemplateList, WorkflowList } from 'objects';
import { definitionNote } from './kind-table.ts';
import { column, firstLine, tableOf } from './table-of.ts';

/** A workflow and a template as a list serves each: without its files' content (`LISTED_WITHOUT`). */
type WorkflowListed = WorkflowList['items'][number];
type TemplateListed = TemplateList['items'][number];

/** The columns of a workflow's row, in the order its cells are. */
const WORKFLOW_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The workflow's name.", 0),
  column('Origin', 'Where the workflow is defined: factory, repo, yours or builtin.', 0),
  column('Steps', 'How many steps it has.', 0, 'integer'),
  column('Description', "The first line of the workflow's description.", 0),
  column('Note', 'Why it does not load or cannot start in the factory, and the origin that shadows it.', 0),
  column('Folder team', 'Whether every step works in a folder.', 1, 'boolean'),
  column('Schemas', 'The schema files beside its steps.', 1),
];

/** What a workflow's note says: why it does not load, the origin that shadows it, and why a run of it cannot start; `''` for none. */
const workflowNote = ({ status }: WorkflowListed) =>
  [definitionNote(status.error, status.shadowedBy), ...(status.unfilled ? [`cannot start: ${firstLine(status.unfilled)}`] : [])]
    .filter((said) => said !== '')
    .join('; ');

/** The cells of `workflow`'s row, in `WORKFLOW_COLUMNS`' order. */
const workflowCells = (workflow: WorkflowListed) => [
  workflow.metadata.name,
  workflow.status.origin,
  workflow.spec.steps.length,
  firstLine(workflow.status.description),
  workflowNote(workflow),
  workflow.status.folderTeam,
  workflow.status.schemas.join(', '),
];

/**
 * `list` as a table: `WORKFLOW_COLUMNS`, and a row per workflow of the page.
 * @param list The page of workflows, as the list answers it.
 */
export const workflowTable = (list: WorkflowList) => tableOf(list, WORKFLOW_COLUMNS, workflowCells) satisfies Table;

/** The columns of a template's row, in the order its cells are. */
const TEMPLATE_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The template's name.", 0),
  column('Version', "Its content's version.", 0),
  column('Description', 'The first line of what the template is.', 0),
  column('Problems', 'The first problem that stops it being read or applied, and how many there are.', 0),
  column('Workflows', 'The names of its workflows.', 1),
  column('Agents', 'The names of its agents.', 1),
  column('Skills', 'The names of its skills.', 1),
];

/** A template's problems as a cell: the first's first line, and how many more; `''` for none. */
const problemsCell = ({ status: { problems = [] } }: TemplateListed) => {
  const [first] = problems;
  if (first === undefined) return '';
  return problems.length === 1 ? firstLine(first) : `${firstLine(first)} (and ${problems.length - 1} more)`;
};

/** The cells of `template`'s row, in `TEMPLATE_COLUMNS`' order. */
const templateCells = (template: TemplateListed) => [
  template.metadata.name,
  template.spec.version ?? '',
  firstLine(template.spec.description),
  problemsCell(template),
  template.status.workflows.join(', '),
  template.status.agents.join(', '),
  template.status.skills.join(', '),
];

/**
 * `list` as a table: `TEMPLATE_COLUMNS`, and a row per template of the page.
 * @param list The page of templates, as the list answers it.
 */
export const templateTable = (list: TemplateList) => tableOf(list, TEMPLATE_COLUMNS, templateCells) satisfies Table;

/** The columns of a template's program's row, in the order its cells are. */
const PROGRAM_COLUMNS: readonly TableColumnDefinition[] = [
  column('Name', "The program's name.", 0),
  column('Writes', 'The conditions it writes.', 0),
  column('Run', 'The command line it runs.', 1),
  column('Phase', 'Where its task runs now: Pending, Running or Down; none for a template’s declaration.', 0),
  column('Restarts', 'How many times the runtime started it again.', 1, 'integer'),
];

/** The cells of a program's row, in `PROGRAM_COLUMNS`' order. */
const programCells = (program: ProgramList['items'][number]) => [
  program.metadata.name,
  program.spec.writes.join(', '),
  firstLine(program.spec.run),
  program.status?.phase ?? '',
  program.status?.restarts ?? 0,
];

/**
 * `list` as a table: `PROGRAM_COLUMNS`, and a row per program of the page.
 * @param list The page of a template's programs, as the list answers it.
 */
export const programTable = (list: ProgramList) => tableOf(list, PROGRAM_COLUMNS, programCells) satisfies Table;
