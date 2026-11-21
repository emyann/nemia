/**
 * What a factory's card triggers do with one inbox card on a pass (agent-orchestrator, src/inbox/triggered.ts, `cardTriggered`): read from
 * the level each time, carried nowhere. A trigger whose `when` is a card selector queues each card of its own factory that its selector
 * selects, on the workflow the card names, else on the trigger's target; two triggers that would send a card naming no workflow to two
 * targets leave it waiting, a clash a person settles by changing a selector or the card's labels. A card queued by hand (`queued:`) is
 * its own queue's, which no trigger takes or pulls back; a card started, or one that does not read, is queued by none; a card naming no
 * factory is matched by no trigger.
 *
 * `matching` is the triggers whose selector selects the card's labels as a selector reads them (`cardLabels`, `selectsLabels`), every
 * factory's: whether a selector selects is the selector's own, proved and tested where it is written (src/watch/selector.ts).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The kinds of thing a trigger may target: a workflow now, an open shape a later kind (a node, a task) joins. */
export type TriggerTargetKind = 'Workflow';

/** What a trigger sends what it matches to: a kind, and a name of that kind (a workflow its factory offers). */
export type TriggerTarget = { readonly kind: TriggerTargetKind; readonly name: string };

/** A card trigger as this decision reads it: the factory it is a part of, its name there, and its target. */
export type CardTrigger = { readonly factory: string; readonly name: string; readonly target: TriggerTarget };

/**
 * An inbox card as a trigger reads it: the factory it names (null for none), the workflow it names by name (null for none), whether it
 * is queued by hand (`queued:`), whether a run's record names it (started), and whether it reads as a card.
 */
export type TriggerCard = {
  readonly factory: string | null;
  readonly workflow: string | null;
  readonly queued: boolean;
  readonly started: boolean;
  readonly readable: boolean;
};

/**
 * What the triggers do with the card: queue it on a workflow, by the triggers of its factory that select it (`by`, their names); leave it
 * waiting on a clash of those triggers (`by`, every one of them); or nothing, no trigger of its factory taking it.
 */
export type Triggered =
  | { readonly kind: 'queued'; readonly workflow: string; readonly by: readonly string[] }
  | { readonly kind: 'clash'; readonly by: readonly string[] }
  | { readonly kind: 'none' };

/** Whether a trigger may take the card at all: it names a factory, is not queued by hand, not started, and reads. */
const takeable = (card: TriggerCard) => card.factory !== null && !card.queued && !card.started && card.readable;

/** Whether `t` is one of the card's own factory's triggers. */
const ofItsFactory = (card: TriggerCard, t: CardTrigger) => card.factory !== null && t.factory === card.factory;

/** Whether any trigger of the card's factory selects it. */
const anyOfItsFactory = (card: TriggerCard, matching: readonly CardTrigger[]) => matching.some((t) => ofItsFactory(card, t));

/** Whether two triggers of the card's factory that select it target two different workflows. */
const twoTargets = (card: TriggerCard, matching: readonly CardTrigger[]) =>
  matching.some((a) => ofItsFactory(card, a) && matching.some((b) => ofItsFactory(card, b) && b.target.name !== a.target.name));

/** The names a queue or a clash says it was made by. */
const byOf = (output: Triggered) => (output.kind === 'none' ? [] : output.by);

const cardTriggeredSpec = spec<(card: TriggerCard, matching: readonly CardTrigger[]) => Triggered>({
  ensures: {
    noFactoryNoTrigger: {
      description: 'A card naming no factory is matched by no trigger',
      condition: ({ input: [card], output }) => card.factory !== null || output.kind === 'none',
    },
    handQueuedIsItsOwn: {
      description: 'A card queued by hand is its own queue’s: no trigger queues it again or pulls it back',
      condition: ({ input: [card], output }) => !card.queued || output.kind === 'none',
    },
    startedIsNeverQueued: {
      description: 'A card a run was started from is queued by no trigger',
      condition: ({ input: [card], output }) => !card.started || output.kind === 'none',
    },
    unreadableWaits: {
      description: 'An entry that does not read as a card is queued by no trigger',
      condition: ({ input: [card], output }) => card.readable || output.kind === 'none',
    },
    noMatchNoQueue: {
      description: 'A card no trigger of its own factory selects is left as it is',
      condition: ({ input: [card, matching], output }) => anyOfItsFactory(card, matching) || output.kind === 'none',
    },
    byIsItsFactorysMatches: {
      description: 'A queue or a clash names only triggers of the card’s own factory that select it',
      condition: ({ input: [card, matching], output }) =>
        byOf(output).every((name) => matching.some((t) => ofItsFactory(card, t) && t.name === name)),
    },
    byNamesEveryMatch: {
      description: 'A queue or a clash names every trigger of the card’s own factory that selects it',
      condition: ({ input: [card, matching], output }) =>
        output.kind === 'none' || matching.every((t) => !ofItsFactory(card, t) || output.by.includes(t.name)),
    },
    cardsWorkflowWins: {
      description: 'A takeable card naming its workflow, selected by a trigger of its factory, is queued on its own workflow',
      condition: ({ input: [card, matching], output }) =>
        !(takeable(card) && card.workflow !== null && anyOfItsFactory(card, matching)) ||
        (output.kind === 'queued' && output.workflow === card.workflow),
    },
    oneTargetQueues: {
      description: 'A takeable card naming no workflow, whose triggers all target one workflow, is queued on that target',
      condition: ({ input: [card, matching], output }) =>
        !(takeable(card) && card.workflow === null && anyOfItsFactory(card, matching) && !twoTargets(card, matching)) ||
        (output.kind === 'queued' && matching.some((t) => ofItsFactory(card, t) && t.target.name === output.workflow)),
    },
    twoTargetsClash: {
      description: 'A takeable card naming no workflow, whose triggers target two workflows, waits on a clash and is not queued',
      condition: ({ input: [card, matching], output }) =>
        !(takeable(card) && card.workflow === null && twoTargets(card, matching)) || output.kind === 'clash',
    },
    clashOnlyOnTwoTargets: {
      description: 'A clash is only ever of a card naming no workflow whose triggers target two workflows',
      condition: ({ input: [card, matching], output }) =>
        output.kind !== 'clash' || (card.workflow === null && twoTargets(card, matching)),
    },
  },
});

/** `cardTriggered`'s type, which src/inbox/triggered.ts takes: what the triggers that select a card do with it on this pass. */
export type CardTriggered = Implementation<typeof cardTriggeredSpec>;
