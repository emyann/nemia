/**
 * A workflow is a folder of markdown files. That is the whole format.
 *
 * Each file is one step: frontmatter says which harness runs it and what must finish first, and
 * the body is what the agent is told — in prose, because prose is what the person writing it
 * already knows how to write.
 *
 *     ---
 *     harness: codex
 *     after: implement
 *     ---
 *     Review the changes on this branch. Be specific about correctness, not style.
 *
 * **No key is control flow.** No conditions, no loops, no expressions. That is deliberate. The
 * interesting decisions in this kind of work — is this good enough, did it actually do what was
 * asked — are not predicates a workflow language could evaluate. They are judgements, and a
 * judgement belongs to a step with an agent in it, not to a keyword. The workflow is a team, not a
 * program: `after` orders, `resume` continues, `check` measures, `retries` counts, `output` declares
 * what a step's closeout says for the steps after it and `input` reads it, and the rest say who does
 * the work and for how long.
 *
 * **The keys are a closed list.** A key the parser does not know is refused by name, and a value
 * it cannot use is refused with the fix, before anything is spent. Accepting and ignoring is what
 * this replaces: `afer: implement` read as no `after` at all and started the reviewer at once,
 * beside the implementer, with write access; `deadlineSeconds: 5m` read as NaN and stopped the
 * step on its first tick. A `check:` the parser drops is a constraint nobody enforces.
 */
import fs from 'node:fs';
import path from 'node:path';

export type Workflow = {
  /** The step's name — the file's, minus `.md`. What `after` refers to. */
  name: string;
  /** What must have SUCCEEDED before this may run. `[]` means it starts at once. */
  after: string[];
  /**
   * Continue that step's session instead of starting cold — the author coming back to answer,
   * with their own memory of why they did it that way.
   *
   * The second and last structural key. Like `after` it is a relationship between steps, not
   * control flow: there is still nothing here that branches, loops or evaluates a condition.
   * Implies `after`, since you cannot continue a session that has not run.
   */
  resume?: string;
  /** Everything below the frontmatter: what the agent is told. */
  body: string;
  harness?: string;
  model?: string;
  permissionMode?: string;
  deadlineSeconds?: number;
  maxAttempts?: number;
  /**
   * A shell command the run executes in the step's workspace after the step hands off; exit 0 is
   * what makes the step verified. It measures, it does not route. The command is read from the
   * workflow the run froze, never from a checkout the step can edit.
   */
  check?: string;
  /** How many times the run re-files the step after its check refuses it. Absent means none. */
  retries?: number;
  /**
   * The steps whose declared output this step is handed, in its brief under `## From <step>`, as data.
   *
   * Only what the producer's `output:` declares travels — never its summary, needs or artifacts — and
   * only to a step that names it here. Each must be a step this one waits on: you cannot read the
   * product of work that has not finished. Like `after` it is a relationship, not control flow.
   */
  input?: string[];
  /**
   * What this step's closeout says beyond the four fields every closeout has, for a step that reads it.
   *
   * A JSON Schema file beside the step, read by `wf start` and frozen on the run with the rest of the
   * step — a schema is part of what the step is judged by, so it lives inside the fence a `check:`
   * does. Its properties are merged into the closeout schema the step is filed with; a closeout that
   * lacks one of them is `unsigned`.
   */
  output?: StepOutput;
};

/** A step's declared output: the file as the step names it, and the schema that file held at `wf start`. */
export type StepOutput = { file: string; schema: OutputSchema };

/** An output schema, checked strict: an object whose every property is required and nothing else allowed. */
export type OutputSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
  [key: string]: unknown;
};

/** Every key a step may set, in the order a person reads them. Anything else is refused by name. */
export const STEP_KEYS = [
  'after', 'resume', 'input', 'harness', 'model', 'permissionMode', 'deadlineSeconds', 'maxAttempts', 'check', 'retries', 'output',
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/**
 * The four fields every closeout has. They are the run's: `summary` goes to the person who decides and
 * nowhere else, so an `output:` may not declare one of them and have it travel to a step. The schema
 * itself is `CLOSEOUT_SCHEMA` in run.ts, and a test holds the two to each other.
 */
export const CLOSEOUT_FIELDS = ['outcome', 'summary', 'artifacts', 'needs'] as const;

/** The fields a step's `output:` declares, in the schema's order. `[]` for a step that declares none. */
export const outputFields = (step: Workflow): string[] => Object.keys(step.output?.schema.properties ?? {});

/**
 * Keys refused with a reason of their own, because each is one somebody will write expecting it to
 * work, and "not a key a step has" would be a worse answer than the truth.
 */
const REFUSED: Record<string, string> = {
  tools: 'the engine does not carry a tool list to the harness yet, so the step would run with every tool while'
    + ' this file said otherwise. Delete the line; `tools` is reserved, and is accepted once the engine enforces it',
  effort: 'the engine does not carry an effort level to the harness yet, so the line would change nothing.'
    + ' Delete it; `effort` is reserved, and is accepted once the engine passes it on',
  guide: 'the harness reads CLAUDE.md or AGENTS.md from the step\'s workspace on its own. Standing rules belong'
    + ' in that file, and what only this step needs to know belongs in the body',
};

/** The harness a step runs on when it names none. */
const DEFAULT_HARNESS = 'claude';

const CLAUDE_MODES = ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan'];

/**
 * The harnesses a step may run on, and the permission modes each understands.
 *
 * A copy of the engine's vocabulary, not an import — `runner.ts` is the only file here that imports
 * the engine — and checked here because nothing below checks it: an unknown `harness` falls
 * silently to the default, and an unknown mode is refused by the Claude CLI at spawn (which rejects
 * the whole tick) or read by Codex as `workspace-write`.
 *
 * Codex's list is the plan's (`docs/plan-hold-the-bar.md` §4 A), and ahead of the engine: today
 * `agent-engine/src/runner-detached.ts:236` passes `-s danger-full-access` only for
 * `bypassPermissions` and `-s workspace-write` for everything else, so `read-only` waits on the
 * engine's own change and `danger-full-access` is accepted here and not yet honoured there.
 *
 * `check` is not on the list. That harness is the run's own: it executes a step's `check:`
 * command, and no step runs on it.
 */
export const PERMISSION_MODES: Readonly<Record<string, readonly string[]>> = {
  claude: CLAUDE_MODES,
  codex: ['workspace-write', 'danger-full-access', 'read-only'],
  'claude-detached': CLAUDE_MODES,
};
export const HARNESSES: readonly string[] = Object.keys(PERMISSION_MODES);

/** The keys that are counts: what each counts, the least that means anything, and an example. */
const COUNTS = {
  deadlineSeconds: { least: 1, counts: 'the seconds the engine lets the step run before stopping it', example: 900 },
  maxAttempts: { least: 1, counts: 'how many attempts the engine may make at the step', example: 1 },
  retries: { least: 0, counts: 'how many times the run re-files the step after its check refuses it', example: 1 },
} as const;

export class WorkflowError extends Error {
  /** A step that is wrong is its author's to fix, and the message says how. */
  readonly exitCode = 2;
}

function refuse(why: string): never {
  throw new WorkflowError(why);
}

const isStepKey = (key: string): key is StepKey => (STEP_KEYS as readonly string[]).includes(key);

const FRONTMATTER = /^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/;

/**
 * One step, from its file's text.
 *
 * `read` answers for a file beside the step — the folder's, relative to it — or `undefined` when there
 * is none. Only `output:` names one, and a step parsed without a folder cannot have it read.
 */
export function parseWorkflow(name: string, text: string, read?: (file: string) => string | undefined): Workflow {
  // A file saved with a byte-order mark or `\r\n` is the same file. Left in, either one hides the
  // frontmatter in the body, and every key in it is dropped without a word.
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = FRONTMATTER.exec(text);
  if (!m && /^---[ \t]*\n/.test(text)) {
    refuse(`${name}: the frontmatter opened on the first line never closes, so every key in it would be read as prose. End it with a line that is just \`---\`.`);
  }
  const meta: Partial<Record<StepKey, string>> = m ? readKeys(name, m[1] ?? '') : {};
  const body = (m ? text.slice(m[0].length) : text).trim();
  if (!body) throw new WorkflowError(`${name}: the body is empty — a step with nothing to say is not a step`);

  const after = (meta.after ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // `resume: x` implies `after: x` — continuing a session that has not run is not a thing.
  if (meta.resume && !after.includes(meta.resume)) after.push(meta.resume);
  const harness = harnessOf(name, meta.harness);

  return {
    name,
    after,
    resume: meta.resume,
    body,
    harness,
    model: meta.model,
    permissionMode: modeOf(name, meta.permissionMode, harness),
    deadlineSeconds: countOf(name, 'deadlineSeconds', meta.deadlineSeconds),
    maxAttempts: countOf(name, 'maxAttempts', meta.maxAttempts),
    check: checkOf(name, meta.check),
    retries: countOf(name, 'retries', meta.retries),
    input: meta.input?.split(',').map((s) => s.trim()).filter(Boolean),
    output: outputOf(name, meta.output, read),
  };
}

/** The frontmatter as key → value: every line a key a step has, set once, to something. */
function readKeys(step: string, block: string): Partial<Record<StepKey, string>> {
  const meta: Partial<Record<StepKey, string>> = {};
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    // Blank lines group a long frontmatter; `#` is the comment character every reader expects.
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i <= 0) {
      refuse(`${step}: \`${line}\` is not \`key: value\`. Each frontmatter line is a key, a colon and its value, and a list stays on one line: \`after: a, b\`.`);
    }
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();

    if (Object.hasOwn(REFUSED, key)) refuse(`${step}: a step may not set \`${key}\` — ${REFUSED[key]}.`);
    if (!isStepKey(key)) {
      refuse(`${step}: \`${key}\` is not a key a step has. A step's keys are: ${STEP_KEYS.join(', ')}. Correct the spelling or delete the line — a key the run does not read is a constraint nobody enforces.`);
    }
    // Refused rather than last-one-wins: both values are something the author meant, and picking
    // one silently is how a step ends up waiting on half of what it was written to wait on.
    if (Object.hasOwn(meta, key)) {
      refuse(`${step}: \`${key}\` is set twice, and a step that says two things says nothing. Keep one line${key === 'after' ? ' and list every step on it: `after: a, b`' : ''}.`);
    }
    if (!value) {
      refuse(key === 'check'
        ? `${step}: \`check\` has no value. Give the command that must exit 0 in the step's workspace — \`check: npm test\` — or delete the line, and the step runs no check.`
        : `${step}: \`${key}\` has no value. Delete the line rather than leaving it blank — an empty key is not the same as an absent one.`);
    }
    meta[key] = value;
  }
  return meta;
}

function harnessOf(step: string, harness: string | undefined): string | undefined {
  if (harness === undefined || HARNESSES.includes(harness)) return harness;
  if (harness === 'check') {
    refuse(`${step}: \`harness: check\` is the run's own harness — it executes a step's \`check:\` command, and no step runs on it. Put the command in \`check:\` and run the step on one of: ${HARNESSES.join(', ')}.`);
  }
  return refuse(`${step}: \`harness: ${harness}\` is not a harness a step can run on. The harnesses are: ${HARNESSES.join(', ')}. Without the line, the step runs on ${DEFAULT_HARNESS}.`);
}

/** A permission mode is the harness's vocabulary, so it is checked against the harness the step runs on. */
function modeOf(step: string, mode: string | undefined, harness: string | undefined): string | undefined {
  const on = harness ?? DEFAULT_HARNESS;
  const modes = PERMISSION_MODES[on]!;
  if (mode === undefined || modes.includes(mode)) return mode;
  const owner = HARNESSES.find((h) => PERMISSION_MODES[h]!.includes(mode));
  return refuse(
    `${step}: \`permissionMode: ${mode}\` is not a mode ${on} has${harness ? '' : ` (there is no \`harness:\` line, so the step runs on ${on})`}.`
    + ` On ${on} it is one of: ${modes.join(', ')}.`
    + (owner ? ` \`${mode}\` is ${owner}'s word, and this step does not run on ${owner}.` : '')
    + ' Without the line, the harness uses its own default.',
  );
}

function countOf(step: string, key: keyof typeof COUNTS, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const { least, counts, example } = COUNTS[key];
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (Number.isSafeInteger(n) && n >= least) return n;
  // `5m` is the one that shipped: NaN, journalled as null, and the step stopped on its first tick.
  // The unit is what the author meant, so the message does the arithmetic rather than the author.
  const unit = key === 'deadlineSeconds' ? /^(\d+)\s*([smh])$/.exec(value) : null;
  const instead = unit ? `\`${key}: ${Math.max(least, Number(unit[1]) * { s: 1, m: 60, h: 3600 }[unit[2] as 's' | 'm' | 'h'])}\`` : `for example \`${key}: ${example}\``;
  return refuse(`${step}: \`${key}: ${value}\` is not a count. \`${key}\` is ${counts}: a whole number ${least ? 'above zero' : 'of zero or more'}, in digits${unit ? ' with no unit' : ''} — ${instead}.`);
}

function checkOf(step: string, check: string | undefined): string | undefined {
  // Each of these reads as "no check" to a person and as a command to the shell, which cannot find
  // it: exit 127 on every attempt, for a check nobody meant to run.
  if (check !== undefined && ['none', '""', "''"].includes(check)) {
    refuse(`${step}: \`check: ${check}\` would run \`${check}\` as a shell command, which exits 127 and fails the step every time. Delete the line — a step without \`check:\` runs no check.`);
  }
  return check;
}

/**
 * The schema an `output:` names, read and refused unless the run can use it.
 *
 * Strict, because the schema is merged into the closeout the step is filed with and Codex refuses a
 * structured output that is not: every object in it lists every property in `required` and sets
 * `additionalProperties: false`. Refused here rather than by the harness at spawn, which is after a
 * run has started and a step has been filed on it.
 */
function outputOf(step: string, file: string | undefined, read: ((file: string) => string | undefined) | undefined): StepOutput | undefined {
  if (file === undefined) return undefined;
  const named = `${step}: \`output: ${file}\``;
  if (!read) refuse(`${named} names a file beside the step, and this step was read without its folder. Load it with \`loadWorkflows(<folder>)\`, which reads the file.`);
  const text = read(file);
  if (text === undefined) {
    refuse(`${named} is not there. It is a JSON Schema file, relative to the workflow folder — write it beside ${step}.md, correct the path, or delete the line and the step declares no output.`);
  }
  let schema: unknown;
  try { schema = JSON.parse(text); } catch (e) {
    refuse(`${named} is not JSON (${(e as Error).message}). It is a JSON Schema: an object with \`"type": "object"\` and the fields the step declares under \`properties\`.`);
  }
  if (!isObject(schema) || schema.type !== 'object' || !isObject(schema.properties) || !Object.keys(schema.properties).length) {
    refuse(`${named} is not a schema of fields. Give it \`"type": "object"\` and at least one field under \`properties\` — or delete the line, and the step declares no output.`);
  }
  const extra = Object.keys(schema).filter((k) => !['type', 'properties', 'required', 'additionalProperties', 'title', 'description', '$schema'].includes(k));
  if (extra.length) {
    refuse(`${named} sets ${extra.map((k) => `\`${k}\``).join(', ')} beside its fields, and only its \`properties\` are merged into the closeout — the rest would be dropped on the way to the harness. Inline what the fields refer to, and delete the key.`);
  }
  const taken = Object.keys(schema.properties).filter((k) => (CLOSEOUT_FIELDS as readonly string[]).includes(k));
  if (taken.length) {
    refuse(`${named} declares ${taken.map((k) => `\`${k}\``).join(', ')}, which every closeout already has. ${CLOSEOUT_FIELDS.map((k) => `\`${k}\``).join(', ')} are the run's, and \`summary\` goes to the person who decides, never to a step. Rename the field.`);
  }
  const loose = looseAt(schema, '');
  if (loose) {
    refuse(`${named} is not strict at ${loose.at || 'the top'}: ${loose.why}. Codex refuses a structured output whose objects do not list every property in \`required\` and set \`"additionalProperties": false\`. A field that may be absent is required and nullable instead — \`"type": ["string", "null"]\`.`);
  }
  return { file, schema: schema as OutputSchema };
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** The first object in a schema that is not strict, and why — or `undefined` when every one is. */
function looseAt(node: unknown, at: string): { at: string; why: string } | undefined {
  if (!isObject(node)) return undefined;
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('object') || 'properties' in node) {
    const properties = isObject(node.properties) ? Object.keys(node.properties) : [];
    const required = Array.isArray(node.required) ? node.required : [];
    const missing = properties.filter((p) => !required.includes(p));
    const stray = required.filter((r) => !properties.includes(r as string));
    if (missing.length) return { at, why: `${missing.map((p) => `\`${p}\``).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in \`required\`` };
    if (stray.length) return { at, why: `\`required\` names ${stray.map((p) => `\`${String(p)}\``).join(', ')}, which is not a property` };
    if (node.additionalProperties !== false) return { at, why: '`additionalProperties` is not `false`' };
  }
  const children: Array<[string, unknown]> = [
    ...Object.entries(isObject(node.properties) ? node.properties : {}).map(([k, v]): [string, unknown] => [at ? `${at}.${k}` : k, v]),
    ...(Array.isArray(node.items) ? node.items : [node.items]).map((v): [string, unknown] => [`${at}[]`, v]),
    ...(Array.isArray(node.prefixItems) ? node.prefixItems : []).map((v): [string, unknown] => [`${at}[]`, v]),
    ...['anyOf', 'oneOf', 'allOf'].flatMap((k) => (Array.isArray(node[k]) ? node[k] as unknown[] : []).map((v, i): [string, unknown] => [`${at}.${k}[${i}]`, v])),
  ];
  for (const [where, child] of children) {
    const found = looseAt(child, where);
    if (found) return found;
  }
  return undefined;
}

/** Read a folder of steps and check that they form a workflow rather than a wish. */
export function loadWorkflows(dir: string): Workflow[] {
  if (!fs.existsSync(dir)) throw new WorkflowError(`no workflow folder at ${dir}`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new WorkflowError(`${dir} has no .md steps in it`);

  const read = (file: string): string | undefined => {
    try { return fs.readFileSync(path.resolve(dir, file), 'utf8'); } catch { return undefined; }
  };
  const steps = files.map((f) => parseWorkflow(path.basename(f, '.md'), fs.readFileSync(path.join(dir, f), 'utf8'), read));
  validate(steps);
  return steps;
}

/**
 * The ways a folder of markdown is not a workflow: a step waits on one that does not exist, the steps
 * wait on each other, or a step reads the output of one that has not finished or declares none. All
 * are caught here, before anything is spent.
 */
export function validate(steps: readonly Workflow[]): void {
  const names = new Set(steps.map((s) => s.name));
  for (const s of steps) {
    for (const a of s.after) {
      if (!names.has(a)) throw new WorkflowError(`${s.name}: waits on "${a}", which is not a step here`);
      if (a === s.name) throw new WorkflowError(`${s.name}: waits on itself`);
    }
    for (const from of s.input ?? []) {
      const producer = steps.find((x) => x.name === from);
      if (!producer) throw new WorkflowError(`${s.name}: \`input: ${from}\` names a step that is not here. Correct the name, or delete the line.`);
      // Directly, or through `resume` — which the parser has already added to `after`.
      if (!s.after.includes(from) && s.resume !== from) {
        throw new WorkflowError(`${s.name}: \`input: ${from}\`, but ${s.name} does not wait on ${from} — a step cannot read the product of work that has not finished. Add ${from} to \`after:\`, or delete the line.`);
      }
      if (!producer.output) {
        throw new WorkflowError(`${s.name}: \`input: ${from}\`, but ${from} declares no \`output:\`, so nothing of its closeout travels — its summary goes to the person who decides, never to a step. Give ${from}.md an \`output:\` schema, or delete the line.`);
      }
    }
    if (s.resume) {
      const target = steps.find((x) => x.name === s.resume);
      if (!target) throw new WorkflowError(`${s.name}: resumes "${s.resume}", which is not a step here`);
      // A session belongs to the harness that made it. Continuing it from another is not resuming,
      // it is a different agent claiming someone else's memory.
      if ((target.harness ?? 'claude') !== (s.harness ?? 'claude')) {
        throw new WorkflowError(`${s.name}: resumes ${target.name}, which runs on a different harness (${target.harness ?? 'claude'})`);
      }
    }
  }

  // Kahn's algorithm: if anything is left when nothing else can be removed, it is a cycle.
  const pending = new Map(steps.map((s) => [s.name, new Set(s.after)]));
  for (let moved = true; moved;) {
    moved = false;
    for (const [name, deps] of pending) {
      if (deps.size === 0) {
        pending.delete(name);
        for (const other of pending.values()) other.delete(name);
        moved = true;
      }
    }
  }
  if (pending.size) throw new WorkflowError(`these steps wait on each other: ${[...pending.keys()].sort().join(', ')}`);
}

/**
 * Could two steps of this workflow ever run at the same time?
 *
 * True when there is more than one starting point, or when any step is followed by more than one.
 * Used to refuse `--no-worktree` on a workflow that fans out: without isolation those steps would
 * share a directory, which is the arrangement the whole worktree design exists to prevent.
 */
export function fansOut(steps: readonly Workflow[]): boolean {
  const roots = steps.filter((s) => s.after.length === 0);
  if (roots.length > 1) return true;
  return steps.some((s) => steps.filter((x) => x.after.includes(s.name)).length > 1);
}

/**
 * The steps nothing waits on — where a run's work ends up.
 *
 * A run that succeeded is useless if nobody can find what it produced, so this is what `wf ls`
 * reports as the result. Usually one step; several when a workflow deliberately ends wide.
 */
export function terminalSteps(steps: readonly Workflow[]): Workflow[] {
  return steps.filter((s) => !steps.some((other) => other.after.includes(s.name)));
}
