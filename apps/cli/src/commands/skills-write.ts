/**
 * `nemia skills write (yours | factory) [<name>] --file <SKILL.md> [--factory <f>] [--version <v>]`: the SKILL.md read here, read into
 * the skill's spec by the api (`skills.read`, which writes nothing), the skill named by its `name:`, else by its folder; refused, exit
 * 2, where a skill named to change (`<name>`) is not the file's. Then made in `default` (`skills.create`) with no `--version`, else
 * written at it (`skills.replace`). On `factory`, the same object is proposed to the factory (`proposalMade`).
 */
import path from 'node:path';
import { type Args, SKILLS_WRITE_WORDS } from 'objects';
import { asked } from '../objects.ts';
import { proposalMade } from '../objects/propose.ts';
import { Refused } from '../refused.ts';
import { textOf } from './files.ts';
import { namespaceOf, pathArg, placeOf, textArg, writtenLine } from './written.ts';

const { name: COMMAND, usage: USAGE } = SKILLS_WRITE_WORDS;

/** `nemia skills write`'s runner, on the words parsed against its words. */
export async function skillsWrite(args: Args): Promise<number> {
  const place = placeOf(args, COMMAND, USAGE);
  const file = pathArg(args, 'file', COMMAND, USAGE, "the skill's SKILL.md to write");
  const version = textArg(args, 'version');
  const text = textOf(file, COMMAND);
  const folder = path.basename(path.dirname(path.resolve(file)));
  const drafted = await asked(COMMAND, (c) => c.skills.read({ payload: { name: folder, files: [{ path: path.basename(file), text }] } }));
  const name = drafted.metadata.name;
  const changing = textArg(args, 'name');
  if (changing !== undefined && changing !== name)
    throw new Refused(
      `nemia ${COMMAND} was asked to change ${changing}, and ${path.resolve(file)} is the skill ${name}: name the skill it is, \`nemia ${COMMAND} ${textArg(args, 'from') ?? 'yours'} ${name} --file ${file}\``,
    );
  const namespace = namespaceOf(place);
  const { spec } = drafted;
  if (place.kind === 'factory')
    return proposalMade(COMMAND, namespace, {
      objects: [
        {
          apiVersion: 'nemia/v1',
          kind: 'Skill',
          metadata: { name, namespace, ...(version !== undefined ? { resourceVersion: version } : {}) },
          spec,
        },
      ],
    });
  const written = await asked(COMMAND, (c) =>
    version === undefined
      ? c.skills.create({ params: { namespace }, payload: { metadata: { name }, spec } })
      : c.skills.replace({ params: { namespace, name }, payload: { metadata: { resourceVersion: version }, spec } }),
  );
  process.stdout.write(writtenLine('skills', written.metadata.name, version === undefined, written.metadata.resourceVersion));
  return 0;
}
