/**
 * The closeout: the shape of a step's closing statement as the harness is asked for it, reading one a session gave, what of it a step
 * declared and owes, and what every step is told about finishing.
 *
 * Pure, as `tick/assess.ts` is, and beneath it: the run's judgement imports what it needs from here, and nothing here imports it.
 * `advance.verb.ts` files each step with `closeoutSchemaOf`, and the controllers read the engine's record with `parseCloseout`; nothing
 * here reads a disk or calls the engine.
 */
import { isObject, LOOP_REPLIES, outputFields, type Workflow } from '../step/step.ts';
import { digestOf } from '../revisions/revisions.ts';
import {
  artifactsOf,
  bodyOf,
  CLOSEOUT_V1,
  ENVELOPE_SCHEMA,
  SUMMARY_MAX,
  summaryLine,
  V0_FIELDS,
  V1_FIELDS,
  type ValueArtifact,
} from './envelope.ts';

/**
 * The shape of a step's closing statement, handed to the engine as a JSON Schema.
 *
 * The engine passes it to the harness verbatim — Claude Code turns it into a StructuredOutput tool
 * the agent calls to finish, Codex into `--output-schema` — and records what comes back without
 * reading it. The shape and what it means live here, because they are this package's vocabulary
 * and nothing underneath should have to learn it.
 *
 * The v1 envelope (`ENVELOPE_SCHEMA`). Strict on purpose: every property required and `needs` nullable rather than optional. Codex
 * enforces strict structured outputs, and a schema has to satisfy the strictest harness it will be
 * handed to.
 *
 * A statement made to the harness, not a file in the worktree: it lives in the session, belongs to the
 * attempt that made it, and needs no path, so it never travels down the branch to the next step and is
 * not rewritten after it is given.
 */
export const CLOSEOUT_SCHEMA = ENVELOPE_SCHEMA;

/** A closeout schema as the engine is handed it. */
export type CloseoutSchema = { type: string; properties: Record<string, object>; required: string[]; additionalProperties: boolean };

/**
 * The schema a step is filed with: `CLOSEOUT_SCHEMA`, and the fields its `output:` declares, merged.
 *
 * Still strict: each declared field is required beside the four, and nothing else is allowed. The
 * declared schema is refused at load unless its own objects are strict, so what reaches the harness
 * is strict all the way down. It comes from the step the run froze at `nemia start`, never the folder.
 *
 * On a loop's target (`isLoopTarget`), `REPLIES_SCHEMA` is merged too: the target's answer to each finding it
 * was handed, which the next round's looping step reads. On every try, round 1's included, decided from the
 * frozen workflow alone and never from the round the run is on: the schema is the session's `StructuredOutput`
 * tool, and a session continued under another one pays for the whole conversation again. What
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
 * The digest of the schema a step is filed with (`closeoutSchemaOf`), kept on the step's record: read by a later filing that would continue
 * that session, which starts fresh instead where this has moved. A continued session is asked for its closeout by the tool it was given;
 * asked in another shape it would pay for the whole conversation again for an answer in the wrong one.
 */
export const closeoutHashOf = (step: Workflow, steps: readonly Workflow[]): string => digestOf([closeoutSchemaOf(step, steps)]);

/**
 * What a step says on its way out, as every reader reads it, whichever version it was given in (`parseCloseout`).
 *
 * Two audiences, deliberately separated, which is the whole reason this is a record and not a string. `summary` and `body` are prose
 * for the DECIDER — a person — and travel to a later step only inside the step's `closeout.json` in its files directory, the step's own
 * account, never a finding's answer. `artifacts` and `values` are for the machine and for the next step.
 */
export type Closeout = {
  /** `nemia/v1` for a closeout given in v1's envelope; absent for one given before it (v0), converted on read. */
  apiVersion?: typeof CLOSEOUT_V1;
  /** `done` finished the work. `blocked` finished the SESSION and needs a person. */
  outcome: 'done' | 'blocked';
  /** One line, cut to `SUMMARY_MAX` characters (`summaryLine`). */
  summary: string;
  /** Markdown, what the summary has no room for: led by the whole summary when the cut changed it. */
  body?: string;
  /** Files this step produced for whoever reads next, by path from the workspace root. */
  artifacts: string[];
  /** Values this step hands on, each by its name. */
  values?: ValueArtifact[];
  /** Set when blocked: what the person has to settle. */
  needs?: string;
  /**
   * Every field beyond the envelope's, as the harness returned it — what a step's `output:` declares.
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
 * Anything but an object, an array included, is `not an object`. `needs` is nullable in the schema,
 * since a strict harness requires every property, and absent here unless it is a non-empty string.
 *
 * By version: no `apiVersion` is v0 — its whole summary becomes the body when it is more than one line, its first line the summary,
 * its strings file artifacts — and `nemia/v1` is read as it is; any other is an `error`. Every summary is cut to a line
 * (`summaryLine`), the whole text leading the body when the cut changed it. The fields beyond the version's envelope are `output`.
 */
export function parseCloseout(value: unknown): Closeout | { error: string } {
  const read = objectOf(value);
  if (typeof read === 'string') return { error: read };
  const o = read;
  const v1 = o.apiVersion === CLOSEOUT_V1;
  if (o.apiVersion !== undefined && !v1) return { error: `apiVersion ${JSON.stringify(o.apiVersion)} is not one this run reads` };
  const envelope: readonly string[] = v1 ? V1_FIELDS : V0_FIELDS;
  const rest = Object.entries(o).filter(([k]) => !envelope.includes(k));
  const whole = typeof o.summary === 'string' ? o.summary : '';
  const summary = summaryLine(whole);
  const { files, values } = artifactsOf(o.artifacts);
  const body = bodyOf(whole, summary, v1 && typeof o.body === 'string' ? o.body : undefined);
  return {
    ...(v1 ? { apiVersion: CLOSEOUT_V1 } : {}),
    outcome: o.outcome === 'blocked' ? 'blocked' : 'done',
    summary,
    ...(body !== undefined ? { body } : {}),
    artifacts: files,
    ...(values.length ? { values } : {}),
    needs: typeof o.needs === 'string' && o.needs ? o.needs : undefined,
    ...(rest.length ? { output: Object.fromEntries(rest) } : {}),
  };
}

/** A closeout as the object it is, from the object the engine recorded or the text a harness handed back; else why not, in words. */
function objectOf(value: unknown): Record<string, unknown> | string {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return `unparseable: ${(e as Error).message}`;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'not an object';
  return raw as Record<string, unknown>;
}

/**
 * What a closeout says of the fields its step's `output:` declares: those it gave, in the schema's
 * order, and those it did not. Nothing else of the closeout is in either — this is the one door a
 * closeout's content passes through on its way to another step. `fields` names the ones asked about, when
 * that is not what the step declares: `owedFields` adds a loop's `replies`, a round hands on its findings without `again`.
 *
 * An empty `replies` is missing: the schema allows it, since round 1's answer is `[]` on a schema that is the same every round,
 * and a target handed findings that answers none of them has not answered. A field JSON names `__proto__` is given as a field of its
 * own, never as the prototype.
 */
export function declaredOutput(
  step: Workflow,
  said: Closeout | undefined,
  fields: readonly string[] = outputFields(step),
): { given: Record<string, unknown>; missing: string[] } {
  const given: Array<[string, unknown]> = [];
  const missing: string[] = [];
  const answered = (field: string, value: unknown) => field !== LOOP_REPLIES || !Array.isArray(value) || value.length > 0;
  for (const field of fields) {
    if (said?.output && Object.hasOwn(said.output, field) && answered(field, said.output[field])) given.push([field, said.output[field]]);
    else missing.push(field);
  }
  return { given: Object.fromEntries(given), missing };
}

/**
 * A step's declared output as `nemia decide` prints it, after the summary: an array as a list under its
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
 * A place as `nemia decide` prints one, never as JSON: `file:line` (or the file, with no line), `page · theme`, a string as it
 * is, and any other object as its keys and values. What a place holds beside those follows it, the same way.
 */
export function placeText(where: unknown): string {
  if (!where || typeof where !== 'object') return textOf(where);
  if (Array.isArray(where)) return where.map(placeText).join(', ');
  const o = where as Record<string, unknown>;
  const lead =
    typeof o.file === 'string'
      ? [typeof o.line === 'number' ? `${o.file}:${o.line}` : o.file]
      : typeof o.page === 'string'
        ? [typeof o.theme === 'string' ? `${o.page} · ${o.theme}` : o.page]
        : [];
  const led = typeof o.file === 'string' ? ['file', 'line'] : typeof o.page === 'string' ? ['page', 'theme'] : [];
  const rest = Object.entries(o)
    .filter(([k]) => !led.includes(k))
    .map(([k, v]) => `${k}: ${placeText(v)}`);
  return [...lead, ...rest].join(' · ') || '{}';
}

/**
 * One entry of a listed array. A finding leads with where it is — a `file` and `line` of its own, or a `where` of any shape,
 * as `placeText` prints it, never as JSON — and its other fields follow beneath.
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
 * MECHANISM, not prose a workflow author has to remember. The harness enforces the shape of the
 * answer; this says what the fields MEAN, which no schema can, and names the fields the step's
 * `output:` declares.
 *
 * Committing is the run's job, not the step's: a sandboxed harness may be unable to touch git's
 * metadata at all — Codex keeps it read-only — so a step is told that a file it cannot commit is no
 * reason to block, and its place's `handoff` commits what it left. `inFolder`, for a folder run, which has nothing
 * to commit, says each named file is kept by being collected (`artifactsContract`). `replies` is
 * `owed` for a step answering findings, and `none` on a loop's target with none to answer, since its
 * schema asks for them on every try (`closeoutSchemaOf`).
 */
export const closeoutContract = (step?: Workflow, replies: 'owed' | 'none' | false = false, inFolder = false): string => {
  const output = step?.output;
  const declared =
    step && output
      ? outputFields(step)
          .map((f) => `\`${f}\``)
          .join(', ')
      : '';
  return [
    '',
    '## When you are finished',
    '',
    'Your final answer is a structured closeout, and it is how this run knows you are done. The session',
    'asks you for it in the required shape when you finish — in Claude Code, by calling the',
    '`StructuredOutput` tool. There is no file to write.',
    '',
    '- `outcome`: `"done"` if you finished the work; `"blocked"` if you cannot honestly finish. A step',
    '  that reports success it did not have is worse than one that stops and says why.',
    '- `apiVersion`: `"nemia/v1"`.',
    `- \`summary\`: one line of at most ${SUMMARY_MAX} characters on what you did, for the person who decides what lands. A longer`,
    '  one is cut, and the whole of it leads the body.',
    '- `body`: markdown, everything the summary has no room for; `null` when there is nothing more.',
    ...(inFolder
      ? [
          '- `artifacts`: files you wrote for someone else to read, each `{"path"}`, such as `note.md`. The run keeps each one you',
          '  name when you finish, so the steps after you and the person who decides receive it. A file you list',
          '  that the run does not then have refuses this closeout: you are asked again, told which.',
        ]
      : [
          '- `artifacts`: files you wrote for someone else to read, each `{"path"}`, such as `RESPONSE.md`. Leave them in this',
          '  workspace: when you finish, the run commits whatever you left, so the next step receives it.',
          '  Commit your own work if you can. If you cannot — some sandboxes keep git read-only — that is',
          '  **not** a reason to block. A file you list that the run does not then have refuses this closeout:',
          '  you are asked again, told which.',
        ]),
    '  An artifact may be a value instead, `{"name", "value"}`, such as a pull request\'s address: shown labelled, and as a link',
    "  when it is an http(s) address. `closeout.json` is the run's own name: an artifact that names it is refused.",
    '- `needs`: only when blocked, what a person has to settle; `null` when done. A `done` closeout with a `needs` is refused.',
    ...(declared && output
      ? [
          `- ${declared}: what this step declares (\`output: ${output.file}\`), in the shape the session`,
          '  asks for. It is handed, as data, to a step that reads it. A closeout',
          '  without it is unsigned, and nothing that waits on this step starts.',
        ]
      : []),
    ...(replies === 'owed'
      ? [
          `- \`${LOOP_REPLIES}\`: your answer to each finding you were handed this round — \`fixed\` and what you changed, or`,
          "  `won't fix` and why — in the shape the session asks for. The next round's review is handed it, as data.",
          '  A closeout without it, or with an empty list, is unsigned.',
        ]
      : []),
    ...(replies === 'none'
      ? [`- \`${LOOP_REPLIES}\`: \`[]\`. You were handed no findings this round. If a later round hands you some, you answer each there.`]
      : []),
    '',
    '**Give it once, and give it last**, after everything else. The run reads it as your final word',
    'and may start the next step on it.',
  ].join('\n');
};

/**
 * Whether a step is some step's `loop:` target, in the workflow the run froze: filed with `replies` in its closeout schema on every try.
 */
export const isLoopTarget = (steps: readonly Workflow[], name: string): boolean => steps.some((s) => s.loop === name);

/**
 * What the run adds to a loop's target's closeout (`LOOP_REPLIES`): an answer to each finding it was handed. Strict, as every schema handed
 * to a harness is. `blocked` is not an answer here: a finding only a person can settle is signed off `blocked`.
 *
 * On every try, the first round's included, so a continued session is asked for the same `StructuredOutput` tool as the one it continues:
 * a tool sits at the front of the cached prompt, and a changed one writes the whole conversation to the cache again. In round 1 the
 * target is handed nothing, and its description, which the agent reads, says to answer `[]`.
 */
export const REPLIES_SCHEMA = {
  type: 'array',
  description:
    "Your answer to each finding you were handed this round, one each. The next round's review is handed these as data. " +
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

/** Keywords whose value is a schema. `items` may also be an array of them, as older drafts wrote it. */
const ONE_SCHEMA = [
  'items',
  'additionalItems',
  'additionalProperties',
  'unevaluatedItems',
  'unevaluatedProperties',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
];
/** Keywords whose value is an array of schemas. */
const SCHEMA_LISTS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
/** Keywords whose value maps a name to a schema. */
const SCHEMA_MAPS = ['properties', 'patternProperties', 'dependentSchemas', 'dependencies', '$defs', 'definitions'];
/** Keywords that stand for a schema written somewhere else. */
const REFERENCES = ['$ref', '$dynamicRef', '$recursiveRef'];

/**
 * The first object in a schema that is not strict, and why; or the first reference; or `undefined`.
 *
 * Every keyword that holds a schema is read, because an object the walk skips is an object nobody
 * checked. A reference is refused rather than followed: resolving one is a second reading of the
 * schema that can disagree with the harness's, and a loose object behind it would reach the harness
 * unchecked.
 */
export function looseAt(node: unknown, at: string): { at: string; why: string } | { at: string; ref: string } | undefined {
  if (!isObject(node)) return undefined;
  const ref = REFERENCES.find((k) => Object.hasOwn(node, k));
  if (ref) return { at, ref };
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('object') || 'properties' in node) {
    const properties = isObject(node.properties) ? Object.keys(node.properties) : [];
    const required = Array.isArray(node.required) ? node.required : [];
    const missing = properties.filter((p) => !required.includes(p));
    const stray = required.filter((r) => !properties.includes(r as string));
    if (missing.length)
      return { at, why: `${missing.map((p) => `\`${p}\``).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in \`required\`` };
    if (stray.length) return { at, why: `\`required\` names ${stray.map((p) => `\`${String(p)}\``).join(', ')}, which is not a property` };
    if (node.additionalProperties !== false) return { at, why: '`additionalProperties` is not `false`' };
  }
  const below = (k: string) => (at ? `${at}.${k}` : k);
  const children: Array<[string, unknown]> = [];
  for (const k of SCHEMA_MAPS) {
    const map = node[k];
    if (isObject(map))
      for (const [name, v] of Object.entries(map)) children.push([k === 'properties' ? below(name) : below(`${k}.${name}`), v]);
  }
  for (const k of ONE_SCHEMA) {
    const values = k === 'items' && Array.isArray(node.items) ? node.items : [node[k]];
    for (const v of values) children.push([k === 'items' ? `${at}[]` : below(k), v]);
  }
  for (const k of SCHEMA_LISTS) {
    const list = node[k];
    if (Array.isArray(list)) list.forEach((v, i) => children.push([k === 'prefixItems' ? `${at}[]` : `${at}.${k}[${i}]`, v]));
  }
  for (const [where, child] of children) {
    const found = looseAt(child, where);
    if (found) return found;
  }
  return undefined;
}
