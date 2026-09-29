/**
 * An agent: a markdown file in `agents/` beside the workflows, whose frontmatter a step names with `agent:` and inherits. Its keys
 * (`AGENT_KEYS`), read by `parseAgent` and written back by `renderAgent`, the skills it names and what they cost a turn, and the card it
 * is published with (`agentCard`).
 */
import { AGENTS_FOLDER, isReadme, isStepKey, refuse, REFUSED, SKILLS_FOLDER, splitFrontmatter, type WorkflowError } from '../step/step.ts';
import { composedRefusal } from '../keys/index.ts';
import {
  codexModeWritten,
  codexSandboxNamed,
  FORMER_KEYS,
  formerKeyWritten,
  formerSandbox,
  frontmatterKey,
  readKeys,
} from '../former/former.ts';
import { stepFrom } from '../workflow/index.ts';
import type { AgentSkill } from '../skills/skills.ts';

/**
 * The keys an agent file sets: the job it holds (`role:`, as `Product engineer`; its own name is its file's); what it is for, in a line; the skills it is given (`skills:`), which are also what its card says it can do and what becomes of Claude Code's own system prompt (`systemPrompt:`); and who does the work and how. A step that names the
 * agent (`agent:`) takes the last of those as its own defaults, and a key it sets itself wins. Everything else a step sets is wiring — where
 * the step sits in its workflow, what it reads, how it is judged and for how long — and belongs on the step: an agent file that sets one is
 * refused by name.
 */
export const AGENT_KEYS = [
  'role',
  'description',
  'skills',
  'systemPrompt',
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
 * The agent keys that are the agent's own and no step's: the job it holds, what it is for, the skills it is given and its system prompt. A step has none of them, so none is in `STEP_KEYS`, and code outside the package that reads the role keys leaves them out
 * (`apps/api/src/workflows/builder.ts`'s `ROLE_KEYS` and `apps/api/src/agents/agents.ts`'s, off this list; `apps/web/src/lib/agents.ts` by
 * hand).
 */
export const AGENT_OWN_KEYS = ['role', 'description', 'skills', 'systemPrompt'] as const;
export type AgentOwnKey = (typeof AGENT_OWN_KEYS)[number];
/** The keys a step takes from its agent: every agent key but its own (`AGENT_OWN_KEYS`). */
export type RoleKey = Exclude<AgentKey, AgentOwnKey>;
const isAgentKey = (key: string): key is AgentKey => (AGENT_KEYS as readonly string[]).includes(key);
const isOwnKey = (key: string): key is AgentOwnKey => (AGENT_OWN_KEYS as readonly string[]).includes(key);
/** What each of an agent's own lines is called where a draft gives it: its field, not one of its keys. */
const OWN_LINE: Record<AgentOwnKey, string> = { role: 'role', description: 'description', skills: 'skills', systemPrompt: 'system prompt' };

/**
 * What becomes of Claude Code's own system prompt for an agent's steps (`systemPrompt:`): `default` keeps it and appends the agent's
 * instructions after it (`--append-system-prompt-file`); `no-coding` keeps it less its coding instructions, through an output style
 * that says `keep-coding-instructions: false`, and appends them the same; `own` replaces it with them (`--system-prompt-file`).
 * Absent is `default`. Claude Code's alone: codex is handed its instructions in the brief.
 */
export const SYSTEM_PROMPTS = ['default', 'no-coding', 'own'] as const;
export type SystemPrompt = (typeof SYSTEM_PROMPTS)[number];

/** A skill's name: the folder it is, in `skills/`, lowercase words joined by dashes, as Claude Code names one. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Why `name` cannot be a skill's folder, or `undefined`: what a skill is copied or written under is refused as `skills:` refuses a name. */
export function skillNameRefusal(name: unknown): string | undefined {
  if (typeof name === 'string' && SKILL_NAME.test(name) && name.length <= 64) return undefined;
  const shown = typeof name === 'string' ? `\`${name}\`` : JSON.stringify(name);
  return `${shown} is not a skill's name: a skill is a folder in ${SKILLS_FOLDER}/, named in lowercase words joined by dashes, 64 characters at most, as Claude Code names one — write-a-note, say.`;
}

/**
 * What a skill costs an agent's sessions, in tokens, estimated at four characters a token (the page says "about"): `listed`, its name and
 * description, which Claude Code lists to every session of an agent that gives it; `body`, its SKILL.md's body, which a session reads when
 * it loads the skill — or, for a skill that says `preload: true`, which the run appends to the system prompt, so it is carried on every turn
 * (cached). `perTurn` is what every turn carries: the listing, and the body too when it is preloaded. Pure, and never refuses: a
 * SKILL.md that does not read costs what its text would.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/** Tokens, about: four characters to a token, rounded up. */
export const tokensAbout = (text: string): number => Math.ceil(text.length / 4);

/** `SkillCost` of the skill `id`, from its SKILL.md's `text`: one whose frontmatter never closes is read as all body. */
export function skillTurnCost(id: string, text: string): SkillCost {
  let block: string | null = null;
  let body = text;
  try {
    ({ block, body } = splitFrontmatter(`${id}/SKILL.md`, text));
  } catch {}
  const framed = `---\n${block ?? ''}---\n`;
  const preload = block !== null && frontmatterKey(framed, 'preload') === 'true';
  const description = block === null ? '' : (frontmatterKey(framed, 'description') ?? '').replace(/^(["'])(.*)\1$/, '$2');
  const listed = tokensAbout(`${id}: ${description}`);
  const told = tokensAbout(body);
  return { preload, listed, body: told, perTurn: listed + (preload ? told : 0) };
}

/**
 * Where the skills a workflow's agents name were found: each name, the folder it is (`<place>/skills/<name>`, holding `SKILL.md`) or why it
 * cannot be used — a name two places of one repository both have — and the places looked in, in order, for the refusal of a name none has.
 * `skillsFor` in `folder.store.ts` reads them.
 */
export type SkillsFound = { at: ReadonlyMap<string, string | WorkflowError>; looked: readonly string[] };

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
  /** The skills its steps are given, by name (`skills:`), each a folder in a `skills/` the load finds (`SkillsFound`). */
  skills?: string[];
  /** What becomes of Claude Code's system prompt, as written (`SYSTEM_PROMPTS`); absent is `default`. */
  systemPrompt?: SystemPrompt;
  keys: Partial<Record<RoleKey, string>>;
  body: string;
  read: (file: string) => string | undefined;
};

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
  mcpServers: "a run gives a session no MCP servers of an agent's own; the repository's `.mcp.json` is what its sessions load",
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
  if (isAgentKey(key) || key === 'name' || CLAUDE_CODE_IGNORED.includes(key)) return undefined;
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
 * empty: an agent that only sets how its steps run. `color` (`CLAUDE_CODE_IGNORED`) is read and dropped, and a `skills:` line that names a
 * card file is refused (`cardRetired`).
 */
export function parseAgent(name: string, text: string, read?: (file: string) => string | undefined): Agent {
  const file = `${AGENTS_FOLDER}/${name}.md`;
  const { block, body } = splitFrontmatter(file, text);
  const {
    meta: { role, description, skills: listed, systemPrompt: prompt, name: said, color: _, ...written },
    spelled,
  } =
    block === null
      ? { meta: {} as Partial<Record<AgentKey | 'name' | 'color', string>>, spelled: {} }
      : readKeys<AgentKey | 'name' | 'color'>(file, block, (key) => agentKeyRefusal(file, key));
  if (said !== undefined && said !== name) {
    refuse(
      `${file}: \`name: ${said}\` is not the file's name, and an agent is named by its file: a step names this one \`agent: ${name}\`. Write \`name: ${name}\`, or delete the line.`,
    );
  }
  if (listed !== undefined && isCardFile(listed)) refuse(cardRetired(file, 'skills', listed));
  const keys = codexSandboxNamed(file, written as Partial<Record<RoleKey, string>>, written.harness);
  const step = stepFrom(file, keys, body, read, spelled);
  const skills = skillNamesOf(file, listed);
  const systemPrompt = systemPromptOf(file, prompt);
  if (systemPrompt === 'own' && !body.trim()) {
    refuse(
      `${file}: \`systemPrompt: own\` puts the agent's instructions in place of Claude Code's system prompt, and this agent has none: its sessions would start with no system prompt at all. Write its instructions below the frontmatter, or delete the line.`,
    );
  }
  const composed = composedRefusal(file, skills, systemPrompt, step);
  if (composed !== undefined) refuse(composed);
  return {
    name,
    ...(role !== undefined && { role }),
    ...(description !== undefined && { description }),
    ...(skills !== undefined && { skills }),
    ...(systemPrompt !== undefined && { systemPrompt }),
    keys,
    body,
    read: read ?? (() => undefined),
  };
}

/** Whether a `skills:` value is a card's file, as the line's former use named one: one `.json` file. No skill's name ends so. */
export const isCardFile = (value: string): boolean => !value.includes(',') && /\.json$/i.test(value.trim());

/**
 * The refusal of a card file an agent names — by `card:`, or by a `skills:` line that names one (`isCardFile`) — since an agent's card is
 * generated from its skills (`cardSkills` in `folder.store.ts`). Refused rather than read and dropped: a line the run
 * reads and ignores is a constraint nobody enforces, and a person editing that file would see no change on the card.
 */
export function cardRetired(file: string, key: 'card' | 'skills', named?: string): string {
  const line = named === undefined ? `\`${key}\`` : `\`${key}: ${named}\``;
  const it = named === undefined ? 'the file it names' : named;
  return `${file}: ${line} names a card file, which is retired: an agent's card is generated from its \`skills:\`, an entry for each skill made from its SKILL.md's frontmatter (its \`title:\` or \`name:\`, \`description:\`, \`tags:\` and \`examples:\`), and from the agent's own \`description:\` when it has none. Delete the line, and ${it} beside the agent; to say what the agent can do, give it skills.`;
}

/** `skills:` as the names it lists, refused unless each is a skill's name (`SKILL_NAME`), once. */
function skillNamesOf(file: string, written: string | undefined): string[] | undefined {
  if (written === undefined) return undefined;
  const named = `${file}: \`skills: ${written}\``;
  const shape =
    "Each is a skill's name — its folder in skills/, lowercase words joined by dashes — comma-separated: `skills: review-a-change, write-a-note`.";
  const names = written
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) refuse(`${named} names no skill. ${shape}`);
  const odd = names.find((n) => !SKILL_NAME.test(n));
  if (odd) refuse(`${named} has \`${odd}\`, which is not a skill's name. ${shape}`);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice) refuse(`${named} names \`${twice}\` twice. Name it once.`);
  return names;
}

/** `systemPrompt:` as one of `SYSTEM_PROMPTS`, refused otherwise. */
function systemPromptOf(file: string, written: string | undefined): SystemPrompt | undefined {
  if (written === undefined) return undefined;
  if ((SYSTEM_PROMPTS as readonly string[]).includes(written)) return written as SystemPrompt;
  return refuse(
    `${file}: \`systemPrompt: ${written}\` is not one of ${SYSTEM_PROMPTS.join(', ')}. \`default\` keeps Claude Code's system prompt and appends the agent's instructions after it; \`no-coding\` keeps it less its coding instructions; \`own\` replaces it with the agent's instructions. Without the line, it is \`default\`.`,
  );
}

/**
 * An agent as it is written back: what `renderAgent` takes, and what `parseAgent` reads — its name, the file's, its description, its keys as
 * written (`200k`, `Read, Grep`), and its instructions. A key unset is left out, or `null`.
 */
export type AgentDraft = {
  name: string;
  role?: string | null;
  description?: string | null;
  /** The skills it is given, as written: `review-a-change, write-a-note`. */
  skills?: string | null;
  systemPrompt?: string | null;
  keys: Partial<Record<RoleKey, string | null>>;
  body: string;
};

/**
 * An agent as its file: the frontmatter, its own lines first (`AGENT_OWN_KEYS`) and then each role key it sets, in `AGENT_KEYS`' order, as written; then its
 * instructions. The inverse of `parseAgent`: an agent it read renders to a file it reads back as the same agent, which
 * `test/write-agent.test.ts` holds over every shipped agent. Pure. A file's comments are not on the agent, so a render has none.
 *
 * As `renderStep`, it judges nothing the parser judges: a value the parser would refuse is written as given, and `writeAgent` parses what it
 * rendered before it writes. Refused here is only what a file cannot hold: a key an agent may not set — `agent:`, a step's wiring, one no
 * agent has — in the parser's words (`agentKeyRefusal`), since it would be written and then refused, or dropped; one of its own lines
 * among the keys, where it would be written twice; a card file (`cardRetired`), which a stale page sends as `card` or as a `skills:` naming
 * one, and which is written nowhere; and a line break in a value, which would make what follows it a line of its own — a key, even.
 */
export function renderAgent(draft: AgentDraft): string {
  const file = `${AGENTS_FOLDER}/${draft.name}.md`;
  const keys = (draft.keys ?? {}) as Record<string, string | null | undefined>;
  for (const key of Object.keys(keys)) {
    if (keys[key] == null) continue;
    if (key === 'name')
      refuse(`${file}: \`name\` is the agent's file, and it is written as the draft's name — not a key. Give it as the name.`);
    if (isOwnKey(key))
      refuse(
        `${file}: \`${key}\` is the agent's own line, not one of its role keys — give it as the ${OWN_LINE[key]}, once.`,
      );
    if (Object.hasOwn(FORMER_KEYS, key)) refuse(formerKeyWritten(file, key));
    const refused = agentKeyRefusal(file, key);
    if (refused !== undefined) refuse(refused);
  }
  if (keys.harness === 'codex' && keys.permissionMode != null && formerSandbox(keys.permissionMode) !== undefined)
    refuse(codexModeWritten(file, keys.permissionMode));
  const sent = (draft as { card?: unknown }).card;
  if (sent != null)
    refuse(
      `${cardRetired(file, 'card', typeof sent === 'string' ? sent : JSON.stringify(sent))} A page that sends it is stale: reload it, and save again.`,
    );
  if (draft.skills != null && isCardFile(String(draft.skills))) {
    refuse(`${cardRetired(file, 'skills', String(draft.skills))} A page that sends it is stale: reload it, and save again.`);
  }
  const own: Record<AgentOwnKey, string | null | undefined> = {
    role: draft.role,
    description: draft.description,
    skills: draft.skills,
    systemPrompt: draft.systemPrompt,
  };
  const values: Array<[string, string | null | undefined]> = AGENT_KEYS.map((key) => [key, isOwnKey(key) ? own[key] : keys[key]]);
  const lines = values.flatMap(([key, value]) => {
    if (value == null) return [];
    const text = String(value);
    if (/[\r\n]/.test(text))
      refuse(
        `${file}: \`${key}\` holds a line break, and a frontmatter line is one key and its value: what follows the break would be read as a line of its own. Write it on one line.`,
      );
    return [`${key}: ${text}`];
  });
  const body = String(draft.body ?? '').trim();
  if (lines.length) return `---\n${lines.map((line) => `${line}\n`).join('')}---\n${body}\n`;
  return /^---[ \t]*(?:\n|$)/.test(body) ? `---\n\n---\n${body}\n` : body ? `${body}\n` : '';
}

/**
 * A local agent described in the A2A protocol's terms — its name, what it is for, what it can do — and **not** an A2A Agent Card. Protocol
 * 1.0, as `specification/a2a.proto` in a2aproject/A2A and the specification's Agent Card section define it.
 *
 * The protocol marks `supported_interfaces` REQUIRED: it is the list of URLs and bindings a client would call the agent at. Nothing here
 * serves this agent over A2A, so there is no URL to give, and this leaves the field out rather than give an address that does not answer. A
 * document missing a REQUIRED field is not a valid `AgentCard`, so everything that prints this says so in the same breath (`wf agents card`
 * on stderr, the api's `servedOverA2A: false`), and `test/agent-card.test.ts` pins the omission, which only
 * code that serves a card over A2A may lift.
 *
 * `provider`, `documentationUrl`, `iconUrl`, `securitySchemes`, `security` and `signatures` are left out for the same reason — nothing here
 * fills them honestly. `capabilities` in A2A are protocol features, not reach: streaming, push notifications, an extended card. None of the
 * three exists here, so all three are false. What an agent can do is its card's `skills`: an entry for each skill `skills:` gives its sessions,
 * read off the skill's SKILL.md (`skillEntryOf`), or one made from the agent's own description when it gives none (`ownSkill`).
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
 * The card-shaped description of `agent`, at `version` — what `wf agents card` prints and the api answers with, one builder so the two can
 * never disagree. Pure. The JSON is spelled as the specification's sample card spells it, camelCase.
 *
 * `defaultInputModes` is `text/plain`: a step is handed a composed brief and nothing else. `defaultOutputModes` is `application/json`: every
 * closeout is a JSON object. An agent's `output:` names a JSON Schema, and A2A describes an output's *media type*, never its schema — there
 * is no field for it, so it contributes the media type and nothing more.
 *
 * `skills` are the card's entries, generated from the skills the agent is given (`cardSkills` in `folder.store.ts`, which reads their
 * SKILL.md files). Refused, rather than printed hollow: an agent with no `description:`, and a card with no entry, both of which the protocol
 * marks REQUIRED.
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
