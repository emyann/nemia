/**
 * What the inbox's writes print of a Card the api answered (`objects`' `Card`): its factory by its namespace, its labels as kubectl's
 * LABELS column shows them, and the keys its spec carries as one line names them; and a workflow given as a path refused, exit 2.
 */
import { type Card, DEFAULT_NAMESPACE } from 'objects';
import { Refused } from '../../refused.ts';

/** The factory a card is in, by its namespace: none for `default`. */
export const factoryOf = (card: Card): string | undefined => {
  const namespace = card.metadata.namespace;
  return namespace === undefined || namespace === DEFAULT_NAMESPACE ? undefined : namespace;
};

/** `labels` as a printer shows them: `a=b,c=d` in key order, or `<none>` for none. */
export const labelsText = (labels: Readonly<Record<string, string>>): string => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? '<none>' : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/** The card's file in the inbox, as the api names it: `<name>.md`. */
export const fileOf = (card: Card): string => card.status.file ?? `${card.metadata.name}.md`;

/** `  repo: <r>  factory: <f>`, each where the card has it: what a line of a card says after its workflow. */
export const repoFactory = (card: Card): string => {
  const factory = factoryOf(card);
  return `${card.spec.repo ? `  repo: ${card.spec.repo}` : ''}${factory ? `  factory: ${factory}` : ''}`;
};

/** Refuses a `--workflow` given as a path, for `command` typed as `form`: a workflow is named, and the daemon finds it by its name. */
export const workflowNamed = (workflow: string | undefined, command: string, form: string): string | undefined => {
  if (workflow !== undefined && /[\\/]/.test(workflow))
    throw new Refused(
      `nemia ${command} takes a workflow by its name, which the daemon finds where a start of the card would, and ${workflow} is a path: ${form} --workflow <name>.`,
    );
  return workflow;
};
