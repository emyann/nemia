/**
 * How an upgrade's conflict is resolved (agent-orchestrator, src/factory/upgrade/resolution.ts). A conflict is resolved by a proposal of
 * the object that holds its file in the factory's tree, its owner: a file directly in a workflow's folder (`workflows/<workflow>/<file>`)
 * by that Workflow; an agent's file or its result schema (`workflows/agents/<agent>.md`, `<agent>.schema.json`) by that Agent; a file of a
 * skill's folder (`workflows/skills/<skill>/…`) by that Skill; a step's hire in the wiring (`factory.json#hires.<workflow>/<step>`) by that
 * Hire, named `<workflow>.<step>`; the rules and the instruction (`RULES.md`, `NEMIA.md`) by the Factory itself. Any other conflict — a
 * carried file (`workflows/carried/…`), which no object holds, the wiring's other keys (its revisions policy is the person's setting) or
 * the wiring whole, a file nested deeper in a workflow's folder, one that is not text, or one anywhere else — is resolved by the person's
 * choice, as before (`resolvedBy`). The pass reads, for each owner with conflicts, the proposal `resolutions.json` names for it, as it is
 * now, and takes the owner's files from the tree only once that proposal applied (`resolutionOf`); until then its conflicts wait, and
 * the status says on what. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ProposalPhase, ProposableKind } from 'objects';

/**
 * The kinds whose proposal resolves an upgrade's conflict: every kind a proposal carries but an McpServer, which the tree holds none of.
 */
export type ResolutionKind = Exclude<ProposableKind, 'McpServer'>;

/** The object whose proposal resolves a conflict: its kind and its name in the factory. */
export type ResolutionOwner = { readonly kind: ResolutionKind; readonly name: string };

/** The folders beside the workflows in a tree's `workflows/` that hold no workflow: its agents, its skills, the carried files. */
const HELD_FOLDERS: readonly string[] = ['agents', 'skills', 'carried'];

/** Whether a tree path, by its segments, is a file directly in a workflow's folder. */
const inAWorkflow = (segments: readonly string[]): boolean =>
  segments.length === 3 && segments[0] === 'workflows' && !HELD_FOLDERS.includes(segments[1] ?? '');

/** The agent a file directly in the agents' folder belongs to, by its name: `<agent>.md` or `<agent>.schema.json`; none for another. */
const agentOfFile = (file: string): string | null => {
  const name = file.endsWith('.schema.json')
    ? file.slice(0, -'.schema.json'.length)
    : file.endsWith('.md')
      ? file.slice(0, -'.md'.length)
      : '';
  return name.length > 0 ? name : null;
};

/** The agent whose file a tree path is, or none. */
const agentAt = (segments: readonly string[]): string | null =>
  segments.length === 3 && segments[0] === 'workflows' && segments[1] === 'agents' ? agentOfFile(segments[2] ?? '') : null;

/** Whether a tree path is a file of a skill's folder, at any depth in it. */
const inASkill = (segments: readonly string[]): boolean => segments.length >= 4 && segments[0] === 'workflows' && segments[1] === 'skills';

/** Whether a tree path is a carried file. */
const carried = (segments: readonly string[]): boolean => segments.length >= 3 && segments[0] === 'workflows' && segments[1] === 'carried';

/** Whether a tree path is the factory's rules or its instruction. */
const factoryText = (segments: readonly string[]): boolean =>
  segments.length === 1 && (segments[0] === 'RULES.md' || segments[0] === 'NEMIA.md');

/** The hire a key of the wiring names, `<workflow>.<step>` for `hires.<workflow>/<step>`; none for another key. */
const hireOfKey = (key: string | null): string | null => {
  if (key === null || !key.startsWith('hires.')) return null;
  const step = key.slice('hires.'.length);
  const cut = step.indexOf('/');
  return cut > 0 && cut < step.length - 1 ? step.slice(0, cut) + '.' + step.slice(cut).slice(1) : null;
};

/** Whether a conflict is a step's hire in the wiring. */
const aHire = (segments: readonly string[], key: string | null): boolean =>
  segments.length === 1 && segments[0] === 'factory.json' && hireOfKey(key) !== null;

/** Whether `owner` is the object `kind` named `name`. */
const is = (owner: ResolutionOwner | null, kind: ResolutionKind, name: string | null | undefined): boolean =>
  owner !== null && owner.kind === kind && owner.name === name;

const resolvedBySpec = spec<(segments: readonly string[], key: string | null, text: boolean, factory: string) => ResolutionOwner | null>({
  requires: ({ input: [segments, , , factory] }) => segments.length > 0 && segments.every((s) => s.length > 0) && factory.length > 0,
  ensures: {
    workflowTextByItsWorkflow: {
      description: "A conflict in a text file directly in a workflow's folder is resolved by a proposal of that Workflow",
      condition: ({ input: [segments, , text], output }) => !(text && inAWorkflow(segments)) || is(output, 'Workflow', segments[1]),
    },
    agentTextByItsAgent: {
      description: "A conflict in an agent's text file or its result schema is resolved by a proposal of that Agent",
      condition: ({ input: [segments, , text], output }) => !(text && agentAt(segments) !== null) || is(output, 'Agent', agentAt(segments)),
    },
    skillTextByItsSkill: {
      description: "A conflict in a text file of a skill's folder, at any depth, is resolved by a proposal of that Skill",
      condition: ({ input: [segments, , text], output }) => !(text && inASkill(segments)) || is(output, 'Skill', segments[2]),
    },
    hireByItsHire: {
      description: "A conflict in a step's hire of the wiring is resolved by a proposal of that Hire, named <workflow>.<step>",
      condition: ({ input: [segments, key, text], output }) => !(text && aHire(segments, key)) || is(output, 'Hire', hireOfKey(key)),
    },
    rulesAndInstructionByTheFactory: {
      description: 'A conflict in the rules or the instruction is resolved by a proposal of the Factory itself',
      condition: ({ input: [segments, , text, factory], output }) => !(text && factoryText(segments)) || is(output, 'Factory', factory),
    },
    carriedByAChoice: {
      description: 'A conflict in a carried file, which no object holds, is resolved by the person’s choice',
      condition: ({ input: [segments], output }) => !carried(segments) || output === null,
    },
    elseByAChoice: {
      description:
        "A conflict anywhere else — the wiring's other keys or the wiring whole, a file nested deeper in a workflow's folder, any other file — is resolved by the person's choice",
      condition: ({ input: [segments, key], output }) =>
        inAWorkflow(segments) ||
        agentAt(segments) !== null ||
        inASkill(segments) ||
        aHire(segments, key) ||
        factoryText(segments) ||
        output === null,
    },
    bytesByAChoice: {
      description: 'A conflict in a file that is not text, which no spec carries, is resolved by the person’s choice',
      condition: ({ input: [, , text], output }) => text || output === null,
    },
  },
});

/**
 * `resolvedBy`'s type, which `src/factory/upgrade/resolution.ts` takes: the object whose proposal resolves a conflict, by its address —
 * the segments of its path, and the key after its `#` (null where it has none) — whether each side of its file is text, and the
 * factory's name; null where the person's choice resolves it.
 */
export type ResolvedBy = Implementation<typeof resolvedBySpec>;

/**
 * The proposal `resolutions.json` names for an owner's resolution, as the pass reads it now: its phase, `gone` where the store holds no
 * proposal of that name; none where no proposal is named for the owner.
 */
export type ResolutionProposal = { readonly phase: ProposalPhase | 'gone' } | undefined;

/**
 * What an owner's conflicts are to the pass: `taken`, the proposal applied, so the owner's files are its tree's as they stand;
 * `unresolved`, no proposal yet, each conflict waiting on `nemia factory resolve`; `proposed`, a proposal waiting to be approved or,
 * approved, to apply; `refused`, a proposal that ended without applying (declined, stale, dropped, failed or gone), to resolve again.
 */
export type UpgradeResolution = 'taken' | 'unresolved' | 'proposed' | 'refused';

const resolutionOfSpec = spec<(proposal: ResolutionProposal) => UpgradeResolution>({
  ensures: {
    takenOnceApplied: {
      description: "An owner's files are taken from the tree once its resolution's proposal applied",
      condition: ({ input: [p], output }) => p?.phase !== 'applied' || output === 'taken',
    },
    neverTakenUnapplied: {
      description: "An owner's files are never taken from the tree before its resolution's proposal applied: its conflicts wait",
      condition: ({ input: [p], output }) => p?.phase === 'applied' || output !== 'taken',
    },
    unproposedWaitsOnAResolve: {
      description: 'An owner no proposal is named for waits on a resolution of its conflicts',
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

/** `resolutionOf`'s type, which `src/factory/upgrade/resolution.ts` takes, read by the pass and by `nemia factory resolve`. */
export type ResolutionOf = Implementation<typeof resolutionOfSpec>;
