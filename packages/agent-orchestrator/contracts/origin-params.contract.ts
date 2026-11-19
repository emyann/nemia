/**
 * The parameters a templated factory's first writable volume sets (`originParams`, src/factory/volume/origin-params.ts): a boolean
 * parameter a template declares with `whenOrigin: <host>` is true where that volume was cloned from a URL on that host and false where it
 * was given by its path or cloned from another host. Only the first writable volume decides it: once the factory works on one, the
 * parameter is the person's, set with `nemia factory upgrade <factory> --set <name>=<value>`. Pure: the verb reads the host of the
 * volume's origin and whether the factory had a writable volume before, and files what this answers as the factory's parameters.
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

/** The `--set` word of a boolean parameter, `<name>=<true|false>`. */
const setOf = (name: string, value: boolean): string => `${name}=${String(value)}`;

/** Whether `p` is a boolean that follows a host. */
const follows = (p: FollowedParameter): boolean => p.type === 'boolean' && p.whenOrigin !== undefined;

const originParamsSpec = spec<(declared: Readonly<Record<string, FollowedParameter>>, volume: VolumeOrigin) => readonly string[]>({
  ensures: {
    nothingAfterTheFirst: {
      description: 'A volume added to a factory that already works on a writable one sets nothing: the parameter is the person’s by then',
      condition: ({ input: [, volume], output }) => volume.firstWritable || output.length === 0,
    },
    eachFollowerSetByItsHost: {
      description:
        'On the first writable volume, each boolean that follows a host is set: true where the volume was cloned from that host, false otherwise',
      condition: ({ input: [declared, volume], output }) =>
        !volume.firstWritable ||
        Object.entries(declared).every(([name, p]) => !follows(p) || output.includes(setOf(name, p.whenOrigin === volume.originHost))),
    },
    noOtherParameterTouched: {
      description: 'Nothing is set but the booleans that follow a host, each once: every other parameter stays as the factory holds it',
      condition: ({ input: [declared], output }) =>
        output.every((set) => {
          const name = set.slice(0, set.indexOf('='));
          const p = Object.hasOwn(declared, name) ? declared[name] : undefined;
          return p !== undefined && follows(p);
        }),
    },
    eachSetOnce: {
      description: 'Each parameter is set once at most: no two words of the answer name the same parameter',
      condition: ({ output }) =>
        output.every((set, i) => output.every((other, j) => i === j || !other.startsWith(set.slice(0, set.indexOf('=') + 1)))),
    },
  },
});

/** `originParams`' type, which src/factory/volume/origin-params.ts takes. */
export type OriginParams = Implementation<typeof originParamsSpec>;
