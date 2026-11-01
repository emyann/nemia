/**
 * `nemia template`, its forms entries of the command table, the command line's alone: `check`, which reads a template's folder or
 * archive and refuses every problem it has at once, each at its file and line; `export`, which writes a draft of one from a repository
 * and, with `--factory`, the factory's hires, instruction and rules; `pack`, which writes a checked folder into one archive, and `unpack`,
 * which writes an archive's folder back. Their handlers answer data, and the CLI prints it.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { leftOut, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { writerText as textOf } from '../yours/yours.ts';
import { instructionAt, type Factory } from '../factory/factory.ts';
import { instructionFile, readInstructionAt } from '../factory/instruction.store.ts';
import { factoriesDirAt } from '../factory/factory.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { FactoryDoor } from '../factories/factories.store.ts';
import { TemplateDoor } from '../templates/templates.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { TemplateSource } from './template.model.ts';
import {
  archiveAsked,
  checkedTree,
  exportTree,
  folderAsked,
  packOut,
  placeSkillNames,
  problemLine,
  type FactoryParts,
} from './template.store.ts';

export const TEMPLATE_HELP = `nemia template lint <folder|archive>
nemia template export <folder> --from <repo> [--factory <name>]
nemia template pack <folder> [--out <file>]
nemia template unpack <archive> <dir>

A factory template is a folder: nemia.yaml, its manifest, with the factory's hires; NEMIA.md, its instruction;
RULES.md, the rules its agents are told; workflows/<workflow>/workflow.yaml and each step's <step>.md;
agents/<agent>/agent.yaml, instructions.md and output.schema.json; skills/<skill>/SKILL.md and what is beside
it. Each .yaml holds one document, of apiVersion nemia.dev/v1alpha1.

  nemia template lint   reads the folder and refuses every problem at once, each at its file and line,
                 sorted by file: a file outside the layout, a document that does not parse, a wrong apiVersion,
                 kind or name, a hire, a skill, an after:, input: or loop: naming nothing the folder holds, a
                 {param:} nemia.yaml does not declare, a harness block's key, word or option its harness lacks
                 or the runtime sets itself, any block on an a2a: agent, and a git or url source, not yet read.
                 A folder with none prints that it passes, and the digest of its content. An archive is
                 checked as the folder it holds.
  nemia template export writes a new folder from the repository --from: each workflow of its workflows/ —
                 with --factory, only those the factory attaches, and its hires, instruction and rules — the
                 agents their steps name and the skills those agents and steps name, found where a run finds them;
                 a builtin place skill is left out. It prints each part and where it came from, and writes
                 nothing while a key has no place in a template, or the draft does not pass its own check.
  nemia template pack   writes a folder that passes its check into one archive, a gzipped tar of the folder
                 any tar opens (tar xzf), at --out, by default <name>-<version>.tgz here; it prints the
                 archive and the digest of its content: the sha256 of the tar inside, not of the .tgz
                 file, the same for the folder, its archive and the folder unpacked from it.
  nemia template unpack writes the folder an archive holds at <dir>/<name>, each file's bytes and mode
                 as packed, and prints it with the digest of its content. It runs no check: check it.

Refused, and nothing written: a folder that holds files already, or whose name is not lowercase words joined
by dashes; a --from with no workflows/, or not one of the factory's repositories; a factory not filed; a
workflow the factory attaches that --from lacks; a step filled both by its own agent: and a hire; a pack
whose --out is there already, or whose folder does not pass; an unpack whose <dir>/<name> holds files, or
whose archive holds an entry that is no file of the folder: a path that climbs out of it or is absolute, a
link, a device, an extended header, a second top folder, a path given twice. An archive repacked by hand
with such entries is refused: pack the folder with nemia template pack.`;

/** Why the api serves no template: a template is a folder on the machine nemia runs on. */
const HERE = { side: 'cli', why: 'a template is a folder on the machine nemia runs on; the board reads none yet' } as const;

/** `nemia template lint`'s spec: the folder or archive, and nothing else. */
const CHECK_SPEC: Spec = {
  positionals: [{ key: 'folder', takes: 'required', kind: 'text' }],
  flags: [],
  unknown: (arg) => `nemia template lint reads one folder or archive, and does not take ${arg}: nemia template lint <folder|archive>.`,
  missing: "nemia template lint takes a template's folder or archive: nemia template lint <folder|archive>.",
};

/** The line that says the digest of a template's content. */
const digestLine = (digest: string | undefined): string => `digest of the content: ${digest ?? 'none'}`;

/** The folder or archive `folder`, read through the Template door and checked: it passes with its digest, or every problem is refused. */
export const lintedTemplate = Effect.fn('templateLint')(function* (folder: string) {
  const read = yield* (yield* TemplateDoor).templates.read(TemplateSource.read(path.resolve(folder)));
  const { problems, digest } = checkedTree(read, placeSkillNames());
  if (problems.length)
    return yield* Effect.fail(
      new Invalid({
        message: `${folder} does not pass, with ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map(problemLine).join('\n')}`,
      }),
    );
  return { folder, digest };
});

/** `nemia template lint`: the folder or archive passes, with the digest of its content, or every problem it has, refused at once. */
const TEMPLATE_CHECK: Command<{ folder: string; digest: string | undefined }> = {
  name: 'template lint',
  usage: '<folder|archive>',
  help: ["check a template's folder or archive: every problem at once, each at its", 'file and line'],
  spec: CHECK_SPEC,
  check: (args) => leftOut(CHECK_SPEC, args),
  writes: false,
  class: 'read',
  only: HERE,
  manual: TEMPLATE_HELP,
  handler: (args, _env, home) => rooted(home, 'template lint', lintedTemplate(textOf(args, 'folder') ?? '')),
  print: ({ folder, digest }) => [`${folder} passes`, digestLine(digest)],
};

/** `--from <repo>`: the repository export reads. */
const FROM: Flag = {
  flag: '--from',
  kind: 'text',
  key: 'from',
  takes: 'nemia template export takes the repository to read: --from <repo>',
};

/** `--factory <name>`: the factory whose attached workflows, hires, instruction and rules the draft holds. */
const FACTORY: Flag = {
  flag: '--factory',
  kind: 'name',
  key: 'factory',
  takes: 'nemia template export --factory takes a factory: --factory <name>',
};

/** `nemia template export`'s spec: the folder to write, `--from`, and `--factory`. */
const EXPORT_SPEC: Spec = {
  positionals: [{ key: 'folder', takes: 'required', kind: 'text' }],
  flags: [FROM, FACTORY],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia template export does not take ${arg}: nemia template export <folder> --from <repo> [--factory <name>].`
      : `nemia template export writes one folder, and ${arg} is a second: nemia template export <folder> --from <repo>.`,
  missing: 'nemia template export takes the folder to write and the repository to read: nemia template export <folder> --from <repo>.',
};

/** What an export answers: the folder written, and where each part came from. */
type Exported = { dir: string; from: ReadonlyArray<{ part: string; from: string }> };

/** The instruction of `factory`, read where it keeps it, with the file it is read from. */
export function instructionOf(factory: Factory): { words: string | null; error: string | null; file: string } {
  const at = instructionAt(factory, instructionFile(factory.name));
  return { ...readInstructionAt(at), file: at.file };
}

/** The factory `name`'s parts an export holds, read through the Factory door: the factory, its file, its instruction and its rules. */
const factoryParts = Effect.fn('factoryParts')(function* (name: string) {
  const door = yield* FactoryDoor;
  const factory = yield* door.factories.read(FactoryName.read(name));
  const rules = yield* door.rules.read(FactoryName.read(name));
  const file = path.join(factoriesDirAt(yield* StoreRoot), `${name}.json`);
  return { factory, file, instruction: instructionOf(factory), rules } satisfies FactoryParts;
});

/** The template `nemia template export` asks for, made and checked (`exportTree`), then written through the Template door. */
export const exportedTemplate = Effect.fn('templateExport')(function* (dir: string, from: string, factory: string | undefined) {
  const parts = factory === undefined ? undefined : yield* factoryParts(factory);
  const tree = yield* tried(() => exportTree({ dir, from, factory: parts }, placeSkillNames()));
  yield* (yield* TemplateDoor).templates.create(TemplateSource.read(tree.dir), tree);
  return { dir: tree.dir, from: tree.from };
});

/** The folder `dir` read, checked and packed through the Template door at `out` (`packOut`): the archive and its digest. */
export const packedTemplate = Effect.fn('templatePack')(function* (dir: string, out: string | undefined, cwd: string) {
  const door = yield* TemplateDoor;
  const source = yield* tried(() => folderAsked(dir));
  const read = yield* door.templates.read(TemplateSource.read(source));
  const at = yield* tried(() => packOut({ dir, out, cwd }, checkedTree(read, placeSkillNames())));
  const written = yield* door.templates.pack(TemplateSource.read(at), read);
  return { out: written.source, digest: written.digest };
});

/** The archive `archive` read through the Template door and written as a folder at `<dir>/<name>`, checked by nothing but its name. */
export const unpackedTemplate = Effect.fn('templateUnpack')(function* (archive: string, dir: string) {
  const door = yield* TemplateDoor;
  const read = yield* door.templates.read(TemplateSource.read(yield* tried(() => archiveAsked(archive))));
  const at = yield* door.templates.create(TemplateSource.read(path.join(path.resolve(dir), read.name)), read);
  return { dir: at, digest: read.digest };
});

/** `nemia template export`: a draft written, each part and where it came from. */
const TEMPLATE_EXPORT: Command<Exported> = {
  name: 'template export',
  usage: '<folder> --from <repo> [--factory <name>]',
  help: ['write a template from a repository and a factory, and say where each', 'part came from'],
  spec: EXPORT_SPEC,
  check: (args) =>
    leftOut(EXPORT_SPEC, args) ??
    (textOf(args, 'from') === undefined ? 'nemia template export takes the repository to read: --from <repo>.' : null),
  writes: true,
  class: 'ask',
  only: HERE,
  manual: TEMPLATE_HELP,
  handler: (args, _env, home) =>
    rooted(home, 'template export', exportedTemplate(textOf(args, 'folder') ?? '', textOf(args, 'from') ?? '', textOf(args, 'factory'))),
  print: ({ dir, from }) => [
    ...from.map(({ part, from: at }) => `${part}  ${at}`),
    `written: ${dir}`,
    `lint it: nemia template lint ${dir}`,
  ],
};

/** `--out <file>`: the archive pack writes. */
const OUT: Flag = { flag: '--out', kind: 'text', key: 'out', takes: 'nemia template pack --out takes the archive to write: --out <file>' };

/** `nemia template pack`'s spec: the folder, and `--out`. */
const PACK_SPEC: Spec = {
  positionals: [{ key: 'folder', takes: 'required', kind: 'text' }],
  flags: [OUT],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia template pack does not take ${arg}: nemia template pack <folder> [--out <file>].`
      : `nemia template pack packs one folder, and ${arg} is a second: nemia template pack <folder> [--out <file>].`,
  missing: "nemia template pack takes a template's folder: nemia template pack <folder> [--out <file>].",
};

/** `nemia template pack`: the archive written, and the digest of its content. */
const TEMPLATE_PACK: Command<{ out: string; digest: string }> = {
  name: 'template pack',
  usage: '<folder> [--out <file>]',
  help: ["pack a template's folder that passes its check into one archive, and print", 'the digest of its content'],
  spec: PACK_SPEC,
  check: (args) => leftOut(PACK_SPEC, args),
  writes: true,
  class: 'ask',
  only: HERE,
  manual: TEMPLATE_HELP,
  handler: (args, _env, home) => rooted(home, 'template pack', packedTemplate(textOf(args, 'folder') ?? '', textOf(args, 'out'), process.cwd())),
  print: ({ out, digest }) => [`written: ${out}`, digestLine(digest)],
};

/** `nemia template unpack`'s spec: the archive, and the folder to write its template in. */
const UNPACK_SPEC: Spec = {
  positionals: [
    { key: 'archive', takes: 'required', kind: 'text' },
    { key: 'dir', takes: 'required', kind: 'text' },
  ],
  flags: [],
  unknown: (arg) => `nemia template unpack takes an archive and a folder, and does not take ${arg}: nemia template unpack <archive> <dir>.`,
  missing: 'nemia template unpack takes an archive and the folder to write it in: nemia template unpack <archive> <dir>.',
};

/** `nemia template unpack`: the folder written, the digest of its content, and how to check it. */
const TEMPLATE_UNPACK: Command<{ dir: string; digest: string | undefined }> = {
  name: 'template unpack',
  usage: '<archive> <dir>',
  help: ["write the folder a template's archive holds at <dir>/<name>, each file's", 'bytes and mode as packed'],
  spec: UNPACK_SPEC,
  check: (args) => leftOut(UNPACK_SPEC, args),
  writes: true,
  class: 'ask',
  only: HERE,
  manual: TEMPLATE_HELP,
  handler: (args, _env, home) => rooted(home, 'template unpack', unpackedTemplate(textOf(args, 'archive') ?? '', textOf(args, 'dir') ?? '')),
  print: ({ dir, digest }) => [`written: ${dir}`, digestLine(digest), `lint it: nemia template lint ${dir}`],
};

/** `nemia template`'s forms. */
export const TEMPLATES: readonly Command[] = [TEMPLATE_CHECK, TEMPLATE_EXPORT, TEMPLATE_PACK, TEMPLATE_UNPACK] as readonly Command[];
