/**
 * A templated factory changed at the version its base holds (agent-orchestrator, src/upgrade/same-version.ts). `sameVersionChange`
 * tells, by digests alone, what wanting the version the base already holds asks: nothing, where the base is already the render wanted;
 * a change of the factory's parameters alone, where the base is still the template at that version rendered with the parameters it was
 * rendered with (so the template did not change under its version, and the render wanted differs only by the parameters); else a
 * template changed under the same version, which no upgrade takes. `nemia factory diff`, `upgrade` and `resolve` and the factory
 * controller judge by it alike. `choicesApply` says whether the person's choices kept in `resolutions.json` answer the merge under way:
 * those made for its version, its template and the base it merges from, so a merge that landed leaves no choice to the next one at the
 * same version; a file written before the base was recorded holds choices made for a version's upgrade, never for a change of
 * parameters alone.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What a same-version change is judged on, each a digest of a tree (`digestOf`): the base the factory holds; the template at that version
 * rendered with the parameters the base was rendered with (its status's), or none where that no longer renders; and the template at
 * that version rendered with the parameters wanted.
 */
export type SameVersionSeen = { base: string; recorded: string | undefined; wanted: string };

/**
 * What wanting the version a base holds asks: nothing (`applied`), its parameters' change alone (`params`), or a template changed under
 * it (`content`).
 */
export type SameVersionKind = 'applied' | 'params' | 'content';

const sameVersionChangeSpec = spec<(seen: SameVersionSeen) => SameVersionKind>({
  ensures: {
    wantedHeldIsApplied: {
      description: 'A base that already holds the render wanted asks nothing: the factory is already applied',
      condition: ({ input: [seen], output }) => seen.wanted !== seen.base || output === 'applied',
    },
    unchangedTemplateIsParams: {
      description:
        'Where the render wanted is not the base, and the template rendered with the recorded parameters still is, the change is the parameters alone',
      condition: ({ input: [seen], output }) => seen.wanted === seen.base || seen.recorded !== seen.base || output === 'params',
    },
    changedTemplateIsContent: {
      description:
        'Where neither the render wanted nor the template rendered with the recorded parameters is the base, or the latter does not render, the template changed under its version',
      condition: ({ input: [seen], output }) => seen.wanted === seen.base || seen.recorded === seen.base || output === 'content',
    },
  },
});

/** `sameVersionChange`'s type, which `src/upgrade/same-version.ts` takes. */
export type SameVersionChange = Implementation<typeof sameVersionChangeSpec>;

/**
 * What a `resolutions.json` recorded its choices for: the version, the template's name (none where written before names were recorded),
 * and the digest of the base the merge was from (none where written before it was recorded).
 */
export type ChoicesRecorded = { to: string; template?: string; base?: string };

/**
 * The merge under way: the version the base holds and the version wanted, the name of the template rendered at it, and the digest of
 * the base it merges from.
 */
export type MergeAt = { from: string; to: string; template: string; base: string };

const choicesApplySpec = spec<(recorded: ChoicesRecorded, merge: MergeAt) => boolean>({
  ensures: {
    otherVersionNever: {
      description: 'Choices made for another version answer no conflict of this merge',
      condition: ({ input: [recorded, merge], output }) => recorded.to === merge.to || !output,
    },
    otherTemplateNever: {
      description: "Choices made for another template's merge answer no conflict of this one",
      condition: ({ input: [recorded, merge], output }) =>
        recorded.template === undefined || recorded.template === merge.template || !output,
    },
    otherBaseNever: {
      description: 'Choices made against another base, such as one a merge since landed replaced, answer no conflict of this merge',
      condition: ({ input: [recorded, merge], output }) => recorded.base === undefined || recorded.base === merge.base || !output,
    },
    unrecordedBaseNotForParams: {
      description: 'Choices written before their base was recorded were made for a version upgrade, never for a change of parameters alone',
      condition: ({ input: [recorded, merge], output }) => recorded.base !== undefined || merge.from !== merge.to || !output,
    },
    madeForThisMerge: {
      description:
        'Choices made for this version, this template (or one never named) and this base (or, unrecorded, for a version upgrade) answer it',
      condition: ({ input: [recorded, merge], output }) =>
        recorded.to !== merge.to ||
        (recorded.template !== undefined && recorded.template !== merge.template) ||
        (recorded.base === undefined ? merge.from === merge.to : recorded.base !== merge.base) ||
        output,
    },
  },
});

/** `choicesApply`'s type, which `src/upgrade/same-version.ts` takes and `choicesFor` (`src/applied/applied.store.ts`) calls. */
export type ChoicesApply = Implementation<typeof choicesApplySpec>;
