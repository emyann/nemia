/**
 * What the board says where a read fails (`troubleWords`, src/lib/api/read.ts), by the kind of failure, the same on every page: where the
 * api answered a refusal, the api's own words, unchanged; where it answered what this board does not read, the answer's own message, which
 * names the read, the key and the fix; where nothing answered, that Nemia's api did not answer, why, and to reload the page once it does.
 * The board adds no command of a checkout to any of them: a person on an install has no `npm run`.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * How a read failed (implement maps the client's errors onto it in src/lib/api/read.ts, `failureOf`): the api refused it (a
 * `ReadRefusal` or a `WriteRefusal`), it answered what the board does not read (an `UnreadAnswer`), or nothing answered (any other error:
 * `fetch`'s own failure, the bound's abort).
 */
export type TroubleKind = 'refused' | 'unread' | 'unanswered';

/** A failed read: its kind, and the error's message as it came. */
export type ReadFailure = { readonly kind: TroubleKind; readonly message: string };

/** What the board says of a failed read: its kind, which the page marks it by, and the words a person reads. */
export type Trouble = { readonly kind: TroubleKind; readonly words: string };

/** A checkout's command, which the board never adds: a person on an install has none. */
const CHECKOUT = 'npm run';

/** What the board says before the failure's own words where nothing answered. */
const UNANSWERED_BEFORE = "Nemia's api did not answer (";

/** What the board says after the failure's own words where nothing answered. */
const UNANSWERED_AFTER = '). Reload the page once it is running again.';

const troubleWordsSpec = spec<(failure: ReadFailure) => Trouble>({
  ensures: {
    kindKept: {
      description: 'The trouble is of the kind the read failed by, so a page marks it as it failed',
      condition: ({ input: [failure], output }) => output.kind === failure.kind,
    },
    theApiSaysItsOwn: {
      description: "Where the api refused the read, the board says the api's own words, unchanged",
      condition: ({ input: [failure], output }) => failure.kind !== 'refused' || output.words === failure.message,
    },
    anUnreadAnswerSaysItsOwn: {
      description:
        "Where the api answered what the board does not read, the board says that answer's message, which names the read and the fix",
      condition: ({ input: [failure], output }) => failure.kind !== 'unread' || output.words === failure.message,
    },
    nothingAnsweredSaysSo: {
      description: "Where nothing answered, the board says first that Nemia's api did not answer",
      condition: ({ input: [failure], output }) => failure.kind !== 'unanswered' || output.words.startsWith("Nemia's api did not answer"),
    },
    nothingAnsweredSaysWhy: {
      description: 'Where nothing answered, the board says why, in the words the failure came with',
      condition: ({ input: [failure], output }) => failure.kind !== 'unanswered' || output.words.includes(failure.message),
    },
    nothingAnsweredSaysToReload: {
      description: 'Where nothing answered, the board says to reload the page once the api answers again',
      condition: ({ input: [failure], output }) => failure.kind !== 'unanswered' || output.words.includes('Reload the page'),
    },
    noCheckoutCommand: {
      description:
        "The board adds no checkout's command to what it says: it says the failure's own words, alone or between words of its own that name none",
      condition: ({ input: [failure], output }) =>
        failure.kind === 'unanswered'
          ? output.words === UNANSWERED_BEFORE + failure.message + UNANSWERED_AFTER &&
            !UNANSWERED_BEFORE.includes(CHECKOUT) &&
            !UNANSWERED_AFTER.includes(CHECKOUT)
          : output.words === failure.message,
    },
  },
});

/** `troubleWords`'s type, which src/lib/api/read.ts takes. */
export type TroubleWords = Implementation<typeof troubleWordsSpec>;
