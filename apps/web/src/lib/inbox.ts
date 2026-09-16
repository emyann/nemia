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

/**
 * The workflow a card's start form is preset to, from what the card writes (`workflow:`), among the workflows here that read — or null, for a
 * card that names none, or one that is not among them.
 *
 * As a start from the command line finds it (`workflowFolder`): an absolute path is that folder, whichever source has it; a name is the
 * repository's workflow of that name, never yours, since a name on a card is looked for under the repository's `workflows/`. A relative path
 * is read from the inbox, a folder the board does not list, and is no workflow's name, so it presets nothing.
 */
export function presetOf(workflow: string | null, workflows: readonly WorkflowListing[]): WorkflowListing | null {
  if (!workflow) return null;
  const readable = workflows.filter((w) => w.error === null);
  if (/^(?:[\\/]|[A-Za-z]:[\\/])/.test(workflow)) return readable.find((w) => trimmed(w.dir) === trimmed(workflow)) ?? null;
  return readable.find((w) => w.from === 'repo' && w.name === workflow) ?? null;
}
