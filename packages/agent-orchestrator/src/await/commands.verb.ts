/** `nemia wait`, an entry of the command table: the feed read from a cursor until a line its selectors take, or its bound (`waitFeed`). */
import { WAIT_WORDS } from 'objects';
import { Effect, Schema } from 'effect';
import { checked, type Served } from '../command/entry.verb.ts';
import type { Args } from '../command/command.ts';
import { Invalid } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal } from '../watch/selector.ts';
import { waitForBound } from './await.ts';
import { waitFeed, type WaitAnswer } from './await.verb.ts';

/** What `nemia wait` takes after its name: its usage in the help, and what every refusal of what was typed ends on. */
const WAIT_USAGE = '[-l <selector>]... [--from <cursor>] [--for <duration>]';

/** The command line `nemia wait`'s refusals end on. */
const WAIT_FORM = `nemia wait ${WAIT_USAGE}`;

/** The refusal of a `--from` given no cursor, or one that is no whole number. */
const FROM_TAKES =
  'nemia wait --from takes a cursor, a whole number of bytes — 0, or the cursor a wait or nemia watch printed — or none for the ' +
  `feed's end: ${WAIT_FORM}`;

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
export const WAIT: Served<WaitAnswer, WaitInput> = {
  ...WAIT_WORDS,
  input: WaitInput,
  handler: Effect.fnUntraced(function* (input: WaitInput) {
    yield* checked(waitArgsRefusal(input));
    const bound = waitForBound(input.for);
    if ('refusal' in bound) return yield* Effect.fail(new Invalid({ message: bound.refusal }));
    const from = input.from === undefined ? undefined : Number(input.from);
    return yield* waitFeed({ selectors: parseSelectors(selectorsOf(input)), ms: bound.ms, ...(from === undefined ? {} : { from }) });
  }),
};
