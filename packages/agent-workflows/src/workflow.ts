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
 * **No key is control flow.** No conditions, no expressions, and no loop a keyword decides. That is
 * deliberate. The interesting decisions in this kind of work — is this good enough, did it actually do
 * what was asked — are not predicates a workflow language could evaluate. They are judgements, and a
 * judgement belongs to a step with an agent in it, not to a keyword. The workflow is a team, not a
 * program: `after` orders, `resume` continues, `check` measures, `retries` counts, `output` declares
 * what a step's closeout says for the steps after it and `input` reads it, `loop` is the edge back and
 * `rounds` counts it, and the rest say who does the work and for how long.
 *
 * `loop` is the one edge that points backwards, and it is still not a condition: whether the work goes
 * round again is the looping step's agent's word — `again`, in its closeout, the way `blocked` is — and
 * the run only files the round and counts, the way `maxAttempts` is a count.
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
  /** How hard the harness should think, in its own words: one of `EFFORTS` for the harness the step runs on. */
  effort?: string;
  permissionMode?: string;
  /**
   * The only tools the session may have, in the harness's names — `tools: Read, Grep, Glob, Bash`. Absent: the
   * harness's own set. Claude Code is given exactly the list (`--tools`), which names its built-in tools; the
   * servers of the checkout's `.mcp.json` are not on it. Refused on codex, which has no tool list: its fence is
   * the sandbox `permissionMode` names.
   */
  tools?: string[];
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
  /**
   * The step to run again when this one's closeout says `again: true`: one this step waits on through `after`.
   *
   * A round files that step again — its last session continued, handed this step's declared output as data —
   * then every step between them, then this one, a new session. `again: false` lets what waits on this step
   * start. A step with `loop:` declares `again` in its `output:`. Like `after` it is a relationship: the
   * judgement is the agent's, and the run only files the round and counts it.
   */
  loop?: string;
  /** How many rounds a `loop:` may run, the first included — then a person decides. Set to `DEFAULT_ROUNDS` when a loop does not say. */
  rounds?: number;
};

/** The rounds a `loop:` runs when its step does not say. */
export const DEFAULT_ROUNDS = 3;

/**
 * The field the run adds to a loop's target's closeout from its second round: its answer to each finding it
 * was handed, which the next round's looping step is given as data. The run's, like the four every closeout
 * has, so a target's `output:` may not declare it. The schema itself is `REPLIES_SCHEMA` in run.ts.
 */
export const LOOP_REPLIES = 'replies';

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
  'after', 'resume', 'input', 'harness', 'model', 'effort', 'permissionMode', 'tools', 'deadlineSeconds', 'maxAttempts', 'check', 'retries', 'output', 'loop', 'rounds',
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
  guide: 'the harness reads CLAUDE.md or AGENTS.md from the step\'s workspace on its own. Standing rules belong'
    + ' in that file, and what only this step needs to know belongs in the body',
};

/** The harness a step runs on when it names none. */
const DEFAULT_HARNESS = 'claude';

/*
 * The words each harness takes, copied from the engine — which is the source. `CLAUDE_PERMISSION_MODES` and
 * `CLAUDE_EFFORTS` are agent-engine's `src/runner.ts`; `CODEX_SANDBOXES` and `CODEX_EFFORTS` its
 * `src/runner-detached.ts`, whose `codex.refuses` also takes `bypassPermissions`, as the widest sandbox.
 *
 * A copy and not an import, because `runner.ts` is the only file here that imports the engine, and the engine
 * refuses these words only when the run files a step — after `wf start`, with a run on the record. Checked here,
 * so a word is refused before anything is spent. `test/vocabulary.test.ts` imports the engine's lists and fails
 * the moment a copy differs: the first copies did, for `manual` and codex's `bypassPermissions`.
 */
const CLAUDE_MODES = ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'manual', 'plan'];
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The harnesses a step may run on, and the permission modes each takes.
 *
 * Checked here because nothing below checks it early enough: an unknown `harness` falls silently to the
 * default, and an unknown mode is refused by the engine only when the run files the step.
 *
 * `check` is not on the list. That harness is the run's own: it executes a step's `check:`
 * command, and no step runs on it.
 */
export const PERMISSION_MODES: Readonly<Record<string, readonly string[]>> = {
  claude: CLAUDE_MODES,
  codex: ['read-only', 'workspace-write', 'danger-full-access', 'bypassPermissions'],
  'claude-detached': CLAUDE_MODES,
};
export const HARNESSES: readonly string[] = Object.keys(PERMISSION_MODES);

/**
 * The efforts each harness takes: `--effort` for Claude Code, `model_reasoning_effort` for Codex. Checked for the
 * reason a mode is, and one more: Claude Code does not refuse an effort it does not know — it warns, and runs at
 * its default, a line that silently changes nothing.
 */
export const EFFORTS: Readonly<Record<string, readonly string[]>> = {
  claude: CLAUDE_EFFORTS,
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  'claude-detached': CLAUDE_EFFORTS,
};

/** The keys that are counts: what each counts, the least that means anything, and an example. */
const COUNTS = {
  deadlineSeconds: { least: 1, counts: 'the seconds the engine lets the step run before stopping it', example: 900 },
  maxAttempts: { least: 1, counts: 'how many attempts the engine may make at the step', example: 1 },
  retries: { least: 0, counts: 'how many times the run re-files the step after its check refuses it', example: 1 },
  rounds: { least: 1, counts: 'how many rounds `loop:` may run, the first included', example: 3 },
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
  const output = outputOf(name, meta.output, read);

  return {
    name,
    after,
    resume: meta.resume,
    body,
    harness,
    model: meta.model,
    effort: wordOf(name, 'effort', meta.effort, harness),
    permissionMode: wordOf(name, 'permissionMode', meta.permissionMode, harness),
    tools: toolsOf(name, meta.tools, harness),
    deadlineSeconds: countOf(name, 'deadlineSeconds', meta.deadlineSeconds),
    maxAttempts: countOf(name, 'maxAttempts', meta.maxAttempts),
    check: checkOf(name, meta.check),
    retries: countOf(name, 'retries', meta.retries),
    input: meta.input?.split(',').map((s) => s.trim()).filter(Boolean),
    output,
    loop: loopOf(name, meta.loop, output),
    rounds: roundsOf(name, meta.loop, meta.rounds),
  };
}

/**
 * `loop:` as written, refused unless the step can say whether to go round again: one step, and `again` declared
 * boolean in its `output:`. That the step it names comes before this one is the workflow's to say (`validate`).
 */
function loopOf(step: string, loop: string | undefined, output: StepOutput | undefined): string | undefined {
  if (loop === undefined) return undefined;
  if (loop.includes(',')) {
    refuse(`${step}: \`loop: ${loop}\` names more than one step. A loop runs one earlier step again, and every step between it and this one follows: name the first of them.`);
  }
  const named = `${step}: \`loop: ${loop}\` runs ${loop} again when this step's closeout says \`again: true\``;
  const declare = 'Declare it — `"again": { "type": "boolean" }`, listed in `required` — so the run reads a yes or a no, never prose.';
  if (!output) refuse(`${named}, and this step declares no \`output:\`, so its closeout has no \`again\`. Give it an \`output:\` schema. ${declare}`);
  const again = output.schema.properties.again;
  if (!again) refuse(`${named}, and \`output: ${output.file}\` does not declare \`again\`. ${declare}`);
  if (again.type !== 'boolean') {
    refuse(`${named}, and \`output: ${output.file}\` declares \`again\` as ${JSON.stringify(again.type ?? again)}. It is \`"type": "boolean"\`: true or false, and nothing the run would have to interpret.`);
  }
  return loop;
}

/** `rounds:`, which counts the rounds of a loop: refused on a step with no `loop:`, and `DEFAULT_ROUNDS` on one that does not say. */
function roundsOf(step: string, loop: string | undefined, rounds: string | undefined): number | undefined {
  if (rounds !== undefined && loop === undefined) {
    refuse(`${step}: \`rounds: ${rounds}\` counts the rounds of a loop, and this step has no \`loop:\`. Add \`loop: <step>\`, naming the earlier step to run again, or delete the line. To try one step again after its check refuses it, that is \`retries:\`.`);
  }
  return loop === undefined ? undefined : countOf(step, 'rounds', rounds) ?? DEFAULT_ROUNDS;
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
        : key === 'tools'
          ? `${step}: \`tools\` has no value, which reads as every tool to one person and as none to another. Name the tools the session may have — ${TOOLS_EXAMPLE} — or delete the line, and the step has the harness's own set.`
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

const VOCABULARY = {
  permissionMode: { lists: PERMISSION_MODES, noun: 'a mode' },
  effort: { lists: EFFORTS, noun: 'an effort' },
} as const;

/** A permission mode or an effort is the harness's vocabulary, so it is checked against the harness the step runs on. */
function wordOf(step: string, key: keyof typeof VOCABULARY, word: string | undefined, harness: string | undefined): string | undefined {
  const { lists, noun } = VOCABULARY[key];
  const on = harness ?? DEFAULT_HARNESS;
  const words = lists[on]!;
  if (word === undefined || words.includes(word)) return word;
  const owner = HARNESSES.find((h) => lists[h]!.includes(word));
  return refuse(
    `${step}: \`${key}: ${word}\` is not ${noun} ${on} has${harness ? '' : ` (there is no \`harness:\` line, so the step runs on ${on})`}.`
    + ` On ${on} it is one of: ${words.join(', ')}.`
    + (owner ? ` \`${word}\` is ${owner}'s word, and this step does not run on ${owner}.` : '')
    + ' Without the line, the harness uses its own default.',
  );
}

const TOOLS_EXAMPLE = '`tools: Read, Grep, Glob, Bash`';

/**
 * `tools:` as the list of names the harness is given, refused unless each entry is one name.
 *
 * Split on commas, as `after:` is — so a comma inside an entry, in a rule's parentheses or in quotes, would reach
 * the harness as the pieces of one; and a space inside one is a list written without its commas, or a rule where
 * a name goes. Refused on codex, which has no tool list: one shell in a sandbox, so a list there narrows nothing
 * the sandbox does not, and the engine leaves the sandbox as `permissionMode` named it whenever the list has Bash.
 */
function toolsOf(step: string, tools: string | undefined, harness: string | undefined): string[] | undefined {
  if (tools === undefined) return undefined;
  const named = `${step}: \`tools: ${tools}\``;
  const written = `A step's tools are the harness's names for them, bare and comma-separated: ${TOOLS_EXAMPLE}.`;
  if (harness === 'codex') {
    refuse(`${named} is a tool list, and codex has none: one shell, fenced by its sandbox. The sandbox is \`permissionMode\` — \`read-only\` reads and runs commands and writes nothing, \`workspace-write\` writes in the workspace. Delete the line, and name the sandbox: \`permissionMode: read-only\` for a step that must not write.`);
  }
  if (/\([^)]*,|\[[^\]]*,|"[^"]*,|'[^']*,/.test(tools)) {
    const pieces = tools.split(',').map((s) => `\`${s.trim()}\``).join(', ');
    refuse(`${named} has a comma inside an entry, and the list is split on every comma, so the harness would be given ${pieces} as names. ${written}`);
  }
  const names = tools.split(',').map((s) => s.trim()).filter(Boolean);
  if (!names.length) refuse(`${named} names no tool. ${written} Without the line, the step has the harness's own set.`);
  const spaced = names.find((n) => /\s/.test(n));
  if (spaced && !spaced.includes('(')) refuse(`${named} has a space inside \`${spaced}\`, which is not one name. ${written}`);
  const dressed = names.find((n) => /[\s()[\]"'`]/.test(n));
  if (dressed) {
    refuse(`${named} has \`${dressed}\`, which is not a tool name: ${dressed.includes('(')
      ? `it is a rule for what a tool may run, and \`tools:\` says which tools the session has — \`${dressed.slice(0, dressed.indexOf('('))}\`, whole`
      : 'a name is written bare, without quotes or brackets'}. ${written}`);
  }
  return names;
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
  if (loose && 'ref' in loose) {
    refuse(`${named} uses \`${loose.ref}\` at ${loose.at || 'the top'}. The run checks a schema is strict by reading it, and does not follow references — an object it did not read would reach the harness unchecked. Inline what it points at, and delete \`${loose.ref}\`.`);
  }
  if (loose) {
    refuse(`${named} is not strict at ${loose.at || 'the top'}: ${loose.why}. Codex refuses a structured output whose objects do not list every property in \`required\` and set \`"additionalProperties": false\`. A field that may be absent is required and nullable instead — \`"type": ["string", "null"]\`.`);
  }
  return { file, schema: schema as OutputSchema };
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Keywords whose value is a schema. `items` may also be an array of them, as older drafts wrote it. */
const ONE_SCHEMA = ['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else'];
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
 * schema that can disagree with the harness's, and a `$ref` under a field once carried a loose object
 * past this check to the harness.
 */
function looseAt(node: unknown, at: string): { at: string; why: string } | { at: string; ref: string } | undefined {
  if (!isObject(node)) return undefined;
  const ref = REFERENCES.find((k) => Object.hasOwn(node, k));
  if (ref) return { at, ref };
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
  const below = (k: string) => (at ? `${at}.${k}` : k);
  const children: Array<[string, unknown]> = [];
  for (const k of SCHEMA_MAPS) {
    const map = node[k];
    if (isObject(map)) for (const [name, v] of Object.entries(map)) children.push([k === 'properties' ? below(name) : below(`${k}.${name}`), v]);
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

  validateLoops(steps);
}

/** Every step `name` waits on, directly or through another. */
function upstreamOf(steps: readonly Workflow[], name: string): Set<string> {
  const found = new Set<string>();
  const queue = [name];
  while (queue.length) {
    const at = queue.pop();
    const current = steps.find((s) => s.name === at);
    for (const a of current?.after ?? []) {
      if (!found.has(a)) { found.add(a); queue.push(a); }
    }
  }
  return found;
}

/**
 * The steps a round of `looping`'s loop files again, in the workflow's order: its target, every step between
 * the target and it, and itself. `[]` for a step with no `loop:`.
 */
export function loopSpan(steps: readonly Workflow[], looping: Workflow): string[] {
  const target = looping.loop;
  if (!target) return [];
  const up = upstreamOf(steps, looping.name);
  return steps
    .filter((s) => s.name === target || s.name === looping.name || (up.has(s.name) && upstreamOf(steps, s.name).has(target)))
    .map((s) => s.name);
}

/**
 * The ways a loop cannot run as a round: it names no earlier step, or a round could not file its steps again as
 * they were filed the first time.
 *
 * A round works in the workspaces the first one made. A step that inherits its predecessor's gets the target's
 * new commits by being there; one that forked or merged a worktree of its own was cut once, from the first
 * round's branch, and would review work that is no longer the change. So a loop's steps are a chain. A step in
 * one is a new session each round, so it cannot `resume:` another; a step in two would be re-filed by a round of
 * either; and a target's `output:` may not take the field the run adds to it.
 */
function validateLoops(steps: readonly Workflow[]): void {
  const spans = new Map<string, Workflow>();
  for (const s of steps.filter((x) => x.loop)) {
    const target = s.loop!;
    const named = `${s.name}: \`loop: ${target}\``;
    if (target === s.name) {
      throw new WorkflowError(`${named} names this step. A loop runs an earlier step again, then every step between it and this one, then this one: name the step this one reviews, which it waits on through \`after\`.`);
    }
    const producer = steps.find((x) => x.name === target);
    if (!producer) throw new WorkflowError(`${named} names a step that is not here. Correct the name, or delete the line.`);
    if (!upstreamOf(steps, s.name).has(target)) {
      throw new WorkflowError(`${named}, but ${s.name} does not wait on ${target}, directly or through the steps between — a loop runs again work that finished before this step. Add ${target} to \`after:\`, or name a step ${s.name} waits on.`);
    }
    if (producer.output && Object.hasOwn(producer.output.schema.properties, LOOP_REPLIES)) {
      throw new WorkflowError(`${target}: \`output: ${producer.output.file}\` declares \`${LOOP_REPLIES}\`, and ${s.name} loops back to ${target} (\`loop: ${target}\`), so from round 2 the run adds \`${LOOP_REPLIES}\` to its closeout: its answer to each finding. Rename the field.`);
    }

    const span = loopSpan(steps, s);
    for (const name of span) {
      const other = spans.get(name);
      if (other) {
        throw new WorkflowError(`${name} is in two loops: ${other.name}'s (\`loop: ${other.loop}\`) and ${s.name}'s (\`loop: ${target}\`). A round of either would file it again under the other. Give it one loop: make one loop's steps end before the other's begin.`);
      }
      spans.set(name, s);
      if (name === target) continue;
      const step = steps.find((x) => x.name === name)!;
      if (step.resume) {
        throw new WorkflowError(`${name}: \`resume: ${step.resume}\`, and ${name} is in ${s.name}'s loop (\`loop: ${target}\`), which files it as a new session each round — so it cannot continue another. Delete the line: only the loop's first step, ${target}, is continued, and the run does that itself.`);
      }
      const [from] = step.after;
      const siblings = steps.filter((x) => from !== undefined && x.after.includes(from)).map((x) => x.name);
      if (step.after.length !== 1 || siblings.length !== 1) {
        const why = step.after.length > 1
          ? `it waits on ${step.after.join(' and ')}, so it merges their branches into a worktree of its own`
          : `${siblings.filter((x) => x !== name).join(' and ')} ${siblings.length > 2 ? 'wait' : 'waits'} on ${from} too, so ${name} forks a worktree of its own`;
        throw new WorkflowError(`${named} files ${span.filter((x) => x !== target).join(', then ')} again after ${target} each round, in the workspace ${target} works in, and ${name} does not work there: ${why}, cut once, which would not have the next round's work. A loop's steps are a chain — each waits on the one before it, and nothing else does. Move what runs beside them after ${s.name}.`);
      }
    }
  }
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
