import type { AgentDraft, AgentListing, AgentRoleKey, KeyForm } from './api';

/** The role keys, in the package's order (`AGENT_KEYS` without the description): the order an agent's file writes them. */
export const ROLE_KEYS: readonly AgentRoleKey[] = ['harness', 'model', 'effort', 'context', 'permissionMode', 'tools', 'disallow', 'allow', 'remote', 'output'];

/** What each role key is called on the form. */
export const KEY_LABELS: Readonly<Record<AgentRoleKey, string>> = {
  harness: 'Harness',
  model: 'Model',
  effort: 'Effort',
  context: 'Context',
  permissionMode: 'Permission mode',
  tools: 'Tools',
  disallow: 'Denied tools',
  allow: 'Allowed without asking',
  remote: 'Remote',
  output: 'Result schema',
};

/**
 * An agent's form as it is being edited: each field as typed, `''` for a key unset. `schemaText` is the result schema's text, read from the
 * file its `output:` names, and `schemaWas` what that file held when read — a schema is sent with a save only when it changed.
 */
export type AgentForm = {
  name: string;
  description: string;
  keys: Record<AgentRoleKey, string>;
  body: string;
  schemaText: string;
  schemaWas: { file: string; text: string } | null;
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
  };
}

/** The schema file a new result schema is written to when the form names none: beside the agent, after it. */
export const schemaFileFor = (name: string): string => `${name.trim() || 'agent'}.schema.json`;

/**
 * The draft a save sends: each field trimmed, an empty one unset (null). A schema pasted with no `output:` is named after the agent; the schema
 * travels only when its text or file changed since it was read — a schema another agent shares is then left alone. Nothing is judged here
 * that the package judges on save.
 */
export function draftOf(form: AgentForm): AgentDraft {
  const keys = Object.fromEntries(ROLE_KEYS.map((key) => [key, form.keys[key].trim() || null])) as Record<AgentRoleKey, string | null>;
  const text = form.schemaText.trim();
  if (text && !keys.output) keys.output = schemaFileFor(form.name);
  const changed = text && keys.output && (form.schemaWas?.file !== keys.output || form.schemaWas.text.trim() !== text);
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
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

/** A key's line of meaning, as the package says it for a step's key of the same name. */
export const meaningOf = (form: KeyForm | undefined, key: AgentRoleKey): string | null => form?.keys.find((k) => k.key === key)?.meaning ?? null;
