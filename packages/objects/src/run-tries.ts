/**
 * A step's tries, its sub-resources beside the run object: each try whole (`StepTry`), the tries of a step (`StepTries`), what a try signed
 * off with (`StepCloseout`, `TryCloseout`) or why that does not read (`StepUnreadable`), and a closeout read narrowly
 * (`closeoutNarrowed`). Cut from `run.ts`, whose step they are of. Plain JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { Actor } from './token.ts';
import { describedOne } from './meta.ts';
import { BODY_PAGE, SHORT_FIELD } from './reads.ts';
import { STEP_CODES } from './run.ts';
import { StepArtifact, StepAttempts, StepCheck } from './run-step.ts';
import { ANSWER_VIA, FIELD_SHAPES, OUTCOMES, STEP_PHASES, STEP_REASONS, TRY_CAUSES, WAIT_ON } from './words.ts';

/** An array as the package's types hold one, mutable, so a page built off the object keeps their types. */
const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);
const NullString = Schema.NullOr(Schema.String);
const StepPhase = Schema.Literals(STEP_PHASES);
const StepReason = Schema.Literals(STEP_REASONS);

/** A closeout's questions under one field of its output (`Asked`, question.ts). */
const Asked = Schema.Struct({
  field: Schema.String.annotate({ description: 'The output field the questions were asked under.' }),
  questions: List(
    Schema.Struct({
      title: Schema.String.annotate({ description: 'The question, in one line; unique among the questions of the field.' }),
      body: Schema.String.annotate({ description: 'What a person needs to know to answer it.' }),
      options: List(
        Schema.Struct({
          label: Schema.String.annotate({ description: 'The option, as a person picks it; unique among the options.' }),
          meaning: Schema.String.annotate({ description: 'What picking it means.' }),
        }),
      ).annotate({ description: 'The options it offers.' }),
      recommended: Schema.NullOr(Schema.Union([Schema.String, List(Schema.String)])).annotate({
        description:
          'The option the agent recommends, as it wrote it: one label, or a list of labels on a question that takes multiple; null where none.',
      }),
      multiple: Schema.Boolean.annotate({ description: 'Whether several options may be chosen together.' }),
    }),
  ).annotate({ description: 'Its questions, in the order the agent gave them.' }),
});

/** A JSON object whose keys a step's workflow decides (a closeout's `output`, the schema it was read by). */
const Fields = Schema.Record(Schema.String, Schema.Unknown);

/**
 * What a try signed off with, as the page reads it (`StepCloseout`, tries.verb.ts): its outcome, summary, body and needs, the files and
 * values it handed on, the fields its workflow asked for (`output`) and the schema they were read by, the replies to findings, its
 * questions, what it left out or was refused, and the closeout as it came (`raw`).
 */
export const StepCloseout = Schema.Struct({
  apiVersion: NullString.annotate({ description: 'The version the closeout says it is written in; null where it says none.' }),
  outcome: Schema.Literals(OUTCOMES).annotate({ description: 'How the try signed off: done, or blocked.' }),
  summary: Schema.String.annotate({ description: 'Its one line on what it did.' }),
  body: NullString.annotate({ description: 'Its markdown account, one page of it on a narrowed read; null where it wrote none.' }),
  needs: NullString.annotate({ description: 'What a person has to settle, on a blocked closeout; null otherwise.' }),
  artifacts: List(StepArtifact).annotate({ description: 'The files it handed on, each served, pruned, or only its path.' }),
  values: List(
    Schema.Struct({
      name: Schema.String.annotate({ description: "The value's name." }),
      value: Schema.String.annotate({ description: 'The value.' }),
      link: NullString.annotate({ description: 'A link to it where the value is an address; null otherwise.' }),
    }),
  ).annotate({
    description: 'The values it handed on, each with its name, and a link where the value is an address.',
  }),
  refused: Strings.annotate({ description: 'The files it named that were refused, not handed on.' }),
  output: Fields.annotate({ description: 'The fields its workflow asked for, by name; a narrowed read leaves the long ones out.' }),
  missing: Strings.annotate({ description: 'The fields its workflow asked for that it left out.' }),
  replies: Schema.NullOr(
    List(
      Schema.Struct({
        finding: Schema.String.annotate({ description: 'The finding it answers.' }),
        answer: Schema.String.annotate({ description: "Its answer: fixed or won't fix." }),
        why: Schema.String.annotate({ description: 'Why it answered so.' }),
      }),
    ),
  ).annotate({
    description: "Its answer to each finding it was handed: the finding, fixed or won't fix, and why; null where it gave none.",
  }),
  schema: Fields.annotate({ description: 'The JSON Schema its output was read by.' }),
  /** The shape (`FIELD_SHAPES`) of each field of `schema` its step's output marked by `x-shape`; absent where it marked none. */
  shapes: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Literals(FIELD_SHAPES)).annotate({
      description: 'The shape of each field of its schema its output marked by x-shape; absent where it marked none.',
    }),
  ),
  questions: List(Asked).annotate({ description: 'Its questions, by the output field they were asked under, each with its options.' }),
  raw: describedOne(Schema.Unknown, 'The closeout as it came, on a read that names every field (?fields=*); null otherwise.'),
  /**
   * The names of the fields of `output` a narrowed read left out (`closeoutNarrowed`, asked with `?fields=`), each to be asked for by
   * name; absent from a whole read.
   */
  outputLeftOut: Schema.optionalKey(
    Strings.annotate({
      description: 'The fields of output a narrowed read left out, each to be asked for by name (?fields=); absent from a whole read.',
    }),
  ),
  /** The character of `body` to read on from (`?bodyFrom=`), where a read answered one page of it and more is left; absent otherwise. */
  bodyNext: Schema.optionalKey(
    Schema.Finite.annotate({
      description:
        'The character of body to read on from (?bodyFrom=), where a read answered one page of it and more is left; absent otherwise.',
    }),
  ),
}).annotate({ identifier: 'StepCloseout' });
export type StepCloseout = typeof StepCloseout.Type;

/**
 * The names a narrowing query lists — `?fields=` of a closeout's `output`, `?diffs=` of a decision's paths — as JSON:API spells a sparse
 * fieldset: comma-separated, each name trimmed, an empty one naming none, `*` naming every one. Pure.
 *
 * @param fields The query's text, as it was sent.
 */
export const fieldsNamed = (fields: string) =>
  fields
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');

/**
 * A closeout as it came (`raw`), its `body` cut to the characters `[from, to)` a read answers of the closeout's own, so the page bounds
 * both: a `raw` that is no object, or whose `body` is no string, as it is.
 */
const rawPaged = (raw: unknown, from: number, to: number) =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) && typeof (raw as { body?: unknown }).body === 'string'
    ? { ...raw, body: (raw as { body: string }).body.slice(from, to) }
    : raw;

/** The page of a closeout's `body` a read asks for: the character it starts at, and how many it holds at most. */
export type BodyPage = { readonly from: number; readonly limit: number };

/**
 * `closeout` read narrowly, as every read of it is: what a person decides on — its outcome, summary, needs, files and values, its
 * questions, replies, what it left out and was refused — whole; its `body` cut to the page `body` asks (`BODY_PAGE` by default, never
 * past its most), `bodyNext` the character to read on from where more is left; of its `output` (and the `schema` it was read by) the
 * fields `fields` names — every one where it names `*`, and where it is not given those whose JSON is at most `SHORT_FIELD` characters —
 * those it left out named in `outputLeftOut`; the closeout as it came (`raw`) kept where `fields` names `*`, its `body` cut to the same
 * page (`rawPaged`), else left out, as null. Pure.
 *
 * @param closeout The closeout read whole.
 * @param fields The names `?fields=` lists (`fieldsNamed`), or undefined where it was not given.
 * @param body The page of its `body` asked for: the character it starts at, and how many it holds at most.
 */
export const closeoutNarrowed = (
  closeout: StepCloseout,
  fields: readonly string[] | undefined,
  body: BodyPage = { from: 0, limit: BODY_PAGE.byDefault },
) => {
  const keeps = (name: string) =>
    fields === undefined
      ? (JSON.stringify(closeout.output[name]) ?? '').length <= SHORT_FIELD
      : fields.includes('*') || fields.includes(name);
  const kept = <V>(record: Readonly<Record<string, V>>) => Object.fromEntries(Object.entries(record).filter(([name]) => keeps(name)));
  const from = Math.max(0, body.from);
  const to = from + Math.min(Math.max(1, body.limit), BODY_PAGE.most);
  const whole = closeout.body;
  const { bodyNext: _bodyNext, ...rest } = closeout;
  return {
    ...rest,
    body: whole === null ? null : whole.slice(from, to),
    ...(whole !== null && to < whole.length ? { bodyNext: to } : {}),
    output: kept(closeout.output),
    schema: kept(closeout.schema),
    ...(closeout.shapes === undefined ? {} : { shapes: kept(closeout.shapes) }),
    raw: fields?.includes('*') === true ? rawPaged(closeout.raw, from, to) : null,
    outputLeftOut: Object.keys(closeout.output).filter((name) => !keeps(name)),
  };
};

/** Why a try's closeout does not read, and what it held (`StepUnreadable`, tries.verb.ts). */
export const StepUnreadable = Schema.Struct({
  error: Schema.String.annotate({ description: "Why the try's closeout does not read." }),
  raw: describedOne(Schema.Unknown, 'What it held, as it came.'),
}).annotate({ identifier: 'StepUnreadable' });
export type StepUnreadable = typeof StepUnreadable.Type;

/**
 * One try of a step whole (`StepTry`, tries.verb.ts): its number, round and why it was moved behind (null for the current), its task, where
 * it stands as codes and in words, its attempts, check, closeout or why that does not read, and a person's answer to it.
 */
export const StepTry = Schema.Struct({
  try: Schema.Finite.annotate({ description: "The try's number, from 1." }),
  round: Schema.Finite.annotate({ description: "The round of the step's loop it was filed in, from 1." }),
  cause: Schema.NullOr(Schema.Literals(TRY_CAUSES)).annotate({
    description: 'Why it was moved behind, as a code; null for the current try.',
  }),
  current: Schema.Boolean.annotate({ description: "Whether it is the step's current try." }),
  taskId: NullString.annotate({ description: 'Its task; null while none was filed.' }),
  note: NullString.annotate({ description: 'What nemia ls prints beside it; null where nothing.' }),
  phase: StepPhase.annotate({ description: 'Where it is in its life, as a code: the phase its reason stands in.' }),
  reason: StepReason.annotate({ description: 'Why it is in its phase, as a code.' }),
  on: Schema.NullOr(Schema.Literals(WAIT_ON)).annotate({
    description: 'What it waits on, set exactly when its reason is Waiting; null otherwise.',
  }),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)).annotate({
    description: 'Where an awaited answer is asked, set only when its reason is AwaitingAnswer; null otherwise.',
  }),
  message: Schema.String.annotate({ description: 'Where it stands, in the sentence a person reads.' }),
  attempts: StepAttempts,
  check: Schema.NullOr(StepCheck).annotate({ description: 'Its check; null where none was filed.' }),
  closeout: Schema.NullOr(StepCloseout).annotate({
    description: 'What it signed off with; null while it has not, or where its closeout does not read.',
  }),
  unreadable: Schema.NullOr(StepUnreadable).annotate({
    description: 'Why its closeout does not read, and what it held; null where it reads or there is none.',
  }),
  answer: NullString.annotate({
    description:
      'What a person said to this try when they asked for it (nemia retry --message); null for a try nobody answered, and for every first try.',
  }),
  answeredBy: Schema.optionalKey(Actor),
})
  .check(STEP_CODES)
  .annotate({ identifier: 'StepTry' });
export type StepTry = typeof StepTry.Type;

/** A step's tries, earliest first, the current one last: `GET /api/runs/:runId/steps/:step/tries`. */
export const StepTries = Schema.Struct({
  tries: List(StepTry).annotate({ description: "The step's tries, earliest first, the current one last." }),
}).annotate({ identifier: 'StepTries' });
export type StepTries = typeof StepTries.Type;

/** What a try of a step signed off with, or why it does not read (each null where there is none): `…/tries/:try/closeout`. */
export const TryCloseout = Schema.Struct({
  try: Schema.Finite.annotate({ description: "The try's number, from 1." }),
  closeout: Schema.NullOr(StepCloseout).annotate({
    description: 'What the try signed off with; null where there is none or it does not read.',
  }),
  unreadable: Schema.NullOr(StepUnreadable).annotate({
    description: 'Why its closeout does not read; null where it reads or there is none.',
  }),
}).annotate({ identifier: 'TryCloseout' });
export type TryCloseout = typeof TryCloseout.Type;
