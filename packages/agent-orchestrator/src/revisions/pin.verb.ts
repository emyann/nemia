/**
 * Resolving a run's kinds now, and the person's ask to take the new ones.
 *
 * `pinsOf` reads the four kinds a run resolves — its workflow folder, each step's agent, each skill those agents are given, and its
 * factory's rules — digests each as the package already digests it, gives each its number in the ledger (`appendRevision`) and answers with
 * the run's pins. `resolvedNow` does that for a run that has filed nothing, reading the folder again so an edit made while the run waited
 * reaches its first step; `refreshedNow` does it for a run that has filed, keeping the step set it already names. `refreshRun` is
 * `nemia refresh <run>`: it writes a person's ask that the next pass re-pins on.
 *
 * A controller: it gathers digests from four stores, which only a controller may do (`CONTROLLER` in `test/boundary.test.ts`).
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { AGENTS_FOLDER, type Workflow } from '../step/step.ts';
import { loadWorkflows } from '../folder/folder.store.ts';
import { lookupRoots, skillsFor, skillVersion, type Places } from '../skills/read.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { agentVersion } from '../agents/read.store.ts';
import { writeAgentFiles } from '../agents/agents.store.ts';
import { workflowVersion } from '../folder/version.store.ts';
import { factoryFills, rulesVersion } from '../rules/rules.store.ts';
import { DEFAULT_FACTORY, type Factory } from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import { runStore } from '../record/files.store.ts';
import { within } from '../meter/tally.store.ts';
import { stepsOf } from '../record/steps.store.ts';
import { hasStarted } from '../wait/wait.ts';
import { Conflict } from '../refusal/refusal.ts';
import type { Run } from '../record/record.ts';
import { appendRevision } from './revisions.store.ts';
import { kindsDrift, type KindName, type Pin } from './revisions.ts';

/** What a run resolved on a pass: the steps it now holds, and the revision of each kind they were read at. */
export type Resolved = { steps: Workflow[]; pins: Pin[] };

/** The factory a run was started in, read; none for the default factory, which is no file. */
const factoryOf = (run: Pick<Run, 'factory'>): Factory | undefined =>
  run.factory === undefined || run.factory === DEFAULT_FACTORY ? undefined : readFactory(run.factory);

/** The name a workflow folder is known by, within its kind: the folder's own, as a factory attaches it. */
const workflowName = (dir: string): string => path.basename(path.resolve(dir));

/**
 * The run's workflow folder read now, with its factory's hires and rules filled in as `nemia start` filled them (`factoryFills`).
 *
 * Lenient where `nemia start` refuses: a folder whose factory no longer attaches the workflow, or whose rules file has stopped reading, is
 * loaded with what reads, since nothing is being started here — a run that has already frozen a workflow keeps it, and this is only read to
 * see whether the content moved. A folder that does not load at all throws, and its caller keeps the freeze.
 */
function stepsNow(run: Pick<Run, 'workflowDir' | 'repo' | 'factory'>, places: Places, factory: Factory | undefined): Workflow[] {
  if (!factory) return loadWorkflows(run.workflowDir, places);
  const { fills } = factoryFills(factory, workflowName(run.workflowDir));
  return loadWorkflows(run.workflowDir, places, fills);
}

/** The agents and skills `steps` name, each once, in the order the steps run. */
function kindsIn(run: Pick<Run, 'workflowDir' | 'factory'>, steps: readonly Workflow[]): KindName[] {
  const named: KindName[] = [{ kind: 'workflow', name: workflowName(run.workflowDir) }];
  for (const step of steps) {
    const agent = step.agent;
    if (!agent) continue;
    named.push({ kind: 'agent', name: agent.name });
    for (const skill of agent.skills ?? []) named.push({ kind: 'skill', name: skill });
  }
  if (run.factory !== undefined && run.factory !== DEFAULT_FACTORY) named.push({ kind: 'rules', name: run.factory });
  return named.filter((k, i) => named.findIndex((o) => o.kind === k.kind && o.name === k.name) === i);
}

/**
 * The digest of one kind and name as the package already takes it: a workflow folder's files, agents and added skills
 * (`workflowVersion`), an agent's file and its skills (`agentVersion`), a skill's folder (`skillVersion`), a factory's rules
 * (`rulesVersion`). Null for a kind that is not there — an agent the load no longer finds, a factory with no rules — which is pinned at no
 * revision and left out of the run's pins.
 */
function digestFor(of: KindName, run: Pick<Run, 'workflowDir' | 'factory'>, places: Places, factory: Factory | undefined): string | null {
  if (of.kind === 'workflow') return workflowVersion(run.workflowDir, places);
  if (of.kind === 'rules') return factory ? rulesVersion(factory) : null;
  const found = skillsFor(run.workflowDir, places);
  if (of.kind === 'skill') {
    const at = found.at.get(of.name);
    return typeof at === 'string' ? skillVersion(at) : null;
  }
  const root = lookupRoots(run.workflowDir, places).find((r) => agentVersion(path.join(r, AGENTS_FOLDER), of.name, found) !== null);
  return root === undefined ? null : agentVersion(path.join(root, AGENTS_FOLDER), of.name, found);
}

/**
 * The pins of `steps` as the world holds them now, each given its number in the ledger (`appendRevision`), which appends only where the
 * digest has moved. A kind that is not there is left out: a pin says what was resolved, and nothing was.
 */
export function pinsOf(run: Pick<Run, 'workflowDir' | 'repo' | 'factory'>, steps: readonly Workflow[], at: string): Pin[] {
  const places = placesOf(run.repo);
  const factory = factoryOf(run);
  return kindsIn(run, steps).flatMap((of) => {
    const hash = digestFor(of, run, places, factory);
    if (hash === null) return [];
    const { n } = appendRevision(of.kind, of.name, hash, at);
    return [{ kind: of.kind, name: of.name, n, hash }];
  });
}

/** The run's workflow folder as it stands now, or undefined where it does not load, so the run keeps the workflow it froze. */
function folderNow(run: Pick<Run, 'workflowDir' | 'repo' | 'factory'>): Workflow[] | undefined {
  try {
    return stepsNow(run, placesOf(run.repo), factoryOf(run));
  } catch {
    return undefined;
  }
}

/**
 * The run's workflow folder and kinds resolved again, for a run that has filed nothing: the steps the folder holds now — new and removed
 * steps included, as a run that has filed nothing takes the folder's step set whole — and their pins. Undefined where the folder does not
 * load.
 */
export function resolvedNow(run: Pick<Run, 'workflowDir' | 'repo' | 'factory'>, at: string): Resolved | undefined {
  const steps = folderNow(run);
  return steps && { steps, pins: pinsOf(run, steps, at) };
}

/**
 * The run's steps and kinds resolved again for a run that has filed, on a person's ask: the folder's copy of each step the run already
 * names, in the order the run has them, and a step the folder no longer has kept as the run froze it — the verb takes new content, never a
 * new step set. Undefined where the folder does not load, so the run keeps what it froze and its pins.
 */
export function refreshedNow(run: Run, at: string): Resolved | undefined {
  const found = folderNow(run);
  if (!found) return undefined;
  const byName = new Map(found.map((s) => [s.name, s]));
  const steps = stepsOf(run).map((s) => byName.get(s.name) ?? s);
  return { steps, pins: pinsOf(run, steps, at) };
}

/** Render the steps' agent files again (`writeAgentFiles`), so a pin the run took reaches the prompt its next filing is given. */
export function renderAgain(run: Run, steps: readonly Workflow[]): void {
  within('act', () => writeAgentFiles(run, steps, skillsFor(run.workflowDir, placesOf(run.repo))));
}

/** What one pass did about the run's revisions: whether it changed the record, what to say, and whether a refresh ask is spent. */
export type PinnedPass = { wrote: boolean; notes: string[]; lift: boolean };

const NOTHING: PinnedPass = { wrote: false, notes: [], lift: false };

/**
 * Resolve the run's kinds for this pass, before the pass reads anything of it, and write what moved onto the record it will write.
 *
 * Level-triggered, and read from the world on every pass: a run that has filed nothing — one waiting `--after`, which may sit for hours —
 * takes the workflow folder as it stands now, step set and all, so an edit made while it waited reaches its first step; a run that has
 * filed keeps its frozen workflow, and re-pins only where a person asked (`nemia refresh`), which never adds or removes a step. Nothing is
 * carried between passes: what has moved is the digests against the run's own pins.
 *
 * Writes nothing where no digest moved, so a run resolved twice with no edit leaves the record alone and the ledger empty of a second
 * entry. A run a person called off is left alone: it files nothing, so there is nothing for a revision to reach. The steps' agent files are
 * rendered again wherever the pins moved (`renderAgain`), since a pin the board shows and a prompt the session reads must be the one
 * content.
 */
export function pinPass(run: Run, at: string): PinnedPass {
  if (run.cancelledAt || run.pruned) return NOTHING;
  return hasStarted(run) ? refreshDue(run, at) : firstResolve(run, at);
}

/** The run's workflow and pins taken afresh, for a run that has filed nothing: `run` is changed where anything moved. */
function firstResolve(run: Run, at: string): PinnedPass {
  const resolved = resolvedNow(run, at);
  if (!resolved) return NOTHING;
  const names = resolved.steps.map((s) => s.name);
  const moved = !isDeepStrictEqual([...(run.pinned ?? [])], resolved.pins) || !isDeepStrictEqual(Object.keys(run.steps), names);
  if (!moved) return NOTHING;
  run.workflow = resolved.steps;
  run.pinned = resolved.pins;
  run.steps = Object.fromEntries(names.map((name) => [name, run.steps[name] ?? { taskId: null }]));
  renderAgain(run, resolved.steps);
  return { wrote: true, notes: [`took the revisions of ${resolved.pins.length} kinds: nothing of it is filed yet`], lift: false };
}

/**
 * The run's steps and pins taken again on a person's ask (`nemia refresh`), for a run that has filed: the ask is spent either way. The ask
 * is read off its own file every pass (`runStore.refresh.stands`), never off the record, which never holds it.
 */
function refreshDue(run: Run, at: string): PinnedPass {
  if (!runStore.refresh.stands(run.id)) return numbered(run, at);
  const resolved = refreshedNow(run, at);
  if (!resolved)
    return {
      wrote: false,
      notes: ["nemia refresh: the run's workflow folder does not load, so it keeps the revisions it had"],
      lift: true,
    };
  run.workflow = resolved.steps;
  run.pinned = resolved.pins;
  renderAgain(run, resolved.steps);
  return { wrote: true, notes: ['nemia refresh: every filing after this takes the new revisions'], lift: true };
}

/**
 * The kinds of a filed run, numbered in the ledger and nothing more: the folder as it stands is resolved every pass, so an edit of an
 * agent, a skill, the workflow or the factory's rules has a number as soon as it is made, which is what the board reads a run's drift
 * off (`kindsOf`, the api's `detail/tries.ts`). It moves no pin and renders nothing: what the run files stays the revisions it holds
 * until a person types `nemia refresh`. An append is by digest, so a pass over an unedited folder adds no entry and writes no record.
 */
function numbered(run: Run, at: string): PinnedPass {
  resolvedNow(run, at);
  return NOTHING;
}

/**
 * `nemia refresh <run>`: write down that a person asked this run to take the new revisions, so every filing after it — a new step, a retry,
 * a round — is filed on them, and answers with the drift it was asked on.
 *
 * It resolves the kinds now to answer, which is what gives an edit its number in the ledger: a content nobody has resolved yet has no
 * entry, so the drift cannot be read off the ledger alone.
 *
 * Refused (`Conflict`): a run that has filed nothing, which resolves its kinds afresh at its first filing anyway; a run whose pins are
 * already the newest of every kind, since nothing would be taken, and an ask nothing acts on is an ask the tick reads for ever; and a run
 * whose folder does not load, which has no revision to take. A run with no record is refused `Missing` by the store's read.
 */
export const refreshRun = Effect.fn('refresh')(function* (id: string) {
  const run = yield* tried(() => runStore.runs.read(id));
  if (!hasStarted(run))
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id} has filed nothing yet: it resolves its kinds afresh at its first filing, so an edit made while it waits reaches its first step with no refresh. Nothing was written.`,
      }),
    );
  const resolved = yield* tried(() => refreshedNow(run, new Date().toISOString()));
  if (!resolved)
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id}: its workflow folder, ${run.workflowDir}, does not load, so there is no revision to take. Mend the folder, and nemia refresh ${id} again. Nothing was written.`,
      }),
    );
  const drift = kindsDrift(run.pinned, resolved.pins);
  if (!drift.length)
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id} is already on the newest revision of every kind it resolved: there is nothing to take. Edit a workflow, an agent, a skill or the factory's rules, and nemia refresh ${id} again. Nothing was written.`,
      }),
    );
  if (!runStore.refresh.put(id))
    return yield* Effect.fail(new Conflict({ message: `run ${id} is already asked to refresh: the next pass takes the new revisions.` }));
  return drift;
});

/**
 * What a pass owes the store once it has decided: the record, written where this pass or the pins changed it, and then the refresh ask the
 * pins answered, lifted — in that order, so an ask is never spent on a record that was not written.
 */
export const pinsWritten = (run: Run, took: PinnedPass, wrote: boolean): void => {
  if (wrote || took.wrote) runStore.runs.rewrite(run);
  if (took.lift) runStore.refresh.lift(run.id);
};
