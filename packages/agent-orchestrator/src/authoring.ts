/**
 * What the board's builder and Agents page write: a workflow folder from its steps (`writeWorkflow`), an agent and the files beside it
 * (`writeAgent`, `removeAgent`, refused as `AgentWriteError`), and the agents of the two places the board lists them from (`agentPlaces`,
 * `listAgents`, `findAgent`).
 *
 * Beneath the controllers, beside `store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports it. A run is
 * changed by none of it: it froze its folder, and its agents, at `wf start`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  agentNameRefusal,
  agentsFolderRefusal,
  AGENTS_FOLDER,
  skillEntryOf,
  skillNameRefusal,
  SKILLS_FOLDER,
  codexModeWritten,
  formerSandbox,
  frontmatterKey,
  isReadme,
  linkRefusal,
  parseAgent,
  parseFolder,
  parseWorkflow,
  renderAgent,
  renderSkill,
  renderStep,
  withPreload,
  type SkillDraft,
  stepNameRefusal,
  WorkflowError,
  type Agent,
  type AgentDraft,
  type SkillsFound,
  type StepDraft,
  type Workflow,
} from './workflow.ts';
import { agentsFor, agentUsers, agentVersion, loadAgents, skillsFor, skillVersion, type Places } from './workflow-store.ts';
import { HOME, isDirectory } from './store.ts';

/** What `writeWorkflow` did: the folder, its steps as they now read, and its files by name — written, left as they were because they already read so, and removed. */
export type WorkflowWritten = { dir: string; steps: Workflow[]; written: string[]; kept: string[]; removed: string[] };

/**
 * A workflow folder written from its steps: what the board's builder saves, and the inverse of `loadWorkflows`.
 *
 * Judged whole before a byte is written, so a folder refused is the folder it was: where it is (`workflowPlaceRefusal`), each step's name as
 * a file's (`stepNameRefusal`), no name twice, each step rendered (`renderStep`), and then the folder as it would be, parsed in memory as
 * `loadWorkflows` parses one on disk (`parseFolder`), with the schemas its `output:` lines name read from the folder as they are. So every
 * refusal the parser has surfaces here, in its words and naming the step: a key a step does not have, `after:` naming no step, a cycle, a
 * `loop:` that is not a back edge, an `output:` naming a schema that is not in the folder. What `wf start` refuses beyond the parser — a
 * step named for another's check, `remote: true` off `claude` — is still `wf start`'s to refuse, as for a folder written by hand.
 *
 * Then the `.md` of each step not in the set is removed, before a byte is written: on a filesystem that does not tell case apart —
 * macOS's, Windows's — `Plan.md` and `plan.md` are one file, and a step renamed by case would otherwise be written and then removed under
 * its old name, which is the same file. After that each step's `<name>.md` is written, but for one whose file already reads as the step,
 * which is left as it is, comments and all, since a render has none. A `*.schema.json` is left as it is: a step names one, and the builder
 * writes none. The README is written only when `readme` is given, to the name the folder's README already has.
 *
 * A `.md` in the folder that is a link is refused by name, before any of it: a write follows a link, so a step would be rendered into
 * whatever it points at, outside the folder, and a link is not a file the write removes, so it would be left behind where its step went. A
 * linked README is refused only when a `readme` is given, since that is when it would be written.
 *
 * A draft on codex by its agent's `harness:` alone that sends its sandbox as `permissionMode` is refused (`codexModeWritten`), as
 * `renderStep` refuses one that says `harness: codex`: it would be written under the former name, which the parser still reads.
 *
 * Where: a workflow in the store's `workflows/` or in a repository's, the two places the board lists workflows from. Anywhere else only
 * with `{ anywhere: true }`, since a write removes files, and a path mistyped would remove them from a folder that is not a workflow. Its
 * agents and skills are found where a run of it would look (`lookupRoots`): in `places`, or else the repository its folder is in and the
 * store (`placesAround`). A run is not changed by any of it: it froze its folder at `wf start`.
 */
export function writeWorkflow(
  dir: string,
  steps: readonly StepDraft[],
  readme?: string,
  { anywhere = false, places }: { anywhere?: boolean; places?: Places } = {},
): WorkflowWritten {
  const at = path.resolve(dir);
  const refuse = (why: string | undefined) => {
    if (why) throw new WorkflowError(why);
  };
  refuse(agentsFolderRefusal(at));
  if (!anywhere) refuse(workflowPlaceRefusal(at));
  if (fs.existsSync(at) && !isDirectory(at))
    refuse(`${at} is a file, and a workflow is a folder of steps. Name a folder — one that is not there yet is made.`);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(at, { withFileTypes: true });
  } catch {}
  const linked = entries.find((e) => e.isSymbolicLink() && e.name.endsWith('.md') && (readme !== undefined || !isReadme(e.name)));
  if (linked) {
    refuse(
      linkRefusal(
        path.join(at, linked.name),
        "a workflow's files are its own. Writing this workflow would follow it and write into whatever it points at, outside the folder, and would not remove it when its step goes.",
      ),
    );
  }
  if (!steps.length) refuse(`no steps to write to ${at}, and a workflow has at least one. To remove the workflow, remove its folder.`);
  for (const step of steps) refuse(stepNameRefusal(step?.name));
  const twice = steps.find((step, i) => steps.findIndex((other) => other.name === step.name) !== i);
  if (twice) refuse(`two steps are named ${twice.name}, and a step is its file, ${twice.name}.md. Rename one of them.`);
  const texts = steps.map((step) => [step.name, renderStep(step)] as const);
  const read = (file: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(at, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  const where = places ?? placesAround(at);
  const agents = agentsFor(at, where);
  const parsed = parseFolder(texts, read, agents, skillsFor(at, where));
  const onCodex = steps.find(
    (step) =>
      step.permissionMode != null &&
      formerSandbox(step.permissionMode) !== undefined &&
      parsed.find((s) => s.name === step.name)?.harness === 'codex',
  );
  if (onCodex) refuse(codexModeWritten(onCodex.name, onCodex.permissionMode!));

  fs.mkdirSync(at, { recursive: true });
  const written: string[] = [];
  const kept: string[] = [];
  const put = (file: string, text: string, same: (there: string) => boolean) => {
    const there = read(file);
    if (there !== undefined && same(there)) return kept.push(file);
    fs.writeFileSync(path.join(at, file), text);
    return written.push(file);
  };
  const names = new Set(texts.map(([name]) => `${name}.md`));
  const removed = entries.filter((e) => e.isFile() && e.name.endsWith('.md') && !isReadme(e.name) && !names.has(e.name)).map((e) => e.name);
  for (const file of removed) fs.rmSync(path.join(at, file));
  for (const [name, text] of texts) {
    const step = parsed.find((s) => s.name === name);
    put(`${name}.md`, text, (there) => {
      try {
        return isDeepStrictEqual(parseWorkflow(name, there, read, agents), step);
      } catch {
        return false;
      }
    });
  }
  if (readme !== undefined)
    put(entries.find((e) => e.isFile() && isReadme(e.name))?.name ?? 'README.md', readme, (there) => there === readme);
  return { dir: at, steps: parsed, written: written.sort(), kept: kept.sort(), removed: removed.sort() };
}

/**
 * Why `writeWorkflow` does not write `at` unless told it may write anywhere, or `undefined` for a folder it writes: a workflow in the store's
 * `workflows/`, or in a repository's — `<repo>/workflows/<name>`, beside the repository's `.git`. The folder itself, not one below it, nor
 * the `workflows/` that holds it: those are the folders the board lists as workflows.
 */
function workflowPlaceRefusal(at: string): string | undefined {
  const holder = path.dirname(at);
  const store = path.resolve(HOME, 'workflows');
  if (isWorkflowsHolder(holder)) return undefined;
  return `${at} is not a workflow in the store's workflows/ (${path.join(store, '<name>')}) nor in a repository's (<repo>/workflows/<name>, beside its .git), and writing a workflow removes the files of the steps it no longer has. Write it to a folder in one of the two, or pass { anywhere: true } to write ${at} all the same.`;
}

/** Whether `dir` holds the workflows the board lists: the store's `workflows/`, or a repository's, beside its `.git`. */
function isWorkflowsHolder(dir: string): boolean {
  if (dir === path.resolve(HOME, 'workflows')) return true;
  return path.basename(dir) === 'workflows' && fs.existsSync(path.join(path.dirname(dir), '.git'));
}

/**
 * A refusal of an agent's write, in the package's words, and what kind it is: `missing` for an agent that is not there, `stale` for one
 * that changed since it was read, `exists` for a name another agent has, `in-use` for one steps still name — `users` says which, as
 * `<workflow>/<step>` — and `refused` for the rest: a place, a name, a key or a value the parser refuses.
 */
export class AgentWriteError extends WorkflowError {
  readonly why: 'missing' | 'stale' | 'exists' | 'in-use' | 'refused';
  readonly users: string[];
  constructor(message: string, why: AgentWriteError['why'] = 'refused', users: string[] = []) {
    super(message);
    this.why = why;
    this.users = users;
  }
}

/** What `writeAgent` did: the agent as it now reads, its version, and its files by name — written, and removed. */
export type AgentWritten = { dir: string; agent: Agent; version: string; written: string[]; removed: string[] };

/**
 * A file written beside an agent, named by one of the agent's own keys: the result schema its `output:` names. Its file is a plain `.json` name in the folder — no folder of its own, and not another agent's file.
 */
export type AgentSidecar = { file: string; text: string };

/** A result schema written with an agent: its file, beside the agent, and what it holds. */
export type AgentSchema = AgentSidecar;

/**
 * The agent keys that name a file beside the agent, and what a refusal calls each. `card:` is not one: an agent's card is generated from its
 * skills, and the load refuses a `card:` line, naming the file it points at as nobody's (`cardRetired`).
 */
const SIDECARS = [
  { key: 'output' as const, what: 'result schema', a: 'the result schema', suggest: (name: string) => `${name}.schema.json` },
];

/**
 * Why no agent may be written to or removed from `dir`, or `undefined`: an agent is a file in `agents/` beside the workflows the board lists
 * — the store's (`<store>/workflows/agents`) or a repository's (`<repo>/workflows/agents`). Anywhere else only with `{ anywhere: true }`.
 */
function agentPlaceRefusal(dir: string, anywhere: boolean): string | undefined {
  if (path.basename(dir) !== AGENTS_FOLDER) {
    return `${dir} is not a folder of agents: the agents the workflows name are in the ${AGENTS_FOLDER}/ beside them. Name <workflows>/${AGENTS_FOLDER}.`;
  }
  if (anywhere || isWorkflowsHolder(path.dirname(dir))) return undefined;
  return `${dir} is not the store's ${AGENTS_FOLDER}/ (${path.join(path.resolve(HOME, 'workflows'), AGENTS_FOLDER)}) nor a repository's (<repo>/workflows/${AGENTS_FOLDER}, beside its .git), the two places the board lists agents from. Write it to one of the two, or pass { anywhere: true } to write ${dir} all the same.`;
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

/**
 * An agent written from a draft (`renderAgent`): what the board's Agents page saves, and the inverse of `loadAgents` for one agent. `dir` is
 * a folder of agents, `<workflows>/agents`, and a run is not changed by any of it: a run froze its folder, and the agents its steps name, at
 * `wf start`, so a write changes what a later `wf start` freezes and nothing else.
 *
 * `version` is the agent's as it was read (`agentVersion`), or `null` for a new agent; `from` names the agent the draft was read from, when
 * it is renamed. Judged whole before a byte is written, each refusal by name: the place (`agentPlaceRefusal`), each name as a file's
 * (`agentNameRefusal`), a link where a file would be written or removed, a new agent whose name is taken, an agent not there or changed
 * since `version` was read, a rename onto another agent or of one steps still name — saying which — and then the file as it would be,
 * rendered and parsed as `loadAgents` parses one, so every key and value the parser refuses is refused here, in its words. A `card` option is
 * refused: the card is generated from the agent's skills, and a card file sent would be dropped unsaid. With `repo`, the version is read
 * with the skills a start on `repo` finds (`agentSkillsFound`), as the board lists it; without, with those beside the folder.
 *
 * `schema` is the result schema the agent's `output:` names, written beside it with it: a `.json` file's name with no folder, the one that
 * key names, not a link, and not a file another agent names — that one is its agent's to change. Without one, the file that key names is
 * read from the folder as it is. A key whose line is taken off, or pointed at another file, leaves the file it named where it is, so a field
 * cleared by mistake costs no one the schema they wrote; removing the agent takes its files with it (`removeAgent`).
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
  const refuse = (why: string | undefined, kind?: AgentWriteError['why'], users?: string[]) => {
    if (why) throw new AgentWriteError(why, kind, users);
  };
  if (Object.hasOwn(rest, 'card'))
    refuse('`card` is not written with an agent since agents card 2: its card is generated from its skills. Send the agent without it.');
  refuse(agentPlaceRefusal(at, anywhere));
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
    if (fs.existsSync(file(name)))
      refuse(`${AGENTS_FOLDER}/${name}.md is there already. Open it to change it, or give the new agent another name.`, 'exists');
  } else {
    const now = versionOf(old);
    if (now === null)
      refuse(
        `${AGENTS_FOLDER}/${old}.md is not there: it was removed since it was read. Write it as a new agent to have it back.`,
        'missing',
      );
    if (now !== version)
      refuse(
        `${AGENTS_FOLDER}/${old}.md changed since it was read (version ${version}, now ${now}), and writing it would lose what changed. Read it again, and make the change on what it holds now.`,
        'stale',
      );
  }
  if (renamed) {
    if (fs.existsSync(file(name)) && !sameFile(file(name), file(old)))
      refuse(
        `${AGENTS_FOLDER}/${name}.md is there already, and renaming ${old} to it would write over it. Give ${old} another name.`,
        'exists',
      );
    const users = agentUsers(path.dirname(at), old);
    if (users.length) refuse(inUse(old, users, `renaming it to ${name}`), 'in-use', users);
    const theirs = repoUsers(at, old, repo);
    if (theirs.length) refuse(inUseByRepo(old, theirs, repo!, `renaming it to ${name}`), 'in-use', theirs);
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
  { version, anywhere = false, repo }: { version: string; anywhere?: boolean; repo?: string },
): { dir: string; removed: string[] } {
  const at = path.resolve(dir);
  const refuse = (why: string | undefined, kind?: AgentWriteError['why'], users?: string[]) => {
    if (why) throw new AgentWriteError(why, kind, users);
  };
  refuse(agentPlaceRefusal(at, anywhere));
  refuse(agentNameRefusal(name));
  const file = path.join(at, `${name}.md`);
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    refuse(linkRefusal(file, "an agent's file is its own, and this one is not a file in the folder. Remove the link by hand."));
  const now = agentVersion(at, name, skillsAt(at, repo));
  if (now === null) refuse(`${AGENTS_FOLDER}/${name}.md is not there: it was removed already.`, 'missing');
  if (now !== version)
    refuse(
      `${AGENTS_FOLDER}/${name}.md changed since it was read (version ${version}, now ${now}). Read it again before removing it.`,
      'stale',
    );
  const users = agentUsers(path.dirname(at), name);
  if (users.length) refuse(inUse(name, users, 'removing it'), 'in-use', users);
  const theirs = repoUsers(at, name, repo);
  if (theirs.length) refuse(inUseByRepo(name, theirs, repo!, 'removing it'), 'in-use', theirs);
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
 * A write of a skill refused, as the api answers it: a skill not there (`missing`), a name already taken (`exists`), a skill that changed since
 * it was read (`stale`), or anything else judged.
 */
export class SkillWriteError extends WorkflowError {
  readonly why: 'missing' | 'exists' | 'stale' | 'refused';
  constructor(message: string, why: SkillWriteError['why'] = 'refused') {
    super(message);
    this.why = why;
  }
}

/** What `copySkill` did: the skill's folder where it now is, and its files by their path in it. */
export type SkillCopied = { dir: string; name: string; written: string[] };

/**
 * The skill `name` of the folder of skills `from` copied whole into the folder of skills `to`, under the same name: what the board's skill
 * picker does with a skill HKB ships, so an agent of yours can give it — an agent of the store finds skills in the store and the repository
 * it runs on, never in the checkout HKB ships from. A write of its own, done before and apart from any save of an agent.
 *
 * Judged whole before a byte is written, each refusal by name: `to` is a `skills/` beside the workflows the board lists — the store's, or a
 * repository's — unless `{ anywhere: true }`; the name is a skill's (`skillNameRefusal`); `from` has that skill, a folder holding a SKILL.md
 * whose card entry reads (`skillEntryOf`), so a copy is never a skill no agent could be given; nothing in it is a link, since a copy would
 * follow it and bring in whatever it points at; and `to` has no skill of that name, which a copy would write over. It is then copied into a
 * hidden folder beside where it goes and renamed into place, so a copy that fails part-way leaves no half a skill to be found.
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
      'missing',
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
      'exists',
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

const refuseSkill = (why: string | undefined, kind?: SkillWriteError['why']): void => {
  if (why) throw new SkillWriteError(why, kind);
};

/**
 * The refusals a copy and a write of a skill share, judged before either reads a byte of it: `at` is a `skills/` beside the workflows the board
 * lists — the store's, or a repository's — unless `anywhere`; `name` is a skill's (`skillNameRefusal`); and neither `at` nor the folder it is in
 * is a link, which a write would follow out of the store.
 */
function judgeSkillPlace(at: string, name: string, anywhere: boolean, verb: string, linkWhy: string): void {
  if (path.basename(at) !== SKILLS_FOLDER)
    refuseSkill(
      `${at} is not a folder of skills: the skills agents give are in the ${SKILLS_FOLDER}/ beside ${AGENTS_FOLDER}/. Name <workflows>/${SKILLS_FOLDER}.`,
    );
  if (!anywhere && !isWorkflowsHolder(path.dirname(at))) {
    refuseSkill(
      `${at} is not the store's ${SKILLS_FOLDER}/ (${path.join(path.resolve(HOME, 'workflows'), SKILLS_FOLDER)}) nor a repository's (<repo>/workflows/${SKILLS_FOLDER}, beside its .git). ${verb} to one of the two, or pass { anywhere: true } to write ${at} all the same.`,
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

/**
 * A skill of the folder of skills `to` written: made, with `{ version: null }`, or changed, with the version it was read at. What the board's
 * skill page does — a person writes a skill of their own in the store's library, where an agent of the store finds it. A skill's version is
 * digested into the version of every agent that gives it (`agentVersion`), so a change of it is a change of every one of them.
 *
 * Judged whole before a byte is written, each refusal by name: the place and the name as a copy judges them (`judgeSkillPlace`); a SKILL.md
 * that is not a file of the folder's own — a link — which the write would follow; for a skill made, a name already taken (`exists`), and a
 * change of its `preload:` alone, which has no skill to change; for one changed, a skill not there (`missing`) and one whose files moved since
 * the version was read (`stale`); and a skill the card reader would refuse (`renderSkill`, `withPreload`), in its words. A skill whose SKILL.md
 * does not read may be written — that is how it is mended — so only what is written must read. A skill made is written in a hidden folder
 * beside where it goes and renamed into place, and a change through a hidden file beside SKILL.md, so a write that fails leaves no half a skill.
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
      throw new SkillWriteError(err instanceof Error ? err.message : String(err));
    }
  };

  if (version === null) {
    if (!whole)
      refuseSkill(
        `${named} is a change of \`preload:\` alone, and there is no skill to change: write the whole skill — its description and instructions — to make it.`,
      );
    if (fs.lstatSync(target, { throwIfNoEntry: false })) {
      refuseSkill(
        `${named} is there already, in ${at}, and a new skill would write over it. Give it another name, or open ${name} and change it.`,
        'exists',
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
      refuseSkill(`${named} is not in ${at}: it was removed. Write it again as a new skill.`, 'missing');
    const now = skillVersion(target);
    if (now !== version)
      refuseSkill(`${named} changed since it was read (version ${version}, now ${now}). Read it again before changing it.`, 'stale');
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

/**
 * Where a workflow folder's runs would look for its agents and skills beside its own (`Places`): the repository it is in — `<repo>/workflows/<name>`,
 * a checkout by its `.git` — and the store. A folder of the store's is only the store's.
 */
export function placesAround(workflowDir: string): Places {
  const repo = path.dirname(path.dirname(path.resolve(workflowDir)));
  return { ...(fs.existsSync(path.join(repo, '.git')) ? { repo } : {}), home: HOME };
}

/**
 * Where the skills of the agents in `dir` (`<workflows>/agents`) are found, as a start finds them for a workflow beside it (`skillsFor`): that
 * root first, then `repo`'s `.claude/`, then the store. What a card (`cardSkills`) and an agent's version are read with outside a start, so the
 * card names the skills a run would be given and its version moves with them.
 */
export const agentSkillsFound = (dir: string, repo: string): SkillsFound =>
  skillsFor(path.join(path.dirname(path.resolve(dir)), '_'), { repo: path.resolve(repo), home: HOME });

/**
 * The skills a write's or a removal's version is read with: found as `repo`'s start finds them, as the board's listing reads the version the
 * write carries back, or beside the folder alone with no `repo`. Read one way and checked another, an agent whose skill is in the
 * repository's `.claude/skills/` would be refused as changed since it was read on every save.
 */
const skillsAt = (at: string, repo: string | undefined): SkillsFound | undefined =>
  repo === undefined ? undefined : agentSkillsFound(at, repo);

/** Where an agent may be, in order: the repository's `workflows/agents`, then your store's. The board's two places (`sourcesOf`, apps/api). */
export const agentPlaces = (repo: string): Array<{ from: AgentPlace; dir: string }> => [
  { from: 'repo', dir: path.join(path.resolve(repo), 'workflows', AGENTS_FOLDER) },
  { from: 'yours', dir: path.join(HOME, 'workflows', AGENTS_FOLDER) },
];

export type AgentPlace = 'repo' | 'yours';

/** Every agent of both places, in the order the places come, each read now. An agent that does not read carries its refusal. */
export function listAgents(repo: string): Array<{ from: AgentPlace; dir: string; name: string; agent: Agent | WorkflowError }> {
  return agentPlaces(repo).flatMap(({ from, dir }) =>
    [...loadAgents(dir).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, agent]) => ({ from, dir, name, agent })),
  );
}

/**
 * One agent by name, from `from` when it is given and otherwise the first place that has it. Refused, naming the fix, when no place has it,
 * when both do and nothing says which, or when the file is there and does not read — that last in the parser's own words.
 */
export function findAgent(name: string, repo: string, from?: AgentPlace): { from: AgentPlace; dir: string; agent: Agent } {
  const places = agentPlaces(repo).filter((place) => from === undefined || place.from === from);
  const found = places.flatMap((place) => {
    const agent = loadAgents(place.dir).get(name);
    return agent === undefined ? [] : [{ ...place, agent }];
  });
  const where = (list: ReadonlyArray<{ from: AgentPlace }>) => list.map((p) => `--from ${p.from}`).join(' or ');
  if (!found.length) {
    const has = agentPlaces(repo)
      .filter((place) => fs.existsSync(place.dir))
      .map((place) => `${place.dir} (${[...loadAgents(place.dir).keys()].sort().join(', ') || 'no agents'})`);
    throw new WorkflowError(
      `no agent named ${name}${from ? ` in ${from}` : ''}. Looked in ${
        has.length
          ? has.join(' and ')
          : agentPlaces(repo)
              .map((p) => p.dir)
              .join(' and ')
      }. wf agents lists them.`,
    );
  }
  if (found.length > 1)
    throw new WorkflowError(`${name} is an agent in both places — ${found.map((p) => p.dir).join(' and ')}. Say which: ${where(found)}.`);
  const one = found[0];
  if (one.agent instanceof Error) throw one.agent;
  return { from: one.from, dir: one.dir, agent: one.agent };
}
