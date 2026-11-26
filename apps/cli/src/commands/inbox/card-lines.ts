/**
 * What the inbox's writes print of a Card the api answered (`objects`' `Card`): its factory by its namespace, its labels as kubectl's
 * LABELS column shows them, and the keys its spec carries as one line names them; a workflow given as a path refused, exit 2; and a
 * card's text as typed, a file's read here where it names one, and a path to no file refused (`textOrFile`, `ideaOf`).
 */
import fs from 'node:fs';
import { type Card, DEFAULT_NAMESPACE } from 'objects';
import { Refused } from '../../refused.ts';
import { textOf } from '../files.ts';
import type { IdeaOf } from '../../../contracts/idea.contract.ts';

/**
 * What words typed as an idea are, from the words and what the machine has at that path: a file's text where they name a file; a folder
 * refused; one word that reads as a path (it holds a `/` or ends in `.md`) and names nothing refused, as a path to no file; else the words
 * themselves. Pure, and proved by `contracts/idea.contract.ts`.
 * @param given The words as typed.
 * @param at What the machine has at the path the words would name.
 * @public
 */
export const ideaOf: IdeaOf = (given, at) => {
  if (at === 'file') return { kind: 'file' };
  if (at === 'folder') return { kind: 'refused', reason: 'folder' };
  const oneWord = !given.includes(' ') && !given.includes('\t') && !given.includes('\n');
  if (oneWord && (given.includes('/') || given.endsWith('.md'))) return { kind: 'refused', reason: 'no-file' };
  return { kind: 'words' };
};

/**
 * What `command` was typed as text: a file's text, read here, where it names one; else the words (`ideaOf`). A folder, and one word that
 * reads as a path to no file, are refused, exit 2, naming `forms`, the ways to type it.
 * @param given The text as typed: a file's path, or the words themselves.
 * @param command The command's name, said in a refusal.
 * @param forms The ways to type the text, said in a refusal.
 */
export const textOrFile = (given: string, command: string, forms: string) => {
  const stat = fs.statSync(given, { throwIfNoEntry: false });
  const idea = ideaOf(given, stat === undefined ? 'none' : stat.isDirectory() ? 'folder' : 'file');
  if (idea.kind === 'refused' && idea.reason === 'folder')
    throw new Refused(`${given} is a directory, and nemia ${command} takes text or one file: ${forms}.`);
  if (idea.kind === 'refused')
    throw new Refused(
      `${given} is no file here, and reads as a path: check it, or type the idea in words, with a space in them, if no file was meant: ${forms}. Nothing was sent.`,
    );
  return idea.kind === 'file' ? textOf(given, command) : given;
};

/**
 * The factory a card is in, by its namespace: none for `default`.
 * @param card The card, as the api answers it.
 */
export const factoryOf = (card: Card) => {
  const namespace = card.metadata.namespace;
  return namespace === undefined || namespace === DEFAULT_NAMESPACE ? undefined : namespace;
};

/**
 * `labels` as a printer shows them: `a=b,c=d` in key order, or `<none>` for none.
 * @param labels The labels, by key.
 */
export const labelsText = (labels: Readonly<Record<string, string>>) => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? '<none>' : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/**
 * The card's file in the inbox, as the api names it: `<name>.md`.
 * @param card The card, as the api answers it.
 */
export const fileOf = (card: Card) => card.status.file ?? `${card.metadata.name}.md`;

/**
 * `  repo: <r> (retired)  factory: <f>`, each where the card has it: what a line of a queued card says after its workflow, an older card's
 * `repo:` said retired, since its factory places its run.
 * @param card The card, as the api answers it.
 */
export const repoFactory = (card: Card) => `${card.spec.repo ? `  repo: ${card.spec.repo} (retired)` : ''}${factoryLine(card)}`;

/**
 * `  after: <a, b> — queued and started once each has landed`, where the card waits on cards: what `nemia inbox add` and `nemia inbox
 * edit` say of a card's wait, with `suffix` after it; none for a card that waits on none.
 * @param after The cards the card waits on (its `spec.after`), by name.
 * @param suffix What the line says after the wait, such as ` (was <cards>)`.
 */
export const afterLines = (after: readonly string[] | undefined, suffix = '') =>
  after?.length ? [`  after: ${after.join(', ')} — queued and started once each has landed${suffix}`] : [];

/**
 * `  factory: <f>`, where the card is in one: what a line of a card filed says after its workflow.
 * @param card The card, as the api answers it.
 */
export const factoryLine = (card: Card) => {
  const factory = factoryOf(card);
  return factory ? `  factory: ${factory}` : '';
};

/**
 * Refuses a `--workflow` given as a path, for `command` typed as `form`: a workflow is named, and the daemon finds it by its name.
 * @param workflow The workflow `--workflow` names, or undefined where none is given.
 * @param command The command's name, said in the refusal.
 * @param form The command's form, said in the refusal before `--workflow <name>`.
 */
export const workflowNamed = (workflow: string | undefined, command: string, form: string) => {
  if (workflow !== undefined && /[\\/]/.test(workflow))
    throw new Refused(
      `nemia ${command} takes a workflow by its name, which the daemon finds where a start of the card would, and ${workflow} is a path: ${form} --workflow <name>.`,
    );
  return workflow;
};
