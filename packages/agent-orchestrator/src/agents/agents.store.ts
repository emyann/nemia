/**
 * The agent files: where `nemia start` renders each step's agent for Claude Code (`agentFilesDir`), the render itself (`writeAgentFiles`),
 * the version of each skill it rendered (`renderedSkillVersions`), the rules each declares (`renderedSkillRules`) and the paths of its work
 * (`renderedSkillApplies`), and a skill read again once its rendered folder is gone (`skillsAgain`); and what the board's Agents page
 * writes — an agent and the files beside it (`writeAgent`, `removeAgent`, refused as `Missing`, `Conflict` or `Invalid`). What a folder
 * holds is `agents.ts`'s; this writes and reads it, and the agents of the two places the board lists them from are read in
 * `roster.store.ts`.
 *
 * Beneath the controllers, beside `record.store.ts`, whose run folder holds the agent files: it imports neither the engine nor a
 * controller, and no pure file imports it (`test/boundary.test.ts`). A run is changed by none of the writes: it froze its agents at
 * `nemia start`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { AGENTS_FOLDER, splitFrontmatter, WorkflowError, type Workflow } from '../step/step.ts';
import {
  agentNameRefusal,
  parseAgent,
  renderAgent,
  type Agent,
  type AgentDraft,
  type SkillsFound,
  noCodingStyle,
  NO_CODING_STYLE,
  namesPlugin,
  pluginManifest,
  pluginOf,
  PROMPT_FILE,
  renderedPrompt,
  rendersAgent,
  type SkillAgain,
} from './agents.ts';
import { frontmatterKey } from '../former/former.ts';
import { bareSkillOf } from '../keys/index.ts';
import { linkRefusal, takenAt } from '../folder/folder.ts';
import { agentUsers } from '../folder/folder.store.ts';
import { agentVersion } from './read.store.ts';
import { copySkillFiles, preloads, readSkillRules, skillsFor, skillVersion } from '../skills/read.store.ts';
import { appliesOf, type SkillRule } from '../skills/skills.ts';
import { isWorkflowsHolder } from '../folder/write.store.ts';
import { HOME, isDirectory, runsDir } from '../record/record.store.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';

/**
 * Where `nemia start` renders a step's agent for Claude Code (`agents.ts`): `runs/<id>/agents/<step>`, beside the run's artifacts and
 * inputs, outside every workspace, and removed with them. The tick files the step with the flags that name it (`renderedFlags`).
 */
export const agentFilesDir = (run: Pick<Run, 'id'>, step: string): string => path.join(runsDir(), run.id, 'agents', step);

/**
 * Whether a step's rendered folder `dir` is there as its flags name it (`renderedFlags`): the folder, and the plugin in it where the flags
 * name one (`namesPlugin`). A folder rendered under another plugin name, as one `nemia start` wrote before the plugin was renamed, is not:
 * its flags would name a plugin that is not there.
 */
export const renderedIn = (dir: string, step: Workflow): boolean =>
  isDirectory(dir) && (!namesPlugin(step) || isDirectory(path.join(dir, pluginOf(step.agent!.name))));

/**
 * Render every step of `steps` whose agent is rendered (`rendersAgent`) into its folder (`agentFilesDir`): its prompt, its skills copied
 * whole from where the load found them (`skills`), each under its bare name (`bareSkillOf`), as the prompt names it, and its style. Written once, at `nemia start`, so an edit of an agent or a skill after
 * it reaches no run already started, as an edit of its workflow does not. A skill is copied as its files, never a link, and one holding
 * a link that is not followed is refused (`copySkillFiles`): the folder is the step's own.
 */
export function writeAgentFiles(run: Pick<Run, 'id'>, steps: readonly Workflow[], skills: SkillsFound): void {
  for (const step of steps.filter(rendersAgent)) {
    const agent = step.agent!;
    const dir = agentFilesDir(run, step.name);
    const plugin = path.join(dir, pluginOf(agent.name));
    fs.mkdirSync(dir, { recursive: true });
    const told = (agent.skills ?? []).map((name) => {
      const from = skills.at.get(name);
      if (typeof from !== 'string')
        throw new Error(
          `${step.name}: the skill ${name} of ${agent.name} is not where the load found it${from ? ` — ${from.message}` : ''}.`,
        );
      const bare = bareSkillOf(name);
      copySkillFiles(from, path.join(plugin, 'skills', bare));
      return preloads(from)
        ? { name: bare, whole: splitFrontmatter(`${name}/SKILL.md`, fs.readFileSync(path.join(from, 'SKILL.md'), 'utf8')).body }
        : { name: bare };
    });
    if (namesPlugin(step)) {
      fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
      fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), pluginManifest(agent.name));
    }
    if (agent.harnessPrompt === 'no-coding') {
      fs.mkdirSync(path.join(plugin, 'output-styles'), { recursive: true });
      fs.writeFileSync(path.join(plugin, 'output-styles', `${NO_CODING_STYLE}.md`), noCodingStyle(agent.name));
    }
    fs.writeFileSync(path.join(dir, PROMPT_FILE), renderedPrompt(step, told));
  }
}

/**
 * The version (`skillVersion`) of each skill `nemia start` rendered for a step of `run` (`writeAgentFiles`), by the name its line writes, read off its copy
 * in the step's folder (`agentFilesDir`): a skill whose copy is not there — a step whose agent is not rendered, a folder gone — is left
 * out.
 */
export function renderedSkillVersions(run: Pick<Run, 'id'>, step: Workflow): Map<string, string> {
  const agent = step.agent;
  if (!agent?.skills) return new Map();
  const skills = path.join(agentFilesDir(run, step.name), pluginOf(agent.name), 'skills');
  return new Map(
    agent.skills.flatMap((name) => {
      const version = skillVersion(path.join(skills, bareSkillOf(name)));
      return version === null ? [] : [[name, version] as const];
    }),
  );
}

/**
 * The rules (`readSkillRules`) each skill `nemia start` rendered for a step of `run` declares, by the name the skill's line writes, read off its copy in
 * the step's folder (`agentFilesDir`): a skill whose copy is not there, that declares none, or whose `rules.json` does not read is left
 * out.
 */
export function renderedSkillRules(run: Pick<Run, 'id'>, step: Workflow): Map<string, SkillRule[]> {
  const agent = step.agent;
  if (!agent?.skills) return new Map();
  const skills = path.join(agentFilesDir(run, step.name), pluginOf(agent.name), 'skills');
  return new Map(
    agent.skills.flatMap((name) => {
      try {
        const rules = readSkillRules(path.join(skills, bareSkillOf(name)));
        return rules.length ? [[name, rules] as const] : [];
      } catch (err) {
        if (err instanceof WorkflowError) return [];
        throw err;
      }
    }),
  );
}

/**
 * The paths of the work (`appliesOf`) each skill `nemia start` rendered for a step of `run` declares, by the name the skill's line writes, read off its
 * copy's SKILL.md in the step's folder (`agentFilesDir`): a skill whose copy is not there, or that declares none, is left out.
 */
export function renderedSkillApplies(run: Pick<Run, 'id'>, step: Workflow): Map<string, string[]> {
  const agent = step.agent;
  if (!agent?.skills) return new Map();
  const skills = path.join(agentFilesDir(run, step.name), pluginOf(agent.name), 'skills');
  return new Map(
    agent.skills.flatMap((name) => {
      const file = path.join(skills, bareSkillOf(name), 'SKILL.md');
      const globs = fs.existsSync(file) ? appliesOf(fs.readFileSync(file, 'utf8')) : [];
      return globs.length ? [[name, globs] as const] : [];
    }),
  );
}

/**
 * The skills of a step whose rendered folder is gone (`unrendered`), read again from where the load finds them now (`skills`): each
 * SKILL.md's body, or why it is not there. The copy `nemia start` froze went with the folder, so this is the one read of a skill after a
 * run started.
 */
export function skillsAgain(step: Workflow, skills: SkillsFound): SkillAgain[] {
  return (step.agent?.skills ?? []).map((name) => {
    const from = skills.at.get(name);
    if (typeof from !== 'string') return { name, missing: from ? from.message : `no folder holds it in ${skills.looked.join(', ')}.` };
    try {
      return { name, text: splitFrontmatter(`${name}/SKILL.md`, fs.readFileSync(path.join(from, 'SKILL.md'), 'utf8')).body };
    } catch (err) {
      return { name, missing: `${path.join(from, 'SKILL.md')} could not be read — ${(err as Error).message}.` };
    }
  });
}

/**
 * A write or a removal of an agent refused, in the package's words: `words` thrown as `Missing` for an agent that is not there, as
 * `Conflict` for one changed since it was read, a name another agent has, or one steps still name — `users` says which, as
 * `<workflow>/<step>` — and as a `WorkflowError`, an `Invalid`, for the rest: a place, a name, a key or a value the parser refuses.
 * Nothing is thrown for no words.
 */
function refuse(words: string | undefined, kind?: typeof Missing | typeof Conflict, users?: readonly string[]): void {
  if (!words) return;
  if (kind === Missing) throw new Missing({ message: words });
  if (kind === Conflict) throw new Conflict({ message: words, ...(users && { users }) });
  throw new WorkflowError(words);
}

/** What `writeAgent` did: the agent as it now reads, its version, and its files by name — written, and removed. */
export type AgentWritten = { dir: string; agent: Agent; version: string; written: string[]; removed: string[] };

/**
 * A file written beside an agent, named by one of the agent's own keys: the result schema its `output:` names. Its file is a plain `.json`
 * name in the folder — no folder of its own, and not another agent's file.
 */
export type AgentSidecar = { file: string; text: string };

/** A result schema written with an agent: its file, beside the agent, and what it holds. */
export type AgentSchema = AgentSidecar;

/**
 * The agent keys that name a file beside the agent, and what a refusal calls each. `card:` is not one: an agent's card is generated from
 * its skills, and the load refuses a `card:` line, naming the file it points at as nobody's (`cardRetired`).
 */
const SIDECARS = [
  { key: 'output' as const, what: 'result schema', a: 'the result schema', suggest: (name: string) => `${name}.schema.json` },
];

/**
 * Why no agent may be written to or removed from `dir`, or `undefined`: an agent is a file in `agents/` beside the workflows the board
 * lists — the store's (`<store>/workflows/agents`) or a repository's the store knows (`<repo>/workflows/agents`, for a factory's repo or
 * the `repo` the caller names). Anywhere else only with `{ anywhere: true }`.
 */
function agentPlaceRefusal(dir: string, anywhere: boolean, repo?: string): string | undefined {
  if (path.basename(dir) !== AGENTS_FOLDER) {
    return `${dir} is not a folder of agents: the agents the workflows name are in the ${AGENTS_FOLDER}/ beside them. Name <workflows>/${AGENTS_FOLDER}.`;
  }
  if (anywhere || isWorkflowsHolder(path.dirname(dir), repo)) return undefined;
  return `${dir} is not the store's ${AGENTS_FOLDER}/ (${path.join(path.resolve(HOME, 'workflows'), AGENTS_FOLDER)}) nor a repository's the store knows (<repo>/workflows/${AGENTS_FOLDER}, for a factory's repo), the two places the board lists agents from. Write it to one of the two, give its repository to a factory (nemia factory add <name> --repo <repo>), or pass { anywhere: true } to write ${dir} all the same.`;
}

/** Whether two paths are one file on disk: a rename by case, where the filesystem does not tell case apart. */
function sameFile(a: string, b: string): boolean {
  const [x, y] = [fs.statSync(a, { throwIfNoEntry: false }), fs.statSync(b, { throwIfNoEntry: false })];
  return Boolean(x && y && x.ino === y.ino && x.dev === y.dev);
}

const inUse = (name: string, users: readonly string[], does: string): string =>
  `${AGENTS_FOLDER}/${name}.md is named by ${users.length === 1 ? 'a step' : `${users.length} steps`} beside it — ${users.join(', ')} — and ${does} would leave ${users.length === 1 ? 'it' : 'each'} naming an agent that is not there, which the workflow refuses to load. Give ${users.length === 1 ? 'that step' : 'those steps'} another agent, or remove the \`agent:\` line, first.`;

/**
 * The steps of `repo`'s workflows that are given the store's agent `name`, as `<workflow>/<step>` — none unless `at` is the store's folder
 * of agents and the repository has no agent of that name of its own, in `workflows/agents/` or `.claude/agents/`, which its workflows find
 * first (`lookupRoots`). The one repository the caller names: the store does not know which others give their workflows its agents.
 */
function repoUsers(at: string, name: string, repo: string | undefined): string[] {
  if (repo === undefined || at !== path.join(HOME, 'workflows', AGENTS_FOLDER)) return [];
  const own = [path.join(repo, 'workflows', AGENTS_FOLDER), path.join(repo, '.claude', AGENTS_FOLDER)];
  if (own.some((dir) => path.resolve(dir) === at || fs.existsSync(path.join(dir, `${name}.md`)))) return [];
  return agentUsers(path.join(repo, 'workflows'), name);
}

/** `inUse`, for the steps of a repository's workflows that are given the store's agent (`repoUsers`). */
const inUseByRepo = (name: string, users: readonly string[], repo: string, does: string): string =>
  `${AGENTS_FOLDER}/${name}.md is named by ${users.length === 1 ? 'a step' : `${users.length} steps`} of the repository ${repo} — ${users.join(', ')} — which has no ${name} of its own, so its workflows are given this one, and ${does} would leave ${users.length === 1 ? 'it' : 'each'} naming an agent that is not there, which the workflow refuses to load. Give ${users.length === 1 ? 'that step' : 'those steps'} another agent or remove the \`agent:\` line, or copy this agent into ${path.join(repo, 'workflows', AGENTS_FOLDER)}/ (git shows it as a change to commit), first.`;

/** Why a new agent `name` is not written over the one there, at `version`. */
const agentTaken = (name: string, version: string | null): string =>
  `${AGENTS_FOLDER}/${name}.md is there already. Give the new agent another name, or open it and change it${takenAt(version)}.`;

/**
 * An agent written from a draft (`renderAgent`): what the board's Agents page saves, and the inverse of `loadAgents` for one agent. `dir`
 * is a folder of agents, `<workflows>/agents`, and a run is not changed by any of it: a run froze its folder, and the agents its steps
 * name, at `nemia start`, so a write changes what a later `nemia start` freezes and nothing else.
 *
 * `version` is the agent's as it was read (`agentVersion`), or `null` for a new agent; `from` names the agent the draft was read from, when
 * it is renamed. Judged whole before a byte is written, each refusal by name: the place (`agentPlaceRefusal`), each name as a file's
 * (`agentNameRefusal`), a link where a file would be written or removed, a new agent whose name is taken, an agent not there or changed
 * since `version` was read, a rename onto another agent or of one steps still name — saying which — and then the file as it would be,
 * rendered and parsed as `loadAgents` parses one, so every key and value the parser refuses is refused here, in its words. A `card` option
 * is refused: the card is generated from the agent's skills, and a card file sent would be dropped unsaid. With `repo`, the version is read
 * with the skills a start on `repo` finds (`agentSkillsFound`), as the board lists it; without, with those beside the folder.
 *
 * `schema` is the result schema the agent's `output:` names, written beside it with it: a `.json` file's name with no folder, the one that
 * key names, not a link, and not a file another agent names — that one is its agent's to change. Without one, the file that key names is
 * read from the folder as it is. A key whose line is taken off, or pointed at another file, leaves the file it named where it is, so a
 * field cleared by mistake costs no one the schema they wrote; removing the agent takes its files with it (`removeAgent`).
 *
 * Renamed by case where the filesystem does not tell case apart, the file it is renamed from is removed before the one it is renamed to
 * is written, as in `writeWorkflow`.
 * A write that fails puts each file beside the agent back as it was, so an agent not written leaves nothing of itself behind.
 */
export function writeAgent(
  dir: string,
  draft: AgentDraft,
  {
    version,
    from,
    schema,
    anywhere = false,
    repo,
    ...rest
  }: { version: string | null; from?: string; schema?: AgentSidecar | null; anywhere?: boolean; repo?: string },
): AgentWritten {
  const at = path.resolve(dir);
  if (Object.hasOwn(rest, 'card'))
    refuse('`card` is not written with an agent: its card is generated from its skills. Send the agent without it.');
  refuse(agentPlaceRefusal(at, anywhere, repo));
  const name = draft?.name;
  refuse(agentNameRefusal(name));
  const old = from ?? name;
  if (from !== undefined) refuse(agentNameRefusal(from));
  if (from !== undefined && version === null)
    refuse(`a new agent is not renamed from another: to rename ${AGENTS_FOLDER}/${from}.md, give the version it was read at.`);
  const file = (n: string) => path.join(at, `${n}.md`);
  const linked = (target: string) => Boolean(fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink());
  const linkWhy = "an agent's file is its own: a write follows a link, and would write into whatever it points at, outside the folder.";
  for (const target of new Set([file(name), file(old)])) if (linked(target)) refuse(linkRefusal(target, linkWhy));
  const renamed = old !== name;
  const versionOf = (n: string) => agentVersion(at, n, skillsAt(at, repo));
  if (version === null) {
    if (fs.existsSync(file(name))) refuse(agentTaken(name, versionOf(name)), Conflict);
  } else {
    const now = versionOf(old);
    if (now === null)
      refuse(
        `${AGENTS_FOLDER}/${old}.md is not there: it was removed since it was read. Write it as a new agent to have it back.`,
        Missing,
      );
    if (now !== version)
      refuse(
        `${AGENTS_FOLDER}/${old}.md changed since it was read (version ${version}, now ${now}), and writing it would lose what changed. Read it again, and make the change on what it holds now.`,
        Conflict,
      );
  }
  if (renamed) {
    if (fs.existsSync(file(name)) && !sameFile(file(name), file(old)))
      refuse(
        `${AGENTS_FOLDER}/${name}.md is there already, and renaming ${old} to it would write over it. Give ${old} another name.`,
        Conflict,
      );
    const users = agentUsers(path.dirname(at), old);
    if (users.length) refuse(inUse(old, users, `renaming it to ${name}`), Conflict, users);
    const theirs = repoUsers(at, old, repo);
    if (theirs.length) refuse(inUseByRepo(old, theirs, repo!, `renaming it to ${name}`), Conflict, theirs);
  }
  const text = renderAgent(draft);
  const given = SIDECARS.map((kind) => ({ ...kind, sidecar: schema ?? null, named: frontmatterKey(text, kind.key) }));
  for (const { key, what, a, suggest, sidecar, named: mine } of given) {
    if (!sidecar) continue;
    const bad = typeof sidecar.file !== 'string' || !/^[^\\/]+\.json$/.test(sidecar.file) || sidecar.file.startsWith('.');
    if (bad)
      refuse(
        `\`${sidecar?.file}\` is not a ${what}'s name: it is a .json file beside the agent, named with no folder — ${suggest(name)}, say.`,
      );
    if (sidecar.file !== mine)
      refuse(
        `${a} is ${sidecar.file}, and ${AGENTS_FOLDER}/${name}.md ${mine === undefined ? 'names none' : `names ${mine}`}: a ${what} travels with the agent whose \`${key}:\` names it. Set \`${key}: ${sidecar.file}\`, or send none.`,
      );
    if (linked(path.join(at, sidecar.file)))
      refuse(
        linkRefusal(
          path.join(at, sidecar.file),
          `a ${what} is its agent's own: a write follows a link, and would write into whatever it points at, outside the folder.`,
        ),
      );
    const others = (fs.existsSync(at) ? fs.readdirSync(at, { withFileTypes: true }) : [])
      .filter((e) => e.name.endsWith('.md') && e.name !== `${old}.md` && e.name !== `${name}.md`)
      .filter((e) => {
        try {
          return frontmatterKey(fs.readFileSync(path.join(at, e.name), 'utf8'), key) === sidecar.file;
        } catch {
          return false;
        }
      })
      .map((e) => path.basename(e.name, '.md'));
    if (others.length)
      refuse(
        `${sidecar.file} is the ${what} of ${others.join(', ')} too, and changing it here would change what ${others.length === 1 ? 'that agent' : 'those agents'} declare. Name one of this agent's own: ${suggest(name)}, say.`,
      );
  }
  const sending = given.flatMap(({ sidecar }) => sidecar ?? []);
  const read = (f: string): string | undefined => {
    const sent = sending.find((s) => s.file === f);
    if (sent) return sent.text;
    try {
      return fs.readFileSync(path.resolve(at, f), 'utf8');
    } catch {
      return undefined;
    }
  };
  const agent = parseAgent(name, text, read);

  fs.mkdirSync(at, { recursive: true });
  const written: string[] = [];
  const removed: string[] = [];
  const held = (f: string): string | undefined => {
    try {
      return fs.readFileSync(path.join(at, f), 'utf8');
    } catch {
      return undefined;
    }
  };
  const before = sending.map((sidecar) => ({ sidecar, was: held(sidecar.file) }));
  try {
    for (const { sidecar, was } of before) {
      if (was === sidecar.text) continue;
      fs.writeFileSync(path.join(at, sidecar.file), sidecar.text);
      written.push(sidecar.file);
    }
    if (renamed && sameFile(file(name), file(old))) {
      fs.rmSync(file(old));
      removed.push(`${old}.md`);
    }
    fs.writeFileSync(file(name), text);
    written.push(`${name}.md`);
  } catch (err) {
    for (const { sidecar, was } of before) {
      if (!written.includes(sidecar.file)) continue;
      if (was === undefined) fs.rmSync(path.join(at, sidecar.file), { force: true });
      else fs.writeFileSync(path.join(at, sidecar.file), was);
    }
    throw err;
  }
  if (renamed && !removed.length) {
    fs.rmSync(file(old));
    removed.push(`${old}.md`);
  }
  return { dir: at, agent, version: versionOf(name)!, written, removed };
}

/**
 * An agent removed: its file, and the file it names beside it — the result schema its `output:` names —
 * unless another agent names that one too. Refused, by name, as a write
 * is — the place, the name, a link, an agent not there or changed since `version` was read — and while any step of any workflow beside
 * it still names it, saying which: removed, each of those workflows would stop loading. An agent of the store is refused too while a step
 * of `repo`'s workflows is given it, the repository having none of that name (`repoUsers`); other repositories are not read, since the
 * store does not know them, and one that named the agent refuses to load its workflow until given another.
 */
export function removeAgent(
  dir: string,
  name: string,
  { version, anywhere = false, repo }: { version: string | null; anywhere?: boolean; repo?: string },
): { dir: string; removed: string[] } {
  const at = path.resolve(dir);
  refuse(agentPlaceRefusal(at, anywhere, repo));
  refuse(agentNameRefusal(name));
  const file = path.join(at, `${name}.md`);
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    refuse(linkRefusal(file, "an agent's file is its own, and this one is not a file in the folder. Remove the link by hand."));
  const now = agentVersion(at, name, skillsAt(at, repo));
  if (now === null) refuse(`${AGENTS_FOLDER}/${name}.md is not there: it was removed already.`, Missing);
  if (version === null)
    refuse(
      `${AGENTS_FOLDER}/${name}.md is at version ${now}, and a removal is checked against the version it was read at, so an agent changed since is not removed unseen. Give that version to remove it.`,
    );
  if (now !== version)
    refuse(
      `${AGENTS_FOLDER}/${name}.md changed since it was read (version ${version}, now ${now}). Read it again before removing it.`,
      Conflict,
    );
  const users = agentUsers(path.dirname(at), name);
  if (users.length) refuse(inUse(name, users, 'removing it'), Conflict, users);
  const theirs = repoUsers(at, name, repo);
  if (theirs.length) refuse(inUseByRepo(name, theirs, repo!, 'removing it'), Conflict, theirs);
  const read = (f: string) => {
    try {
      return fs.readFileSync(path.join(at, f), 'utf8');
    } catch {
      return undefined;
    }
  };
  const mine = SIDECARS.map(({ key }) => ({ key, named: frontmatterKey(read(`${name}.md`) ?? '', key) }));
  fs.rmSync(file);
  const removed = [`${name}.md`];
  for (const { key, named } of mine) {
    if (named === undefined || !/^[^\\/]+\.json$/.test(named)) continue;
    const shared = fs.readdirSync(at).some((f) => f.endsWith('.md') && frontmatterKey(read(f) ?? '', key) === named);
    const sidecarAt = path.join(at, named);
    if (!shared && fs.lstatSync(sidecarAt, { throwIfNoEntry: false })?.isFile()) {
      fs.rmSync(sidecarAt);
      removed.push(named);
    }
  }
  return { dir: at, removed };
}

/**
 * The skills a write's or a removal's version is read with: found as `repo`'s start finds them, as the board's listing reads the version
 * the write carries back, or beside the folder alone with no `repo`. Read one way and checked another, an agent whose skill is in the
 * repository's `.claude/skills/` would be refused as changed since it was read on every save.
 */
const skillsAt = (at: string, repo: string | undefined): SkillsFound | undefined =>
  repo === undefined ? undefined : skillsFor(path.join(path.dirname(path.resolve(at)), '_'), { repo: path.resolve(repo), home: HOME });
