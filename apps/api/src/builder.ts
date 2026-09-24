/**
 * The workflow builder, for the board: a folder of yours put back from its steps as the Workflows page lists them, a new folder with a first
 * step, a schema beside the steps, and what a step's form is drawn from.
 *
 * A folder is written by the package's `writeWorkflow` (agent-orchestrator's authoring.ts), which judges the whole folder before a byte is written:
 * each refusal is the parser's sentence, naming the step, and the api answers it with a 422 carrying the steps it names (`stepsNamed`), so
 * the board shows it by them. The body's shape is the api's own to refuse (400), and what was written is answered read back from disk
 * (`listed`), never echoed from the request.
 *
 * A schema pasted for an `output:` is the one file `writeWorkflow` never writes, so it travels in the same PUT (`schemas`) and is judged with
 * the steps, the folder parsed in memory as it would read with it, before a byte of either is written (`judgedWith`). As two writes, a schema
 * written and the folder then refused left the file behind under "nothing written".
 *
 * A save carries the `version` the folder was listed at (`versionOf`), and is refused (409) when the folder no longer holds it: a step edited,
 * added or removed by hand while the board had it open would otherwise be written over, or deleted, from a draft that never saw it.
 *
 * Yours only: the store's `workflows/`. A write to the repository's is refused (403) with the copy to make by hand, since the api writes nothing
 * into a checkout. Every write passes the guard (guard.ts) before its body is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { HOME, loadAgents, writeWorkflow } from 'agent-orchestrator';
import { AGENT_KEYS, AGENTS_FOLDER, agentsDir, DENIALS, EFFORTS, HARNESSES, parseFolder, parseWorkflow, PERMISSION_MODES, renderStep, SLOTS, STEP_KEY_MEANINGS, STEP_KEYS, stepNameRefusal, WORKSPACES, WorkflowError, type StepDraft, type StepKey } from 'agent-orchestrator/workflow';
import { repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { folderOf, foldersIn, listed, specOf, versionOf, type WorkflowListing, type WorkflowStepSpec } from './workflows.ts';

/**
 * How a key is set on a step's form, which is what its value is in JSON: `steps`, a list of the workflow's steps (`after`, `input`); `step`,
 * one of them (`resume`, `loop`); `choice`, one of `choices` (`harness`); `harness-word`, one of the words the step's harness takes
 * (`byHarness`: `effort`, `permissionMode`); `text`, one line (`model`, `check`); `list`, names (`tools`, `disallowedTools`); `count`, a whole number;
 * `dollars`, an amount; `tokens`, a number of tokens, which the form writes as a person does (`context`, `200k`); `flag`, `true` or `false` as
 * `choices` has them (`background`, `remote`, `gate`); `schema`, a file beside the step (`output`).
 * `workspace` is a `choice` of its words, `main` and `folder`, `slot` of one word, `none`, and `denials` of one, `fail`, since a step either says it or says nothing. `agent` is a
 * `choice` of the agents in yours' `agents/`, the only folder the builder writes the steps of.
 */
export type KeyKind = 'steps' | 'step' | 'choice' | 'harness-word' | 'text' | 'list' | 'count' | 'dollars' | 'tokens' | 'flag' | 'schema';

/**
 * Each key's kind, in `STEP_KEYS`' order: a key added to the package without one does not typecheck. `count` is the package's `COUNTS`, which it
 * does not export: `test/builder.test.ts` holds this copy to the parser, which refuses exactly those keys as "not a count".
 */
const KINDS: Readonly<Record<StepKey, KeyKind>> = {
  after: 'steps', resume: 'step', input: 'steps', workspace: 'choice', slot: 'choice', agent: 'choice', harness: 'choice', model: 'text', effort: 'harness-word', context: 'tokens', permissionMode: 'harness-word',
  tools: 'list', disallowedTools: 'list', allowedTools: 'list', denials: 'choice', background: 'flag', remote: 'flag', deadlineSeconds: 'count', maxAttempts: 'count', budget: 'dollars', check: 'text',
  retries: 'count', gate: 'flag', output: 'schema', loop: 'step', rounds: 'count',
};

/** What a flag may be set to, as the parser reads it: `background:` and `remote:` say either, and `gate:` only `true`, since `false` is a step without the line. */
const FLAGS: Readonly<Partial<Record<StepKey, readonly string[]>>> = { background: ['true', 'false'], remote: ['true', 'false'], gate: ['true'] };

/** The harness a step runs on when it names none, whose words `effort` and `permissionMode` take then. The parser's, which it does not export. */
export const DEFAULT_HARNESS = 'claude';

/** One key of a step's form: the key, the package's line of what it means, how it is set, and the words it may be set to where there are some. */
export type KeyField = { key: StepKey; meaning: string; kind: KeyKind; choices: readonly string[] | null; byHarness: Readonly<Record<string, readonly string[]>> | null };

/**
 * What the builder's form is drawn from (`GET /api/workflows/keys`): every key a step may set, in the package's order, and the default harness.
 * `roleKeys` are the keys an agent may set (the package's `AGENT_KEYS` but its description), which a step with an agent takes from it unless
 * its file sets them itself: the form shows those as the agent's until one is changed.
 *
 * `agents` are the role values of each agent of yours that loads, as a step's spec gives them and only those it sets: a step attached to one
 * on the board shows its values before the save reads them back, and a step moved from one agent to another shows the other's.
 */
export type KeyForm = { keys: KeyField[]; defaultHarness: string; roleKeys: StepKey[]; agents: Record<string, Partial<WorkflowStepSpec>> };

/**
 * The keys a step may take from its agent: the agent's keys but the two that describe the agent itself — its description and the skills it
 * says it can do, neither of which a step has. A key added to `AGENT_KEYS` that is not a role key is left out here too, or the cast fails.
 */
const ROLE_KEYS: readonly StepKey[] = AGENT_KEYS.filter((key): key is Exclude<typeof key, 'description' | 'skills'> => key !== 'description' && key !== 'skills');

/** The agents a step of yours may name: each file of yours' `agents/`, by name, readable or not — naming a broken one is refused on save, in its words. */
const agentsOfYours = (home: string): string[] => [...loadAgents(path.join(home, 'workflows', AGENTS_FOLDER)).keys()].sort();

/**
 * What each agent of yours gives a step it is attached to: a step that names it and sets nothing, read by the parser and shown as the listing
 * shows a step, cut to the keys the agent sets. An agent the load refuses gives nothing, and a step saved naming it is refused in its words.
 */
function agentValues(home: string): Record<string, Partial<WorkflowStepSpec>> {
  const agents = loadAgents(path.join(home, 'workflows', AGENTS_FOLDER));
  const values: Record<string, Partial<WorkflowStepSpec>> = {};
  for (const [name, agent] of [...agents].sort(([a], [b]) => a.localeCompare(b))) {
    if (agent instanceof WorkflowError) continue;
    let spec: WorkflowStepSpec;
    try {
      spec = specOf(parseWorkflow(name, `---\nagent: ${name}\n---\n`, undefined, agents));
    } catch (err) {
      if (err instanceof WorkflowError) continue;
      throw err;
    }
    values[name] = Object.fromEntries(ROLE_KEYS.filter((key) => Object.hasOwn(agent.keys, key)).map((key) => [key, spec[key]]));
  }
  return values;
}

export const keyForm = (home: string = HOME): KeyForm => ({
  keys: STEP_KEYS.map((key) => ({
    key,
    meaning: STEP_KEY_MEANINGS[key],
    kind: KINDS[key],
    choices: key === 'harness' ? HARNESSES : key === 'workspace' ? WORKSPACES : key === 'slot' ? SLOTS : key === 'denials' ? DENIALS : key === 'agent' ? agentsOfYours(home) : FLAGS[key] ?? null,
    byHarness: key === 'effort' ? EFFORTS : key === 'permissionMode' ? PERMISSION_MODES : null,
  })),
  defaultHarness: DEFAULT_HARNESS,
  roleKeys: [...ROLE_KEYS],
  agents: agentValues(home),
});

/** What a write answers: the folder read back from disk, as the listing has it, and its files by name — written, left as they were, removed. */
export type WorkflowSaved = { workflow: WorkflowListing; written: string[]; kept: string[]; removed: string[] };

/** A refusal of the package's, and the steps it names: one, several for a cycle, or none for a refusal of the folder. */
export type BuildRefused = { error: string; steps: string[] };

/**
 * The steps of `names` a refusal of the package's names, which the board shows it by. `validate`'s cycle lists the steps that wait on each
 * other; `stepNameRefusal` and a name given twice name the name; every other refusal of a step opens on its name — `review: …`, or
 * `review is in two loops` — the longest name first, so `review-2: …` is not taken for `review`'s.
 */
export function stepsNamed(message: string, names: readonly string[]): string[] {
  const cycle = /^these steps wait on each other: (.+)$/.exec(message);
  if (cycle) return cycle[1]!.split(', ').filter((name) => names.includes(name));
  const refusedName = names.find((name) => stepNameRefusal(name) === message);
  if (refusedName !== undefined) return [refusedName];
  const twice = names.find((name) => message.startsWith(`two steps are named ${name}, `));
  if (twice !== undefined) return [twice];
  const opens = [...names].sort((a, b) => b.length - a.length).find((name) => message.startsWith(`${name}: `) || message.startsWith(`${name} is in two loops`));
  return opens === undefined ? [] : [opens];
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const STEP_SHAPE = '`{ "name": "<step>", "spec": { "after": ["<step>"], "harness": "claude", … }, "body": "<what its agent is told>", "own"?: { "keys": ["<key>", …], "body": "<its own note>" } }`, as GET /api/workflows lists a step, a key unset as null or left out';
const PUT_SHAPE = `\`{ "version": "<as GET /api/workflows lists it>", "steps": [<step>, …], "schemas"?: [{ "file": "<name>.json", "text": "<a JSON Schema>" }, …], "readme"?: "<README.md>" }\`, each step ${STEP_SHAPE}`;
const POST_SHAPE = `\`{ "name": "<workflow>", "step": <step>, "readme"?: "<README.md>" }\`, the step ${STEP_SHAPE}`;

/** A write of yours, as the guard's refusals word it (guard.ts). */
const buildGuard = (route: string, does: string, shape: string): Guarded => ({
  route,
  does,
  forAnother: 'write one',
  why: "a workflow's steps are what agents are told and run with in this repository, once a run of it starts",
  reach: 'build it on the board\'s Workflows page',
  instead: "Build it on the board's Workflows page, or edit the folder's files",
  shape,
});

/**
 * Why a write is not one of yours (403 for the repository's, with the copy to make by hand; 400 for anywhere else), or null. The api writes
 * nothing into a checkout: git would show a change nobody typed there, and a run started from the checkout would run it.
 */
export function yoursOnly(route: string, from: unknown, name: string | null, repo: string): Refusal | null {
  if (from === 'yours') return null;
  const yours = path.join(HOME, 'workflows');
  const theirs = path.join(repo, 'workflows');
  if (from === 'repo') {
    const start = name ? ` — \`cp -r ${path.join(theirs, name)} ${yours}/\` starts from this one —` : '';
    return {
      status: 403,
      error: `${route} refuses to write the repository's workflows (${theirs}): the builder writes only yours, in ${yours}, and the api writes nothing into a checkout. Build the workflow in yours${start} then copy the folder into ${theirs} by hand, where git shows it as a change to commit.`,
    };
  }
  return { status: 400, error: `${route}: the builder writes yours, at /api/workflows/yours/…, and this request named ${JSON.stringify(from)}.` };
}

/** What a JSON value of each kind is, as a refusal of the wrong one says it. */
const TYPES: Readonly<Record<KeyKind, { is: (value: unknown) => boolean; said: string }>> = (() => {
  const strings = { is: (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string'), said: 'a list of strings, such as ["implement"]' };
  const string = { is: (v: unknown) => typeof v === 'string', said: 'a string' };
  const number = { is: (v: unknown) => typeof v === 'number', said: 'a number' };
  return {
    steps: strings, list: strings, step: string, choice: string, 'harness-word': string, text: string, schema: { ...string, said: "a string, the schema file's name" },
    count: number, dollars: number, tokens: number, flag: { is: (v: unknown) => typeof v === 'boolean', said: 'true or false' },
  };
})();

/**
 * A step of a request as `writeWorkflow` takes it, or why it is not one (400). Each key the listing has is typed as it lists it, null or left
 * out for unset; whether a value is one the step may have is the package's to say. A key no step has is passed on as it came, so the package
 * refuses it in its words, naming the step. `output` names its file: the schema is the folder's.
 *
 * A step with an agent (`spec.agent`) is written as `agent:`, its own keys and its own note. Sent as the listing has it — `own` with the
 * keys its file sets and its note — a role key `own.keys` does not name is its agent's, and is not written; its wiring is always its own.
 * Sent without `own`, every key it sets is its own and `body` is its note (the package's `StepDraft`, whose `agent` is a name).
 */
function draftOf(step: unknown, at: string, route: string, shape: string): StepDraft | Refusal {
  const bad = (why: string): Refusal => ({ status: 400, error: `${route}: ${at} ${why} Send ${shape}.` });
  if (!isObject(step)) return bad(`is ${JSON.stringify(step)}, and a step is an object.`);
  const { name, spec = {}, body, own } = step;
  if (typeof name !== 'string') return bad(`has no \`name\`: a step is named by its file, without .md.`);
  const called = `${at} (${name})`;
  if (typeof body !== 'string') return { status: 400, error: `${route}: ${called} has no \`body\`, what its agent is told, as a string. Send ${shape}.` };
  if (!isObject(spec)) return { status: 400, error: `${route}: ${called}'s \`spec\` is ${JSON.stringify(spec)}, and it is an object of the step's keys. Send ${shape}.` };
  if (own != null && !(isObject(own) && Array.isArray(own.keys) && own.keys.every((k) => typeof k === 'string') && typeof own.body === 'string')) {
    return { status: 400, error: `${route}: ${called}'s \`own\` is ${JSON.stringify(own)}, and it is what a step with an agent sets itself: \`{ "keys": ["<key>", …], "body": "<its own note>" }\`, as GET /api/workflows lists it, or null. Send ${shape}.` };
  }
  const draft: Record<string, unknown> = { after: [] };
  const agents = spec.agent != null && own != null;
  for (const [key, value] of Object.entries(spec)) {
    if (value === null || value === undefined) continue;
    const kind = (KINDS as Record<string, KeyKind | undefined>)[key];
    if (kind && !TYPES[kind].is(value)) {
      return { status: 400, error: `${route}: ${called}'s \`${key}\` is ${TYPES[kind].said}, or null for unset, and this request's was ${JSON.stringify(value)}. Send ${shape}.` };
    }
    // A role key the step's file does not set is its agent's: written, it would pin the agent's value in the step.
    if (agents && isRoleKey(key) && !(own.keys as string[]).includes(key)) continue;
    draft[key] = key === 'output' ? { file: value } : value;
  }
  return { ...draft, name, body: agents ? own.body : body } as StepDraft;
}

const isRoleKey = (key: string): boolean => (ROLE_KEYS as readonly string[]).includes(key);

/** A readme a request gives, or why not (400): a string, or left out for the README as it is. */
function readmeOf(readme: unknown, route: string, shape: string): { readme: string | undefined } | Refusal {
  if (readme === undefined || typeof readme === 'string') return { readme };
  return { status: 400, error: `${route}: \`readme\` is the README's text, a string, or left out to leave it as it is — this request's was ${JSON.stringify(readme)}. Send ${shape}.` };
}

/** Why `name` cannot be a folder of yours (400), or undefined: a name the listing would show, one folder directly in the store's `workflows/`. */
export function workflowNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its folder is named — dev, say.';
  if (typeof name !== 'string' || !name.trim()) return `A workflow has no name, and a workflow is named by its folder. ${fix}`;
  const as = `\`${name}\` is not a workflow's name:`;
  if (/[\\/]/.test(name)) return `${as} a workflow is one folder in yours, and a slash names a folder inside another. ${fix}`;
  if (/[\u0000-\u001f\u007f]/.test(name)) return `${as} it holds a control character — ${JSON.stringify(name)}. ${fix}`;
  if (name.startsWith('.')) return `${as} a folder whose name starts with a dot is hidden, and the board lists no hidden folder as a workflow. ${fix}`;
  if (name !== name.trim()) return `${as} a name with spaces around it is a folder nobody can type. Write it without them.`;
  if (new TextEncoder().encode(name).length > 255) return `${as} it is longer than a folder's name may be, 255 bytes. ${fix}`;
  if (name === AGENTS_FOLDER) return `${as} ${AGENTS_FOLDER}/ is the folder of the agents the workflows beside it name, and its files are agents, not steps. ${fix}`;
  return undefined;
}

/** Why `file` cannot be a schema beside the steps (400), or undefined: a `.json` file directly in the folder, not hidden. */
export function schemaNameRefusal(file: string): string | undefined {
  const fix = 'Name it beside its step — review.schema.json, say.';
  const as = `\`${file}\` is not a schema's file:`;
  if (/[\\/]/.test(file)) return `${as} a schema lives in the workflow's folder, and a slash names a file in another. ${fix}`;
  if (/[\u0000-\u001f\u007f]/.test(file)) return `${as} it holds a control character — ${JSON.stringify(file)}. ${fix}`;
  if (file.startsWith('.')) return `${as} a file whose name starts with a dot is hidden, and nobody listing the folder sees it. ${fix}`;
  if (!file.endsWith('.json') || file === '.json') return `${as} a JSON Schema's file ends in .json, which is what the builder lists beside the steps. ${fix}`;
  if (new TextEncoder().encode(file).length > 255) return `${as} it is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}

/** A schema a save writes beside the steps: its file's name and its text, as it is written. */
export type SchemaFile = { file: string; text: string };

/**
 * The schemas a PUT carries, or why not: not a list of `{ file, text }` (400), a file that is not a schema's (400, `schemaNameRefusal`) or given
 * twice (400). Each text is written ending in a line break, as a file is. Whether it is a schema a step can name is judged with the steps.
 */
function schemasOf(schemas: unknown, route: string): SchemaFile[] | Refusal {
  if (schemas === undefined) return [];
  const bad = (why: string): Refusal => ({ status: 400, error: `${route}: ${why} Send ${PUT_SHAPE}.` });
  if (!Array.isArray(schemas)) return bad(`\`schemas\` is the schemas to write beside the steps, a list, or left out for none — this request's was ${JSON.stringify(schemas)}.`);
  const out: SchemaFile[] = [];
  for (const [i, schema] of schemas.entries()) {
    if (!isObject(schema) || typeof schema.file !== 'string' || typeof schema.text !== 'string') {
      return bad(`schema ${i + 1} is ${JSON.stringify(schema)}, and a schema is \`{ "file": "<name>.json", "text": "<a JSON Schema>" }\`.`);
    }
    const refused = schemaNameRefusal(schema.file);
    if (refused) return { status: 400, error: refused };
    if (out.some((s) => s.file === schema.file)) return bad(`${schema.file} is given twice, and a file holds one schema. Give it once.`);
    out.push({ file: schema.file, text: schema.text.endsWith('\n') ? schema.text : `${schema.text}\n` });
  }
  return out;
}

/** The steps whose `output:` names `file`, which a refusal of its schema is shown by. */
const namingSchema = (steps: readonly StepDraft[], file: string): string[] => steps.filter((s) => s.output?.file === file).map((s) => s.name);

/**
 * Why the folder at `dir` would not read with `steps` and `schemas` written, or null: each schema a JSON object, then each step rendered and
 * the folder parsed in memory as `writeWorkflow` parses it, with the schemas read as given and every other file as it is on disk. The package's
 * words, naming the steps. A step's name `writeWorkflow` refuses first is left to it (`unnamed`), which writes nothing on it either.
 */
function judgedWith(dir: string, steps: readonly StepDraft[], schemas: readonly SchemaFile[]): BuildRefused | null {
  for (const { file, text } of schemas) {
    let schema: unknown;
    try {
      schema = JSON.parse(text);
    } catch (err) {
      return { error: `${file} is not JSON (${messageOf(err)}). A schema is a JSON object — \`{ "type": "object", "properties": { … } }\`.`, steps: namingSchema(steps, file) };
    }
    if (!isObject(schema)) return { error: `${file} is ${JSON.stringify(schema)}, and a schema is a JSON object — \`{ "type": "object", "properties": { … } }\`.`, steps: namingSchema(steps, file) };
  }
  const given = new Map(schemas.map((s) => [s.file, s.text]));
  const read = (file: string): string | undefined => {
    const pasted = given.get(path.normalize(file));
    if (pasted !== undefined) return pasted;
    try { return fs.readFileSync(path.resolve(dir, file), 'utf8'); } catch { return undefined; }
  };
  try {
    parseFolder(steps.map((step) => [step.name, renderStep(step)] as const), read, loadAgents(agentsDir(dir)));
    return null;
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return { error: err.message, steps: stepsNamed(err.message, steps.map((s) => s.name)) };
  }
}

/** Whether `writeWorkflow` refuses the steps by their names — none, one not a file's, one twice — before it renders any: its words, not these. */
const unnamed = (steps: readonly StepDraft[]): boolean =>
  !steps.length || steps.some((s) => stepNameRefusal(s.name) !== undefined) || new Set(steps.map((s) => s.name)).size < steps.length;

/** A schema as the folder held it before a save wrote it: its text, or undefined where the folder had no such file. */
export type SchemaWas = { file: string; was: string | undefined };

/**
 * The schemas a save wrote put back as the folder held them: removed where it had no such file, and written back where what the file holds now
 * is not what it held. Then a file the failing write never opened is not written to — a read-only one, which putting back would refuse in turn —
 * and one a write truncated and did not finish is put back all the same. `fs.writeFileSync` truncates before it writes, so a write that fails
 * after the open (the disk full, a read that broke) leaves a file shorter than it was, and no bookkeeping of which writes returned can tell.
 *
 * Exported for the test, which reads and refuses each of those three.
 */
export function putSchemasBack(dir: string, written: readonly SchemaWas[]): void {
  for (const { file, was } of written) {
    const at = path.join(dir, file);
    if (was === undefined) {
      fs.rmSync(at, { force: true });
      continue;
    }
    let holds: string | undefined;
    try { holds = fs.readFileSync(at, 'utf8'); } catch { /* gone, or no longer readable: written back below */ }
    if (holds !== was) fs.writeFileSync(at, was);
  }
}

/**
 * A folder written through the package, with the schemas pasted for it, or its refusal (422, with the steps it names), then read back from disk.
 *
 * Judged whole before a byte is written: the steps' names by `writeWorkflow` itself, which refuses them before anything; the schemas and the
 * steps together by `judgedWith`. Then the schemas are written and the folder after them, whose parse now reads them from disk. Should
 * `writeWorkflow` refuse all the same — the folder changed between the two reads — each schema is put back as it was; and so it is when the
 * disk refuses a schema itself, whether it refuses the open (a file read-only among them) or the write after it (the disk full), which leaves
 * the save no more written than a refusal does.
 */
function write(name: string, dir: string, steps: readonly StepDraft[], readme: string | undefined, schemas: readonly SchemaFile[] = []): WorkflowSaved | BuildRefused {
  const refused = (message: string): BuildRefused => ({ error: message, steps: stepsNamed(message, steps.map((s) => (typeof s.name === 'string' ? s.name : ''))) });
  const writing = unnamed(steps) ? [] : schemas;
  if (writing.length) {
    const judged = judgedWith(dir, steps, writing);
    if (judged) return judged;
  }
  const before: SchemaWas[] = writing.map(({ file }) => {
    try { return { file, was: fs.readFileSync(path.join(dir, file), 'utf8') }; } catch { return { file, was: undefined }; }
  });
  const schemasWritten = writing.filter((s, i) => s.text !== before[i]!.was).map((s) => s.file);
  // Every schema the save has reached, the one it is writing among them: what is put back should that write fail, or a later one, or the
  // folder. A write that fails partway has changed the file all the same, so a schema counts as written before the write, not after it.
  const written: SchemaWas[] = [];
  let result;
  try {
    for (const [i, { file, text }] of writing.entries()) {
      written.push(before[i]!);
      fs.writeFileSync(path.join(dir, file), text);
    }
    result = writeWorkflow(dir, steps, readme);
  } catch (err) {
    putSchemasBack(dir, written);
    if (err instanceof WorkflowError) return refused(err.message);
    throw err;
  }
  const kept = writing.filter((s) => !schemasWritten.includes(s.file)).map((s) => s.file);
  return {
    workflow: listed(name, 'yours', dir),
    written: [...result.written, ...schemasWritten].sort(),
    kept: [...result.kept, ...kept].sort(),
    removed: result.removed,
  };
}

/** A body read as JSON, or why not (400). */
async function jsonOf(req: { json: () => Promise<unknown> }, route: string, shape: string): Promise<{ body: unknown } | Refusal> {
  try {
    return { body: await req.json() };
  } catch {
    return { status: 400, error: `${route} takes a JSON body: ${shape}.` };
  }
}

export const builder = new Hono()
  // What a step's form is drawn from: the package's keys, in its order, and what each may be set to.
  .get('/api/workflows/keys', (c) => c.json(keyForm()))
  // A new folder of yours with its first step: `writeWorkflow` on a folder that is not there yet.
  .post('/api/workflows/:from', async (c) => {
    const { from } = c.req.param();
    const route = `POST /api/workflows/${from}`;
    const refused = refusedBeforeReading(buildGuard(route, 'writes a workflow', POST_SHAPE), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const repo = repoOf();
    const where = yoursOnly(route, from, null, repo);
    if (where) return c.json({ error: where.error }, where.status);
    const read = await jsonOf(c.req, route, POST_SHAPE);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { body } = read;
    if (!isObject(body)) return c.json({ error: `${route} takes a JSON object: ${POST_SHAPE}.` }, 400);
    const other = body.from === undefined ? null : yoursOnly(route, body.from, typeof body.name === 'string' ? body.name : null, repo);
    if (other) return c.json({ error: other.error }, other.status);
    const nameRefused = workflowNameRefusal(body.name);
    if (nameRefused) return c.json({ error: nameRefused }, 400);
    const name = body.name as string;
    const step = draftOf(body.step, '`step`', route, POST_SHAPE);
    if ('status' in step) return c.json({ error: step.error }, step.status);
    const readme = readmeOf(body.readme, route, POST_SHAPE);
    if ('status' in readme) return c.json({ error: readme.error }, readme.status);
    try {
      const dir = path.join(HOME, 'workflows', name);
      if (fs.lstatSync(dir, { throwIfNoEntry: false })) {
        const folder = foldersIn(path.dirname(dir)).includes(name);
        return c.json({
          error: folder
            ? `Yours already has a workflow named '${name}' (${dir}). PUT /api/workflows/yours/${name} changes it, or name the new one otherwise.`
            : `Yours has a file named '${name}' in ${path.dirname(dir)}, which is not a workflow and is not the builder's to replace. Name the workflow otherwise.`,
        }, 409);
      }
      const saved = write(name, dir, [step], readme.readme);
      if ('error' in saved) return c.json(saved, 422);
      return c.json(saved, 201);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // A folder of yours put back from its steps: every step it is to have, as the listing has them.
  .put('/api/workflows/:from/:name', async (c) => {
    const { from, name } = c.req.param();
    const route = `PUT /api/workflows/${from}/${name}`;
    const refused = refusedBeforeReading(buildGuard(route, 'writes a workflow', PUT_SHAPE), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const repo = repoOf();
    const where = yoursOnly(route, from, name, repo);
    if (where) return c.json({ error: where.error }, where.status);
    const read = await jsonOf(c.req, route, PUT_SHAPE);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { body } = read;
    if (!isObject(body)) return c.json({ error: `${route} takes a JSON object: ${PUT_SHAPE}.` }, 400);
    const other = body.from === undefined ? null : yoursOnly(route, body.from, name, repo);
    if (other) return c.json({ error: other.error }, other.status);
    if (typeof body.version !== 'string' || !body.version) {
      return c.json({
        error: `${route} takes the \`version\` the folder was read at, as GET /api/workflows lists it, so a save of a folder that has changed since is refused rather than written over what changed. This request's was ${JSON.stringify(body.version)}: read the folder, then send ${PUT_SHAPE}.`,
      }, 400);
    }
    if (!Array.isArray(body.steps)) return c.json({ error: `${route} takes the workflow's steps in \`steps\`, a list: ${PUT_SHAPE}.` }, 400);
    const steps: StepDraft[] = [];
    for (const [i, step] of body.steps.entries()) {
      const draft = draftOf(step, `step ${i + 1}`, route, PUT_SHAPE);
      if ('status' in draft) return c.json({ error: draft.error }, draft.status);
      steps.push(draft);
    }
    const schemas = schemasOf(body.schemas, route);
    if ('status' in schemas) return c.json({ error: schemas.error }, schemas.status);
    const readme = readmeOf(body.readme, route, PUT_SHAPE);
    if ('status' in readme) return c.json({ error: readme.error }, readme.status);
    try {
      const folder = folderOf(name, 'yours', repo, HOME);
      if ('status' in folder) {
        const make = folder.status === 404 ? ` To make a new one, POST /api/workflows/yours with its name and a first step.` : '';
        return c.json({ error: `${folder.error}${make}` }, folder.status);
      }
      // What the draft was read from, against what the folder holds now: a step edited, added or removed since would be written over.
      const now = versionOf(folder.dir);
      if (now !== body.version) {
        return c.json({
          error: `${folder.dir} has changed since it was read at version ${body.version}: a step, the README or a schema there was edited, added or removed, and this save would write over it. Nothing was written. Read the folder again (it is at version ${now}), make the change on what it holds now, and save that.`,
          steps: [],
        }, 409);
      }
      const saved = write(name, folder.dir, steps, readme.readme, schemas);
      if ('error' in saved) return c.json(saved, 422);
      return c.json(saved, 200);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  });
