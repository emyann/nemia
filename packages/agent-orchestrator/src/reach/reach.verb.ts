/**
 * `nemia policy reach <agent> (--factory <name> | --run <runId>)`: which steps at their gate an agent's rules in force could ever approve
 * unasked, why each other rule cannot, and the rules that would (`gateRows`, `reach.ts`). Of a factory, read off the steps each attached
 * workflow gates as it declares them; of a run, off the steps it is gated at, a gate added at its start among them, with what keeps each
 * rule that could approve one from doing so now, read as admission reads it (`seenOf`, `factsOf`). Any agent's: the name is the one given.
 */
import { StoreRoot } from '../config/root.store.ts';
import path from 'node:path';
import { Cause, Effect, Schema } from 'effect';
import type { Args } from '../command/command.ts';
import { POLICY_REACH_WORDS } from 'objects';
import { checked, type Served } from '../command/entry.verb.ts';
import { agentNameRefusal } from '../agents/agents.ts';
import { filedFactory } from '../factory/door/factories.store.ts';
import { factoryRepo } from '../factory/factory.ts';
import { workflowFolder } from '../folder/folder.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { approvedFirst, hasGate } from '../status/status.ts';
import { levelOfFactory } from '../level/levels.verb.ts';
import type { Level } from '../level/level.ts';
import { seenOf } from '../admission/seen.verb.ts';
import { factsOf, gateRules, listInForce, ruleWords, type Facts, type PolicyRule } from '../auto/index.ts';
import { readConfirmed, readProposed } from '../auto/auto.store.ts';
import { gateRows, type GateReach, type GateSite, type Reach } from './reach.ts';

/** A rule with its words, as the person reads it and a confirm checks them. */
export type WordedRule = PolicyRule & { words: string };

/** A workflow attached to the factory that does not load, and why, in the refusal's words. */
export type Unloaded = { workflow: string; message: string };

/**
 * What an agent's rules reach: the agent; the factory read, and the run where one was named; the factory's level now; the reach of the
 * rules in force over the steps at their gate (`all`, `some`, `none`); a row for each such step; the rules suggested for the steps no rule
 * reaches, each with its words; the whole proposal to propose them by (`proposal`), since a proposal replaces the last one: what the
 * agent proposed already, rules and guidance, with the suggestions added, each over a proposed rule of its id; and each attached
 * workflow that does not load.
 */
export type PolicyReach = {
  agent: string;
  factory: string;
  run: string | null;
  level: Level;
  reach: Reach;
  gates: GateReach[];
  suggested: WordedRule[];
  proposal: { rules: PolicyRule[]; guidance: string[] };
  unloaded: Unloaded[];
};

/** A step as reach reads it off its workflow: its name, its gate, its workspace and its check. */
type Gated = { name: string; gate?: true; workspace?: 'base'; check?: string };

/** The gate of `step` in `workflow`, approved first where it ends on the base branch, gated by its workflow or by `gates`. */
const siteOf = (workflow: string, step: Gated, gates: readonly string[] = []): GateSite => ({
  workflow,
  step: step.name,
  approvedFirst: approvedFirst(step, { gates: [...gates] }),
  hasCheck: step.check !== undefined,
});

/** The agent's name in `args`. */
const agentIn = (args: Args): string => String(args.name ?? '');

/** The usage the refusals of `nemia policy reach` end on. */
const REACH_FORM = 'nemia policy reach <agent> (--factory <name> | --run <runId>)';

/**
 * What `nemia policy reach` takes: the agent, and the factory (`factory`) or the run (`runId`) whose steps are read, exactly one of them;
 * the api reads the run from its query's `run`.
 */
export const ReachInput = Schema.Struct({
  name: Schema.String,
  factory: Schema.optionalKey(Schema.String),
  runId: Schema.optionalKey(Schema.String),
});
export type ReachInput = typeof ReachInput.Type;

/** Why `nemia policy reach` refuses what it was given, before anything is read: a name that is no agent's, neither or both of the two. */
const reachRefusal = (input: Args): string | null =>
  agentNameRefusal(agentIn(input)) ??
  ((typeof input.factory === 'string') === (typeof input.runId === 'string')
    ? `nemia policy reach reads one factory or one run: give --factory <name> or --run <runId>, one of them: ${REACH_FORM}.`
    : null);

/** Why a read failed, in its own words. */
const messageOf = (cause: Cause.Cause<unknown>): string => {
  const err = Cause.squash(cause);
  return err instanceof Error ? err.message : String(err);
};

/** Each workflow attached to `factory` read, or why it does not, at the store `home`: its gated steps' sites, or its refusal. */
const factorySites = Effect.fnUntraced(function* (home: string, name: string) {
  const factory = yield* filedFactory(name, 'hire');
  const repo = factoryRepo(factory, undefined, process.cwd());
  const door = yield* WorkflowDoor;
  const sites: GateSite[] = [];
  const unloaded: Unloaded[] = [];
  for (const workflow of factory.workflows) {
    const read = yield* Effect.suspend(() =>
      door.workflows.read(workflowFolder(workflow, path.join(factory.tree ?? repo, 'workflows'), repo, factory.tree), { repo, home }),
    ).pipe(
      Effect.map((steps) => ({ steps, message: undefined })),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.succeed({ steps: undefined, message: messageOf(cause) }),
      ),
    );
    if (read.steps === undefined) {
      unloaded.push({ workflow, message: read.message ?? 'it does not load' });
      continue;
    }
    const steps: readonly Gated[] = read.steps;
    sites.push(...steps.filter((s) => s.gate === true).map((s) => siteOf(workflow, s)));
  }
  return { sites, unloaded };
});

/** The run `runId`'s gated steps as sites, its factory, and the facts admission would read at each now. */
const runSites = Effect.fnUntraced(function* (runId: string) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
  const steps = yield* stepsOf(run);
  const workflow = path.basename(run.workflowDir ?? '') || runId;
  const sites = steps.filter((s) => hasGate(s, run)).map((s) => siteOf(workflow, s, run.gates));
  const facts = new Map<string, Facts>();
  for (const site of sites) facts.set(site.step, factsOf(yield* seenOf(runId, site.step)));
  return { factory: run.factory, sites, facts };
});

/** The reach of `agent`'s rules at the store `home`, of the factory `factory` or the run `runId` in `input`. */
const reachOf = Effect.fnUntraced(function* (home: string, { name: agent, factory: named, runId }: ReachInput) {
  const inForce = listInForce(readConfirmed(home, agent)?.rules);
  const asProposed = readProposed(home, agent);
  const proposed = asProposed?.rules ?? [];
  const read =
    runId === undefined
      ? { ...(yield* factorySites(home, String(named))), factory: String(named), facts: undefined }
      : { ...(yield* runSites(runId)), unloaded: [] };
  const factory = read.factory ?? 'default';
  const facts = read.facts;
  const { reach, rows, suggested } = gateRows(
    gateRules(inForce),
    gateRules(proposed),
    read.sites,
    facts && ((site) => facts.get(site.step)),
  );
  return {
    agent,
    factory,
    run: runId ?? null,
    level: yield* levelOfFactory(read.factory),
    reach,
    gates: rows,
    suggested: suggested.map((rule) => ({ ...rule, words: ruleWords(rule) })),
    proposal: {
      rules: [...proposed.filter((p) => !suggested.some((s) => s.id === p.id)), ...suggested],
      guidance: asProposed?.guidance ?? [],
    },
    unloaded: read.unloaded,
  } satisfies PolicyReach;
});

/**
 * `nemia policy reach <agent> (--factory <name> | --run <runId>)`: what an agent's rules can approve at a step's gate, and why not. The api
 * serves it as the nemia group's `reach` (`GET /api/policy/:name/reach?factory|run`). Refused (`Invalid`) before anything is read: a name
 * that is no agent's, neither or both of the factory and the run (`reachRefusal`); then as the factory or the run reads.
 */
export const POLICY_REACH: Served<PolicyReach, ReachInput> = {
  ...POLICY_REACH_WORDS,
  input: ReachInput,
  handler: (input) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.andThen(
        checked(reachRefusal(input)),
        Effect.suspend(() => reachOf(home, input)),
      ),
    ),
};
