/**
 * The verbs over runs and agents — `wf rm`, `wf prune`, `wf hold` and `wf agents` — as their flags: what each takes, read off the command line.
 */
import { type AgentPlace, type ForgetHow } from '../runner.ts';
import { usage, readFlags } from './flags.ts';

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
