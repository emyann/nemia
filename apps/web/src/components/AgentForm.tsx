import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Radio, RadioGroup, TextField, Text } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import type { AgentListing, AgentRoleKey, KeyForm } from '../lib/api';
import { GivenSkills, Skills } from './AgentParts';
import { Markdown } from './Markdown';
import { SkillPicker } from './SkillPicker';
import {
  choicesOf,
  deniedWithoutSkill,
  draftOf,
  edited,
  formOf,
  hasKey,
  KEY_LABELS,
  meaningOf,
  pickHarnessPrompt,
  schemaFileFor,
  skillToolGap,
  HARNESS_PROMPT_CHOICES,
  harnessPromptShown,
  toolsWithSkill,
  type AgentForm as Form,
} from '../lib/agents';

/**
 * The option of a choice that leaves the key unset: the agent then says nothing of it, and a step that names it runs on its own or the
 * default.
 */
const UNSET = '(unset)';

/** What a key's field says beneath it where the package's line for a step's key would not fit an agent. */
const HINTS: Partial<Record<AgentRoleKey, string>> = {
  tools: 'The tools its sessions may use, comma-separated: Read, Grep, Bash(npm test). Unset, the harness decides.',
  disallowedTools: 'The tools its sessions may never use, comma-separated, whatever `tools` allows.',
  context: 'The context window its sessions are capped at, in tokens: 200k, say.',
  model: 'A model its harness knows: opus, sonnet, gpt-5-codex.',
};

/**
 * An agent's form: its name, what it is for, what it says it can do, how its sessions run — each role key it sets — its result schema, and
 * its instructions. Every change is the draft's; nothing is judged here that the package judges on save, and a refusal of the last save is
 * shown above the fields in the package's words. `readOnly` draws the repository's, which the board does not write.
 *
 * `onSave` is handed the draft and resolves once written, or rejects with the refusal; the form keeps what was typed either way.
 */
export function AgentForm({
  listing,
  keyForm,
  readOnly = false,
  saving,
  refusal,
  onSave,
  onSkillCopied,
  footer,
}: {
  listing: AgentListing | null;
  keyForm: KeyForm | undefined;
  readOnly?: boolean;
  saving: boolean;
  refusal: ReactNode;
  onSave: (draft: ReturnType<typeof draftOf>) => void;
  /** Called once a skill is copied into your library, before the board reads anything again: an agent that names it moves its version. */
  onSkillCopied?: () => Promise<void>;
  footer?: ReactNode;
}) {
  const [form, setForm] = useState<Form>(() => formOf(listing));
  const setKey = (key: AgentRoleKey, value: string) => setForm((f) => ({ ...f, keys: { ...f.keys, [key]: value } }));
  const changed = edited(form, listing);
  const harness = form.keys.harness;

  const text = (key: AgentRoleKey) => (
    <Field
      key={key}
      label={KEY_LABELS[key]}
      hint={HINTS[key] ?? meaningOf(keyForm, key)}
      value={form.keys[key]}
      onChange={(v) => setKey(key, v)}
      readOnly={readOnly}
      mono
    />
  );
  const choice = (key: AgentRoleKey) => {
    if (!hasKey(keyForm, key, harness)) return form.keys[key] ? text(key) : null;
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

      <Identity form={form} setForm={setForm} listing={listing} readOnly={readOnly} />

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">What it can do</legend>
        <GeneratedCard listing={listing} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">How its sessions run</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {choice('harness')}
          {text('model')}
          {choice('effort')}
          {text('context')}
          {choice('permissionMode')}
          {choice('sandbox')}
          {choice('remote')}
          {text('tools')}
          {text('disallowedTools')}
          <Field
            label="MCP servers"
            hint="mcp: — the servers its sessions load, by the names the checkout's .mcp.json gives them, comma-separated. Empty, they load none."
            value={form.mcp}
            onChange={(mcp) => setForm((f) => ({ ...f, mcp }))}
            readOnly={readOnly}
            mono
            placeholder={listing ? undefined : 'playwright'}
          />
        </div>
      </fieldset>

      <ResultSchema form={form} setForm={setForm} listing={listing} readOnly={readOnly} />

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">What its sessions are told</legend>
        {readOnly ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">Skills</p>
            <GivenSkills rows={listing?.given ?? []} none="It gives no skills." />
          </div>
        ) : (
          <SkillPicker
            skills={form.skills}
            given={listing?.given ?? []}
            onSkills={(skills) => setForm((f) => ({ ...f, skills }))}
            onCopied={onSkillCopied}
          />
        )}
        {!readOnly && <SkillToolNote form={form} setKey={setKey} />}
        <HarnessPrompt
          value={form.harnessPrompt}
          onChange={(picked) => setForm((f) => ({ ...f, harnessPrompt: pickHarnessPrompt(picked, listing?.harnessPrompt ?? '') }))}
          readOnly={readOnly}
        />
      </fieldset>

      <Field
        label="Instructions"
        hint="What every node that names it is told, in markdown: on Claude Code, after Claude Code's own prompt, and a node's own note is its brief; on codex, first in its brief, before the node's own note."
        value={form.body}
        onChange={(body) => setForm((f) => ({ ...f, body }))}
        readOnly={readOnly}
        markdown
        area="min-h-72"
        placeholder={listing ? undefined : 'You write the notes of a change…'}
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
            A save changes what a run started later freezes. A run already started keeps the agent it froze.
          </p>
          {footer}
        </div>
      )}
    </form>
  );
}

/**
 * What the agent says it can do, read-only: its card's skills, which nobody writes. The package generates them from the skills it gives, as
 * they are on disk — an entry for each, read off its SKILL.md — or one from its description when it gives none; so a change is a change of
 * its skills, or of a SKILL.md, and shows once saved. Where none can be made the package's refusal stands in their place.
 */
function GeneratedCard({ listing }: { listing: AgentListing | null }) {
  const how =
    'Generated from its skills: an entry for each, read off its SKILL.md — title, description, tags and examples — or one from its description when it gives none.';
  if (!listing)
    return (
      <p data-card-generated className="text-xs text-muted-foreground">
        {how} Shown once it is saved.
      </p>
    );
  return (
    <div data-card className="space-y-2">
      {listing.cardError !== null ? (
        <p data-card-error className="font-mono text-xs whitespace-pre-wrap break-words text-red-700 dark:text-red-400">
          {listing.cardError}
        </p>
      ) : (
        <Skills skills={listing.card} none={listing.error !== null ? 'Nothing, while its file does not read.' : undefined} />
      )}
      <p className="text-xs text-muted-foreground">{how} To change it, change its skills.</p>
    </div>
  );
}

/**
 * The result schema the agent's nodes declare: the file its `output:` names, beside the agent, and the schema's text, pasted. Each field
 * sets its line of `form` through `setForm`.
 */
function ResultSchema({
  form,
  setForm,
  listing,
  readOnly,
}: {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
  listing: AgentListing | null;
  readOnly: boolean;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Result schema</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Schema file"
          hint={`output: — a JSON Schema beside the agent. Pasting one with no file names it ${schemaFileFor(form.name)}.`}
          value={form.keys.output}
          onChange={(output) => setForm((f) => ({ ...f, keys: { ...f.keys, output } }))}
          readOnly={readOnly}
          mono
          placeholder={listing ? undefined : schemaFileFor(form.name)}
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
        />
      </div>
    </fieldset>
  );
}

/**
 * Who the agent is, at the head of its form: its name, which is its file's and what a node names it by, the job it holds, and when to
 * attach it. Each field sets its line of `form` through `setForm`.
 */
function Identity({
  form,
  setForm,
  listing,
  readOnly,
}: {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
  listing: AgentListing | null;
  readOnly: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Name"
        hint={
          listing
            ? 'Its file is agents/<name>.md; a node names it with agent: <name>. Renamed only while no node names it.'
            : 'Its file is agents/<name>.md; a node names it with agent: <name>.'
        }
        value={form.name}
        onChange={(name) => setForm((f) => ({ ...f, name }))}
        readOnly={readOnly}
        mono
        placeholder={listing ? undefined : 'scribe'}
      />
      <Field
        label="Role"
        hint="The job it holds: “Product engineer”. Its name is its own, and a node names it by that."
        value={form.role}
        onChange={(role) => setForm((f) => ({ ...f, role }))}
        readOnly={readOnly}
        placeholder={listing ? undefined : 'Note writer'}
      />
      <Field
        label="Description"
        hint="When to attach it to a node: “Use this when…”"
        value={form.description}
        onChange={(description) => setForm((f) => ({ ...f, description }))}
        readOnly={readOnly}
        placeholder={listing ? undefined : 'Use this when a change needs its notes written.'}
      />
    </div>
  );
}

/**
 * A text field: a line, or `area`'s textarea. Read-only, it is drawn as text on a quiet ground, not as a box waiting for words. The skill's
 * form draws its fields with it too. `markdown` says its words are written in markdown: typed in as written in a mono textarea, and read
 * as the markdown they are (`MarkdownField`).
 */
export function Field({
  label,
  hint,
  value,
  onChange,
  readOnly,
  mono = false,
  markdown = false,
  area,
  placeholder,
  className,
}: {
  label: string;
  hint: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  mono?: boolean;
  markdown?: boolean;
  area?: string;
  placeholder?: string;
  className?: string;
}) {
  if (markdown && readOnly) return <MarkdownField label={label} hint={hint} value={value} className={className} />;
  const font = mono || markdown ? 'font-mono text-xs md:text-xs' : '';
  const quiet = readOnly ? READ_ONLY : '';
  return (
    <TextField value={value} onChange={onChange} isReadOnly={readOnly} className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs">{label}</Label>
      {area ? (
        <Textarea placeholder={readOnly ? undefined : placeholder} className={`${font} ${area} ${quiet} leading-relaxed`} />
      ) : (
        <Input placeholder={readOnly ? undefined : placeholder} className={`${font} ${quiet}`} />
      )}
      {hint && <Hint>{hint}</Hint>}
    </TextField>
  );
}

const READ_ONLY = 'border-dashed bg-neutral-50 dark:bg-neutral-900/60 focus-visible:ring-0';

const Hint = ({ children }: { children: ReactNode }) => (
  <Text slot="description" className="block text-[11px] leading-snug text-muted-foreground">
    {children}
  </Text>
);

/** A field written in markdown, read and not edited: its label, its words drawn as markdown on a read-only field's ground, its hint. */
function MarkdownField({
  label,
  hint,
  value,
  className,
}: {
  label: string;
  hint: string | null | undefined;
  value: string;
  className?: string;
}) {
  return (
    <section aria-label={label} data-field-markdown className={`space-y-1.5 ${className ?? ''}`}>
      <p className="text-xs leading-none font-medium">{label}</p>
      {value.trim() ? (
        <Markdown className={`rounded-md border px-3 py-2 text-sm ${READ_ONLY}`}>{value}</Markdown>
      ) : (
        <p className={`rounded-md border px-3 py-2 text-sm text-muted-foreground italic ${READ_ONLY}`}>Nothing written</p>
      )}
      {hint && <Hint>{hint}</Hint>}
    </section>
  );
}

/**
 * A key set to one of the words it may take, or left unset. A value the file has that the list does not — an effort off its harness's words
 * — is shown as written; the package says what is wrong on save.
 */
function Choice({
  label,
  hint,
  value,
  choices,
  onChange,
  readOnly,
}: {
  label: string;
  hint: string | null | undefined;
  value: string;
  choices: readonly string[];
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
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

/**
 * What the package refuses on save said before it: skills given, and tools that leave out `Skill` — the tool a session loads a skill with —
 * or deny it. One press puts it right.
 */
function SkillToolNote({ form, setKey }: { form: Form; setKey: (key: AgentRoleKey, value: string) => void }) {
  const gap = skillToolGap(form);
  if (!gap) return null;
  return (
    <div
      data-skill-tool-note
      className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p className="min-w-0 flex-1">
        {gap === 'tools' ? (
          <>
            Its tools leave out <code className="font-mono">Skill</code>, the tool a session loads a skill with: its sessions could not use
            these skills, and a save is refused.
          </>
        ) : (
          <>
            Its denied tools take <code className="font-mono">Skill</code>, the tool a session loads a skill with: its sessions could not
            use these skills, and a save is refused.
          </>
        )}
      </p>
      {gap === 'tools' ? (
        <Button variant="outline" size="xs" onPress={() => setKey('tools', toolsWithSkill(form.keys.tools))}>
          Add Skill to its tools
        </Button>
      ) : (
        <Button variant="outline" size="xs" onPress={() => setKey('disallowedTools', deniedWithoutSkill(form.keys.disallowedTools))}>
          Take Skill off its denied tools
        </Button>
      )}
    </div>
  );
}

export const RADIO =
  'group flex cursor-default items-start gap-2.5 rounded border border-neutral-200 px-3 py-2 outline-none data-selected:border-neutral-900 data-focus-visible:ring-2 data-focus-visible:ring-ring/50 data-disabled:cursor-not-allowed dark:border-neutral-800 dark:data-selected:border-neutral-300';
export const DOT =
  'mt-0.5 size-3.5 shrink-0 rounded-full border border-neutral-400 group-data-selected:border-4 group-data-selected:border-neutral-900 dark:border-neutral-600 dark:group-data-selected:border-neutral-200';

/**
 * `harnessPrompt:`, as a choice of what the agent does: Claude Code's own prompt whole, less its coding section, or none — which drops its
 * safety rules, and is kept behind For experts, open where the agent already says it. Unset, `keep` is drawn chosen and nothing is written
 * until a person picks another (`pickHarnessPrompt`). A word the file has that is none of these is shown as written: the package says what
 * is wrong with it.
 */
function HarnessPrompt({ value, onChange, readOnly }: { value: string; onChange: (value: string) => void; readOnly: boolean }) {
  const shown = harnessPromptShown(value);
  const known = HARNESS_PROMPT_CHOICES.some((choice) => choice.value === shown);
  const radio = (choice: (typeof HARNESS_PROMPT_CHOICES)[number]) => (
    <Radio key={choice.value} value={choice.value} className={RADIO} data-harness-prompt={choice.value}>
      <span aria-hidden className={DOT} />
      <span className="space-y-0.5">
        <span className="block text-xs font-medium">{choice.label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{choice.says}</span>
      </span>
    </Radio>
  );
  return (
    <RadioGroup value={known ? shown : null} onChange={onChange} isDisabled={readOnly} className="space-y-2">
      <Label className="text-xs">Claude Code&apos;s prompt</Label>
      <div className="grid gap-2 sm:grid-cols-2">{HARNESS_PROMPT_CHOICES.filter((choice) => !choice.expert).map(radio)}</div>
      {!known && (
        <p className="text-[11px] text-red-700 dark:text-red-400">
          Its file says <code className="font-mono">harnessPrompt: {value}</code>, which is none of these.
        </p>
      )}
      <Collapsible defaultExpanded={shown === 'replace'}>
        {({ isExpanded }) => (
          <>
            <CollapsibleTrigger className="rounded-sm text-[11px] text-neutral-500 outline-none hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:text-neutral-100">
              {isExpanded ? '▾' : '▸'} For experts
            </CollapsibleTrigger>
            <CollapsibleContent>
              {isExpanded && (
                <div className="grid gap-2 pt-2 sm:grid-cols-2">{HARNESS_PROMPT_CHOICES.filter((choice) => choice.expert).map(radio)}</div>
              )}
            </CollapsibleContent>
          </>
        )}
      </Collapsible>
      <Text slot="description" className="block text-[11px] leading-snug text-muted-foreground">
        <code className="font-mono">harnessPrompt:</code> — how much of Claude Code&apos;s own prompt its sessions keep, before the
        instructions below.
      </Text>
    </RadioGroup>
  );
}
