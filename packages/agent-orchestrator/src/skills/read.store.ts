/**
 * The skill reads from disk: where a workflow's agents and skills are looked for beside its own folder (`lookupRoots`), each skill an
 * agent may give (`skillsFor`), its rules, its version, its card's entries and whether it is told whole. And the one rule for a link in a
 * skill's folder, which every reader asks (`skillFiles`): a skill of a checkout's own skills (`REPOSITORY_HOLDER`) is read through a
 * link that stays inside the checkout's folder, by real path, and any other link, there or in any other folder of skills, is refused by
 * name (`skillLinkRefusal`), never opened; a skill is copied as its files, never a link (`copySkillFiles`). A store file at the bottom
 * of the tree beneath the controllers: it imports no other (`test/boundary.test.ts`), so the agents read (`agents/read.store.ts`), the
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
import { givenSkillOf, type GivenSkill } from '../keys/index.ts';
import { skillEntryOf, type AgentSkill, type SkillRule } from './skills.ts';

/**
 * Where else a workflow's agents and skills are looked for, beside its own folder: the repository it runs on, whose `.claude/agents/` and
 * `.claude/skills/` are read, and the store (`WF_ROOT`), whose `workflows/agents/` and `workflows/skills/` are. With neither, a workflow
 * finds only what is beside it.
 */
export type Places = { repo?: string; home?: string };

/** The folder of a repository that holds its own `agents/` and `skills/`, which a session there reads too. */
const REPOSITORY_HOLDER = '.claude';

/**
 * The folders a workflow's agents and skills are looked for in, each holding an `agents/` and a `skills/`, in the order a name is found:
 * the workflow's own root (the folder beside it, `agentsDir`'s parent), then the repository's `.claude/`, then the store's `workflows/`.
 * So the repository wins over the store, and a workflow of the store finds its own first. One folder is listed once.
 */
export function lookupRoots(workflowDir: string, places: Places = {}): string[] {
  const roots = [path.dirname(agentsDir(workflowDir))];
  if (places.repo) roots.push(path.join(path.resolve(places.repo), REPOSITORY_HOLDER));
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

/** The folder of the package's builtin place skills (`place/<name>`), each a skill an agent may give where no root holds its name. */
export const PLACE_SKILLS = path.join(import.meta.dirname, '..', '..', 'place');

/**
 * The folder of Nemia's builtin skills, built into the package (`skills/`), which the board offers to copy into a person's library:
 * none while the package has no such folder, which reads as no skill (`skillFolders`), never as a refusal.
 */
export const BUILTIN_SKILLS = path.join(import.meta.dirname, '..', '..', SKILLS_FOLDER);

/** Whether the skill folder `dir` is a builtin place skill of the package (`PLACE_SKILLS`). */
export const isBuiltinPlace = (dir: string): boolean => path.dirname(path.resolve(dir)) === path.resolve(PLACE_SKILLS);

/** Whether `dir` holds a skill: a `SKILL.md` that is a file. */
const holdsSkill = (dir: string): boolean => fs.statSync(path.join(dir, 'SKILL.md'), { throwIfNoEntry: false })?.isFile() === true;

/** The names of the package's builtin place skills: each folder of `PLACE_SKILLS` that holds a skill. */
const placeSkills = (): string[] => entriesOf(PLACE_SKILLS).filter((name) => holdsSkill(path.join(PLACE_SKILLS, name)));

/** Whether the folders `a` and `b` are one folder by real path; false where either cannot be reached. */
export function oneFolder(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * The refusal of the skill `name` found in the root `first` and again in `root`, where the two are one repository's two places for skills
 * (`sameRepository`) and two folders; nothing for two roots of different places, where the first wins, and for one folder under both.
 */
function inBoth(name: string, first: string, root: string): WorkflowError | undefined {
  const [before, at] = [first, root].map((r) => path.join(r, SKILLS_FOLDER, name));
  if (!sameRepository(first, root) || oneFolder(before, at)) return undefined;
  return new WorkflowError(
    `${name} is a skill in both ${before} and ${at}, one repository's two places for skills, and nothing says which a session is given. Keep one of them.`,
  );
}

/** The skills of the roots `roots`, by bare name, each the folder it is or its refusal, a builtin place skill found last. */
function rootSkills(roots: readonly string[]): Map<string, string | WorkflowError> {
  const found = new Map<string, { at: string; dir: string | WorkflowError }>();
  for (const root of roots) {
    const dir = path.join(root, SKILLS_FOLDER);
    for (const name of entriesOf(dir).sort()) {
      const at = path.join(dir, name);
      if (!holdsSkill(at)) continue;
      const first = found.get(name);
      if (!first) {
        found.set(name, { at: root, dir: skillLinkRefusal(at) ?? rulesRefusal(at) ?? at });
        continue;
      }
      const twice = inBoth(name, first.at, root);
      if (twice) found.set(name, { at: first.at, dir: twice });
    }
  }
  for (const name of placeSkills().sort()) {
    const at = path.join(PLACE_SKILLS, name);
    if (!found.has(name)) found.set(name, { at: PLACE_SKILLS, dir: skillLinkRefusal(at) ?? at });
  }
  return new Map([...found].map(([name, { dir }]) => [name, dir]));
}

/** The real path of `at`, or nothing where it cannot be reached. */
function realOf(at: string): string | undefined {
  try {
    return fs.realpathSync(at);
  } catch {
    return undefined;
  }
}

/**
 * The skill `written` (`folder:name`, read as `given`) of the repository `repo`: the folder it is, the skill `name` of the own skills
 * (`REPOSITORY_HOLDER`) of the repository's folder `folder`, holding a `SKILL.md`, or why it cannot be used, each naming the skill as
 * written. Refused: with no repository, since none is read; a folder reached through a link that leaves the repository, by real path,
 * which is never opened; a folder that holds no such skill, naming where it was looked for; and as a skill of the roots is, a link in it
 * that is not followed (`skillLinkRefusal`) — one that leaves said with the folder that bounds it, the one the line names — and rules that
 * do not read.
 */
function folderSkill(written: string, given: Required<GivenSkill>, repo: string | undefined): string | WorkflowError {
  const named = `\`${written}\` is the skill \`${given.name}\` of the repository's folder \`${given.folder}\``;
  if (!repo)
    return new WorkflowError(
      `${named}, and this is read with no repository: a skill named with its folder is read from the repository a run is started on. Start the run on that repository, or take \`${written}\` off the \`skills:\` line.`,
    );
  const root = path.resolve(repo);
  const folder = path.join(root, given.folder);
  const [inside, real] = [realOf(root), realOf(folder)];
  if (inside !== undefined && real !== undefined && !insideOf(inside, real))
    return new WorkflowError(
      `${named}, and ${folder} is reached through a link whose target is outside the repository ${root}: make it a folder of the repository's own, or take \`${written}\` off the \`skills:\` line.`,
    );
  const dir = path.join(folder, REPOSITORY_HOLDER, SKILLS_FOLDER, given.name);
  if (!holdsSkill(dir))
    return new WorkflowError(
      `${named}, and ${dir} holds no SKILL.md. A skill is a folder holding a SKILL.md: write ${path.join(dir, 'SKILL.md')}, or take \`${written}\` off the \`skills:\` line.`,
    );
  const link = skillLinkRefusal(dir);
  if (link?.message.endsWith(LEAVES))
    return new WorkflowError(`${link.message} The links of \`${written}\` stay inside ${folder}, the folder its line names.`);
  return link ?? rulesRefusal(dir) ?? dir;
}

/**
 * Every skill a workflow's agents may give. `all` is each name of the folders looked in (`lookupRoots`): the folder it is —
 * `<root>/skills/<name>`, holding a `SKILL.md` — or its refusal: a link in it that is not followed (`skillLinkRefusal`), rules that do
 * not read, or a name one repository has in both `workflows/skills/` and `.claude/skills/` as two folders. One folder under both, the
 * one a link to the other, is one skill, given from the first. The first root that has a name wins, and a builtin place skill
 * (`PLACE_SKILLS`) is found last, where no root has its name. `at` answers a bare name from `all`, and a skill named with its folder
 * (`givenSkillOf`) from that folder of the repository `places.repo` alone (`folderSkill`), read when it is first asked and never by a
 * walk: a bare name is never a nested folder's. The roots and the package's place folder are named for the refusal of a name none has
 * (`skillAt`).
 */
export function skillsFor(workflowDir: string, places: Places = {}): SkillsFound {
  const roots = lookupRoots(workflowDir, places);
  const looked = [...roots.map((root) => path.join(root, SKILLS_FOLDER)), PLACE_SKILLS];
  const all = rootSkills(roots);
  const nested = new Map<string, string | WorkflowError>();
  const get = (name: string): string | WorkflowError | undefined => {
    const given = givenSkillOf(name);
    if (given?.folder === undefined) return name.includes(':') ? undefined : all.get(name);
    if (!nested.has(name)) nested.set(name, folderSkill(name, { name: given.name, folder: given.folder }, places.repo));
    return nested.get(name);
  };
  return { at: { get }, all, looked };
}

/** A file of a skill's folder, by its path in the skill: the real file it is read from, or why the link there is refused. */
export type SkillFile = { path: string; real: string } | { path: string; refused: string };

/** Why a link that leaves is refused, after its name. */
const LEAVES = 'is a link, and what it points at is outside the folder of skills: make it a folder of its own.';

/** The skill a walk reads: its folder's name, and the checkout its links may stay inside, none where every link is refused. */
type Walked = { name: string; checkout: string | undefined };

/**
 * The checkout whose own skills (`REPOSITORY_HOLDER`) the skill folder `dir` is in, by real path: the folder a link there may stay
 * inside. None for a folder of skills anywhere else, the store's library and a team's own among them, nor for a checkout that cannot be
 * reached.
 */
function checkoutOf(dir: string): string | undefined {
  const skills = path.dirname(path.resolve(dir));
  const holder = path.dirname(skills);
  if (path.basename(skills) !== SKILLS_FOLDER || path.basename(holder) !== REPOSITORY_HOLDER) return undefined;
  try {
    return fs.realpathSync(path.dirname(holder));
  } catch {
    return undefined;
  }
}

/** Whether the real path `real` is the folder `checkout` or beneath it: a sibling whose name starts with the checkout's is not. */
function insideOf(checkout: string, real: string): boolean {
  const rel = path.relative(checkout, real);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * What the link `at`, named `named`, is read as: the real file or folder it points at, or why it is refused — any link of a skill no
 * checkout holds, one whose target is outside the checkout or cannot be reached, and one that points back at a folder of `held`, the
 * folders the walk is in. A refused link's target is never opened.
 */
function followed(
  walk: Walked,
  at: string,
  named: string,
  held: readonly string[],
): { real: string; folder: boolean } | { refused: string } {
  if (walk.checkout === undefined) return { refused: `${named} ${LEAVES}` };
  let real: string;
  try {
    real = fs.realpathSync(at);
  } catch {
    return {
      refused: `${named} is a link, and what it points at cannot be reached: point it at a file or a folder inside the repository, or remove it.`,
    };
  }
  if (!insideOf(walk.checkout, real)) return { refused: `${named} ${LEAVES}` };
  const folder = fs.statSync(real).isDirectory();
  if (folder && held.includes(real))
    return { refused: `${named} is a link that points back at a folder it is in, and the skill's files would never end: remove it.` };
  return { real, folder };
}

/** The files of the real folder `dir`, each by its path in the skill from `under`, a followed linked folder walked as the folder it is. */
function filesUnder(walk: Walked, dir: string, under: string, held: readonly string[]): SkillFile[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): SkillFile[] => {
    const file = path.join(under, entry.name);
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(walk, at, file, [...held, at]);
    if (!entry.isSymbolicLink()) return [{ path: file, real: at }];
    const to = followed(walk, at, path.join(walk.name, file), held);
    if ('refused' in to) return [{ path: file, refused: to.refused }];
    return to.folder ? filesUnder(walk, to.real, file, [...held, to.real]) : [{ path: file, real: to.real }];
  });
}

/**
 * The skill folder `dir` itself as a walk starts in it: the real folder, or why it is refused — as a link beneath it is (`followed`),
 * and, for a folder that is no link, where the folder of skills it is in is reached through a link that leaves the checkout.
 */
function folderOf(walk: Walked, dir: string): { real: string } | { refused: string } {
  if (fs.lstatSync(dir).isSymbolicLink()) return followed(walk, dir, walk.name, []);
  if (walk.checkout === undefined) return { real: dir };
  const real = fs.realpathSync(dir);
  if (insideOf(walk.checkout, real)) return { real };
  const skills = path.dirname(path.resolve(dir));
  return {
    refused: `${walk.name} is in a folder of skills reached through a link, ${skills} or the folder it is in, and what it points at is outside the repository: make it a folder of the repository's own.`,
  };
}

/**
 * Every file of the skill folder `dir`, sorted by its path in the skill, each with the real file it is read from or the refusal of the
 * link there: the one rule every reader of a skill asks. A skill of a checkout's own skills — a folder `skills/<name>` of its
 * `REPOSITORY_HOLDER` — has its links followed while their real path stays inside the checkout's folder, the skill's own folder, its
 * SKILL.md and every file beneath, a followed folder's included; an ignored folder of the checkout is inside. Any other
 * skill folder has every link refused. A refused link is named from the folder of skills (`x`, `x/SKILL.md`), with what to do, and what
 * it points at is never opened; the folder itself refused is the one entry, under the path ''. Throws where a folder cannot be read.
 */
export function skillFiles(dir: string): SkillFile[] {
  const walk: Walked = { name: path.basename(dir), checkout: checkoutOf(dir) };
  const folder = folderOf(walk, dir);
  if ('refused' in folder) return [{ path: '', refused: folder.refused }];
  return filesUnder(walk, folder.real, '', [folder.real]).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The refusal of the skill folder `dir` for a link in it that is not followed (`skillFiles`), the first by path, or nothing for a skill
 * whose every file reads — and for a folder that cannot be read, which its reader says in its own words.
 */
export function skillLinkRefusal(dir: string): WorkflowError | undefined {
  let files: SkillFile[];
  try {
    files = skillFiles(dir);
  } catch {
    return undefined;
  }
  const first = files.find((file) => 'refused' in file);
  return first && 'refused' in first ? new WorkflowError(first.refused) : undefined;
}

/**
 * The skill folder `dir` copied to the folder `to` as its files (`skillFiles`), each a regular file with its mode, a followed link as
 * what it points at: no link is written. Refused with the skill's link refusal before a byte is written.
 */
export function copySkillFiles(dir: string, to: string): void {
  const files = skillFiles(dir).map((file) => {
    if ('refused' in file) throw new WorkflowError(file.refused);
    return file;
  });
  fs.mkdirSync(to, { recursive: true });
  for (const file of files) {
    const at = path.join(to, file.path);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.copyFileSync(file.real, at);
    fs.chmodSync(at, fs.statSync(file.real).mode & 0o7777);
  }
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
  return textForVersion(file);
}

/** A file read as a version counts what it holds: its text, or why it cannot be read. */
function textForVersion(file: string): string | { unreadable: string } {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { unreadable: (err as Error).message };
  }
}

/**
 * Every file of a skill's folder (`skillFiles`), by its path in the skill, sorted, each as a version counts it: a followed link as the
 * content it points at, so the version moves when that does and equals that of the skill's copy (`copySkillFiles`); a refused link as
 * where it points (`readForVersion`), never opened.
 */
export function folderForVersion(dir: string): Array<[string, unknown]> {
  let files: SkillFile[];
  try {
    files = skillFiles(dir);
  } catch (err) {
    return [['', { unreadable: (err as Error).message }]];
  }
  return files.map((file) => [file.path, 'refused' in file ? readForVersion(path.join(dir, file.path)) : textForVersion(file.real)]);
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
