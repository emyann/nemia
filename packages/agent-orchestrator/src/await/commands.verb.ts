/** `nemia wait`, an entry of the command table: the feed read from a cursor until a line its selectors take, or its bound (`waitFeed`). */
import { Effect, Schema } from 'effect';
import { checked, type Command } from '../command/entry.verb.ts';
import type { Args } from '../command/command.ts';
import { Invalid } from '../refusal/refusal.ts';
import { watchedLine } from '../subscription/subscription.ts';
import { parseSelectors, SELECTOR_FORM, selectorsRefusal } from '../watch/selector.ts';
import { waitForBound } from './await.ts';
import { waitFeed, type WaitAnswer } from './await.verb.ts';

/** What `nemia wait` takes after its name: its usage in the help, and what every refusal of what was typed ends on. */
const WAIT_USAGE = '[-l <selector>]... [--from <cursor>] [--for <duration>]';

/** The command line `nemia wait`'s refusals end on. */
const WAIT_FORM = `nemia wait ${WAIT_USAGE}`;

/** The refusal of a `-l` given no selector. */
const SELECTOR_TAKES = `nemia wait -l takes a selector of the feed's lines: ${SELECTOR_FORM}`;

/** The refusal of a `--from` given no cursor, or one that is no whole number. */
const FROM_TAKES =
  'nemia wait --from takes a cursor, a whole number of bytes — 0, or the cursor a wait or nemia watch printed — or none for the ' +
  `feed's end: ${WAIT_FORM}`;

/** The refusal of a `--for` given no bound. */
const FOR_TAKES = `nemia wait --for takes how long the wait waits, as --for 30s or --for 4m: ${WAIT_FORM}`;

/** What each value flag of `nemia wait` takes, by its name: the refusal of a value given apart that is one of its own flags. */
const WAIT_TAKES: Readonly<Record<string, string>> = { '-l': SELECTOR_TAKES, '--from': FROM_TAKES, '--for': FOR_TAKES };

/**
 * What `nemia wait` takes: its selectors (`-l`, each given again for another), the cursor it reads from (`--from`), and its bound
 * (`--for`), each as typed — the api's `GET /api/feed/wait` hands its query the same keys.
 */
export const WaitInput = Schema.Struct({
  selector: Schema.optionalKey(Schema.Array(Schema.String)),
  from: Schema.optionalKey(Schema.String),
  for: Schema.optionalKey(Schema.String),
});
export type WaitInput = typeof WaitInput.Type;

/** The selectors under `selector`, in the order given, or none. */
const selectorsOf = (args: Args | WaitInput): readonly string[] => {
  const value = args['selector'];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args | WaitInput, key: 'from' | 'for'): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Why `nemia wait`'s arguments are refused before the feed is read, or null: a selector the grammar refuses (`selectorsRefusal`), a cursor
 * that is no whole number, a `--for` out of its form or refused by `waitBound` (`waitForBound`). A cursor inside a line, or past the feed's
 * end, is the feed's to refuse, as it reads (`followFeed`).
 */
function waitArgsRefusal(args: Args | WaitInput): string | null {
  const selectors = selectorsRefusal(selectorsOf(args));
  if (selectors !== undefined) return selectors;
  const from = textOf(args, 'from');
  if (from !== undefined && !/^\d+$/.test(from)) return FROM_TAKES;
  const bound = waitForBound(textOf(args, 'for'));
  return 'refusal' in bound ? `${bound.refusal} — ${WAIT_FORM}` : null;
}

/**
 * `nemia wait`: the feed's lines read from a cursor (the feed's end where none is given) until the first that a selector takes — every
 * line with none — or its bound, four minutes where none is given; it prints the lines it took and the cursor to wait again from, so a
 * line written between two waits is never lost. The api serves it as `GET /api/feed/wait`, calling this handler.
 */
export const WAIT: Command<WaitAnswer, WaitInput> = {
  name: 'wait',
  usage: WAIT_USAGE,
  help: [
    "wait for the feed's next line a selector takes, and print it with the",
    'cursor after it: from --from (a cursor a wait or nemia watch printed),',
    "else from the feed's end now. It ends on the first lines a selector",
    'takes, or after --for (4m by default, at most 270s) with none, and',
    'prints the cursor either way: wait again from it and no line is lost.',
    '-l: as nemia watch -l takes it, given again for another; none takes',
    'every line.',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '-l', kind: 'text', key: 'selector', many: true, takes: SELECTOR_TAKES },
      { flag: '--from', kind: 'text', key: 'from', takes: FROM_TAKES, twice: `nemia wait takes --from once: ${WAIT_FORM}` },
      { flag: '--for', kind: 'text', key: 'for', takes: FOR_TAKES, twice: `nemia wait takes --for once: ${WAIT_FORM}` },
    ],
    unknown: (arg) => `nemia wait does not take ${arg}: ${WAIT_FORM}`,
    apart: (_value, flag) => WAIT_TAKES[flag] ?? FROM_TAKES,
  },
  check: waitArgsRefusal,
  writes: false,
  class: 'read',
  served: [{ endpoint: 'server.wait' }],
  input: WaitInput,
  handler: Effect.fnUntraced(function* (input: WaitInput) {
    yield* checked(waitArgsRefusal(input));
    const bound = waitForBound(input.for);
    if ('refusal' in bound) return yield* Effect.fail(new Invalid({ message: bound.refusal }));
    const from = input.from === undefined ? undefined : Number(input.from);
    return yield* waitFeed({ selectors: parseSelectors(selectorsOf(input)), ms: bound.ms, ...(from === undefined ? {} : { from }) });
  }),
  print: ({ lines, cursor }) => [...lines.map(({ line, to }) => watchedLine(line, to, {})), `cursor: ${cursor}`],
};
