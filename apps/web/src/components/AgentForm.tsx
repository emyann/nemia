import { useState, type ReactNode } from 'react';
import { TextField, Text } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AgentListing, AgentRoleKey, KeyForm } from '../lib/api';
import { choicesOf, draftOf, edited, formOf, KEY_LABELS, meaningOf, schemaFileFor, type AgentForm as Form } from '../lib/agents';

/** The option of a choice that leaves the key unset: the agent then says nothing of it, and a step that names it runs on its own or the default. */
const UNSET = '(unset)';

/** What a key's field says beneath it where the package's line for a step's key would not fit an agent. */
const HINTS: Partial<Record<AgentRoleKey, string>> = {
  tools: 'The tools its sessions may use, comma-separated: Read, Grep, Bash(npm test). Unset, the harness decides.',
  disallow: 'The tools its sessions may never use, comma-separated, whatever `tools` allows.',
  context: 'The context window its sessions are capped at, in tokens: 200k, say.',
  model: 'A model its harness knows: opus, sonnet, gpt-5-codex.',
};

/**
 * An agent's form: its name, what it is for, how its sessions run — each role key it sets — its result schema, and its instructions. Every
 * change is the draft's; nothing is judged here that the package judges on save, and a refusal of the last save is shown above the fields in
 * the package's words. `readOnly` draws the repository's, which the board does not write.
 *
 * `onSave` is handed the draft and resolves once written, or rejects with the refusal; the form keeps what was typed either way.
 */
export function AgentForm({ listing, keyForm, readOnly = false, saving, refusal, onSave, footer }: {
  listing: AgentListing | null;
  keyForm: KeyForm | undefined;
  readOnly?: boolean;
  saving: boolean;
  refusal: ReactNode;
  onSave: (draft: ReturnType<typeof draftOf>) => void;
  footer?: ReactNode;
}) {
  const [form, setForm] = useState<Form>(() => formOf(listing));
  const setKey = (key: AgentRoleKey, value: string) => setForm((f) => ({ ...f, keys: { ...f.keys, [key]: value } }));
  const changed = edited(form, listing);
  const harness = form.keys.harness;

  const text = (key: AgentRoleKey, placeholder?: string) => (
    <Field
      key={key}
      label={KEY_LABELS[key]}
      hint={HINTS[key] ?? meaningOf(keyForm, key)}
      value={form.keys[key]}
      onChange={(v) => setKey(key, v)}
      readOnly={readOnly}
      mono
      placeholder={placeholder}
    />
  );
  const choice = (key: AgentRoleKey) => {
    const choices = choicesOf(keyForm, key, harness);
    if (!choices) return text(key);
    return (
      <Choice
        key={key}
        label={KEY_LABELS[key]}
        hint={meaningOf(keyForm, key)}
        value={form.keys[key]}
        choices={choices}
        onChange={(v) => setKey(key, v)}
        readOnly={readOnly}
      />
    );
  };

  return (
    <form
      aria-label={listing ? `Agent ${listing.name}` : 'New agent'}
      data-agent-form={listing?.name ?? ''}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) onSave(draftOf(form));
      }}
    >
      {refusal}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          hint={listing ? 'Its file is agents/<name>.md; a node names it with agent: <name>. Renamed only while no node names it.' : 'Its file is agents/<name>.md; a node names it with agent: <name>.'}
          value={form.name}
          onChange={(name) => setForm((f) => ({ ...f, name }))}
          readOnly={readOnly}
          mono
          placeholder="scribe"
        />
        <Field
          label="Description"
          hint="When to attach it to a node: “Use this when…”"
          value={form.description}
          onChange={(description) => setForm((f) => ({ ...f, description }))}
          readOnly={readOnly}
          placeholder="Use this when a change needs its notes written."
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">How its sessions run</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {choice('harness')}
          {text('model')}
          {choice('effort')}
          {text('context', '200k')}
          {choice('permissionMode')}
          {choice('remote')}
          {text('tools', 'Read, Grep, Bash(npm test)')}
          {text('disallow', 'WebFetch')}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Result schema</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="File"
            hint={`output: — a JSON Schema beside the agent. Pasting one with no file names it ${schemaFileFor(form.name)}.`}
            value={form.keys.output}
            onChange={(v) => setKey('output', v)}
            readOnly={readOnly}
            mono
            placeholder={schemaFileFor(form.name)}
          />
          <Field
            className="sm:col-span-2"
            label="Its fields"
            hint="What the closeout of each node that names it declares, for a node that reads it with input:. Empty, it declares none."
            value={form.schemaText}
            onChange={(schemaText) => setForm((f) => ({ ...f, schemaText }))}
            readOnly={readOnly}
            mono
            area="min-h-24"
            placeholder={'{ "type": "object", "properties": { "notes": { "type": "string" } }, "required": ["notes"], "additionalProperties": false }'}
          />
        </div>
      </fieldset>

      <Field
        label="Instructions"
        hint="What every node that names it is told first, in markdown; a node's own note follows."
        value={form.body}
        onChange={(body) => setForm((f) => ({ ...f, body }))}
        readOnly={readOnly}
        mono
        area="min-h-72"
        placeholder="You write the notes of a change…"
      />

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" isDisabled={saving || !changed}>
            {saving ? 'Saving…' : listing ? 'Save' : 'Create agent'}
          </Button>
          {listing && changed && (
            <Button variant="ghost" onPress={() => setForm(formOf(listing))} isDisabled={saving}>
              Discard changes
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            A save changes what a later <code>wf start</code> freezes. A run already started keeps the agent it froze.
          </p>
          {footer}
        </div>
      )}
    </form>
  );
}

/** A text field: a line, or `area`'s textarea. */
function Field({ label, hint, value, onChange, readOnly, mono = false, area, placeholder, className }: {
  label: string;
  hint: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  mono?: boolean;
  area?: string;
  placeholder?: string;
  className?: string;
}) {
  const font = mono ? 'font-mono text-xs md:text-xs' : '';
  return (
    <TextField value={value} onChange={onChange} isReadOnly={readOnly} className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs">{label}</Label>
      {area ? (
        <Textarea placeholder={readOnly ? undefined : placeholder} className={`${font} ${area} leading-relaxed`} />
      ) : (
        <Input placeholder={readOnly ? undefined : placeholder} className={font} />
      )}
      {hint && (
        <Text slot="description" className="block text-[11px] leading-snug text-muted-foreground">
          {hint}
        </Text>
      )}
    </TextField>
  );
}

/** A key set to one of the words it may take, or left unset. */
function Choice({ label, hint, value, choices, onChange, readOnly }: {
  label: string;
  hint: string | null | undefined;
  value: string;
  choices: readonly string[];
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  // A value the file has that the list does not — an effort off its harness's words — is shown as written; the package says what is wrong on save.
  const words = value && !choices.includes(value) ? [...choices, value] : choices;
  return (
    <Select
      value={value || UNSET}
      onChange={(key) => onChange(key === UNSET || key == null ? '' : String(key))}
      isDisabled={readOnly}
      className="w-full space-y-1.5"
    >
      <Label className="text-xs">{label}</Label>
      <SelectTrigger className="font-mono text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem id={UNSET} textValue="unset">
          <span className="text-muted-foreground">unset</span>
        </SelectItem>
        {words.map((word) => (
          <SelectItem key={word} id={word} className="font-mono text-xs">
            {word}
          </SelectItem>
        ))}
      </SelectContent>
      {hint && (
        <Text slot="description" className="block text-[11px] leading-snug text-muted-foreground">
          {hint}
        </Text>
      )}
    </Select>
  );
}
