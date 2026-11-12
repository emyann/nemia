/**
 * A CardList's `?fieldSelector=` (agent-orchestrator, src/object/card-field.ts, `cardPlaySelector`), as Kubernetes spells a field
 * selector: one field, `status.inPlay`, whether the card is still in play (`cardInPlay`: not started, or its run not ended), with one of
 * Kubernetes' three operators — `=` and `==`, which mean the same, and `!=` — then `true` or `false`. `status.inPlay!=false` asks what
 * `status.inPlay=true` asks. Anything else is no selector of it (null), which the list refuses `Invalid`, naming the forms it takes; an
 * empty one selects every card, as Kubernetes reads an empty selector, and is the list's to read before this is asked.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a selector asks: the cards in play (`inPlay: true`), or those whose run ended (`inPlay: false`). */
export type CardPlaySelector = { readonly inPlay: boolean };

/** The field a card's list is selected by. */
const FIELD = 'status.inPlay';

/** Whether `text` is one of the spellings that ask for the cards whose `inPlay` is `value`: `=` or `==` it, or `!=` the other. */
const asks = (text: string, value: boolean): boolean =>
  value
    ? text === FIELD + '=true' || text === FIELD + '==true' || text === FIELD + '!=false'
    : text === FIELD + '=false' || text === FIELD + '==false' || text === FIELD + '!=true';

const cardPlaySelectorSpec = spec<(text: string) => CardPlaySelector | null>({
  ensures: {
    eachSpellingTaken: {
      description: 'status.inPlay, then =, == or !=, then true or false, is a selector of the cards',
      condition: ({ input: [text], output }) => !(asks(text, true) || asks(text, false)) || output !== null,
    },
    readAsSpelled: {
      description: 'A selector taken keeps the cards whose inPlay its text asks for: = and == the value named, != the other',
      condition: ({ input: [text], output }) => output === null || asks(text, output.inPlay),
    },
  },
});

/** `cardPlaySelector`'s type, which `src/object/card-field.ts` takes: the selector `text` spells, or null where it spells none. */
export type CardPlaySelectorOf = Implementation<typeof cardPlaySelectorSpec>;
