/**
 * `nemia label run <runId> <key=value|key->... [--overwrite]` and `nemia label inbox <name> …`: a run's or a card's person labels edited,
 * as `kubectl label` spells it, through the Run's and the Card's `labels`, in the namespace each is in (read across namespaces). What an
 * edit did is printed a line per key it named, then the labels as they stand.
 */
import { LABEL_INBOX_WORDS, LABEL_RUN_WORDS, labelEdits, type Args, type Labelled } from 'objects';
import { asked } from '../../objects.ts';
import { namespaceOfCard, namespaceOfRun, said, switchArg, textArg } from '../requests.ts';

/**
 * What an edit did, a line per key `edits` named, as `kubectl label` says it: set, changed from its value, removed, already so, or already
 * absent — then the labels as they stand.
 */
export function labelledLines({ kind, name, labels, was }: Labelled, edits: readonly string[]): string[] {
  const what = kind === 'Run' ? `run ${name}` : `card ${name}`;
  const lines = edits.map((edit) => {
    const at = edit.indexOf('=');
    const key = at > 0 ? edit.slice(0, at) : edit.slice(0, -1);
    const before = was[key];
    const after = labels[key];
    if (after === undefined)
      return before === undefined ? `${what}  ${key} already absent — no change` : `${what}  ${key} removed (was ${before})`;
    if (before === undefined) return `${what}  ${key}=${after} set`;
    return before === after ? `${what}  ${key}=${after} already — no change` : `${what}  ${key}=${after} changed (was ${before})`;
  });
  const keys = Object.keys(labels).sort();
  return [...lines, `${what}  labels: ${keys.length ? keys.map((k) => `${k}=${labels[k] ?? ''}`).join(',') : '<none>'}`];
}

/** The edit as the api is sent it: the edits, and `overwrite` where it was typed. */
const editOf = (args: Args) => ({ labels: [...labelEdits(args)], ...(switchArg(args, 'overwrite') ? { overwrite: true } : {}) });

/** `nemia label run`'s runner, on the words parsed against its words. */
export async function labelRun(args: Args): Promise<number> {
  const command = LABEL_RUN_WORDS.name;
  const name = textArg(args, 'runId') ?? '';
  const namespace = await namespaceOfRun(command, name);
  const payload = editOf(args);
  said(labelledLines(await asked(command, (c) => c.runs.labels({ params: { namespace, name }, payload })), payload.labels));
  return 0;
}

/** `nemia label inbox`'s runner, on the words parsed against its words. */
export async function labelInbox(args: Args): Promise<number> {
  const command = LABEL_INBOX_WORDS.name;
  const name = textArg(args, 'name') ?? '';
  const namespace = await namespaceOfCard(command, name);
  const payload = editOf(args);
  said(labelledLines(await asked(command, (c) => c.cards.labels({ params: { namespace, name }, payload })), payload.labels));
  return 0;
}
