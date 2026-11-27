/**
 * One term of a CardList's `?fieldSelector=` (agent-orchestrator, src/inbox/card-field.ts, `cardFieldTerm`), as Kubernetes spells a
 * field selector: a field, one of Kubernetes' three operators — `=` and `==`, which mean the same, and `!=` — then a value of that
 * field. Three fields: `status.inPlay` and `status.chained`, each `true` or `false`, and `status.phase`, one of the card's seven phases
 * (`CardPhase`). Anything else is no term (null), which the list refuses `Invalid`, naming the forms it takes. A selector is its terms
 * joined by commas, every one of which a card must keep: splitting it, and reading an empty one as every card, are the list's to do
 * before this is asked of each term. Replaces `card-play-selector.contract.ts` (`cardPlaySelector`), whose one field it keeps.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CardPhase } from 'objects';

/** A field of the card a term reads that holds `true` or `false`. */
export type CardFlagField = 'status.inPlay' | 'status.chained';

/**
 * One term of a card list's field selector: the field, whether it asks the field to equal the value (`=`, `==`) or to differ from it
 * (`!=`), and the value.
 */
export type CardFieldTerm =
  | { readonly field: CardFlagField; readonly equals: boolean; readonly value: boolean }
  | { readonly field: 'status.phase'; readonly equals: boolean; readonly value: CardPhase };

/** Whether `text` asks `field` to equal (`equals`) or differ from the value spelled `value`, in one of Kubernetes' spellings. */
const spelled = (text: string, field: string, equals: boolean, value: string) =>
  equals ? text === field + '=' + value || text === field + '==' + value : text === field + '!=' + value;

/** Whether `text` is a term of `field` with the value spelled `value`, in any of the three operators. */
const termOf = (text: string, field: string, value: string) => spelled(text, field, true, value) || spelled(text, field, false, value);

/** Whether `text` is a term of a flag `field`, with `true` or `false`. */
const flagTerm = (text: string, field: string) => termOf(text, field, 'true') || termOf(text, field, 'false');

/** Whether `text` is a term of `status.phase` with one of the seven phases. */
const phaseTerm = (text: string) =>
  termOf(text, 'status.phase', 'notStarted') ||
  termOf(text, 'status.phase', 'blocked') ||
  termOf(text, 'status.phase', 'waiting') ||
  termOf(text, 'status.phase', 'working') ||
  termOf(text, 'status.phase', 'done') ||
  termOf(text, 'status.phase', 'failed') ||
  termOf(text, 'status.phase', 'cancelled');

/** The spelling of `value`, a flag or a phase. */
const wordOf = (value: boolean | CardPhase) => (value === true ? 'true' : value === false ? 'false' : value);

const cardFieldTermSpec = spec<(text: string) => CardFieldTerm | null>({
  ensures: {
    inPlayTaken: {
      description: 'status.inPlay with true or false, after =, == or !=, is a term of the cards',
      condition: ({ input: [text], output }) => !flagTerm(text, 'status.inPlay') || output !== null,
    },
    chainedTaken: {
      description: 'status.chained with true or false, after =, == or !=, is a term of the cards',
      condition: ({ input: [text], output }) => !flagTerm(text, 'status.chained') || output !== null,
    },
    phaseTaken: {
      description: 'status.phase with a phase, after =, == or !=, is a term of the cards',
      condition: ({ input: [text], output }) => !phaseTerm(text) || output !== null,
    },
    readAsSpelled: {
      description: 'A term taken asks what its text spells: its field, = and == to equal the value named, != to differ from it',
      condition: ({ input: [text], output }) => output === null || spelled(text, output.field, output.equals, wordOf(output.value)),
    },
  },
});

/** `cardFieldTerm`'s type, which `src/inbox/card-field.ts` takes: the term `text` spells, or null where it spells none. */
export type CardFieldTermOf = Implementation<typeof cardFieldTermSpec>;
