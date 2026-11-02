/**
 * A workflow step's page, for the board (`GET /api/workflows/:from/:name/:step`): the step as written and as the loader read it, and what a
 * run of it would be told now, by layer, with where each layer lives — the agent the request's factory hires into it, the factories that
 * hire into it, where each of its skills is found, and its recent runs. And the address of a run's workflow page (`workflowPageOf`),
 * which a run's page links back to: the board builds no address from a store path.
 *
 * Everything here is read now, from the files: a run freezes its workflow and its hires as it starts, and what a run was told is its own
 * page's (`toldOf` in detail/told.ts).
 */
import path from 'node:path';
import { Effect } from 'effect';
import { Hono } from 'hono';
import {
  AgentDoor,
  DEFAULT_FACTORY,
  fillsOf,
  hireRefusalOf,
  keptRuns,
  Missing,
  readFactories,
  SkillDoor,
  unattachedRefusal,
} from 'agent-orchestrator';
import type { AgentReading, AgentsRead, Factory, FactoryListing } from 'agent-orchestrator';
import { toldLayers, type Run, type ToldLayers } from 'agent-orchestrator/run';
import type { AgentSkill, SkillsFound, Workflow } from 'agent-orchestrator/workflow';
import { foundInOf, sourceOf, type SkillSource } from '../agents/skills.ts';
import { type ApiEnv, served } from '../layer.ts';
import { agentSkillsOf, folderOf, keyRows, placesOf, stepSourceOf, type KeyRow, type WorkflowSource } from '../workflows/workflows.ts';
import { commandNamed, runPlaced } from '../store.ts';

/** How many of a step's runs its page lists, newest first. */
export const RECENT_RUNS = 5;

/**
 * Where a workflow's page is on the board, and a step's page under it: where the workflow is read from, its name, and the place it is read
 * in — the factory, null for the default, and the repository, null for the api's own or the factory's only one.
 */
export type WorkflowPageAddress = { from: WorkflowSource; workflow: string; factory: string | null; repo: string | null };

/** A factory that hires an agent into a step: the factory's name and the agent's. */
export type HiredIn = { factory: string; agent: string };

/**
 * A skill a step's layers give, named as its line writes it, and where it is found: `from`, yours, the repository's or builtin, null
 * where no place the board pages has it; and then `foundIn`, where the repository has it (`foundInOf`), null for one found nowhere.
 */
export type SkillFrom = { name: string; from: SkillSource | null; foundIn: string | null };

/** An agent a step may be hired: its name, and what it is for, null where its file says nothing. */
export type HireableAgent = { name: string; description: string | null };

/**
 * Whether an agent can be hired into a step, read before anyone presses Hire: `refused`, why not, in the package's words
 * (`hireRefusalOf`), null where one can; and `agents`, those it may be hired — the agents beside its workflow, the repository's for one of
 * the repository's and yours for one of yours, each that reads, by name; none where it is refused.
 */
export type Hiring = { refused: string | null; agents: HireableAgent[] };

/** One of a step's recent runs: its id, its brief, when it was made, its factory (null for the default), and whether the step was filed. */
export type RecentRun = { id: string; brief: string; createdAt: string; factory: string | null; filed: boolean };

/**
 * What a step's page shows: which workflow and step, its body, the file as written — frontmatter and all — and every key a step may set, in
 * the package's order, with its value as the loader read it. Read so, `after` names the step `resume:` implies too, and a loop's `rounds`
 * is the default where the file sets none: the file as written says which. `agentSkills` is what the agent attached to the step says it can
 * do, generated from its skills and shown here read-only, as on the agent's page; null on a step with no agent, or one with no card.
 *
 * Read now, in the request's factory (`factory`, null for the default): `layers`, what a run of it would be told, by layer, with no task
 * (`toldLayers`); `hired`, the agent the factory hires into it, which `layers.agent` then names; `hiredIn`, with no factory named, the
 * factories that hire into it (`hiredInOf`); `hiring`, whether one can be hired into it, and which (`hiringOf`); `skillsFrom`, where each
 * skill of its layers is found; and `recentRuns`, its newest runs (`recentRunsOf`).
 */
export type WorkflowStepPage = {
  workflow: string;
  from: WorkflowSource;
  dir: string;
  step: string;
  body: string;
  source: string;
  keys: KeyRow[];
  agentSkills: AgentSkill[] | null;
  factory: string | null;
  layers: ToldLayers;
  hired: string | null;
  hiredIn: HiredIn[];
  hiring: Hiring;
  skillsFrom: SkillFrom[];
  recentRuns: RecentRun[];
};

/** The factory a record or a summary names, null for the default factory, whether it names `default` or none. */
const factoryNamed = (factory: string | null | undefined): string | null => (factory && factory !== DEFAULT_FACTORY ? factory : null);

/**
 * The address of the page of the workflow `run` was started from, on the api serving `served` with the store at `home`, or null where the
 * board pages none: a folder of yours, in the run's factory on its repository; one of the run's repository, in its factory, or on the api's
 * own repository in the default factory; and no other folder — one given by path, a try's, or another repository's in the default factory.
 */
export function workflowPageOf(
  run: { workflowDir: string; repo?: string | null; factory?: string | null },
  served: string,
  home: string,
): WorkflowPageAddress | null {
  const dir = path.resolve(run.workflowDir);
  const workflow = path.basename(dir);
  const parent = path.dirname(dir);
  const factory = factoryNamed(run.factory);
  const repo = run.repo ? path.resolve(run.repo) : null;
  if (parent === path.join(path.resolve(home), 'workflows')) return { from: 'yours', workflow, factory, repo: factory ? repo : null };
  if (repo === null || parent !== path.join(repo, 'workflows')) return null;
  if (factory) return { from: 'repo', workflow, factory, repo };
  return repo === path.resolve(served) ? { from: 'repo', workflow, factory: null, repo: null } : null;
}

/** What a step's page reads of a run: its folder and factory, the steps it has, and what its row says. */
export type StepRun = Pick<Run, 'id' | 'brief' | 'createdAt' | 'workflowDir' | 'workflow' | 'factory' | 'steps'>;

/** A run as a step's page reads it (`StepRun`): the fields `recentRunsOf` reads, and no part of a frozen step's body. */
export const stepRun = (run: Run): StepRun => ({
  id: run.id,
  brief: run.brief,
  createdAt: run.createdAt,
  workflowDir: run.workflowDir,
  steps: run.steps,
  ...(run.workflow === undefined ? {} : { workflow: run.workflow }),
  ...(run.factory === undefined ? {} : { factory: run.factory }),
});

/**
 * The newest runs of the workflow folder `dir` that hold the step `step`, at most `RECENT_RUNS`, newest first: of every factory, or only
 * those of `factory` when one is named.
 */
export function recentRunsOf(runs: readonly StepRun[], dir: string, step: string, factory: string | null): RecentRun[] {
  const folder = path.resolve(dir);
  return runs
    .filter((run) => path.resolve(run.workflowDir) === folder)
    .filter((run) => step in run.steps || (run.workflow ?? []).some((s) => s.name === step))
    .filter((run) => factory === null || factoryNamed(run.factory) === factory)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_RUNS)
    .map((run) => ({
      id: run.id,
      brief: run.brief,
      createdAt: run.createdAt,
      factory: factoryNamed(run.factory),
      filed: (run.steps[step]?.taskId ?? null) !== null,
    }));
}

/**
 * The factories in `factories` that hire an agent into the step `step` of `workflow`, each with the agent: those that read, attach the
 * workflow and hire into the step — for a workflow of the repository's (`from`), only those working on `repo`, which reads it.
 */
export function hiredInOf(
  factories: readonly FactoryListing[],
  workflow: string,
  step: string,
  from: WorkflowSource,
  repo: string,
): HiredIn[] {
  return factories.flatMap((factory) => {
    if ('error' in factory || !factory.workflows.includes(workflow)) return [];
    if (from === 'repo' && !factory.repos.some((r) => path.resolve(r) === path.resolve(repo))) return [];
    const agent = fillsOf(factory.hires, workflow)[step];
    return agent === undefined ? [] : [{ factory: factory.name, agent }];
  });
}

/** Why no agent is offered to hire into a step when the agents beside its workflow do not read: the listing's own `message`. */
export const unreadAgentsRefusal = (message: string): string =>
  `The agents beside this workflow could not be read, so none is offered to hire into this step: ${message}. The Agents page says which.`;

/**
 * Whether an agent can be hired into `step`, of the workflow `workflow` read from `from`, in `factory` (undefined for the default), which
 * hires `hired` into it: refused as `hireRefusalOf` judges, the step's own `agent:` read only where no hire fills it, and `agents` never
 * read then; else each agent `agents` reads from the same place that reads, sorted by name — or, when they cannot be read, why
 * (`unreadAgentsRefusal`), so the step's page still answers.
 */
export async function hiringOf(
  factory: Pick<Factory, 'name' | 'workflows'> | undefined,
  workflow: string,
  step: Pick<Workflow, 'agent'>,
  hired: string | null,
  from: WorkflowSource,
  agents: () => Promise<readonly Pick<AgentReading, 'name' | 'from' | 'description' | 'error'>[]>,
): Promise<Hiring> {
  const refused = hireRefusalOf(factory, workflow, hired === null ? (step.agent?.name ?? null) : null);
  if (refused !== null) return { refused, agents: [] };
  return agents().then(
    (read) => ({
      refused: null,
      agents: read
        .filter((a) => a.from === from && a.error === null)
        .map(({ name, description }) => ({ name, description }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }),
    (err: unknown) => ({ refused: unreadAgentsRefusal(err instanceof Error ? err.message : String(err)), agents: [] }),
  );
}

/** Each skill `layers` gives, the agent's then the step's, once each, with where `found` has it (`sourceOf`, `foundInOf`). */
export function skillsFromOf(layers: ToldLayers, found: SkillsFound, repo: string, home: string): SkillFrom[] {
  return [...new Set([...layers.agentSkills, ...layers.addedSkills])].map((name) => {
    const at = found.at.get(name);
    if (typeof at !== 'string') return { name, from: null, foundIn: null };
    return { name, from: sourceOf(at, repo, home), foundIn: foundInOf(at, repo, home) };
  });
}

/** The table's entry a step's page is read through, served on the api alone. */
const STEP = commandNamed('workflows step');

/** The package's listing of the agents (`nemia agents`), which a step's hire is chosen from. */
const AGENTS = commandNamed('agents');

/**
 * A step's page.
 *
 * - `GET /api/workflows/:from/:name/:step` — one step of one folder, for its page (`WorkflowStepPage`): found among the folders the sources
 *   have and the steps the loader read, never joined from what was sent — so no name in the path reaches a file outside the folder — or
 *   why not, in the words a start would use. 400 for a `from` that is neither `repo` nor `yours`; 404 or 409 as `folderOf` says; 422 for
 *   the loader's refusal, word for word (an `Invalid`, answered by `app.onError`), with which the folder is listed and has no step to show;
 *   404 for a step the folder does not have. In a factory, the step is read with its hires, and a workflow the factory has not attached
 *   is a 404 in the package's words (`unattachedRefusal`, a `Missing`).
 *   The step's resolved agent carries its keys and words, not what its card says it can do: `agentSkills` is generated from the agent's
 *   skills, found where the load found them (`cardSkills`) — the card's A2A skills, one for each skill its `skills:` gives a
 *   session, or one made from its description — and null for a card the package refuses, whose words the agent's page shows.
 *   What a run would be told is read now, never frozen: `layers` as a start would tell them with no task, the agent the factory hires into
 *   the step (`hired`), with no factory the factories that hire into it (`hiredIn`), where each skill is found (`skillsFrom`), and the
 *   newest runs of the folder that hold the step, in the factory where one is named (`recentRuns`), and whether an agent can be hired
 *   into it, with those it can (`hiring`).
 */
export const step = new Hono<ApiEnv>().get('/api/workflows/:from/:name/:step', (c) =>
  served(c, async ({ e, placeService, env, repo, home, factory, memo, inRequest }) => {
    const { from, name, step: asked } = c.req.param();
    if (from !== 'repo' && from !== 'yours') {
      return c.json(
        {
          error: `A step's page names where its workflow is read from: \`repo\` or \`yours\`, as GET /api/workflows lists each workflow's \`from\` — /api/workflows/repo/${name}/${asked}, say. This request's was '${from}'.`,
        },
        400,
      );
    }
    const unattached = factory && unattachedRefusal(factory, name);
    if (unattached) throw new Missing({ message: unattached });
    const folder = folderOf(name, from, repo, home, factory?.tree);
    if ('status' in folder) return c.json({ error: folder.error }, folder.status);
    const args = { from, name, step: asked, dir: folder.dir, repo, ...(factory && { factory: factory.name }) };
    const { step: found, steps } = (await runPlaced(placeService, e, STEP.handler(args, undefined, home))) as {
      step: Workflow | null;
      steps: string[];
    };
    if (!found) {
      return c.json({ error: `No step '${asked}' in workflow ${name} (${folder.dir}). Its steps are: ${steps.join(', ')}.` }, 404);
    }
    const places = placesOf(repo, home);
    const defs = await inRequest(
      Effect.all({
        agents: Effect.flatMap(AgentDoor, (door) => door.agents.found({ dir: folder.dir, places })),
        skills: Effect.flatMap(SkillDoor, (door) => door.skills.found({ dir: folder.dir, places })),
      }),
    );
    const layers = toldLayers(found, null);
    const hired = factory ? (fillsOf(factory.hires, name)[found.name] ?? null) : null;
    const agents = async () => ((await runPlaced(placeService, e, AGENTS.handler({ repo }, env, home))) as AgentsRead).agents;
    return c.json({
      workflow: name,
      from,
      dir: folder.dir,
      step: found.name,
      body: found.body,
      source: stepSourceOf(folder.dir, found.name),
      keys: keyRows(found),
      agentSkills: agentSkillsOf(found, defs),
      factory: factory?.name ?? null,
      layers,
      hired,
      hiredIn: factory ? [] : hiredInOf(readFactories(), name, found.name, from, repo),
      hiring: await hiringOf(factory, name, found, hired, from, agents),
      skillsFrom: skillsFromOf(layers, defs.skills, repo, home),
      recentRuns: recentRunsOf(keptRuns(memo.records.step, stepRun), folder.dir, found.name, factory?.name ?? null),
    } satisfies WorkflowStepPage);
  }),
);
