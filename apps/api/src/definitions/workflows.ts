/**
 * The workflows group's handlers (`objects`' `Api`): a namespace's workflows as objects. `default` is the api's repository and your
 * library; a factory's namespace is the workflows attached to it, its tree's first (origin `factory`) in one made from a template.
 *
 * Each folder is read where it is (`heldIn`, no folder loaded), the one served of each name chosen by `definitionServed` (served.ts), and
 * only those served are loaded, as a start on the repository loads them (`loadedOf`, with the factory's hires), into the object
 * (`workflowObject`): its spec the steps as their files write them, its status the steps resolved, the typed graph (`typedGraphOf`), and
 * the ledger's number for what the folder holds now (`definitionRevision`), which a run started on it pins.
 *
 * Writes are yours, in `default` alone (`writeGoes`): made with its steps (the builder's `write`, builder.ts), written whole at the
 * `metadata.resourceVersion` it was read at — a stale one is a 409 — and removed at the `?resourceVersion=` it was read at
 * (`workflows rm`). The builder's refusal of a step is an `Invalid` naming the steps (`steps`).
 */
import path from 'node:path';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { definitionRevision, foldersIn, typedGraphOf, workflowStale, workflowVersion, type FolderLoaded } from 'agent-orchestrator';
import { Api, API_VERSION, Conflict, Invalid, type Workflow, type WorkflowStep } from 'objects';
import type { Served } from '../layer.ts';
import { queryOf } from '../factory-parts/index.ts';
import { answeredWrite as answered, statusRefused } from '../objects/refused.ts';
import { commandNamed, runPlaced } from '../store.ts';
import { draftOf, isRoleKey, schemasOf, write, type StepBody } from '../workflows/builder.ts';
import { workflowNameRefusal } from '../workflows/words.ts';
import {
  listed as listingOf,
  loadedAt,
  loadedOf,
  placesOf,
  type ListedStep,
  type WorkflowListing,
  type WorkflowSource,
} from '../workflows/workflows.ts';
import { listed, originAsked, servedNamed, servedOf, thereOf, writeGoes, writtenAt, type Held, type Origin } from './served.ts';

const REMOVE = commandNamed('workflows rm');

/** A folder of a workflow, where it is: the source word the api's own reads give it, and its path. */
type Folder = { from: WorkflowSource; dir: string };

/** What a write sends, said by its refusals. */
const SHAPE =
  '`{ "metadata": { "resourceVersion": "<as the Workflow was read>" }, "spec": { "steps": [{ "name", "keys", "body" }], "readme"? }, "schemas"?: [{ "file", "text" }] }`';

/** Where the namespace's workflows are read from, in the lookup order: a factory's tree, the repository, yours. */
const sourcesIn = (s: Served): Array<{ origin: Origin; from: WorkflowSource; dir: string }> => [
  ...(s.factory?.tree !== undefined
    ? [{ origin: 'factory' as const, from: 'repo' as const, dir: path.join(s.factory.tree, 'workflows') }]
    : []),
  { origin: 'repo', from: 'repo', dir: path.join(s.repo, 'workflows') },
  { origin: 'yours', from: 'yours', dir: path.join(s.home, 'workflows') },
];

/** Every folder the namespace holds, at each origin, by name — in a factory only those attached to it. Nothing is loaded. */
export const heldIn = (s: Served): Held<Folder>[] =>
  sourcesIn(s).flatMap(({ origin, from, dir }) =>
    foldersIn(dir)
      .filter((name) => !s.factory || s.factory.workflows.includes(name))
      .map((name) => ({ name, origin, item: { from, dir: path.join(dir, name) } })),
  );

/** A key set: not null, not left out, not an empty list. */
/** The keys whose unset value is null, so a list of none (`tools: []`) is a line the file writes. */
const LISTS_OF_NONE: readonly string[] = ['tools', 'routes', 'when', 'ends'];

/** Whether a file writes `key`'s line: a value set, an empty list only where unset is null. */
const isSet = (key: string, value: unknown): boolean =>
  value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0 && !LISTS_OF_NONE.includes(key));

/** The spec of a step in the object's words: `workspace: main`, the former spelling, said `base`. */
const keysOf = (spec: ListedStep['spec']): WorkflowStep['keys'] => {
  const { shape: _shape, ...keys } = spec as ListedStep['spec'] & { shape?: unknown };
  return { ...keys, ...((keys.workspace as string | null) === 'main' && { workspace: 'base' as const }) };
};

/**
 * A step as its file writes it: for one with an agent, the keys it sets itself and `agent`, and its own note; for one with none, the keys
 * it sets and its body.
 */
const writtenStep = (step: ListedStep): WorkflowStep => {
  const spec = keysOf(step.spec) as Record<string, unknown>;
  const own = step.own;
  const keys = Object.fromEntries(
    Object.entries(spec).filter(
      ([key, value]) => isSet(key, value) && (own === null || !isRoleKey(key) || own.keys.includes(key as never)),
    ),
  );
  return { name: step.name, keys, body: own ? own.body : step.body };
};

/** A step the object sends, as the builder takes it: `agent` among its keys makes every key its own, and its body its own note. */
const stepBodyOf = (step: WorkflowStep): StepBody => ({
  name: step.name,
  spec: step.keys,
  body: step.body,
  own: typeof step.keys.agent === 'string' ? { keys: Object.keys(step.keys), body: step.body } : null,
});

/** The object of one folder served: its listing, the loading its graph is drawn from, and its revision. */
const workflowObject = (
  namespace: string,
  origin: Origin,
  shadowedBy: Origin | null,
  listing: WorkflowListing,
  loaded: FolderLoaded,
  revision: number,
): Workflow => ({
  apiVersion: API_VERSION,
  kind: 'Workflow',
  metadata: { name: listing.name, namespace, creationTimestamp: writtenAt(listing.dir), resourceVersion: listing.version },
  spec: { description: listing.description, readme: listing.readme, steps: listing.steps.map(writtenStep) },
  status: {
    origin,
    ...(shadowedBy !== null && { shadowedBy }),
    revision,
    dir: listing.dir,
    graph: typedGraphOf('error' in loaded ? [] : loaded.steps),
    steps: listing.steps.map((step) => ({ ...step, spec: keysOf(step.spec) })),
    schemas: listing.schemas,
    folderTeam: listing.folderTeam,
    error: listing.error,
    unfilled: listing.unfilled,
  },
});

/** The objects of the folders `served`, each loaded now as a start in the namespace's factory would load it. */
async function objectsOf(s: Served, namespace: string, served: ReturnType<typeof servedOf<Folder>>): Promise<Workflow[]> {
  const loaded = await loadedOf(
    s.e,
    s.placeService,
    served.map((f) => f.item.dir),
    s.repo,
    s.home,
    s.factory,
  );
  return s.inRequest(
    Effect.forEach(served, ({ name, origin, shadowedBy, item: { from, dir } }) =>
      Effect.gen(function* () {
        const version = yield* workflowVersion(dir, placesOf(s.repo, s.home));
        const revision = yield* definitionRevision('workflow', name, version);
        const folder = loadedAt(loaded, dir);
        return workflowObject(namespace, origin, shadowedBy, listingOf(name, from, dir, folder, version, s.factory), folder, revision);
      }),
    ),
  );
}

const listPath = (namespace: string) => `GET /api/namespaces/${namespace}/workflows`;

/** The workflow `name` the namespace serves (from `asked`, where one is), read now. */
export async function workflowAt(s: Served, namespace: string, name: string, asked?: Origin): Promise<Workflow> {
  const [one] = await objectsOf(s, namespace, [servedNamed(heldIn(s), name, asked, listPath(namespace))]);
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one;
}

/** The steps a write sends, as the builder drafts them, or the first refusal of one, thrown as the `Api`'s error. */
const draftsOf = (steps: readonly WorkflowStep[], route: string) =>
  steps.map((step, i) => {
    const draft = draftOf(stepBodyOf(step), `step ${i + 1}`, route, SHAPE);
    if ('status' in draft) throw statusRefused(draft);
    return draft;
  });

/** The writing of yours' folder `name`, on the request's services. */
const writing = (s: Served, name: string, changes: boolean) => ({
  e: s.e,
  placeService: s.placeService,
  name,
  dir: path.join(s.home, 'workflows', name),
  repo: s.repo,
  home: s.home,
  changes,
  inRequest: s.inRequest,
});

/** The builder's answer: the steps a refusal names kept beside its words. */
const builderRefused = (saved: Awaited<ReturnType<typeof write>>): void => {
  if ('error' in saved) throw new Invalid({ error: saved.error, steps: saved.steps });
};

export const workflowsHandlers = HttpApiBuilder.group(Api, 'workflows', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered(async (s) => {
        const { origin, ...page } = query;
        const items = await objectsOf(s, namespace, servedOf(heldIn(s), originAsked(origin)));
        return listed('Workflow', items, queryOf(page));
      }),
    )
    .handle('get', ({ params: { namespace, name }, query }) => answered((s) => workflowAt(s, namespace, name, originAsked(query.origin))))
    .handle('create', ({ params: { namespace }, payload }) =>
      answered(async (s) => {
        const { name } = payload.metadata;
        const route = `POST /api/namespaces/${namespace}/workflows`;
        writeGoes(namespace, 'create', thereOf(heldIn(s), name));
        const wrong = workflowNameRefusal(name);
        if (wrong !== undefined) throw new Invalid({ error: `${route}: ${wrong}` });
        if (payload.spec.steps.length === 0)
          throw new Invalid({ error: `${route}: a workflow is made with its first step. Send ${SHAPE}, with one step at least.` });
        const steps = draftsOf(payload.spec.steps, route);
        builderRefused(await write(writing(s, name, false), steps, payload.spec.readme ?? undefined));
        return workflowAt(s, namespace, name, 'yours');
      }),
    )
    .handle('replace', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        const route = `PUT /api/namespaces/${namespace}/workflows/${name}`;
        writeGoes(namespace, 'replace', thereOf(heldIn(s), name));
        const steps = draftsOf(payload.spec.steps, route);
        const schemas = schemasOf(payload.schemas, route);
        if ('status' in schemas) throw statusRefused(schemas);
        const given = payload.metadata?.resourceVersion;
        if (given === undefined)
          throw new Invalid({
            error: `${route} takes the \`metadata.resourceVersion\` the Workflow was read at, so a folder changed since is not written over: ${SHAPE}.`,
          });
        const at = writing(s, name, true);
        const now = await s.inRequest(workflowVersion(at.dir, placesOf(s.repo, s.home)));
        if (now !== given) throw new Conflict({ error: workflowStale.write(at.dir, given, now) });
        builderRefused(await write(at, steps, payload.spec.readme ?? undefined, schemas));
        return workflowAt(s, namespace, name, 'yours');
      }),
    )
    .handle('delete', ({ params: { namespace, name }, query }) =>
      answered(async (s) => {
        const route = `DELETE /api/namespaces/${namespace}/workflows/${name}`;
        writeGoes(namespace, 'remove', thereOf(heldIn(s), name));
        const version = query.resourceVersion;
        if (!version)
          throw new Invalid({
            error: `${route} takes the \`?resourceVersion=\` the Workflow was read at, so a folder changed since is not removed unseen.`,
          });
        const before = await workflowAt(s, namespace, name, 'yours');
        await runPlaced(s, s.e, REMOVE.handler({ from: 'yours', name, version, repo: s.repo }, undefined, s.home));
        return before;
      }),
    ),
);
