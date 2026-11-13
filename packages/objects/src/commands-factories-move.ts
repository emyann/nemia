/**
 * The words of `nemia factory move`: a factory read whole from the store one context names and filed on the store another names, its
 * repositories cloned there and its volumes judged there, its cards following it or staying. The client asks the two daemons, each by its
 * own context; neither is asked to write the other. Pure.
 */
import type { Args, CommandWords, Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';
import { MOVE_CARDS } from './factory-move.ts';

/** The command line `nemia factory move` takes. */
export const MOVE_USAGE =
  '<name> --to <context> [--from <context>] [--repo <source>=<url|path> ...] [--volume <name>=<path> ...] [--cards follow|stay]';

/** `nemia factory move`'s spec: the factory, the contexts, a `--repo` and a `--volume` each as often as needed, and `--cards`. */
const MOVE_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    {
      flag: '--to',
      kind: 'name',
      key: 'to',
      takes: '--to takes the context of the store the factory moves to, as nemia config get-contexts lists it: --to <context>',
      twice: 'take --to once: a factory moves to one store.',
    },
    {
      flag: '--from',
      kind: 'name',
      key: 'from',
      takes: '--from takes the context of the store the factory is in, as nemia config get-contexts lists it: --from <context>',
      twice: 'take --from once: a factory moves from one store.',
    },
    {
      flag: '--repo',
      kind: 'text',
      key: 'repos',
      many: true,
      takes:
        "--repo takes a repository's path on the source and what the target is given for it, a git URL or a folder of its machine by its whole path: --repo <source>=<url|path>",
    },
    {
      flag: '--volume',
      kind: 'text',
      key: 'volumes',
      many: true,
      takes: "--volume takes a volume's name (its path on the source where it has none) and its path on the target: --volume <name>=<path>",
    },
    {
      flag: '--cards',
      kind: 'name',
      key: 'cards',
      takes: "--cards takes follow, the factory's unstarted cards filed on the target, or stay, left on the source: --cards follow|stay",
      twice: 'take --cards once: the cards follow the factory or stay.',
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory move does not take ${arg}. It takes the factory, --to <context>, --from <context>, --repo <source>=<url|path> and --volume <name>=<path> as often as needed, and --cards follow|stay.`
      : `nemia factory move moves one factory, and ${arg} is a second: nemia factory move <name> --to <context>, once per factory.`,
  missing: 'nemia factory move takes the factory to move, as nemia factory ls lists it: nemia factory move <name> --to <context>.',
};

/** The values of a many flag, as the parser collected them. */
const valuesOf = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};

/** The refusal of a `--repo` or `--volume` value with no `=`, or with nothing on either side of it; null where each holds one. */
const unpaired = (values: readonly string[], flag: string, form: string): string | null => {
  const bad = values.find((v) => v.indexOf('=') <= 0 || v.indexOf('=') === v.length - 1);
  return bad === undefined ? null : `${flag} takes ${form}, and ${bad} is not one: ${flag} ${form}`;
};

/** What `nemia factory move` refuses of what was typed, before any daemon is asked; null where it takes it. */
function moveRefused(args: Args): string | null {
  const left = leftOut(MOVE_SPEC, args);
  if (left !== null) return left;
  const to = args['to'];
  if (typeof to !== 'string')
    return 'nemia factory move takes the context of the store to move to: nemia factory move <name> --to <context> (nemia config get-contexts lists them).';
  if (args['from'] === to)
    return `nemia factory move takes two stores, and --from and --to both name ${to}: give --to the context of the other store (nemia config get-contexts).`;
  const cards = args['cards'];
  if (cards !== undefined && !MOVE_CARDS.some((word) => word === cards))
    return `--cards takes follow or stay, and ${String(cards)} is neither: --cards follow|stay.`;
  return (
    unpaired(valuesOf(args, 'repos'), '--repo', '<source>=<url|path>') ?? unpaired(valuesOf(args, 'volumes'), '--volume', '<name>=<path>')
  );
}

/** `nemia factory move`: a factory read whole from one context's store and filed on another's, never trusted there. */
export const FACTORY_MOVE_WORDS = {
  name: 'factory move',
  served: [{ endpoint: 'factories.import' }, { endpoint: 'factories.export', as: 'factory_export' }],
  usage: MOVE_USAGE,
  help: [
    "move a factory to the store another context names: its file, its tree's",
    'edits and its unstarted cards; its repositories cloned there, left',
    'untrusted; the source kept until nemia factory rm',
  ],
  spec: MOVE_SPEC,
  check: moveRefused,
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: {
    side: 'cli',
    why: "it asks two daemons, each by its context: the api serves its halves as the Factory's `export` and `import` of `objects`' Api",
  },
} as const satisfies CommandWords;
