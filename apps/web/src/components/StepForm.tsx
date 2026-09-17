import { useId, useState, type ReactNode } from 'react';
import type { KeyField, KeyForm, WorkflowStepSpec } from '../lib/api';
import { listOf, numberOf, removeStep, setBody, setKey, setSchema, type DraftStep } from '../lib/builder';
import { Markdown } from './Markdown';

/** A change to the whole draft, made in one step so a key and what comes with it land together. */
export type DraftUpdate = (change: (steps: DraftStep[]) => DraftStep[]) => void;

const INPUT =
  'block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400';
const MONO_INPUT = `${INPUT} font-mono text-xs`;

/** The option of a `schema` field that opens the box a schema is pasted into: no schema's file, which ends in .json. */
const PASTE = '(paste)';

/**
 * A step's form on the builder: what its agent is told, then a field per key the api's form has (`KeyForm`), in the package's order, each with
 * the package's line of what it means — drawn by kind, so a key the package adds is drawn once the api says how it is set. Every change is
 * made to the draft at once; nothing is judged here that the package judges on save, and a refusal of the last save for this step is shown
 * above its fields.
 */
export function StepForm({ step, steps, form, schemas, refused, update, onRemoved }: {
  step: DraftStep;
  steps: readonly DraftStep[];
  form: KeyForm;
  schemas: readonly string[];
  refused: string | null;
  update: DraftUpdate;
  onRemoved: () => void;
}) {
  const body = useId();
  const others = steps.filter((s) => s.name !== step.name).map((s) => s.name);

  return (
    <section aria-label={`Keys of ${step.name}`} data-step-form={step.name} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate font-mono text-sm font-semibold" title={step.name}>
          {step.name}
          <span className="font-sans text-xs font-normal text-neutral-500">.md</span>
        </h3>
        <button
          type="button"
          onClick={() => {
            update((all) => removeStep(all, step.name));
            onRemoved();
          }}
          className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:border-red-400 hover:text-red-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-red-500 dark:hover:text-red-400"
        >
          Remove step
        </button>
      </div>

      {refused && (
        <div data-refused-here className="space-y-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-xs font-medium text-red-800 dark:text-red-300">The last save was refused for {step.name}:</p>
          <p className="font-mono text-[11px] whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{refused}</p>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor={body} className="block text-xs font-medium">
          What its agent is told
        </label>
        <textarea
          id={body}
          value={step.body}
          rows={5}
          onChange={(event) => update((all) => setBody(all, step.name, event.target.value))}
          className={`${INPUT} resize-y`}
        />
      </div>

      {form.keys.map((field) => (
        <KeyInput key={`${step.name}:${field.key}`} field={field} step={step} others={others} form={form} schemas={schemas} update={update} />
      ))}
    </section>
  );
}

/** One key's field: its name, the control its kind is set with, and what it means. */
function KeyInput({ field, step, others, form, schemas, update }: {
  field: KeyField;
  step: DraftStep;
  others: readonly string[];
  form: KeyForm;
  schemas: readonly string[];
  update: DraftUpdate;
}) {
  const id = useId();
  const { key, kind, meaning } = field;
  const value = step.spec[key];
  const set = <K extends keyof WorkflowStepSpec>(k: K, v: WorkflowStepSpec[K]) => update((all) => setKey(all, step.name, k, v));
  const harness = step.spec.harness ?? form.defaultHarness;

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
        <p className="text-xs text-neutral-500">No other step to name.</p>
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
        <Choose id={id} value={(value as string | null) ?? ''} onChange={(v) => set(key, (v || null) as never)} options={others} unset="not set" />
      );
      break;
    case 'choice':
      control = (
        <Choose id={id} value={(value as string | null) ?? ''} onChange={(v) => set(key, (v || null) as never)} options={field.choices ?? []} unset={`not set — ${form.defaultHarness}`} />
      );
      break;
    case 'harness-word':
      control = (
        <Choose
          id={id}
          value={(value as string | null) ?? ''}
          onChange={(v) => set(key, (v || null) as never)}
          options={field.byHarness?.[harness] ?? []}
          unset={`not set — ${harness}'s own`}
          stray={(v) => `${v} — not a word ${harness} takes`}
        />
      );
      break;
    case 'text':
      control = (
        <Typed id={id} value={(value as string | null) ?? ''} mono={key === 'check'} canon={(typed) => typed.trim()} commit={(typed) => set(key, (typed.trim() || null) as never)} />
      );
      break;
    case 'list': {
      const listed = value as string[] | null;
      control = (
        <Typed
          id={id}
          mono
          value={listed ? listed.join(', ') : ''}
          placeholder={key === 'tools' ? "the harness's own set" : 'nothing denied'}
          canon={(typed) => listOf(typed).join(', ')}
          // No tools typed is no `tools:` line, the harness's own set; no rule typed denies nothing. A list of commas the package refuses.
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
          canon={(typed) => String(numberOf(typed) ?? '')}
          commit={(typed) => set(key, numberOf(typed) as never)}
        />
      );
      break;
    case 'flag':
      control = (field.choices ?? []).length === 1 ? (
        <label className="flex items-center gap-1.5 text-xs">
          <input id={id} type="checkbox" checked={value === true} onChange={(event) => set(key, (event.target.checked ? true : null) as never)} />
          <span className="font-mono">{key}: {field.choices![0]}</span>
        </label>
      ) : (
        <Choose id={id} value={value === null ? '' : String(value)} onChange={(v) => set(key, (v === '' ? null : v === 'true') as never)} options={field.choices ?? []} unset="not set" />
      );
      break;
    case 'schema':
      control = <SchemaInput id={id} step={step} schemas={schemas} update={update} />;
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

function Meaning({ children }: { children: string }) {
  return <Markdown className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{children}</Markdown>;
}

/** A select of `options`, `unset` first; a value the options lack is kept as one, said by `stray`, so what the file says is never hidden. */
function Choose({ id, value, onChange, options, unset, stray = (v) => v }: {
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
 * A field typed into: what is typed stays as typed — `Read, ` on its way to `Read, Grep` — and each keystroke is committed to the draft as the
 * key reads it. `value` is the draft's, as `canon` writes what is typed: when the draft changes under the field — a loop drawn gives it rounds —
 * the field shows the draft's.
 */
function Typed({ id, value, commit, canon, mono = false, type = 'text', step, placeholder }: {
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
 * `output:`: a schema beside the step, picked from the folder's — or pasted, with the file it is written to, which is written when the draft is
 * saved and replaces a file of that name. Picking a file or none takes a paste back.
 */
function SchemaInput({ id, step, schemas, update }: { id: string; step: DraftStep; schemas: readonly string[]; update: DraftUpdate }) {
  const text = useId();
  const file = useId();
  const pasted = step.schema;
  const value = pasted ? PASTE : step.spec.output ?? '';

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
              : setKey(setSchema(all, step.name, null), step.name, 'output', picked || null),
          );
        }}
        className={INPUT}
      >
        <option value="">not set</option>
        {step.spec.output && !pasted && !schemas.includes(step.spec.output) && <option value={step.spec.output}>{step.spec.output} — not in the folder</option>}
        {schemas.map((schema) => (
          <option key={schema} value={schema}>
            {schema}
          </option>
        ))}
        <option value={PASTE}>Paste a schema…</option>
      </select>
      {pasted && (
        <div className="space-y-1 rounded border border-dashed border-neutral-300 p-2 dark:border-neutral-700">
          <label htmlFor={file} className="block text-[11px] text-neutral-500">
            Written on save as
          </label>
          <input
            id={file}
            value={pasted.file}
            onChange={(event) => update((all) => setSchema(all, step.name, { ...pasted, file: event.target.value }))}
            className={MONO_INPUT}
          />
          <label htmlFor={text} className="block text-[11px] text-neutral-500">
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
