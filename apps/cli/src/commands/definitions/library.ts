/**
 * The writes of the store's library the client holds but the writers': `nemia agents rm` and `nemia workflows rm`, each at the
 * `--version` it was read at, printing the files the removal took (`status.removed`); and `nemia agents run`, a try of one of the user
 * library on a short brief, whose run the daemon's next pass files. The place typed is `user`, the library, in no namespace: any other is
 * refused, exit 2, naming the command.
 */
import { AGENTS_RM_WORDS, AGENTS_RUN_WORDS, WORKFLOWS_RM_WORDS, type Args } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { said, textArg } from '../requests.ts';

/** The name `args` names in the user library; refused, naming `command` typed with `user`, for any other place. */
const libraryNamed = (args: Args, command: string) => {
  const from = textArg(args, 'from');
  const name = textArg(args, 'name') ?? '';
  if (from === 'user') return name;
  throw new Refused(`nemia ${command} reaches the user library alone, not ${from ?? 'nothing'}: nemia ${command} user ${name || '<name>'}`);
};

/** The name and version a removal names. */
const removalOf = (args: Args, command: string) => {
  const version = textArg(args, 'version');
  return {
    params: { name: libraryNamed(args, command) },
    query: version === undefined ? {} : { resourceVersion: version },
  };
};

/** The folder of a removal, and each file it took where the api says them (one older than this client does not). */
const removedLine = (dir: string, removed: readonly string[] | undefined) =>
  removed === undefined ? dir : `${dir}: ${removed.join(', ')}`;

/**
 * `nemia agents rm user <name> --version <v>`'s runner: the agent removed, and the files it took.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function agentsRm(args: Args) {
  const asking = removalOf(args, AGENTS_RM_WORDS.name);
  const { status } = await asked(AGENTS_RM_WORDS.name, (c) => c.agents.deleteLibrary(asking));
  said([`removed from ${removedLine(status.dir, status.removed)}`]);
  return 0;
}

/**
 * `nemia workflows rm user <name> --version <v>`'s runner: the folder removed whole, and the files it held.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function workflowsRm(args: Args) {
  const asking = removalOf(args, WORKFLOWS_RM_WORDS.name);
  const { status } = await asked(WORKFLOWS_RM_WORDS.name, (c) => c.workflows.deleteLibrary(asking));
  said([`removed ${removedLine(status.dir, status.removed)}`]);
  return 0;
}

/**
 * `nemia agents run user <name> --brief <words>`'s runner: the try started, and where to follow it.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function agentsRun(args: Args) {
  const name = libraryNamed(args, AGENTS_RUN_WORDS.name);
  const brief = textArg(args, 'brief') ?? '';
  const { id } = await asked(AGENTS_RUN_WORDS.name, (c) => c.agents.tryLibrary({ params: { name }, payload: { brief } }));
  said([`${id}  a try of ${name} started: nemia ls shows how it goes, and its page on the board`]);
  return 0;
}
