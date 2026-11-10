/**
 * What a run is handed besides its brief, from the run's side (agent-orchestrator): the inbox cards `nemia start --card` names, refused
 * before anything is written when one cannot be handed (`cardsRefusal`, src/start/inputs.ts), and the folders of each run it is handed
 * (`--from`, a card's `from:`) that a step is filed with, read-only (`handedRunMounts`, src/filed/filed.ts).
 *
 * Neither function exists yet: each spec exports its type under the function's name, and the code takes it. `inboxNameRefusal`
 * (src/inbox/inbox.ts) is the inbox's own judgement of a name, declared pure here and nothing more: a name it refuses is no card's.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { inboxNameRefusal } from '../src/inbox/inbox.ts';
import { isRemoteHarness } from '../src/harness/harness.ts';
import type { Mount } from '../src/record/record.ts';
import type { StepSpec } from '../src/step/step.ts';

export const cardName = assume(inboxNameRefusal, { pure: true });

/** The folder under the run's `inputs/` the handed cards are copied into: an `--input` of this name would take the same path. */
const CARDS = 'cards';

/** Whether `name` is given more than once in `names`. */
const twice = (names: readonly string[], name: string): boolean => names.filter((n) => n === name).length > 1;

const cardsRefusalSpec = spec<(cards: readonly string[], exists: (name: string) => boolean, inputs: readonly string[]) => string | null>({
  ensures: {
    aCardsName: {
      description: "A name the inbox refuses as a card's name is refused",
      condition: ({ input: [cards], output }) => cards.every((c) => inboxNameRefusal(c) === undefined) || output !== null,
    },
    aCardThatIsThere: {
      description: 'A name with no card in the inbox is refused, before anything is written',
      condition: ({ input: [cards, exists], output }) =>
        cards.every((c) => inboxNameRefusal(c) !== undefined || exists(c)) || output !== null,
    },
    onceEach: {
      description: 'A card named twice is refused: each is copied once',
      condition: ({ input: [cards], output }) => !cards.some((c) => twice(cards, c)) || output !== null,
    },
    noInputInTheirPlace: {
      description: "An --input named `cards` is refused beside a card: the cards' folder in the run's inputs takes that name",
      condition: ({ input: [cards, , inputs], output }) => cards.length === 0 || !inputs.includes(CARDS) || output !== null,
    },
    takenOtherwise: {
      description: 'Cards that are each a card in the inbox, named once, with no --input in their place, are taken — none among them',
      condition: ({ input: [cards, exists, inputs], output }) =>
        output === null ||
        cards.some((c) => inboxNameRefusal(c) !== undefined || !exists(c) || twice(cards, c)) ||
        (cards.length > 0 && inputs.includes(CARDS)),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type CardsRefusal = Implementation<typeof cardsRefusalSpec>;

/**
 * A run this one is handed, as the pass found its folders on disk when it files a step: its id, and its `artifacts/` and its `inputs/`,
 * each absolute and present only where it is a directory now (a run given no input has no `inputs/`; a run forgotten has neither).
 * Implement moves it into src/filed/filed.ts beside the function, which changes no law.
 */
export type HandedRunFolders = { run: string; artifacts?: string; inputs?: string };

/** Each folder the pass found of `found`, by its absolute path. */
const foundPaths = (found: readonly HandedRunFolders[]): string[] =>
  found.flatMap((f) => [...(f.artifacts === undefined ? [] : [f.artifacts]), ...(f.inputs === undefined ? [] : [f.inputs])]);

const handedRunMountsSpec = spec<(step: Pick<StepSpec, 'harness'>, found: readonly HandedRunFolders[]) => Mount[]>({
  ensures: {
    readOnly: {
      description: "Every folder of a run this one is handed is mounted read-only: a step reads another run's work and writes none of it",
      condition: ({ output }) => output.every((m) => m.readOnly === true),
    },
    onlyWhatWasFound: {
      description: "Only a handed run's artifacts and inputs folders, as the pass found them, are mounted: nothing else of the store",
      condition: ({ input: [, found], output }) => output.every((m) => foundPaths(found).includes(m.path)),
    },
    noneOffThisMachine: {
      description: "A step on a remote agent is filed no mount: the store's folders stay on this machine",
      condition: ({ input: [step], output }) => !isRemoteHarness(step.harness) || output.length === 0,
    },
    everyStepOfTheDefaultHarness: {
      description:
        "A step on the default harness, fenced by its mode, is filed every folder found — whatever steps it comes after, not the roots alone — so Read, Grep and Glob reach them",
      condition: ({ input: [step, found], output }) =>
        step.harness !== undefined || foundPaths(found).every((p) => output.some((m) => m.path === p)),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type HandedRunMounts = Implementation<typeof handedRunMountsSpec>;
