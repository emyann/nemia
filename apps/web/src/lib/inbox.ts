import type { InboxEntry, WorkflowListing } from './api';

/**
 * The inbox as the page lists it: the newest card first, by when its file was written (`filedAt`) — a card carries no time of its own — then by
 * name, so two filed in the same millisecond keep one order. An entry whose time is not known goes last.
 */
export const newestCardsFirst = (entries: readonly InboxEntry[]): InboxEntry[] =>
  [...entries].sort((a, b) => (b.filedAt ?? '').localeCompare(a.filedAt ?? '') || a.name.localeCompare(b.name));

/** A workflow as a pick is keyed: its source and its name, since the repository and yours may each have one of a name. */
export const workflowKey = (workflow: Pick<WorkflowListing, 'from' | 'name'>): string => `${workflow.from}:${workflow.name}`;

const trimmed = (dir: string): string => dir.replace(/[\\/]+$/, '');

/** A card's `workflow:` that is a bare name — no slash, not `.` or `..` — which a start looks for under the card's repository's `workflows/`. */
const isName = (workflow: string): boolean => !/[\\/]/.test(workflow) && workflow !== '.' && workflow !== '..';

/**
 * Whether a card's workflow is a name in a repository other than `here`, the api's: the card's `repo:` names another, and a start looks for the
 * name there (`workflowFolder`). The board lists the workflows of `here` alone, so one of the same name among them is another workflow.
 */
export const namedElsewhere = (workflow: string | null, repo: string | null, here: string): boolean =>
  Boolean(workflow && repo && isName(workflow) && trimmed(repo) !== trimmed(here));

/**
 * The workflow a card's start form is preset to, from what the card writes (`workflow:`), among the workflows here that read — or null, for a
 * card that names none, or one that is not among them.
 *
 * As a start from the command line finds it (`workflowFolder`): an absolute path is that folder, whichever source has it; a name is the
 * repository's workflow of that name, never yours, since a name on a card is looked for under the repository's `workflows/`. `repo` is the
 * card's `repo:` and `here` the api's repository, whose workflows are listed: a name on a card about another repository is that repository's
 * workflow (`namedElsewhere`), which is not listed, so it presets nothing — a workflow of the same name here would run another workflow than the
 * card names. A relative path is read from the inbox, a folder the board does not list, and is no workflow's name, so it presets nothing.
 */
export function presetOf(workflow: string | null, repo: string | null, here: string, workflows: readonly WorkflowListing[]): WorkflowListing | null {
  if (!workflow || namedElsewhere(workflow, repo, here)) return null;
  const readable = workflows.filter((w) => w.error === null);
  if (/^(?:[\\/]|[A-Za-z]:[\\/])/.test(workflow)) return readable.find((w) => trimmed(w.dir) === trimmed(workflow)) ?? null;
  return readable.find((w) => w.from === 'repo' && w.name === workflow) ?? null;
}
