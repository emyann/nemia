/**
 * The verbs over runs and agents — `wf ls`, `wf cancel`, `wf rm`, `wf prune`, `wf hold`, `wf show`, `wf logs` and `wf agents` — their flags,
 * read off the command line, and what each prints.
 */
import path from 'node:path';
import {
  agentPlaces,
  agentSkillsFound,
  agentVersion,
  branchReader,
  cancel,
  cardSkills,
  daemonLine,
  daemonStanding,
  findAgent,
  forget,
  forgetLine,
  hold,
  holdAdvice,
  holdWord,
  list,
  listAgents,
  listRuns,
  onYouWords,
  prune,
  pruneLines,
  pruningBytes,
  readRun,
  resultBranches,
  runSlots,
  sizeOf,
  toDecideWords,
  unhold,
  unjudgedOf,
  viewedOnce,
  waitAdvice,
  type AgentPlace,
  type ForgetHow,
  type Pruning,
  type Unjudged,
} from '../runner.ts';
import { agentCard } from '../workflow.ts';
import { HELP, usage, readFlags, confirmed, type Engine } from './flags.ts';

/**
 * `wf rm`'s arguments: the runs to forget, each once, and its two switches. Refused before any run is read: a flag it does not take, and
 * `--force-unmerged` without `--delete-branches` — it forces what that flag deletes, and alone would delete nothing, silently.
 */
export function rmHow(argv: string[]): { ids: string[]; how: ForgetHow } {
  const ids: string[] = [];
  const how: ForgetHow = {};
  for (const arg of argv) {
    if (arg === '--delete-branches') how.deleteBranches = true;
    else if (arg === '--force-unmerged') how.forceUnmerged = true;
    else if (arg.startsWith('-'))
      usage(
        `wf rm does not take ${arg}. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: wf rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]].`,
      );
    else if (!ids.includes(arg)) ids.push(arg);
  }
  if (how.forceUnmerged && !how.deleteBranches) {
    usage(
      "--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: wf rm <runId> --delete-branches --force-unmerged.",
    );
  }
  if (!ids.length && argv.length) usage('wf rm takes the runs to forget, by id: wf rm <runId> [<runId> ...] — wf ls lists them.');
  return { ids, how };
}

/** `wf prune`'s arguments: the runs to prune, each once — none is every run — and its three switches. Refused before any run is read: a flag it does not take. */
export function pruneHow(argv: string[]): { ids: string[]; unmerged: boolean; yes: boolean; artifacts: boolean } {
  const ids: string[] = [];
  let unmerged = false;
  let yes = false;
  let artifacts = false;
  for (const arg of argv) {
    if (arg === '--unmerged') unmerged = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--artifacts') artifacts = true;
    else if (arg.startsWith('-'))
      usage(
        `wf prune does not take ${arg}. It takes the runs to prune — none is every run — then --unmerged, --artifacts and --yes: wf prune [<runId> ...] [--unmerged] [--artifacts] [--yes].`,
      );
    else if (!ids.includes(arg)) ids.push(arg);
  }
  return { ids, unmerged, yes, artifacts };
}

/**
 * `wf hold`'s arguments after the run: `--until <runId>`, once for each run to wait on, or `--off` alone. Refused before any run is read:
 * neither, both, a flag it does not take, and `--until` with no run. A run named twice is the verb's to refuse (`holdRefusal`), in its words.
 */
export function holdHow(argv: string[]): { until: string[]; off: boolean } {
  const shape = 'wf hold <runId> --until <runId> [--until <runId> ...], or wf hold <runId> --off';
  const until: string[] = [];
  let off = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--off') off = true;
    else if (arg === '--until' || arg.startsWith('--until=')) {
      const id = arg === '--until' ? argv[++i] : arg.slice('--until='.length);
      if (!id || id.startsWith('-')) usage(`--until takes the run to wait on, by id: ${shape}.`);
      until.push(id);
    } else usage(`wf hold does not take ${arg}. It takes the run, then the runs it waits on or --off: ${shape}.`);
  }
  if (off && until.length) usage(`wf hold takes --until or --off, not both: lift the hold first, then hold it again — ${shape}.`);
  if (!off && !until.length) usage(`wf hold needs the runs to wait on, or --off to lift a hold: ${shape}.`);
  return { until, off };
}

/** `wf agents`' flags: `--repo <r>` once, and for a card `--from repo|yours` once, when both places have an agent of that name. */
export function agentsHow(argv: string[]): { repo?: string; from?: AgentPlace } {
  const { values } = readFlags(argv, {
    takes: {
      '--repo': 'the repository whose workflows/agents to read: wf agents --repo <r>',
      '--from': 'which place the agent is in: wf agents card <name> --from repo|yours',
    },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf agents does not take ${arg}. It takes --repo <r>, and for a card --from repo|yours.`
        : `wf agents takes no argument but card <name>: wf agents, or wf agents card ${arg}.`,
    twice: (flag) => `wf agents takes ${flag} once: an agent is read from one ${flag === '--repo' ? 'repository' : 'place'}.`,
  });
  const from = values['--from']?.[0];
  if (from !== undefined && from !== 'repo' && from !== 'yours')
    usage(`wf agents --from takes repo or yours, not ${from}: repo is <repo>/workflows/agents, yours is your store's.`);
  return { repo: values['--repo']?.[0], ...(from === 'repo' || from === 'yours' ? { from } : {}) };
}

/** A run's record, as `wf ls` reads it. */
type Run = ReturnType<typeof readRun>;

/** A run as `wf ls` lists it: judged, or, where a task journal of it does not read, its steps and why (`unjudgedOf`). */
type Listed = Awaited<ReturnType<typeof list>> | Unjudged;

/** What `wf ls` says a run asks beneath its steps: its ending's gate once, what waits on a person, a hold, and its result. */
function printAsks(run: Run, { steps, waitingOnYou, waiting, holding, toDecide }: Exclude<Listed, Unjudged>): void {
  if (toDecide) console.log(`   → to decide: ${toDecideWords(run, toDecide)}`);
  const onYou = onYouWords({ steps, waitingOnYou }).filter(
    (said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`),
  );
  if (onYou.length) console.log(`   → waiting on you: ${onYou.join(', ')}  —  wf decide ${run.id}`);
  if (waiting.some((w) => w.missing || w.cancelledAt || w.gone?.length)) console.log(`   → waiting on you: ${waitAdvice(run, waiting)}`);
  if (holding) {
    const never = !holding.length || holding.some((w) => w.missing || w.cancelledAt || w.gone?.length);
    const lifting = holding.length > 0 && holding.every((w) => w.shipped);
    console.log(
      `   → ${holdWord(holding)}${never ? `: ${holdAdvice(run, holding)}` : lifting ? '' : `  —  wf hold ${run.id} --off lifts it`}`,
    );
  }
  const result = resultBranches(run);
  if (result.length) console.log(`   → result: ${result.join(', ')}  —  wf decide ${run.id}`);
}

/** A run's lines on `wf ls`: its brief and what it cost, a step a line, and what it asks; unjudged, its steps and why. */
function printListed(run: Run, listed: Listed): void {
  const calledOff = `${run.cancelledAt ? '  (cancelled)' : ''}${run.pruned ? '  (pruned)' : ''}`;
  if ('said' in listed) {
    console.log(`${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${calledOff}`);
    const width = Math.max(20, ...listed.steps.map((s) => s.status.length));
    for (const s of listed.steps) console.log(`   ${s.name.padEnd(14)} ${s.status.padEnd(width)} ${s.branch ?? ''}`);
    console.log(`   → unreadable: ${listed.said}`);
    return;
  }
  const { steps, cost } = listed;
  console.log(`${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${calledOff}${cost ? `  ${cost}` : ''}`);
  const said = steps.map((s) => `${s.status}${s.cost ? `  ${s.cost}` : ''}`);
  const width = Math.max(20, ...said.map((w) => w.length));
  for (const [i, s] of steps.entries()) {
    console.log(`   ${s.name.padEnd(14)} ${said[i].padEnd(width)} ${s.branch ?? ''}${s.note ? `  · ${s.note}` : ''}`);
  }
  printAsks(run, listed);
}

/**
 * `wf ls`: every run, or the one named, and last whether a wf up ticks the store. The cap on runs in flight is judged over the whole store
 * even for one run; a listing views each task once and asks git of each repository's branches once (`viewedOnce`, `branchReader`). A run
 * a task journal of which does not read is listed with its steps and `→ unreadable:` in the runtime's words (`unjudgedOf`).
 */
export async function lsVerb(rest: string[], e: Engine): Promise<void> {
  const runs = rest[0] ? [readRun(rest[0])] : listRuns();
  const ticking = () => console.log(daemonLine(daemonStanding(), Date.now()));
  if (!runs.length) {
    console.log('no runs');
    return ticking();
  }
  const viewed = viewedOnce(e);
  const git = branchReader();
  git.prime(runs);
  const held = await runSlots(viewed, rest[0] ? listRuns() : runs);
  for (const run of runs) {
    const listed = await list(viewed, run, held.get(run.id), git).catch(async (err: unknown) => {
      const unjudged = await unjudgedOf(viewed, run, err, 'wf ls');
      if (!unjudged) throw err;
      return unjudged;
    });
    printListed(run, listed);
  }
  return ticking();
}

/** `wf cancel`: what it has in flight asked to stop, and nothing more filed; a line in every case, a run already over included. */
export async function cancelVerb(rest: string[], e: Engine): Promise<void> {
  if (!rest[0]) return console.log(HELP);
  const { run, plan } = await cancel(e, rest[0]);

  if (plan.kind === 'finished') return console.log(`${run.id}  already ${plan.status} — nothing to stop`);

  console.log(plan.kind === 'already-cancelled' ? `${run.id}  already cancelled at ${plan.at}` : `${run.id}  cancelled`);
  if (plan.stop.length) console.log(`   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`);
  else if (plan.kind === 'cancel') console.log(`   nothing was in flight — no further steps will be filed`);
  return;
}

/**
 * `wf rm`: each run forgotten, judged on its own, a line each, a refusal included; once every run has had its say, it fails naming those
 * not forgotten, exit 2, or 1 when one failed otherwise.
 */
export async function rmVerb(rest: string[], e: Engine): Promise<void> {
  const { ids, how } = rmHow(rest);
  if (!ids.length) return console.log(HELP);
  const notForgotten: string[] = [];
  let failed = false;
  for (const id of ids) {
    try {
      const forgot = await forget(e, id, how);
      console.log(forgetLine(forgot));
      if (forgot.kind === 'refused' || forgot.kind === 'held') notForgotten.push(id);
    } catch (err) {
      console.log(`${id}  not forgotten: ${(err as Error).message}`);
      notForgotten.push(id);
      if ((err as { exitCode?: number }).exitCode !== 2) failed = true;
    }
  }
  if (notForgotten.length) {
    throw Object.assign(
      new Error(
        `wf rm: ${notForgotten.join(', ')} not forgotten — ${notForgotten.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
      ),
      { exitCode: failed ? 1 : 2 },
    );
  }
  return;
}

/** The runs `wf prune` named and did not prune, and whether one failed otherwise than by a refusal, which makes its exit 1 and not 2. */
type PruneTally = { notPruned: string[]; failed: boolean };

/** A run `wf prune` failed to judge or to prune: its line, and its place in the tally. */
function notPrunedLine(id: string, err: unknown, tally: PruneTally): void {
  console.log(`${id}  not pruned: ${(err as Error).message}`);
  tally.notPruned.push(id);
  if ((err as { exitCode?: number }).exitCode !== 2) tally.failed = true;
}

/** `wf prune`'s end: once every run has had its say, it fails naming each run not pruned, exit 2, or 1 when one failed otherwise. */
function refusedNamed(tally: PruneTally): void {
  if (tally.notPruned.length) {
    throw Object.assign(
      new Error(
        `wf prune: ${tally.notPruned.join(', ')} not pruned — ${tally.notPruned.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
      ),
      { exitCode: tally.failed ? 1 : 2 },
    );
  }
}

/** Each of `ids` judged for `wf prune`, removing nothing; a run it cannot judge is said and tallied. */
async function judged(e: Engine, ids: string[], how: { unmerged: boolean; artifacts: boolean }, tally: PruneTally): Promise<Pruning[]> {
  const found: Pruning[] = [];
  for (const id of ids) {
    try {
      found.push(await prune(e, id, how));
    } catch (err) {
      notPrunedLine(id, err, tally);
    }
  }
  return found;
}

/**
 * What `wf prune` found, a run's lines each. Of named runs, a refusal is tallied; of every run, a run with nothing to prune is not said at
 * all, and the runs not over are said in one line.
 */
function printFound(found: Pruning[], named: boolean, tally: PruneTally): void {
  const running = found.filter((p) => !named && p.kind === 'refused' && /\bit is not over\b/.test(p.refusal ?? ''));
  for (const p of found) {
    if (!named && (p.kind === 'nothing' || running.includes(p))) continue;
    for (const line of pruneLines(p)) console.log(line);
    if (named && p.kind === 'refused') tally.notPruned.push(p.id);
  }
  if (running.length)
    console.log(`${running.length} run${running.length > 1 ? 's' : ''} not over, not pruned: ${running.map((p) => p.id).join(', ')}`);
}

/** The runs `wf prune` removes once a person has said yes, each judged again as it is pruned, never trusted from the listing. */
async function prunedAll(e: Engine, prunable: Pruning[], how: { unmerged: boolean; artifacts: boolean }, tally: PruneTally): Promise<void> {
  for (const p of prunable) {
    try {
      const done = await prune(e, p.id, { ...how, yes: true });
      for (const line of pruneLines(done)) console.log(line);
      if (done.kind === 'refused' || done.left.length) tally.notPruned.push(p.id);
    } catch (err) {
      notPrunedLine(p.id, err, tally);
    }
  }
}

/** Whether `wf prune` removes `prunable`: on `--yes`, or a person's y; else it says the command that would, and removes nothing. */
async function removing(
  prunable: Pruning[],
  named: boolean,
  { unmerged, yes, artifacts }: { unmerged: boolean; yes: boolean; artifacts: boolean },
): Promise<boolean> {
  if (yes || (await confirmed('remove them? [y/N] '))) return true;
  console.log(
    `nothing removed: wf prune ${[...(named ? prunable.map((p) => p.id) : []), ...(unmerged ? ['--unmerged'] : []), ...(artifacts ? ['--artifacts'] : []), '--yes'].join(' ')} removes them`,
  );
  return false;
}

/**
 * `wf prune`: the space runs that are over hold, listed with its size and freed on `--yes` or a person's y. Named runs are judged each on
 * its own, a line each, a refusal included; with none, every run.
 */
export async function pruneVerb(rest: string[], e: Engine): Promise<void> {
  const { ids, unmerged, yes, artifacts } = pruneHow(rest);
  const named = ids.length > 0;
  const tally: PruneTally = { notPruned: [], failed: false };
  const found = await judged(e, named ? ids : listRuns().map((r) => r.id), { unmerged, artifacts }, tally);
  printFound(found, named, tally);
  const prunable = found.filter((p) => p.kind === 'prunable');
  if (!prunable.length) {
    if (!found.some((p) => p.kind === 'refused'))
      console.log(named ? 'nothing to prune' : `nothing to prune: no run that is over has a worktree${artifacts ? ' or files' : ''} left`);
    return refusedNamed(tally);
  }
  const total = sizeOf(prunable.reduce((sum, p) => sum + pruningBytes(p), 0));
  console.log(`${prunable.length} run${prunable.length > 1 ? 's' : ''} to prune, ${total} in all`);
  if (!(await removing(prunable, named, { unmerged, yes, artifacts }))) return refusedNamed(tally);
  await prunedAll(e, prunable, { unmerged, artifacts }, tally);
  return refusedNamed(tally);
}

/** `wf hold`: a run held until other runs ship, or with `--off` its hold lifted now. */
export async function holdVerb(rest: string[], e: Engine): Promise<void> {
  if (!rest[0] || rest[0].startsWith('-'))
    usage('wf hold takes the run first: wf hold <runId> --until <runId> [--until <runId> ...], or wf hold <runId> --off.');
  const { until, off } = holdHow(rest.slice(1));
  if (off) {
    const { run } = unhold(rest[0]);
    return console.log(`${run.id}  hold lifted — the next tick goes on, and what its steps ask is asked`);
  }
  const { run } = await hold(e, rest[0], until);
  return console.log(
    `${run.id}  ${holdWord(until.map((u) => ({ run: u })))} — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
  );
}

/** `wf show`: the run's record as JSON, its brief and each step's body cut short. */
export function showVerb(rest: string[]): void {
  if (!rest[0]) return console.log(HELP);
  const run = readRun(rest[0]);
  const workflow = run.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  console.log(JSON.stringify({ ...run, brief: `${run.brief.slice(0, 120)}…`, workflow }, null, 2));
  return;
}

/** `wf logs`: a step's session output, from the engine, or that it has not run yet. */
export async function logsVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, stepName] = rest;
  if (!runId || !stepName) return console.log(HELP);
  const taskId = readRun(runId).steps[stepName]?.taskId;
  if (!taskId) return console.log(`${stepName} has not run yet`);
  return console.log(await e.logs(taskId));
}

/** `wf agents card`: the agent in the shape of an A2A Agent Card, alone on stdout so `| jq` reads it, and what it is not on stderr. */
function agentsCard(args: string[]): void {
  const [name, ...flags] = args;
  if (!name || name.startsWith('--')) return console.log(HELP);
  const how = agentsHow(flags);
  const { from, dir, agent } = findAgent(name, how.repo ?? '.', how.from);
  const found = agentSkillsFound(dir, how.repo ?? '.');
  const version = agentVersion(dir, name, found)!;
  console.log(JSON.stringify(agentCard(agent, version, cardSkills(agent, found)), null, 2));
  console.error(
    `${name} (${from}) — a card, not an address: nothing here serves this agent over A2A, so it declares no interfaces and no security schemes.`,
  );
}

/** One agent's lines on `wf agents`: what it is for, what it says it can do, and the skills it is given; or why it does not read. */
function printAgent({ from, dir, name, agent }: ReturnType<typeof listAgents>[number], repo: string): void {
  if (agent instanceof Error) {
    console.log(`${name}  ${from}  does not read: ${agent.message.split('\n')[0]}`);
    return;
  }
  console.log(`${name}  ${from}  ${agent.description ?? 'no description:'}`);
  let card: Array<{ id: string; name: string; description: string }>;
  try {
    card = cardSkills(agent, agentSkillsFound(dir, repo));
  } catch (err) {
    console.log(`   says nothing it can do — ${(err as Error).message.split('\n')[0]}`);
    card = [];
  }
  for (const skill of card) console.log(`   ${skill.id}  ${skill.name} — ${skill.description}`);
  if (agent.skills?.length) console.log(`   given the skills ${agent.skills.join(', ')}`);
  if (agent.systemPrompt !== undefined && agent.systemPrompt !== 'default') console.log(`   system prompt: ${agent.systemPrompt}`);
}

/** `wf agents`: the agents a step may name, the repository's then yours, and `wf agents card`. */
export function agentsVerb(rest: string[]): void {
  const [sub, ...args] = rest;
  if (sub === 'card') return agentsCard(args);
  if (sub !== undefined && sub !== '--repo' && sub !== '--from') return console.log(HELP);
  const how = agentsHow(rest);
  const agents = listAgents(how.repo ?? '.');
  if (!agents.length)
    return console.log(
      `no agents — an agent is a file in <workflows>/agents: ${agentPlaces(path.resolve(how.repo ?? '.'))
        .map((p) => p.dir)
        .join(' or ')}`,
    );
  for (const one of agents) printAgent(one, how.repo ?? '.');
  console.log(`\none in A2A's shape: wf agents card <name>`);
}
