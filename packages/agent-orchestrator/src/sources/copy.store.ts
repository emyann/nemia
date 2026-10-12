/**
 * The I/O of an agent copied into a person's library that the library's two writers do not do: the agent file read (`readSource`), the
 * skills it gives found (`skillsOf`), each part judged against the library (`partsOf`), the schema written beside an agent the library
 * holds (`writeCopySchema`), what a failed copy wrote removed (`removeWritten`), and the record of the copy (`copyRecordFile`), whose
 * one writer this is (`writeCopyRecord`). Nothing is written into the folder copied from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { frontmatterKey } from '../former/former.ts';
import { linkRefusal } from '../folder/folder.ts';
import { givenSkillOf } from '../keys/index.ts';
import { yourSkillsDir, yoursOf } from '../yours/yours.ts';
import { agentDraftOf, agentNameRefusal, renderAgent, type AgentDraft } from '../agents/agents.ts';
import { copyRecordFile, readCopyRecord, sourceSkills, sourceVersion, type CopyRecord } from '../agents/read.store.ts';
import { isShippedPlace, skillVersion } from '../skills/read.store.ts';

/**
 * One part of a copy: what it is called in a refusal and `--keep`, whether the library holds a file at its place, whether it holds it as
 * it is or holds none, whether `--keep` keeps the library's, and how it differs.
 */
export type Part = { part: string; held: boolean; same: boolean; kept: boolean; differs: string };

/** The agent file `file`, read as the library would hold it under `as`: its draft, the text it renders to, and its schema's file. */
export type Source = { file: string; draft: AgentDraft; text: string; schema: { file: string; text: string } | null };

/** A skill an agent gives: its name, and the folder it is found in. */
export type SourceSkill = { name: string; dir: string };

/** The fix of an agent file the copy does not read: the line deleted from a copy of the file, and that copy copied. */
const deleteFix = (file: string): string =>
  `To copy it all the same, copy ${file} somewhere of yours, delete that line there, and copy from that path: nemia agents copy <that path>.`;

/** The agent file `file`, read: refused as `Missing` where it is not there, and as `Invalid` where it is no agent the store would run. */
export function readSource(file: string, as: string | undefined): Source {
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

/**
 * The skills the agent of `source` gives, by name and the folder each is found in; a place skill Nemia ships is left out, and so is one
 * named with its folder (`givenSkillOf`), a repository's own, which the agent names and the library never holds.
 */
export function skillsOf(source: Source, home: string): SourceSkill[] {
  const names = (source.draft.skills ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const found = sourceSkills(source.file, home);
  return names.flatMap((name) => {
    if (givenSkillOf(name)?.folder !== undefined) return [];
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
 * The library's file `file`, an agent's own, `whose` it is: whether a file is there. Refused as `Invalid`, in `writeAgent`'s words,
 * where it is a link, dangling or not: a write follows a link, out of the library.
 */
function heldOwn(file: string, whose: string): boolean {
  const there = fs.lstatSync(file, { throwIfNoEntry: false });
  if (there?.isSymbolicLink())
    throw new Invalid({
      message: linkRefusal(
        file,
        `${whose} is its own: a write follows a link, and would write into whatever it points at, outside the folder.`,
      ),
    });
  return there !== undefined;
}

/**
 * Each part of the copy of `source` into the library of `home`, judged: the agent, its schema and each skill, each the same as the
 * library's or not there, else differing, and the fix of each that differs. A link where the agent or its schema would be is refused.
 */
export function partsOf(source: Source, skills: readonly SourceSkill[], keep: readonly string[], home: string): Part[] {
  const agents = yoursOf('agents', home);
  const { name } = source.draft;
  const agentFile = path.join(agents, `${name}.md`);
  const agentHeld = heldOwn(agentFile, "an agent's file");
  const parts: Part[] = [
    {
      part: `agents/${name}.md`,
      held: agentHeld,
      same: !agentHeld || holds(agentFile, source.text),
      kept: false,
      differs: `${agentFile} is another agent of that name: copy this one under a name of its own, --as <name>.`,
    },
  ];
  if (source.schema) {
    const there = path.join(agents, source.schema.file);
    const held = heldOwn(there, "an agent's result schema");
    parts.push({
      part: source.schema.file,
      held,
      same: !held || holds(there, source.schema.text),
      kept: keep.includes(source.schema.file),
      differs: `${there} differs from the schema beside ${source.file}: keep the library's with --keep ${source.schema.file}.`,
    });
  }
  for (const skill of skills) {
    const there = path.join(yourSkillsDir(home), skill.name);
    const held = fs.existsSync(there);
    parts.push({
      part: skill.name,
      held,
      same: !held || skillVersion(there) === skillVersion(skill.dir),
      kept: keep.includes(skill.name),
      differs: `the skill ${skill.name} in ${there} differs from the one in ${skill.dir}: keep the library's with --keep ${skill.name}.`,
    });
  }
  return parts;
}

/** The result schema `schema` written into the library's agents of `home`, beside an agent it holds already; the file written. */
export function writeCopySchema(home: string, schema: { file: string; text: string }): string {
  const file = path.join(yoursOf('agents', home), schema.file);
  fs.writeFileSync(file, schema.text);
  return file;
}

/** Each of `paths` a failed copy wrote, removed, a folder with all it holds. */
export function removeWritten(paths: readonly string[]): void {
  for (const at of paths) fs.rmSync(at, { recursive: true, force: true });
}

/** The record of the copy of `name` from `file` written, unless the one there already names that file at its version now; its file. */
export function writeCopyRecord(home: string, name: string, file: string): string {
  const at = copyRecordFile(home, name);
  const version = sourceVersion(file, home) ?? '';
  const was = readCopyRecord(home, name);
  if (was?.source === file && was.version === version) return at;
  const record: CopyRecord = { source: file, version, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, `${JSON.stringify(record, null, 2)}\n`);
  return at;
}
