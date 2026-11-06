/**
 * A factory's hires as objects (`Hire`, `HireList`, from `objects`), in the factory's namespace: one per step of each workflow the
 * factory offers — those it attaches, every one found for the default factory — named `<workflow>.<step>` (`hireNamed`), in its tree's
 * `workflows/` first where it was made from a template, then its repository's and the store's. A Hire's spec says the step and the agent
 * the factory hires into it; its status the step as the folder resolves it with the factory's fills (`hireStatusOf`): who fills it, the
 * step's own `agent:` before the hire (`fillOrigin`), and where each setting came from (`settingOrigin`). A step whose own file names an
 * agent the factory hires one into too is read with its own, and refused (`refused`). Two steps whose names join to one name are both
 * listed, each with `status.error` naming the other, and neither is read or written by it: `Conflict`, naming both and the fix. A
 * workflow whose folder does not read is listed by its step files, each Hire's error saying why.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { API_VERSION, type Hire, type HireList, HireSettings } from 'objects';
import { workflowDirAt } from '../folder/folder.store.ts';
import type { Fills } from '../folder/folder.ts';
import { fillsOf, type Factory } from '../factory/factory.ts';
import { hireNamed, hiresCollided, hireStatusOf, type HiredStep, type HireRead } from '../hire/hire.ts';

/** The settings a Hire says the origin of, as `objects` names them. */
const SETTING_KEYS: readonly string[] = Object.keys(HireSettings.fields);
import { Conflict, type Invalid, Missing } from '../refusal/refusal.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { factoryFiled, objectsListed, versionOf, type ObjectQuery } from './factory.verb.ts';

/** A factory as a Hire reads it: its name, its hires, its workflows (none for every one found), its tree and repository. */
export type HiringFactory = Pick<Factory, 'name' | 'hires' | 'tree'> & {
  readonly workflows?: readonly string[] | undefined;
  readonly repo: string;
  readonly harnessSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
};

/** A step as the door reads it: its name, its agent's provenance, and each setting it resolved. */
type StepRead = {
  readonly name: string;
  readonly agent?: { name: string; keys: readonly string[]; given: Readonly<Record<string, unknown>> };
};

/** The value of `key` the step `step` resolved. */
const valueOf = (step: StepRead, key: string) =>
  (step as unknown as Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>)[key];

/** What a Hire reads of one step: its own `agent:` (`written`, off the read with no hire), and the step as the factory fills it. */
const readOf = (written: StepRead, filled: StepRead, hired: string | undefined, f: HiringFactory, error?: string): HireRead => {
  const agent = filled.agent;
  return {
    written: written.agent?.name,
    hired,
    values: Object.fromEntries(SETTING_KEYS.map((k) => [k, valueOf(filled, k)])),
    stepSets: agent === undefined ? SETTING_KEYS.filter((k) => valueOf(filled, k) !== undefined) : agent.keys,
    agentGives: agent === undefined ? [] : SETTING_KEYS.filter((k) => agent.given[k] !== undefined),
    harnessSettings: f.harnessSettings,
    error,
  };
};

/** The refusal of a step its own file and the factory's hire both fill: it names the fix. */
const bothFill = (f: HiringFactory, workflow: string, step: string, written: string, hired: string): string =>
  `the step ${step} of ${workflow} names its own agent, ${written}, and the factory ${f.name} hires ${hired} into it too, which a start refuses: fire the hire with nemia factory fire ${f.name} --step ${workflow}/${step}, or take the agent: line out of the step`;

/** The steps of the folder `dir` by their files, for a folder that does not read: each markdown file but its README. */
const stepFiles = (dir: string): StepRead[] => {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .sort()
      .map((f) => ({ name: f.slice(0, -'.md'.length) }));
  } catch {
    return [];
  }
};

/** What a read through the door answered: its steps, or why it refused. */
const readOrWhy = <E extends { readonly message: string }>(read: Effect.Effect<readonly StepRead[], E>) =>
  read.pipe(
    Effect.map((steps): { steps: readonly StepRead[]; why: string | undefined } => ({ steps, why: undefined })),
    Effect.catch((err: E) => Effect.succeed({ steps: [] as readonly StepRead[], why: err.message })),
  );

/**
 * The Hires of the workflow `workflow`, in the folder `dir`, read through the Workflow door with the factory `f`'s fills. A folder that
 * does not read is listed by its files all the same, each Hire's error saying why; a step whose hire does not read, with why.
 */
const workflowHires = Effect.fn('workflowHires')(function* (f: HiringFactory, home: string, workflow: string, dir: string) {
  const door = yield* WorkflowDoor;
  const at = workflowDirAt(dir);
  const places = { repo: f.repo, home };
  const own = yield* readOrWhy(door.workflows.read(at, places) as Effect.Effect<readonly StepRead[], { readonly message: string }>);
  const steps = own.why === undefined ? own.steps : stepFiles(dir);
  const hires = fillsOf(f.hires, workflow);
  const fills: Fills = {
    factory: f.name,
    workflow,
    agents: Object.fromEntries(Object.entries(hires).filter(([step]) => steps.find((s) => s.name === step)?.agent === undefined)),
  };
  const filled =
    own.why === undefined
      ? yield* readOrWhy(door.workflows.read(at, places, fills) as Effect.Effect<readonly StepRead[], { readonly message: string }>)
      : own;
  return steps.map((step) => {
    const hired = hires[step.name];
    const both = step.agent !== undefined && hired !== undefined ? bothFill(f, workflow, step.name, step.agent.name, hired) : undefined;
    const why = own.why ?? (hired === undefined ? undefined : filled.why);
    const read = filled.steps.find((s) => s.name === step.name) ?? step;
    return { workflow, step: step.name, hired, read: readOf(step, read, hired, f, both ?? why) };
  });
});

/** The folders beside the workflows that hold none: the agents and the skills they share. */
const NO_WORKFLOW: readonly string[] = ['agents', 'skills'];

/** The workflows `f` offers, each by its name to its folder: its tree's first, then its repository's, then the store's, each once. */
const offered = Effect.fn('offered')(function* (f: HiringFactory, home: string) {
  const door = yield* WorkflowDoor;
  const holders = [...(f.tree === undefined ? [] : [f.tree]), f.repo, home].map((at) => path.join(at, 'workflows'));
  const found = new Map<string, string>();
  for (const holder of holders)
    for (const name of yield* door.workflows.list(holder).pipe(Effect.orElseSucceed(() => [] as readonly string[])))
      if (!NO_WORKFLOW.includes(name) && !found.has(name) && (f.workflows === undefined || f.workflows.includes(name)))
        found.set(name, path.join(holder, name));
  return found;
});

/** The error of a step whose name joins to another's: it names both, and the fix. */
const collided = (namespace: string, name: string, held: readonly HiredStep[]): string =>
  `the Hire ${name} of ${namespace} names ${held.map((s) => `the step ${s.step} of ${s.workflow}`).join(' and ')}, whose names join to one: rename one of the steps, or one of the workflows, so that no two join to ${name}`;

/** The Hires of the factory `f`, at the store `home`, filed at `filedAt`, each a step it offers. */
export const hiresOf = Effect.fn('hiresOf')(function* (f: HiringFactory, home: string, filedAt: string) {
  const read = [];
  for (const [workflow, dir] of yield* offered(f, home))
    read.push(...(yield* workflowHires(f, home, workflow, dir).pipe(Effect.orElseSucceed(() => []))));
  const collisions = hiresCollided(read);
  return read.map(({ workflow, step, hired, read: r }): Hire => {
    const name = hireNamed(workflow, step);
    const held = collisions.get(name);
    const spec: Hire['spec'] = { workflow, step, ...(hired === undefined ? {} : { agent: hired }) };
    const status = hireStatusOf(held === undefined ? r : { ...r, error: collided(f.name, name, held) }, SETTING_KEYS);
    return {
      apiVersion: API_VERSION,
      kind: 'Hire',
      metadata: { name, namespace: f.name, creationTimestamp: filedAt, resourceVersion: versionOf(spec, status) },
      spec,
      status,
    };
  });
});

/** The factory `namespace` as a Hire reads it, the default on `repo`; `Missing` where no factory has the name. */
const hiringOf = Effect.fn('hiringOf')(function* (home: string, repo: string, namespace: string) {
  const { factory: object, listing } = yield* factoryFiled(home, repo, namespace);
  const tree = listing !== undefined && !('error' in listing) ? listing.tree : undefined;
  const factory: HiringFactory = {
    name: namespace,
    hires: { ...object.spec.hires },
    ...(tree === undefined ? {} : { tree }),
    workflows: object.spec.workflows,
    repo: object.spec.repos[0] ?? repo,
    harnessSettings: object.spec.harnessSettings,
  };
  return { factory, filedAt: object.metadata.creationTimestamp };
});

/** A page of the Hires of the factory `namespace` (`HireList`), read now at the store `home`. */
export const hireList = Effect.fn('hireList')(function* (home: string, repo: string, namespace: string, query: ObjectQuery) {
  const { factory, filedAt } = yield* hiringOf(home, repo, namespace);
  const listed: HireList = yield* objectsListed('Hire', yield* hiresOf(factory, home, filedAt), query, 'hire');
  return listed;
});

/**
 * The Hire `name` of `hires`, of the factory `namespace`: `Missing` where no step joins to it, `Conflict` naming both steps and the fix
 * where two do.
 */
export const hireNamedIn = (hires: readonly Hire[], namespace: string, name: string): Effect.Effect<Hire, Missing | Conflict | Invalid> => {
  const found = hires.filter((h) => h.metadata.name === name);
  const [one, ...rest] = found;
  if (one === undefined)
    return Effect.fail(
      new Missing({
        message: `no step of ${namespace} is named ${name}: list its Hires with GET /api/namespaces/${namespace}/hires, each named <workflow>.<step>, or attach the workflow with nemia factory attach ${namespace} <workflow>`,
      }),
    );
  if (rest.length)
    return Effect.fail(
      new Conflict({
        message: collided(
          namespace,
          name,
          found.map((h) => ({ workflow: h.spec.workflow, step: h.spec.step })),
        ),
      }),
    );
  return Effect.succeed(one);
};

/** The Hire `name` of the factory `namespace` as an object, read now; refused as `hireNamedIn` refuses. */
export const hireObject = Effect.fn('hireObject')(function* (home: string, repo: string, namespace: string, name: string) {
  const { factory, filedAt } = yield* hiringOf(home, repo, namespace);
  return yield* hireNamedIn(yield* hiresOf(factory, home, filedAt), namespace, name);
});
