import { useId, useState, type ReactNode } from 'react';
import type { KeyField, KeyForm, StepLayers, WorkflowStepSpec } from '../lib/api';
import {
  contextText,
  listOf,
  listUnsetWords,
  numberOf,
  removeStep,
  setBody,
  setKey,
  setSchema,
  takes,
  tokensOf,
  type DraftStep,
} from '../lib/builder';
import { Markdown } from './Markdown';
import { AgentLayers, PolicyLayer } from './StepLayers';

/** A change to the whole draft, made in one step so a key and what comes with it land together. */
export type DraftUpdate = (change: (steps: DraftStep[]) => DraftStep[]) => void;

const INPUT =
  'block w-full rounded border border-outline bg-background px-2 py-1 text-sm placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';
const MONO_INPUT = `${INPUT} font-mono text-xs`;

/** The option of a `schema` field that opens the box a schema is pasted into: no schema's file, which ends in .json. */
const PASTE = '(paste)';

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
  const body = useId();
  const others = steps.filter((s) => s.name !== step.name).map((s) => s.name);
  const agent = step.own ? (step.spec.agent ?? '') : null;
  const input = (field: KeyField) => (
    <KeyInput key={`${step.name}:${field.key}`} field={field} step={step} others={others} form={form} schemas={schemas} update={update} />
  );
  const note = (
    <>
      <label htmlFor={body} className="block text-xs font-medium">
        {agent === null ? 'What it is told' : 'Its words'}
      </label>
      <textarea
        id={body}
        value={step.own ? step.own.body : step.body}
        rows={5}
        placeholder={agent === null ? undefined : `Nothing of its own: ${agent}'s instructions are all it is told.`}
        onChange={(event) => update((all) => setBody(all, step.name, event.target.value))}
        className={`${INPUT} resize-y`}
      />
    </>
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
        <h3 className="min-w-0 truncate font-mono text-sm font-semibold" title={name}>
          {name}
          <span className="font-sans text-xs font-normal text-muted-foreground">.md</span>
        </h3>
        <button
          type="button"
          onClick={() => {
            update((all) => removeStep(all, name));
            onRemoved();
          }}
          className="shrink-0 rounded border border-outline px-2 py-0.5 text-xs text-muted-foreground hover:border-on-surface-variant hover:text-foreground"
        >
          Remove step
        </button>
      </div>

      {refused && (
        <div data-refused-here className="space-y-1 rounded border border-failure bg-failure-container px-2 py-1.5">
          <p className="text-xs font-medium text-on-failure-container">The last save was refused for {name}:</p>
          <p className="font-mono text-[11px] whitespace-pre-wrap break-words text-on-failure-container">{refused}</p>
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
  const id = useId();
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
            <label key={name} className="flex items-center gap-1.5 font-mono text-xs">
              <input
                type="checkbox"
                checked={chosen.includes(name)}
                onChange={(event) => set(key, (event.target.checked ? [...chosen, name] : chosen.filter((x) => x !== name)) as never)}
              />
              {name}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No other step to name.</p>
      );
      return (
        <fieldset data-field={key} className="space-y-1">
          <legend className="font-mono text-xs font-medium">{key}</legend>
          {control}
          <Meaning>{meaning}</Meaning>
        </fieldset>
      );
    }
    case 'step':
      control = (
        <Choose
          id={id}
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
          id={id}
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
          id={id}
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
          id={id}
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
          id={id}
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
        <Typed
          id={id}
          type="number"
          step={kind === 'dollars' ? '0.01' : '1'}
          value={value === null ? '' : String(value)}
          placeholder={given ?? undefined}
          canon={(typed) => String(numberOf(typed) ?? '')}
          commit={(typed) => set(key, numberOf(typed) as never)}
        />
      );
      break;
    case 'tokens': {
      const tokens = value as number | null;
      control = (
        <Typed
          id={id}
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
          <label className="flex items-center gap-1.5 text-xs">
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={(event) => set(key, (event.target.checked ? true : null) as never)}
            />
            <span className="font-mono">
              {key}: {field.choices![0]}
            </span>
          </label>
        ) : (
          <Choose
            id={id}
            value={value === null ? '' : String(value)}
            onChange={(v) => set(key, (v === '' ? null : v === 'true') as never)}
            options={field.choices ?? []}
            unset={given ?? 'not set'}
          />
        );
      break;
    case 'schema':
      control = <SchemaInput form={form} id={id} step={step} schemas={schemas} update={update} given={given} />;
      break;
  }

  return (
    <div data-field={key} className="space-y-1">
      <label htmlFor={id} className="block font-mono text-xs font-medium">
        {key}
      </label>
      {control}
      <Meaning>{meaning}</Meaning>
    </div>
  );
}

/** A value a step's agent gives it, as its field shows it in place of none: `opus — implementer's`, or that the agent sets none either. */
function givenText(key: keyof WorkflowStepSpec, value: WorkflowStepSpec[keyof WorkflowStepSpec], agent: string | null): string {
  if (value === null || (Array.isArray(value) && !value.length)) return `not set — nor by ${agent}`;
  const text = Array.isArray(value)
    ? value.join(', ')
    : key === 'context' && typeof value === 'number'
      ? contextText(value)
      : String(value);
  return `${text} — ${agent}'s`;
}

function Meaning({ children }: { children: string }) {
  return <Markdown className="text-[11px] leading-snug text-muted-foreground">{children}</Markdown>;
}

const asIs = (value: string) => value;

/**
 * A select of `options`, `unset` first; a value the options lack is kept as one, said by `stray`, so what the file says is never hidden.
 */
function Choose({
  id,
  value,
  onChange,
  options,
  unset,
  stray = asIs,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  unset: string;
  stray?: (value: string) => string;
}) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={INPUT}>
      <option value="">{unset}</option>
      {value && !options.includes(value) && <option value={value}>{stray(value)}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/**
 * A field typed into: what is typed stays as typed — `Read, ` on its way to `Read, Grep` — and each keystroke is committed to the draft as
 * the key reads it. `value` is the draft's, as `canon` writes what is typed: when the draft changes under the field — a loop drawn gives it
 * rounds — the field shows the draft's.
 */
function Typed({
  id,
  value,
  commit,
  canon,
  mono = false,
  type = 'text',
  step,
  placeholder,
}: {
  id: string;
  value: string;
  commit: (typed: string) => void;
  canon: (typed: string) => string;
  mono?: boolean;
  type?: 'text' | 'number';
  step?: string;
  placeholder?: string;
}) {
  const [typed, setTyped] = useState(value);
  return (
    <input
      id={id}
      type={type}
      step={step}
      min={type === 'number' ? 0 : undefined}
      value={canon(typed) === value ? typed : value}
      placeholder={placeholder ?? 'not set'}
      onChange={(event) => {
        setTyped(event.target.value);
        commit(event.target.value);
      }}
      className={mono ? MONO_INPUT : INPUT}
    />
  );
}

/**
 * `output:`: a schema beside the step, picked from the folder's — or pasted, with the file it is written to, which is written when the
 * draft is saved and replaces a file of that name. Picking a file or none takes a paste back.
 */
function SchemaInput({
  id,
  step,
  form,
  schemas,
  update,
  given,
}: {
  id: string;
  step: DraftStep;
  form: KeyForm;
  schemas: readonly string[];
  update: DraftUpdate;
  given: string | null;
}) {
  const text = useId();
  const file = useId();
  const pasted = step.schema;
  const value = pasted ? PASTE : given !== null ? '' : (step.spec.output ?? '');

  return (
    <div className="space-y-1.5">
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const picked = event.target.value;
          update((all) =>
            picked === PASTE
              ? setSchema(all, step.name, { file: `${step.name}.schema.json`, text: '' })
              : setKey(setSchema(all, step.name, null), step.name, 'output', picked || null, form),
          );
        }}
        className={INPUT}
      >
        <option value="">{given ?? 'not set'}</option>
        {step.spec.output && !pasted && given === null && !schemas.includes(step.spec.output) && (
          <option value={step.spec.output}>{step.spec.output} — not in the folder</option>
        )}
        {schemas.map((schema) => (
          <option key={schema} value={schema}>
            {schema}
          </option>
        ))}
        <option value={PASTE}>Paste a schema…</option>
      </select>
      {pasted && (
        <div className="space-y-1 rounded border border-dashed border-outline p-2">
          <label htmlFor={file} className="block text-[11px] text-muted-foreground">
            Written on save as
          </label>
          <input
            id={file}
            value={pasted.file}
            onChange={(event) => update((all) => setSchema(all, step.name, { ...pasted, file: event.target.value }))}
            className={MONO_INPUT}
          />
          <label htmlFor={text} className="block text-[11px] text-muted-foreground">
            The JSON Schema{schemas.includes(pasted.file) ? `, replacing ${pasted.file}` : ''}
          </label>
          <textarea
            id={text}
            value={pasted.text}
            rows={6}
            placeholder={'{ "type": "object", "properties": { … }, "required": [ … ], "additionalProperties": false }'}
            onChange={(event) => update((all) => setSchema(all, step.name, { ...pasted, text: event.target.value }))}
            className={`${MONO_INPUT} resize-y`}
          />
        </div>
      )}
    </div>
  );
}
