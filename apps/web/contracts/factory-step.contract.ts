/**
 * What the welcome's factory step, `/welcome/factory`, shows (`factoryStepOf`, src/lib/factoryStep.ts): the three ways to make a first
 * factory, the way the person chose, or the factory made. Level-triggered: whether the store holds a factory is the store's milestones
 * as the api reads them now, never a flag of this browser, so a factory filed by Nemia in her chat, at a terminal or by another tab moves
 * the step on; the one thing the page keeps is the write it made itself, whose answer is the store's word too.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A way to make a first factory, in the order the step offers them: with Nemia in her chat, from a template, or from scratch. */
export type FactoryWay = 'nemia' | 'template' | 'scratch';

/** A write the step made that the api answered: a template applied, or an empty factory filed. */
export type FactoryMade = 'template' | 'scratch';

/**
 * What the step shows: `choose` the three tiles with none chosen; `nemia`, `template` or `scratch` the chosen way's panel, its form or
 * her chat's door; `made` the factory made and the next milestone; `guide` an empty factory made, with the short guide to what a workflow,
 * an agent and a hire are.
 */
export type FactoryScreen = 'choose' | FactoryWay | 'made' | 'guide';

/**
 * What the step is drawn from: `filed`, whether the store's factory milestone reads done; `way`, the tile chosen (none before a press);
 * `made`, the write this page made that the api answered (none before one).
 */
export type FactoryStepFacts = {
  readonly filed: boolean;
  readonly way: FactoryWay | undefined;
  readonly made: FactoryMade | undefined;
};

const factoryStepOfSpec = spec<(facts: FactoryStepFacts) => FactoryScreen>({
  ensures: {
    madeOnlyFromTheStore: {
      description: 'The step says a factory is made only where the store reads one filed, or the api answered the write this page made',
      condition: ({ input: [f], output }) => (output !== 'made' && output !== 'guide') || f.filed || f.made !== undefined,
    },
    theGuideFollowsAnEmptyFactory: {
      description: 'An empty factory made from scratch on this page is followed by the guide to what a workflow, an agent and a hire are',
      condition: ({ input: [f], output }) => f.made !== 'scratch' || output === 'guide',
    },
    onOnceTheStoreHoldsOne: {
      description: 'Once the store holds a factory, filed by Nemia, a terminal or a template here, the step goes on to the next milestone',
      condition: ({ input: [f], output }) => !(f.filed || f.made === 'template') || f.made === 'scratch' || output === 'made',
    },
    theChosenWayBeforeAFactory: {
      description: 'Before the store holds a factory and before a write here, the step shows the way chosen, or the three tiles for none',
      condition: ({ input: [f], output }) => f.filed || f.made !== undefined || output === (f.way ?? 'choose'),
    },
  },
});

/** `factoryStepOf`'s type, which src/lib/factoryStep.ts takes. */
export type FactoryStepOf = Implementation<typeof factoryStepOfSpec>;
