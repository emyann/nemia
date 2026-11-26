/**
 * What a step may override of its agent (src/workflow/fence.ts): `unoffered`, the override of a step that its agent's `overridable:` line
 * leaves out, which `offerRefusal` refuses the step at load for, naming it.
 *
 * An agent is configured over a harness, and the harness's properties — the model, the effort, the context window and the harness itself —
 * are always a step's to override, so a factory runs any step on another model without forking its agent. The line governs only the rest,
 * what shapes the agent's behaviour: who may drive its session (`remote`), its result (`output`), its fence, which only narrows, and what
 * it is given (`skills`, `mcp`), which only adds. An agent with no line offers all of it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A property of the harness an agent runs on: always a step's to override, and never a word of an agent's `overridable:` line. */
export type HarnessProperty = 'model' | 'effort' | 'context' | 'harness';

/** A word of an agent's `overridable:` line: what shapes the agent's behaviour, which the agent offers its steps or keeps. */
export type Overridable = 'remote' | 'output' | 'fence' | 'skills' | 'mcp';

/** What a step's own keys override of its agent (`overridesOf`): a harness property, or a word the agent's line governs. */
export type StepOverride = HarnessProperty | Overridable;

/** The harness's properties, the words of `HarnessProperty`. */
const HARNESS_PROPERTIES: readonly StepOverride[] = ['model', 'effort', 'context', 'harness'];

/** Whether `word` is a property of the harness. */
const isHarnessProperty = (word: StepOverride) => HARNESS_PROPERTIES.includes(word);

/** Whether the agent's line `offered` names `word`. */
const named = (offered: readonly Overridable[], word: StepOverride) => offered.some((o) => o === word);

/** Whether the agent's line `offered` keeps `word` from its steps: a line that is there and does not name it, a harness property never. */
const kept = (offered: readonly Overridable[] | undefined, word: StepOverride) =>
  offered !== undefined && !isHarnessProperty(word) && !named(offered, word);

const unofferedSpec = spec<(offered: readonly Overridable[] | undefined, overrides: readonly StepOverride[]) => Overridable | undefined>({
  ensures: {
    harnessPropertiesAreAlwaysAStepsToOverride: {
      description:
        'A step that overrides only properties of the harness — the model, the effort, the context window, the harness — is refused nothing, whatever its agent offers',
      condition: ({ input: [, overrides], output }) => !overrides.every(isHarnessProperty) || output === undefined,
    },
    noLineOffersEverything: {
      description: 'An agent with no `overridable:` line offers its steps everything: none is refused',
      condition: ({ input: [offered], output }) => offered !== undefined || output === undefined,
    },
    refusedOnlyForWhatTheStepOverrides: {
      description: 'A step is refused only for something it overrides of its agent',
      condition: ({ input: [, overrides], output }) => output === undefined || overrides.includes(output),
    },
    refusedOnlyForWhatTheLineLeavesOut: {
      description: "A step is refused only for what its agent's line is there and does not name",
      condition: ({ input: [offered], output }) => output === undefined || (offered !== undefined && !named(offered, output)),
    },
    whatTheLineLeavesOutIsRefused: {
      description: "A step that overrides what its agent's line leaves out, and is no property of the harness, is refused",
      condition: ({ input: [offered, overrides], output }) => !overrides.some((w) => kept(offered, w)) || output !== undefined,
    },
    theFirstLeftOutIsSaid: {
      description: "The refusal names the first override, in the step's order, that its agent's line leaves out",
      condition: ({ input: [offered, overrides], output }) =>
        output === undefined || output === overrides.find((w) => kept(offered, w)),
    },
  },
});

/** `unoffered`'s type, which src/workflow/fence.ts takes. */
export type Unoffered = Implementation<typeof unofferedSpec>;
