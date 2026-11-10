/**
 * An agent copied into a person's library from its file anywhere (`copyAgent`, `AGENTS_COPY`): the agent, the result schema its `output:`
 * names and every skill it gives that is not a builtin place skill, with the record of where it came from (`writeCopyRecord`). It
 * judges the copy through its store (`copy.store.ts`) and writes it through the library's doors, the Agent door's write and the Skill
 * door's copy, each checked there as any write is. A part the library already holds as it is, is reused.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Command } from '../command/entry.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { rooted } from '../factory/wiring/wire.verb.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { AgentCopy } from 'objects';
import { writerSpec, yourSkillsDir, yoursOf } from '../yours/yours.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import {
  partsOf,
  readSource,
  removeWritten,
  skillsOf,
  writeCopyRecord,
  writeCopySchema,
  type Part,
  type SkillJudged,
  type Source,
  type SourceSkill,
} from './copy.store.ts';
import type { DefinitionThere } from '../agents/agents.ts';

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
export const copyAgent = Effect.fn('copyAgent')(function* ({
  file,
  as,
  keep = [],
  home,
}: {
  file: string;
  as?: string;
  keep?: readonly string[];
  home: string;
}) {
  const judged = yield* judgedCopy(file, as, keep, home);
  return yield* writeCopy(judged.source, judged.skills, judged.parts, home);
});

/** A skill's version where the Skill door holds one at `name` in the folder of skills `at`, else null. */
const heldVersion = (there: DefinitionThere): string | null => (there.kind === 'held' ? there.version : null);

/**
 * The copy judged whole before a byte is written (`copyAgent`): its source, its skills and its parts, or the refusal of it. Each skill is
 * judged by what the Skill door holds at its name in the library and at the folder it is copied from.
 */
const judgedCopy = Effect.fnUntraced(function* (file: string, as: string | undefined, keep: readonly string[], home: string) {
  const { source, skills } = yield* tried(() => {
    const read = readSource(file, as);
    return { source: read, skills: skillsOf(read, home) };
  });
  const door = (yield* SkillDoor).skills;
  const judged: SkillJudged[] = [];
  for (const skill of skills)
    judged.push({
      ...skill,
      library: yield* door.there(SkillName.read(skill.name), yourSkillsDir(home)),
      source: heldVersion(yield* door.there(SkillName.read(path.basename(skill.dir)), path.dirname(skill.dir))),
    });
  return yield* tried(() => {
    const parts = partsOf(source, judged, keep, home);
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
    return { source, skills, parts };
  });
});

/**
 * The parts of a copy judged by `copyAgent` written, in order — the skills through the Skill door, the agent with its schema through the
 * Agent door, a schema alone beside an agent the library holds, the record — and every file this copy wrote removed if one fails, the
 * record's write included. A part the library holds is not written, nor removed.
 */
const writeCopy = (source: Source, skills: readonly SourceSkill[], parts: readonly Part[], home: string) =>
  Effect.gen(function* () {
    const { name } = source.draft;
    const held = (part: string): boolean => parts.some((p) => p.part === part && p.held);
    const copied: string[] = [];
    const made: string[] = [];
    const { skills: skillDoor } = yield* SkillDoor;
    const { agents } = yield* AgentDoor;
    const write = Effect.gen(function* () {
      for (const skill of skills) {
        if (held(skill.name)) continue;
        const one = yield* skillDoor.copy(SkillName.read(skill.name), path.dirname(skill.dir), yourSkillsDir(home), { anywhere: true });
        made.push(one.dir);
        copied.push(skill.name);
      }
      const schema = source.schema && !held(source.schema.file) ? source.schema : null;
      if (!held(`agents/${name}.md`)) {
        const wrote = yield* agents.write(AgentName.read(name), source.draft, undefined, {
          dir: yoursOf('agents', home),
          anywhere: true,
          ...(schema && { schema }),
        });
        made.push(...wrote.written.map((f) => path.join(wrote.dir, f)));
        copied.push(...(schema ? [schema.file] : []), `agents/${name}.md`);
      } else if (schema) {
        made.push(yield* tried(() => writeCopySchema(home, schema)));
        copied.push(schema.file);
      }
      const record = yield* tried(() => writeCopyRecord(home, name, source.file));
      return { name, copied, reused: parts.map((p) => p.part).filter((p) => !copied.includes(p)), record };
    });
    return yield* write.pipe(Effect.tapCause(() => Effect.sync(() => removeWritten(made))));
  });

/** The words of a copy: what it wrote, what it reused, and how the agent is given to a step. */
const copiedLines = ({ name, copied, reused }: AgentCopied): string[] => [
  `${name} copied into your library${copied.length ? `: ${copied.join(', ')}` : ', which held it already'}`,
  ...(reused.length && copied.length ? [`reused as they were: ${reused.join(', ')}`] : []),
  `give it to a step: nemia factory hire <factory> ${name} --step <workflow>/<step>`,
];

/**
 * `nemia agents copy`: an agent file copied into your library (`copyAgent`). Its handler takes objects' `AgentCopy`, the body of
 * `POST /api/namespaces/default/agents/copy`, which the api calls it by: `file`, `as` and `keep`, as the command line's flags spell them.
 */
export const AGENTS_COPY: Command<AgentCopied, AgentCopy> = {
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
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `copy` verb of `objects`' Api (`/api/namespaces/:namespace/agents/copy`), which calls this entry's handler: no route of its own",
  },
  input: AgentCopy,
  handler: ({ file, as, keep = [] }, _env, home) =>
    rooted(
      home,
      'nemia agents copy',
      Effect.gen(function* () {
        return yield* copyAgent({ file, ...(as !== undefined && { as }), keep: [...keep], home: yield* StoreRoot });
      }),
    ),
  print: copiedLines,
};
