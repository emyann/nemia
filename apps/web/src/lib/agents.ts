import type { AgentDraft, AgentListing, AgentRoleKey, KeyForm } from './api';

/** The role keys, in the package's order (`AGENT_KEYS` less `AGENT_OWN_KEYS`: description, card, skills, systemPrompt): the order an agent's file writes them. */
export const ROLE_KEYS: readonly AgentRoleKey[] = ['harness', 'model', 'effort', 'context', 'permissionMode', 'sandbox', 'tools', 'disallowedTools', 'allowedTools', 'remote', 'output'];

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
 * file its `output:` names, and `schemaWas` what that file held when read — a schema is sent with a save only when it changed. `cardFile`
 * and `cardText` are the same two for what the agent says it can do (`card:`). `skills` — the skills its sessions are given, by name — and
 * `systemPrompt` are its own lines as typed. None of those is a role key.
 */
export type AgentForm = {
  name: string;
  description: string;
  keys: Record<AgentRoleKey, string>;
  body: string;
  schemaText: string;
  schemaWas: { file: string; text: string } | null;
  cardFile: string;
  cardText: string;
  cardWas: { file: string; text: string } | null;
  skills: string;
  systemPrompt: string;
};

/** A form for a new agent, or for the agent `listing` as it reads. */
export function formOf(listing: AgentListing | null): AgentForm {
  const keys = Object.fromEntries(ROLE_KEYS.map((key) => [key, listing?.keys[key] ?? ''])) as Record<AgentRoleKey, string>;
  return {
    name: listing?.name ?? '',
    description: listing?.description ?? '',
    keys,
    body: listing?.body ?? '',
    schemaText: listing?.schema?.text ?? '',
    schemaWas: listing?.schema ?? null,
    cardFile: listing?.card?.file ?? '',
    cardText: listing?.card?.text ?? '',
    cardWas: listing?.card ? { file: listing.card.file, text: listing.card.text } : null,
    skills: listing?.skills ?? '',
    systemPrompt: listing?.systemPrompt ?? '',
  };
}

/** The schema file a new result schema is written to when the form names none: beside the agent, after it. */
export const schemaFileFor = (name: string): string => `${name.trim() || 'agent'}.schema.json`;

/** The file a new card is written to when the form names none: beside the agent, after it, as the package's refusal suggests. */
export const cardFileFor = (name: string): string => `${name.trim() || 'agent'}.skills.json`;

/** The words `systemPrompt:` takes, as the package's `SYSTEM_PROMPTS` has them; `''` on the form is none, which is `default`. */
export const SYSTEM_PROMPTS = ['default', 'no-coding', 'own'] as const;

/**
 * The draft a save sends: each field trimmed, an empty one unset (null). A schema pasted with no `output:` is named after the agent, and a
 * card pasted with no file likewise; each file's text travels only when it or the file's name changed since it was read — one
 * another agent shares is then left alone. Nothing is judged here that the package judges on save.
 */
export function draftOf(form: AgentForm): AgentDraft {
  const keys = Object.fromEntries(ROLE_KEYS.map((key) => [key, form.keys[key].trim() || null])) as Record<AgentRoleKey, string | null>;
  const text = form.schemaText.trim();
  if (text && !keys.output) keys.output = schemaFileFor(form.name);
  const changed = text && keys.output && (form.schemaWas?.file !== keys.output || form.schemaWas.text.trim() !== text);
  const card = form.cardFile.trim() || (form.cardText.trim() ? cardFileFor(form.name) : '');
  const said = form.cardText.trim();
  const moved = said && card && (form.cardWas?.file !== card || form.cardWas.text.trim() !== said);
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    card: card || null,
    skills: form.skills.trim() || null,
    systemPrompt: form.systemPrompt.trim() || null,
    keys,
    body: form.body,
    ...(changed ? { schema: { file: keys.output!, text: form.schemaText } } : {}),
    ...(moved ? { cardText: form.cardText } : {}),
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
 * free text, to be taken off. A harness the form does not know is not judged here: its keys are typed, and the package judges them on save.
 */
export function hasKey(form: KeyForm | undefined, key: AgentRoleKey, harness: string): boolean {
  const field = form?.keys.find((k) => k.key === key);
  if (!field?.byHarness) return true;
  const on = harness.trim() || form!.defaultHarness;
  const known = form!.keys.find((k) => k.key === 'harness')?.choices ?? [];
  return Object.hasOwn(field.byHarness, on) || !known.includes(on);
}

/** A key's line of meaning, as the package says it for a step's key of the same name. */
export const meaningOf = (form: KeyForm | undefined, key: AgentRoleKey): string | null => form?.keys.find((k) => k.key === key)?.meaning ?? null;
