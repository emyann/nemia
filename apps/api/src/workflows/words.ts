/**
 * The words the builder writes by. The names, judged before a byte is written: a workflow's, one folder directly in the store's
 * `workflows/`, and a schema's, a `.json` file directly in that folder, each refusal a sentence naming the fix (400). And what a step's
 * form is drawn from, by key: how each is set (`KeyKind`, `KINDS`) and the words a key of a fixed list may be set to (`WORDS`).
 */
import { AGENTS_FOLDER, DENIALS, PLACES, SLOTS, WORKSPACES, type StepKey } from 'agent-orchestrator/workflow';

/**
 * Why `name` cannot be a folder of yours (400), or undefined: a name the listing would show, one folder directly in the store's
 * `workflows/`.
 */
export function workflowNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its folder is named — dev, say.';
  if (typeof name !== 'string' || !name.trim()) return `A workflow has no name, and a workflow is named by its folder. ${fix}`;
  const as = `\`${name}\` is not a workflow's name:`;
  if (/[\\/]/.test(name)) return `${as} a workflow is one folder in yours, and a slash names a folder inside another. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(name)) return `${as} it holds a control character — ${JSON.stringify(name)}. ${fix}`;
  if (name.startsWith('.'))
    return `${as} a folder whose name starts with a dot is hidden, and the board lists no hidden folder as a workflow. ${fix}`;
  if (name !== name.trim()) return `${as} a name with spaces around it is a folder nobody can type. Write it without them.`;
  if (new TextEncoder().encode(name).length > 255) return `${as} it is longer than a folder's name may be, 255 bytes. ${fix}`;
  if (name === AGENTS_FOLDER)
    return `${as} ${AGENTS_FOLDER}/ is the folder of the agents the workflows beside it name, and its files are agents, not steps. ${fix}`;
  return undefined;
}

/** Why `file` cannot be a schema beside the steps (400), or undefined: a `.json` file directly in the folder, not hidden. */
export function schemaNameRefusal(file: string): string | undefined {
  const fix = 'Name it beside its step — review.schema.json, say.';
  const as = `\`${file}\` is not a schema's file:`;
  if (/[\\/]/.test(file)) return `${as} a schema lives in the workflow's folder, and a slash names a file in another. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(file)) return `${as} it holds a control character — ${JSON.stringify(file)}. ${fix}`;
  if (file.startsWith('.')) return `${as} a file whose name starts with a dot is hidden, and nobody listing the folder sees it. ${fix}`;
  if (!file.endsWith('.json') || file === '.json')
    return `${as} a JSON Schema's file ends in .json, which is what the builder lists beside the steps. ${fix}`;
  if (new TextEncoder().encode(file).length > 255) return `${as} it is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}

/**
 * How a key is set on a step's form, which is what its value is in JSON: `steps`, a list of the workflow's steps (`after`, `input`);
 * `step`, one of them (`resume`, `loop`); `choice`, one of `choices` (`harness`); `harness-word`, one of the words the step's harness takes
 * (`byHarness`: `effort`, `permissionMode`, `sandbox` — a harness absent from `byHarness` takes no such key); `text`, one line (`model`,
 * `check`); `list`, names (`tools`, `disallowedTools`); `count`, a whole number; `dollars`, an amount; `tokens`, a number of tokens, which
 * the form writes as a person does (`context`, `200k`); `flag`, `true` or `false` as `choices` has them (`background`, `remote`, `gate`);
 * `schema`, a file beside the step (`output`). `place` is a `choice` of its words, `git` and `folder`; `workspace` of one, `main`, `slot`
 * of one, `none`, and `denials` of one, `fail`, since a step either says it or says nothing. `agent` is a `choice` of the agents in yours'
 * `agents/`, the only folder the builder writes the steps of.
 */
export type KeyKind = 'steps' | 'step' | 'choice' | 'harness-word' | 'text' | 'list' | 'count' | 'dollars' | 'tokens' | 'flag' | 'schema';

/**
 * Each key's kind, in `STEP_KEYS`' order: a key added to the package without one does not typecheck. `count` is the package's `COUNTS`,
 * which it does not export: `builder.test.ts` holds this copy to the parser, which refuses exactly those keys as "not a count".
 */
export const KINDS: Readonly<Record<StepKey, KeyKind>> = {
  after: 'steps',
  resume: 'step',
  input: 'steps',
  place: 'choice',
  workspace: 'choice',
  writable: 'list',
  reads: 'list',
  slot: 'choice',
  agent: 'choice',
  skills: 'list',
  mcp: 'list',
  harness: 'choice',
  model: 'text',
  effort: 'harness-word',
  context: 'tokens',
  permissionMode: 'harness-word',
  sandbox: 'harness-word',
  tools: 'list',
  disallowedTools: 'list',
  allowedTools: 'list',
  denials: 'choice',
  background: 'flag',
  remote: 'flag',
  deadlineSeconds: 'count',
  budget: 'dollars',
  check: 'text',
  retries: 'count',
  gate: 'flag',
  output: 'schema',
  tally: 'list',
  loop: 'step',
  rounds: 'count',
};

/** A flag that says either word. */
const EITHER = ['true', 'false'] as const;

/**
 * What a flag may be set to, as the parser reads it: `background:` and `remote:` say either, and `gate:` only `true`, since `false` is a
 * step without the line.
 */
const FLAGS: Readonly<Partial<Record<StepKey, readonly string[]>>> = { background: EITHER, remote: EITHER, gate: ['true'] };

/** The words a key of a fixed list may be set to, the flags' among them; the harness and the agent are offered as the store has them. */
export const WORDS: Readonly<Partial<Record<StepKey, readonly string[]>>> = {
  ...FLAGS,
  place: PLACES,
  workspace: WORKSPACES,
  slot: SLOTS,
  denials: DENIALS,
};
