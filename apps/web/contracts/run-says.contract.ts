/**
 * What a run says at each size of the look's run part (apps/web, src/lib/runSays.ts): the smallest size that says each thing a run can
 * say (`smallestSize`), from which `says` gives everything a size says, each size all the one under it does and more.
 *
 * The ladder is the person's, from the artboard "Run component" (16 Nov): a mark says its state and its id; a line adds the step now,
 * its title and its clock; a row or a card adds where it runs (factory / workflow), the step's agent, its round, what it waits for in
 * words, its steps as a graph, the step's budget, its cost and how many runs wait on it; a card at lg adds its labels and Open run; a
 * panel adds each step named under the graph, the facts (clock with its start, cost against the step's budget, tokens and context,
 * gates), the runs it waits on and that wait on it, and its session's last line. Layout matters at md alone, and for the labels alone:
 * a row has the width for them, a card leaves them to lg.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** How much a run says: a mark, a line, a row or a card, a card, a panel. */
export type RunSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** The shape of a run at md: a row of a list, or a card of the floor. */
export type RunLayout = 'row' | 'card';

/** One thing a run can say. */
export type RunSays =
  | 'state'
  | 'id'
  | 'step'
  | 'title'
  | 'clock'
  | 'where'
  | 'agent'
  | 'round'
  | 'words'
  | 'graph'
  | 'budget'
  | 'cost'
  | 'waitedBy'
  | 'labels'
  | 'action'
  | 'named'
  | 'facts'
  | 'runs'
  | 'lastLine';

/** Said by the mark, and so at every size. */
const ofTheMark = (thing: RunSays): boolean => thing === 'state' || thing === 'id';

/** Added by the line. */
const ofTheLine = (thing: RunSays): boolean => thing === 'step' || thing === 'title' || thing === 'clock';

/** Added by the row or the card at md, whichever its layout. */
const ofMd = (thing: RunSays): boolean =>
  thing === 'where' ||
  thing === 'agent' ||
  thing === 'round' ||
  thing === 'words' ||
  thing === 'graph' ||
  thing === 'budget' ||
  thing === 'cost' ||
  thing === 'waitedBy';

/** Added by the panel alone. */
const ofThePanel = (thing: RunSays): boolean =>
  thing === 'named' || thing === 'facts' || thing === 'runs' || thing === 'lastLine';

const smallestSizeSpec = spec<(thing: RunSays, layout: RunLayout) => RunSize>({
  ensures: {
    theMarkSaysItsStateAndItsId: {
      description: 'A run says its state and its id at every size, the mark first',
      condition: ({ input: [thing], output }) => !ofTheMark(thing) || output === 'xs',
    },
    theMarkSaysNothingElse: {
      description: 'The mark says its state and its id and nothing more',
      condition: ({ input: [thing], output }) => output !== 'xs' || ofTheMark(thing),
    },
    theLineAddsTheStepTheTitleAndTheClock: {
      description: 'The step now, the title and the clock are said from the line up',
      condition: ({ input: [thing], output }) => (output === 'sm') === ofTheLine(thing),
    },
    mdAddsWhatTheRunIsDoing: {
      description: 'Where it runs, the agent, the round, the words, the graph, the budget, the cost and who waits on it are said from md up, in either layout',
      condition: ({ input: [thing], output }) => !ofMd(thing) || output === 'md',
    },
    aRowSaysTheLabelsAtMd: {
      description: 'A row has the width for the labels, so a run says them from md up in a row',
      condition: ({ input: [thing, layout], output }) => thing !== 'labels' || layout !== 'row' || output === 'md',
    },
    aCardLeavesTheLabelsToLg: {
      description: 'A card leaves the labels to lg',
      condition: ({ input: [thing, layout], output }) => thing !== 'labels' || layout !== 'card' || output === 'lg',
    },
    lgAddsOpenRun: {
      description: 'Open run is said from lg up, in either layout',
      condition: ({ input: [thing], output }) => thing !== 'action' || output === 'lg',
    },
    lgAddsNothingButTheLabelsAndOpenRun: {
      description: 'What lg adds is the labels and Open run, nothing else',
      condition: ({ input: [thing], output }) => output !== 'lg' || thing === 'labels' || thing === 'action',
    },
    thePanelAddsTheRest: {
      description: 'Each step named, the facts, the runs it waits on and that wait on it, and the last line are said by the panel alone',
      condition: ({ input: [thing], output }) => (output === 'xl') === ofThePanel(thing),
    },
  },
});

/** `smallestSize`'s type, which src/lib/runSays.ts takes. */
export type SmallestSizeOf = Implementation<typeof smallestSizeSpec>;
