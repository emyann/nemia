/**
 * The closeout: the shape of a step's closing statement as the harness is asked for it, reading one a session gave, what of it a step
 * declared and owes, and what every step is told about finishing.
 *
 * Pure, as run.ts is, and beneath it: run.ts imports what it needs from here, and nothing here imports run.ts. `tick.ts` files each
 * step with `closeoutSchemaOf`, and the controllers read the engine's record with `parseCloseout`; nothing here reads a disk or calls the engine.
 */
import { CLOSEOUT_FIELDS, LOOP_REPLIES, outputFields, type Workflow } from './workflow.ts';

/**
 * The shape of a step's closing statement, handed to the engine as a JSON Schema.
 *
 * The engine passes it to the harness verbatim — Claude Code turns it into a StructuredOutput tool
 * the agent calls to finish, Codex into `--output-schema` — and records what comes back without
 * reading it. The shape and what it means live here, because they are this package's vocabulary
 * and nothing underneath should have to learn it.
 *
 * Strict on purpose: every property required and `needs` nullable rather than optional. Codex
 * enforces strict structured outputs, and a schema has to satisfy the strictest harness it will be
 * handed to. Verified against codex 0.154.0.
 *
 * It replaced a file each step wrote into its own worktree, and the file's failures are the reason.
 * The file travelled down the git branch, so the next step started out finished. Its path had to be
 * told to the engine in one place and to the agent in another. And a step could write it, carry on,
 * and rewrite it. A statement made to the harness lives in the session, belongs to the attempt that
 * made it, and needs no path.
 */
export const CLOSEOUT_SCHEMA = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['done', 'blocked'] },
    summary: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'string' } },
    needs: { type: ['string', 'null'] },
  },
  required: ['outcome', 'summary', 'artifacts', 'needs'],
  additionalProperties: false,
};

/** A closeout schema as the engine is handed it. */
export type CloseoutSchema = { type: string; properties: Record<string, object>; required: string[]; additionalProperties: boolean };

/**
 * The schema a step is filed with: `CLOSEOUT_SCHEMA`, and the fields its `output:` declares, merged.
 *
 * Still strict: each declared field is required beside the four, and nothing else is allowed. The
 * declared schema was refused at load unless its own objects were strict, so what reaches the harness
 * is strict all the way down. It comes from the step the run froze at `wf start`, never the folder.
 *
 * On a loop's target (`isLoopTarget`), `REPLIES_SCHEMA` is merged too: the target's answer to each finding it
 * was handed, which the next round's looping step reads. On every try, round 1's included, decided from the
 * frozen workflow alone and never from the round the run is on: the schema is the session's `StructuredOutput`
 * tool, and a round that continued a session under another one paid for the whole conversation again. What
 * is owed, and when, is `owedFields`'.
 */
export function closeoutSchemaOf(step: Workflow, steps: readonly Workflow[]): CloseoutSchema {
  const replies = isLoopTarget(steps, step.name);
  if (!step.output && !replies) return CLOSEOUT_SCHEMA;
  const properties = step.output?.schema.properties ?? {};
  return {
    ...CLOSEOUT_SCHEMA,
    properties: { ...CLOSEOUT_SCHEMA.properties, ...properties, ...(replies ? { [LOOP_REPLIES]: REPLIES_SCHEMA } : {}) },
    required: [...CLOSEOUT_SCHEMA.required, ...Object.keys(properties), ...(replies ? [LOOP_REPLIES] : [])],
  };
}

/**
 * What a step says on its way out.
 *
 * Two audiences, deliberately separated, which is the whole reason this is a record and not a
 * string. `summary` is prose for the DECIDER — a person, at the end of the run. `artifacts` is for
 * the machine and for the next step: the files this step wants read.
 *
 * The reviewer never sees `summary`. Passing the implementer's account of the work to the person
 * judging it would anchor the judgement on the context that produced the work, and offer
 * unverifiable claims beside verifiable evidence — the rule `composeBrief` already keeps. An agent
 * kanban we compared with injects the parent's summary into the child's prompt; this is the one place worth
 * diverging, and the field earns its place by travelling to the human instead.
 */
export type Closeout = {
  /** `done` finished the work. `blocked` finished the SESSION and needs a person. */
  outcome: 'done' | 'blocked';
  summary: string;
  /** Files this step produced for whoever reads next, by path from the workspace root. */
  artifacts: string[];
  /** Set when blocked: what the person has to settle. */
  needs?: string;
  /**
   * Every field beyond those four, as the harness returned it — what a step's `output:` declares.
   * Absent when there are none. Only the declared fields mean anything, and only they travel, to a step
   * that asks (`declaredOutput`).
   */
  output?: Record<string, unknown>;
};

/**
 * Read a closeout, forgivingly.
 *
 * The harness enforced the shape, but an agent filled it in, and a run must not become unreadable
 * because one step's answer came back odd. It arrives as the object the engine recorded; text is
 * accepted too, since that is what a harness that could not parse its own answer hands back.
 */
export function parseCloseout(value: unknown): Closeout | { error: string } {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { return { error: `unparseable: ${(e as Error).message}` }; }
  }
  // `typeof [] === 'object'`, so an array would otherwise read as an empty closeout.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'not an object' };
  const o = raw as Record<string, unknown>;
  const rest = Object.entries(o).filter(([k]) => !(CLOSEOUT_FIELDS as readonly string[]).includes(k));
  return {
    outcome: o.outcome === 'blocked' ? 'blocked' : 'done',
    summary: typeof o.summary === 'string' ? o.summary : '',
    artifacts: Array.isArray(o.artifacts) ? o.artifacts.filter((a): a is string => typeof a === 'string') : [],
    // Nullable in the schema because strict harnesses require every property; absent here.
    needs: typeof o.needs === 'string' && o.needs ? o.needs : undefined,
    ...(rest.length ? { output: Object.fromEntries(rest) } : {}),
  };
}

/**
 * What a closeout says of the fields its step's `output:` declares: those it gave, in the schema's
 * order, and those it did not. Nothing else of the closeout is in either — this is the one door a
 * closeout's content passes through on its way to another step. `fields` names the ones asked about, when
 * that is not what the step declares: `owedFields` adds a loop's `replies`, a round hands on its findings without `again`.
 *
 * An empty `replies` is missing: the schema allows it, since round 1's answer is `[]` on a schema that is the same every round,
 * and a target handed findings that answers none of them has not answered.
 */
export function declaredOutput(step: Workflow, said: Closeout | undefined, fields: readonly string[] = outputFields(step)): { given: Record<string, unknown>; missing: string[] } {
  const given: Array<[string, unknown]> = [];
  const missing: string[] = [];
  const answered = (field: string, value: unknown) => field !== LOOP_REPLIES || !Array.isArray(value) || value.length > 0;
  for (const field of fields) {
    if (said?.output && Object.hasOwn(said.output, field) && answered(field, said.output[field])) given.push([field, said.output[field]]);
    else missing.push(field);
  }
  // `Object.fromEntries` defines each field as a property of its own. Assignment does not for
  // `__proto__`, a key JSON may name: it set the prototype, and the field never reached the step reading it.
  return { given: Object.fromEntries(given), missing };
}

/**
 * A step's declared output as `wf decide` prints it, after the summary: an array as a list under its
 * name — an item that says where it is leads with the place (`placeText`), its other fields beneath — and anything else as
 * `name: value`. A declared field the closeout did not give is named, since it is why the step reads
 * unsigned. `fields` as `declaredOutput` takes them: `owedFields`, so a loop's target's `replies` are printed too.
 */
export function outputLines(step: Workflow, said: Closeout, fields: readonly string[] = outputFields(step)): string[] {
  const { given, missing } = declaredOutput(step, said, fields);
  const lines: string[] = [];
  for (const [name, value] of Object.entries(given)) {
    if (!Array.isArray(value)) lines.push(...labelled(name, value));
    else if (!value.length) lines.push(`${name}: none`);
    else lines.push(`${name}:`, ...value.flatMap(itemLines));
  }
  if (missing.length) lines.push(`!! declared and not given: ${missing.join(', ')}`);
  return lines;
}

/** A value as text: a string as itself, anything else as JSON. */
const textOf = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/** `name: value` behind `first`, with a string's further lines indented under it behind `next`. */
const labelled = (name: string, value: unknown, first = '', next = first): string[] => {
  const [head, ...more] = textOf(value).split('\n');
  return [`${first}${name}: ${head}`, ...more.map((l) => `${next}  ${l}`)];
};

/**
 * A place as `wf decide` prints one, never as JSON: `file:line` (or the file, with no line), `page · theme`, a string as it
 * is, and any other object as its keys and values. What a place holds beside those follows it, the same way.
 */
export function placeText(where: unknown): string {
  if (!where || typeof where !== 'object') return textOf(where);
  if (Array.isArray(where)) return where.map(placeText).join(', ');
  const o = where as Record<string, unknown>;
  const lead = typeof o.file === 'string' ? [typeof o.line === 'number' ? `${o.file}:${o.line}` : o.file]
    : typeof o.page === 'string' ? [typeof o.theme === 'string' ? `${o.page} · ${o.theme}` : o.page]
    : [];
  const led = typeof o.file === 'string' ? ['file', 'line'] : typeof o.page === 'string' ? ['page', 'theme'] : [];
  const rest = Object.entries(o).filter(([k]) => !led.includes(k)).map(([k, v]) => `${k}: ${placeText(v)}`);
  return [...lead, ...rest].join(' · ') || '{}';
}

/**
 * One entry of a listed array. A finding leads with where it is — a `file` and `line` of its own, or a `where` of any shape,
 * as `placeText` prints it (U2's review printed a nested `where` as JSON) — and its other fields follow beneath.
 */
function itemLines(item: unknown): string[] {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    const [head, ...more] = textOf(item).split('\n');
    return [`  - ${head}`, ...more.map((l) => `    ${l}`)];
  }
  const o = item as Record<string, unknown>;
  const own = typeof o.file === 'string';
  if (own || Object.hasOwn(o, 'where')) {
    const [head, ...more] = placeText(own ? { file: o.file, line: o.line } : o.where).split('\n');
    const rest = Object.entries(o).filter(([k]) => (own ? k !== 'file' && k !== 'line' : k !== 'where'));
    return [`  - ${head}`, ...more.map((l) => `    ${l}`), ...rest.flatMap(([k, v]) => labelled(k, v, '    '))];
  }
  const entries = Object.entries(o);
  if (!entries.length) return ['  - {}'];
  return entries.flatMap(([k, v], i) => labelled(k, v, i ? '    ' : '  - ', '    '));
}

/**
 * What every step is told about finishing, appended to every brief.
 *
 * MECHANISM, not prose a workflow author has to remember: one step's body once forgot "commit
 * this" and the reviewer's entire output never reached the next step. The harness enforces the
 * shape of the answer; this says what the fields MEAN, which no schema can.
 *
 * Committing is the run's job, not the step's. A sandboxed harness may be unable to touch git's
 * metadata at all — Codex keeps it read-only — and a review told its artifacts MUST be committed
 * honestly signed off blocked and stopped two runs, over a file `handOff` then committed anyway.
 */
export const closeoutContract = (step?: Workflow, replies: 'owed' | 'none' | false = false, inFolder = false): string => {
  // A step's declared output is part of its closeout, so the step is told of it where it is told of the rest.
  const declared = step?.output ? outputFields(step).map((f) => `\`${f}\``).join(', ') : '';
  return [
    '', '## When you are finished', '',
    'Your final answer is a structured closeout, and it is how this run knows you are done. The session',
    'asks you for it in the required shape when you finish — in Claude Code, by calling the',
    '`StructuredOutput` tool. There is no file to write.',
    '',
    '- `outcome`: `"done"` if you finished the work; `"blocked"` if you cannot honestly finish. A step',
    '  that reports success it did not have is worse than one that stops and says why.',
    '- `summary`: one to three sentences on what you did, for the person who decides what ships.',
    // A folder run has nothing to commit: what a step names is kept by being collected (`artifactsContract`).
    ...(inFolder ? [
      '- `artifacts`: files you wrote for someone else to read, such as `note.md`. The run keeps each one you',
      '  name when you finish, so the steps after you and the person who decides receive it. A file you list',
      '  that does not exist is reported as missing.',
    ] : [
      '- `artifacts`: files you wrote for someone else to read, such as `RESPONSE.md`. Leave them in this',
      '  workspace: when you finish, the run commits whatever you left, so the next step receives it.',
      '  Commit your own work if you can. If you cannot — some sandboxes keep git read-only — that is',
      '  **not** a reason to block. A file you list that does not exist is reported as missing.',
    ]),
    '- `needs`: when blocked, what a person has to settle; otherwise `null`.',
    ...(declared ? [
      `- ${declared}: what this step declares (\`output: ${step!.output!.file}\`), in the shape the session`,
      '  asks for. It is handed, as data, to a step that reads it; your `summary` is not. A closeout',
      '  without it is unsigned, and nothing that waits on this step starts.',
    ] : []),
    ...(replies === 'owed' ? [
      `- \`${LOOP_REPLIES}\`: your answer to each finding you were handed this round — \`fixed\` and what you changed, or`,
      "  `won't fix` and why — in the shape the session asks for. The next round's review is handed it, as data;",
      '  your `summary` is not. A closeout without it, or with an empty list, is unsigned.',
    ] : []),
    // Asked for on every try of a loop's target (`closeoutSchemaOf`), so the session keeps one schema; in round 1 there is nothing to answer.
    ...(replies === 'none' ? [
      `- \`${LOOP_REPLIES}\`: \`[]\`. You were handed no findings this round. If a later round hands you some, you answer each there.`,
    ] : []),
    '',
    '**Give it once, and give it last**, after everything else. The run reads it as your final word',
    'and may start the next step on it.',
  ].join('\n');
};

/** Whether a step is some step's `loop:` target, in the workflow the run froze: filed with `replies` in its closeout schema on every try. */
export const isLoopTarget = (steps: readonly Workflow[], name: string): boolean => steps.some((s) => s.loop === name);

/**
 * What the run adds to a loop's target's closeout (`LOOP_REPLIES`): an answer to each finding it was handed. Strict, as every schema handed
 * to a harness is. `blocked` is not an answer here: a finding only a person can settle is signed off `blocked`.
 *
 * On every try, the first round's included, so a continued session is asked for the same `StructuredOutput` tool as the one it continues:
 * a tool sits at the front of the cached prompt, and a changed one rewrote the whole conversation on each round 2 (features.md). In round 1
 * the target was handed nothing, and its description, which the agent reads, says to answer `[]`.
 */
export const REPLIES_SCHEMA = {
  type: 'array',
  description: "Your answer to each finding you were handed this round, one each. The next round's review is handed these as data. " +
    'In the first round you were handed no findings: answer an empty list, [].',
  items: {
    type: 'object',
    properties: {
      finding: { type: 'string', description: 'The finding you are answering, as the review gave it: where, and what.' },
      answer: { type: 'string', enum: ['fixed', "won't fix"] },
      why: { type: 'string', description: "For fixed, what you changed. For won't fix, why not, concretely." },
    },
    required: ['finding', 'answer', 'why'],
    additionalProperties: false,
  },
};
