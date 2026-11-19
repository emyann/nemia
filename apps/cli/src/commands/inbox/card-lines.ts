/**
 * What the inbox's writes print of a Card the api answered (`objects`' `Card`): its factory by its namespace, its labels as kubectl's
 * LABELS column shows them, and the keys its spec carries as one line names them; a workflow given as a path refused, exit 2; and a
 * card's text as typed, a file's read here where it names one (`textOrFile`).
 */
import fs from 'node:fs';
import { type Card, DEFAULT_NAMESPACE } from 'objects';
import { Refused } from '../../refused.ts';
import { textOf } from '../files.ts';

/**
 * What `command` was typed as text: a file's text, read here, where it names one; else the words. A folder is refused, exit 2, naming
 * `forms`, the ways to type it.
 * @param given The text as typed: a file's path, or the words themselves.
 * @param command The command's name, said in a refusal.
 * @param forms The ways to type the text, said in the refusal of a folder.
 */
export const textOrFile = (given: string, command: string, forms: string) => {
  const at = fs.statSync(given, { throwIfNoEntry: false });
  if (at?.isDirectory()) throw new Refused(`${given} is a directory, and nemia ${command} takes text or one file: ${forms}.`);
  return at ? textOf(given, command) : given;
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
