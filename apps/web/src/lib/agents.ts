import type { AgentDraft, AgentListing, AgentRoleKey, KeyForm, RunStatus, RunSummary } from './api';
import { remoteRefuses } from './builder.ts';

/**
 * The role keys, in the package's order (`AGENT_KEYS` less `AGENT_OWN_KEYS`: role, description, skills, harnessPrompt, mcp): the order an
 * agent's file writes them.
 */
export const ROLE_KEYS: readonly AgentRoleKey[] = [
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
];

/** What each role key is called on the form. */
export const KEY_LABELS: Readonly<Record<AgentRoleKey, string>> = {
  harness: 'Harness',
  model: 'Model',
  effort: 'Effort',
  context: 'Context',
  permissionMode: 'Permission mode',
  sandbox: 'Sandbox',
  tools: 'Tools',
  disallowedTools: 'Denied tools',
  allowedTools: 'Allowed without asking',
  remote: 'Remote',
  output: 'Result schema',
};

/**
 * An agent's form as it is being edited: each field as typed, `''` for a key unset. `schemaText` is the result schema's text, read from the
 * file its `output:` names, and `schemaWas` what that file held when read — a schema is sent with a save only when it changed. `skills` —
 * the skills its sessions are given, by name, which its card is generated from — `harnessPrompt` and `mcp`, the MCP servers its sessions
 * load, are its own lines as typed. None of
 * those is a role key.
 */
export type AgentForm = {
  name: string;
  role: string;
  description: string;
  keys: Record<AgentRoleKey, string>;
  body: string;
  schemaText: string;
  schemaWas: { file: string; text: string } | null;
  skills: string;
  harnessPrompt: string;
  mcp: string;
};

/** A form for a new agent, or for the agent `listing` as it reads. */
export function formOf(listing: AgentListing | null): AgentForm {
  const keys = Object.fromEntries(ROLE_KEYS.map((key) => [key, listing?.keys[key] ?? ''])) as Record<AgentRoleKey, string>;
  return {
    name: listing?.name ?? '',
    role: listing?.role ?? '',
    description: listing?.description ?? '',
    keys,
    body: listing?.body ?? '',
    schemaText: listing?.schema?.text ?? '',
    schemaWas: listing?.schema ?? null,
    skills: listing?.skills ?? '',
    harnessPrompt: listing?.harnessPrompt ?? '',
    mcp: listing?.mcp ?? '',
  };
}

/** The schema file a new result schema is written to when the form names none: beside the agent, after it. */
export const schemaFileFor = (name: string): string => `${name.trim() || 'agent'}.schema.json`;

/** The words `harnessPrompt:` takes, as the package's `HARNESS_PROMPTS` has them; `''` on the form is none, which is `keep`. */
export const HARNESS_PROMPTS = ['keep', 'no-coding', 'replace'] as const;

/**
 * The draft a save sends: each field trimmed, an empty one unset (null). A schema pasted with no `output:` is named after the agent, and
 * its text travels only when it or the file's name changed since it was read — one another agent shares is then left alone. Nothing is
 * judged here that the package judges on save.
 */
export function draftOf(form: AgentForm): AgentDraft {
  const keys = Object.fromEntries(ROLE_KEYS.map((key) => [key, form.keys[key].trim() || null])) as Record<AgentRoleKey, string | null>;
  const text = form.schemaText.trim();
  if (text && !keys.output) keys.output = schemaFileFor(form.name);
  const changed = text && keys.output && (form.schemaWas?.file !== keys.output || form.schemaWas.text.trim() !== text);
  return {
    name: form.name.trim(),
    role: form.role.trim() || null,
    description: form.description.trim() || null,
    skills: form.skills.trim() || null,
    harnessPrompt: form.harnessPrompt.trim() || null,
    mcp: form.mcp.trim() || null,
    keys,
    body: form.body,
    ...(changed ? { schema: { file: keys.output!, text: form.schemaText } } : {}),
  };
}

/** Whether the form says something other than `listing`, as read: what the Save button waits for. */
export function edited(form: AgentForm, listing: AgentListing | null): boolean {
  return JSON.stringify(draftOf(form)) !== JSON.stringify(draftOf(formOf(listing)));
}

/**
 * The words a key may take on the harness the agent names, from the step form's keys (`KeyForm`): effort and permission mode depend on the
 * harness, and an agent that names none runs on the default one. Null for a key typed as free text.
 */
export function choicesOf(form: KeyForm | undefined, key: AgentRoleKey, harness: string): readonly string[] | null {
  const field = form?.keys.find((k) => k.key === key);
  if (!field) return null;
  const on = harness.trim() || form!.defaultHarness;
  if (field.byHarness) return field.byHarness[on] ?? null;
  return field.choices;
}

/**
 * Whether the harness the agent names has the key at all: a key whose words are the harness's is had only on a harness that has some. Each
 * harness has one fence — Claude Code its `permissionMode`, codex its `sandbox` — and the form draws the other only where it is written, as
 * free text, to be taken off. A remote A2A agent has none of the keys the package refuses on it (`remoteRefuses`). Any other harness the
 * form does not know is not judged here: its keys are typed, and the package judges them on save.
 */
export function hasKey(form: KeyForm | undefined, key: AgentRoleKey, harness: string): boolean {
  const field = form?.keys.find((k) => k.key === key);
  const on = harness.trim() || (form?.defaultHarness ?? '');
  if (form && remoteRefuses(form, key, on)) return false;
  if (!field?.byHarness) return true;
  const known = form!.keys.find((k) => k.key === 'harness')?.choices ?? [];
  return Object.hasOwn(field.byHarness, on) || !known.includes(on);
}

/** A key's line of meaning, as the package says it for a step's key of the same name. */
export const meaningOf = (form: KeyForm | undefined, key: AgentRoleKey): string | null =>
  form?.keys.find((k) => k.key === key)?.meaning ?? null;

/** The skills line as the names it gives, in its order: split on commas, each trimmed, an empty one dropped. */
export const skillList = (line: string): string[] =>
  line
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

/** Names as the skills line writes them: `review-a-change, write-a-note`. */
export const skillLine = (names: readonly string[]): string => names.join(', ');

/** The skills line with `name` given last, once: a name it gives already leaves it as it was. */
export const withSkill = (line: string, name: string): string =>
  skillList(line).includes(name) ? line : skillLine([...skillList(line), name]);

/** The skills line without `name`. */
export const withoutSkill = (line: string, name: string): string => skillLine(skillList(line).filter((given) => given !== name));

/**
 * Why the skills given reach nothing, as the package refuses it on save — `tools:` set without `Skill`, or `Skill` denied — or null. A tool
 * is read as the package reads it, one entry of the comma-separated list, exactly `Skill`.
 */
export function skillToolGap(form: Pick<AgentForm, 'skills' | 'keys'>): 'tools' | 'disallowedTools' | null {
  if (!skillList(form.skills).length) return null;
  const tools = skillList(form.keys.tools);
  if (form.keys.tools.trim() && !tools.includes('Skill')) return 'tools';
  if (skillList(form.keys.disallowedTools).includes('Skill')) return 'disallowedTools';
  return null;
}

/** `tools:` with `Skill` added last. */
export const toolsWithSkill = (tools: string): string => skillLine([...skillList(tools), 'Skill']);

/** `disallowedTools:` with `Skill` taken off. */
export const deniedWithoutSkill = (denied: string): string => skillLine(skillList(denied).filter((tool) => tool !== 'Skill'));

/**
 * What each `harnessPrompt:` word does, as the form offers it: a plain choice, what it costs or drops, and whether it is kept behind For
 * experts. Claude Code's own prompt is about 6.5k tokens, cached across turns; `no-coding` drops its coding section, about 750 of them;
 * `replace` drops the lot, safety rules included, leaving the agent's instructions alone.
 */
export const HARNESS_PROMPT_CHOICES: ReadonlyArray<{
  value: (typeof HARNESS_PROMPTS)[number];
  label: string;
  says: string;
  expert: boolean;
}> = [
  {
    value: 'keep',
    label: 'Works on code or files',
    says: "Claude Code's full instructions, then yours: about 6.5k tokens, cached.",
    expert: false,
  },
  {
    value: 'no-coding',
    label: "Doesn't write code",
    says: "Claude Code's instructions less its coding section: about 750 tokens fewer.",
    expert: false,
  },
  {
    value: 'replace',
    label: 'Only my instructions',
    says: "Drops Claude Code's own, its safety rules with them — only when a person asks for it.",
    expert: true,
  },
];

/** The word a form's harness prompt is drawn as: unset is `keep`, which is what a session runs with. */
export const harnessPromptShown = (value: string): string => value.trim() || 'keep';

/**
 * The form's harness prompt once `picked` is chosen, from `was`, what the file said as read. `keep` is written only where it was: an agent
 * whose file said nothing, or `keep`, gets back what it said, and one moved to `keep` from another word is left unset, which is `keep` —
 * so picking a choice and then `keep` again is no edit.
 */
export function pickHarnessPrompt(picked: string, was: string): string {
  if (picked !== 'keep') return picked;
  return was.trim() === 'keep' ? was : '';
}

/** The form an agent's page kept across a copy of a skill: the key it is drawn under, and the version the copy moved the agent to. */
export type KeptForm = { key: string; version: string };

/**
 * The key an agent's form is drawn under. It is the agent's version, so a save, or a change made elsewhere, draws the file as it now reads,
 * and a save goes back against that version. The one exception is the version the page's own copy of a skill moved it to (`kept`): an agent
 * whose `skills:` names the copied skill is versioned by that skill too, and the form a person is typing in stays, to be saved against it.
 */
export const formKeyOf = (version: string, kept: KeptForm | null): string => (kept && kept.version === version ? kept.key : version);

/**
 * What the page keeps once its copy of a skill is written: the form under `key`, at the version the agent reads at now (`now`) — but only
 * when its file and its schema read as they did when the form was drawn (`was`). A change to either since is someone else's, and the form
 * is drawn again from it, as for any other change, rather than saved over it.
 */
export function keptAfterCopy(
  was: Pick<AgentListing, 'source' | 'schema'>,
  now: Pick<AgentListing, 'source' | 'schema' | 'version'>,
  key: string,
): KeptForm | null {
  if (now.source !== was.source || JSON.stringify(now.schema ?? null) !== JSON.stringify(was.schema ?? null)) return null;
  return { key, version: now.version };
}

/**
 * What the page keeps once a save has been read back: the form a copy kept is let go only when the agent reads at another version than the
 * one the copy moved it to (`now`), which the save's own read brings. Let go before that read lands, the form would be drawn again from the
 * file as it was before the save, and would stay so where the read failed.
 */
export const keptAfterSave = (kept: KeptForm | null, now: string | undefined): KeptForm | null =>
  kept && now !== undefined && now !== kept.version ? null : kept;

/**
 * A save settled, in the order the page must see it: moved to the new name first, when it was renamed — the old one, read again, is gone —
 * then every read the write changes read again, and only then what the page kept for the old version let go (`release`). A form a copy of a
 * skill kept is drawn under a key of its own until then, so the person's saved edit stays on the page rather than the file as it was.
 */
export async function settleSave({
  rename,
  invalidate,
  release,
}: {
  rename?: () => Promise<unknown>;
  invalidate: () => Promise<unknown>;
  release: () => void;
}): Promise<void> {
  if (rename) await rename();
  await invalidate();
  release();
}

/** What a try is, said on the agent's Try panel in one line: the fence is the try's, held to its folder inside the agent's own. */
export const TRY_FENCE = "A rehearsal fenced to its own folder, not the agent's own permissions";

/** How a try runs, beside the fence: the keys its step says, never wider than the agent's own. */
export const TRY_TERMS = 'dontAsk, allowed Edit(**) in its folder and never more than the agent is, $1 to spend';

/** The latest try of an agent among the runs, by when it was made; undefined when it has none. */
export function latestTryOf<T extends { try: { agent: string } | null; createdAt: string }>(
  runs: readonly T[],
  agent: string,
): T | undefined {
  return runs
    .filter((run) => run.try?.agent === agent)
    .reduce<T | undefined>((latest, run) => (!latest || run.createdAt > latest.createdAt ? run : latest), undefined);
}

/** Why the Try button is not pressable, or null: an empty brief, or a try of the agent still moving — the api refuses both. */
export function tryHeld(brief: string, latest: { moving: boolean; id: string } | undefined): string | null {
  if (latest?.moving) return `A try is still running (${latest.id}): one at a time.`;
  if (!brief.trim()) return 'Write a brief to try it on.';
  return null;
}

/**
 * A try's state in words: what stopped it (`stoppedOn`, `awaiting approval` or `blocked`) off its row on the list, where the list judged
 * its run as `status`, the run's detail, does; else `status`. Takes the row undefined before the list has the try.
 */
export function tryStatusWord(status: RunStatus, listed: Pick<RunSummary, 'status' | 'stoppedOn'> | undefined): string {
  return (listed?.status === status ? listed.stoppedOn : null) ?? status;
}
