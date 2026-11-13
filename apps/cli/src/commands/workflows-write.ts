/**
 * `nemia workflows write (yours | factory) <name> --folder <draft> [--factory <f>] [--version <v>]`: the draft folder's own files read
 * here (`folderFiles`), read into the workflow's spec by the api (`workflows.read`, which writes nothing; on `factory`, read for the
 * factory, `?factory=`, so a step it hires an agent into reads as a run there reads it), then written in `default`:
 * made (`workflows.create`) with no `--version`, else written whole at it (`workflows.replace`), its files merged first over the ones the
 * workflow has now (`workflows.get`), so a file the draft does not carry is left, as its help says. On `factory`, the same object is
 * proposed to the factory (`proposalMade`).
 */
import { type Args, WORKFLOWS_WRITE_WORDS, type WorkflowFile, type WorkflowSpec } from 'objects';
import { asked } from '../objects.ts';
import { proposalMade } from '../objects/propose.ts';
import { folderFiles } from './files.ts';
import { namespaceOf, pathArg, placeOf, textArg, writtenLine } from './written.ts';

const { name: COMMAND, usage: USAGE } = WORKFLOWS_WRITE_WORDS;

/** `files` with each of `over` in place of the one at its path, the rest kept, sorted by path. */
const merged = (files: readonly WorkflowFile[], over: readonly WorkflowFile[]): WorkflowFile[] => {
  const byPath = new Map(files.map((file) => [file.path, file] as const));
  for (const file of over) byPath.set(file.path, file);
  return [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
};

/** `nemia workflows write`'s runner, on the words parsed against its words. */
export async function workflowsWrite(args: Args): Promise<number> {
  const place = placeOf(args, COMMAND, USAGE);
  const name = textArg(args, 'name') ?? '';
  const folder = pathArg(args, 'folder', COMMAND, USAGE, 'the draft folder whose steps and README to write');
  const version = textArg(args, 'version');
  const files = folderFiles(folder, COMMAND);
  const namespace = namespaceOf(place);
  const query = place.kind === 'factory' ? { factory: namespace } : {};
  const { spec: drafted } = await asked(COMMAND, (c) => c.workflows.read({ query, payload: { name, files } }));
  const spec: WorkflowSpec =
    version === undefined
      ? drafted
      : {
          ...drafted,
          files: merged(
            (await asked(COMMAND, (c) => c.workflows.get({ params: { namespace, name }, query: {} }))).spec.files ?? [],
            drafted.files ?? [],
          ),
        };
  if (place.kind === 'factory')
    return proposalMade(COMMAND, namespace, {
      objects: [
        {
          apiVersion: 'nemia/v1',
          kind: 'Workflow',
          metadata: { name, namespace, ...(version !== undefined ? { resourceVersion: version } : {}) },
          spec,
        },
      ],
    });
  const written = await asked(COMMAND, (c) =>
    version === undefined
      ? c.workflows.create({ params: { namespace }, payload: { metadata: { name }, spec } })
      : c.workflows.replace({ params: { namespace, name }, payload: { metadata: { resourceVersion: version }, spec } }),
  );
  process.stdout.write(writtenLine('workflows', written.metadata.name, version === undefined, written.metadata.resourceVersion));
  return 0;
}
