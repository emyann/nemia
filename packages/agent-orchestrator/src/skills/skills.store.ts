/**
 * What the board's skill picker and skill page read and write: one skill folder read (`skillRead`), the skills an agent gives, each read
 * where a start finds it (`givenSkills`), the skill folders of a folder of skills (`skillFolders`), the first of several that has a skill
 * (`skillDirIn`), a SKILL.md's text (`skillText`); a skill copied whole from another folder of skills (`copySkill`), and a skill made or
 * changed (`writeSkill`), each write refused as `Missing`, `Conflict` or `Invalid`.
 *
 * Beneath the controllers, beside `record.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports it. A run
 * is changed by none of it: it froze its folder, and its agents' skills, at `nemia start`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_FOLDER, SKILLS_FOLDER, WorkflowError } from '../step/step.ts';
import { linkRefusal, takenAt } from '../folder/folder.ts';
import { skillNameRefusal, skillTurnCost, type SkillCost, type SkillsFound } from '../agents/agents.ts';
import { skillEntryOf, renderSkill, withPreload, type AgentSkill, type SkillDraft } from './skills.ts';
import { skillLinkRefusal, skillVersion } from './read.store.ts';
import { HOME } from '../record/record.store.ts';
import { isWorkflowsHolder } from '../folder/write.store.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';

/** One skill folder read now: its card entry, or null with `error` saying why no agent can be given it; and what it costs a turn. */
export type SkillRead = {
  entry: AgentSkill | null;
  error: string | null;
  /** Whether it is loaded every turn, whole (`preload: true`), rather than named for the session to load. */
  preload: boolean;
  /** What it costs a turn, about (`skillTurnCost`); null when its SKILL.md cannot be read. */
  cost: SkillCost | null;
};

/**
 * The skill `name` whose folder is `dir`, read now. A link in it that is not followed is refused unread (`skillLinkRefusal`): any link
 * of the store's library or a team's own folder, and one of a checkout's own skills whose target leaves the checkout, where a
 * link that stays inside is read through. A SKILL.md that cannot be read says why; one the card reader refuses (`skillEntryOf`) has its
 * refusal as `error`, and its cost all the same.
 */
export function skillRead(name: string, dir: string): SkillRead {
  const file = path.join(dir, 'SKILL.md');
  const none: SkillRead = { entry: null, error: null, preload: false, cost: null };
  const linked = skillLinkRefusal(dir);
  if (linked) return { ...none, error: linked.message };
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ...none, error: `${file} cannot be read (${err instanceof Error ? err.message : String(err)}).` };
  }
  const cost = skillTurnCost(name, text);
  try {
    return { entry: skillEntryOf(file, name, text), error: null, preload: cost.preload, cost };
  } catch (err) {
    return { entry: null, error: err instanceof Error ? err.message : String(err), preload: cost.preload, cost };
  }
}

/** A skill an agent gives, read: the folder it is found in, null where none is, and its reading or why it has none. */
export type GivenRead = { name: string; dir: string | null } & SkillRead;

/**
 * The skills `skills` an agent gives, one each in its order, each found where a start finds it (`found`, the agent's `skillsFor`) and read
 * there (`skillRead`). A name two folders of one place have is the package's refusal; a name no folder has, the refusal its card states.
 */
export function givenSkills(skills: readonly string[], found: SkillsFound): GivenRead[] {
  return skills.map((name) => {
    const at = found.at.get(name);
    const none = { name, dir: null, entry: null, preload: false, cost: null };
    if (at instanceof WorkflowError) return { ...none, error: at.message };
    if (at === undefined) return { ...none, error: `No skills folder has \`${name}\` — looked in ${found.looked.join(', ')}.` };
    return { name, dir: at, ...skillRead(name, at) };
  });
}

/**
 * The skill folders of the folder of skills `dir` by name, sorted, each a folder holding a SKILL.md, as `skillsFor` reads one. None for a
 * folder that cannot be read.
 */
export function skillFolders(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return names.filter((name) => fs.statSync(path.join(dir, name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile());
}

/**
 * The folder of the skill `name` in the first of the folders of skills `roots` where `<name>/SKILL.md` is there, or null where none has
 * it.
 */
export function skillDirIn(roots: readonly string[], name: string): string | null {
  const dir = roots.map((root) => path.join(root, name)).find((at) => fs.lstatSync(path.join(at, 'SKILL.md'), { throwIfNoEntry: false }));
  return dir ?? null;
}

/**
 * The text of the SKILL.md in the skill folder `dir`, or empty where it cannot be read or a link in the skill is refused, unread
 * (`skillLinkRefusal`): `skillRead` says why.
 */
export function skillText(dir: string): string {
  if (skillLinkRefusal(dir)) return '';
  try {
    return fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  } catch {
    return '';
  }
}

/** What `copySkill` did: the skill's folder where it now is, and its files by their path in it. */
export type SkillCopied = { dir: string; name: string; written: string[] };

/**
 * The skill `name` of the folder of skills `from` copied whole into the folder of skills `to`, under the same name: what the board's skill
 * picker does with a builtin skill, so an agent of yours can give it — an agent of the store finds skills in the store and the
 * repository it runs on, never in the checkout Nemia's builtin skills come from. A write of its own, done before and apart from any save of an agent.
 *
 * Judged whole before a byte is written, each refusal by name: `to` is a `skills/` beside the workflows the board lists — the store's, or a
 * repository's — unless `{ anywhere: true }`; the name is a skill's (`skillNameRefusal`); `from` has that skill, a folder holding a
 * SKILL.md whose card entry reads (`skillEntryOf`), so a copy is never a skill no agent could be given; nothing in it is a link, since a
 * copy would follow it and bring in whatever it points at; and `to` has no skill of that name, which a copy would write over. It is then
 * copied into a hidden folder beside where it goes and renamed into place, so a copy that fails part-way leaves no half a skill to be
 * found.
 */
export function copySkill(from: string, to: string, name: string, { anywhere = false }: { anywhere?: boolean } = {}): SkillCopied {
  const refuse = refuseSkill;
  const at = path.resolve(to);
  const linkWhy = 'a copy follows a link, and would bring in whatever it points at, outside the skill.';
  judgeSkillPlace(at, name, anywhere, 'Copy it', linkWhy);
  const source = path.join(path.resolve(from), name);
  if (fs.lstatSync(source, { throwIfNoEntry: false })?.isSymbolicLink()) refuse(linkRefusal(source, linkWhy));
  const skillFile = path.join(source, 'SKILL.md');
  if (!fs.lstatSync(skillFile, { throwIfNoEntry: false })?.isFile()) {
    refuse(
      `${path.resolve(from)} has no skill named ${name}: a skill is a folder holding a SKILL.md, and ${skillFile} is not there.`,
      Missing,
    );
  }
  const files = (fs.readdirSync(source, { recursive: true }) as string[]).sort();
  const linked = files.find((file) => fs.lstatSync(path.join(source, file)).isSymbolicLink());
  if (linked !== undefined) refuse(linkRefusal(path.join(source, linked), linkWhy));
  try {
    skillEntryOf(skillFile, name, fs.readFileSync(skillFile, 'utf8'));
  } catch (err) {
    refuse(err instanceof Error ? err.message : String(err));
  }
  const target = path.join(at, name);
  if (fs.lstatSync(target, { throwIfNoEntry: false })) {
    refuse(
      `${SKILLS_FOLDER}/${name} is there already, in ${at}, and a copy would write over it. Give it as it is, or remove that folder first.`,
      Conflict,
    );
  }

  fs.mkdirSync(at, { recursive: true });
  const staging = path.join(at, `.${name}.copying-${process.pid}-${Date.now()}`);
  try {
    fs.cpSync(source, staging, { recursive: true, errorOnExist: true, force: false });
    fs.renameSync(staging, target);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  const written = files.filter((file) => fs.statSync(path.join(target, file)).isFile());
  return { dir: target, name, written };
}

/**
 * A copy or a write of a skill refused, in the package's words: `words` thrown as `Missing` for a skill not there, as `Conflict` for a name
 * already taken or a skill that changed since it was read, and as a `WorkflowError`, an `Invalid`, for anything else judged. Nothing is
 * thrown for no words.
 */
const refuseSkill = (words: string | undefined, kind?: typeof Missing | typeof Conflict): void => {
  if (!words) return;
  if (kind) throw new kind({ message: words });
  throw new WorkflowError(words);
};

/**
 * The refusals a copy and a write of a skill share, judged before either reads a byte of it: `at` is a `skills/` beside the workflows the
 * board lists — the store's, or that of a repository a factory names — unless `anywhere`; `name` is a skill's (`skillNameRefusal`); and
 * neither `at` nor the folder it is in is a link, which a write would follow out of the store.
 */
function judgeSkillPlace(at: string, name: string, anywhere: boolean, verb: string, linkWhy: string): void {
  if (path.basename(at) !== SKILLS_FOLDER)
    refuseSkill(
      `${at} is not a folder of skills: the skills agents give are in the ${SKILLS_FOLDER}/ beside ${AGENTS_FOLDER}/. Name <workflows>/${SKILLS_FOLDER}.`,
    );
  if (!anywhere && !isWorkflowsHolder(path.dirname(at))) {
    refuseSkill(
      `${at} is not the store's ${SKILLS_FOLDER}/ (${path.join(path.resolve(HOME, 'workflows'), SKILLS_FOLDER)}) nor a repository's the store knows (<repo>/workflows/${SKILLS_FOLDER}, for a factory's repo). ${verb} to one of the two, give its repository to a factory (nemia factory add <name> --repo <repo>), or pass { anywhere: true } to write ${at} all the same.`,
    );
  }
  refuseSkill(skillNameRefusal(name));
  for (const place of [at, path.dirname(at)])
    if (fs.lstatSync(place, { throwIfNoEntry: false })?.isSymbolicLink()) refuseSkill(linkRefusal(place, linkWhy));
}

/** A change `writeSkill` makes: a whole skill, as the board's form writes it, or its `preload:` line alone, as the board's switch does. */
export type SkillChange = SkillDraft | { name: string; preload: boolean };

/** What `writeSkill` did: the skill's folder, its version now (`skillVersion`), and the files it wrote there. */
export type SkillWritten = { dir: string; name: string; version: string; written: string[] };

/** The version of the skill whose folder is `dir`, or null where `dir` is no folder or holds no SKILL.md. */
const versionThere = (dir: string): string | null =>
  fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? skillVersion(dir) : null;

/**
 * A skill of the folder of skills `to` written: made, with `{ version: null }`, or changed, with the version it was read at. What the
 * board's skill page does — a person writes a skill of their own in the store's library, where an agent of the store finds it. A skill's
 * version is digested into the version of every agent that gives it (`agentVersion`), so a change of it is a change of every one of them.
 *
 * Judged whole before a byte is written, each refusal by name: the place and the name as a copy judges them (`judgeSkillPlace`); a SKILL.md
 * that is not a file of the folder's own — a link — which the write would follow; for a skill made, a name already taken (a `Conflict`),
 * and a change of its `preload:` alone, which has no skill to change; for one changed, a skill not there (`Missing`) and one whose files
 * moved since the version was read (a `Conflict`); and a skill the card reader would refuse (`renderSkill`, `withPreload`), in its words,
 * an `Invalid` as the rest are. A skill whose SKILL.md does not read may be written — that is how it is mended — so only what is written
 * must read. A skill made is written in a hidden folder beside where it goes and renamed into place, and a change through a hidden file
 * beside SKILL.md, so a write that fails leaves no half a skill.
 */
export function writeSkill(
  to: string,
  change: SkillChange,
  { version, anywhere = false }: { version: string | null; anywhere?: boolean },
): SkillWritten {
  const at = path.resolve(to);
  const name = change?.name;
  judgeSkillPlace(at, name, anywhere, 'Write it', 'a write follows a link, and would write whatever it points at, outside the store.');
  const target = path.join(at, name);
  const file = path.join(target, 'SKILL.md');
  const named = `${SKILLS_FOLDER}/${name}`;
  const whole = 'body' in change;
  for (const place of [target, file]) {
    if (fs.lstatSync(place, { throwIfNoEntry: false })?.isSymbolicLink())
      refuseSkill(linkRefusal(place, "a skill's files are its own, and a write would follow the link. Remove it by hand."));
  }
  const rendered = (was?: string): string => {
    try {
      return whole ? renderSkill(change, was) : withPreload(file, was ?? '', change.preload);
    } catch (err) {
      throw new WorkflowError(err instanceof Error ? err.message : String(err));
    }
  };

  if (version === null) {
    if (!whole)
      refuseSkill(
        `${named} is a change of \`preload:\` alone, and there is no skill to change: write the whole skill — its description and instructions — to make it.`,
      );
    if (fs.lstatSync(target, { throwIfNoEntry: false })) {
      refuseSkill(
        `${named} is there already, in ${at}, and a new skill would write over it. Give it another name, or open ${name} and change it${takenAt(versionThere(target))}.`,
        Conflict,
      );
    }
    const text = rendered();
    fs.mkdirSync(at, { recursive: true });
    const staging = path.join(at, `.${name}.writing-${process.pid}-${Date.now()}`);
    try {
      fs.mkdirSync(staging);
      fs.writeFileSync(path.join(staging, 'SKILL.md'), text);
      fs.renameSync(staging, target);
    } catch (err) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw err;
    }
  } else {
    if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile())
      refuseSkill(`${named} is not in ${at}: it was removed. Write it again as a new skill.`, Missing);
    const now = skillVersion(target);
    if (now !== version)
      refuseSkill(`${named} changed since it was read (version ${version}, now ${now}). Read it again before changing it.`, Conflict);
    const text = rendered(fs.readFileSync(file, 'utf8'));
    const staging = path.join(target, `.SKILL.md.writing-${process.pid}-${Date.now()}`);
    try {
      fs.writeFileSync(staging, text);
      fs.renameSync(staging, file);
    } catch (err) {
      fs.rmSync(staging, { force: true });
      throw err;
    }
  }
  return { dir: target, name, version: skillVersion(target)!, written: ['SKILL.md'] };
}
