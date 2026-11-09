/**
 * `nemia label run` and `nemia label inbox`, entries of the command table: a person's labels on a run or a card edited, as `kubectl label`
 * spells it. The api serves each, a run's on the route the table generates and a card's as the Card's `labels` verb (`objects`' Api),
 * its body a `LabelEdit` — `labels`, the edits, and `overwrite` — under the keys the command line gives them, so one handler reads both.
 */
import { Effect } from 'effect';
import { type Args, NAMED_ACTION, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { rooted } from '../factory/wiring/wire.verb.ts';
import type { Labelled } from './labels.model.ts';
import { labelCard, labelRun } from './labels.verb.ts';

/** The edits under `labels`, in the order given. */
const editsOf = (args: Args): string[] => (Array.isArray(args.labels) ? args.labels.map(String) : []);

/** The text under `key`, or the empty text where none was given. */
const textOf = (args: Args, key: string): string => {
  const value = args[key];
  return typeof value === 'string' ? value : '';
};

/**
 * What an edit did, a line per key it named, as `kubectl label` says it: set, changed from its value, removed, already so, or already
 * absent — then the labels as they stand.
 */
export function labelledLines({ kind, name, labels, was }: Labelled, args: Args): string[] {
  const what = kind === 'Run' ? `run ${name}` : `card ${name}`;
  const lines = editsOf(args).map((edit) => {
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

/** A label command's spec: the run or card, then its edits, and `--overwrite`. */
const labelSpec = (command: string, what: string, key: string, lists: string): Spec => ({
  positionals: [
    { key, takes: 'required', kind: 'name' },
    { key: 'labels', takes: 'many', kind: 'text' },
  ],
  flags: [{ flag: '--overwrite', kind: 'switch', key: 'overwrite' }],
  unknown: (arg) =>
    `${command} does not take ${arg}. It takes the ${what}, then its edits — key=value to set a key, key- to remove one — and --overwrite to change a value: ${command} <${key}> team=core.`,
  missing: `${command} takes the ${what} first, as ${lists} lists it, then its edits: ${command} <${key}> team=core [--overwrite].`,
});

const RUN_SPEC = labelSpec('nemia label run', 'run', 'runId', 'nemia ls');
const CARD_SPEC = labelSpec('nemia label inbox', 'card', 'name', 'nemia inbox');

/** The refusal of a label command given no edit. */
const noEdits = (command: string, key: string) => (args: Args) =>
  editsOf(args).length ? null : `${command} takes the edits to make after the ${key}: key=value to set a key, key- to remove one.`;

/**
 * `nemia label run`: a run's person labels edited — in flight, waiting or finished — and written beside its record. The feed's lines
 * written after it carry the new labels; those before keep theirs.
 */
export const LABEL_RUN: Command<Labelled> = {
  name: 'label run',
  usage: '<runId> <key=value|key->... [--overwrite]',
  help: [
    "edit a run's labels: key=value sets a key, key- removes it; changing a",
    "value takes --overwrite. nemia ls -l selects by them, and the feed's",
    'lines written after carry them',
  ],
  spec: RUN_SPEC,
  check: noEdits('nemia label run', 'run'),
  writes: true,
  class: 'act',
  route: { method: 'POST', path: '/api/namespaces/:namespace/runs/:runId/labels', status: 200, hand: NAMED_ACTION },
  handler: (args, _env, home) =>
    rooted(
      home,
      'label run',
      Effect.suspend(() => labelRun(textOf(args, 'runId'), editsOf(args), args.overwrite === true)),
    ),
  print: labelledLines,
};

/** `nemia label inbox`: an inbox card's `labels:` edited, every other key and its body kept; the run it starts is created with them. */
export const LABEL_CARD: Command<Labelled> = {
  name: 'label inbox',
  usage: '<name> <key=value|key->... [--overwrite]',
  help: [
    "edit an inbox card's labels: key=value sets a key, key- removes it;",
    'changing a value takes --overwrite. nemia inbox -l selects by them, and',
    'the run the card starts is created with them',
  ],
  spec: CARD_SPEC,
  check: noEdits('nemia label inbox', 'card'),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `labels` verb of `objects`' Api (`POST /api/namespaces/:namespace/cards/:name/labels`), which calls this entry's handler: no route of its own",
  },
  handler: (args, _env, home) =>
    rooted(
      home,
      'label inbox',
      Effect.suspend(() => labelCard(textOf(args, 'name'), editsOf(args), args.overwrite === true)),
    ),
  print: labelledLines,
};

/** `nemia label`'s entries, in the order `nemia`'s help lists them. */
export const LABELS: readonly Command[] = [LABEL_RUN, LABEL_CARD] as readonly Command[];
