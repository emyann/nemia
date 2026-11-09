/**
 * A template switch (agent-orchestrator, src/factory/upgrade/merge.ts): an upgrade onto a template of another name than the one a factory's
 * base was rendered from, merged with no common base. `mergeBaseOf` says whether an upgrade has one, by the templates' names alone, never
 * their sources; `baseTemplateOf` names the template a base holds, as the controller records it; and with no base, `unrelatedKey` merges
 * one key (of `factory.json`, a hire, a step's frontmatter) and `unrelatedSet` a set of names (the workflows), where nothing tells the
 * factory's own value from the old template's, so the factory's is never kept over the template's without a choice.
 */
import { type Implementation, spec } from '@emyann/tsverify';

const mergeBaseOfSpec = spec<(recorded: string | undefined, now: string) => 'common' | 'none'>({
  ensures: {
    unrecordedIsCommon: {
      description: "A base whose template's name was never recorded merges three ways, as it did before names were recorded",
      condition: ({ input: [recorded], output }) => recorded !== undefined || output === 'common',
    },
    sameNameIsCommon: {
      description: 'The same template, by name, wherever it is read from, has a common base',
      condition: ({ input: [recorded, now], output }) => recorded !== now || output === 'common',
    },
    otherNameIsNone: {
      description: 'A template of another name than the base was rendered from has no common base with it',
      condition: ({ input: [recorded, now], output }) => recorded === undefined || recorded === now || output === 'none',
    },
  },
});
export type MergeBaseOf = Implementation<typeof mergeBaseOfSpec>;

/**
 * What a pass has seen of a base: the render's name where the base is the template rendered now, else none; the name its status last
 * recorded; whether no upgrade is under way (the status names the version the factory's file wants, and no upgrade waits); and the name
 * of the template the factory's file names, where it was read.
 */
export type BaseSeen = { rendered: string | undefined; recorded: string | undefined; idle: boolean; named: string | undefined };

const baseTemplateOfSpec = spec<(seen: BaseSeen) => string | undefined>({
  ensures: {
    renderTakesItsName: {
      description: 'A base that is the template rendered now holds that template',
      condition: ({ input: [seen], output }) => seen.rendered === undefined || output === seen.rendered,
    },
    recordedKept: {
      description: 'A base that is not the render keeps the name its status recorded',
      condition: ({ input: [seen], output }) => seen.rendered !== undefined || seen.recorded === undefined || output === seen.recorded,
    },
    idleBaseTakesTheFilesTemplate: {
      description:
        "With nothing recorded and no upgrade under way, a base that is not the render came from the template the factory's file names",
      condition: ({ input: [seen], output }) =>
        seen.rendered !== undefined || seen.recorded !== undefined || !seen.idle || output === seen.named,
    },
    underWayLeavesUnnamed: {
      description: "With nothing recorded and an upgrade under way, the factory's file names the new template, so the base is not named",
      condition: ({ input: [seen], output }) =>
        seen.rendered !== undefined || seen.recorded !== undefined || seen.idle || output === undefined,
    },
    unreadLeavesUnnamed: {
      description: 'With nothing recorded and no template read, a base that is not the render is not named',
      condition: ({ input: [seen], output }) =>
        seen.rendered !== undefined || seen.recorded !== undefined || seen.named !== undefined || output === undefined,
    },
  },
});
export type BaseTemplateOf = Implementation<typeof baseTemplateOfSpec>;

/** A key's merge with no base: the value taken, or a choice asked of the person. */
export type Unrelated = { taken: string } | { ask: true };

const unrelatedKeySpec = spec<(ours: string | undefined, theirs: string | undefined) => Unrelated>({
  /** The key is set on one side at least: a key neither sets is no key of the merge. */
  requires: ({ input: [ours, theirs] }) => ours !== undefined || theirs !== undefined,
  ensures: {
    agreedTaken: {
      description: 'A value both sides give alike is taken',
      condition: ({ input: [ours, theirs], output }) => ours !== theirs || ('taken' in output && output.taken === ours),
    },
    templateAddsTaken: {
      description: 'A key only the template sets is added',
      condition: ({ input: [ours, theirs], output }) =>
        ours !== undefined || theirs === undefined || ('taken' in output && output.taken === theirs),
    },
    treeOnlyAsks: {
      description: "A key only the tree sets asks: it may be the factory's own, or the old template's leftover",
      condition: ({ input: [ours, theirs], output }) => ours === undefined || theirs !== undefined || 'ask' in output,
    },
    differentAsks: {
      description: 'A key the two sides set differently asks',
      condition: ({ input: [ours, theirs], output }) => ours === undefined || theirs === undefined || ours === theirs || 'ask' in output,
    },
    neverOursOverTheirs: {
      description: "Whatever is taken is the template's value: the tree's is never kept over it without a choice",
      condition: ({ input: [, theirs], output }) => !('taken' in output) || output.taken === theirs,
    },
  },
});
export type UnrelatedKey = Implementation<typeof unrelatedKeySpec>;

/** Whether every name of `names` is in `of`. */
const within = (names: readonly (string | undefined)[], of: readonly (string | undefined)[]): boolean =>
  names.every((name) => of.some((o) => o === name));

const unrelatedSetSpec = spec<(ours: readonly string[], theirs: readonly string[]) => { taken: readonly string[] } | { ask: true }>({
  ensures: {
    templateAddsTaken: {
      description: "Where the template's set holds every name the tree's does, the template's set is taken",
      condition: ({ input: [ours, theirs], output }) =>
        !within(ours, theirs) || ('taken' in output && within(output.taken, theirs) && within(theirs, output.taken)),
    },
    treeOnlyNameAsks: {
      description: 'A name only the tree holds asks: it may be a workflow of its own, or the old template’s',
      condition: ({ input: [ours, theirs], output }) => within(ours, theirs) || 'ask' in output,
    },
  },
});
export type UnrelatedSet = Implementation<typeof unrelatedSetSpec>;
