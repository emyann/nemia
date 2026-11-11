/**
 * How an upgrade's conflict is resolved (agent-orchestrator, src/factory/upgrade/resolution.ts). A conflict in a file directly in a
 * workflow's folder of the factory's tree (`workflows/<workflow>/<file>`, the folders of agents, skills and carried files aside) is
 * resolved by a proposal of that Workflow: the folder's merged files, proposed at the revision the conflict read, which the person
 * approves, or an agent a delegation lets approve. Any other conflict — the tree's wiring, its instruction and rules, an agent's, a
 * skill's, a carried file, a file nested deeper in a workflow's folder or one that is not text, neither of which a Workflow's spec
 * carries — is resolved by the person's choice, as before (`resolvedBy`). The pass reads, for each workflow with conflicts, the proposal
 * `resolutions.json` names for it, as it is now, and takes the workflow's files from the tree only once that proposal applied
 * (`workflowResolution`); until then its conflicts wait, and the status says on what. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ProposalPhase } from 'objects';

/** The folders beside the workflows in a tree's `workflows/` that hold no workflow: its agents, its skills, the carried files. */
const HELD_FOLDERS: readonly string[] = ['agents', 'skills', 'carried'];

/** Whether a tree path, by its segments, is a file directly in a workflow's folder. */
const inAWorkflow = (segments: readonly string[]): boolean =>
  segments.length === 3 && segments[0] === 'workflows' && !HELD_FOLDERS.includes(segments[1] ?? '');

const resolvedBySpec = spec<(segments: readonly string[], text: boolean) => string | null>({
  requires: ({ input: [segments] }) => segments.length > 0 && segments.every((s) => s.length > 0),
  ensures: {
    workflowTextByItsProposal: {
      description: "A conflict in a text file directly in a workflow's folder is resolved by a proposal of that workflow",
      condition: ({ input: [segments, text], output }) => !(text && inAWorkflow(segments)) || output === segments[1],
    },
    elseByAChoice: {
      description:
        "A conflict anywhere else — the wiring, the instruction, the rules, an agent's, a skill's, a carried file, a nested file — is resolved by the person's choice",
      condition: ({ input: [segments], output }) => inAWorkflow(segments) || output === null,
    },
    bytesByAChoice: {
      description: "A conflict in a file that is not text, which a Workflow's spec does not carry, is resolved by the person's choice",
      condition: ({ input: [, text], output }) => text || output === null,
    },
  },
});

/**
 * `resolvedBy`'s type, which `src/factory/upgrade/resolution.ts` takes: the workflow whose proposal resolves a conflict at a tree path,
 * by the path's segments and whether each side of its file is text; null where the person's choice resolves it.
 */
export type ResolvedBy = Implementation<typeof resolvedBySpec>;

/**
 * The proposal `resolutions.json` names for a workflow's resolution, as the pass reads it now: its phase, `gone` where the store holds no
 * proposal of that name; none where no proposal is named for the workflow.
 */
export type ResolutionProposal = { readonly phase: ProposalPhase | 'gone' } | undefined;

/**
 * What a workflow's conflicts are to the pass: `taken`, the proposal applied, so the workflow's files are its tree's as they stand;
 * `unresolved`, no proposal yet, each conflict waiting on `nemia factory resolve`; `proposed`, a proposal waiting to be approved or,
 * approved, to apply; `refused`, a proposal that ended without applying (declined, stale, dropped, failed or gone), to resolve again.
 */
export type WorkflowResolution = 'taken' | 'unresolved' | 'proposed' | 'refused';

const workflowResolutionSpec = spec<(proposal: ResolutionProposal) => WorkflowResolution>({
  ensures: {
    takenOnceApplied: {
      description: "A workflow's files are taken from the tree once its resolution's proposal applied",
      condition: ({ input: [p], output }) => p?.phase !== 'applied' || output === 'taken',
    },
    neverTakenUnapplied: {
      description: "A workflow's files are never taken from the tree before its resolution's proposal applied: its conflicts wait",
      condition: ({ input: [p], output }) => p?.phase === 'applied' || output !== 'taken',
    },
    unproposedWaitsOnAResolve: {
      description: 'A workflow no proposal is named for waits on a resolution of its conflicts',
      condition: ({ input: [p], output }) => p !== undefined || output === 'unresolved',
    },
    pendingWaitsOnTheProposal: {
      description: 'A proposal waiting, or approved and not yet applied, is what the conflicts wait on',
      condition: ({ input: [p], output }) => !(p?.phase === 'waiting' || p?.phase === 'approved') || output === 'proposed',
    },
    endedUnappliedIsResolvedAgain: {
      description: 'A proposal declined, stale, dropped, failed or gone resolves nothing: the conflicts are resolved again',
      condition: ({ input: [p], output }) =>
        !(p?.phase === 'declined' || p?.phase === 'stale' || p?.phase === 'dropped' || p?.phase === 'failed' || p?.phase === 'gone') ||
        output === 'refused',
    },
  },
});

/** `workflowResolution`'s type, which `src/factory/upgrade/resolution.ts` takes, read by the pass and by `nemia factory resolve`. */
export type WorkflowResolutionOf = Implementation<typeof workflowResolutionSpec>;
