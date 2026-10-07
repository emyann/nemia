/**
 * An agent copied into a person's library from its file anywhere (`copyAgent`, `AGENTS_COPY`): the agent, the result schema its `output:`
 * names and every skill it gives that is not a place skill Nemia ships, with the record of where it came from (`copyRecordFile`), whose
 * one writer this is. A part the library already holds as it is, is reused; nothing is written into the folder copied from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tried } from '../runtime-client.ts';
import type { Command } from '../command/entry.verb.ts';
import { HOME } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { frontmatterKey } from '../former/former.ts';
import { writerSpec, writerText, yourSkillsDir, yoursOf } from '../yours/yours.ts';
import { agentDraftOf, agentNameRefusal, renderAgent, type AgentDraft } from '../agents/agents.ts';
import { writeAgent } from '../agents/agents.store.ts';
import { copyRecordFile, readCopyRecord, sourceSkills, sourceVersion, type CopyRecord } from '../agents/read.store.ts';
import { isShippedPlace, skillVersion } from '../skills/read.store.ts';
import { copySkill } from '../skills/skills.store.ts';

/** What `copyAgent` did: the agent's name in the library, the parts it wrote and those it reused, by name, and the record's file. */
export type AgentCopied = { name: string; copied: string[]; reused: string[]; record: string };

/** One part of a copy: what it is called in a refusal and `--keep`, whether the library holds it as it is, and how it is written. */
type Part = { part: string; same: boolean; kept: boolean; differs: string };

/** The agent file `file`, read as the library would hold it under `as`: its draft, the text it renders to, and its schema's file. */
type Source = { file: string; draft: AgentDraft; text: string; schema: { file: string; text: string } | null };

/** The fix of an agent file the copy does not read: the line deleted from a copy of the file, and that copy copied. */
const deleteFix = (file: string): string =>
  `To copy it all the same, copy ${file} somewhere of yours, delete that line there, and copy from that path: nemia agents copy <that path>.`;

/** The agent file `file`, read: refused as `Missing` where it is not there, and as `Invalid` where it is no agent the store would run. */
function readSource(file: string, as: string | undefined): Source {
  const at = path.resolve(file);
  if (!fs.lstatSync(at, { throwIfNoEntry: false })?.isFile())
    throw new Missing({
      message: `${at} is not there, or is not a file: name an agent's file. nemia agents sources lists the agents the store knows, by file.`,
    });
  if (!at.endsWith('.md')) throw new Invalid({ message: `${at} is not an agent's file: an agent is a <name>.md. Name one.` });
  const read = (f: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(path.dirname(at), f), 'utf8');
    } catch {
      return undefined;
    }
  };
  let draft: AgentDraft;
  try {
    draft = agentDraftOf(path.basename(at, '.md'), fs.readFileSync(at, 'utf8'), read);
  } catch (err) {
    throw new Invalid({ message: `${err instanceof Error ? err.message : String(err)} ${deleteFix(at)}` });
  }
  const named = agentNameRefusal(as);
  if (as !== undefined && named) throw new Invalid({ message: `--as ${as}: ${named}` });
  const renamed = { ...draft, name: as ?? draft.name };
  const text = renderAgent(renamed);
  const schemaFile = frontmatterKey(text, 'output');
  const schemaText = schemaFile === undefined ? undefined : read(schemaFile);
  return {
    file: at,
    draft: renamed,
    text,
    schema: schemaFile === undefined || schemaText === undefined ? null : { file: schemaFile, text: schemaText },
  };
}

/** The skills the agent of `source` gives, by name and the folder each is found in; a place skill Nemia ships is left out. */
function skillsOf(source: Source, home: string): Array<{ name: string; dir: string }> {
  const names = (source.draft.skills ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const found = sourceSkills(source.file, home);
  return names.flatMap((name) => {
    const dir = found.at.get(name);
    if (dir === undefined)
      throw new Missing({
        message: `${source.file} gives the skill ${name}, found in none of ${found.looked.join(', ')}: put it beside the agent, in <folder>/skills/${name}, and copy again.`,
      });
    if (typeof dir !== 'string') throw new Invalid({ message: `${dir.message} ${deleteFix(source.file)}` });
    return isShippedPlace(dir) ? [] : [{ name, dir }];
  });
}

/** Whether `file` holds `text` as it is; false for a file not there. */
const holds = (file: string, text: string): boolean => {
  try {
    return fs.readFileSync(file, 'utf8') === text;
  } catch {
    return false;
  }
};

/**
 * Each part of the copy of `source` into the library of `home`, judged: the agent, its schema and each skill, each the same as the
 * library's or not there, else differing, and the fix of each that differs.
 */
function partsOf(source: Source, skills: ReadonlyArray<{ name: string; dir: string }>, keep: readonly string[], home: string): Part[] {
  const agents = yoursOf('agents', home);
  const { name } = source.draft;
  const agentFile = path.join(agents, `${name}.md`);
  const parts: Part[] = [
    {
      part: `agents/${name}.md`,
      same: !fs.existsSync(agentFile) || holds(agentFile, source.text),
      kept: false,
      differs: `${agentFile} is another agent of that name: copy this one under a name of its own, --as <name>.`,
    },
  ];
  if (source.schema) {
    const there = path.join(agents, source.schema.file);
    parts.push({
      part: source.schema.file,
      same: !fs.existsSync(there) || holds(there, source.schema.text),
      kept: keep.includes(source.schema.file),
      differs: `${there} differs from the schema beside ${source.file}: keep the library's with --keep ${source.schema.file}.`,
    });
  }
  for (const skill of skills) {
    const there = path.join(yourSkillsDir(home), skill.name);
    parts.push({
      part: skill.name,
      same: !fs.existsSync(there) || skillVersion(there) === skillVersion(skill.dir),
      kept: keep.includes(skill.name),
      differs: `the skill ${skill.name} in ${there} differs from the one in ${skill.dir}: keep the library's with --keep ${skill.name}.`,
    });
  }
  return parts;
}

/**
 * The agent file `file` copied into the library of the store `home`, under `as` or its own name: the agent, the result schema its
 * `output:` names and each skill it gives that is not a place skill Nemia ships, then the record of the copy (`copyRecordFile`). A part the
 * library holds as it is, is reused, and written again by none.
 *
 * Judged whole before a byte is written: a file not there (`Missing`); one the store would not run, a key of another harness's agent
 * file it refuses among them, naming the line and its fix (`Invalid`); a skill found nowhere (`Missing`); a `--keep` naming no part of
 * the copy (`Invalid`); and every part the library holds otherwise, all named in one `Conflict` with its fix — `--as` for the agent,
 * `--keep` for a skill or the schema. A write that fails removes the skills this copy wrote.
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

/** The parts of a copy judged by `copyAgent` written, in order — skills, the agent, the record — and those written removed if one fails. */
function writeCopy(
  source: Source,
  skills: ReadonlyArray<{ name: string; dir: string }>,
  parts: readonly Part[],
  home: string,
): AgentCopied {
  const agents = yoursOf('agents', home);
  const { name } = source.draft;
  const copied: string[] = [];
  const made: string[] = [];
  try {
    for (const skill of skills) {
      if (fs.existsSync(path.join(yourSkillsDir(home), skill.name))) continue;
      made.push(copySkill(path.dirname(skill.dir), yourSkillsDir(home), skill.name, { anywhere: true }).dir);
      copied.push(skill.name);
    }
    const schema = source.schema && !fs.existsSync(path.join(agents, source.schema.file)) ? source.schema : null;
    if (!fs.existsSync(path.join(agents, `${name}.md`))) {
      writeAgent(agents, source.draft, { version: null, ...(schema && { schema }), anywhere: true });
      copied.push(...(schema ? [schema.file] : []), `agents/${name}.md`);
    } else if (schema) {
      fs.writeFileSync(path.join(agents, schema.file), schema.text);
      made.push(path.join(agents, schema.file));
      copied.push(schema.file);
    }
  } catch (err) {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  const record = writeRecord(home, name, source.file);
  return { name, copied, reused: parts.map((p) => p.part).filter((p) => !copied.includes(p)), record };
}

/** The record of the copy of `name` from `file` written, unless the one there already names that file at its version now. */
function writeRecord(home: string, name: string, file: string): string {
  const at = copyRecordFile(home, name);
  const version = sourceVersion(file, home) ?? '';
  const was = readCopyRecord(home, name);
  if (was?.source === file && was.version === version) return at;
  const record: CopyRecord = { source: file, version, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, `${JSON.stringify(record, null, 2)}\n`);
  return at;
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
  nemia: 'prompts',
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
