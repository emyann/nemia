/**
 * The skills read from disk: where a workflow's agents and skills are looked for beside its own folder (`lookupRoots`), each skill an
 * agent may give (`skillsFor`), its rules, its version, its card's entries and whether it is told whole. A store file at the bottom of the
 * tree beneath the controllers: it imports no other (`test/boundary.test.ts`), so the agents read (`agents/read.store.ts`), the
 * workflow folder read (`folder/folder.store.ts`) and the place (`place/place.store.ts`) all read through it.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema, SchemaIssue } from 'effect';
import { AGENTS_FOLDER, SKILLS_FOLDER, splitFrontmatter, WorkflowError } from '../step/step.ts';
import { frontmatterKey } from '../former/former.ts';
import { agentsDir } from '../folder/folder.ts';
import { ownSkill, type Agent, type SkillsFound } from '../agents/agents.ts';
import { skillEntryOf, type AgentSkill, type SkillRule } from './skills.ts';

/**
 * Where else a workflow's agents and skills are looked for, beside its own folder: the repository it runs on, whose `.claude/agents/` and
 * `.claude/skills/` are read, and the store (`WF_ROOT`), whose `workflows/agents/` and `workflows/skills/` are. With neither, a workflow
 * finds only what is beside it.
 */
export type Places = { repo?: string; home?: string };

/**
 * The folders a workflow's agents and skills are looked for in, each holding an `agents/` and a `skills/`, in the order a name is found:
 * the workflow's own root (the folder beside it, `agentsDir`'s parent), then the repository's `.claude/`, then the store's `workflows/`.
 * So the repository wins over the store, and a workflow of the store finds its own first. One folder is listed once.
 */
export function lookupRoots(workflowDir: string, places: Places = {}): string[] {
  const roots = [path.dirname(agentsDir(workflowDir))];
  if (places.repo) roots.push(path.join(path.resolve(places.repo), '.claude'));
  if (places.home) roots.push(path.join(path.resolve(places.home), 'workflows'));
  return [...new Set(roots)];
}

/**
 * Whether two of `roots` are one repository's two places — its `workflows/` and its `.claude/` — where a name in both is refused rather
 * than one of them chosen: a person reading either folder would take the one before them for the one that runs.
 */
export const sameRepository = (a: string, b: string): boolean =>
  path.dirname(a) === path.dirname(b) && [path.basename(a), path.basename(b)].sort().join() === '.claude,workflows';

/** The names in the folder `dir`, unsorted; none for a folder that is not there or cannot be read. */
export function entriesOf(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** The folder of the place skills the package ships (`place/<name>`), each a skill an agent may give where no root holds its name. */
export const PLACE_SKILLS = path.join(import.meta.dirname, '..', '..', 'place');

/** Whether the skill folder `dir` is a place skill the package ships (`PLACE_SKILLS`). */
export const isShippedPlace = (dir: string): boolean => path.dirname(path.resolve(dir)) === path.resolve(PLACE_SKILLS);

/** Whether `dir` holds a skill: a `SKILL.md` that is a file. */
const holdsSkill = (dir: string): boolean => fs.statSync(path.join(dir, 'SKILL.md'), { throwIfNoEntry: false })?.isFile() === true;

/** The names of the place skills the package ships: each folder of `PLACE_SKILLS` that holds a skill. */
const placeSkills = (): string[] => entriesOf(PLACE_SKILLS).filter((name) => holdsSkill(path.join(PLACE_SKILLS, name)));

/**
 * Every skill a workflow's agents may give (`lookupRoots`): each name, the folder it is — `<root>/skills/<name>`, holding a `SKILL.md` — or
 * the refusal of a name one repository has in both `workflows/skills/` and `.claude/skills/`. The first root that has a name wins, and a
 * place skill the package ships (`PLACE_SKILLS`) is found last, where no root has its name. The roots and the package's place folder are
 * named for the refusal of a name none has (`skillAt`).
 */
export function skillsFor(workflowDir: string, places: Places = {}): SkillsFound {
  const roots = lookupRoots(workflowDir, places);
  const looked = [...roots.map((root) => path.join(root, SKILLS_FOLDER)), PLACE_SKILLS];
  const found = new Map<string, { at: string; dir: string | WorkflowError }>();
  for (const root of roots) {
    const dir = path.join(root, SKILLS_FOLDER);
    for (const name of entriesOf(dir).sort()) {
      const at = path.join(dir, name);
      if (!holdsSkill(at)) continue;
      const first = found.get(name);
      if (!first) {
        found.set(name, { at: root, dir: rulesRefusal(at) ?? at });
        continue;
      }
      if (sameRepository(first.at, root)) {
        found.set(name, {
          at: first.at,
          dir: new WorkflowError(
            `${name} is a skill in both ${path.join(first.at, SKILLS_FOLDER, name)} and ${at}, one repository's two places for skills, and nothing says which a session is given. Keep one of them.`,
          ),
        });
      }
    }
  }
  for (const name of placeSkills().sort()) if (!found.has(name)) found.set(name, { at: PLACE_SKILLS, dir: path.join(PLACE_SKILLS, name) });
  return { at: new Map([...found].map(([name, { dir }]) => [name, dir])), looked };
}

/** The file beside a skill's SKILL.md that names its traceable rules (`readSkillRules`). */
export const RULES_FILE = 'rules.json';

const SkillRulesSchema = Schema.Struct({
  rules: Schema.Array(
    Schema.Struct({
      id: Schema.String.check(Schema.isMinLength(1)),
      says: Schema.String.check(Schema.isMinLength(1)),
      breaks: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1)),
    }),
  ).check(Schema.isMinLength(1)),
});

const RULES_SHAPE =
  'Write it as { "rules": [{ "id", "says", "breaks" }] }: an id once each, what the rule says, and the calls that break it, each a ' +
  '`disallowedTools:` rule such as `Bash(cat:*)` — or delete the file.';

/** Why a skill's rules do not read: the first field the schema refuses, by its path. */
function rulesFieldRefusal(error: Schema.SchemaError): string {
  const [first] = SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues;
  const at = (first?.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? p.key : p)).map(String);
  const field = at.length ? `\`${at.join('.')}\`` : 'shape';
  return first?.message === 'Missing key'
    ? `its ${field} is missing`
    : `its ${field} is wrong (${first?.message ?? "not a skill's rules"})`;
}

/**
 * The rules a skill declares in its `rules.json` (`RULES_FILE`) beside its SKILL.md, in the file's order; `[]` with no file. Refused with a
 * `WorkflowError` naming the file, its first wrong field and the shape to write: a file that is not JSON, a field missing or empty — a rule
 * with no `breaks` among them — and two rules under one `id`.
 */
export function readSkillRules(skillDir: string): SkillRule[] {
  const file = path.join(skillDir, RULES_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new WorkflowError(`${file} cannot be read (${(err as Error).message}). ${RULES_SHAPE}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new WorkflowError(`${file} is not JSON (${(err as Error).message}). ${RULES_SHAPE}`);
  }
  const decoded = Schema.decodeUnknownResult(SkillRulesSchema)(raw);
  if (Result.isFailure(decoded))
    throw new WorkflowError(`${file} does not read as a skill's rules: ${rulesFieldRefusal(decoded.failure)}. ${RULES_SHAPE}`);
  const rules = decoded.success.rules.map((r) => ({ id: r.id, says: r.says, breaks: [...r.breaks] }));
  rules.forEach((r, i) => {
    const before = rules.findIndex((other) => other.id === r.id);
    if (before !== i)
      throw new WorkflowError(`${file} names the rule \`${r.id}\` twice, at \`rules.${before}\` and \`rules.${i}\`. ${RULES_SHAPE}`);
  });
  return rules;
}

/** The refusal of a skill whose `rules.json` does not read (`readSkillRules`), or nothing for one whose does. */
function rulesRefusal(skillDir: string): WorkflowError | undefined {
  try {
    readSkillRules(skillDir);
    return undefined;
  } catch (err) {
    if (err instanceof WorkflowError) return err;
    throw err;
  }
}

/**
 * The version of the skill whose folder is `dir`: a digest of every file in it, as `agentVersion` counts the folder of each skill an agent
 * gives — so a write that moves this moves the version of every agent that gives the skill. Null for a folder with no SKILL.md. A write of
 * the skill carries it, and is refused when the skill's folder holds another (`writeSkill`).
 */
export function skillVersion(dir: string): string | null {
  if (!fs.lstatSync(path.join(dir, 'SKILL.md'), { throwIfNoEntry: false })) return null;
  return createHash('sha256')
    .update(JSON.stringify(folderForVersion(dir)))
    .digest('hex')
    .slice(0, 16);
}

/**
 * A file as a version counts it: a link as where it points, never what it points at, which is outside the folder and no write goes through.
 */
export function readForVersion(file: string): string | { unreadable: string } | { link: string } {
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) return { link: fs.readlinkSync(file) };
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { unreadable: (err as Error).message };
  }
}

/** Every file under a skill's folder, by its path in the folder, sorted, each as a version counts it. */
export function folderForVersion(dir: string): Array<[string, unknown]> {
  let entries: string[];
  try {
    entries = (fs.readdirSync(dir, { recursive: true }) as string[]).sort();
  } catch (err) {
    return [['', { unreadable: (err as Error).message }]];
  }
  return entries.flatMap((entry) => {
    const at = path.join(dir, entry);
    const stat = fs.lstatSync(at, { throwIfNoEntry: false });
    return stat?.isDirectory() ? [] : [[entry, readForVersion(at)] as [string, unknown]];
  });
}

/**
 * What an agent's card says it can do (`agentCard`): an entry for each skill its `skills:` gives, in that order, read off the skill's
 * SKILL.md (`skillEntryOf`) where `found` finds it — or, for an agent given none, one entry made from its own description (`ownSkill`).
 * Never a list written by hand, so the card cannot say what the skills do not.
 *
 * Refused, naming the fix: a skill found nowhere or that cannot be used, in `skillAt`'s words for the agent, and a SKILL.md whose
 * frontmatter the card cannot read. The card only describes — no run reads it — so nothing refuses a load or a run for it: it is refused
 * where a card is asked for (`nemia agents card`, the api's card route) and said on the board's agent page. `found` is where a start finds
 * skills (`skillsFor`, with the places), or a card could name a skill the run would not be given.
 */
export function cardSkills(agent: Pick<Agent, 'name' | 'description' | 'skills'>, found: SkillsFound): AgentSkill[] {
  if (!agent.skills?.length) return [ownSkill(agent)];
  const named = `${AGENTS_FOLDER}/${agent.name}.md`;
  return agent.skills.map((skill) => {
    const at = found.at.get(skill);
    if (at instanceof WorkflowError) throw new WorkflowError(`${named} gives the skill \`${skill}\`, which cannot be used — ${at.message}`);
    if (at === undefined) {
      throw new WorkflowError(
        `${named} gives the skill \`${skill}\`, and no skills folder has it — looked in ${found.looked.join(', ')}. A skill is a folder holding a SKILL.md: write skills/${skill}/SKILL.md beside ${AGENTS_FOLDER}/, or take \`${skill}\` off the agent's \`skills:\`.`,
      );
    }
    const file = path.join(at, 'SKILL.md');
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new WorkflowError(`${file} cannot be read (${(err as Error).message}), and ${named}'s card is read from it.`);
    }
    return skillEntryOf(file, skill, text);
  });
}

/**
 * Whether a skill asks to be told whole, in Claude Code's own prompt after the agent's instructions, rather than named for the session to
 * load: its SKILL.md's frontmatter says `preload: true`. Claude Code reads no such key (its own `preload` is inert on a plugin's skill), so
 * the run does it when it renders the agent (`writeAgentFiles`). False for a SKILL.md that cannot be read.
 */
export function preloads(skillDir: string): boolean {
  try {
    const { block } = splitFrontmatter('SKILL.md', fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'));
    return frontmatterKey(`---\n${block ?? ''}---\n`, 'preload') === 'true';
  } catch {
    return false;
  }
}
