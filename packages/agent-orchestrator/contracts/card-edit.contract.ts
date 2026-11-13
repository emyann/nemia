/**
 * Whether a card may be written whole from its text — its file as it is to be, frontmatter and body (`nemia inbox edit`, the Card's
 * `edit`, `PUT /api/namespaces/<factory>/cards/<name>/source`) — and why not (agent-orchestrator, src/card-write/card-edit.ts,
 * `cardEditRefusal`), before anything is written and before the Card's whole write judges the rest (`cardWriteRefusal`): a card a run was
 * started from keeps its file as its run copied it (`started`, a Conflict naming `nemia inbox add` for a new card); a card's factory is
 * where it lives, its namespace, so a text whose `factory:` names another is refused (`factory`, an Invalid naming `nemia inbox add
 * --factory`), while one that leaves it out or names the card's own keeps it; and a card's labels are their own verb's (`nemia label
 * inbox`), so a text whose `labels:` are not the card's is refused (`labels`, an Invalid naming that verb), while one that leaves them out
 * or sends them back as the card has them keeps them. Every other key and the body are the text's to say, as the Card's whole write
 * takes them.
 *
 * One refusal is answered where several hold, the first of that order: a started card is refused as started whatever else the text says.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What the refusal is read from: whether a run was started from the card; the card's namespace (its factory, `default` for one that names
 * none) and the `factory:` its text says (absent where it says none); and the card's labels now and as its text says them, each as one
 * line in key order (`labelsText`, `<none>` for none; absent where the text says no `labels:`).
 */
export type CardEditAsk = {
  readonly started: boolean;
  readonly namespace: string;
  readonly factoryRead?: string;
  readonly labelsNow: string;
  readonly labelsRead?: string;
};

/** Why a card's edit is refused, closed: started, its factory moved, or its labels changed. */
export type CardEditRefusal = 'started' | 'factory' | 'labels';

/** Whether the text names a factory other than the one the card lives in. */
const movesFactory = (ask: CardEditAsk): boolean => ask.factoryRead !== undefined && ask.factoryRead !== ask.namespace;

/** Whether the text says labels other than the card's. */
const relabels = (ask: CardEditAsk): boolean => ask.labelsRead !== undefined && ask.labelsRead !== ask.labelsNow;

const cardEditRefusalSpec = spec<(ask: CardEditAsk) => CardEditRefusal | null>({
  ensures: {
    startedRefused: {
      description: 'A card a run was started from is refused as started, whatever its text says',
      condition: ({ input: [ask], output }) => !ask.started || output === 'started',
    },
    factoryStays: {
      description: "A text that names another factory than the card's is refused: a card lives in its factory",
      condition: ({ input: [ask], output }) => ask.started || !movesFactory(ask) || output === 'factory',
    },
    labelsTheirOwnVerb: {
      description: "A text whose labels are not the card's is refused, where nothing before it refuses it: labels have their own verb",
      condition: ({ input: [ask], output }) => ask.started || movesFactory(ask) || !relabels(ask) || output === 'labels',
    },
    editedOtherwise: {
      description: 'A text that leaves the factory and the labels out, or sends them back as the card has them, is let through',
      condition: ({ input: [ask], output }) => ask.started || movesFactory(ask) || relabels(ask) || output === null,
    },
  },
});

/** `cardEditRefusal`'s type, which src/card-write/card-edit.ts takes. */
export type CardEditRefusalOf = Implementation<typeof cardEditRefusalSpec>;
