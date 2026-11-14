/**
 * What a run is handed besides its brief, from the run's side (agent-orchestrator): the inbox cards `nemia start --card` names, refused
 * before anything is written when one cannot be handed (`cardsRefusal`, src/start/inputs.ts), and the folders of each run it is handed
 * (`--from`, a card's `from:`) that a step is filed with, read-only (`handedRunMounts`, src/filed/filed.ts).
 *
 * Each spec exports its type under the function's name, and the code takes it. Which names the inbox refuses as a card's is its own
 * judgement (`inboxNameRefusal`, src/inbox/inbox.ts), handed in as data.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { isRemoteHarness } from '../src/harness/harness.ts';
import type { Mount } from '../src/record/record.ts';
import type { StepSpec } from '../src/step/step.ts';
import { handedFolders } from '../src/handed-folders/handed-folders.ts';
import { sandboxed } from '../src/workflow/index.ts';
import type { HandedRunFolders } from './handed-folders.contract.ts';

/**
 * Whether a harness is fenced by a sandbox (`sandboxed`), read off the runtime's declarations, which the purity check cannot see into:
 * declared, and nothing of it assumed. No law reads it: a sandboxed step reads the disk already, so it may be filed the folders or none.
 */
export const fencedBySandbox = assume(sandboxed, { pure: false });

/**
 * `cardsRefusal(cards, unnamed, found, inputs)`: the names `--card` gave, those of them the inbox refuses as a card's name (`unnamed`,
 * by `inboxNameRefusal`), those it holds a card of (`found`, read through the Card door), and each `--input` file's name in the run's
 * inputs. Both judgements are handed as data: the verifier reads each call of a function it is given as any value, so a law over
 * `exists(c)` could not be tied to the code's own call, and it did not tie a law's call of `inboxNameRefusal`, declared pure, to the
 * code's (a counterexample at `[""]` either way).
 */

/** The folder under the run's `inputs/` the handed cards are copied into: an `--input` of this name would take the same path. */
const CARDS = 'cards';

/** Whether a name is given more than once in `names`: one of them was given before. */
const twice = (names: readonly string[]): boolean => names.some((name, at) => names.slice(0, at).includes(name));

const namedTwiceSpec = spec<(names: readonly string[]) => string | undefined>({
  ensures: {
    foundWhenTwice: {
      description: 'A name given more than once is found',
      condition: ({ input: [names], output }) => !twice(names) || output !== undefined,
    },
    noneWhenOnce: {
      description: 'Names each given once find none',
      condition: ({ input: [names], output }) => twice(names) || output === undefined,
    },
    oneOfThem: {
      description: 'What is found is one of the names',
      condition: ({ input: [names], output }) => output === undefined || names.includes(output),
    },
  },
  open: ['output'],
});

/** The type of the helper `cardsRefusal` leans on for a card named twice (`namedTwice`, src/start/inputs.ts). */
export type NamedTwice = Implementation<typeof namedTwiceSpec>;

const cardsRefusalSpec = spec<
  (cards: readonly string[], unnamed: readonly string[], found: readonly string[], inputs: readonly string[]) => string | null
>({
  ensures: {
    aCardsName: {
      description: "A name the inbox refuses as a card's name is refused",
      condition: ({ input: [cards, unnamed], output }) => cards.every((c) => !unnamed.includes(c)) || output !== null,
    },
    aCardThatIsThere: {
      description: 'A name with no card in the inbox is refused, before anything is written',
      condition: ({ input: [cards, unnamed, found], output }) =>
        cards.every((c) => unnamed.includes(c) || found.includes(c)) || output !== null,
    },
    onceEach: {
      description: 'A card named twice is refused: each is copied once',
      condition: ({ input: [cards], output }) => !twice(cards) || output !== null,
    },
    noInputInTheirPlace: {
      description: "An --input named `cards` is refused beside a card: the cards' folder in the run's inputs takes that name",
      condition: ({ input: [cards, , , inputs], output }) => cards.length === 0 || !inputs.includes(CARDS) || output !== null,
    },
    takenOtherwise: {
      description: 'Cards that are each a card in the inbox, named once, with no --input in their place, are taken — none among them',
      condition: ({ input: [cards, unnamed, found, inputs], output }) =>
        output === null ||
        cards.some((c) => unnamed.includes(c) || !found.includes(c)) ||
        twice(cards) ||
        (cards.length > 0 && inputs.includes(CARDS)),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type CardsRefusal = Implementation<typeof cardsRefusalSpec>;

/** Each folder the pass found of `found`, by its absolute path: the code's own list, whose laws are above. */
const foundPaths = (found: readonly HandedRunFolders[]): string[] => handedFolders(found);

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
        'A step on the default harness, fenced by its mode, is filed every folder found — whatever steps it comes after, not the roots alone — so Read, Grep and Glob reach them',
      condition: ({ input: [step, found], output }) =>
        step.harness !== undefined || foundPaths(found).every((p) => output.some((m) => m.path === p)),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type HandedRunMounts = Implementation<typeof handedRunMountsSpec>;
