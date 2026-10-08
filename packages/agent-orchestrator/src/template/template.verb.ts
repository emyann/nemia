/**
 * `nemia template`, its two forms entries of the command table, the command line's alone: `check`, which reads a template's folder and
 * refuses every problem it has at once, each at its file and line, and `export`, which writes a draft of one from a repository and,
 * with `--factory`, the factory's hires and instruction. Their handlers answer data, and the CLI prints it.
 */
import { tried } from '../runtime-client.ts';
import { leftOut, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { writerText as textOf } from '../yours/yours.ts';
import { instructionAt, type Factory } from '../factory/factory.ts';
import { instructionFile, readInstructionAt } from '../factory/instruction.store.ts';
import { checkTemplateAt, exportTemplate, problemLine } from './template.store.ts';

export const TEMPLATE_HELP = `nemia template check <folder>
nemia template export <folder> --from <repo> [--factory <name>]

A factory template is a folder: nemia.yaml, its manifest, with the factory's hires; NEMIA.md, its instruction;
workflows/<workflow>/workflow.yaml and each step's <step>.md; agents/<agent>/agent.yaml, instructions.md and
output.schema.json; skills/<skill>/SKILL.md and what is beside it. Each .yaml holds one document, of
apiVersion nemia.dev/v1alpha1.

  nemia template check  reads the folder and refuses every problem at once, each at its file and line,
                 sorted by file: a file outside the layout, a document that does not parse, a wrong apiVersion,
                 kind or name, a hire, a skill, an after:, input: or loop: naming nothing the folder holds, a
                 {param:} nemia.yaml does not declare, a harness block's key, word or option its harness lacks
                 or the runtime sets itself, any block on an a2a: agent, and a git or url source, not yet read.
                 A folder with none prints that it passes.
  nemia template export writes a new folder from the repository --from: each workflow of its workflows/ —
                 with --factory, only those the factory attaches, and its hires and instruction — the agents
                 their steps name and the skills those agents and steps name, found where a run finds them;
                 a place skill nemia ships is left out. It prints each part and where it came from, and writes
                 nothing while a key has no place in a template, or the draft does not pass its own check.

Refused, and nothing written: a folder that holds files already, or whose name is not lowercase words joined
by dashes; a --from with no workflows/, or not one of the factory's repositories; a factory not filed; a
workflow the factory attaches that --from lacks; a step filled both by its own agent: and a hire.`;

/** Why the api serves no template: a template is a folder on the machine nemia runs on. */
const HERE = { side: 'cli', why: 'a template is a folder on the machine nemia runs on; the board reads none yet' } as const;

/** `nemia template check`'s spec: the folder, and nothing else. */
const CHECK_SPEC: Spec = {
  positionals: [{ key: 'folder', takes: 'required', kind: 'text' }],
  flags: [],
  unknown: (arg) => `nemia template check reads one folder, and does not take ${arg}: nemia template check <folder>.`,
  missing: "nemia template check takes a template's folder: nemia template check <folder>.",
};

/** `nemia template check`: the folder passes, or every problem it has, refused at once. */
const TEMPLATE_CHECK: Command<{ folder: string }> = {
  name: 'template check',
  usage: '<folder>',
  help: ["check a template's folder: every problem at once, each at its file and line"],
  spec: CHECK_SPEC,
  check: (args) => leftOut(CHECK_SPEC, args),
  writes: false,
  nemia: 'read',
  only: HERE,
  manual: TEMPLATE_HELP,
  handler: (args) =>
    tried(() => {
      const folder = textOf(args, 'folder') ?? '';
      const problems = checkTemplateAt(folder);
      if (problems.length)
        throw new Invalid({
          message: `${folder} does not pass, with ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map(problemLine).join('\n')}`,
        });
      return { folder };
    }),
  print: ({ folder }) => [`${folder} passes`],
};

/** `--from <repo>`: the repository export reads. */
const FROM: Flag = {
  flag: '--from',
  kind: 'text',
  key: 'from',
  takes: 'nemia template export takes the repository to read: --from <repo>',
};

/** `--factory <name>`: the factory whose attached workflows, hires and instruction the draft holds. */
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

/** The factory named under `--factory`, if one is, with how its instruction is read. */
const factoryAsked = (name: string | undefined) => (name === undefined ? undefined : { name, instruction: instructionOf });

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
  nemia: 'prompts',
  only: HERE,
  manual: TEMPLATE_HELP,
  handler: (args) =>
    tried(() =>
      exportTemplate({
        dir: textOf(args, 'folder') ?? '',
        from: textOf(args, 'from') ?? '',
        factory: factoryAsked(textOf(args, 'factory')),
      }),
    ),
  print: ({ dir, from }) => [
    ...from.map(({ part, from: at }) => `${part}  ${at}`),
    `written: ${dir}`,
    `check it: nemia template check ${dir}`,
  ],
};

/** `nemia template`'s forms. */
export const TEMPLATES: readonly Command[] = [TEMPLATE_CHECK, TEMPLATE_EXPORT] as readonly Command[];
