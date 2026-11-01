/**
 * `nemia template lint`'s judgement of a folder already read (`ReadFolder`): the layout's and each document's rules (`layout.ts`), then
 * what the folder's parts say of each other — a hire, a skill, a sibling step, a parameter or a file named that the folder lacks — and
 * each harness's block against the words the runtime gives that harness (`HARNESS_KNOBS`). Pure: every problem comes back at once.
 */
import { HARNESS_KNOBS } from 'agent-runtime/vocabulary';
import { DEFAULT_HARNESS, isRemoteHarness, REMOTE_PREFIX } from '../harness/harness.ts';
import { givenSkillOf, PLACES, STORE_READS, WORKSPACES } from '../keys/index.ts';
import { baseSpelled } from '../former/former.ts';
import {
  documentFile,
  documentRefusals,
  FENCE_KEYS,
  isMap,
  isParam,
  layoutRefusals,
  PROFILE_KEYS,
  spelled,
  type ReadFolder,
  type Refusal,
} from './layout.ts';

/** A key path into a document. */
type At = ReadonlyArray<string | number>;

/** A workflow of the folder: its file, and its steps' data by index. */
type ReadWorkflow = { file: string; steps: ReadonlyArray<Record<string, unknown>> };

/** What the folder holds, by name: its workflows, its agents' specs, its skills, the manifest's spec and its parameters. */
type Held = {
  workflows: ReadonlyMap<string, ReadWorkflow>;
  agents: ReadonlyMap<string, Record<string, unknown>>;
  skills: ReadonlySet<string>;
  manifest: Record<string, unknown>;
  parameters: ReadonlySet<string>;
};

/** The spec of the document in `file`, a map, or an empty one where it is not. */
const specOf = (folder: ReadFolder, file: string): Record<string, unknown> => {
  const doc = folder.documents.get(file);
  return isMap(doc) && isMap(doc.spec) ? doc.spec : {};
};

/** The names of the folders of `holder` (`workflows`, `agents`, `skills`) in `files`. */
const foldersOf = (files: readonly string[], holder: string): string[] => [
  ...new Set(files.flatMap((file) => (file.startsWith(`${holder}/`) && file.split('/').length > 2 ? [file.split('/')[1]] : []))),
];

/** What `folder` holds, read off its files and documents; `placeSkills` count as skills it holds. */
function heldOf(folder: ReadFolder, placeSkills: readonly string[]): Held {
  const workflows = new Map(
    foldersOf(folder.files, 'workflows').map((name): [string, ReadWorkflow] => {
      const file = `workflows/${name}/workflow.yaml`;
      const steps = specOf(folder, file).steps;
      return [name, { file, steps: Array.isArray(steps) ? steps.map((step) => (isMap(step) ? step : {})) : [] }];
    }),
  );
  const agents = new Map(foldersOf(folder.files, 'agents').map((name) => [name, specOf(folder, `agents/${name}/agent.yaml`)]));
  const manifest = specOf(folder, 'nemia.yaml');
  return {
    workflows,
    agents,
    skills: new Set([...foldersOf(folder.files, 'skills'), ...placeSkills]),
    manifest,
    parameters: new Set(isMap(manifest.parameters) ? Object.keys(manifest.parameters) : []),
  };
}

/** The strings of a list, by index; none where it is no list. */
const stringsOf = (value: unknown): Array<[string, number]> =>
  Array.isArray(value) ? value.flatMap((item, i): Array<[string, number]> => (typeof item === 'string' ? [[item, i]] : [])) : [];

/** What a hire of the manifest names that the folder lacks: a workflow, a step of it, or an agent. */
function hireRefusals(held: Held): Refusal[] {
  const hires = isMap(held.manifest.hires) ? held.manifest.hires : {};
  return Object.entries(hires).flatMap(([key, agent]): Refusal[] => {
    const at = ['spec', 'hires', key];
    const [workflow, step, ...more] = key.split('/');
    const read = held.workflows.get(workflow);
    const refusals: string[] = [];
    if (step === undefined || more.length) refusals.push(`hire ${key} is not <workflow>/<step>: name the step it fills.`);
    else if (!read) refusals.push(`hire ${key} names no workflow of workflows/: ${workflow} is not there.`);
    else if (!read.steps.some((s) => s.name === step)) refusals.push(`hire ${key} names no step of ${workflow}: ${step} is not there.`);
    if (typeof agent === 'string' && !held.agents.has(agent))
      refusals.push(`hire ${key} names ${agent}, no agent of agents/: write agents/${agent}/agent.yaml, or hire one there is.`);
    return refusals.map((message) => ({ file: 'nemia.yaml', at, message }));
  });
}

/**
 * What a list of skills at `at` names that the folder lacks and no place skill is; a skill named with its folder (`givenSkillOf`) is
 * the repository's a run is started on, which a template names and never carries, and passes.
 */
const skillRefusals = (file: string, at: At, skills: unknown, held: Held): Refusal[] =>
  stringsOf(skills)
    .filter(([name]) => !held.skills.has(name) && givenSkillOf(name)?.folder === undefined)
    .map(([name, i]) => ({
      file,
      at: [...at, i],
      message: `skill ${name} is not in skills/, nor a place skill: carry it as skills/${name}/SKILL.md, or name one there is.`,
    }));

/** The agent hired into `<workflow>/<step>`: its spec, or an empty one where none is. */
const hiredOf = (held: Held, workflow: string, step: unknown): Record<string, unknown> => {
  const hires = isMap(held.manifest.hires) ? held.manifest.hires : {};
  const agent = hires[`${workflow}/${String(step)}`];
  return (typeof agent === 'string' && held.agents.get(agent)) || {};
};

/** What a step's sibling names (`after:`, `input:`, `loop:`) name that its workflow lacks. */
function siblingRefusals(file: string, at: At, step: Record<string, unknown>, names: readonly unknown[]): Refusal[] {
  const named = [
    ...stringsOf(step.after).map(([name, i]): [string, At] => [name, [...at, 'after', i]]),
    ...stringsOf(step.input).map(([name, i]): [string, At] => [name, [...at, 'input', i]]),
    ...(typeof step.loop === 'string' ? [[step.loop, [...at, 'loop']] as [string, At]] : []),
  ];
  return named
    .filter(([name]) => !names.includes(name) || name === step.name)
    .map(([name, where]) => ({
      file,
      at: where,
      message: `${spelled(where)} names ${name}, no other step of this workflow: name a sibling.`,
    }));
}

/**
 * What a step's own words name that today's are not: its place, workspace — `main` read as its former spelling of `base` (`baseSpelled`) —
 * what it reads of the store, and the form of its tallies.
 */
function wordRefusals(file: string, at: At, step: Record<string, unknown>): Refusal[] {
  const refusals: Refusal[] = [];
  const among = (key: string, value: unknown, words: readonly string[], where: At): void => {
    if (typeof value === 'string' && !words.includes(value))
      refusals.push({ file, at: where, message: `${spelled(where)} is ${value}, and ${key} is one of ${words.join(', ')}.` });
  };
  among('place', step.place, PLACES, [...at, 'place']);
  among(
    'workspace',
    baseSpelled({ workspace: step.workspace as string | undefined }).workspace,
    ['worktree', ...WORKSPACES],
    [...at, 'workspace'],
  );
  for (const [name, i] of stringsOf(step.reads)) among('reads', name, STORE_READS, [...at, 'reads', i]);
  for (const [entry, i] of stringsOf(step.tally))
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*(?:=[^=\s]+)?)?$/.test(entry))
      refusals.push({
        file,
        at: [...at, 'tally', i],
        message: `${spelled([...at, 'tally', i])} is ${entry}, none of a field, field.flag and field.key=value of the closeout.`,
      });
  return refusals;
}

/** What each step of each workflow breaks: a name used twice, a sibling it lacks, its words, its skills and its blocks. */
function stepRefusals(held: Held): Refusal[] {
  return [...held.workflows].flatMap(([workflow, { file, steps }]) => {
    const names = steps.map((step) => step.name);
    return steps.flatMap((step, i): Refusal[] => {
      const at = ['spec', 'steps', i];
      const twice = names.indexOf(step.name) !== i;
      const overrides = isMap(step.overrides) ? step.overrides : {};
      const hired = hiredOf(held, workflow, step.name);
      return [
        ...(twice
          ? [{ file, at: [...at, 'name'], message: `step ${String(step.name)} is named twice in ${workflow}: name each once.` }]
          : []),
        ...siblingRefusals(file, at, step, names),
        ...wordRefusals(file, at, step),
        ...skillRefusals(file, [...at, 'overrides', 'skills'], overrides.skills, held),
        ...harnessRefusals(file, [...at, 'overrides'], overrides, typeof hired.harness === 'string' ? hired.harness : undefined),
      ];
    });
  });
}

/** What a workflow's folder holds as a step's file (`<step>.md`) that names no step of it. */
function stepFileRefusals(folder: ReadFolder, held: Held): Refusal[] {
  return folder.files.flatMap((file) => {
    const [holder, workflow, leaf, ...more] = file.split('/');
    if (holder !== 'workflows' || more.length || !leaf?.endsWith('.md') || /^readme\.md$/i.test(leaf)) return [];
    const step = leaf.slice(0, -'.md'.length);
    if (held.workflows.get(workflow)?.steps.some((s) => s.name === step)) return [];
    return [{ file, at: [], message: `${file} names no step of ${workflow}: name the step in its workflow.yaml, or remove the file.` }];
  });
}

/** What an agent breaks: a skill the folder lacks, and its blocks. */
const agentRefusals = (held: Held): Refusal[] =>
  [...held.agents].flatMap(([name, spec]) => {
    const file = `agents/${name}/agent.yaml`;
    return [...skillRefusals(file, ['spec', 'skills'], spec.skills, held), ...harnessRefusals(file, ['spec'], spec, undefined)];
  });

/**
 * What the harness and blocks of `holder`, an agent's spec or a step's overrides at `at`, break: a harness that is none, any block where
 * the harness is an `a2a:` agent, and each block against its harness's knobs (`profileRefusals`). `inherited` is the harness of the agent
 * a step hires, read where its overrides name none.
 */
function harnessRefusals(file: string, at: At, holder: Record<string, unknown>, inherited: string | undefined): Refusal[] {
  const written = holder.harness;
  const refusals: Refusal[] = [];
  const names = Object.keys(HARNESS_KNOBS);
  if (written !== undefined && (typeof written !== 'string' || !(names.includes(written) || /^a2a:[a-z0-9-]+$/.test(written))))
    refusals.push({
      file,
      at: [...at, 'harness'],
      message: `harness ${JSON.stringify(written)} is no harness: one of ${names.join(', ')}, or ${REMOTE_PREFIX}<agent>.`,
    });
  const harness = typeof written === 'string' ? written : (inherited ?? DEFAULT_HARNESS);
  for (const block of names.filter((name) => name in holder)) {
    if (isRemoteHarness(harness))
      refusals.push({
        file,
        at: [...at, block],
        message: `${spelled([...at, block])} is a block for ${block}, and the harness is ${harness}: a remote agent picks its own model and fences itself. Remove the block.`,
      });
    else if (isMap(holder[block])) refusals.push(...profileRefusals(file, [...at, block], block, holder[block]));
  }
  return refusals;
}

/** Why the fence key `key`, valued `value`, is not one of `harness`'s fence, or undefined: another harness's key, or a word it lacks. */
function fenceRefusal(harness: string, key: string, value: unknown): string | undefined {
  const fence = HARNESS_KNOBS[harness].fence;
  if (key === fence.key)
    return typeof value === 'string' && !fence.words.includes(value)
      ? `${value} is no word ${harness} fences by: one of ${fence.words.join(', ')}.`
      : undefined;
  if (fence.lists.includes(key)) return undefined;
  return `${harness} is fenced by ${[fence.key, ...fence.lists].join(', ')}, and ${key} is another harness's fence key: remove it.`;
}

/** What `profile`, the block of `harness` at `at`, breaks of its harness's knobs: its effort, context, fence and options. */
function profileRefusals(file: string, at: At, harness: string, profile: Record<string, unknown>): Refusal[] {
  const knobs = HARNESS_KNOBS[harness];
  const refusals: Refusal[] = [];
  const refuse = (where: At, message: string | undefined): void => {
    if (message !== undefined) refusals.push({ file, at: where, message: `${spelled(where)}: ${message}` });
  };
  if (typeof profile.effort === 'string' && !knobs.effort.includes(profile.effort))
    refuse([...at, 'effort'], `${profile.effort} is no effort ${harness} knows: one of ${knobs.effort.join(', ')}.`);
  if ('context' in profile && !knobs.context) refuse([...at, 'context'], `${harness} takes no context window: remove it.`);
  for (const [key, value] of Object.entries(isMap(profile.fence) ? profile.fence : {}))
    refuse([...at, 'fence', key], fenceRefusal(harness, key, value));
  for (const key of Object.keys(isMap(profile.options) ? profile.options : {}))
    refuse([...at, 'options', key], optionRefusal(harness, key));
  return refusals;
}

/** Why `key` may not be an option of `harness`'s block: a fence key, a key of the block, a flag the runtime sets, or one unread. */
function optionRefusal(harness: string, key: string): string | undefined {
  const flags = HARNESS_KNOBS[harness].flags;
  if (FENCE_KEYS.includes(key)) return `${key} is a fence key, read by nemia: write it under fence, never in options.`;
  if ((PROFILE_KEYS as readonly string[]).includes(key)) return `${key} is a key of the block: write it beside options, never in it.`;
  if ('owned' in flags && flags.owned.includes(key)) return `${key} is a flag the runtime sets itself: remove it.`;
  if ('only' in flags && !flags.only.includes(key))
    return `the runtime reads only ${flags.only.join(', ')} of ${harness}'s options, and ${key} is none of them: remove it.`;
  return undefined;
}

/** Every `{ param }` and every `{ path }` in `value`, each where it stands. */
function refsIn(value: unknown, at: At, found: { params: Array<[string, At]>; paths: Array<[string, At]> }): void {
  if (isParam(value)) found.params.push([value.param, at]);
  else if (isMap(value) && Object.keys(value).length === 1 && typeof value.path === 'string') found.paths.push([value.path, at]);
  else if (Array.isArray(value)) value.forEach((item, i) => refsIn(item, [...at, i], found));
  else if (isMap(value)) for (const [key, held] of Object.entries(value)) refsIn(held, [...at, key], found);
}

/** The files `{ path }` names in the folder's documents, those inside it, each as the layout reads a path. */
const namedPaths = (folder: ReadFolder): Set<string> =>
  new Set(
    [...folder.documents.values()].flatMap((doc) => {
      const found = { params: [], paths: [] as Array<[string, At]> };
      refsIn(doc, [], found);
      return found.paths.map(([path]) => path).filter((path) => !pathRefusal(path));
    }),
  );

/** Why a `{ path }` is no file of a folder: absolute, or leaving it by `..`. */
const pathRefusal = (path: string): string | undefined =>
  path.startsWith('/') || path.split('/').includes('..') || path === ''
    ? `${path} is not a file of the template: a path is relative to its root, never absolute, never through ..`
    : undefined;

/** What each document's `{ param }` and `{ path }` name that the folder lacks: a parameter the manifest does not declare, or a file. */
function refRefusals(folder: ReadFolder, held: Held): Refusal[] {
  return [...folder.documents].flatMap(([file, doc]) => {
    const found = { params: [] as Array<[string, At]>, paths: [] as Array<[string, At]> };
    refsIn(doc, [], found);
    const params = found.params
      .filter(([name]) => !held.parameters.has(name))
      .map(([name, at]) => ({
        file,
        at,
        message: `${spelled(at)} names the parameter ${name}, which nemia.yaml does not declare: declare it under spec.parameters.`,
      }));
    const paths = found.paths.flatMap(([path, at]) => {
      const why =
        pathRefusal(path) ??
        (folder.files.includes(path) ? undefined : `${path} is not in the template: carry the file, or name one there is.`);
      return why === undefined ? [] : [{ file, at, message: `${spelled(at)}: ${why}` }];
    });
    return [...params, ...paths];
  });
}

/**
 * Every problem of the template `folder`, by file in order: the layout's and each document's (`layout.ts`), a hire, skill, sibling step,
 * parameter or file named that the folder lacks, a step's words, and each harness's block against the runtime's knobs for it.
 * `placeSkills`: nemia's builtin place skills, each a skill the folder need not carry. None for a template that passes.
 */
export function checkTemplate(folder: ReadFolder, placeSkills: readonly string[]): Refusal[] {
  const held = heldOf(folder, placeSkills);
  const documents = [...folder.documents].flatMap(([file, doc]) =>
    documentFile(file, folder.name) ? documentRefusals(file, doc, folder.name) : [],
  );
  const all = [
    ...layoutRefusals(folder, namedPaths(folder)),
    ...documents,
    ...hireRefusals(held),
    ...agentRefusals(held),
    ...stepRefusals(held),
    ...stepFileRefusals(folder, held),
    ...refRefusals(folder, held),
  ];
  return all.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}
