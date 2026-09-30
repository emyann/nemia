/**
 * `wf factory`: the store's factories listed, filed and removed — its help, its flags, read off the command line, and what each prints.
 */
import { addFactory, factoriesDir, factoryLines, readFactories, removeFactory } from '../../runner.ts';
import { readFlags, usage } from '../flags.ts';

export const FACTORY_HELP = `wf factory [ls]
wf factory add <name> --repo <path> [--repo <path> ...]
wf factory rm <name>

A factory is a named grouping in the store: \${WF_ROOT:-~/.agent-workflows}/factories/, one <name>.json per
factory, naming the repositories its work is on:

    { "repos": ["/home/me/code/app"] }

  wf factory     lists the default factory first — every run and card that names no factory; it is no file,
                 and is read, never written — then each factory by name with its repositories. A file that
                 does not read as a factory is listed with why.
  wf factory add files a factory: its name a lowercase slug (letters, digits, dashes; 40 at most), and one
                 --repo at least, each a directory, written as an absolute path and named once. Git is not asked.
  wf factory rm  removes a factory's file, one that does not read included.

Refused by name, and nothing written: a name that is not a slug, the name default, an add with no --repo or
with a --repo that is not a directory, an add of a name already filed, and an rm of a name with no factory.`;

/** `wf factory add`'s flags, after the name: `--repo <path>`, once per repository. */
export function factoryAddHow(argv: string[]): { repos: string[] } {
  const { values } = readFlags(argv, {
    takes: { '--repo': "a repository's directory: wf factory add <name> --repo <path> [--repo <path> ...]" },
    repeats: ['--repo'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf factory add does not take ${arg}. It takes the factory's name, then --repo <path>, once per repository.`
        : `wf factory add files one factory, and ${arg} is a second: wf factory add <name> --repo <path>, once per factory.`,
    twice: () => 'wf factory add takes --repo once per repository.',
  });
  return { repos: values['--repo'] ?? [] };
}

/** `wf factory ls`: the default factory, then each in the store. */
function factoryList(args: string[]): void {
  if (args.length) usage(`wf factory ls takes nothing, and was given ${args[0]}: wf factory ls lists every factory.`);
  for (const line of factoryLines(readFactories())) console.log(line);
  console.log(`\nfile one: wf factory add <name> --repo <path> — remove one: wf factory rm <name> — in ${factoriesDir()}`);
}

/** `wf factory add`: one factory filed, and where. */
function factoryAdd(args: string[]): void {
  const [name, ...more] = args;
  if (name === undefined || name.startsWith('--'))
    usage("wf factory add takes the factory's name, first: wf factory add <name> --repo <path> [--repo <path> ...]. Nothing was filed.");
  const { factory, file } = addFactory({ name, repos: factoryAddHow(more).repos });
  console.log(`${factory.name}  ${factory.repos.join(', ')}`);
  console.log(`filed: ${file}`);
}

/** `wf factory rm`: one factory's file removed. */
function factoryRm(args: string[]): void {
  const [name, ...more] = args;
  if (name === undefined || name.startsWith('--'))
    usage('wf factory rm takes the name of the factory to remove, as wf factory ls lists it: wf factory rm <name>.');
  if (more.length) usage(`wf factory rm removes one factory, and ${more[0]} is a second: wf factory rm <name>, once per factory.`);
  const { file } = removeFactory(name);
  console.log(`${name}  removed — ${file}`);
}

/** `wf factory` and its subcommands `ls` (the bare verb too), `add` and `rm`; anything else is refused, naming the three. */
export function factoryVerb(rest: string[]): void {
  const [sub, ...args] = rest;
  if (sub === '--help') return console.log(FACTORY_HELP);
  if (sub === undefined || sub === 'ls') return factoryList(args);
  if (sub === 'add') return factoryAdd(args);
  if (sub === 'rm') return factoryRm(args);
  return usage(
    `wf factory does not take ${sub}. It lists the factories — wf factory ls — files one with wf factory add <name> --repo <path>, and removes one with wf factory rm <name> (wf factory --help).`,
  );
}
