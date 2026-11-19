import { useState, type ReactNode } from 'react';
import type { KeyField, KeyForm } from '../../lib/api/builder.ts';
import type { StepLayers } from '../../lib/api/layers.ts';
import type { WorkflowStepSpec } from '../../lib/api/library.ts';
import {
  contextText,
  listOf,
  listUnsetWords,
  removeStep,
  setBody,
  setKey,
  setSchema,
  takes,
  tokensOf,
  type DraftStep,
} from '../../lib/builder';
import { Button, Checkbox, Select, SelectItem, TextField } from '@/components/ui/ds';
import { Markdown } from '../markdown/Markdown';
import { AmountField } from '../field/AmountField';
import { AgentLayers, PolicyLayer } from './StepLayers';

/** A change to the whole draft, made in one step so a key and what comes with it land together. */
export type DraftUpdate = (change: (steps: DraftStep[]) => DraftStep[]) => void;

/** The input of a field whose value is a command, a list of names or a schema: in the mono face. */
const MONO_INPUT = 'font-mono';

/** The option of a `schema` field that opens the box a schema is pasted into: no schema's file, which ends in .json. */
const PASTE = '(paste)';

/** The key of a select's option that sets nothing: no name a key takes, which has no parentheses. */
const UNSET = '(unset)';

/**
 * A step's form on the builder: what it is told, then a field per key the api's form has (`KeyForm`), in the package's order, each with
 * the package's line of what it means — drawn by kind, so a key the package adds is drawn once the api says how it is set. Every change is
 * made to the draft at once; nothing is judged here that the package judges on save, and a refusal of the last save for this step is shown
 * above its fields.
 *
 * A step with an agent (`agent:`) is edited as its file is written, and read by layer: its agent, then what the agent brings
 * (`AgentLayers`, from the listing's `layers`), then the step's policy (`PolicyLayer`) — its own note and the keys its file sets as its
 * policy (`policyKeys`) — then the rest of its keys. A key the agent gives it shows the agent's value in place of none — set, it is the
 * step's own; unset, the agent's again. Its agent's file and your custom instructions are not edited here.
 */
export function StepForm({
  step,
  steps,
  form,
  schemas,
  refused,
  layers,
  update,
  onRemoved,
}: {
  step: DraftStep;
  steps: readonly DraftStep[];
  form: KeyForm;
  schemas: readonly string[];
  refused: string | null;
  layers: StepLayers | null;
  update: DraftUpdate;
  onRemoved: () => void;
}) {
  const others = steps.filter((s) => s.name !== step.name).map((s) => s.name);
  const agent = step.own ? (step.spec.agent ?? '') : null;
  const input = (field: KeyField) => (
    <KeyInput key={`${step.name}:${field.key}`} field={field} step={step} others={others} form={form} schemas={schemas} update={update} />
  );
  const note = (
    <TextField
      label={agent === null ? 'What it is told' : 'Its words'}
      multiline
      value={step.own ? step.own.body : step.body}
      placeholder={agent === null ? undefined : `Nothing of its own: ${agent}'s instructions are all it is told.`}
      onChange={(words) => update((all) => setBody(all, step.name, words))}
    />
  );

  return (
    <section aria-label={`Keys of ${step.name}`} data-step-form={step.name} className="space-y-3">
      <StepHead name={step.name} refused={refused} update={update} onRemoved={onRemoved} />

      {agent === null ? (
        <>
          {note}
          {form.keys.map(input)}
        </>
      ) : (
        <>
          {form.keys.filter((field) => field.key === 'agent').map(input)}
          <AgentLayers agent={agent} layers={layers} />
          <PolicyLayer agent={agent} layers={layers} note={note}>
            {form.keys.filter((field) => form.policyKeys.includes(field.key)).map(input)}
          </PolicyLayer>
          {form.keys.filter((field) => field.key !== 'agent' && !form.policyKeys.includes(field.key)).map(input)}
        </>
      )}
    </section>
  );
}

/** The heading of step `name`'s form, with its Remove button, and the refusal of the last save for it, if any. */
function StepHead({
  name,
  refused,
  update,
  onRemoved,
}: {
  name: string;
  refused: string | null;
  update: DraftUpdate;
  onRemoved: () => void;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate font-mono text-body-medium font-semibold" title={name}>
          {name}
          <span className="font-sans text-body-small font-normal text-muted-foreground">.md</span>
        </h3>
        <Button
          variant="outlined"
          size="xsmall"
          onPress={() => {
            update((all) => removeStep(all, name));
            onRemoved();
          }}
          className="shrink-0"
        >
          Remove step
        </Button>
      </div>

      {refused && (
        <div data-refused-here className="space-y-1 rounded border border-failure bg-failure-container px-2 py-1.5">
          <p className="text-body-small font-medium text-on-failure-container">The last save was refused for {name}:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{refused}</p>
        </div>
      )}
    </>
  );
}

/**
 * One key's field: its name, the control its kind is set with, and what it means. A key the step's agent gives it is shown as the agent's,
 * in place of none: the field is empty until the step sets it itself. A fence the step's harness does not have — `sandbox` on Claude Code,
 * `permissionMode` on codex — is not drawn unless the step says it, to be taken off; nor is a key a remote agent does not take (`tools`,
 * `model`, a fence), whose unset list is empty rather than null.
 *
 * No tools typed is no `tools:` line, the harness's own set; no rule typed denies nothing; a list of commas is the package's to refuse. A
 * count of tokens is written as a person writes it, `200k`, and put in the draft as the number; a word it cannot read is left unset.
 */
function KeyInput({
  field,
  step,
  others,
  form,
  schemas,
  update,
}: {
  field: KeyField;
  step: DraftStep;
  others: readonly string[];
  form: KeyForm;
  schemas: readonly string[];
  update: DraftUpdate;
}) {
  const { key, kind, meaning } = field;
  const inherited = step.own !== null && form.roleKeys.includes(key) && !step.own.keys.includes(key);
  const value = inherited ? (Array.isArray(step.spec[key]) ? [] : null) : step.spec[key];
  const given = inherited ? givenText(key, step.spec[key], step.spec.agent) : null;
  const set = <K extends keyof WorkflowStepSpec>(k: K, v: WorkflowStepSpec[K]) => update((all) => setKey(all, step.name, k, v, form));
  const harness = step.spec.harness ?? form.defaultHarness;
  const unset = value === null || (Array.isArray(value) && value.length === 0);
  if (!takes(form, field, harness) && unset && given === null) return null;

  let control: ReactNode;
  switch (kind) {
    case 'steps': {
      const chosen = (value as string[] | null) ?? [];
      control = others.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {others.map((name) => (
            <Checkbox
              key={name}
              isSelected={chosen.includes(name)}
              onChange={(checked) => set(key, (checked ? [...chosen, name] : chosen.filter((x) => x !== name)) as never)}
            >
              <span className="font-mono text-body-small">{name}</span>
            </Checkbox>
          ))}
        </div>
      ) : (
        <p className="text-body-small text-muted-foreground">No other step to name.</p>
      );
      return (
        <fieldset data-field={key} className="space-y-1">
          <legend className="font-mono text-body-small font-medium">{key}</legend>
          {control}
          <Meaning>{meaning}</Meaning>
        </fieldset>
      );
    }
    case 'step':
      control = (
        <Choose
          label={key}
          value={(value as string | null) ?? ''}
          onChange={(v) => set(key, (v || null) as never)}
          options={others}
          unset="not set"
        />
      );
      break;
    case 'choice':
      control = (
        <Choose
          label={key}
          value={(value as string | null) ?? ''}
          onChange={(v) => set(key, (v || null) as never)}
          options={field.choices ?? []}
          unset={given ?? (key === 'agent' ? 'no agent' : key === 'harness' ? `not set — ${form.defaultHarness}` : 'not set')}
          stray={key === 'agent' ? (v) => `${v} — not in agents/` : undefined}
        />
      );
      break;
    case 'harness-word':
      control = (
        <Choose
          label={key}
          value={(value as string | null) ?? ''}
          onChange={(v) => set(key, (v || null) as never)}
          options={field.byHarness?.[harness] ?? []}
          unset={given ?? `not set — ${harness}'s own`}
          stray={(v) => `${v} — not a word ${harness} takes`}
        />
      );
      break;
    case 'text':
      control = (
        <Typed
          label={key}
          value={(value as string | null) ?? ''}
          mono={key === 'check'}
          placeholder={given ?? undefined}
          canon={(typed) => typed.trim()}
          commit={(typed) => set(key, (typed.trim() || null) as never)}
        />
      );
      break;
    case 'list': {
      const listed = value as string[] | null;
      control = (
        <Typed
          label={key}
          mono
          value={listed ? listed.join(', ') : ''}
          placeholder={given ?? listUnsetWords(key)}
          canon={(typed) => listOf(typed).join(', ')}
          commit={(typed) => set(key, (key === 'tools' && !typed.trim() ? null : listOf(typed)) as never)}
        />
      );
      break;
    }
    case 'count':
    case 'dollars':
      control = (
        <AmountKey label={key} kind={kind} value={value as number | null} given={given} onAmount={(amount) => set(key, amount as never)} />
      );
      break;
    case 'tokens': {
      const tokens = value as number | null;
      control = (
        <Typed
          label={key}
          mono
          value={tokens === null ? '' : contextText(tokens)}
          placeholder={given ?? "the model's whole window"}
          canon={(typed) => {
            const n = tokensOf(typed);
            return n === null ? '' : contextText(n);
          }}
          commit={(typed) => set(key, tokensOf(typed) as never)}
        />
      );
      break;
    }
    case 'flag':
      control =
        (field.choices ?? []).length === 1 ? (
          <Checkbox isSelected={value === true} onChange={(checked) => set(key, (checked ? true : null) as never)}>
            <span className="font-mono text-body-small">
              {key}: {field.choices![0]}
            </span>
          </Checkbox>
        ) : (
          <Choose
            label={key}
            value={value === null ? '' : String(value)}
            onChange={(v) => set(key, (v === '' ? null : v === 'true') as never)}
            options={field.choices ?? []}
            unset={given ?? 'not set'}
          />
        );
      break;
    case 'schema':
      control = <SchemaInput form={form} label={key} step={step} schemas={schemas} update={update} given={given} />;
      break;
  }

  return (
    <div data-field={key} className="space-y-1">
      {control}
      <Meaning>{meaning}</Meaning>
    </div>
  );
}

/** A value a step's agent gives it, as its field shows it in place of none: `opus — implementer's`, or that the agent sets none either. */
function givenText(key: keyof WorkflowStepSpec, value: WorkflowStepSpec[keyof WorkflowStepSpec], agent: string | null) {
  if (value === null || (Array.isArray(value) && !value.length)) return `not set — nor by ${agent}`;
  const text = Array.isArray(value)
    ? value.join(', ')
    : key === 'context' && typeof value === 'number'
      ? contextText(value)
      : String(value);
  return `${text} — ${agent}'s`;
}

function Meaning({ children }: { children: string }) {
  return <Markdown className="text-body-small leading-snug text-muted-foreground">{children}</Markdown>;
}

const asIs = (value: string) => value;

/**
 * A select of `options`, `unset` first; a value the options lack is kept as one, said by `stray`, so what the file says is never hidden.
 */
function Choose({
  label,
  value,
  onChange,
  options,
  unset,
  stray = asIs,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  unset: string;
  stray?: (value: string) => string;
}) {
  return (
    <Select label={label} value={value || UNSET} onChange={(key) => onChange(key === UNSET || key == null ? '' : String(key))}>
      <SelectItem id={UNSET} label={unset} />
      {value && !options.includes(value) && <SelectItem id={value} label={stray(value)} />}
      {options.map((option) => (
        <SelectItem key={option} id={option} label={option} />
      ))}
    </Select>
  );
}

/**
 * A step's amount — its budget in dollars, or a count — in an amount field, each keystroke committed to the draft; while it is unset, what
 * it stands at (`given`, the agent's, or `not set`) said under it too.
 */
function AmountKey({
  label,
  kind,
  value,
  given,
  onAmount,
}: {
  label: string;
  kind: 'count' | 'dollars';
  value: number | null;
  given: string | null;
  onAmount: (amount: number | null) => void;
}) {
  const unset = given ?? 'not set';
  return (
    <AmountField
      label={label}
      kind={kind}
      value={value}
      placeholder={unset}
      supportingText={value === null ? unset : undefined}
      onAmount={onAmount}
    />
  );
}

/**
 * A field typed into: what is typed stays as typed — `Read, ` on its way to `Read, Grep` — and each keystroke is committed to the draft as
 * the key reads it. `value` is the draft's, as `canon` writes what is typed: when the draft changes under the field — a loop drawn gives it
 * rounds — the field shows the draft's. While it is empty, what it stands unset at is said under it too: the kit's field shows its
 * placeholder only under the focus.
 */
function Typed({
  label,
  value,
  commit,
  canon,
  mono = false,
  placeholder,
}: {
  label: string;
  value: string;
  commit: (typed: string) => void;
  canon: (typed: string) => string;
  mono?: boolean;
  placeholder?: string;
}) {
  const [typed, setTyped] = useState(value);
  return (
    <TextField
      label={label}
      value={canon(typed) === value ? typed : value}
      placeholder={placeholder ?? 'not set'}
      supportingText={value === '' ? (placeholder ?? 'not set') : undefined}
      onChange={(words) => {
        setTyped(words);
        commit(words);
      }}
      inputClassName={mono ? MONO_INPUT : undefined}
    />
  );
}

/**
 * `output:`: a schema beside the step, picked from the folder's — or pasted, with the file it is written to, which is written when the
 * draft is saved and replaces a file of that name. Picking a file or none takes a paste back.
 */
function SchemaInput({
  label,
  step,
  form,
  schemas,
  update,
  given,
}: {
  label: string;
  step: DraftStep;
  form: KeyForm;
  schemas: readonly string[];
  update: DraftUpdate;
  given: string | null;
}) {
  const pasted = step.schema;
  const value = pasted ? PASTE : given !== null ? '' : (step.spec.output ?? '');
  const stray = step.spec.output && !pasted && given === null && !schemas.includes(step.spec.output) ? step.spec.output : null;

  return (
    <div className="space-y-1.5">
      <Select
        label={label}
        value={value || UNSET}
        onChange={(key) => {
          const picked = key === UNSET || key == null ? '' : String(key);
          update((all) =>
            picked === PASTE
              ? setSchema(all, step.name, { file: `${step.name}.schema.json`, text: '' })
              : setKey(setSchema(all, step.name, null), step.name, 'output', picked || null, form),
          );
        }}
      >
        <SelectItem id={UNSET} label={given ?? 'not set'} />
        {stray !== null && <SelectItem id={stray} label={`${stray} — not in the folder`} />}
        {schemas.map((schema) => (
          <SelectItem key={schema} id={schema} label={schema} />
        ))}
        <SelectItem id={PASTE} label="Paste a schema…" />
      </Select>
      {pasted && (
        <div className="space-y-2 rounded-shape-small border border-dashed border-outline p-2">
          <TextField
            label="Written on save as"
            value={pasted.file}
            onChange={(file) => update((all) => setSchema(all, step.name, { ...pasted, file }))}
            inputClassName={MONO_INPUT}
          />
          <TextField
            label={`The JSON Schema${schemas.includes(pasted.file) ? `, replacing ${pasted.file}` : ''}`}
            multiline
            value={pasted.text}
            placeholder={'{ "type": "object", "properties": { … }, "required": [ … ], "additionalProperties": false }'}
            onChange={(text) => update((all) => setSchema(all, step.name, { ...pasted, text }))}
            inputClassName={MONO_INPUT}
          />
        </div>
      )}
    </div>
  );
}
