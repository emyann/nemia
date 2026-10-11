/**
 * The workflow builder, for the board: a folder of yours put back from its steps as the Workflows page lists them, a new folder with a
 * first step, a schema beside the steps, and what a step's form is drawn from.
 *
 * A folder is written by the package's `writeWorkflow` (agent-orchestrator's folder/write.store.ts), which judges the whole folder before a
 * byte is written: each refusal is the parser's sentence, naming the step, and the api answers it with a 422 carrying the steps it names
 * (`stepsNamed`), so the board shows it by them. The body's shape is the api's own to refuse (400), and what was written is answered read
 * back from disk (`listed`), never echoed from the request.
 *
 * A schema pasted for an `output:` is the one file `writeWorkflow` never writes, so it travels in the same PUT (`schemas`) and is judged
 * with the steps, the folder parsed in memory as it would read with it, before a byte of either is written (`judgedWith`): a refused folder
 * leaves no schema behind under "nothing written".
 *
 * A save carries the `version` the folder was listed at (`workflowVersion`), and is refused (409, `workflowStale`) when the folder holds
 * something else: a step edited, added or removed by hand while the board had it open would otherwise be written over, or deleted, from a
 * draft that never saw it.
 *
 * Yours only: the store's `workflows/`. A write to the repository's is refused (403) with the copy to make by hand, since the api writes
 * nothing into a checkout. Every write passes the guard (guard.ts) before its body is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  agentsFor,
  COMMANDS,
  HARNESS_CHOICES,
  loadAgents,
  remoteAgents,
  skillsFor,
  type Places,
  type WorkflowWritten,
  repoWriteRefusal,
  workflowStale,
  workflowVersion,
} from 'agent-orchestrator';
import {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  AGENTS_FOLDER,
  HARNESSES,
  parseFolder,
  parseWorkflow,
  POLICY_KEYS,
  REMOTE_PREFIX,
  REMOTE_REFUSED_KEYS,
  renderStep,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  stepNameRefusal,
  WorkflowError,
  type StepDraft,
  type StepKey,
} from 'agent-orchestrator/workflow';
import { readBody, valueAt, type BodyIssue, type Words } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { KINDS, schemaNameRefusal, WORDS, workflowNameRefusal, type KeyKind } from './words.ts';
import type { Engine } from '../store.ts';
import { folderOf, listed, loadedOf, placesOf, specOf, type WorkflowListing, type WorkflowStepSpec } from './workflows.ts';
import { runPlaced } from '../store.ts';
import type { PlaceService } from 'agent-orchestrator';

/**
 * The harness a step runs on when it names none, whose words `effort` and `permissionMode` take then — and which takes no `sandbox`. The
 * parser's, which it does not export.
 */
export const DEFAULT_HARNESS = 'claude';

/**
 * One key of a step's form: the key, the package's line of what it means, how it is set, and the words it may be set to where there are
 * some.
 */
export type KeyField = {
  key: StepKey;
  meaning: string;
  kind: KeyKind;
  choices: readonly string[] | null;
  byHarness: Readonly<Record<string, readonly string[]>> | null;
};

/**
 * What the builder's form is drawn from (`GET /api/workflows/keys`): every key a step may set, in the package's order, and the default
 * harness. `roleKeys` are the keys an agent may set (the package's `AGENT_KEYS` but its description), which a step with an agent takes from
 * it unless its file sets them itself: the form shows those as the agent's until one is changed. `policyKeys` are those a step's file sets
 * as its policy over its agent (the package's `POLICY_KEYS`): the fence keys, which only tighten the agent's, and the skills it adds.
 *
 * `agents` are the role values of each agent of yours that loads, as a step's spec gives them and only those it sets: a step attached to
 * one on the board shows its values before the save reads them back, and a step moved from one agent to another shows the other's.
 *
 * `remote` is how a step names a remote A2A agent, `harness: <prefix><name>`, and the keys such a step may not set, which the form leaves
 * off it (`REMOTE_REFUSED_KEYS`). The harness's `choices` offer each agent the store's `a2a-agents.json` declares beside the local
 * harnesses; `byHarness` has none of them, since a remote agent takes none of those words.
 */
export type KeyForm = {
  keys: KeyField[];
  defaultHarness: string;
  roleKeys: StepKey[];
  policyKeys: StepKey[];
  agents: Record<string, Partial<WorkflowStepSpec>>;
  remote: { prefix: string; refuses: StepKey[] };
};

/**
 * The keys a step may take from its agent: the agent's keys but its own (`AGENT_OWN_KEYS`) — its description, the skills it is given
 * and what becomes of Claude Code's own prompt, none of which a step has. A key added to `AGENT_KEYS` that is not a role key joins that
 * list, or the cast fails.
 */
const ROLE_KEYS: readonly StepKey[] = AGENT_KEYS.filter(
  (key): key is Exclude<typeof key, (typeof AGENT_OWN_KEYS)[number]> => !(AGENT_OWN_KEYS as readonly string[]).includes(key),
);

/**
 * The agents a step of yours may name: each file of yours' `agents/`, by name, readable or not — naming a broken one is refused on save, in
 * its words.
 */
const agentsOfYours = (home: string): string[] => [...loadAgents(path.join(home, 'workflows', AGENTS_FOLDER)).keys()].sort();

/**
 * What each agent of yours gives a step it is attached to: a step that names it and sets nothing but the `place:` every step says, read by
 * the parser and shown as the listing shows a step, cut to the keys the agent sets. An agent the load refuses gives nothing, and a step
 * saved naming it is refused in its words.
 */
function agentValues(home: string): Record<string, Partial<WorkflowStepSpec>> {
  const agents = loadAgents(path.join(home, 'workflows', AGENTS_FOLDER));
  const values: Record<string, Partial<WorkflowStepSpec>> = {};
  for (const [name, agent] of [...agents].sort(([a], [b]) => a.localeCompare(b))) {
    if (agent instanceof WorkflowError) continue;
    let spec: WorkflowStepSpec;
    try {
      spec = specOf(parseWorkflow(name, `---\nplace: folder\nagent: ${name}\n---\n`, undefined, agents));
    } catch (err) {
      if (err instanceof WorkflowError) continue;
      throw err;
    }
    values[name] = Object.fromEntries(ROLE_KEYS.filter((key) => Object.hasOwn(agent.keys, key)).map((key) => [key, spec[key]]));
  }
  return values;
}

/**
 * The harnesses a step may name: the package's, then each remote A2A agent the store declares, as `a2a:<name>` (`remoteAgents`, read
 * afresh). An entry the runtime refuses is not offered, and a file refused as it stands offers none of its agents — the form is still
 * drawn, a step already naming one keeps its word, and `nemia start` and `nemia up` say what is wrong with the file.
 */
function harnessChoices(): readonly string[] {
  try {
    return [...HARNESSES, ...[...remoteAgents().keys()].map((name) => `${REMOTE_PREFIX}${name}`)];
  } catch {
    return [...HARNESSES];
  }
}

export const keyForm = (home: string): KeyForm => ({
  keys: STEP_KEYS.map((key) => ({
    key,
    meaning: STEP_KEY_MEANINGS[key],
    kind: KINDS[key],
    choices: key === 'harness' ? harnessChoices() : key === 'agent' ? agentsOfYours(home) : (WORDS[key] ?? null),
    byHarness: key === 'effort' || key === 'permissionMode' || key === 'sandbox' ? HARNESS_CHOICES[key] : null,
  })),
  defaultHarness: DEFAULT_HARNESS,
  roleKeys: [...ROLE_KEYS],
  policyKeys: [...POLICY_KEYS],
  agents: agentValues(home),
  remote: { prefix: REMOTE_PREFIX, refuses: [...REMOTE_REFUSED_KEYS] },
});

/**
 * What a write answers: the folder read back from disk, as the listing has it, and its files by name — written, left as they were, removed.
 */
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
  if (cycle) return cycle[1].split(', ').filter((name) => names.includes(name));
  const refusedName = names.find((name) => stepNameRefusal(name) === message);
  if (refusedName !== undefined) return [refusedName];
  const twice = names.find((name) => message.startsWith(`two steps are named ${name}, `));
  if (twice !== undefined) return [twice];
  const opens = [...names]
    .sort((a, b) => b.length - a.length)
    .find((name) => message.startsWith(`${name}: `) || message.startsWith(`${name} is in two loops`));
  return opens === undefined ? [] : [opens];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const STEP_SHAPE =
  '`{ "name": "<step>", "spec": { "after": ["<step>"], "harness": "claude", … }, "body": "<what its agent is told>", "own"?: { "keys": ["<key>", …], "body": "<its own note>" } }`, as GET /api/workflows lists a step, a key unset as null or left out';
const PUT_SHAPE = `\`{ "version": "<as GET /api/workflows lists it>", "steps": [<step>, …], "schemas"?: [{ "file": "<name>.json", "text": "<a JSON Schema>" }, …], "readme"?: "<README.md>" }\`, each step ${STEP_SHAPE}`;
const POST_SHAPE = `\`{ "name": "<workflow>", "step": <step>, "readme"?: "<README.md>" }\`, the step ${STEP_SHAPE}`;

/**
 * A step as a request sends it, its keys in the order they are refused. Each key of `spec` is typed by its kind (`KINDS`, in `draftOf`),
 * and a key no step has is passed on as it came, for the package to refuse in its words.
 */
const STEP_BODY = Schema.Struct({
  name: Schema.String,
  body: Schema.String,
  spec: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  own: Schema.optionalKey(Schema.NullOr(Schema.Struct({ keys: Schema.Array(Schema.String), body: Schema.String }))),
});
type StepBody = typeof STEP_BODY.Type;

/** A `from` beside a write: yours, the only place the builder writes (`yoursOnly` refuses any other, through the route's words). */
const FROM = Schema.optionalKey(Schema.Literal('yours'));
const README = Schema.optionalKey(Schema.String);

const POST_BODY = Schema.Struct({
  from: FROM,
  name: Schema.String.check(Schema.makeFilter((name: string) => workflowNameRefusal(name) === undefined)),
  step: STEP_BODY,
  readme: README,
});

/** A schema's file is one beside the steps (`schemaNameRefusal`), refused before its text is read. */
const PUT_BODY = Schema.Struct({
  from: FROM,
  version: Schema.NonEmptyString,
  steps: Schema.Array(STEP_BODY),
  schemas: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        file: Schema.String.check(Schema.makeFilter((file: string) => schemaNameRefusal(file) === undefined)),
        text: Schema.String,
      }),
    ),
  ),
  readme: README,
});

/** Why a step sent at `path` is not one (400), by the first of its keys its schema refused: `at` is how the sentence names it. */
function stepWords(at: string, step: unknown, [key]: ReadonlyArray<PropertyKey>, route: string, shape: string): string {
  const said = (why: string) => `${route}: ${why} Send ${shape}.`;
  if (key === undefined) return said(`${at} is ${JSON.stringify(step)}, and a step is an object.`);
  if (key === 'name') return said(`${at} has no \`name\`: a step is named by its file, without .md.`);
  const called = `${at} (${String(valueAt(step, ['name']))})`;
  if (key === 'body') return said(`${called} has no \`body\`, what its agent is told, as a string.`);
  if (key === 'spec')
    return said(`${called}'s \`spec\` is ${JSON.stringify(valueAt(step, ['spec']))}, and it is an object of the step's keys.`);
  return said(
    `${called}'s \`own\` is ${JSON.stringify(valueAt(step, ['own']))}, and it is what a step with an agent sets itself: \`{ "keys": ["<key>", …], "body": "<its own note>" }\`, as GET /api/workflows lists it, or null.`,
  );
}

/** A readme that is not text, refused (400): a string, or left out for the README as it is. */
const readmeWords = (readme: unknown, route: string, shape: string): string =>
  `${route}: \`readme\` is the README's text, a string, or left out to leave it as it is — this request's was ${JSON.stringify(readme)}. Send ${shape}.`;

/** Why a POST's body is not a new folder: another place (`yoursOnly`), a name that is not a folder's, its step, its readme. */
function postWords(route: string, repo: string, home: string): Words {
  return ({ path: [key, ...rest], input }: BodyIssue, body: unknown) => {
    const name = valueAt(body, ['name']);
    if (key === 'from')
      return yoursOnly(route, input, typeof name === 'string' ? name : null, repo, home) ?? `${route}: \`from\` is yours.`;
    if (key === 'name') return workflowNameRefusal(input) ?? `${route} takes a JSON object: ${POST_SHAPE}.`;
    if (key === 'step') return stepWords('`step`', valueAt(body, ['step']), rest, route, POST_SHAPE);
    if (key === 'readme') return readmeWords(input, route, POST_SHAPE);
    return `${route} takes a JSON object: ${POST_SHAPE}.`;
  };
}

/** Why a PUT's body is not a folder's steps: another place (`yoursOnly`), no version, its steps, its schemas, its readme. */
function putWords(route: string, name: string, repo: string, home: string): Words {
  return ({ path: [key, i, ...rest], input }: BodyIssue, body: unknown) => {
    if (key === 'from') return yoursOnly(route, input, name, repo, home) ?? `${route}: \`from\` is yours.`;
    if (key === 'version')
      return `${route} takes the \`version\` the folder was read at, as GET /api/workflows lists it, so a save of a folder that has changed since is refused rather than written over what changed. This request's was ${JSON.stringify(input)}: read the folder, then send ${PUT_SHAPE}.`;
    if (key === 'steps' && typeof i === 'number') return stepWords(`step ${i + 1}`, valueAt(body, ['steps', i]), rest, route, PUT_SHAPE);
    if (key === 'steps') return `${route} takes the workflow's steps in \`steps\`, a list: ${PUT_SHAPE}.`;
    if (key === 'schemas' && typeof i === 'number') {
      const schema = valueAt(body, ['schemas', i]);
      const file = valueAt(schema, ['file']);
      const whole = typeof file === 'string' && typeof valueAt(schema, ['text']) === 'string';
      if (whole && rest[0] === 'file') return schemaNameRefusal(file) ?? `${route}: \`${file}\` is not a schema's file.`;
      return `${route}: schema ${i + 1} is ${JSON.stringify(schema)}, and a schema is \`{ "file": "<name>.json", "text": "<a JSON Schema>" }\`. Send ${PUT_SHAPE}.`;
    }
    if (key === 'schemas')
      return `${route}: \`schemas\` is the schemas to write beside the steps, a list, or left out for none — this request's was ${JSON.stringify(input)}. Send ${PUT_SHAPE}.`;
    if (key === 'readme') return readmeWords(input, route, PUT_SHAPE);
    return `${route} takes a JSON object: ${PUT_SHAPE}.`;
  };
}

/** A write of yours, as the guard's refusals word it (guard.ts). */
export const buildGuard = (route: string, does: string, shape: string): Guarded => ({
  route,
  does,
  forAnother: 'write one',
  why: "a workflow's steps are what agents are told and run with in this repository, once a run of it starts",
  reach: "build it on the board's Workflows page",
  instead: "Build it on the board's Workflows page, or edit the folder's files",
  shape,
});

/**
 * Why a write is not one of yours (403 for the repository's, with the copy to make by hand; 400 for anywhere else), or null. The api writes
 * nothing into a checkout: git would show a change nobody typed there, and a run started from the checkout would run it.
 */
export function yoursOnly(route: string, from: unknown, name: string | null, repo: string, home: string): Refusal | null {
  if (from === 'yours') return null;
  if (from === 'repo') return { status: 403, error: repoWriteRefusal(route, 'workflows', name, repo, home) };
  return {
    status: 400,
    error: `${route}: the builder writes yours, at /api/workflows/yours/…, and this request named ${JSON.stringify(from)}.`,
  };
}

/** What a JSON value of each kind is, as a refusal of the wrong one says it. */
const TYPES: Readonly<Record<KeyKind, { is: (value: unknown) => boolean; said: string }>> = (() => {
  const strings = {
    is: (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    said: 'a list of strings, such as ["implement"]',
  };
  const string = { is: (v: unknown) => typeof v === 'string', said: 'a string' };
  const number = { is: (v: unknown) => typeof v === 'number', said: 'a number' };
  return {
    steps: strings,
    list: strings,
    step: string,
    choice: string,
    'harness-word': string,
    text: string,
    schema: { ...string, said: "a string, the schema file's name" },
    count: number,
    dollars: number,
    tokens: number,
    flag: { is: (v: unknown) => typeof v === 'boolean', said: 'true or false' },
  };
})();

/**
 * A step of a request as `writeWorkflow` takes it, or why it is not one (400). Each key the listing has is typed as it lists it, null or
 * left out for unset; whether a value is one the step may have is the package's to say. A key no step has is passed on as it came, so the
 * package refuses it in its words, naming the step. `output` names its file: the schema is the folder's.
 *
 * A step with an agent (`spec.agent`) is written as `agent:`, its own keys and its own note. Sent as the listing has it — `own` with the
 * keys its file sets and its note — a role key `own.keys` does not name is its agent's, and is not written, since written it would pin the
 * agent's value in the step; its wiring is always its own.
 * Sent without `own`, every key it sets is its own and `body` is its note (the package's `StepDraft`, whose `agent` is a name).
 */
function draftOf(step: StepBody, at: string, route: string, shape: string): StepDraft | Refusal {
  const { name, spec = {}, body, own } = step;
  const called = `${at} (${name})`;
  const draft: Record<string, unknown> = { after: [] };
  const mine = spec.agent != null ? (own ?? null) : null;
  for (const [key, value] of Object.entries(spec)) {
    if (value === null || value === undefined) continue;
    const kind = (KINDS as Record<string, KeyKind | undefined>)[key];
    if (kind && !TYPES[kind].is(value)) {
      return {
        status: 400,
        error: `${route}: ${called}'s \`${key}\` is ${TYPES[kind].said}, or null for unset, and this request's was ${JSON.stringify(value)}. Send ${shape}.`,
      };
    }
    if (mine && isRoleKey(key) && !mine.keys.includes(key)) continue;
    draft[key] = key === 'output' ? { file: value } : value;
  }
  return { ...draft, name, body: mine ? mine.body : body } as StepDraft;
}

const isRoleKey = (key: string): boolean => (ROLE_KEYS as readonly string[]).includes(key);

/** A schema a save writes beside the steps: its file's name and its text, as it is written. */
export type SchemaFile = { file: string; text: string };

/**
 * The schemas a PUT carries, or why not: not a list of `{ file, text }` (400), a file that is not a schema's (400, `schemaNameRefusal`) or
 * given twice (400). Each text is written ending in a line break, as a file is. Whether it is a schema a step can name is judged with the
 * steps.
 */
function schemasOf(schemas: typeof PUT_BODY.Type.schemas, route: string): SchemaFile[] | Refusal {
  const out: SchemaFile[] = [];
  for (const schema of schemas ?? []) {
    if (out.some((s) => s.file === schema.file))
      return {
        status: 400,
        error: `${route}: ${schema.file} is given twice, and a file holds one schema. Give it once. Send ${PUT_SHAPE}.`,
      };
    out.push({ file: schema.file, text: schema.text.endsWith('\n') ? schema.text : `${schema.text}\n` });
  }
  return out;
}

/** The steps whose `output:` names `file`, which a refusal of its schema is shown by. */
const namingSchema = (steps: readonly StepDraft[], file: string): string[] =>
  steps.filter((s) => s.output?.file === file).map((s) => s.name);

/**
 * Why the folder at `dir` would not read with `steps` and `schemas` written, or null: each schema a JSON object, then each step rendered
 * and the folder parsed in memory as `writeWorkflow` parses it, with the schemas read as given and every other file as it is on disk. The
 * package's words, naming the steps. A step's name `writeWorkflow` refuses first is left to it (`unnamed`), which writes nothing on it
 * either.
 */
function judgedWith(dir: string, steps: readonly StepDraft[], schemas: readonly SchemaFile[], places: Places): BuildRefused | null {
  for (const { file, text } of schemas) {
    let schema: unknown;
    try {
      schema = JSON.parse(text);
    } catch (err) {
      return {
        error: `${file} is not JSON (${err instanceof Error ? err.message : String(err)}). A schema is a JSON object — \`{ "type": "object", "properties": { … } }\`.`,
        steps: namingSchema(steps, file),
      };
    }
    if (!isObject(schema))
      return {
        error: `${file} is ${JSON.stringify(schema)}, and a schema is a JSON object — \`{ "type": "object", "properties": { … } }\`.`,
        steps: namingSchema(steps, file),
      };
  }
  const given = new Map(schemas.map((s) => [s.file, s.text]));
  const read = (file: string): string | undefined => {
    const pasted = given.get(path.normalize(file));
    if (pasted !== undefined) return pasted;
    try {
      return fs.readFileSync(path.resolve(dir, file), 'utf8');
    } catch {
      return undefined;
    }
  };
  try {
    parseFolder(
      steps.map((step) => [step.name, renderStep(step)] as const),
      read,
      agentsFor(dir, places),
      skillsFor(dir, places),
    );
    return null;
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return {
      error: err.message,
      steps: stepsNamed(
        err.message,
        steps.map((s) => s.name),
      ),
    };
  }
}

/**
 * Whether `writeWorkflow` refuses the steps by their names — none, one not a file's, one twice — before it renders any: its words, not
 * these.
 */
const unnamed = (steps: readonly StepDraft[]): boolean =>
  !steps.length || steps.some((s) => stepNameRefusal(s.name) !== undefined) || new Set(steps.map((s) => s.name)).size < steps.length;

/** A schema as the folder held it before a save wrote it: its text, or undefined where the folder had no such file. */
export type SchemaWas = { file: string; was: string | undefined };

/**
 * The schemas a save wrote put back as the folder held them: removed where it had no such file, and written back where what the file holds
 * now is not what it held. Then a file the failing write never opened is not written to — a read-only one, which putting back would refuse
 * in turn — and one a write truncated and did not finish is put back all the same. `fs.writeFileSync` truncates before it writes, so a
 * write that fails after the open (the disk full, a read that broke) leaves a file shorter than it was, and no bookkeeping of which writes
 * returned can tell. A file gone, or that cannot be read, is written back.
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
    try {
      holds = fs.readFileSync(at, 'utf8');
    } catch {}
    if (holds !== was) fs.writeFileSync(at, was);
  }
}

/** The table's entry a folder of yours is written through, served on both sides. */
const WRITE = COMMANDS.find((c) => c.name === 'workflows write')!;

/**
 * A write of the folder `name` at `dir`, of yours, read as a start on `repo` reads it, through the engine `e`: a change of the folder
 * there (`changes`), handed the version it holds once its schemas are written, or a new one.
 */
type Writing = { e: Engine['Service']; placeService: PlaceService['Service']; name: string; dir: string; repo: string; home: string; changes: boolean };

/**
 * A folder written through the package (`WRITE`, the table's `workflows write`), with the schemas pasted for it, or its refusal (422,
 * with the steps it names), then read back from disk.
 *
 * Judged whole before a byte is written: the steps' names by `writeWorkflow` itself, which refuses them before anything; the schemas and
 * the steps together by `judgedWith`. Then the schemas are written and the folder after them, whose parse now reads them from disk. Should
 * `writeWorkflow` refuse all the same — the folder changed between the two reads — each schema is put back as it was; and so it is when the
 * disk refuses a schema itself, whether it refuses the open (a file read-only among them) or the write after it (the disk full), which
 * leaves the save no more written than a refusal does.
 *
 * Every schema the save has reached is put back, the one it was writing among them, should that write fail, or a later one, or the folder:
 * a write that fails partway has changed the file all the same, so a schema counts as written before its write, not after it.
 */
async function write(
  { e, placeService, name, dir, repo, home, changes }: Writing,
  steps: readonly StepDraft[],
  readme: string | undefined,
  schemas: readonly SchemaFile[] = [],
): Promise<WorkflowSaved | BuildRefused> {
  const places = placesOf(repo, home);
  const refused = (message: string): BuildRefused => ({
    error: message,
    steps: stepsNamed(
      message,
      steps.map((s) => (typeof s.name === 'string' ? s.name : '')),
    ),
  });
  const writing = unnamed(steps) ? [] : schemas;
  if (writing.length) {
    const judged = judgedWith(dir, steps, writing, places);
    if (judged) return judged;
  }
  const before: SchemaWas[] = writing.map(({ file }) => {
    try {
      return { file, was: fs.readFileSync(path.join(dir, file), 'utf8') };
    } catch {
      return { file, was: undefined };
    }
  });
  const schemasWritten = writing.filter((s, i) => s.text !== before[i].was).map((s) => s.file);
  const written: SchemaWas[] = [];
  let result;
  try {
    for (const [i, { file, text }] of writing.entries()) {
      written.push(before[i]);
      fs.writeFileSync(path.join(dir, file), text);
    }
    const args = {
      from: 'yours',
      name,
      draft: JSON.stringify(steps),
      repo,
      ...(readme !== undefined && { readme }),
      ...(changes && { version: workflowVersion(dir, places) }),
    };
    result = (await runPlaced(placeService, e, WRITE.handler(args, undefined, home))) as WorkflowWritten;
  } catch (err) {
    putSchemasBack(dir, written);
    if (err instanceof WorkflowError) return refused(err.message);
    throw err;
  }
  const kept = writing.filter((s) => !schemasWritten.includes(s.file)).map((s) => s.file);
  return {
    workflow: listed(name, 'yours', dir, places, (await loadedOf(e, placeService, [dir], repo, home))[dir]),
    written: [...result.written, ...schemasWritten].sort(),
    kept: [...result.kept, ...kept].sort(),
    removed: result.removed,
  };
}

/**
 * The builder's routes. Each write is guarded (guard.ts) and writes only yours (`yoursOnly`: 403 for the repository's, with the copy to
 * make by hand); the body is refused as `postWords`, `putWords` and `draftOf` say (400), the package's refusal is a 422 with the steps it
 * names (`write`), and anything else a 500.
 *
 * - `GET /api/workflows/keys` — what a step's form is drawn from: the package's keys, in its order, and what each may be set to.
 * - `POST /api/workflows/:from` — a new folder of yours with its first step: `writeWorkflow` on a folder that is not there yet. 409, the
 *   package's refusal, for a name yours has already, a workflow or another file. 201 with the folder read back.
 * - `PUT /api/workflows/:from/:name` — a folder of yours put back from its steps: every step it is to have, as the listing has them, with
 *   the schemas pasted for them. 404 or 409 as `folderOf` says; 409 when the `version` the draft was read at is not what the folder holds
 *   now, since a step edited, added or removed since would be written over — nothing is written. 200 with the folder read back.
 */
export const builder = new Hono<ApiEnv>()
  .get('/api/workflows/keys', (c) => served(c, ({ home }) => c.json(keyForm(home))))
  .post('/api/workflows/:from', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
      const { from } = c.req.param();
      const route = `POST /api/workflows/${from}`;
      const refused = refusedBeforeReading(
        buildGuard(route, 'writes a workflow', POST_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const where = yoursOnly(route, from, null, repo, home);
      if (where) return c.json({ error: where.error }, where.status);
      const read = await readBody(c.req, POST_BODY, `${route} takes a JSON body: ${POST_SHAPE}.`, postWords(route, repo, home));
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const { name, readme } = read.body;
      const step = draftOf(read.body.step, '`step`', route, POST_SHAPE);
      if ('status' in step) return c.json({ error: step.error }, step.status);
      const dir = path.join(home, 'workflows', name);
      const saved = await write({ e, placeService, name, dir, repo, home, changes: false }, [step], readme);
      if ('error' in saved) return c.json(saved, 422);
      return c.json(saved, 201);
    }),
  )
  .put('/api/workflows/:from/:name', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
      const { from, name } = c.req.param();
      const route = `PUT /api/workflows/${from}/${name}`;
      const refused = refusedBeforeReading(
        buildGuard(route, 'writes a workflow', PUT_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const where = yoursOnly(route, from, name, repo, home);
      if (where) return c.json({ error: where.error }, where.status);
      const read = await readBody(c.req, PUT_BODY, `${route} takes a JSON body: ${PUT_SHAPE}.`, putWords(route, name, repo, home));
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const { body } = read;
      const steps: StepDraft[] = [];
      for (const [i, step] of body.steps.entries()) {
        const draft = draftOf(step, `step ${i + 1}`, route, PUT_SHAPE);
        if ('status' in draft) return c.json({ error: draft.error }, draft.status);
        steps.push(draft);
      }
      const schemas = schemasOf(body.schemas, route);
      if ('status' in schemas) return c.json({ error: schemas.error }, schemas.status);
      const folder = folderOf(name, 'yours', repo, home);
      if ('status' in folder) {
        const make = folder.status === 404 ? ` To make a new one, POST /api/workflows/yours with its name and a first step.` : '';
        return c.json({ error: `${folder.error}${make}` }, folder.status);
      }
      const now = workflowVersion(folder.dir, placesOf(repo, home));
      if (now !== body.version) return c.json({ error: workflowStale.write(folder.dir, body.version, now), steps: [] }, 409);
      const saved = await write({ e, placeService, name, dir: folder.dir, repo, home, changes: true }, steps, body.readme, schemas);
      if ('error' in saved) return c.json(saved, 422);
      return c.json(saved, 200);
    }),
  );
