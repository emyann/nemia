/**
 * `nemia policy reach <agent> (--factory <name> | --run <runId>)`: which steps at their gate an agent's rules in force could ever approve,
 * asked of the api (`GET /api/policy/:name/reach?factory|run`), and the lines it prints of what it answers (`PolicyReach`).
 */
import { POLICY_REACH_WORDS, type Args, type PolicyReach } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';

/** One step at its gate, as the reach answers it. */
type Row = PolicyReach['gates'][number];

/** What a row says of its step: who reaches it, else why none can. */
function rowLines(row: Row) {
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

/**
 * The lines `nemia policy reach` prints.
 * @param r The reach the api answers: the agent, the factory or run read, each step at its gate, and the rules suggested.
 */
function reachLines(r: PolicyReach) {
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

/**
 * `nemia policy reach`'s runner: the factory `--factory` names, or the run `--run` does, sent as the reach's query.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function policyReach(args: Args) {
  const name = textArg(args, 'name') ?? '';
  const factory = textArg(args, 'factory');
  const run = textArg(args, 'runId');
  const query = { ...(factory !== undefined && { factory }), ...(run !== undefined && { run }) };
  said(reachLines(await asked(POLICY_REACH_WORDS.name, (c) => c.nemia.reach({ params: { name }, query }))));
  return 0;
}
