/**
 * An agent copied into a person's library from its file anywhere (`copyAgent`, `AGENTS_COPY`): the agent, the result schema its `output:`
 * names and every skill it gives that is not a builtin place skill, with the record of where it came from (`writeCopyRecord`). It
 * judges the copy through its store (`copy.store.ts`) and writes it through the library's writers, the agent's (`writeAgent`) and a
 * skill's (`copySkill`), which no store may import. A part the library already holds as it is, is reused.
 */
import path from 'node:path';
import { tried } from '../runtime-client.ts';
import type { Command } from '../command/entry.verb.ts';
import { HOME } from '../record/record.store.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { writerSpec, writerText, yourSkillsDir, yoursOf } from '../yours/yours.ts';
import { writeAgent } from '../agents/agents.store.ts';
import { copySkill } from '../skills/skills.store.ts';
import {
  partsOf,
  readSource,
  removeWritten,
  skillsOf,
  writeCopyRecord,
  writeCopySchema,
  type Part,
  type Source,
  type SourceSkill,
} from './copy.store.ts';

/** What `copyAgent` did: the agent's name in the library, the parts it wrote and those it reused, by name, and the record's file. */
export type AgentCopied = { name: string; copied: string[]; reused: string[]; record: string };

/**
 * The agent file `file` copied into the library of the store `home`, under `as` or its own name: the agent, the result schema its
 * `output:` names and each skill it gives that is not a builtin place skill, then the record of the copy (`copyRecordFile`). A part the
 * library holds as it is, is reused, and written again by none.
 *
 * Judged whole before a byte is written: a file not there (`Missing`); one the store would not run, a key of another harness's agent
 * file it refuses among them, naming the line and its fix (`Invalid`); a skill found nowhere (`Missing`); a link where the agent or its
 * schema would be in the library (`Invalid`); a `--keep` naming no part of the copy (`Invalid`); and every part the library holds
 * otherwise, all named in one `Conflict` with its fix — `--as` for the agent, `--keep` for a skill or the schema. A write that fails
 * removes the skills, the schema and the agent this copy wrote.
 */
export function copyAgent({ file, as, keep = [], home = HOME }: { file: string; as?: string; keep?: readonly string[]; home?: string }) {
  const source = readSource(file, as);
  const skills = skillsOf(source, home);
  const parts = partsOf(source, skills, keep, home);
  const unknown = keep.filter((k) => !parts.slice(1).some((p) => p.part === k));
  if (unknown.length)
    throw new Invalid({
      message: `--keep ${unknown.join(', ')} names no skill nor schema of this copy: it keeps one of ${
        parts
          .slice(1)
          .map((p) => p.part)
          .join(', ') || 'none'
      }.`,
    });
  const differ = parts.filter((p) => !p.same && !p.kept);
  if (differ.length) throw new Conflict({ message: `nothing was copied: ${differ.map((p) => p.differs).join(' ')}` });
  return writeCopy(source, skills, parts, home);
}

/**
 * The parts of a copy judged by `copyAgent` written, in order — the skills, the agent with its schema through the library's writers, a
 * schema alone beside an agent the library holds, the record — and every file this copy wrote removed if one fails, the record's
 * write included. A part the library holds is not written, nor removed.
 */
function writeCopy(source: Source, skills: readonly SourceSkill[], parts: readonly Part[], home: string): AgentCopied {
  const { name } = source.draft;
  const held = (part: string): boolean => parts.some((p) => p.part === part && p.held);
  const copied: string[] = [];
  const made: string[] = [];
  try {
    for (const skill of skills) {
      if (held(skill.name)) continue;
      made.push(copySkill(path.dirname(skill.dir), yourSkillsDir(home), skill.name, { anywhere: true }).dir);
      copied.push(skill.name);
    }
    const schema = source.schema && !held(source.schema.file) ? source.schema : null;
    if (!held(`agents/${name}.md`)) {
      const wrote = writeAgent(yoursOf('agents', home), source.draft, { version: null, ...(schema && { schema }), anywhere: true });
      made.push(...wrote.written.map((f) => path.join(wrote.dir, f)));
      copied.push(...(schema ? [schema.file] : []), `agents/${name}.md`);
    } else if (schema) {
      made.push(writeCopySchema(home, schema));
      copied.push(schema.file);
    }
    const record = writeCopyRecord(home, name, source.file);
    return { name, copied, reused: parts.map((p) => p.part).filter((p) => !copied.includes(p)), record };
  } catch (err) {
    removeWritten(made);
    throw err;
  }
}

/** The words of a copy: what it wrote, what it reused, and how the agent is given to a step. */
const copiedLines = ({ name, copied, reused }: AgentCopied): string[] => [
  `${name} copied into your library${copied.length ? `: ${copied.join(', ')}` : ', which held it already'}`,
  ...(reused.length && copied.length ? [`reused as they were: ${reused.join(', ')}`] : []),
  `give it to a step: nemia factory hire <factory> ${name} --step <workflow>/<step>`,
];

/** `nemia agents copy`: an agent file copied into your library (`copyAgent`). */
export const AGENTS_COPY: Command<AgentCopied> = {
  name: 'agents copy',
  usage: '<file> [--as <name>] [--keep <part>]...',
  help: [
    'an agent file copied into your library, with its schema and skills;',
    'a part your library holds otherwise stops it: --as or --keep',
  ],
  spec: writerSpec(
    'agents copy',
    '<file> [--as <name>] [--keep <part>]...',
    [{ key: 'file', takes: 'required', kind: 'text' }],
    [
      {
        flag: '--as',
        kind: 'name',
        key: 'as',
        takes: '--as takes the name the agent has in your library: nemia agents copy <file> --as <name>',
      },
      {
        flag: '--keep',
        kind: 'name',
        key: 'keep',
        many: true,
        takes: "--keep takes a skill or a schema of the copy whose library's version stays: nemia agents copy <file> --keep <part>",
      },
    ],
  ),
  writes: true,
  class: 'ask',
  route: { method: 'POST', path: '/api/agents/yours/copy', status: 200 },
  handler: (args, _env, home = HOME) =>
    tried(() => {
      const as = writerText(args, 'as');
      const keep = args.keep;
      return copyAgent({
        file: writerText(args, 'file') ?? '',
        ...(as !== undefined && { as }),
        keep: Array.isArray(keep) ? keep.map(String) : [],
        home,
      });
    }),
  print: copiedLines,
};
