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
import { Effect, Schema } from 'effect';
import { AgentDoor, HARNESS_CHOICES, remoteAgents, SkillDoor, WORKFLOWS_WRITE, workflowVersion } from 'agent-orchestrator';
import {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  AGENTS_FOLDER,
  DEFAULT_HARNESS,
  HARNESSES,
  parseFolder,
  parseWorkflow,
  OVERRIDE_KEYS,
  REMOTE_PREFIX,
  REMOTE_REFUSED_KEYS,
  renderStep,
  STEP_KEY_MEANINGS,
  STEP_KEYS,
  stepNameRefusal,
  WorkflowError,
  type Agents,
  type SkillsFound,
  type StepDraft,
  type StepKey,
} from 'agent-orchestrator/workflow';
import { type Refusal } from '../guard.ts';
import type { Served } from '../layer.ts';
import { STEP_KEY_FORM, type KeyForm, type WorkflowFile } from 'objects';
import { schemaNameRefusal, WORDS, type KeyKind } from './words.ts';
import { listed, loadedAt, loadedOf, placesOf, specOf, type WorkflowListing, type WorkflowStepSpec } from './workflows.ts';

/**
 * The keys a step may take from its agent: the agent's keys but its own (`AGENT_OWN_KEYS`) — its description, the skills it is given
 * and what becomes of Claude Code's own prompt, none of which a step has. A key added to `AGENT_KEYS` that is not a role key joins that
 * list, or the cast fails.
 */
const ROLE_KEYS: readonly StepKey[] = AGENT_KEYS.filter(
  (key): key is Exclude<typeof key, (typeof AGENT_OWN_KEYS)[number]> => !(AGENT_OWN_KEYS as readonly string[]).includes(key),
);

/**
 * Yours' agents as the form reads them, through the Agent door: the names its `agents/` holds (`names`), readable or not — naming a broken
 * one is refused on save, in its words — and each found as a workflow of yours finds it with no other place (`agents`), a refusal kept.
 */
export type YourAgents = { readonly names: readonly string[]; readonly agents: Agents };

/** Yours' agents read through the Agent door: the folder listed, and the agents a workflow of yours alone finds. */
export const yourAgentsRead = (home: string) =>
  Effect.gen(function* () {
    const door = yield* AgentDoor;
    const names = yield* door.agents.list(path.join(home, 'workflows', AGENTS_FOLDER));
    const agents = yield* door.agents.found({ dir: path.join(home, 'workflows', '_') });
    return { names, agents } satisfies YourAgents;
  });

/**
 * What each agent of yours gives a step it is attached to: a step that names it and sets nothing but the `place:` every step says, read by
 * the parser and shown as the listing shows a step, cut to the keys the agent sets. An agent the load refuses gives nothing, and a step
 * saved naming it is refused in its words.
 */
function agentValues(agents: Agents): Record<string, Partial<WorkflowStepSpec>> {
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
 * The harnesses a step may name: the package's, then each remote A2A agent the store declares, as `a2a:<name>` (`remoteAgents`, read afresh
 * under the store's root `home`). An entry the runtime refuses is not offered, and a file refused as it stands offers none of its agents —
 * the form is still drawn, a step already naming one keeps its word, and `nemia start` and `nemia up` say what is wrong with the file.
 */
function harnessChoices(home: string): readonly string[] {
  try {
    return [...HARNESSES, ...[...remoteAgents(home).keys()].map((name) => `${REMOTE_PREFIX}${name}`)];
  } catch {
    return [...HARNESSES];
  }
}

/**
 * What the builder's form is drawn from (`GET /api/workflows/keys`, objects' `KeyForm`): every key a step may set, in the package's order,
 * and the default harness. `roleKeys` are the keys an agent may set (the package's `AGENT_KEYS` but its description), which a step with
 * an agent takes from it unless its file sets them itself: the form shows those as the agent's until one is changed. `policyKeys` are those
 * a step's file sets as its policy over its agent (the package's `OVERRIDE_KEYS`): the fence keys, which only tighten the agent's, and the
 * skills and MCP servers it adds.
 *
 * `agents` are the role values of each agent of yours that loads, as a step's spec gives them and only those it sets: a step attached to
 * one on the board shows its values before the save reads them back, and a step moved from one agent to another shows the other's.
 *
 * `remote` is how a step names a remote A2A agent, `harness: <prefix><name>`, and the keys such a step may not set, which the form leaves
 * off it (`REMOTE_REFUSED_KEYS`). The harness's `choices` offer each agent the store's `a2a-agents.json` declares beside the local
 * harnesses; `byHarness` has none of them, since a remote agent takes none of those words.
 */
export const keyForm = (yours: YourAgents, home: string): KeyForm => ({
  keys: STEP_KEYS.map((key) => ({
    key,
    meaning: STEP_KEY_MEANINGS[key],
    kind: STEP_KEY_FORM[key],
    choices: key === 'harness' ? harnessChoices(home) : key === 'agent' ? [...yours.names] : (WORDS[key] ?? null),
    byHarness: key === 'effort' || key === 'permissionMode' || key === 'sandbox' ? HARNESS_CHOICES[key] : null,
  })),
  defaultHarness: DEFAULT_HARNESS,
  roleKeys: [...ROLE_KEYS],
  policyKeys: [...OVERRIDE_KEYS],
  agents: agentValues(yours.agents),
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
  const [, cycle] = /^these steps wait on each other: (.+)$/.exec(message) ?? [];
  if (cycle !== undefined) return cycle.split(', ').filter((name) => names.includes(name));
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

/**
 * A step as a request sends it, its keys in the order they are refused. Each key of `spec` is typed by its form (objects'
 * `STEP_KEY_FORM`, in `draftOf`), and a key no step has is passed on as it came, for the package to refuse in its words.
 */
const STEP_BODY = Schema.Struct({
  name: Schema.String,
  body: Schema.String,
  spec: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  own: Schema.optionalKey(Schema.NullOr(Schema.Struct({ keys: Schema.Array(Schema.String), body: Schema.String }))),
});
export type StepBody = typeof STEP_BODY.Type;

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
export function draftOf(step: StepBody, at: string, route: string, shape: string): StepDraft | Refusal {
  const { name, spec = {}, body, own } = step;
  const called = `${at} (${name})`;
  const draft: Record<string, unknown> = { after: [] };
  const mine = spec.agent != null ? (own ?? null) : null;
  for (const [key, value] of Object.entries(spec)) {
    if (value === null || value === undefined) continue;
    const kind = (STEP_KEY_FORM as Record<string, KeyKind | undefined>)[key];
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

export const isRoleKey = (key: string): boolean => (ROLE_KEYS as readonly string[]).includes(key);

/** A schema a save writes beside the steps: its file's name and its text, as it is written. */
export type SchemaFile = { file: string; text: string };

/**
 * The schemas a PUT carries, or why not: a file that is not a schema's (400, `schemaNameRefusal`) or given twice (400, its refusal
 * saying the route's `shape`). Each text is written ending in a line break, as a file is. Whether it is a schema a step can name is judged
 * with the steps.
 */
export function schemasOf(schemas: readonly SchemaFile[] | undefined, route: string, shape: string): SchemaFile[] | Refusal {
  const out: SchemaFile[] = [];
  for (const schema of schemas ?? []) {
    const wrong = schemaNameRefusal(schema.file);
    if (wrong !== undefined) return { status: 400, error: `${route}: ${wrong}` };
    if (out.some((s) => s.file === schema.file))
      return {
        status: 400,
        error: `${route}: ${schema.file} is given twice, and a file holds one schema. Give it once. Send ${shape}.`,
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
function judgedWith(
  dir: string,
  steps: readonly StepDraft[],
  schemas: readonly SchemaFile[],
  found: { readonly agents: Agents; readonly skills: SkillsFound },
): BuildRefused | null {
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
      found.agents,
      found.skills,
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
    const holds = heldAt(at);
    if ('unread' in holds || holds.text !== was) fs.writeFileSync(at, was);
  }
}

/** What the file `at` holds now, or why it holds nothing to keep — gone, or not readable — in the disk's words: either is written back. */
function heldAt(at: string): { text: string } | { unread: string } {
  try {
    return { text: fs.readFileSync(at, 'utf8') };
  } catch (err) {
    return { unread: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A write of the folder `name` at `dir`, of yours, read as a start on `repo` reads it, through the engine `e`: a change of the folder
 * there (`changes`), handed the version it holds once its schemas are written, or a new one. The agents and skills its schemas are
 * judged with are read through the doors on the request's services (`inRequest`).
 */
export type Writing = {
  e: Served['e'];
  placeService: Served['placeService'];
  config: Served['config'];
  trace: Served['trace'];
  name: string;
  dir: string;
  repo: string;
  home: string;
  changes: boolean;
  inRequest: Served['inRequest'];
};

/**
 * A folder written through the package (`WORKFLOWS_WRITE`, the table's `workflows write`), with the schemas pasted for it, or its
 * refusal (422, with the steps it names), then read back from disk.
 *
 * Judged whole before a byte is written: the steps' names by `writeWorkflow` itself, which refuses them before anything; the schemas and
 * the steps together by `judgedWith`. Then the schemas are written and the folder after them, whose parse now reads them from disk. Should
 * `writeWorkflow` refuse all the same — the folder changed between the two reads — each schema is put back as it was; and so it is when the
 * disk refuses a schema itself, whether it refuses the open (a file read-only among them) or the write after it (the disk full), which
 * leaves the save no more written than a refusal does.
 *
 * Every schema the save has reached is put back, the one it was writing among them, should that write fail, or a later one, or the folder:
 * a write that fails partway has changed the file all the same, so a schema counts as written before its write, not after it.
 *
 * Given `files`, a Workflow's `spec.files`, they are the whole set of the folder's other text files: carried to the package with the
 * schemas pasted beside them, `whole`, so a text file neither names is removed, and a picture is left.
 */
export async function write(
  { e, placeService, config, trace, name, dir, repo, home, changes, inRequest }: Writing,
  steps: readonly StepDraft[],
  readme: string | undefined,
  schemas: readonly SchemaFile[] = [],
  files?: readonly WorkflowFile[],
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
    const found = await inRequest(
      Effect.all({
        agents: Effect.flatMap(AgentDoor, (door) => door.agents.found({ dir, places })),
        skills: Effect.flatMap(SkillDoor, (door) => door.skills.found({ dir, places })),
      }),
    );
    const judged = judgedWith(dir, steps, writing, found);
    if (judged) return judged;
  }
  const before: Array<SchemaWas & { text: string }> = writing.map(({ file, text }) => {
    try {
      return { file, text, was: fs.readFileSync(path.join(dir, file), 'utf8') };
    } catch {
      return { file, text, was: undefined };
    }
  });
  const schemasWritten = before.filter((s) => s.text !== s.was).map((s) => s.file);
  const written: SchemaWas[] = [];
  let result;
  try {
    for (const { file, text, was } of before) {
      written.push({ file, was });
      fs.writeFileSync(path.join(dir, file), text);
    }
    const input = {
      from: 'yours',
      name,
      draft: [...steps],
      repo,
      ...(readme !== undefined && { readme }),
      ...(changes && { version: await inRequest(workflowVersion(dir, places)) }),
      ...(files !== undefined && { files: [...files, ...writing.map(({ file, text }) => ({ path: file, text }))], whole: true }),
    };
    result = await inRequest(WORKFLOWS_WRITE.handler(input));
  } catch (err) {
    putSchemasBack(dir, written);
    if (err instanceof WorkflowError) return refused(err.message);
    throw err;
  }
  const kept = writing.filter((s) => !schemasWritten.includes(s.file)).map((s) => s.file);
  const unpasted = (file: string) => !writing.some((s) => s.file === file);
  return {
    workflow: listed(
      name,
      'yours',
      dir,
      loadedAt(await loadedOf(e, { placeService, config, trace }, [dir], repo, home), dir),
      await inRequest(workflowVersion(dir, places)),
    ),
    written: [...result.written.filter(unpasted), ...schemasWritten].sort(),
    kept: [...result.kept.filter(unpasted), ...kept].sort(),
    removed: result.removed,
  };
}

/**
 * What the definitions' handlers read of the disk (workflows/, agents/, skills/), kept beside the folder store's other reads until the
 * folder store moves them: when a file was last written (the epoch where it cannot be read), the names of the `.md` files directly in a
 * folder, the folders holding a SKILL.md (a link among them), a SKILL.md's text (none for a link the picker refused, and the disk's words
 * for one it cannot read), and a folder's files by path.
 */
export const writtenAt = (at: string): string => {
  try {
    return fs.statSync(at).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

export const markdownNamesIn = (dir: string): string[] => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.slice(0, -'.md'.length))
      .sort();
  } catch {
    return [];
  }
};

export const skillFoldersIn = (dir: string): string[] => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
};

export const skillTextOf = (dir: string, refused: boolean): { text: string } | { unread: string | null } => {
  try {
    if (refused && fs.lstatSync(dir).isSymbolicLink()) return { unread: null };
    return { text: fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8') };
  } catch (err) {
    return { unread: `${path.join(dir, 'SKILL.md')} cannot be read: ${err instanceof Error ? err.message : String(err)}` };
  }
};

export const filesUnder = (dir: string, under = ''): string[] =>
  fs
    .readdirSync(path.join(dir, under), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? filesUnder(dir, path.join(under, e.name)) : [path.join(under, e.name)]))
    .sort();
