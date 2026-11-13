/**
 * The version a template of this workspace takes where a run's branch lands on its base (`packages/templates/released.ts`,
 * `landedVersion`): the landing merges the base as it is then into the branch, and the record (`released.json`, each template's
 * `spec.version` in its `nemia.yaml`) is cut again from the base's, so two runs that changed one template side by side never both claim
 * one version. The branch's own bump is read only for what it says: that it changed the template, and of which kind (major, minor,
 * patch). A version recorded once never names another content (SemVer 2.0.0, item 3: "Once a versioned package has been released, the
 * contents of that version MUST NOT be modified.").
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A semantic version: its major, minor and patch, each a whole number from 0. */
export type Semver = readonly [major: number, minor: number, patch: number];

/** Which part of a version a change moved: the highest part that grew, or `none` where the second is not above the first. */
export type Bump = 'major' | 'minor' | 'patch' | 'none';

/**
 * What the landing knows of one template: `base`, the version the base records for it as it is now; `forked`, the version at the
 * commit the branch forked from (the merge base); `branch`, the version the branch's tip says; `changed`, whether the template's content
 * on the branch merged with the base differs from the content the base records under `base`.
 */
export type Seam = { base: Semver; forked: Semver; branch: Semver; changed: boolean };

/**
 * What the template takes: `kept`, the base's version and record stand, since the merged content is the one it records; `taken`, a new
 * version above the base's, of the kind the branch bumped by; `refused`, the content changed and the branch bumped nothing above where it
 * forked, so no kind is said and nothing is cut (`unbumped`).
 */
export type Landed = { kind: 'kept'; version: Semver } | { kind: 'taken'; version: Semver } | { kind: 'refused'; reason: 'unbumped' };

/** Each part a whole number from 0. */
const whole = (v: Semver): boolean =>
  Number.isInteger(v[0]) && v[0] >= 0 && Number.isInteger(v[1]) && v[1] >= 0 && Number.isInteger(v[2]) && v[2] >= 0;

/** The same version. */
const same = (a: Semver, b: Semver): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** The highest part `to` grew over `from` by precedence, or `none` where `to` is not above `from`. */
const bumpOf = (from: Semver, to: Semver): Bump => {
  if (to[0] !== from[0]) return to[0] > from[0] ? 'major' : 'none';
  if (to[1] !== from[1]) return to[1] > from[1] ? 'minor' : 'none';
  return to[2] > from[2] ? 'patch' : 'none';
};

/**
 * The least version above `v` of the kind `bump` (SemVer 2.0.0, items 7 and 8: "Patch version MUST be reset to 0 when minor version is
 * incremented.", "Patch and minor versions MUST be reset to 0 when major version is incremented.").
 */
const nextOf = (v: Semver, bump: Bump): Semver =>
  bump === 'major' ? [v[0] + 1, 0, 0] : bump === 'minor' ? [v[0], v[1] + 1, 0] : bump === 'patch' ? [v[0], v[1], v[2] + 1] : v;

const landedVersionSpec = spec<(seam: Seam) => Landed>({
  requires: ({ input: [seam] }) => whole(seam.base) && whole(seam.forked) && whole(seam.branch),
  ensures: {
    keptExactlyWhenUnchanged: {
      description: "The base's version stands exactly where the merged content is the one the base records under it",
      condition: ({ input: [seam], output }) => (output.kind === 'kept') === !seam.changed,
    },
    keptIsTheBasesVersion: {
      description: 'A template whose content did not change keeps the version the base records, never the branch\'s',
      condition: ({ input: [seam], output }) => (output.kind === 'kept' ? same(output.version, seam.base) : true),
    },
    refusedExactlyWhenChangedUnbumped: {
      description: 'A changed template is refused exactly where the branch bumped nothing above the version it forked from',
      condition: ({ input: [seam], output }) =>
        (output.kind === 'refused') === (seam.changed && bumpOf(seam.forked, seam.branch) === 'none'),
    },
    takenIsAboveTheBase: {
      description: "A version taken is above the base's, so it is none the base has recorded, whatever a sibling landed first",
      condition: ({ input: [seam], output }) => (output.kind === 'taken' ? bumpOf(seam.base, output.version) !== 'none' : true),
    },
    takenIsTheNextOfTheBranchsKind: {
      description:
        "A version taken is the least above the base's of the kind the branch bumped by: a patch stays a patch, a minor a minor, a major a major",
      condition: ({ input: [seam], output }) =>
        output.kind === 'taken' ? same(output.version, nextOf(seam.base, bumpOf(seam.forked, seam.branch))) : true,
    },
  },
});
export type LandedVersion = Implementation<typeof landedVersionSpec>;
