/**
 * The flag reader every verb's parser calls, and what the families share beneath the verbs: the help, a verb's shape, a usage refusal, a
 * person's yes.
 */
import readline from 'node:readline/promises';
import { COMMANDS, Invalid, helpOf, type engine } from '../runner.ts';

/** The engine the verbs talk to: the board under `WF_ROOT`, unless a test hands one of its own. */
export type Engine = ReturnType<typeof engine>;

/** A verb: it takes what follows it on the command line and the engine, and prints what it did, or throws a refusal. */
export type Verb = (rest: string[], e: Engine) => void | Promise<void>;

/** What `wf` prints for no verb, for a verb it does not know, and for a verb given too little to act on. */
export const HELP = `wf — run a workflow of agent steps

  wf start <brief.md|card.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--input <file> ...] [--gate <step> ...] [--factory <name>] [--brief "<brief>"]
                               --after <runId>: file nothing of this run until wf decide says that
                               run has shipped — finished, and its result branch on the base
                               branch — and start from the base as it is then; once per run.
                               --gate <step>: that step's closeout waits for wf approve before
                               anything after it is filed, as a step's own gate: true does; once
                               per step. An inbox card's gate: <step> is one more
                               --workflows takes a folder, or a name under <repo>/workflows/: dev
                               a card of a plan (wf plan --help) starts its body: --workflows is its
                               workflow: unless given, and its after: needs an --after for each
                               --input <file>: copied into the run's own inputs/ directory, and named
                               on every step's brief under what was asked for; once per file
                               --factory <name>: the workflow must be attached to the factory, whose
                               hires fill its steps, and a step left with no agent is refused (wf
                               factory --help). A factory with one repository gives the run its
                               --repo, and a repository not one of the factory's is refused, naming
                               them. Without it, the run is started in the factory whose repository
                               holds --repo, else where wf start is typed, on that repository, when
                               one factory alone does; none, or two, is refused, naming the fix.
                               The default factory is history only: --factory default is refused
                               a card of the inbox (wf inbox --help) starts its body, or --brief
                               "<brief>" in its place, and leaves the inbox: --workflows is its workflow:
                               unless given, --repo its repo:, --factory its factory:, and a card
                               that names no factory either way is refused
  wf plan <folder> [--repo .] [--factory <name>]
                               start a plan: one run per card in the folder, parents first, each
                               --after the runs of the cards its after: names, in the factory as
                               wf start finds it (wf plan --help)
  wf inbox                     the cards parked before they are started: name, first line, workflow
                               and repo when set, and started as <runId> (wf inbox --help)
  wf inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>]
                               park an idea as a card in the inbox, named from its first line
  wf inbox queue <name> [--workflow <w>] [--off]
                               mark a card to start on its own: the tick starts the oldest queued
                               card once a run slot is free; --off takes the mark back
  wf inbox rm <name>           drop a card without starting it
  wf factory [ls]              the store's factories: the default first — every run and card that
                               names no factory, read, never written — then each by name with its
                               repositories (wf factory --help)
  wf factory add <name> --repo <path> [--repo <path> ...]
                               file a factory: a lowercase slug naming one or more directories
  wf factory attach <factory> <workflow>
                               offer a workflow in a factory, by its folder's name: a factory offers
                               only the workflows attached to it
  wf factory detach <factory> <workflow>
                               take a workflow back, once no hire fills its steps
  wf factory hire <factory> <agent> --step <workflow>/<step>
                               hire an agent into a workflow's step: one a step, a second replaces it
  wf factory fire <factory> --step <workflow>/<step>
                               take a step's hire back
  wf factory rm <name>         remove a factory's file
  wf tick [--stats]            one pass: tick the engine, file what became ready — refused while a
                               daemon ticks the store, since it runs the same pass (daemon.json);
                               --stats says after it what the pass cost, phase by phase
  wf up [ms]                   the headless daemon: the same, on a timer (4000 unless given; whole
                               ms, 1 to 2147483647), where no board is served. The api's process
                               (npm start in apps/api) is the daemon where one is: one store takes
                               one, and each is refused while the other ticks. It takes the store
                               over once its holder's process is gone or it has been silent for
                               10 intervals, at least 15 minutes; it writes WF_ROOT/daemon.json —
                               who holds it, pid, start, last pass, and a beat each interval;
                               once a minute, a line of what its passes cost (tick-stats.json)
  wf up --stats                what the last pass cost, phase by phase — read, not run, so it fits
                               while a daemon holds the store; where none does, wf tick --stats
  wf stats [--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [--line|--json]
                               what every run in the store adds up to, by UTC day: rounds to
                               acceptance of each loop: step, landings of the workspace: main step
                               and on which try, cost and time per landed run, and each step's
                               tries, time, cost, checks and gate waits; first the last 14 days
                               against the 14 before. A number nothing measured reads —, never 0.
                               --line: one line, for a recap; --json: the whole answer
  wf feed [cursor]             what the tick judged, a line each time it changed: a run's status, a
                               step's word as wf ls says it, and what a person's word changed — then
                               cursor: <n>, to read on from with wf feed <n>; from the start with none
  wf watch [cursor]            the same, followed as the tick writes it, until ^C
  wf cancel <runId>            stop what it has in flight; file nothing more
  wf rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]
                               forget runs that are over, a line each: a run's worktrees removed
                               through git, what one held uncommitted committed first, then its
                               record and every file under WF_ROOT keyed by its id. Refused while
                               a task of it is in flight, anything is due to be filed or asked
                               for, or a run waiting on it has not started. Its branches are kept:
                               --delete-branches deletes those merged into the run's base branch,
                               and --force-unmerged beside it the others, with their work
  wf prune [<runId> ...] [--unmerged] [--artifacts] [--yes]
                               free the space runs that are over hold: their worktrees, removed
                               through git, and nothing else — each run's record, branches and
                               files are kept, and it stays on wf ls, wf decide and the board,
                               marked pruned. --artifacts removes its files too (runs/<id>/
                               artifacts/: screenshots, logs), of a run whose worktrees are
                               already gone as well; its record and branches are still kept.
                               Lists what it would remove, with its size, and removes it on
                               --yes, or on y at the prompt. With no run, every run. Refused
                               while a run is not over, owes a hand-off, is a folder run, or has
                               a worktree locked, on no branch, or with changes no commit has;
                               and a finished run not merged unless --unmerged, with --artifacts
                               as without: its files are what a person reads to decide it
  wf hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]
                               file nothing more of a run until other runs ship, as --after would
                               have: what is in flight finishes, nothing new is filed, and nothing
                               is asked of you — wf ls and wf decide say held until <run> ships, and
                               what a step asks is asked once the hold lifts. The tick lifts it when
                               every run named has shipped. Refused of a run cancelled, pruned,
                               finished or already held, and of a run named that is unknown, the run
                               itself, or one that already waits on it, through --after or a hold.
                               --why: the reason, shown beside held until <run> ships wherever it is
                               said; --by: who puts the hold (default: your OS user)
  wf hold <runId> --off        lift the hold now: the next tick goes on as if it had never been put
  wf decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (wf decide --help)
${helpOf(COMMANDS)}
  wf show <runId>              the run, and what each step was told
  wf logs <runId> <step>       that step's session output
  wf agents custom <name> [--file <path>|-] [--clear] [--repo .]
                               your custom instructions for that agent: words you add to it without
                               rewriting it, kept in <store>/custom-instructions/<name>.md and told
                               after its instructions. Bare, prints them; --file writes them (- for
                               stdin); --clear removes them. Words only: a frontmatter block is
                               refused. A run keeps the words it was started with

A workflow is a folder of markdown files. One file is one step:

    ---
    harness: codex        # claude (default) | codex | claude-detached
    after: implement      # what must finish first: verified, or unverified if it has no check
    output: review.json   # what its closeout declares for a later step: a JSON Schema beside it
    loop: implement       # again: true in its closeout runs implement again, then this step
    rounds: 3             # at most this many rounds (3 unless set), then a person decides
    ---
    Review the change in this workspace as a second engineer would.

No key is control flow: \`after\` orders, \`resume\` continues, \`check\` measures, \`retries\` counts the
tries the run may re-file a step its check refused, \`gate\` holds a step's handoff for a person's wf approve,
\`denials\` holds one whose try the harness denied a call, \`output\` declares what a closeout says for a later step and \`input\` reads it, \`loop\` is the edge back
and \`rounds\` counts it — whether to go round is the step's own \`again\` — and the rest (model, effort,
permissionMode on Claude Code, sandbox on Codex, tools, disallowedTools, allowedTools, background, remote, deadlineSeconds, budget) say who does the work, with
what, who may drive it, for how long and for how much. Everything else the agent is told is prose.

  wf ls says what the run established: verified ✓ · checking · failed ✗ check (exit N)
  · unverified (no check: declared) · unsigned (ended without its closeout, or without a field its
  output: declares) · BLOCKED · rounds exhausted (asked for another round on the last)
  · over budget $4.20 of $3 (its tries have cost their budget: or more, and nothing more is filed for
  it on the run's word) · budget exhausted (its harness ended its session at its budget:)
  · denied (its harness denied its try a call, and the step says denials: fail: nothing after it is filed)
  · awaiting approval (at its gate: nothing after it is filed until wf approve — and, on an ending step
  that runs in the repository's checkout, nothing of it at all until then).

  → to decide names a run at its result that nobody has decided: its ending step's gate, in the folder's
  words, with the wf approve that runs it — or, in a folder with no ending step, its branch ahead of the
  base branch with nothing having merged it.

  WF_ROOT            where runs and the engine's board live, an absolute path (default ~/.agent-workflows)
  WF_MAX_CONCURRENT  sessions at work per pool at once, a whole number from 1 (default 2): claude and
                     claude-detached one pool, codex and checks their own; a blocked session holds no
                     slot; one run's review competes with another run's implement
  WF_MAX_RUNS        runs in flight at once (unset or 0: no cap): a run with nothing filed waits for a
                     slot, oldest first; a run waiting on --after counts once it is filed; a run of a
                     one-step workflow that says slot: none is not counted and never waits for one

wf watch follows what the workflow decides: a step at its gate, one blocked, a run waiting on another,
done. To follow what the engine does under it — each attempt started, ended, settled — use the engine:
a run's task ids carry the run and the step, so its output already names the work. Point it at this board:

    AE_ROOT="\${WF_ROOT:-$HOME/.agent-workflows}/engine" ae watch`;

export const usage = (message: string): never => {
  throw new Invalid({ message });
};

/**
 * How a verb reads its flags: the value flags it takes and what each takes, as its refusal says it; its switches; the value flags it takes
 * more than once; flags it refuses with a reason of their own; and the refusals of an argument it does not take and of a flag given twice.
 */
type FlagRules = {
  takes: Readonly<Record<string, string>>;
  switches?: readonly string[];
  repeats?: readonly string[];
  refuses?: Readonly<Record<string, string>>;
  unknown: (arg: string) => string;
  twice: (flag: string) => string;
};

/**
 * A verb's flags after its one positional argument — `wf start`'s and `wf plan`'s — each value flag also as `--flag=<value>`. Anything else
 * is refused before anything is read: a flag the verb does not take, a misspelt one, a value flag with no value or given twice, and a
 * second positional: dropped instead, a misspelt `--after` would start a run that waits on nothing, filed on the next pass.
 */
export function readFlags(argv: string[], rules: FlagRules): { values: Record<string, string[]>; switches: string[] } {
  const values: Record<string, string[]> = {};
  const switches: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (rules.switches?.includes(arg)) {
      switches.push(arg);
      continue;
    }
    const joined = arg.startsWith('--') && arg.includes('=');
    const name = joined ? arg.slice(0, arg.indexOf('=')) : arg;
    if (rules.refuses && Object.hasOwn(rules.refuses, name)) usage(rules.refuses[name]);
    if (!Object.hasOwn(rules.takes, name)) usage(rules.unknown(arg));
    const value = joined ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
    if (!value || (!joined && value.startsWith('--'))) usage(`${name} takes ${rules.takes[name]}`);
    if (values[name] && !rules.repeats?.includes(name)) usage(rules.twice(name));
    (values[name] ??= []).push(value);
  }
  return { values, switches };
}

/** A person's yes, asked on the terminal: false with no terminal to ask on, and for anything but y or yes. */
export async function confirmed(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}
