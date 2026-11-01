import type { StepArtifact, StepTry } from './api';
import type { AttemptEnd } from './api/tries.ts';

/**
 * How the Output tab draws one field of a closeout. A closed set, and `json` is the answer for anything it does not recognise:
 * the value as it came, under its field's name.
 */
export type OutputKind = 'findings' | 'replies' | 'table' | 'yesno' | 'list' | 'image' | 'markdown' | 'text' | 'json';

/** The length past which a string of one line is a block of markdown rather than a word or two beside its field's name. */
export const MARKDOWN_AT = 120;

type Schema = { type?: unknown; items?: unknown; properties?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isScalar = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** The JSON Schema types a value is: an integer is a number too. */
function typesOf(value: unknown): string[] {
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array'];
  if (typeof value === 'number') return Number.isInteger(value) ? ['integer', 'number'] : ['number'];
  return [typeof value];
}

/** Whether the value is what its schema's `type` says; a schema that names no type says nothing, and so agrees. */
function agrees(schema: Schema | undefined, value: unknown): boolean {
  const declared = schema?.type;
  if (declared === undefined) return true;
  const allowed = Array.isArray(declared) ? declared : [declared];
  return typesOf(value).some((t) => allowed.includes(t));
}

/** Which records an array of objects is, by the keys they have: a place and a line, a finding and its answer, or flat fields. */
function recordsKind(keys: ReadonlySet<string>, flat: boolean): OutputKind {
  if (keys.has('file') && keys.has('line')) return 'findings';
  if (keys.has('finding') && keys.has('answer')) return 'replies';
  return flat ? 'table' : 'json';
}

/**
 * How a closeout's field is drawn, from the value's shape and the schema it was declared by — never from the field's or the step's
 * name, which this is not given. `images` are the paths of the try's artifacts that are images: only they can say a string names one.
 * A value its schema does not describe is `json`, drawn as it came, since a drawing chosen by the schema would say what it is not. An
 * empty array has no shape to read, so its schema says it: records by the keys its items declare, anything else an empty `list`.
 *
 * This is the one seam between a closeout and its drawing: a generic renderer, or a judgment choosing a component, would replace it,
 * taking the same three things and answering the same closed set, `json` when nothing fits.
 */
export function outputKind(schema: unknown, value: unknown, images: ReadonlySet<string>): OutputKind {
  const s = isRecord(schema) ? (schema as Schema) : undefined;
  if (!agrees(s, value)) return 'json';
  if (typeof value === 'boolean') return 'yesno';
  if (typeof value === 'number') return 'text';
  if (typeof value === 'string') {
    if (images.has(value)) return 'image';
    return value.includes('\n') || value.length > MARKDOWN_AT ? 'markdown' : 'text';
  }
  if (!Array.isArray(value)) return 'json';
  const items = isRecord(s?.items) ? (s.items as Schema) : undefined;
  if (value.length === 0) {
    const declared = isRecord(items?.properties) ? Object.keys(items.properties) : null;
    return declared ? recordsKind(new Set(declared), true) : 'list';
  }
  if (value.every((item) => typeof item === 'string')) return 'list';
  if (!value.every(isRecord)) return 'json';
  const records = value;
  const keys = new Set(records.flatMap((item) => Object.keys(item)));
  return recordsKind(
    keys,
    records.every((item) => Object.values(item).every(isScalar)),
  );
}

/** The paths of the artifacts that are images the api serves: what `outputKind` is told a string may name. */
export const imagePaths = (artifacts: readonly StepArtifact[]): ReadonlySet<string> =>
  new Set(artifacts.flatMap((a) => ('url' in a && a.kind === 'image' ? [a.path] : [])));

/** A field's `description` in its schema, when it has one: what a yes or a no means. */
export const descriptionOf = (schema: unknown): string | null =>
  isRecord(schema) && typeof schema.description === 'string' ? schema.description : null;

/**
 * Who said how a try ended, and what: the agent, in its statement, or in one that could not be read; the machine, in the reason its
 * attempt ended without one; or nobody yet — still running, or not filed — in the words the inspector has for that.
 */
export type Outcome =
  | { by: 'agent'; outcome: 'done' | 'blocked'; cut: string | null }
  | { by: 'machine'; reason: string; words: string }
  | { by: 'unreadable'; words: string }
  | { by: 'nobody'; words: string };

/**
 * The machine's reason an attempt has no statement, in a sentence each, off the engine's `EndReason` (agent-runtime) — but for
 * `unsigned`, the orchestrator's end word (`endWords`), no longer one of the engine's: an end without the statement its task asked for.
 * `harness` is not here: a harness's own end is a reason only when it said `failed` or `stopped` (`outcomeOf`).
 */
export const MACHINE_WORDS: Readonly<Partial<Record<AttemptEnd, string>>> = {
  unsigned: 'The session ended without the closing statement it was asked for. It may have finished; it did not say so.',
  lost: 'The session was lost: it vanished, or its worker stopped beating, before it said how it went.',
  unstartable: 'The session never started: its harness vouched that nothing ran.',
  budget: 'Its harness cut the session off at the spend cap its task gave it, before it said how it went.',
  operator: 'A person stopped it before it said how it went.',
  deadline: 'It ran past its deadline, and was stopped before it said how it went.',
};

/** What is said after an agent's statement when its attempt was cut anyway: it spoke, and then the machine ended it. */
const CUT_WORDS: Readonly<Partial<Record<AttemptEnd, string>>> = {
  operator: 'then a person stopped it',
  deadline: 'then it ran past its deadline and was stopped',
  budget: 'then its harness cut it off at its spend cap',
};

/**
 * How a try ended and who said so. `none` is what the inspector says of a try with no statement and no reason on the record, and of any
 * reason `MACHINE_WORDS` does not name but a harness's `failed` or `stopped`: the orchestrator reports a harness's `done` with no statement
 * as `unsigned` (`endWords`).
 */
export function outcomeOf(t: Pick<StepTry, 'closeout' | 'unreadable' | 'attempts'>, none: string): Outcome {
  const latest = t.attempts.latest;
  if (t.closeout) return { by: 'agent', outcome: t.closeout.outcome, cut: (latest?.reason && CUT_WORDS[latest.reason]) || null };
  if (t.unreadable)
    return {
      by: 'unreadable',
      words: `It gave a closing statement that could not be read (${t.unreadable.error}). Here it is as it came.`,
    };
  if (!latest?.ended || !latest.reason) return { by: 'nobody', words: none };
  const words = MACHINE_WORDS[latest.reason];
  if (words) return { by: 'machine', reason: latest.reason, words };
  if (latest.reason === 'harness' && (latest.ended === 'failed' || latest.ended === 'stopped')) {
    return {
      by: 'machine',
      reason: latest.ended,
      words: `Its harness ended the session ${latest.ended}, and it said nothing of how it went.`,
    };
  }
  return { by: 'nobody', words: none };
}

/**
 * An outcome in the word a fold's summary and the head's badge give it: `done`, `blocked`, `unreadable`, the machine's reason, or
 * `no closeout`.
 */
export const outcomeWord = (o: Outcome): string =>
  o.by === 'agent' ? o.outcome : o.by === 'machine' ? o.reason : o.by === 'unreadable' ? 'unreadable' : 'no closeout';

/** How many entries a list holds before the gate folds it: a plan's three risks are read at a glance, its dozen files are not. */
export const FOLD_AT = 4;

/**
 * Whether a closeout's field is folded where a person reads it beside a gate (`HandedOn`): a list or a table of `FOLD_AT` entries or
 * more, under its name and how many. Never the first field declared — a plan's `approach`, what the step is saying — and never a text,
 * which is read whole or not at all; the Output tab folds nothing.
 */
export const foldsAtGate = (value: unknown, first: boolean): boolean => !first && Array.isArray(value) && value.length >= FOLD_AT;
