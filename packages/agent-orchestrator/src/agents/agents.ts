/**
 * An agent: a markdown file in `agents/` beside the workflows, whose frontmatter a step names with `agent:` and inherits. Its keys
 * (`AGENT_KEYS`), read by `parseAgent` and written back by `renderAgent`, the skills it names and what they cost a turn, and the card it is
 * published with (`agentCard`). And the agent rendered for Claude Code: what `nemia start` writes for a step whose agent has instructions,
 * skills or a harness prompt other than `keep` (`harnessPrompt:`), and what the tick hands Claude Code to read it. Pure: the layout, the
 * prompt's text and the flags; `writeAgentFiles` in agents.store.ts writes it.
 *
 * Under `runs/<id>/agents/<step>/`, frozen with the run as its workflow is:
 *
 * - `prompt.md`, the agent's instructions, then the person's custom instructions for it (`customInstructions`), then the rules of the
 *   factory the run was started in (`factoryRules`), each under the heading of its layer's number and owner (`headedLayers`), then a
 *   line naming each skill it is given, then the whole text of each skill that
 *   asks to be told whole (`preload: true`): appended to Claude Code's own prompt, which is kept (`--append-system-prompt-file`), or put
 *   in its place for `harnessPrompt: replace` (`--system-prompt-file`);
 * - `nemia-<agent>/`, a plugin of the step's own (`--plugin-dir`): its `skills/<name>/`, each copied whole from where the load found it,
 *   so a session loads them as `nemia-<agent>:<name>`; and, for `harnessPrompt: no-coding`, `output-styles/no-coding.md`, a style that says
 *   `keep-coding-instructions: false`, chosen by its namespaced name, since a bare one is echoed and not applied.
 *
 * A session is given its own plugin's skills and no other, the harness's built-in ones included: its task names them, a closed list
 * (`enabledSkillsOf`), rather than a list of names turned off.
 *
 * The step's brief is then its own note alone (`briefBody`): the instructions are in Claude Code's prompt. A codex step is handed them in
 * its brief, and so is a step that continues another's session (`resume:`), whose prompt stays that session's, and a step on a remote A2A
 * agent, which keeps its operator's.
 */
import path from 'node:path';
import type { DefinitionVersionRefusal } from '../../contracts/definition-version.contract.ts';
import { takenAt } from '../folder/folder.ts';
import {
  AGENTS_FOLDER,
  isReadme,
  isStepKey,
  refuse,
  REFUSED,
  SKILLS_FOLDER,
  splitFrontmatter,
  type StepAgent,
  type Workflow,
  type WorkflowError,
} from '../step/step.ts';
import { bareSkillOf, composedRefusal, serverNamesOf, serversRefusal, SKILL_NAME, skillNamesOf } from '../keys/index.ts';
import {
  codexModeWritten,
  codexSandboxNamed,
  refuseFenceBlock,
  fencedPairs,
  FORMER_HARNESS_PROMPTS,
  FORMER_KEYS,
  FORMER_OWN_KEYS,
  formerKeyWritten,
  harnessPromptNamed,
  readKeys,
} from '../former/former.ts';
import { headedLayers, OVERRIDABLE, stepFrom, type Overridable } from '../workflow/index.ts';
import type { AgentSkill } from '../skills/skills.ts';
import { frontmatterOrNull, renderFrontmatter, type FrontmatterPair } from '../frontmatter/frontmatter.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';

/**
 * The keys an agent file sets: the job it holds (`role:`, as `Product engineer`; its own name is its file's); what it is for, in a line;
 * the skills it is given (`skills:`), which are also what its card says it can do; what becomes of Claude Code's own prompt
 * (`harnessPrompt:`); the MCP servers of the checkout its sessions load, by name (`mcp:`); and who does the work and how. A step that names
 * the agent (`agent:`) takes the last of those as its own defaults, and a key it sets itself wins, but its `disallowedTools:` adds to the
 * agent's, and the other fence keys (`tools`, `allowedTools`, `permissionMode`, `sandbox`) may only narrow the agent's (`fenceRefusal`).
 * Everything else a step sets is wiring — where the step sits in its workflow, what it reads, how it is judged and for how long — and
 * belongs on the step: an agent file that sets one is refused by name.
 */
export const AGENT_KEYS = [
  'role',
  'description',
  'skills',
  'harnessPrompt',
  'mcp',
  'overridable',
  'harness',
  'model',
  'effort',
  'context',
  'permissionMode',
  'sandbox',
  'tools',
  'disallowedTools',
  'allowedTools',
  'remote',
  'output',
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];
/**
 * The agent keys that are the agent's own, which no step takes from it: the job it holds, what it is for, the skills it is given, its
 * harness prompt and the MCP servers its sessions load. A step's `skills:` and `mcp:` are lines of its own that add to its agent's,
 * never the agent's read as the step's default, and code outside the package that reads the role keys leaves them out
 * (`apps/api/src/workflows/builder.ts`'s `ROLE_KEYS` and `apps/api/src/agents/agents.ts`'s, off this list; `apps/web/src/lib/agents.ts` by
 * hand).
 */
export const AGENT_OWN_KEYS = ['role', 'description', 'skills', 'harnessPrompt', 'mcp', 'overridable'] as const;
export type AgentOwnKey = (typeof AGENT_OWN_KEYS)[number];
/** The keys a step takes from its agent: every agent key but its own (`AGENT_OWN_KEYS`). */
export type RoleKey = Exclude<AgentKey, AgentOwnKey>;
const isAgentKey = (key: string): key is AgentKey => (AGENT_KEYS as readonly string[]).includes(key);
const isOwnKey = (key: string): key is AgentOwnKey => (AGENT_OWN_KEYS as readonly string[]).includes(key);
/** What each of an agent's own lines is called where a draft gives it: its field, not one of its keys. */
const OWN_LINE: Record<AgentOwnKey, string> = {
  role: 'role',
  description: 'description',
  skills: 'skills',
  harnessPrompt: "Claude Code's prompt",
  mcp: 'MCP servers',
  overridable: 'what a step may override',
};

/**
 * What becomes of Claude Code's own prompt — the harness's system prompt — for an agent's steps (`harnessPrompt:`): `keep` keeps it and
 * appends the agent's instructions after it (`--append-system-prompt-file`); `no-coding` keeps it less its coding instructions, through
 * an output style that says `keep-coding-instructions: false`, and appends them the same; `replace` puts the instructions in its place
 * (`--system-prompt-file`). Absent is `keep`. Claude Code's alone: codex is handed its instructions in the brief. Its former line,
 * `systemPrompt: default | no-coding | own`, is still read (`FORMER_OWN_KEYS`).
 */
export const HARNESS_PROMPTS = ['keep', 'no-coding', 'replace'] as const;
export type HarnessPrompt = (typeof HARNESS_PROMPTS)[number];

/**
 * Why `name` cannot be a skill's folder, or `undefined`: what a skill is copied or written under is refused as `skills:` refuses a name.
 */
export function skillNameRefusal(name: unknown): string | undefined {
  if (typeof name === 'string' && SKILL_NAME.test(name) && name.length <= 64) return undefined;
  const shown = typeof name === 'string' ? `\`${name}\`` : JSON.stringify(name);
  return `${shown} is not a skill's name: a skill is a folder in ${SKILLS_FOLDER}/, named in lowercase words joined by dashes, 64 characters at most, as Claude Code names one — write-a-note, say.`;
}

/**
 * What a skill costs an agent's sessions, in tokens, estimated at four characters a token (the page says "about"): `listed`, its name and
 * description, which Claude Code lists to every session of an agent that gives it; `body`, its SKILL.md's body, which a session reads when
 * it loads the skill — or, for a skill that says `preload: true`, which the run appends to Claude Code's own prompt, so it is carried on
 * every turn (cached). `perTurn` is what every turn carries: the listing, and the body too when it is preloaded. Pure, and never refuses: a
 * SKILL.md that does not read costs what its text would.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/** Tokens, about: four characters to a token, rounded up. */
export const tokensAbout = (text: string): number => Math.ceil(text.length / 4);

/**
 * `SkillCost` of the skill `id`, from its SKILL.md's `text`: one whose frontmatter never closes is read as all body, and one whose
 * frontmatter does not read (`frontmatterOrNull`) as having no description and no preload.
 */
export function skillTurnCost(id: string, text: string): SkillCost {
  let block: string | null = null;
  let body = text;
  try {
    ({ block, body } = splitFrontmatter(`${id}/SKILL.md`, text));
  } catch {}
  const entries = block === null ? [] : (frontmatterOrNull(block)?.entries ?? []);
  const said = (key: string): string => {
    const value = entries.find((entry) => entry.key === key)?.value;
    return typeof value === 'string' ? value.trim() : '';
  };
  const preload = said('preload') === 'true';
  const listed = tokensAbout(`${id}: ${said('description')}`);
  const told = tokensAbout(body);
  return { preload, listed, body: told, perTurn: listed + (preload ? told : 0) };
}

/** A skill asked by the name a `skills:` line gives it: the folder it is, why it cannot be used, or nothing where no place has it. */
export type SkillLookup = { get(name: string): string | WorkflowError | undefined };

/**
 * Where the skills a workflow's agents name were found. `at` answers a name as a `skills:` line writes it: the folder the skill is
 * (`<place>/skills/<name>`, holding `SKILL.md`) or why it cannot be used — a name two places of one repository both have — and, for a
 * skill named with its folder (`folder:name`), the folder it is in that folder's own skills, or why not, never nothing. `all` lists the
 * skills of the places looked in, by bare name: no skill named with its folder is in it, since none is found but by its name. `looked`
 * is those places, in order, for the refusal of a name none has. `skillsFor` in `skills/read.store.ts` reads them.
 */
export type SkillsFound = { at: SkillLookup; all: ReadonlyMap<string, string | WorkflowError>; looked: readonly string[] };

/**
 * An agent: a file in `agents/`, its frontmatter the role keys it sets (`AGENT_KEYS`) and its body its instructions — what every step that
 * names it is told first. `keys` are as written, each judged when the file was read; `read` answers for a file beside the agent, the schema
 * its `output:` names.
 */
export type Agent = {
  name: string;
  /** The job it holds, in a few words (`role:`): `Product engineer`. Its name is its own, and a step names it by that. */
  role?: string;
  description?: string;
  /**
   * The skills its steps are given, each as its `skills:` line names it: a folder in a `skills/` the load finds, or `folder:name`, a
   * skill of the repository's folder `folder` (`SkillsFound`).
   */
  skills?: string[];
  /** What becomes of Claude Code's own prompt (`HARNESS_PROMPTS`), a former line read as its word now; absent is `keep`. */
  harnessPrompt?: HarnessPrompt;
  /**
   * The MCP servers its sessions load, by the names the checkout's `.mcp.json` gives them (`mcp:`). Absent, its sessions load only those a
   * step's own line adds: a server is loaded only where an agent or a step names it.
   */
  mcp?: string[];
  /**
   * What a step may override of it (`overridable:`, each one of `OVERRIDABLE`): a step that writes anything else is refused at load
   * (`offerRefusal`). Absent, a step may override everything it takes from the agent, as before the line.
   */
  overridable?: Overridable[];
  keys: Partial<Record<RoleKey, string>>;
  body: string;
  /**
   * What a person adds to the agent without rewriting it: the words of `custom-instructions/<name>.md` in their store, read by the load
   * (`agentsFor`), never from the agent's own file. Words only: they set no key.
   */
  customInstructions?: string;
  read: (file: string) => string | undefined;
};

/** The folder of a person's store (`WF_ROOT`) that holds their custom instructions, one `<agent>.md` per agent name. */
export const CUSTOM_INSTRUCTIONS_FOLDER = 'custom-instructions';

/**
 * Why `text`, the custom instructions of `file`, cannot be taken, or `undefined` when it can: a frontmatter block, since custom
 * instructions only add words and never set a key — a fence, a tool, a model, a mode or a skill is the agent's file's or a step's.
 */
export function customInstructionsRefusal(file: string, text: string): string | undefined {
  if (!/^\uFEFF?---[ \t]*(\r?\n|$)/.test(text)) return undefined;
  return `${file} opens with a frontmatter block, a first line of \`---\`. Custom instructions only add words: they set no key, and so never widen an agent's fence, give it a tool, or change its model, mode or skills. Put a key in the agent's own file or on a step, and start the words with a word.`;
}

/** The agents a folder of workflows has, by name: each read, or why it cannot be — thrown only at a step that names it. */
export type Agents = ReadonlyMap<string, Agent | WorkflowError>;

/**
 * Claude Code's own subagent keys that are not the run's, as its `/agents` wizard and its documentation write them into `.claude/agents/`
 * (2.1.282). `color` is read and ignored: it picks the colour Claude Code shows the subagent's name in and holds nothing back, and the
 * wizard writes it on every file. It is not kept, so the board's save of an agent does not write it back.
 */
export const CLAUDE_CODE_IGNORED: readonly string[] = ['color'];

/**
 * Claude Code's own subagent keys the run refuses, each with what does the work in a run: each changes what a session may do or has, and
 * the run carries none of them to its sessions, so a line read and dropped would be a constraint nobody enforces (as `fileRuleRefusal`).
 */
const CLAUDE_CODE_REFUSED: Record<string, string> = {
  maxTurns: "a run bounds a session by the step's `budget:` and `deadlineSeconds:`, never by a count of turns",
  mcpServers:
    "a run takes no MCP server defined in an agent's file; name the servers of the repository's `.mcp.json` its sessions load on an `mcp:` line, as `mcp: playwright`",
  hooks:
    "a run starts no hooks of an agent's own; hooks go in the repository's `.claude/settings.json`, which its sessions read in a checkout Claude Code trusts",
  memory:
    "a run keeps no memory of an agent's own between sessions: what a step knows is its brief, its workspace and the session it continues",
  isolation: "where a step works is the step's `workspace:` — a worktree of its own unless it says `main` or `folder`",
};

/**
 * Why an agent file may not set `key`, or `undefined` for a key it may. `file` is what the refusal calls it: `agents/<name>.md`. `name` is
 * one it may: Claude Code's own agent files say their name, and `parseAgent` holds it to the file's.
 */
function agentKeyRefusal(file: string, key: string): string | undefined {
  if (isAgentKey(key) || key === 'name' || Object.hasOwn(FORMER_OWN_KEYS, key) || CLAUDE_CODE_IGNORED.includes(key)) return undefined;
  if (key === 'card') return cardRetired(file, 'card');
  if (Object.hasOwn(CLAUDE_CODE_REFUSED, key)) {
    return `${file}: \`${key}\` is Claude Code's own subagent key, and a run does not carry it to its sessions — ${CLAUDE_CODE_REFUSED[key]}. Delete the line to use this agent in a run: a key the run does not read is a constraint nobody enforces.`;
  }
  if (key === 'agent') {
    return `${file}: \`agent\` is a step's key, which attaches an agent to the step, and an agent does not name another. Write here what this agent is told and runs with, or give the step the other agent.`;
  }
  const roles = AGENT_KEYS.join(', ');
  if (isStepKey(key)) {
    return `${file}: \`${key}\` is wiring, and belongs on the step: an agent says who does the work and how — ${roles} — and a step says where it sits in its workflow, what it reads and how it is judged. Move the line to each step that names this agent.`;
  }
  if (Object.hasOwn(REFUSED, key)) return `${file}: an agent may not set \`${key}\` — ${REFUSED[key]}.`;
  return `${file}: \`${key}\` is not a key an agent has. An agent's keys are: ${roles}. Correct the spelling or delete the line — a key the run does not read is a constraint nobody enforces.`;
}

/**
 * One agent, from its file's text: `name` is the file's, minus `.md`. Each value is judged as a step's would be, in the file's name, so a
 * line no step could run with is refused where it is written — a step that sets a key of its own is judged again with it. The body may be
 * empty: an agent that only sets how its steps run. `color` (`CLAUDE_CODE_IGNORED`) is read and dropped, a `skills:` line that names a
 * card file is refused (`cardRetired`), an `mcp:` line is read as the server names it lists (`serverNamesOf`), and the former
 * `systemPrompt:` line is read as `harnessPrompt:` (`harnessPromptOf`).
 */
export function parseAgent(name: string, text: string, read?: (file: string) => string | undefined): Agent {
  const file = `${AGENTS_FOLDER}/${name}.md`;
  const { block, body } = splitFrontmatter(file, text);
  const {
    meta: {
      role,
      description,
      skills: listed,
      harnessPrompt: prompt,
      mcp: servers,
      overridable: offered,
      systemPrompt: former,
      name: said,
      color: _,
      ...written
    },
    spelled,
    block: fenced,
  } = block === null
    ? { meta: {} as Partial<Record<AgentKey | 'name' | 'color' | 'systemPrompt', string>>, spelled: {}, block: undefined }
    : readKeys<AgentKey | 'name' | 'color' | 'systemPrompt'>(file, block, (key) => agentKeyRefusal(file, key));
  if (said !== undefined && said !== name) {
    refuse(
      `${file}: \`name: ${said}\` is not the file's name, and an agent is named by its file: a step names this one \`agent: ${name}\`. Write \`name: ${name}\`, or delete the line.`,
    );
  }
  refuseFenceBlock(file, fenced, written.harness);
  if (listed !== undefined && isCardFile(listed)) refuse(cardRetired(file, 'skills', listed));
  const keys = codexSandboxNamed(file, written as Partial<Record<RoleKey, string>>, written.harness);
  const step = stepFrom(file, keys, body, read, spelled);
  const skills = skillNamesOf(file, listed);
  const harnessPrompt = harnessPromptOf(file, prompt, former);
  if (harnessPrompt === 'replace' && !body.trim()) {
    refuse(
      `${file}: \`${prompt === undefined ? `systemPrompt: ${former}` : 'harnessPrompt: replace'}\` puts the agent's instructions in place of Claude Code's own prompt, and this agent has none: its sessions would start with no prompt at all. Write its instructions below the frontmatter, or delete the line.`,
    );
  }
  const mcp = serverNamesOf(file, servers);
  const composed = composedRefusal(file, skills, harnessPrompt, step) ?? serversRefusal(file, mcp, step);
  if (composed !== undefined) refuse(composed);
  return {
    name,
    ...(role !== undefined && { role }),
    ...(description !== undefined && { description }),
    ...(skills !== undefined && { skills }),
    ...(harnessPrompt !== undefined && { harnessPrompt }),
    ...(mcp !== undefined && { mcp }),
    ...overridableOf(file, offered),
    keys,
    body,
    read: read ?? (() => undefined),
  };
}

/**
 * `overridable:` as the agent's field, the list of what a step may override of it, each one of `OVERRIDABLE` — none for no line.
 * Refused: a word not in the list, naming it and the list.
 */
function overridableOf(file: string, written: string | undefined): { overridable?: Overridable[] } {
  if (written === undefined) return {};
  const words = written
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
  const unknown = words.find((word) => !(OVERRIDABLE as readonly string[]).includes(word));
  if (unknown !== undefined) {
    refuse(
      `${file}: \`overridable: ${written}\` names \`${unknown}\`, which is not something a step may override. A step may override ${OVERRIDABLE.join(', ')}: name those this agent offers, or delete the line, and a step may override all of them.`,
    );
  }
  return { overridable: [...new Set(words)] as Overridable[] };
}

/** Whether a `skills:` value is a card's file, as the line's former use named one: one `.json` file. No skill's name ends so. */
export const isCardFile = (value: string): boolean => !value.includes(',') && /\.json$/i.test(value.trim());

/**
 * The refusal of a card file an agent names — by `card:`, or by a `skills:` line that names one (`isCardFile`) — since an agent's card is
 * generated from its skills (`cardSkills` in `skills/read.store.ts`). Refused rather than read and dropped: a line the run
 * reads and ignores is a constraint nobody enforces, and a person editing that file would see no change on the card.
 */
export function cardRetired(file: string, key: 'card' | 'skills', named?: string): string {
  const line = named === undefined ? `\`${key}\`` : `\`${key}: ${named}\``;
  const it = named === undefined ? 'the file it names' : named;
  return `${file}: ${line} names a card file, which is retired: an agent's card is generated from its \`skills:\`, an entry for each skill made from its SKILL.md's frontmatter (its \`title:\` or \`name:\`, \`description:\`, \`tags:\` and \`examples:\`), and from the agent's own \`description:\` when it has none. Delete the line, and ${it} beside the agent; to say what the agent can do, give it skills.`;
}

/**
 * `harnessPrompt:` as one of `HARNESS_PROMPTS`, or the former `systemPrompt:` line (`FORMER_OWN_KEYS`) as the word it is now
 * (`harnessPromptNamed`); refused otherwise, and when both lines are set. Under the new key only the new words are read: a file that says
 * `harnessPrompt:` was written after the rename, and a former word there is a slip, refused naming the word it is now.
 */
function harnessPromptOf(file: string, written: string | undefined, former: string | undefined): HarnessPrompt | undefined {
  if (written !== undefined && former !== undefined) {
    refuse(
      `${file}: \`harnessPrompt: ${written}\` and \`systemPrompt: ${former}\` are both set, and they are one key: \`systemPrompt:\` is the former name of \`harnessPrompt:\`. Keep the \`harnessPrompt:\` line and delete the other.`,
    );
  }
  const word = written ?? (former === undefined ? undefined : harnessPromptNamed(former));
  if (word === undefined) return undefined;
  if ((HARNESS_PROMPTS as readonly string[]).includes(word)) return word as HarnessPrompt;
  const line = written === undefined ? `systemPrompt: ${former}` : `harnessPrompt: ${written}`;
  const slip = Object.hasOwn(FORMER_HARNESS_PROMPTS, word)
    ? ` \`${word}\` is the former word, under \`systemPrompt:\`, for \`${FORMER_HARNESS_PROMPTS[word]}\`: write \`harnessPrompt: ${FORMER_HARNESS_PROMPTS[word]}\`.`
    : '';
  return refuse(
    `${file}: \`${line}\` is not one of ${HARNESS_PROMPTS.join(', ')}.${slip} \`keep\` keeps Claude Code's own prompt and appends the agent's instructions after it; \`no-coding\` keeps it less its coding instructions; \`replace\` puts the agent's instructions in its place. Without the line, it is \`keep\`.`,
  );
}

/**
 * An agent as it is written back: what `renderAgent` takes, and what `parseAgent` reads — its name, the file's, its description, its keys
 * as written (`200k`, `Read, Grep`), and its instructions. A key unset is left out, or `null`.
 */
export type AgentDraft = {
  name: string;
  role?: string | null;
  description?: string | null;
  /** The skills it is given, as written: `review-a-change, write-a-note`. */
  skills?: string | null;
  /** What becomes of Claude Code's own prompt, as written: `keep`, `no-coding` or `replace`. */
  harnessPrompt?: string | null;
  /** The MCP servers its sessions load, as written: `playwright, docs`. */
  mcp?: string | null;
  /**
   * What a step may override of it, as written: `model, fence, skills`. `null` takes the line out; absent keeps the line its file has
   * (`writeAgent`), so a page that does not know the line cannot widen the agent's offer by saving.
   */
  overridable?: string | null;
  keys: Partial<Record<RoleKey, string | null>>;
  body: string;
};

/**
 * Refuses what a draft from a page older than the format sends, and nothing writes: the former `systemPrompt` (`FORMER_OWN_KEYS`), a
 * `card`, or a `skills:` naming a card file (`cardRetired`).
 */
function refuseStale(file: string, draft: AgentDraft): void {
  if ((draft as { systemPrompt?: unknown }).systemPrompt != null) refuse(formerKeyWritten(file, 'systemPrompt'));
  const sent = (draft as { card?: unknown }).card;
  if (sent != null)
    refuse(
      `${cardRetired(file, 'card', typeof sent === 'string' ? sent : JSON.stringify(sent))} A page that sends it is stale: reload it, and save again.`,
    );
  if (draft.skills != null && isCardFile(String(draft.skills))) {
    refuse(`${cardRetired(file, 'skills', String(draft.skills))} A page that sends it is stale: reload it, and save again.`);
  }
}

/**
 * An agent as its file: the frontmatter, its own lines first (`AGENT_OWN_KEYS`) and then each role key it sets, in `AGENT_KEYS`' order, as
 * written; then its instructions. The inverse of `parseAgent`: an agent it read renders to a file it reads back as the same agent, which
 * `test/write-agent.test.ts` holds over every agent of this repository's team. Pure. A file's comments are not on the agent, so a
 * render has none.
 *
 * As `renderStep`, it judges nothing the parser judges: a value the parser would refuse is written as given, and `writeAgent` parses what
 * it rendered before it writes. Refused here is only what a file cannot hold: a key an agent may not set — `agent:`, a step's wiring, one
 * no agent has — in the parser's words (`agentKeyRefusal`), since it would be written and then refused, or dropped; one of its own lines
 * among the keys, where it would be written twice; a card file (`cardRetired`), which a stale page sends as `card` or as a `skills:` naming
 * one, and which is written nowhere. Each value is written trimmed, through `renderFrontmatter`: quoted where plain would read otherwise
 * (`: `, ` #`), and a value with a line break as a literal block.
 */
export function renderAgent(draft: AgentDraft): string {
  const file = `${AGENTS_FOLDER}/${draft.name}.md`;
  const keys = (draft.keys ?? {}) as Record<string, string | null | undefined>;
  for (const key of Object.keys(keys)) {
    if (keys[key] == null) continue;
    if (key === 'name')
      refuse(`${file}: \`name\` is the agent's file, and it is written as the draft's name — not a key. Give it as the name.`);
    if (isOwnKey(key))
      refuse(`${file}: \`${key}\` is the agent's own line, not one of its role keys — give it as the ${OWN_LINE[key]}, once.`);
    if (Object.hasOwn(FORMER_KEYS, key) || Object.hasOwn(FORMER_OWN_KEYS, key)) refuse(formerKeyWritten(file, key));
    const refused = agentKeyRefusal(file, key);
    if (refused !== undefined) refuse(refused);
  }
  if (keys.harness === 'codex' && keys.permissionMode != null) refuse(codexModeWritten(file, keys.permissionMode));
  refuseStale(file, draft);
  const own: Record<AgentOwnKey, string | null | undefined> = {
    role: draft.role,
    description: draft.description,
    skills: draft.skills,
    harnessPrompt: draft.harnessPrompt,
    mcp: draft.mcp,
    overridable: draft.overridable,
  };
  const values: Array<[string, string | null | undefined]> = AGENT_KEYS.map((key) => [key, isOwnKey(key) ? own[key] : keys[key]]);
  const pairs = values.flatMap(([key, value]): FrontmatterPair[] => (value == null ? [] : [[key, String(value).trim()]]));
  const body = String(draft.body ?? '').trim();
  if (pairs.length) return `---\n${renderFrontmatter(fencedPairs(pairs, keys.harness?.trim() || undefined))}---\n${body}\n`;
  return /^---[ \t]*(?:\n|$)/.test(body) ? `---\n\n---\n${body}\n` : body ? `${body}\n` : '';
}

/**
 * The draft of the agent `name` whose file holds `text`, as `renderAgent` takes it back: read by `parseAgent`, with `read` the file a
 * result schema names beside it where it was read from a folder, so what it refuses is refused here in its words, the former
 * `systemPrompt:` read as `harnessPrompt:` and `color` dropped. Pure.
 */
export function agentDraftOf(name: string, text: string, read?: (file: string) => string | undefined): AgentDraft {
  const agent = parseAgent(name, text, read);
  return {
    name,
    role: agent.role ?? null,
    description: agent.description ?? null,
    skills: agent.skills?.length ? agent.skills.join(', ') : null,
    harnessPrompt: agent.harnessPrompt ?? null,
    mcp: agent.mcp?.length ? agent.mcp.join(', ') : null,
    overridable: agent.overridable === undefined ? null : agent.overridable.join(', '),
    keys: agent.keys,
    body: agent.body,
  };
}

/**
 * A local agent described in the A2A protocol's terms — its name, what it is for, what it can do — and **not** an A2A Agent Card. Protocol
 * 1.0, as `specification/a2a.proto` in a2aproject/A2A and the specification's Agent Card section define it.
 *
 * The protocol marks `supported_interfaces` REQUIRED: it is the list of URLs and bindings a client would call the agent at. Nothing here
 * serves this agent over A2A, so there is no URL to give, and this leaves the field out rather than give an address that does not answer. A
 * document missing a REQUIRED field is not a valid `AgentCard`, so everything that prints this says so in the same breath (`nemia agents
 * card` on stderr, the api's `servedOverA2A: false`), and `test/agent-card.test.ts` pins the omission, which only
 * code that serves a card over A2A may lift.
 *
 * `provider`, `documentationUrl`, `iconUrl`, `securitySchemes`, `security` and `signatures` are left out for the same reason — nothing here
 * fills them honestly. `capabilities` in A2A are protocol features, not reach: streaming, push notifications, an extended card. None of the
 * three exists here, so all three are false. What an agent can do is its card's `skills`: an entry for each skill `skills:` gives its
 * sessions, read off the skill's SKILL.md (`skillEntryOf`), or one made from the agent's own description when it gives none (`ownSkill`).
 */
export type AgentCardShape = {
  name: string;
  description: string;
  version: string;
  capabilities: { streaming: boolean; pushNotifications: boolean; extendedAgentCard: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
};

/**
 * The card-shaped description of `agent`, at `version` — what `nemia agents card` prints and the api answers with, one builder so the two
 * can never disagree. Pure. The JSON is spelled as the specification's sample card spells it, camelCase.
 *
 * `defaultInputModes` is `text/plain`: a step is handed a composed brief and nothing else. `defaultOutputModes` is `application/json`:
 * every closeout is a JSON object. An agent's `output:` names a JSON Schema, and A2A describes an output's *media type*, never its schema —
 * there is no field for it, so it contributes the media type and nothing more.
 *
 * `skills` are the card's entries, generated from the skills the agent is given (`cardSkills` in `skills/read.store.ts`, which reads their
 * SKILL.md files). Refused, rather than printed hollow: an agent with no `description:`, and a card with no entry, both of which the
 * protocol marks REQUIRED.
 */
export function agentCard(agent: Agent, version: string, skills: readonly AgentSkill[]): AgentCardShape {
  const named = `${AGENTS_FOLDER}/${agent.name}.md`;
  if (!agent.description?.trim()) refuse(noDescription(agent.name));
  if (!skills.length) {
    refuse(
      `${named}: its card has no skills, and the A2A protocol marks a card's skills REQUIRED. They are generated: an entry for each skill its \`skills:\` gives, or one made from its own description when it gives none (\`cardSkills\`).`,
    );
  }
  return {
    name: agent.name,
    description: agent.description.trim(),
    version,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [...skills],
  };
}

/** The refusal of a card for an agent with no `description:`. */
const noDescription = (name: string): string =>
  `${AGENTS_FOLDER}/${name}.md has no \`description:\`, and the A2A protocol marks a card's description REQUIRED. Write one line saying when to attach this agent to a step.`;

/**
 * The one card entry of an agent given no skills, made from its own description: its id and name the agent's, its tags the agent's name, as
 * a skill with no tags is tagged with its own. Refused for an agent with no `description:`, which the entry and the card both need.
 */
export function ownSkill(agent: Pick<Agent, 'name' | 'description'>): AgentSkill {
  const description = agent.description?.trim();
  if (!description) refuse(noDescription(agent.name));
  return { id: agent.name, name: agent.name, description, tags: [agent.name] };
}

/**
 * Why `name` cannot be an agent's name, or `undefined` when it can. An agent is its file, `agents/<name>.md`, and a step names it with
 * `agent: <name>`: so a name is one file's in that folder, not hidden, not the README's, and one a line of frontmatter can hold.
 */
export function agentNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its file is named, without .md — reviewer, say.';
  if (typeof name !== 'string' || !name.trim())
    return `An agent has no name, and an agent is named by its file in ${AGENTS_FOLDER}/. ${fix}`;
  const as = `\`${name}\` is not an agent's name:`;
  if (/[\\/]/.test(name)) return `${as} an agent is a file in ${AGENTS_FOLDER}/, and a slash names a file in another folder. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(name))
    return `${as} it holds a control character — ${JSON.stringify(name)} — which a line of frontmatter cannot. ${fix}`;
  if (name.startsWith('.'))
    return `${as} a name that starts with a dot is a hidden file, which a person listing ${AGENTS_FOLDER}/ does not see. ${fix}`;
  if (name !== name.trim())
    return `${as} \`agent:\` is trimmed as it is read, so no step could name it. Write it without the spaces around it.`;
  if (/\.md$/i.test(name)) return `${as} it is a file's name, and an agent is named without its .md: \`${name.slice(0, -3)}\`.`;
  if (isReadme(`${name}.md`))
    return `${as} ${AGENTS_FOLDER}/${name}.md is the folder's README, which says what the agents are for and is never read as one. ${fix}`;
  if (new TextEncoder().encode(`${name}.md`).length > 255) return `${as} ${name}.md is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}

/** The prompt's file in a step's rendered folder. */
export const PROMPT_FILE = 'prompt.md';

/** The output style `harnessPrompt: no-coding` chooses, in the step's plugin. */
export const NO_CODING_STYLE = 'no-coding';

/** The plugin an agent's skills are served from, and so their namespace: `nemia-<agent>`. */
export const pluginOf = (agent: string): string => `nemia-${agent}`;

/** Whether the frozen `agent` carries words of a layer above its step's note: its instructions, custom instructions or factory's rules. */
const toldWords = (agent: StepAgent): boolean => Boolean(agent.instructions || agent.customInstructions || agent.factoryRules);

/**
 * Whether `nemia start` renders the step's agent and the tick files the step with it: a step of Claude Code's — codex loads no plugin and
 * takes no prompt of ours — whose record gives its agent instructions, custom instructions, its factory's rules, skills or a harness
 * prompt other than `keep` (`StepAgent.instructions`, `customInstructions`, `factoryRules`, `skills`, `harnessPrompt`; a record without
 * them renders nothing), and which starts a
 * session of its own. A step that continues another's session keeps that session's prompt, so it is told its agent's instructions in its
 * brief (and may give no skills, nor a harness prompt: `composedRefusal`).
 */
export const rendersAgent = (step: Workflow): boolean => {
  const agent = step.agent;
  if (!agent || step.harness === 'codex' || isRemoteHarness(step.harness) || step.resume) return false;
  return Boolean(toldWords(agent) || agent.skills?.length || (agent.harnessPrompt ?? 'keep') !== 'keep');
};

/** What a step's brief opens with: its own note alone when its agent is rendered, its agent's instructions and its note otherwise. */
export const briefBody = (step: Workflow): string => (rendersAgent(step) && step.agent ? step.agent.body : step.body);

/**
 * The skills of a step's session by layer, from its frozen record: its agent's own, and those its `skills:` line added (`addedSkills`),
 * each in the session's order. A record frozen before the added skills were kept apart counts every skill the step's line names as the
 * step's, one its agent names too among them. A step with no agent has neither.
 */
export function skillLayers(step: Workflow): { agent: string[]; added: string[] } {
  if (!step.agent) return { agent: [], added: [] };
  const added = step.agent.addedSkills ?? step.skills ?? [];
  return { agent: (step.agent.skills ?? []).filter((skill) => !added.includes(skill)), added };
}

/**
 * A skill as a step whose rendered folder is gone is told it: its SKILL.md's body, read again where the load finds it, or why it cannot be.
 */
export type SkillAgain = { name: string; text: string } | { name: string; missing: string };

/**
 * A step as it is told when its rendered folder is not there — removed by hand, or never written — with its agent's instructions in its
 * brief and no flags: filing it with a flag naming a file that is not there would end the session at
 * its start, and a brief without the instructions would tell it nothing of them. Nor without its skills: the instructions say to load
 * them, or that they follow, and with no plugin there is nothing to load, so each is told whole after the instructions, under the
 * name its `skills:` line writes, with no plugin before it — or why it could not be read (`skills`, read again by the tick: an edit
 * made since `nemia start` reaches it). Its session is given no skill to load (`enabledSkillsOf` answers `[]` for a step it no longer
 * renders): what its skills say is in its brief, and every other skill stays hidden from it, as from a rendered step.
 */
export const unrendered = (step: Workflow, skills: readonly SkillAgain[] = []): Workflow => {
  if (!step.agent) return step;
  const { instructions: _i, customInstructions: _c, factoryRules: _r, skills: _s, harnessPrompt: _p, ...agent } = step.agent;
  if (!skills.length) return { ...step, agent };
  return {
    ...step,
    body: [
      step.body.trimEnd(),
      'No skill is loaded with the Skill tool for this step — the folder the run rendered its agent into is gone — so each is told whole here.',
      ...skills.map(
        (s) => `## Skill \`${s.name}\`\n\n${'text' in s ? s.text.trim() : `Not told: ${s.missing} Sign off blocked if you need it.`}`,
      ),
    ].join('\n\n'),
    agent,
  };
};

/**
 * A skill as the prompt tells it: by its bare name, as its copy is filed in the step's plugin, or whole — its SKILL.md's body — when it
 * asks to be (`preload: true`).
 */
export type RenderedSkill = { name: string; whole?: string };

/**
 * The text of `prompt.md`: the agent's instructions, then the person's custom instructions for it, then its factory's rules, each under
 * the heading of its layer's number and owner (`headedLayers`), then each
 * skill it is given by its
 * namespaced name, the session to load it with the Skill tool when the instructions say it is needed, then each skill told whole, under a
 * heading of its name. Claude Code lists a plugin's skills to the session by name and description all the same; naming them here says they
 * are this agent's. A bare skill of the same name is hidden from the session (`sessionSettings`), so the name it is told is the only one it
 * sees.
 */
export function renderedPrompt(step: Workflow, skills: readonly RenderedSkill[]): string {
  const agent = step.agent;
  if (agent === undefined)
    refuse(
      `${step.name} is given no agent, so there is no prompt of one to render: render only a step whose agent is rendered (rendersAgent).`,
    );
  const plugin = pluginOf(agent.name);
  const named = skills.filter((s) => s.whole === undefined);
  const whole = skills.flatMap((s) => (s.whole === undefined ? [] : [{ name: s.name, whole: s.whole }]));
  const headed = headedLayers([
    ['instructions', agent.instructions],
    ['custom', agent.customInstructions],
    ['factory', agent.factoryRules],
  ]);
  return (
    [
      ...(headed ? [headed] : []),
      ...(named.length
        ? [
            `Your skills, each loaded with the Skill tool by its name when you need it: ${named.map((s) => `\`${plugin}:${s.name}\``).join(', ')}.`,
          ]
        : []),
      ...whole.map((s) => `## Skill \`${plugin}:${s.name}\`\n\n${s.whole.trim()}`),
    ].join('\n\n') + '\n'
  );
}

/** The output style `harnessPrompt: no-coding` writes into the step's plugin: Claude Code's prompt less `# Doing tasks`. */
export const noCodingStyle = (agent: string): string =>
  [
    '---',
    renderFrontmatter([
      ['name', NO_CODING_STYLE],
      ['description', `Claude Code's system prompt less its coding instructions, for the ${agent} agent, which does not write code.`],
      ['keep-coding-instructions', 'false'],
    ]) + '---',
    '',
    'Follow the instructions appended after this prompt: they say what you are for and how you work.',
    '',
  ].join('\n');

/** The manifest of a step's plugin, naming its namespace on purpose. */
export const pluginManifest = (agent: string): string =>
  JSON.stringify(
    { name: pluginOf(agent), version: '0.0.0', description: `The skills of the ${agent} agent, for one step of one run.` },
    null,
    2,
  ) + '\n';

/** Whether a rendered step is filed with its plugin (`pluginOf`): when its agent has skills, or a style in it (`no-coding`). */
export const namesPlugin = (step: Workflow): boolean => Boolean(step.agent?.skills?.length || step.agent?.harnessPrompt === 'no-coding');

/**
 * The settings a rendered step's session is given (`--settings`), or `undefined` when it needs none: the style chosen (`no-coding`).
 * Which skills the session holds is no setting: the step's task names them (`enabledSkillsOf`).
 */
function sessionSettings(agent: StepAgent): string | undefined {
  return agent.harnessPrompt === 'no-coding' ? JSON.stringify({ outputStyle: `${pluginOf(agent.name)}:${NO_CODING_STYLE}` }) : undefined;
}

/**
 * The skills a step's session is given, and no other (the runtime's `enabledSkills`): the frozen copies its plugin holds, each as the
 * session loads it, `nemia-<agent>:<bare name>` — its agent's and those its `skills:` line adds — so every other skill, the harness's
 * built-in ones, the person's, the repository's and another plugin's, is hidden from it and refused. `[]` for a step whose agent is not
 * rendered (`rendersAgent`): one with no agent or no skill, one that continues another's session, and one whose rendered folder is gone
 * and is told its skills whole in its brief (`unrendered`). A session on a harness the run names besides the default holds no closed
 * list, and is given the harness's own skills (`'default'`), with no list of names turned off. Pure.
 */
export const enabledSkillsOf = (step: Workflow): string[] | 'default' => {
  if ((step.harness ?? DEFAULT_HARNESS) !== DEFAULT_HARNESS) return 'default';
  const agent = step.agent;
  if (!rendersAgent(step) || agent === undefined) return [];
  const plugin = pluginOf(agent.name);
  return [...new Set((agent.skills ?? []).map((name) => `${plugin}:${bareSkillOf(name)}`))];
};

/**
 * The flags a rendered step is filed with, as the runtime's `config.claude` takes them, `dir` its rendered folder: the prompt appended, or
 * in place of Claude Code's (`replace`); the plugin, when there are skills or a style in it; and its session's settings
 * (`sessionSettings`): the style chosen (`no-coding`).
 * Undefined for a step not rendered (`rendersAgent`), which is filed with none.
 */
export function renderedFlags(
  step: Workflow,
  dir: string,
): { appendSystemPromptFile?: string; systemPromptFile?: string; pluginDir?: string[]; settings?: string } | undefined {
  const agent = step.agent;
  if (!rendersAgent(step) || agent === undefined) return undefined;
  const prompt = path.join(dir, PROMPT_FILE);
  const plugin = pluginOf(agent.name);
  const told = Boolean(toldWords(agent) || agent.skills?.length);
  const settings = sessionSettings(agent);
  return {
    ...(told ? (agent.harnessPrompt === 'replace' ? { systemPromptFile: prompt } : { appendSystemPromptFile: prompt }) : {}),
    ...(namesPlugin(step) ? { pluginDir: [path.join(dir, plugin)] } : {}),
    ...(settings !== undefined && { settings }),
  };
}

export type { DefinitionThere } from '../../contracts/definition-version.contract.ts';

/**
 * Why a write or a removal (`does`) of the agent or skill `name`, given the version `given` it was read at, does nothing, judged against
 * what is at its name now (`there`), or null where it goes on: a new write over nothing goes; a write given a version where none is held
 * now is `Missing`; a new write over what is there a `Conflict`; a removal of a held one with no version `Invalid`; and an act given a
 * version it is no longer at a `Conflict`. A removal where none is held goes on, to the remover's own refusal. Pure, the one judgement of
 * the Agent and Skill doors' layers, and proved by `contracts/definition-version.contract.ts`.
 */
export const definitionVersionRefusal: DefinitionVersionRefusal = (what, name, does, there, given) => {
  const named = what === 'agent' ? `${AGENTS_FOLDER}/${name}.md` : `${SKILLS_FOLDER}/${name}`;
  const anew = what === 'agent' ? 'Give the new agent another name' : 'Give the new skill another name';
  if (there.kind !== 'held') {
    if (does === 'remove') return null;
    if (given !== undefined)
      return {
        kind: 'Missing',
        message: `${named} is not there: it was removed since it was read. Write it as a new ${what} to have it back.`,
      };
    if (there.kind === 'none') return null;
    return { kind: 'Conflict', message: `${named} is there already, and is no ${what}. ${anew}, or remove what is there first.` };
  }
  if (given === undefined) {
    if (does === 'write')
      return { kind: 'Conflict', message: `${named} is there already. ${anew}, or open it and change it${takenAt(there.version)}.` };
    return {
      kind: 'Invalid',
      message: `${named} is at version ${there.version}, and a removal is checked against the version it was read at, so ${what === 'agent' ? 'an agent' : 'a skill'} changed since is not removed unseen. Give that version to remove it.`,
    };
  }
  if (given === there.version) return null;
  return {
    kind: 'Conflict',
    message:
      does === 'write'
        ? `${named} changed since it was read (version ${given}, now ${there.version}), and writing it would lose what changed. Read it again, and make the change on what it holds now.`
        : `${named} changed since it was read (version ${given}, now ${there.version}). Read it again before removing it.`,
  };
};
