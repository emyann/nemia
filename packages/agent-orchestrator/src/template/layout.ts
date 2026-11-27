/**
 * A factory template's folder, as draft 3 lays it out: its documents' types, the canonical layout as rules over its files' paths
 * (`layoutRefusals`), and what each YAML document must hold, key by key (`documentRefusals`). Pure: the store reads the folder and hands
 * in its paths and each document's data; a refusal points into a document by the keys and indexes that lead to it (`Refusal.at`), and the
 * store turns that into a line.
 */
import { HARNESS_KNOBS } from 'agent-runtime/vocabulary';
import { HARNESS_FENCE_KEYS } from '../harness/harness.ts';
import { SKILL_NAME } from '../keys/index.ts';
import { REVISIONS_POLICIES, type RevisionsPolicy } from '../factory/factory.ts';
import type { TemplateParameterType } from 'objects';
import type { InLayout } from '../../contracts/template-layout.contract.ts';
import type { Expression } from '../../contracts/expression-written.contract.ts';
import { checkFailurePolicyOf } from '../check/index.ts';

/** The version of the template layout, the schema every document of a template is written in: no `apiVersion` objects serve. */
export const TEMPLATE_LAYOUT_VERSION = 'nemia.dev/v1alpha1';

/**
 * A problem of a template: the file, the keys and indexes leading to the value in its document (none for the file), the line and column
 * it stands at in a file that is no document, where it has one, and the words.
 */
export type Refusal = { file: string; at: ReadonlyArray<string | number>; line?: number; col?: number; message: string };

/**
 * A template's folder as read: its name, each file by its path from the folder with `/` between parts, and each document that parsed, by
 * its file, as plain data.
 */
export type ReadFolder = { name: string; files: readonly string[]; documents: ReadonlyMap<string, unknown> };

/** A value given when the template is applied. */
export type ParamRef = { param: string };

/** Text: the words themselves, a file of the folder (`{ path }`), or a parameter's value. A git or url source is not read yet. */
type Text = string | { path: string } | ParamRef;

/**
 * A value the person gives when the template is applied: its type, what it is for, the value taken when they give none, and, for a
 * boolean, the host whose clones set it true when it is a factory's first writable volume (`whenOrigin`, `originParams`), and whether
 * the template asks it of a person applying it (`ask`), never with `whenOrigin`.
 */
export type Parameter = {
  type: TemplateParameterType;
  description: string;
  default?: string | number | boolean;
  whenOrigin?: string;
  ask?: boolean;
};

/**
 * The manifest's spec: the content's version, the factory's instruction and its rules, its parameters, who fills each
 * `<workflow>/<step>`, and whether its runs follow merged revisions (`RevisionsPolicy`, pinned when it says nothing).
 */
export type FactorySpec = {
  version: string;
  instruction?: Text;
  rules?: Text;
  parameters?: Readonly<Record<string, Parameter>>;
  hires: Readonly<Record<string, string>>;
  revisions?: RevisionsPolicy;
  /**
   * The card triggers a factory made from the template has, by name: a label selector over a card's labels, often a parameter's value,
   * and the workflow of the template a card naming none is queued on. One whose selector renders empty is not made (`renderFactory`).
   */
  triggers?: Readonly<Record<string, TemplateTrigger>>;
  /**
   * The values each label key takes on the cards and runs of a factory made from the template, as `key=value` words apart by whitespace,
   * often a parameter's value: a label of such a key written with another value is refused. None where it renders empty.
   */
  labelValues?: string;
  /**
   * The files a branch changes that the team wants shown at decide, each a list of globs apart by whitespace, often a parameter's value:
   * `agentFacing` (read by its agents as instructions), `checkAffecting` (change what its checks judge) and `lessons` (keep what was
   * learned). A list none is named for renders empty and flags nothing.
   */
  radius?: { agentFacing?: string; checkAffecting?: string; lessons?: string };
  /** The workflow of the template a first card on a factory made from it runs in. */
  firstWorkflow?: string;
};

/** A template's card trigger (`FactorySpec.triggers`): its selector, and its target, a workflow of the template. */
type TemplateTrigger = { selector: string; target: { kind: 'Workflow'; name: string } };

/** What each of a template's YAML files is, and the name its document must carry: its folder's, or the template's for the manifest. */
export type DocumentFile = { kind: 'FactoryTemplate' | 'Workflow' | 'Agent' | 'Skill' | 'Program' | 'Lock'; name: string | undefined };

/**
 * The kind of document `file` holds and the name it must carry, or undefined for a file that is not one of the layout's documents.
 * @param file The file's path in the template's folder.
 * @param template The template's name, the name its `nemia.yaml` must carry.
 */
export function documentFile(file: string, template: string) {
  const parts = file.split('/');
  if (file === 'nemia.yaml')
    return { kind: 'FactoryTemplate', name: template } satisfies DocumentFile | undefined as DocumentFile | undefined;
  if (file === 'nemia.lock.yaml') return { kind: 'Lock', name: undefined } satisfies DocumentFile | undefined as DocumentFile | undefined;
  if (parts.length !== 3) return undefined;
  const [holder, name, leaf] = parts;
  if (holder === 'workflows' && leaf === 'workflow.yaml')
    return { kind: 'Workflow', name } satisfies DocumentFile | undefined as DocumentFile | undefined;
  if (holder === 'agents' && leaf === 'agent.yaml')
    return { kind: 'Agent', name } satisfies DocumentFile | undefined as DocumentFile | undefined;
  if (holder === 'skills' && leaf === 'skill.yaml')
    return { kind: 'Skill', name } satisfies DocumentFile | undefined as DocumentFile | undefined;
  if (holder === 'programs' && leaf === 'program.yaml')
    return { kind: 'Program', name } satisfies DocumentFile | undefined as DocumentFile | undefined;
  return undefined;
}

/** The files an agent's folder may hold. */
const AGENT_FILES = ['agent.yaml', 'instructions.md', 'output.schema.json'];

/** The files a template's root may hold. */
const ROOT_FILES = ['nemia.yaml', 'NEMIA.md', 'RULES.md', 'nemia.lock.yaml'];

/** The layout, said once for every refusal of a file outside it. */
const LAYOUT =
  "A template holds nemia.yaml, NEMIA.md, RULES.md and nemia.lock.yaml at its root; workflows/<workflow>/workflow.yaml, its steps' <step>.md, " +
  'README.md and any file that is not .md or .yaml; agents/<agent>/agent.yaml, instructions.md and output.schema.json; ' +
  'skills/<skill>/SKILL.md and anything beside it; programs/<program>/program.yaml; carried/ and any file in it, the files its workflows share; home/ and any file in it, the home its sessions start in; and a file a {path:} names';

/**
 * Whether `rest`, a file's path in a workflow's folder after the folder's name, is one the layout gives it: the workflow's document and a
 * step's note directly in it, and any file that is no `.md` or `.yaml`, at any depth.
 */
const inWorkflow = (rest: string) => {
  const direct = !rest.includes('/');
  return (direct && (rest === 'workflow.yaml' || rest.endsWith('.md'))) || !(rest.endsWith('.md') || rest.endsWith('.yaml'));
};

/**
 * What follows the folder's name in `inHolder`, a file's path under a holder (`workflows/`, `agents/`, `skills/`) after the holder's own
 * `/`: none where the path holds no file of a folder.
 */
const pastFolder = (inHolder: string) => {
  const slash = inHolder.indexOf('/');
  if (slash < 0) return undefined;
  const rest = inHolder.slice(slash).slice(1);
  return rest.length === 0 ? undefined : rest;
};

/**
 * Whether the layout gives `file` a place (the contract `template-layout.contract.ts`); `named` are the files a `{ path }` of a document
 * names. Read by the holder's prefix rather than by splitting the path, which the verifier does not model.
 * @param file The file's path in the template's folder.
 * @param named The files a `{ path }` of a document names.
 * @public
 */
export const inLayout: InLayout = (file, named) => {
  if (named.has(file) || ROOT_FILES.includes(file)) return true;
  if (!file.includes('/')) return false;
  if (file.startsWith('carried/')) return file.length > 'carried/'.length && !file.endsWith('/');
  if (file.startsWith('home/')) return file.length > 'home/'.length && !file.endsWith('/');
  if (file.startsWith('workflows/')) {
    const rest = pastFolder(file.slice('workflows/'.length));
    return rest !== undefined && inWorkflow(rest);
  }
  if (file.startsWith('agents/')) {
    const rest = pastFolder(file.slice('agents/'.length));
    return rest !== undefined && !rest.includes('/') && AGENT_FILES.includes(rest);
  }
  if (file.startsWith('skills/')) return pastFolder(file.slice('skills/'.length)) !== undefined;
  if (file.startsWith('programs/')) return pastFolder(file.slice('programs/'.length)) === 'program.yaml';
  return false;
};

/** The file each folder of a kind must hold, and what the folder is. */
const HOLDS = {
  workflows: ['workflow.yaml', 'a workflow'],
  agents: ['agent.yaml', 'an agent'],
  skills: ['SKILL.md', 'a skill'],
  programs: ['program.yaml', 'a program'],
} as const;

/** What the folders of `files` lack or are misnamed: a folder of workflows/, agents/ or skills/ without its file, or not named a Name. */
function folderRefusals(files: readonly string[]) {
  const folders = new Set(
    files.flatMap((file) => {
      const [holder, name, ...rest] = file.split('/');
      return holder !== undefined && holder in HOLDS && name !== undefined && rest.length > 0 ? [`${holder}/${name}`] : [];
    }),
  );
  return [...folders].flatMap((folder) => {
    const [holder, name] = folder.split('/') as [keyof typeof HOLDS, string];
    const [file, what] = HOLDS[holder];
    const refusals: Refusal[] = [];
    if (!SKILL_NAME.test(name))
      refusals.push({ file: folder, at: [], message: `${folder} is not a name: ${what}'s folder is lowercase words joined by dashes.` });
    if (!files.includes(`${folder}/${file}`))
      refusals.push({
        file: folder,
        at: [],
        message: `${folder} holds no ${file}, and ${what} is its ${file}: write it, or remove the folder.`,
      });
    return refusals;
  });
}

/**
 * What the layout refuses of `folder`'s files: one outside it, a folder of workflows/, agents/ or skills/ without its file or not a name,
 * and a template with no nemia.yaml. `named` are the files a `{ path }` names, each in the layout.
 * @param folder The template's folder, read down to its files.
 * @param named The files a `{ path }` of a document names.
 */
export function layoutRefusals(folder: Pick<ReadFolder, 'files'>, named: ReadonlySet<string>) {
  const outside = folder.files
    .filter((file) => !inLayout(file, named))
    .map((file) => ({ file, at: [], message: `${file} is outside the template's layout. ${LAYOUT}. Move it there, or remove it.` }));
  const manifest = folder.files.includes('nemia.yaml')
    ? []
    : [{ file: 'nemia.yaml', at: [], message: 'the template has no nemia.yaml, its manifest: write one, of kind FactoryTemplate.' }];
  return [...manifest, ...outside, ...folderRefusals(folder.files)];
}

/**
 * A value's leaf kinds: what it must be, a `{ param }` allowed for `words` and `count`, a string for a `flag` (a boolean a parameter
 * writes), and `not-yet` for a git or url source.
 */
type Leaf =
  | 'string'
  | 'number'
  | 'boolean'
  | 'flag'
  | 'strings'
  | 'lines'
  | 'text'
  | 'words'
  | 'count'
  | 'option'
  | 'revisions'
  | 'route'
  | 'policy'
  | 'any'
  | 'not-yet';

/** A document's shape: a leaf, a list of one shape, or named fields, some required, and the shape of any other key (`rest`). */
type Shape =
  | Leaf
  | { readonly list: Shape }
  | { readonly fields: Readonly<Record<string, Shape>>; readonly required?: readonly string[]; readonly rest?: Shape };

/** The fence keys of every harness, the package's one list of them (`harness/harness.ts`), read by the template's shape. */
export { HARNESS_FENCE_KEYS } from '../harness/harness.ts';

/** The keys a harness's block holds. */
export const PROFILE_KEYS = ['model', 'effort', 'context', 'fence', 'options'] as const;

const PROFILE: Shape = {
  fields: {
    model: 'words',
    effort: 'words',
    context: 'words',
    fence: { fields: Object.fromEntries(HARNESS_FENCE_KEYS.map((key) => [key, isList(key) ? 'lines' : 'string'])) },
    options: { fields: {}, rest: 'option' },
  },
};

/** Whether the fence key `key` is a tool list of the harness that takes it. */
function isList(key: string) {
  return Object.values(HARNESS_KNOBS).some((knobs) => knobs.fence.lists.includes(key));
}

/** One block per harness, named as the harness. */
const BLOCKS: Readonly<Record<string, Shape>> = Object.fromEntries(Object.keys(HARNESS_KNOBS).map((harness) => [harness, PROFILE]));

const METADATA: Shape = {
  fields: { name: 'string', description: 'string', labels: { fields: {}, rest: 'string' }, annotations: { fields: {}, rest: 'string' } },
  required: ['name'],
};

const OVERRIDES: Shape = { fields: { harness: 'string', skills: 'strings', mcp: 'strings', ...BLOCKS } };

const STEP: Shape = {
  fields: {
    name: 'string',
    instruction: 'text',
    after: 'strings',
    input: 'strings',
    place: 'string',
    workspace: 'string',
    gate: 'boolean',
    budget: 'count',
    check: 'words',
    checks: {
      list: {
        fields: { name: 'string', run: 'words', condition: 'string', after: 'strings', enabled: 'flag' },
        required: ['name'],
      },
    },
    run: 'words',
    checkMemory: 'string',
    memoryRequest: 'string',
    loop: 'string',
    rounds: 'number',
    routes: 'strings',
    route: 'route',
    ends: 'strings',
    when: 'strings',
    workflow: 'string',
    card: 'string',
    relabel: 'strings',
    waitsFor: 'strings',
    retries: 'number',
    checkFailurePolicy: 'policy',
    deadlineSeconds: 'number',
    memory: 'string',
    reads: 'strings',
    output: { fields: { path: 'string' }, required: ['path'] },
    tally: 'strings',
    overrides: OVERRIDES,
  },
  required: ['name'],
};

/**
 * A machine need a workflow declares (`spec.needs`): its name, what it is, the shell command whose exit 0 says it is in place, the fixes
 * that put it there, each with the answers it asks, the pattern of a code its output shows and its kind (objects' `FIX_KINDS`), the
 * place need it `fills`, and where it is checked (`scope`, objects' `NEED_SCOPES`): the words of both are refused where the need is read.
 */
const NEED: Shape = {
  fields: {
    name: 'string',
    message: 'string',
    check: 'string',
    fixes: {
      list: {
        fields: {
          command: 'string',
          message: 'string',
          asks: { list: { fields: { name: 'string', message: 'string' }, required: ['name', 'message'] } },
          code: 'string',
          kind: 'string',
        },
        required: ['command', 'message'],
      },
    },
    fills: 'string',
    scope: 'string',
  },
  required: ['name', 'message', 'check'],
};

/** Each kind's spec. */
const SPECS: Readonly<Record<Exclude<DocumentFile['kind'], 'Lock'>, Shape>> = {
  FactoryTemplate: {
    fields: {
      version: 'string',
      instruction: 'text',
      rules: 'text',
      parameters: {
        fields: {},
        rest: {
          fields: { type: 'string', description: 'string', default: 'any', whenOrigin: 'string', ask: 'boolean' },
          required: ['type', 'description'],
        },
      },
      hires: { fields: {}, rest: 'string' },
      revisions: 'revisions',
      triggers: {
        fields: {},
        rest: {
          fields: { selector: 'string', target: { fields: { kind: 'string', name: 'string' }, required: ['kind', 'name'] } },
          required: ['selector', 'target'],
        },
      },
      labelValues: 'string',
      radius: { fields: { agentFacing: 'string', checkAffecting: 'string', lessons: 'string' } },
      firstWorkflow: 'string',
      imports: { list: 'not-yet' },
    },
    required: ['version', 'hires'],
  },
  Workflow: { fields: { steps: { list: STEP }, needs: { list: NEED } }, required: ['steps'] },
  Agent: {
    fields: {
      role: 'string',
      description: 'string',
      instructions: 'text',
      skills: 'strings',
      mcp: 'strings',
      overridable: 'strings',
      output: { fields: { path: 'string' }, required: ['path'] },
      harness: 'string',
      ...BLOCKS,
    },
    required: ['role', 'description'],
  },
  Skill: { fields: { fetch: { fields: {}, rest: 'not-yet' } } },
  Program: { fields: { run: 'words', writes: 'strings' }, required: ['run', 'writes'] },
};

/** The shape of a whole document of `kind`. */
const documentShape = (kind: DocumentFile['kind']) =>
  (kind === 'Lock'
    ? { fields: { apiVersion: 'string', kind: 'string', resolved: { list: 'not-yet' } }, required: ['apiVersion', 'kind'] }
    : {
        fields: { apiVersion: 'string', kind: 'string', metadata: METADATA, spec: SPECS[kind] },
        required: ['apiVersion', 'kind', 'metadata', 'spec'],
      }) satisfies Shape as Shape;

/**
 * Whether `value` is a map, as YAML's data model has one: an object that is no list.
 * @param value The value asked of.
 */
export const isMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether `value` is a `{ param }` and nothing more.
 * @param value The value asked of.
 */
export const isParam = (value: unknown): value is ParamRef =>
  isMap(value) && Object.keys(value).length === 1 && typeof value.param === 'string';

/**
 * An expression written inside a string or a text: `${{ parameters.<name> }}`, or
 * `${{ case(parameters.<name>, '<then>', '<otherwise>') }}`, GitHub Actions' `case` limited to one predicate that is a
 * parameter and two single-quoted literals with no quote inside. Spaces inside the braces and the
 * parentheses are optional. A shell's `$VAR` and `${VAR}` are none.
 */
const PARAMETER_EXPRESSION =
  /\$\{\{\s*(?:parameters\.([A-Za-z_][A-Za-z0-9_]*)|case\(\s*parameters\.([A-Za-z_][A-Za-z0-9_]*)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\))\s*\}\}/g;

/** The expression a match of `PARAMETER_EXPRESSION` is. */
const expressionOf = (match: RegExpMatchArray) =>
  match[1] === undefined
    ? ({ kind: 'case', name: match[2] ?? '', then: match[3] ?? '', otherwise: match[4] ?? '' } satisfies Expression)
    : ({ kind: 'plain', name: match[1] } satisfies Expression);

/**
 * Each expression in `text`, with the offset it stands at, in order.
 * @param text The text looked in.
 */
export const expressionsIn = (text: string) =>
  [...text.matchAll(PARAMETER_EXPRESSION)].map((match) => {
    const expression = expressionOf(match);
    return { name: expression.name, index: match.index, expression };
  });

/**
 * `text` with each expression in it replaced by what `write` gives it.
 * @param text The text whose expressions are replaced.
 * @param write What an expression is replaced by, given the expression the parser found.
 */
export const writeExpressions = (text: string, write: (expression: Expression) => string) =>
  text.replace(PARAMETER_EXPRESSION, (...match: string[]) => write(expressionOf(match as unknown as RegExpMatchArray)));

/**
 * A key path as a person reads it: `spec.steps[1].budget`.
 * @param at The key path, each part a key or a list's index.
 */
export const spelled = (at: ReadonlyArray<string | number>) =>
  at.map((part, i) => (typeof part === 'number' ? `[${part}]` : i === 0 ? part : `.${part}`)).join('') || 'the document';

/** Why a source at `at` is not read: v1 carries every file in the folder. */
const notYet = (at: ReadonlyArray<string | number>) =>
  `${spelled(at)} is a git or url source, and a template reads none yet: not yet. Carry the file in the template's folder, and name it {path: <file>}.`;

/** What a text is: words, `{ path: <file> }` or `{ param: <name> }`; a git or url source is not yet. */
function textRefusal(value: unknown, at: ReadonlyArray<string | number>) {
  if (typeof value === 'string' || isParam(value)) return undefined;
  if (isMap(value) && ('git' in value || 'url' in value)) return notYet(at);
  if (isMap(value) && Object.keys(value).length === 1 && typeof value.path === 'string') return undefined;
  return `${spelled(at)} is text: the words themselves, {path: <file>} or {param: <name>}.`;
}

/** Whether `value` is a list of strings. */
const isStrings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Whether `value` is a `{ path }` and nothing more: a file of the template named in a list.
 * @param value The value asked of.
 */
export const isPathItem = (value: unknown): value is { path: string } =>
  isMap(value) && Object.keys(value).length === 1 && typeof value.path === 'string';

/** Whether `value` is a harness's tool list: lines, each a string or a `{ path }` naming a file of the template that holds more. */
const isLines = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string' || isPathItem(item));

/** Whether `value` is a `route:`. */
const isRoute = (value: unknown) => {
  if (value === 'judge') return true;
  if (!isMap(value)) return false;
  const keys = Object.keys(value).sort().join(',');
  if (keys === 'script') return typeof value.script === 'string';
  return (
    keys === 'from,table' &&
    typeof value.from === 'string' &&
    isMap(value.table) &&
    Object.values(value.table).every((route) => typeof route === 'string')
  );
};

/** Whether `value` is a `checkFailurePolicy:` the step's parser reads (`checkFailurePolicyOf`). */
const isPolicy = (value: unknown) => {
  if (!isMap(value)) return false;
  try {
    checkFailurePolicyOf('checkFailurePolicy', JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** What each plain leaf must be, and how it is said. */
const LEAVES: Readonly<Record<Exclude<Leaf, 'text' | 'not-yet'>, [(value: unknown) => boolean, string]>> = {
  string: [(v) => typeof v === 'string', 'a string'],
  number: [(v) => typeof v === 'number', 'a number'],
  boolean: [(v) => typeof v === 'boolean', 'true or false'],
  flag: [(v) => typeof v === 'boolean' || typeof v === 'string', 'true or false, or a string a parameter writes as one'],
  strings: [isStrings, 'a list of strings'],
  lines: [isLines, 'a list of strings and {path: <file>} items, each file a YAML list of strings'],
  words: [(v) => typeof v === 'string' || isParam(v), 'a string or {param: <name>}'],
  count: [(v) => typeof v === 'number' || isParam(v), 'a number or {param: <name>}'],
  option: [(v) => ['string', 'number'].includes(typeof v) || v === true || isStrings(v), 'a string, a number, true or a list of strings'],
  revisions: [(v) => REVISIONS_POLICIES.some((p) => p === v), REVISIONS_POLICIES.join(' or ')],
  route: [isRoute, '`judge`, {script: <file>} or {from: <step>.<field>, table: {<value>: <route>}}'],
  policy: [isPolicy, '{rules: [{action: FailStep|Count, onExitCodes: {operator: In|NotIn, values: [<exit code 1-255>, …]}}, …]}'],
  any: [() => true, 'anything'],
};

/** Why the leaf at `at` is not what `leaf` says, or undefined. */
function leafRefusal(leaf: Leaf, value: unknown, at: ReadonlyArray<string | number>) {
  if (leaf === 'not-yet') return notYet(at);
  if (leaf === 'text') return textRefusal(value, at);
  const [holds, what] = LEAVES[leaf];
  return holds(value) ? undefined : `${spelled(at)} is ${what}, and here it is ${JSON.stringify(value)}.`;
}

/** What a map at `at` breaks of its `fields` shape: a required key missing, a key it has no place for, and each value's own breaks. */
function fieldsRefusals(file: string, shape: Extract<Shape, { fields: unknown }>, value: unknown, at: ReadonlyArray<string | number>) {
  if (!isMap(value)) return [{ file, at, message: `${spelled(at)} is a map of keys, and here it is ${JSON.stringify(value)}.` }];
  const known = Object.keys(shape.fields);
  const missing = (shape.required ?? [])
    .filter((key) => !(key in value))
    .map((key) => ({ file, at, message: `${spelled(at)} has no \`${key}\`, which it requires: write it.` }));
  const each = Object.entries(value).flatMap(([key, held]) => {
    const inner = shape.fields[key] ?? shape.rest;
    if (inner !== undefined) return shapeRefusals(file, inner, held, [...at, key]);
    const message = `${spelled([...at, key])} is no key of ${spelled(at)}, which holds ${known.join(', ')}: rename it, or remove it.`;
    return [{ file, at: [...at, key], message }];
  });
  return [...missing, ...each];
}

/** What `value`, at `at` in `file`, breaks of `shape`. */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
function shapeRefusals(file: string, shape: Shape, value: unknown, at: ReadonlyArray<string | number>): Refusal[] {
  if (typeof shape === 'string') {
    const message = leafRefusal(shape, value, at);
    return message === undefined ? [] : [{ file, at, message }];
  }
  if ('fields' in shape) return fieldsRefusals(file, shape, value, at);
  if (!Array.isArray(value)) return [{ file, at, message: `${spelled(at)} is a list, and here it is ${JSON.stringify(value)}.` }];
  return value.flatMap((item, i) => shapeRefusals(file, shape.list, item, [...at, i]));
}

/** What the envelope of `doc`, a document of `kind` in `file`, breaks: its apiVersion, its kind, and its name, its folder's. */
function envelopeRefusals(file: string, expected: DocumentFile, doc: Record<string, unknown>) {
  const refusals: Refusal[] = [];
  if (doc.apiVersion !== TEMPLATE_LAYOUT_VERSION)
    refusals.push({
      file,
      at: ['apiVersion'],
      message: `apiVersion is ${JSON.stringify(doc.apiVersion)}: write ${TEMPLATE_LAYOUT_VERSION}.`,
    });
  if (doc.kind !== expected.kind)
    refusals.push({
      file,
      at: ['kind'],
      message: `kind is ${JSON.stringify(doc.kind)}, and ${file} holds a ${expected.kind}: write kind: ${expected.kind}.`,
    });
  const name = isMap(doc.metadata) ? doc.metadata.name : undefined;
  if (expected.name === undefined || typeof name !== 'string') return refusals satisfies Refusal[];
  if (!SKILL_NAME.test(name))
    refusals.push({ file, at: ['metadata', 'name'], message: `metadata.name ${name} is not a name: lowercase words joined by dashes.` });
  else if (name !== expected.name)
    refusals.push({
      file,
      at: ['metadata', 'name'],
      message: `metadata.name is ${name}, and a document's name is its folder's: write ${expected.name}, or rename the folder.`,
    });
  return refusals satisfies Refusal[];
}

/**
 * What the document `doc` of `file` breaks, in a template named `template`: a wrong apiVersion or kind, a name not its folder's or not a
 * name, a key the kind has no place for at any level, a value of the wrong type, and a git or url source, refused as not yet.
 * @param file The document's path in the template's folder.
 * @param doc The document as YAML parsed it.
 * @param template The template's name.
 */
export function documentRefusals(file: string, doc: unknown, template: string) {
  const expected = documentFile(file, template);
  if (expected === undefined) return [];
  if (!isMap(doc)) return [{ file, at: [], message: `${file} is not a map of keys: write the document, ${expected.kind}.` }];
  return [...envelopeRefusals(file, expected, doc), ...shapeRefusals(file, documentShape(expected.kind), doc, [])];
}
