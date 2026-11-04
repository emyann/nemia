/**
 * `nemia grace [<d>]`: the store's pause grace, how long a person's pause, a restart and an upgrade give each tool call in flight before it
 * is cut. Bare, the grace in force, as `nemia level` says the level; given a duration, the grace written (`putGrace`). A command of the
 * CLI alone: the board pauses with the store's grace and sets none.
 */
import { Effect } from 'effect';
import { rootGiven } from '../config/root.store.ts';
import { tried } from '../runtime-client.ts';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { PAUSE, PAUSE_NOW, PAUSED, RESUME } from '../command/runs.verb.ts';
import { graceAt, putGrace, type GraceAt } from './grace.store.ts';
import { graceRefusal, graceWords } from './pause.ts';

/** The grace given, or undefined for a bare `nemia grace`. */
const textOf = (args: Args): string | undefined => (typeof args.grace === 'string' ? args.grace : undefined);

/** `nemia grace`'s form, as each of its refusals ends on it. */
const GRACE_SHAPE = 'nemia grace [<d>]';

/** What `nemia grace` answers: the grace in force, and whether this call wrote it. */
export type GraceAnswer = { grace: GraceAt; wrote: boolean };

/** The grace in force, in one line: the default, or the one set and when. */
const graceLine = ({ ms, set, at }: GraceAt): string =>
  `the store's pause grace is ${graceWords(ms)}${set ? (at ? `, set ${at}` : '') : ' (the default)'}`;

/**
 * `nemia grace`: the store's pause grace, read bare and written given a duration. Refused: a grace out of its form, a file that does not
 * read.
 */
export const GRACE: Command<GraceAnswer> = {
  name: 'grace',
  usage: '[<d>]',
  help: [
    "the store's pause grace: how long nemia pause, nemia service restart and",
    'nemia upgrade give each tool call in flight to end before it is cut; bare,',
    'the grace in force (10m by default); given one, sets it: digits and s, m',
    'or h, from 1s to 23h, as 90s, 10m or 2h. nemia pause --grace <d> gives one',
    'pause a grace of its own',
  ],
  spec: {
    positionals: [{ key: 'grace', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia grace takes one grace, not ${arg}: ${GRACE_SHAPE}, as nemia grace 10m.`,
  },
  check: (args) => {
    const text = textOf(args);
    const wrong = text === undefined ? undefined : graceRefusal(text);
    return wrong === undefined ? null : `${wrong}: ${GRACE_SHAPE}, as nemia grace 10m.`;
  },
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the board pauses with the store's grace and sets none: nemia grace <d> sets it" },
  handler: (args: Args, _env, home) =>
    tried(() => {
      const root = rootGiven(home, 'grace');
      const text = textOf(args);
      return text === undefined
        ? ({ grace: graceAt(root), wrote: false } satisfies GraceAnswer)
        : ({ grace: putGrace(root, text), wrote: true } satisfies GraceAnswer);
    }).pipe(Effect.withSpan('grace')),
  print: ({ grace, wrote }) =>
    wrote
      ? [
          `the store's pause grace is now ${graceWords(grace.ms)}: each pause, restart and upgrade gives a call in flight ${graceWords(grace.ms)} before it is cut`,
        ]
      : [graceLine(grace)],
};

/** The pause's commands, in the table's order: the pause, its grace, the resume, and the api's two reads of it. */
export const PAUSE_ENTRIES: readonly Command[] = [PAUSE, GRACE, RESUME, PAUSED, PAUSE_NOW];
