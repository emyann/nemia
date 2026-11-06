/**
 * `nemia policy reach <agent> (--factory <name> | --run <runId>)`: which steps at their gate an agent's rules in force could ever approve
 * unasked, why each other rule cannot, and the rules that would (`gateRows`, `reach.ts`). Of a factory, read off the steps each attached
 * workflow gates as it declares them; of a run, off the steps it is gated at, a gate added at its start among them, with what keeps each
 * rule that could approve one from doing so now, read as admission reads it (`seenOf`, `factsOf`). Any agent's: the name is the one given.
 */
import path from 'node:path';
import { Cause, Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { agentNameRefusal } from '../agents/agents.ts';
import { rootGiven } from '../config/root.store.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { FactoryDoor } from '../factories/factories.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
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

/** Why a read failed, in its own words. */
const messageOf = (cause: Cause.Cause<unknown>): string => {
  const err = Cause.squash(cause);
  return err instanceof Error ? err.message : String(err);
};

/** Each workflow attached to `factory` read, or why it does not, at the store `home`: its gated steps' sites, or its refusal. */
const factorySites = Effect.fnUntraced(function* (home: string, name: string) {
  const factory = yield* (yield* FactoryDoor).factories.read(FactoryName.read(name));
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

/** The reach of `agent`'s rules at the store `home`, of the factory `--factory` or the run `--run` in `args`. */
const reachOf = Effect.fnUntraced(function* (home: string, args: Args) {
  const agent = agentIn(args);
  const inForce = listInForce(readConfirmed(home, agent)?.rules);
  const asProposed = readProposed(home, agent);
  const proposed = asProposed?.rules ?? [];
  const runId = typeof args.runId === 'string' ? args.runId : undefined;
  const read =
    runId === undefined
      ? { ...(yield* factorySites(home, String(args.factory))), factory: String(args.factory), facts: undefined }
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

/** What a row says of its step: who reaches it, else why none can. */
function rowLines(row: GateReach): string[] {
  const head = `  ${row.step} of ${row.workflow}`;
  const reached = row.reachedBy.length
    ? [`${head}: approved on its own by ${row.reachedBy.join(', ')}`]
    : [`${head}: no rule can approve it`, ...row.misses.map((m) => `    ${m.words}`)];
  return [
    ...reached,
    ...(row.proposedBy.length ? [`    proposed, would: ${row.proposedBy.join(', ')}`] : []),
    ...(row.now ?? []).map((n) => `    now, ${n.rule} waits: ${n.words}`),
  ];
}

/** The lines `nemia policy reach` prints. */
function reachLines(r: PolicyReach): string[] {
  const reached = r.gates.filter((g) => g.reachedBy.length).length;
  const of = r.run === null ? `the factory ${r.factory}` : `the run ${r.run} (factory ${r.factory})`;
  const lines = [
    `${r.agent}, in ${of} at ${r.level}: the rules in force can approve ${reached} of the ${r.gates.length} step(s) at their gate (${r.reach})`,
    ...r.gates.flatMap(rowLines),
    ...r.unloaded.map((u) => `  ${u.workflow} does not load, so its steps are not read: ${u.message}`),
  ];
  if (!r.suggested.length) return lines;
  return [
    ...lines,
    'suggested, each reaching a step above:',
    ...r.suggested.map((s) => `  ${s.id}: ${s.words}`),
    `propose them with nemia policy propose ${r.agent} --file -, given the proposal of --json, which keeps what is proposed already;`,
    `the person confirms each with nemia policy confirm ${r.agent} <id> --words '<its words>'.`,
  ];
}

/** `nemia policy reach <agent> (--factory <name> | --run <runId>)`: what an agent's rules can approve at a step's gate, and why not. */
export const POLICY_REACH: Command<PolicyReach> = {
  name: 'policy reach',
  usage: '<agent> (--factory <name> | --run <runId>)',
  help: [
    "which steps at their gate the agent's rules in force could ever approve",
    'unasked, in a factory or a run: why each other rule cannot (a step approved',
    'before it runs has done nothing to recommend or check; one with no check',
    'never passed one), what keeps a rule from a run now, and the rules that would',
  ],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--factory', kind: 'name', key: 'factory', takes: `--factory takes the factory whose steps are read: ${REACH_FORM}.` },
      { flag: '--run', kind: 'name', key: 'runId', takes: `--run takes the run whose steps are read: ${REACH_FORM}.` },
    ],
    unknown: (arg) => `nemia policy reach takes an agent's name and --factory or --run, not ${arg}: ${REACH_FORM}.`,
  },
  check: (args) =>
    agentNameRefusal(agentIn(args)) ??
    ((typeof args.factory === 'string') === (typeof args.runId === 'string')
      ? `nemia policy reach reads one factory or one run: give --factory <name> or --run <runId>, one of them: ${REACH_FORM}.`
      : null),
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'an agent reads it from its session; the board draws no part for it yet' },
  handler: (args, _env, home) =>
    rooted(
      home,
      'policy reach',
      Effect.suspend(() => reachOf(rootGiven(home, 'policy reach'), args)),
    ),
  print: reachLines,
};
