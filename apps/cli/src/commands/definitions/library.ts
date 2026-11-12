/**
 * The writes of your library the client holds but the writers': `nemia agents rm` and `nemia workflows rm`, each at the `--version` it was
 * read at, printing the files the removal took (`status.removed`); and `nemia agents run`, a try of one of yours on a short brief, whose
 * run the daemon's next pass files. The place typed is the namespace asked (`namespaceOfPlace`): `yours`, `default`, where the api writes
 * alone, and refuses any other in its words.
 */
import { AGENTS_RM_WORDS, AGENTS_RUN_WORDS, WORKFLOWS_RM_WORDS, type Args } from 'objects';
import { asked } from '../../objects.ts';
import { namespaceOfPlace, said, textArg } from '../requests.ts';

/** The namespace, name and version a removal names. */
const removalOf = (args: Args) => {
  const version = textArg(args, 'version');
  return {
    params: { namespace: namespaceOfPlace(textArg(args, 'from'), undefined), name: textArg(args, 'name') ?? '' },
    query: version === undefined ? {} : { resourceVersion: version },
  };
};

/** The folder of a removal, and each file it took where the api says them (one older than this client does not). */
const removedLine = (dir: string, removed: readonly string[] | undefined): string =>
  removed === undefined ? dir : `${dir}: ${removed.join(', ')}`;

/** `nemia agents rm yours <name> --version <v>`'s runner: the agent removed, and the files it took. */
export async function agentsRm(args: Args): Promise<number> {
  const asking = removalOf(args);
  const { status } = await asked(AGENTS_RM_WORDS.name, (c) => c.agents.delete(asking));
  said([`removed from ${removedLine(status.dir, status.removed)}`]);
  return 0;
}

/** `nemia workflows rm yours <name> --version <v>`'s runner: the folder removed whole, and the files it held. */
export async function workflowsRm(args: Args): Promise<number> {
  const asking = removalOf(args);
  const { status } = await asked(WORKFLOWS_RM_WORDS.name, (c) => c.workflows.delete(asking));
  said([`removed ${removedLine(status.dir, status.removed)}`]);
  return 0;
}

/** `nemia agents run yours <name> --brief <words>`'s runner: the try started, and where to follow it. */
export async function agentsRun(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const namespace = namespaceOfPlace(textArg(args, 'from'), undefined);
  const brief = textArg(args, 'brief') ?? '';
  const { id } = await asked(AGENTS_RUN_WORDS.name, (c) => c.agents.try({ params: { namespace, name }, payload: { brief } }));
  said([`${id}  a try of ${name} started: nemia ls shows how it goes, and its page on the board`]);
  return 0;
}
