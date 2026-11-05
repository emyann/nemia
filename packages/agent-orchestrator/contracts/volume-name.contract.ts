/**
 * A volume's name (agent-orchestrator, src/volume/volume.ts): the name a factory's volume is served and linked under, the
 * `Volume` object's `metadata.name`. It is `base`, the slug of its path's basename (`volumeBase`, a test's), unless another volume of the
 * factory holds that name already (`taken`: the names its file stores, then those named before it in path order), and then `base` with a
 * suffix, `<base>-<n>`. A name once stored on the file is kept, so a link to it stays: this function names only a volume with none.
 */
import { type Implementation, spec } from '@emyann/tsverify';

const volumeNameAmongSpec = spec<(base: string, taken: readonly string[]) => string>({
  requires: ({ input: [base] }) => base.length > 0,
  ensures: {
    baseWhenFree: {
      description: "A volume is named by its folder's name when no other volume of the factory holds it",
      condition: ({ input: [base, taken], output }) => taken.includes(base) || output === base,
    },
    neverAnotherVolumesName: {
      description: 'A volume is never given a name another volume of the factory holds',
      condition: ({ input: [, taken], output }) => !taken.includes(output),
    },
    suffixedWhenTaken: {
      description: "A volume whose folder's name another holds is named by it with a suffix",
      condition: ({ input: [base, taken], output }) => !taken.includes(base) || output.startsWith(base + '-'),
    },
  },
});

/** `volumeNameAmong`'s type, which `src/volume/volume.ts` takes. */
export type VolumeNameAmong = Implementation<typeof volumeNameAmongSpec>;
