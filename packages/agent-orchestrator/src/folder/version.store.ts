/**
 * A workflow folder's version: what a write or a removal of the folder is checked against, so one made on a folder changed since it was
 * read is refused rather than made over what changed. The board lists it, and `nemia workflows write` and `remove` take it back.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { frontmatterKey } from '../former/former.ts';
import { AGENTS_FOLDER } from '../step/step.ts';
import type { SkillsFound } from '../agents/agents.ts';
import { agentVersion } from '../agents/read.store.ts';
import { lookupRoots, skillsFor, skillVersion, type Places } from '../skills/read.store.ts';

/**
 * The value a file's frontmatter gives `key`, as the parser reads it (`frontmatterKey`), so `  agent: coder` and `agent : coder` name the
 * agent they load with. None for a file with no such line, or whose frontmatter never closes; nor for an `agent` with a slash, which
 * names no file of agents/. A `skills` line is given whole: a skill named with its folder holds one (`apps/web:ds-build`).
 */
function frontmatterNamed(text: string, key: 'agent' | 'skills'): string[] {
  const value = frontmatterKey(text, key);
  return value && (key === 'skills' || !/[\\/]/.test(value)) ? [value] : [];
}

/** The skills a step file's own `skills:` line adds to its agent's, by name. None for a file with no such line. */
const addedSkillsIn = (text: string): string[] =>
  frontmatterNamed(text, 'skills').flatMap((line) =>
    line
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean),
  );

/** A skill a step adds, as a folder's version counts it: its folder's version where `found` has it (`skillVersion`), else missing. */
function addedSkillVersion(skill: string, found: SkillsFound): [string, string | null | { missing: string }] {
  const at = found.at.get(skill);
  return [`skills/${skill}`, typeof at === 'string' ? skillVersion(at) : { missing: skill }];
}

/** Each `.md` and `.json` directly in `dir`, sorted by name, with what it holds or why it does not read. None for a folder not there. */
function filesOf(dir: string): Array<readonly [string, string | { unreadable: string }]> {
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.isDirectory() && /\.(md|json)$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    names = [];
  }
  const read = (file: string): string | { unreadable: string } => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      return { unreadable: err instanceof Error ? err.message : String(err) };
    }
  };
  return names.map((name) => [name, read(path.join(dir, name))] as const);
}

/**
 * What a folder's files hold, as one word: a digest of each `.md` and `.json` directly in it — its steps, its README and its schemas, what
 * a save writes, removes or reads — by name, with what it holds. Hidden ones too: the package reads a `.draft.md` as a step and
 * `writeWorkflow` removes it when the steps saved do not have it, and an `output:` may name a hidden schema. Any of them edited, added or
 * removed changes it, and nothing else does: a note beside the steps, or a folder inside, is no step. A file that cannot be read counts as
 * what it says, so it changes the word too. So does each agent a step names (`agent:`), as the package versions it (`agentVersion`): its
 * file, where the load finds it (`lookupRoots`), each file it names beside it and each skill folder its `skills:` gives. So does each skill
 * a step's own `skills:` adds to its agent's, its folder where the load finds it (`skillVersion`).
 */
export function workflowVersion(dir: string, places: Places): string {
  const files = filesOf(dir);
  const texts = files.flatMap(([, text]) => (typeof text === 'string' ? [text] : []));
  const named = [...new Set(texts.flatMap((text) => frontmatterNamed(text, 'agent')))].sort();
  const added = [...new Set(texts.flatMap(addedSkillsIn))].sort();
  const skills = named.length || added.length ? skillsFor(dir, places) : undefined;
  const agents = named.map((agent) => {
    const root = lookupRoots(dir, places).find((at) =>
      fs.lstatSync(path.join(at, AGENTS_FOLDER, `${agent}.md`), { throwIfNoEntry: false }),
    );
    return [
      agent,
      root === undefined ? { missing: agent } : { at: root, version: agentVersion(path.join(root, AGENTS_FOLDER), agent, skills) },
    ];
  });
  return createHash('sha256')
    .update(JSON.stringify([...files, ...agents, ...(skills === undefined ? [] : added.map((skill) => addedSkillVersion(skill, skills)))]))
    .digest('hex')
    .slice(0, 16);
}
