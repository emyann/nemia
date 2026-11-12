/**
 * `nemia agents write (yours | factory) [<name>] --file <name>.md [--factory <f>] [--version <v>]`: the agent's file and the `*.json`
 * files beside it read here (`agentFiles`), read into the agent's spec by the api (`agents.read`, which writes nothing, and refuses a
 * result schema its `output:` names that was not sent), named by the file; then made in `default` (`agents.create`) with no
 * `--version`, else written at it (`agents.replace`) at `<name>`, renamed where the file names another. On `factory`, the same object
 * is proposed to the factory (`proposalMade`).
 */
import { AGENTS_WRITE_WORDS, type Args } from 'objects';
import { asked } from '../objects.ts';
import { proposalMade } from '../objects/propose.ts';
import { agentFiles } from './files.ts';
import { namespaceOf, pathArg, placeOf, textArg, writtenLine } from './written.ts';

const { name: COMMAND, usage: USAGE } = AGENTS_WRITE_WORDS;

/** `nemia agents write`'s runner, on the words parsed against its words. */
export async function agentsWrite(args: Args): Promise<number> {
  const place = placeOf(args, COMMAND, USAGE);
  const file = pathArg(args, 'file', COMMAND, USAGE, "the agent's file to write, named <name>.md");
  const version = textArg(args, 'version');
  const files = agentFiles(file, COMMAND);
  const drafted = await asked(COMMAND, (c) => c.agents.read({ payload: { files } }));
  const named = drafted.metadata.name;
  const target = textArg(args, 'name') ?? named;
  const namespace = namespaceOf(place);
  const { spec } = drafted;
  if (place.kind === 'factory')
    return proposalMade(COMMAND, namespace, {
      objects: [
        {
          apiVersion: 'nemia/v1',
          kind: 'Agent',
          metadata: { name: target, namespace, ...(version !== undefined ? { resourceVersion: version } : {}) },
          spec,
        },
      ],
    });
  const written = await asked(COMMAND, (c) =>
    version === undefined
      ? c.agents.create({ params: { namespace }, payload: { metadata: { name: target }, spec } })
      : c.agents.replace({ params: { namespace, name: target }, payload: { metadata: { name: named, resourceVersion: version }, spec } }),
  );
  process.stdout.write(writtenLine('agents', written.metadata.name, version === undefined, written.metadata.resourceVersion));
  return 0;
}
