/**
 * Where a hire's settings came from (agent-orchestrator, src/object/hire.ts; no code yet): the `Hire` object's status says, for the step
 * `<workflow>.<step>` of a factory, who fills it and, for each setting a session gets there (model, effort, context, harness, fence,
 * skills, mcp), which layer set it. Two decisions, each from what the resolved step already carries (`StepAgent.keys`, the keys its
 * own file sets; `StepAgent.given`, what its agent gives): who fills the step (`fillOrigin`), and where one setting came from
 * (`settingOrigin`). The words are `objects`' (`SETTING_ORIGINS`, `FILL_ORIGINS`): implement moves the two types there and this file
 * imports them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where a step's agent came from: its own file's `agent:`, the factory's hire, neither, or both, which a start refuses. */
export type FillOrigin = 'step' | 'factory' | 'unfilled' | 'refused';

/** Where a setting a session gets came from: the step's own file, its agent's file, or neither, the harness's own default. */
export type SettingOrigin = 'step' | 'agent' | 'default';

const fillOriginSpec = spec<(written: boolean, hired: boolean) => FillOrigin>({
  ensures: {
    refusedExactlyWhenBothName: {
      description: "A step is refused exactly when its own file names an agent and the factory hires one into it",
      condition: ({ input: [written, hired], output }) => (output === 'refused') === (written && hired),
    },
    theStepsOwnLine: {
      description: 'A step whose own file alone names its agent is filled by the step',
      condition: ({ input: [written, hired], output }) => !(written && !hired) || output === 'step',
    },
    theFactorysHire: {
      description: 'A step the factory alone hires an agent into is filled by the factory',
      condition: ({ input: [written, hired], output }) => !(hired && !written) || output === 'factory',
    },
    unfilledWhenNoneNames: {
      description: 'A step nobody names an agent for is unfilled',
      condition: ({ input: [written, hired], output }) => written || hired || output === 'unfilled',
    },
  },
});

const settingOriginSpec = spec<(stepSets: boolean, agentGives: boolean) => SettingOrigin>({
  ensures: {
    theStepWins: {
      description: "A setting the step's own file writes came from the step, whatever its agent gives",
      condition: ({ input: [stepSets], output }) => (output === 'step') === stepSets,
    },
    thenTheAgent: {
      description: 'A setting the step does not write and its agent gives came from the agent',
      condition: ({ input: [stepSets, agentGives], output }) => (output === 'agent') === (!stepSets && agentGives),
    },
  },
});

/** `fillOrigin`'s type, which `src/object/hire.ts` takes. */
export type FillOriginOf = Implementation<typeof fillOriginSpec>;

/** `settingOrigin`'s type, which `src/object/hire.ts` takes. */
export type SettingOriginOf = Implementation<typeof settingOriginSpec>;
