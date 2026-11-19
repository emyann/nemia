/**
 * The parameters a templated factory's first writable volume sets (`originParams`, src/factory/volume/origin-params.ts): a boolean
 * parameter a template declares with `whenOrigin: <host>` is true where that volume was cloned from a URL on that host and false where it
 * was given by its path or cloned from another host. Only the first writable volume decides it: once the factory works on one, the
 * parameter is the person's, set with `nemia factory upgrade <factory> --set <name>=<value>`. Pure: the verb reads the host of the
 * volume's origin and whether the factory had a writable volume before, and files what this answers as the factory's parameters. Which
 * booleans the first writable volume sets, and to what, each once and nothing else, is held by the rows of
 * src/factory/volume/origin-params.test.ts, not here: as laws relating the parameters to the answer, the solver runs out of work on them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A parameter as a template declares it, as far as the rule goes: its type, and the host it follows, where it follows one, a bare
 * lower-case host as the template's check holds it.
 */
export type FollowedParameter = { readonly type: 'string' | 'number' | 'boolean'; readonly whenOrigin?: string };

/**
 * The volume added: whether it is the factory's first writable one (none was before it), and the host of the URL it was cloned from,
 * lower-cased; absent where it was given by its path (a folder of this machine, or a repository made in the store).
 */
export type VolumeOrigin = { readonly firstWritable: boolean; readonly originHost?: string };

const originParamsSpec = spec<(declared: Readonly<Record<string, FollowedParameter>>, volume: VolumeOrigin) => readonly string[]>({
  ensures: {
    nothingAfterTheFirst: {
      description: 'A volume added to a factory that already works on a writable one sets nothing: the parameter is the person’s by then',
      condition: ({ input: [, volume], output }) => volume.firstWritable || output.length === 0,
    },
  },
  open: true,
});

/** `originParams`' type, which src/factory/volume/origin-params.ts takes. */
export type OriginParams = Implementation<typeof originParamsSpec>;
