/**
 * The workflow builder, for the board: a folder of yours put back from its steps as the Workflows page lists them, a new folder with a first
 * step, a schema beside the steps, and what a step's form is drawn from.
 *
 * A folder is written by the package's `writeWorkflow` (agent-workflows' runner.ts), which judges the whole folder before a byte is written:
 * each refusal is the parser's sentence, naming the step, and the api answers it with a 422 carrying the steps it names (`stepsNamed`), so
 * the board shows it by them. The body's shape is the api's own to refuse (400), and what was written is answered read back from disk
 * (`listed`), never echoed from the request. A schema is the one file `writeWorkflow` never writes, so its PUT is the api's, judged as the
 * folder would read with it before it is written.
 *
 * Yours only: the store's `workflows/`. A write to the repository's is refused (403) with the copy to make by hand, since the api writes nothing
 * into a checkout. Every write passes the guard (guard.ts) before its body is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { HOME, writeWorkflow } from 'agent-workflows';
import { EFFORTS, HARNESSES, isReadme, parseFolder, PERMISSION_MODES, STEP_KEY_MEANINGS, STEP_KEYS, stepNameRefusal, WorkflowError, type StepDraft, type StepKey } from 'agent-workflows/workflow';
import { repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { folderOf, foldersIn, listed, type WorkflowListing } from './workflows.ts';

/**
 * How a key is set on a step's form, which is what its value is in JSON: `steps`, a list of the workflow's steps (`after`, `input`); `step`,
 * one of them (`resume`, `loop`); `choice`, one of `choices` (`harness`); `harness-word`, one of the words the step's harness takes
 * (`byHarness`: `effort`, `permissionMode`); `text`, one line (`model`, `check`); `list`, names (`tools`, `disallow`); `count`, a whole number;
 * `dollars`, an amount; `flag`, `true` or `false` as `choices` has them (`remote`, `gate`); `schema`, a file beside the step (`output`).
 */
export type KeyKind = 'steps' | 'step' | 'choice' | 'harness-word' | 'text' | 'list' | 'count' | 'dollars' | 'flag' | 'schema';

/**
 * Each key's kind, in `STEP_KEYS`' order: a key added to the package without one does not typecheck. `count` is the package's `COUNTS`, which it
 * does not export: `test/builder.test.ts` holds this copy to the parser, which refuses exactly those keys as "not a count".
 */
const KINDS: Readonly<Record<StepKey, KeyKind>> = {
  after: 'steps', resume: 'step', input: 'steps', harness: 'choice', model: 'text', effort: 'harness-word', permissionMode: 'harness-word',
  tools: 'list', disallow: 'list', remote: 'flag', deadlineSeconds: 'count', maxAttempts: 'count', budget: 'dollars', check: 'text',
  retries: 'count', gate: 'flag', output: 'schema', loop: 'step', rounds: 'count',
};

/** What a flag may be set to, as the parser reads it: `remote:` says either, and `gate:` only `true`, since `false` is a step without the line. */
const FLAGS: Readonly<Partial<Record<StepKey, readonly string[]>>> = { remote: ['true', 'false'], gate: ['true'] };

/** The harness a step runs on when it names none, whose words `effort` and `permissionMode` take then. The parser's, which it does not export. */
export const DEFAULT_HARNESS = 'claude';

/** One key of a step's form: the key, the package's line of what it means, how it is set, and the words it may be set to where there are some. */
export type KeyField = { key: StepKey; meaning: string; kind: KeyKind; choices: readonly string[] | null; byHarness: Readonly<Record<string, readonly string[]>> | null };

/** What the builder's form is drawn from (`GET /api/workflows/keys`): every key a step may set, in the package's order, and the default harness. */
export type KeyForm = { keys: KeyField[]; defaultHarness: string };

export const keyForm = (): KeyForm => ({
  keys: STEP_KEYS.map((key) => ({
    key,
    meaning: STEP_KEY_MEANINGS[key],
    kind: KINDS[key],
    choices: key === 'harness' ? HARNESSES : FLAGS[key] ?? null,
    byHarness: key === 'effort' ? EFFORTS : key === 'permissionMode' ? PERMISSION_MODES : null,
  })),
  defaultHarness: DEFAULT_HARNESS,
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

const STEP_SHAPE = '`{ "name": "<step>", "spec": { "after": ["<step>"], "harness": "claude", … }, "body": "<what its agent is told>" }`, as GET /api/workflows lists a step, a key unset as null or left out';
const PUT_SHAPE = `\`{ "steps": [<step>, …], "readme"?: "<README.md>" }\`, each step ${STEP_SHAPE}`;
const POST_SHAPE = `\`{ "name": "<workflow>", "step": <step>, "readme"?: "<README.md>" }\`, the step ${STEP_SHAPE}`;
const SCHEMA_SHAPE = '`{ "text": "<a JSON Schema>" }`';

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
    count: number, dollars: number, flag: { is: (v: unknown) => typeof v === 'boolean', said: 'true or false' },
  };
})();

/**
 * A step of a request as `writeWorkflow` takes it, or why it is not one (400). Each key the listing has is typed as it lists it, null or left
 * out for unset; whether a value is one the step may have is the package's to say. A key no step has is passed on as it came, so the package
 * refuses it in its words, naming the step. `output` names its file: the schema is the folder's.
 */
function draftOf(step: unknown, at: string, route: string, shape: string): StepDraft | Refusal {
  const bad = (why: string): Refusal => ({ status: 400, error: `${route}: ${at} ${why} Send ${shape}.` });
  if (!isObject(step)) return bad(`is ${JSON.stringify(step)}, and a step is an object.`);
  const { name, spec = {}, body } = step;
  if (typeof name !== 'string') return bad(`has no \`name\`: a step is named by its file, without .md.`);
  const called = `${at} (${name})`;
  if (typeof body !== 'string') return { status: 400, error: `${route}: ${called} has no \`body\`, what its agent is told, as a string. Send ${shape}.` };
  if (!isObject(spec)) return { status: 400, error: `${route}: ${called}'s \`spec\` is ${JSON.stringify(spec)}, and it is an object of the step's keys. Send ${shape}.` };
  const draft: Record<string, unknown> = { after: [] };
  for (const [key, value] of Object.entries(spec)) {
    if (value === null || value === undefined) continue;
    const kind = (KINDS as Record<string, KeyKind | undefined>)[key];
    if (kind && !TYPES[kind].is(value)) {
      return { status: 400, error: `${route}: ${called}'s \`${key}\` is ${TYPES[kind].said}, or null for unset, and this request's was ${JSON.stringify(value)}. Send ${shape}.` };
    }
    draft[key] = key === 'output' ? { file: value } : value;
  }
  return { ...draft, name, body } as StepDraft;
}

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

/** A folder written through the package, or its refusal (422, with the steps it names), then read back from disk. */
function write(name: string, dir: string, steps: readonly StepDraft[], readme: string | undefined): WorkflowSaved | BuildRefused {
  let result;
  try {
    result = writeWorkflow(dir, steps, readme);
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message, steps: stepsNamed(err.message, steps.map((s) => (typeof s.name === 'string' ? s.name : ''))) };
    throw err;
  }
  return { workflow: listed(name, 'yours', dir), written: result.written, kept: result.kept, removed: result.removed };
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
    if (!Array.isArray(body.steps)) return c.json({ error: `${route} takes the workflow's steps in \`steps\`, a list: ${PUT_SHAPE}.` }, 400);
    const steps: StepDraft[] = [];
    for (const [i, step] of body.steps.entries()) {
      const draft = draftOf(step, `step ${i + 1}`, route, PUT_SHAPE);
      if ('status' in draft) return c.json({ error: draft.error }, draft.status);
      steps.push(draft);
    }
    const readme = readmeOf(body.readme, route, PUT_SHAPE);
    if ('status' in readme) return c.json({ error: readme.error }, readme.status);
    try {
      const folder = folderOf(name, 'yours', repo, HOME);
      if ('status' in folder) {
        const make = folder.status === 404 ? ` To make a new one, POST /api/workflows/yours with its name and a first step.` : '';
        return c.json({ error: `${folder.error}${make}` }, folder.status);
      }
      const saved = write(name, folder.dir, steps, readme.readme);
      if ('error' in saved) return c.json(saved, 422);
      return c.json(saved, 200);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // A schema beside the steps, which an `output:` names: the one file `writeWorkflow` never writes. Judged as the folder would read with it,
  // when it reads now, so a schema a step already names cannot leave the folder unreadable.
  .put('/api/workflows/:from/:name/schemas/:file', async (c) => {
    const { from, name, file } = c.req.param();
    const route = `PUT /api/workflows/${from}/${name}/schemas/${file}`;
    const refused = refusedBeforeReading(buildGuard(route, "writes a workflow's schema", SCHEMA_SHAPE), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const repo = repoOf();
    const where = yoursOnly(route, from, name, repo);
    if (where) return c.json({ error: where.error }, where.status);
    const nameRefused = schemaNameRefusal(file);
    if (nameRefused) return c.json({ error: nameRefused }, 400);
    const read = await jsonOf(c.req, route, SCHEMA_SHAPE);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { body } = read;
    if (!isObject(body) || typeof body.text !== 'string') return c.json({ error: `${route} takes the schema as text: ${SCHEMA_SHAPE}.` }, 400);
    const text = body.text.endsWith('\n') ? body.text : `${body.text}\n`;
    let schema: unknown;
    try {
      schema = JSON.parse(text);
    } catch (err) {
      return c.json({ error: `${file} is not JSON (${messageOf(err)}). A schema is a JSON object — \`{ "type": "object", "properties": { … } }\` — and nothing was written.`, steps: [] }, 422);
    }
    if (!isObject(schema)) return c.json({ error: `${file} is ${JSON.stringify(schema)}, and a schema is a JSON object — \`{ "type": "object", "properties": { … } }\`. Nothing was written.`, steps: [] }, 422);
    try {
      const folder = folderOf(name, 'yours', repo, HOME);
      if ('status' in folder) return c.json({ error: folder.error }, folder.status);
      const judged = judgedWith(folder.dir, file, text);
      if (judged) return c.json(judged, 422);
      fs.writeFileSync(path.join(folder.dir, file), text);
      return c.json({ file, dir: folder.dir, schemas: listed(name, 'yours', folder.dir).schemas }, 200);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  });

/**
 * Why the folder at `dir` would no longer read with `text` at `file`, in the parser's words, or null: judged only when the folder reads as it
 * is, so a folder already refused for something else is not refused a schema for it.
 */
function judgedWith(dir: string, file: string, text: string): BuildRefused | null {
  const steps = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !isReadme(f)).map((f) => [f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8')] as const);
  const read = (at: string, over?: string) => (f: string): string | undefined => {
    if (over !== undefined && path.normalize(f) === at) return over;
    try { return fs.readFileSync(path.resolve(dir, f), 'utf8'); } catch { return undefined; }
  };
  try {
    parseFolder(steps, read(file));
  } catch {
    return null;
  }
  try {
    parseFolder(steps, read(file, text));
    return null;
  } catch (err) {
    const message = messageOf(err);
    return { error: message, steps: stepsNamed(message, steps.map(([name]) => name)) };
  }
}
