/**
 * The agents read from disk, and a person's custom instructions for them: every agent a workflow's steps may name (`agentsFor`), the
 * agents of one folder (`loadAgents`), an agent's version, where the file of a person's custom instructions is in their store, with
 * its words or the refusal of them, and the record of an agent copied into their library (`readCopyRecord`) with where its source's
 * skills are found (`sourceSkills`). A store file one level above the bottom of the tree beneath the controllers: of the store it imports
 * only the skill reads (`skills/read.store.ts`, `test/boundary.test.ts`), so the workflow folder read (`folder/folder.store.ts`) and the
 * one writer of custom instructions (`custom.store.ts`) both read through it.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { AGENTS_FOLDER, WorkflowError } from '../step/step.ts';
import { frontmatterKey } from '../former/former.ts';
import { linkRefusal, stepFiles } from '../folder/folder.ts';
import {
  CUSTOM_INSTRUCTIONS_FOLDER,
  customInstructionsRefusal,
  isCardFile,
  parseAgent,
  type Agent,
  type Agents,
  type SkillsFound,
} from './agents.ts';
import { folderForVersion, lookupRoots, readForVersion, sameRepository, skillsFor, type Places } from '../skills/read.store.ts';

/** The file of a person's custom instructions for the agent `name`, in the store `home`: `<home>/custom-instructions/<name>.md`. */
export const customInstructionsFile = (home: string, name: string): string =>
  path.join(path.resolve(home), CUSTOM_INSTRUCTIONS_FOLDER, `${name}.md`);

/** The file of the record of the agent `name` copied into the library of the store `home`: `<home>/agent-sources/<name>.json`. */
export const copyRecordFile = (home: string, name: string): string => path.join(path.resolve(home), 'agent-sources', `${name}.json`);

/** What `copyRecordFile` holds: the agent file it was copied from, the version that file was at then (`agentVersion`), and when. */
const CopyRecordSchema = Schema.Struct({ source: Schema.String, version: Schema.String, at: Schema.String });

/** The record of an agent copied into the library (`copyRecordFile`). */
export type CopyRecord = typeof CopyRecordSchema.Type;

/**
 * The record of the agent `name` copied into the library of the store `home`, or null for one never copied. A file that is not JSON or not
 * a record is said on stderr, naming it, and read as none: it stops no listing.
 */
export function readCopyRecord(home: string, name: string): CopyRecord | null {
  const file = copyRecordFile(home, name);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  const decoded = Schema.decodeUnknownResult(CopyRecordSchema)(raw);
  if (Result.isSuccess(decoded)) return decoded.success;
  process.stderr.write(`${file} does not read as the record of a copy, { source, version, at }: read as none. Copy the agent again.\n`);
  return null;
}

/**
 * Where the skills of the agent file `file` are found, as a start beside it finds them (`skillsFor`): its folder's own root, then the
 * repository it is in — the one whose places for agents (`lookupRoots`) its `agents/` is in — then the store `home`'s.
 */
export function sourceSkills(file: string, home: string): SkillsFound {
  const holder = path.dirname(path.dirname(path.resolve(file)));
  const repo = path.dirname(holder);
  const inRepo = repositoryRoots(repo).includes(holder);
  return skillsFor(path.join(holder, '_'), { ...(inRepo && { repo }), home });
}

/** The places of the repository `repo` that hold agents and skills, as a start on it looks (`lookupRoots`): its own, then its harness's. */
export const repositoryRoots = (repo: string): string[] =>
  lookupRoots(path.join(path.resolve(repo), 'workflows', '_'), { repo: path.resolve(repo) });

/** The version of the agent file `file` now (`agentVersion`), its skills found as `sourceSkills` finds them; null for a file not there. */
export const sourceVersion = (file: string, home: string): string | null =>
  agentVersion(path.dirname(path.resolve(file)), path.basename(file, '.md'), sourceSkills(file, home));

/** Why `file`, the custom instructions of the agent `name`, is refused when it is there but no file nor link, and the fix: the clear. */
export const notAFileRefusal = (file: string, name: string): string =>
  `${file} is not a file: custom instructions are one file per agent. Remove it: nemia agents custom ${name} --clear.`;

/**
 * A person's custom instructions for the agent `name`, read from the store `home` (`customInstructionsFile`): the words, or `undefined`
 * when there are none or the file is blank. Refused as a `WorkflowError` naming the file and the fix: a link, whose words would change
 * with what it points at, anything else not a file (`notAFileRefusal`), and a frontmatter block (`customInstructionsRefusal`).
 */
export function readCustomInstructions(home: string, name: string): string | undefined {
  const file = customInstructionsFile(home, name);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (stat.isSymbolicLink())
    throw new WorkflowError(
      linkRefusal(file, `custom instructions are a person's own words: read through a link, they would change with what it points at.`),
    );
  if (!stat.isFile()) throw new WorkflowError(notAFileRefusal(file, name));
  const text = fs.readFileSync(file, 'utf8');
  const refused = customInstructionsRefusal(file, text);
  if (refused !== undefined) throw new WorkflowError(`${refused} Or remove them: nemia agents custom ${name} --clear.`);
  return text.trim() || undefined;
}

/** `agent` with the person's custom instructions for it from the store `home`, or the refusal of them (`readCustomInstructions`). */
function withCustom(agent: Agent | WorkflowError, name: string, home: string | undefined): Agent | WorkflowError {
  if (home === undefined || agent instanceof Error) return agent;
  try {
    const customInstructions = readCustomInstructions(home, name);
    return customInstructions === undefined ? agent : { ...agent, customInstructions };
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return err;
  }
}

/**
 * Every agent a workflow's steps may name (`lookupRoots`), each read or the refusal of it, as `loadAgents` reads one folder: the first root
 * that has a name wins, and a name one repository has in both `workflows/agents/` and `.claude/agents/` is refused, naming both. Each is
 * given the person's custom instructions for its name from the store (`places.home`, `readCustomInstructions`), whichever place it is in.
 */
export function agentsFor(workflowDir: string, places: Places = {}): Agents {
  const found = new Map<string, { at: string; agent: Agent | WorkflowError }>();
  for (const root of lookupRoots(workflowDir, places)) {
    const dir = path.join(root, AGENTS_FOLDER);
    for (const [name, agent] of loadAgents(dir)) {
      const first = found.get(name);
      if (!first) {
        found.set(name, { at: root, agent });
        continue;
      }
      if (sameRepository(first.at, root)) {
        found.set(name, {
          at: first.at,
          agent: new WorkflowError(
            `${name} is an agent in both ${path.join(first.at, AGENTS_FOLDER, `${name}.md`)} and ${path.join(dir, `${name}.md`)}, one repository's two places for agents, and nothing says which runs. Keep one of them.`,
          ),
        });
      }
    }
  }
  return new Map([...found].map(([name, { agent }]) => [name, withCustom(agent, name, places.home)]));
}

/**
 * The agents in `dir` — a workflow's are in `agentsDir(<workflow>)` — by name: every `.md` but a README, each read (`parseAgent`) or the
 * refusal of it, which is thrown only at a step that names it, so a broken agent stops no workflow that does not use it. A file that is a
 * link is refused by name: an agent's file is its own, as a step's is. None for a folder that is not there.
 */
export function loadAgents(dir: string): Map<string, Agent | WorkflowError> {
  const agents = new Map<string, Agent | WorkflowError>();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }
  const read = (file: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(dir, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  for (const file of stepFiles(entries.map((e) => e.name))) {
    const name = path.basename(file, '.md');
    const at = path.join(dir, file);
    try {
      if (entries.find((e) => e.name === file)?.isSymbolicLink()) {
        throw new WorkflowError(
          linkRefusal(
            at,
            `an agent's file is its own: read through a link, what every step naming ${AGENTS_FOLDER}/${file} is told would be whatever the link points at, outside the folder, and would change with it.`,
          ),
        );
      }
      agents.set(name, parseAgent(name, fs.readFileSync(at, 'utf8'), read));
    } catch (err) {
      if (!(err instanceof WorkflowError)) throw err;
      agents.set(name, err);
    }
  }
  return agents;
}

/**
 * What an agent's files hold, as one word, or `null` for an agent that is not there: a digest of `<name>.md`, of the file it names beside
 * it — the schema its `output:` names — and of each skill its `skills:` gives, every file of the skill's
 * folder, each by name with what it holds, so a file that cannot be read counts as what it says. A write of the agent carries it, and is
 * refused when the agent's files hold another (`writeAgent`), rather than written over what changed since it was read. The api's
 * `versionOf` digests a folder's agents through this, so an edit of a skill moves the folder's version too — and so does its card, which is
 * read off those skills' SKILL.md files (`cardSkills`).
 *
 * `skills` are where the skills are found (`skillsFor`); without them, in the `skills/` beside `dir`. A skill found nowhere counts as
 * missing.
 */
export function agentVersion(dir: string, name: string, skills?: SkillsFound): string | null {
  const at = path.join(dir, `${name}.md`);
  if (!fs.lstatSync(at, { throwIfNoEntry: false })) return null;
  const text = readForVersion(at);
  const beside = typeof text === 'string' ? [frontmatterKey(text, 'output') ?? []].flat() : [];
  const given = typeof text === 'string' ? skillNamesIn(text) : [];
  const found = skills ?? skillsFor(path.join(path.dirname(path.resolve(dir)), '_'));
  const files = [
    [`${name}.md`, text],
    ...beside.map((file) => [file, readForVersion(path.resolve(dir, file))]),
    ...given.map((skill) => {
      const folder = found.at.get(skill);
      return [`skills/${skill}`, typeof folder === 'string' ? folderForVersion(folder) : { missing: skill }];
    }),
  ];
  return createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
}

/**
 * The skills an agent's text gives by name, as `parseAgent` reads its `skills:` line — none for a line that names a card file, which it
 * refuses.
 */
export function skillNamesIn(text: string): string[] {
  const line = frontmatterKey(text, 'skills');
  if (line === undefined || isCardFile(line)) return [];
  return line
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
