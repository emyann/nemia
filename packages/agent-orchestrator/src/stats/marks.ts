/**
 * The change marks of a store's history: each day a run of a workflow froze a step, an agent's instructions or a rendered skill that
 * differs from what the run of the same factory and workflow folder before it froze for the same item, named on the later run's UTC day.
 *
 * Pure: `frozenOf` turns one run's frozen steps, and the digests of the skills rendered for them, into its items (`RunFrozen`); `marksOf`
 * compares each item with the same item of the run before it (`Mark`). An item whose digest is unknown in either run is never marked,
 * and a first appearance has nothing to compare with.
 */
import { createHash } from 'node:crypto';
import type { Workflow } from '../step/step.ts';
import { ownNote } from '../ending/ending.ts';
import { skillLayers } from '../agents/agents.ts';
import type { RunKeys } from './stats.ts';

/** What a mark is about: a frozen step, an agent's instructions, or a rendered skill. */
export type MarkKind = 'step' | 'agent' | 'skill';

/**
 * One item a run froze, by its kind and name: its digest, null where the run's record or its rendered folder does not say, and the steps
 * and agents it belongs to — the step itself, the steps an agent fills, the steps that give a skill, and their agents.
 */
export type FrozenItem = { kind: MarkKind; name: string; digest: string | null; steps: string[]; agents: Array<string | null> };

/** What one run froze (`FrozenItem`), with its keys, the UTC day and the time it was created, and its workflow's folder as recorded. */
export type RunFrozen = RunKeys & { day: string; at: string; workflowDir: string; items: FrozenItem[] };

/**
 * A change on the day of the run that froze it: the item's kind and name, the steps and agents it belongs to, and `since`, the run of the
 * same factory and workflow folder it is compared with, the default factory being its own.
 */
export type Mark = RunKeys & { day: string; kind: MarkKind; name: string; steps: string[]; agents: Array<string | null>; since: string };

/** A value as JSON with every object's keys sorted, so the same value always reads the same. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
        )
      : value;

/** A value's digest: sha256 of its sorted JSON, cut to 16 hex characters as a skill's version is. */
const digestOf = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
    .slice(0, 16);

/** A step's own digest: its resolved keys, but its body and its agent, with its own note (`ownNote`) and its agent's name. */
function stepItem(step: Workflow): FrozenItem {
  const { body: _body, agent, ...keys } = step;
  const name = agent?.name ?? null;
  return {
    kind: 'step',
    name: step.name,
    digest: digestOf({ ...keys, note: ownNote(step), agent: name }),
    steps: [step.name],
    agents: [name],
  };
}

/** Add `item` to `items`, or, where an item of its kind and name is there, its steps and agents to it and its digest where it has none. */
function merged(items: FrozenItem[], item: FrozenItem): FrozenItem[] {
  const there = items.find((i) => i.kind === item.kind && i.name === item.name);
  if (!there) return [...items, item];
  there.digest ??= item.digest;
  there.steps = [...new Set([...there.steps, ...item.steps])];
  there.agents = [...new Set([...there.agents, ...item.agents])];
  return items;
}

/**
 * Each step's items (`FrozenItem`): the step, its agent's instructions, own skills (`skillLayers`) and harness prompt where the record
 * carries its instructions, else the agent unknown, and each skill it gives, by the digest of its rendered copy in `skills` (step → skill →
 * digest): its agent's with the agent, those the step's line adds with the step alone.
 */
function itemsOf(step: Workflow, skills: ReadonlyMap<string, ReadonlyMap<string, string>>): FrozenItem[] {
  const agent = step.agent;
  if (!agent) return [stepItem(step)];
  const layers = skillLayers(step);
  const said =
    agent.instructions === undefined
      ? null
      : { instructions: agent.instructions, skills: layers.agent.length ? layers.agent : undefined, harnessPrompt: agent.harnessPrompt };
  const skill = (name: string, agents: string[]): FrozenItem => ({
    kind: 'skill',
    name,
    digest: skills.get(step.name)?.get(name) ?? null,
    steps: [step.name],
    agents,
  });
  return [
    stepItem(step),
    { kind: 'agent', name: agent.name, digest: said && digestOf(said), steps: [step.name], agents: [agent.name] },
    ...layers.agent.map((name) => skill(name, [agent.name])),
    ...layers.added.map((name) => skill(name, [])),
  ];
}

/**
 * What one run froze (`RunFrozen`): `head`'s keys, day, time and folder, and the items of its frozen `steps`, a skill by the digest of its
 * rendered copy in `skills` (step → skill → digest). An agent that fills several steps is one item, and so is a skill several steps give.
 */
export const frozenOf = (
  head: Omit<RunFrozen, 'items'>,
  steps: readonly Workflow[],
  skills: ReadonlyMap<string, ReadonlyMap<string, string>>,
): RunFrozen => ({ ...head, items: steps.flatMap((s) => itemsOf(s, skills)).reduce(merged, []) });

/** Two strings in order, by their code units. */
const inOrder = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

/** The order of runs in a workflow folder: by the time each was created, then by id. */
const byCreated = (a: RunFrozen, b: RunFrozen): number => inOrder(a.at, b.at) || inOrder(a.run, b.run);

/** The order of marks: by day, run, kind, then name. */
const byMark = (a: Mark, b: Mark): number =>
  inOrder(a.day, b.day) || inOrder(a.run, b.run) || inOrder(a.kind, b.kind) || inOrder(a.name, b.name);

/** The marks of one factory's runs of a workflow folder, each item against the nearest run before that froze one of its kind and name. */
function seriesMarks(runs: readonly RunFrozen[]): Mark[] {
  const last = new Map<string, { run: string; digest: string | null }>();
  const marks: Mark[] = [];
  for (const r of [...runs].sort(byCreated)) {
    for (const item of r.items) {
      const key = JSON.stringify([item.kind, item.name]);
      const before = last.get(key);
      if (before?.digest && item.digest && before.digest !== item.digest)
        marks.push({
          run: r.run,
          factory: r.factory,
          workflow: r.workflow,
          repo: r.repo,
          day: r.day,
          kind: item.kind,
          name: item.name,
          steps: item.steps,
          agents: item.agents,
          since: before.run,
        });
      last.set(key, { run: r.run, digest: item.digest });
    }
  }
  return marks;
}

/**
 * Every change among what the runs froze (`Mark`), sorted by day, run, kind and name: runs go in series by their factory, the default
 * factory being its own, and their workflow folder as recorded, never by its name, so two factories that hire different agents into a
 * step mark nothing; an item is marked where its digest is known and differs from the one the run before it in the series froze for the
 * same item, known too.
 */
export function marksOf(runs: readonly RunFrozen[]): Mark[] {
  const series = new Map<string, RunFrozen[]>();
  for (const r of runs) {
    const key = JSON.stringify([r.factory, r.workflowDir]);
    series.set(key, [...(series.get(key) ?? []), r]);
  }
  return [...series.values()].flatMap(seriesMarks).sort(byMark);
}
