/**
 * The words of `nemia factory home`: a person's own session opened in a factory's home, rendered on their machine as a run renders it,
 * read-only, with a repository of theirs added beside it. The client asks the api for the home and starts the session itself. Pure.
 */
import type { Args, CommandWords, Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** The command line `nemia factory home` takes. */
export const HOME_USAGE = '<factory> [<repo>] [--claude-md on|off]';

/** Whether the repository's memory files load in the session: off, as a volume's switch is, unless turned on. */
export const HOME_CLAUDE_MD = ['on', 'off'] as const;

/** `nemia factory home`'s spec: the factory, the repository where one is given, and `--claude-md`. */
const HOME_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'repo', takes: 'optional', kind: 'text' },
  ],
  flags: [
    {
      flag: '--claude-md',
      kind: 'name',
      key: 'claudeMd',
      takes: "--claude-md takes on, the repository's CLAUDE.md loaded beside the home's, or off, the default: --claude-md on|off",
      twice: 'take --claude-md once: it is on or off.',
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory home does not take ${arg}. It takes the factory, the repository to add beside it, and --claude-md on|off: nemia factory home ${HOME_USAGE}.`
      : `nemia factory home takes one factory and one repository, and ${arg} is a third: nemia factory home ${HOME_USAGE}.`,
  missing: `nemia factory home takes the factory whose home to open, as nemia factory ls lists it: nemia factory home ${HOME_USAGE}.`,
};

/** What `nemia factory home` refuses of what was typed, before the api is asked; null where it takes it. */
function homeRefused(args: Args) {
  const left = leftOut(HOME_SPEC, args);
  if (left !== null) return left;
  const claudeMd = args['claudeMd'];
  if (claudeMd !== undefined && !HOME_CLAUDE_MD.some((word) => word === claudeMd))
    return `--claude-md takes on or off, and ${String(claudeMd)} is neither: --claude-md on|off.`;
  return null;
}

/** `nemia factory home`: a person's own session in a factory's home, rendered read-only on their machine, a repository added beside it. */
export const FACTORY_HOME_WORDS = {
  name: 'factory home',
  served: [{ endpoint: 'factories.home' }],
  usage: HOME_USAGE,
  help: [
    "open your own session in a factory's home, as a step's starts:",
    'its CLAUDE.md, skills and settings, rendered read-only on this',
    'machine, the repository (this folder by default) added beside it',
  ],
  spec: HOME_SPEC,
  check: homeRefused,
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "it starts a session on the person's machine: the api serves the home it renders as the Factory's `home` of `objects`' Api",
  },
} as const satisfies CommandWords;
