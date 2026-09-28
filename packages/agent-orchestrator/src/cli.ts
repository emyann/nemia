/**
 * The verbs. Parse, call, print — no logic lives here.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
  addPass,
  breakdownLines,
  lastPassCost,
  summaryDue,
  summaryLine,
  type Interval,
  AGENT_FACING,
  CHECK_AFFECTING,
  Conflict,
  Invalid,
  LESSON,
  accept,
  feedCursorRefusal,
  feedLineWords,
  readFeed,
  watchFeed,
  prune,
  pruneLines,
  pruningBytes,
  prunedKept,
  prunedWords,
  sizeOf,
  type Pruning,
  approve,
  approvedFirst,
  hold,
  holdAdvice,
  holdWord,
  unhold,
  branchWord,
  checkoutLine,
  endingSteps,
  merges,
  sendBackTo,
  toDecideWords,
  approvalWordsRefusal,
  ceilingLines,
  ceilings,
  queueInInbox,
  queueLine,
  ignoredRepoLine,
  refusalLines,
  runSlots,
  slotWord,
  HOME,
  beat,
  daemonLine,
  daemonStanding,
  everyOf,
  passed,
  releaseStore,
  stillHeld,
  storeRefusal,
  takeStore,
  takenFromLine,
  takeoverLine,
  addToInbox,
  dropFromInbox,
  fromNote,
  gatesOf,
  inboxDir,
  inboxLines,
  inboxNameAt,
  noCardLine,
  onYouWords,
  readInbox,
  startFromInbox,
  workflowAt,
  artifactFiles,
  budgetRefusal,
  budgetWord,
  artifactLines,
  artifacts,
  artifactsDir,
  branchReader,
  branchesToRead,
  cancel,
  cardToStart,
  decide,
  diffStat,
  dueNote,
  engine,
  forget,
  forgetLine,
  inFullLines,
  inputsDir,
  isGitRun,
  inputsNote,
  lessonLine,
  list,
  unjudgedOf,
  listRuns,
  messageRefusal,
  missingArtifacts,
  namesInOrder,
  outputLines,
  owedFields,
  parseGlobs,
  planLines,
  planStopped,
  readArtifact,
  readRun,
  resultBranches,
  retry,
  round,
  roundDueNote,
  saidLines,
  say,
  signoffsSpent,
  sensitiveDiff,
  start,
  startPlan,
  stepsOf,
  tick,
  timelineLines,
  timelineTotalLines,
  touchedBy,
  touchedLines,
  tryNote,
  usedLines,
  verdictWord,
  waitAdvice,
  waitWord,
  type AgentPlace,
  agentPlaces,
  agentSkillsFound,
  cardSkills,
  findAgent,
  formerKeyLines,
  listAgents,
  type ForgetHow,
  type RetryHow,
  type RetryMode,
  agentVersion,
  viewedOnce,
  workflowFolder,
} from './runner.ts';
import { agentCard, dollarsOf } from './workflow.ts';

const HELP = `wf — run a workflow of agent steps

  wf start <brief.md|card.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--input <file> ...] [--gate <step> ...] [--brief "<brief>"]
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
                               a card of the inbox (wf inbox --help) starts its body, or --brief
                               "<brief>" in its place, and leaves the inbox: --workflows is its workflow:
                               unless given, --repo its repo:
  wf plan <folder> [--repo .]  start a plan: one run per card in the folder, parents first, each
                               --after the runs of the cards its after: names (wf plan --help)
  wf inbox                     the cards parked before they are started: name, first line, workflow
                               and repo when set, and started as <runId> (wf inbox --help)
  wf inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>]
                               park an idea as a card in the inbox, named from its first line
  wf inbox queue <name> [--workflow <w>] [--off]
                               mark a card to start on its own: the tick starts the oldest queued
                               card once a run slot is free; --off takes the mark back
  wf inbox rm <name>           drop a card without starting it
  wf tick [--stats]            one pass: tick the engine, file what became ready — refused while a
                               wf up ticks the store, since it runs the same pass (daemon.json);
                               --stats says after it what the pass cost, phase by phase
  wf up [ms]                   the same, on a timer (4000 unless given; whole ms, 1 to 2147483647),
                               holding the store: a second wf up is refused while this one ticks,
                               and takes the store over once its process is gone or it has been
                               silent for 10 intervals, at least 15 minutes; it writes
                               WF_ROOT/daemon.json — pid, start, last pass, and a beat each interval;
                               once a minute, a line of what its passes cost (tick-stats.json)
  wf up --stats                what the last pass cost, phase by phase — read, not run, so it fits
                               while a wf up holds the store; where none does, wf tick --stats
  wf ls [runId]                runs and their steps — a run waiting on another says waiting on <run>,
                               one the cap on runs in flight holds waiting for a run slot (2 of 2 in
                               flight); what each step's tries and the run have cost, where measured;
                               last, whether a wf up ticks the store and when its last pass was
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
  wf hold <runId> --until <runId> [--until <runId> ...]
                               file nothing more of a run until other runs ship, as --after would
                               have: what is in flight finishes, nothing new is filed, and nothing
                               is asked of you — wf ls and wf decide say held until <run> ships, and
                               what a step asks is asked once the hold lifts. The tick lifts it when
                               every run named has shipped. Refused of a run cancelled, pruned,
                               finished or already held, and of a run named that is unknown, the run
                               itself, or one that already waits on it, through --after or a hold
  wf hold <runId> --off        lift the hold now: the next tick goes on as if it had never been put
  wf decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (wf decide --help)
  wf retry <runId> <step> [--nudge | --fresh | --model <m> | --recheck] [--message "<answer>"] [--budget <amount>]
                               try a step waiting on you again, once, on the next tick:
                               --nudge (default) continues its session, told what happened;
                               --fresh a new session on its branch; --model <m> the same, on m;
                               --recheck runs its check again, and files no session;
                               --message "<answer>" goes into the try's brief, as ## Your answer:
                               for a step that signed off blocked, the answer to its needs — or
                               what you have to say to any step you try again; not with --recheck.
                               The next argument is the answer, whatever it starts with; an answer
                               that is only one of these flags' names goes as --message=<answer>;
                               --budget <amount>: for a step over budget or budget exhausted, its
                               cap raised to that many dollars, above what its tries have cost
  wf approve <runId> <step> [--message "<words>"]
                               let a step waiting at its gate hand on: what waits on it is filed on
                               the next tick, and every step after the gate is handed your words
                               under ## Approved. To send it back instead, with what to change:
                               wf retry <runId> <step> --message "<objection>"
  wf round <runId> [<step>] [--budget <amount>]
                               once more: a loop out of rounds goes round again, once, on the
                               next tick — the step it loops to continued, then a new reviewer;
                               --budget raises the cap of a step of the loop over its budget
  wf accept <runId> [<step>] --message "<why>"
                               enough: a loop out of rounds ends on your word, with its findings
                               open. What waits on the looping step is filed on the next tick as
                               if it had said again: false — a gated ending goes to its gate —
                               and every step after the loop is handed your words and those
                               findings under ## Accepted. The other answer to wf round
  wf say <runId> <step> "<words>"
                               tell a step's running session something, through its harness: the
                               engine journals the words on the step's task, wf ls notes the step
                               said to, and wf decide prints them under it. A try that continues
                               the session is handed them again, as ## Said to your session
  wf show <runId>              the run, and what each step was told
  wf logs <runId> <step>       that step's session output
  wf agents [--repo .]         the agents a step may name, the repository's then yours: what each is
                               for, what it says it can do (an entry for each skill, read off its
                               SKILL.md), and the skills it is given (its skills:)
  wf agents card <name> [--repo .] [--from repo|yours]
                               that agent in the shape of an A2A Agent Card, JSON on stdout and
                               nothing else — every field the protocol marks REQUIRED but
                               supportedInterfaces, which is left out because nothing here serves an
                               agent over A2A. The card describes; it is not an address

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

  WF_ROOT            where runs and the engine's board live
  WF_MAX_CONCURRENT  sessions at work per pool at once (default 2): claude and claude-detached one pool,
                     codex and checks their own; a blocked session holds no slot; one run's review
                     competes with another run's implement
  WF_MAX_RUNS        runs in flight at once (unset or 0: no cap): a run with nothing filed waits for a
                     slot, oldest first; a run waiting on --after counts once it is filed; a run of a
                     one-step workflow that says slot: none is not counted and never waits for one

wf watch follows what the workflow decides: a step at its gate, one blocked, a run waiting on another,
done. To follow what the engine does under it — each attempt started, ended, settled — use the engine:
a run's task ids carry the run and the step, so its output already names the work. Point it at this board:

    AE_ROOT="\${WF_ROOT:-$HOME/.agent-workflows}/engine" ae watch`;

const usage = (message: string): never => {
  throw new Invalid({ message });
};

/** What `wf` exits with on what `main` threw: its `exitCode` when that is a whole number from 1 to 255, and 1 otherwise. */
export const exitCodeOf = (thrown: unknown): number => {
  const code = (thrown as { exitCode?: unknown } | null | undefined)?.exitCode;
  return typeof code === 'number' && Number.isInteger(code) && code > 0 && code <= 255 ? code : 1;
};

const PLAN_HELP = `wf plan <folder> [--repo .]

Start a plan: one run per card in the folder, parents first, each waiting on the runs of the cards it names.
That is the record wf start --after writes, so the tick files a card's run once its parents have shipped, and
every card is a decision at its own wf decide. Nothing else is written: the runs and their after are the plan.
It prints a line per card: the card, its run, its workflow, and what it waits on.

A card is one markdown file, <card>.md, and README.md beside the cards says what the plan is for:

    ---
    workflow: dev     # a workflow under <repo>/workflows/, or a path from the plan folder
    after: b, c       # the cards whose runs ship first; without it, the card starts at once
    ---
    Put the flag on the settings page, now that it is parsed and stored.

The body is the run's brief. Refused by name before any run is started: a key a card does not have, a card
with no workflow: or an empty body, an after: naming a card the folder does not have, cards that wait on
each other, a file that is not .md, a folder with no card, and a card whose workflow does not load.

The folder says what --after, --workflows and --no-worktree would, and wf plan refuses them. A wf start that
refuses part-way stops the plan: the runs it started stand, and it prints a wf start for each card left.`;

const INBOX_HELP = `wf inbox
wf inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>]
wf inbox queue <name> [--workflow <w>] [--off]
wf inbox rm <name>

An inbox is cards before they are started: \${WF_ROOT:-~/.agent-workflows}/inbox/, one <name>.md per card, beside
runs/. A card is a plan's card with two differences — its keys optional, and no after:, since what it waits on
is said at start:

    ---
    workflow: dev              # what runs it, chosen at start when the card does not say
    repo: /home/me/code/app    # the repository it is about, as an absolute path
    queued: 2026-09-16T10:00:00.000Z   # when it was queued to start on its own: wf inbox queue writes it
    gate: plan                 # the step whose closeout waits for wf approve in the run it starts
    ---
    Cache the engine's views between passes.

  wf inbox       lists each card: its name, the first line of its body, its workflow and repo when set, and
                 started as <runId> for a card a run's record says it was started as — a card whose removal failed.
                 An entry that does not read as a card is listed with why.
  wf inbox add   files an idea, text or a file, named with the slug a run id makes of its first line, suffix and
                 all; --workflow and --repo write the keys, over a file's own.
  wf inbox queue marks a card to start on its own: each pass, once every run has been advanced and a run slot is
                 free (WF_MAX_RUNS; always, with no cap), the tick starts the oldest queued card, one per pass, on its
                 workflow: and its repo: or the directory wf up runs in. --workflow writes the key too; --off, or
                 wf inbox rm, takes the card back. wf inbox says queued and its place; a start the package refused
                 is said there and on wf up's line, and the card is not tried again until it is edited or queued again
                 (or, naming no repo:, wf up runs in another repository); a start that failed otherwise is said once,
                 and tried again on the next pass.
  wf inbox rm    drops a card without starting it. A name with no card says so, and which cards there are.

Refused by name: a key a card does not have, a key set to nothing, a repo: that is not an absolute path to a
directory, a queued: that is not a time or is on a card with no workflow:, a gate: naming more than one step or
saying true — and, at start, one naming no step of the workflow — an add with no idea, and a name that would
leave the folder; and a queue of a name with no card, of a card with no workflow and no --workflow, of one
already queued, and of one a run was started from.`;

const DECIDE_HELP = `wf decide <runId> [--sensitive <globs>]

What the run produced, and the choice it leaves you. It reports facts and runs nothing. On a run waiting
on you, after the run's verdicts and before each step's closeout:

  touched   what each result branch changed against the run's base: files and lines by workspace
            package or top-level directory, then, each only when true, the agent-facing files and
            the check-affecting ones
  lesson    whether the run changed a file where the next agent reads, or that it wrote nothing there
  in full   the whole diff of the check-affecting files: what a change could edit to make its check pass

and beside each step's check, what its session consumed — used, cost — or that nobody measured it, then
its timeline: for each try's session and each try's check, when it was filed, spawned and ended (UTC), how
long it queued for a slot and how long it ran; after the steps, each round's and the run's totals. Under
each step, before its closeout, what a person said to its sessions while they ran (wf say), with when.
Under a gated step's name, its gate: approved, when and with what words — or awaiting approval, with the
wf approve that lets what follows be filed and the wf retry --message that sends it back.

Last, the result: where each branch stands against the base branch — on it, ahead by N commits, gone —
and then what is left to decide. A workflow whose last step is an ending, gated, says in its own prose
what happens when the work is done; that prose is printed with the wf approve that runs it and the wf
retry --message that sends the work back. A workflow with no such step ends by handing you a branch, and
the git commands are printed instead: ship it, drop it. Neither is run.

  --sensitive <globs>  comma-separated globs whose changed files are printed in full instead, for this
                       screen; the touched lines still say which files are check-affecting

  check-affecting, the default --sensitive:  ${CHECK_AFFECTING.join(', ')}
  agent-facing:                              ${AGENT_FACING.join(', ')}
  where the next agent reads:                ${LESSON.join(', ')}, and <workspace>/docs/ for each
                                             npm workspace in the base's package.json — not any docs/

A workspace glob is read as npm reads it, ./packages/* as packages/*. One with ** is named on the screen,
and a file still counts once: in the outermost package on its way, and as a lesson only in its docs/.

A glob is a path from the repository root: * and ? stay within a directory, ** crosses any number of
them (a leading **/ crosses none as well), and a trailing / takes everything below.`;

/** `wf decide`'s one flag: `--sensitive`, once, with at least one glob. Anything else is refused before a run is read. */
function decideHow(argv: string[]): { sensitive?: string[] } {
  let sensitive: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== '--sensitive')
      usage(`wf decide does not take ${arg}. It takes the run and, at most once, --sensitive <globs> (wf decide --help).`);
    if (sensitive) usage('wf decide takes --sensitive once: put every glob in it, comma-separated, as in --sensitive "src/**,*.json".');
    const value = argv[++i];
    const globs = value === undefined || value.startsWith('--') ? [] : parseGlobs(value);
    if (!globs.length)
      usage(
        '--sensitive takes the globs whose changed files to print in full, comma-separated: wf decide <runId> --sensitive "src/**,*.json".',
      );
    sensitive = globs;
  }
  return { sensitive };
}

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
 * A verb's flags after its one positional argument — `wf start`'s and `wf plan`'s — each value flag also as `--flag=<value>`. Anything else is
 * refused before anything is read: a flag the verb does not take, a misspelt one, a value flag with no value or given twice, and a second
 * positional: dropped instead, a misspelt `--after` would start a run that waits on nothing, filed on the next pass.
 */
function readFlags(argv: string[], rules: FlagRules): { values: Record<string, string[]>; switches: string[] } {
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

type StartHow = { workflows?: string; repo?: string; isolate: boolean; after: string[]; inputs: string[]; gates: string[]; brief?: string };

/** What each of `wf start`'s value flags takes, as its refusal says it. */
const START_TAKES = {
  '--workflows': 'the workflow folder: wf start <brief> --workflows <dir>',
  '--repo': 'the repository the run works on: wf start <brief> --repo <r>',
  '--after': 'the run this one waits on, by its id: wf start <brief> --after <runId> [--after <runId> ...]',
  '--input': "a file to hand the run's steps: wf start <brief> --input <file> [--input <file> ...]",
  '--gate':
    'the step whose closeout waits for a person before anything after it is filed: wf start <brief> --gate <step> [--gate <step> ...]',
  '--brief':
    'what the run is asked to do in place of an inbox card\'s body, as text or a file: wf start <inbox>/<name>.md --brief "<brief>"',
} as const;

/**
 * `wf start`'s flags, after the brief: `--workflows <dir>`, `--repo <r>`, `--after <runId>` as often as there are runs to wait on, `--input <file>`
 * as often as there are files to hand its steps, `--gate <step>` as often as there are steps to gate, and `--no-worktree`.
 */
function startHow(argv: string[]): StartHow {
  const { values, switches } = readFlags(argv, {
    takes: START_TAKES,
    switches: ['--no-worktree'],
    repeats: ['--after', '--input', '--gate'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --input <file> once per file to hand its steps; --gate <step> once per step to gate; and, for an inbox card, --brief "<brief>".`
        : `wf start takes one brief, and ${arg} is a second. Quote a brief with spaces — wf start "<brief>" — or give it as a file: wf start ./brief.md.`,
    twice: (flag) =>
      `wf start takes ${flag} once: a run ${flag === '--brief' ? 'is asked one thing' : `works on one ${flag === '--repo' ? 'repository' : 'workflow'}`}.`,
  });
  return {
    workflows: values['--workflows']?.[0],
    repo: values['--repo']?.[0],
    isolate: !switches.length,
    after: values['--after'] ?? [],
    inputs: values['--input'] ?? [],
    gates: values['--gate'] ?? [],
    ...(values['--brief'] ? { brief: values['--brief'][0] } : {}),
  };
}

/**
 * `wf plan`'s one flag, after the folder: `--repo <r>`. `wf start`'s others are refused by name, each with why the folder says it instead;
 * and anything else, as `wf start` refuses it.
 */
function planHow(argv: string[]): { repo?: string } {
  const { values } = readFlags(argv, {
    takes: { '--repo': 'the repository the plan works on: wf plan <folder> --repo <r>' },
    refuses: {
      '--after':
        'wf plan does not take --after: each card says what it waits on, in its after:, and the folder is the whole plan. To wait on a run already started, start the card by hand: wf start <card.md> --workflows <dir> --after <runId>.',
      '--workflows':
        'wf plan does not take --workflows: each card names its own, in its workflow: — a folder under <repo>/workflows/, or a path from the plan folder.',
      '--input':
        'wf plan does not take --input: a card has no input files of its own. Start that card by hand with its files: wf start <card.md> --workflows <dir> --input <file>.',
      '--gate':
        "wf plan does not take --gate: a plan's cards are gated by their workflows' own gate: true. To gate one card's run at a step, start that card by hand: wf start <card.md> --workflows <dir> --gate <step>.",
      '--no-worktree':
        'wf plan does not take --no-worktree: a card another waits on ships a result branch, and a run that works on its base branch has none, so every card after it would wait for ever.',
    },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf plan does not take ${arg}. It takes the plan folder, then --repo <r>.`
        : `wf plan takes one folder, and ${arg} is a second. A plan is every card in one folder: wf plan <folder> --repo <r>.`,
    twice: () => 'wf plan takes --repo once: a plan works on one repository.',
  });
  return { repo: values['--repo']?.[0] };
}

/** `wf agents`' flags: `--repo <r>` once, and for a card `--from repo|yours` once, when both places have an agent of that name. */
function agentsHow(argv: string[]): { repo?: string; from?: AgentPlace } {
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

/** `wf inbox queue`'s flags, after the card's name: `--workflow <w>` once, and `--off` — not both. */
function inboxQueueHow(argv: string[]): { workflow?: string; off: boolean } {
  const { values, switches } = readFlags(argv, {
    takes: { '--workflow': 'the workflow the card starts on, by name or as a path: wf inbox queue <name> --workflow <w>' },
    switches: ['--off'],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf inbox queue does not take ${arg}. It takes the card's name, then --workflow <w>, or --off to take the card back.`
        : `wf inbox queue queues one card, and ${arg} is a second: wf inbox queue <name>, once per card.`,
    twice: () => 'wf inbox queue takes --workflow once: a card starts on one workflow.',
  });
  const workflow = values['--workflow']?.[0];
  if (switches.length && workflow !== undefined)
    usage('--off takes the card out of the queue, and --workflow writes what starts it: give one of them.');
  return { ...(workflow !== undefined ? { workflow } : {}), off: switches.length > 0 };
}

/** `wf inbox add`'s flags, after the idea: `--workflow <name>` and `--repo <path>`, once each. */
function inboxAddHow(argv: string[]): { workflow?: string; repo?: string } {
  const { values } = readFlags(argv, {
    takes: {
      '--workflow': 'the workflow to start the card on, by name or as a path: wf inbox add "<idea>" --workflow <name>',
      '--repo': 'the repository the idea is about: wf inbox add "<idea>" --repo <path>',
    },
    unknown: (arg) =>
      arg.startsWith('-')
        ? `wf inbox add does not take ${arg}. It takes the idea, then --workflow <name> and --repo <path>.`
        : `wf inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — wf inbox add "<idea>" — or give it as a file: wf inbox add ./idea.md.`,
    twice: (flag) => `wf inbox add takes ${flag} once: a card names one ${flag === '--repo' ? 'repository' : 'workflow'}.`,
  });
  return { workflow: values['--workflow']?.[0], repo: values['--repo']?.[0] };
}

/**
 * `wf rm`'s arguments: the runs to forget, each once, and its two switches. Refused before any run is read: a flag it does not take, and
 * `--force-unmerged` without `--delete-branches` — it forces what that flag deletes, and alone would delete nothing, silently.
 */
function rmHow(argv: string[]): { ids: string[]; how: ForgetHow } {
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
function pruneHow(argv: string[]): { ids: string[]; unmerged: boolean; yes: boolean; artifacts: boolean } {
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
function holdHow(argv: string[]): { until: string[]; off: boolean } {
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

/** A person's yes, asked on the terminal: false with no terminal to ask on, and for anything but y or yes. */
async function confirmed(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

/** `wf retry`'s own flags: after `--message`, one of these alone is an answer left out, not an answer. */
const RETRY_FLAGS: readonly string[] = ['--nudge', '--fresh', '--recheck', '--model', '--message', '--budget'];

/**
 * `wf retry`'s one choice of how, read off its flags: at most one way, `--model` with a name, and `--message` at most once, with what
 * to tell the step — refused, before a run is read, when it is empty or rides on `--recheck` (`messageRefusal`). The argument after
 * `--message` is the answer whatever it starts with, since an answer about a flag names it ("--flag stays"): only one of this verb's own
 * flags, alone, reads as the answer left out, and `--message=<answer>` carries even that.
 */
function retryHow(argv: string[]): RetryHow {
  const given: Array<{ mode: RetryMode; model?: string }> = [];
  let message: string | undefined;
  let budget: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--nudge' || arg === '--fresh' || arg === '--recheck') given.push({ mode: arg.slice(2) as RetryMode });
    else if (arg === '--model') {
      const model = argv[++i];
      if (!model || model.startsWith('--')) usage('--model takes the model to run the new session on: wf retry <runId> <step> --model <m>');
      given.push({ mode: 'fresh', model });
    } else if (arg === '--message' || arg.startsWith('--message=')) {
      if (message !== undefined)
        usage('wf retry takes --message once: put the whole answer in it, quoted — wf retry <runId> <step> --message "<answer>".');
      const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
      if (text === undefined) return usage('--message takes what to tell the step, quoted: wf retry <runId> <step> --message "<answer>"');
      if (arg === '--message' && RETRY_FLAGS.includes(text)) {
        usage(
          `--message takes what to tell the step, and ${text} is one of wf retry's own flags, so the answer was left out: wf retry <runId> <step> --message "<answer>". If ${text} is the whole answer, give it as --message=${text}.`,
        );
      }
      message = text;
    } else if (arg === '--budget' || arg.startsWith('--budget=')) {
      if (budget !== undefined)
        usage('wf retry takes --budget once: the cap to raise the step to, in dollars — wf retry <runId> <step> --budget <amount>.');
      budget = amountOf(
        arg === '--budget' ? argv[++i] : arg.slice('--budget='.length),
        "the most the step's tries may cost together, in dollars, above what they have cost",
        'wf retry <runId> <step> --budget <amount>',
      );
    } else
      usage(
        `wf retry does not take ${arg}. It takes one of --nudge, --fresh, --model <m>, --recheck, and --message "<answer>" and --budget <amount>.`,
      );
  }
  if (given.length > 1) usage('wf retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.');
  const how: RetryHow = {
    ...(given[0] ?? { mode: 'nudge' }),
    ...(message !== undefined ? { message } : {}),
    ...(budget !== undefined ? { budget } : {}),
  };
  const wrong = messageRefusal(how) ?? budgetRefusal(how);
  if (wrong) usage(wrong);
  return how;
}

/**
 * `wf approve`'s one flag, after the run and the step: `--message "<words>"`, or `--message=<words>`, once — the next argument is the words
 * whatever it starts with, as `wf retry`'s is — refused before a run is read when it is missing or empty (`approvalWordsRefusal`). Anything
 * else is refused.
 */
function approveHow(argv: string[]): string | undefined {
  let message: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== '--message' && !arg.startsWith('--message=')) {
      usage(
        `wf approve does not take ${arg}. It takes the run, the step, and --message "<words>": wf approve <runId> <step> [--message "<words>"].`,
      );
    }
    if (message !== undefined)
      usage('wf approve takes --message once: put all your words in it, quoted — wf approve <runId> <step> --message "<words>".');
    const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
    if (text === undefined)
      usage('--message takes the words that go with your approval, quoted: wf approve <runId> <step> --message "<words>".');
    message = text;
  }
  const wrong = approvalWordsRefusal(message);
  if (wrong) usage(wrong);
  return message;
}

/** A `--budget`'s value as dollars (`dollarsOf`), or refused, saying what it takes: an amount above zero, in digits. */
function amountOf(text: string | undefined, takes: string, form: string): number {
  const amount = text === undefined ? undefined : dollarsOf(text);
  if (amount === undefined)
    usage(
      `--budget takes ${takes} — an amount above zero, in digits, like 5 or 2.50${text === undefined ? '' : `, and ${text} is not one`}: ${form}`,
    );
  return amount!;
}

/** `wf round`'s arguments after the run: the step that closes the loop, when there is more than one, and `--budget <amount>`, at most once each. */
function roundHow(argv: string[]): { stepName?: string; budget?: number } {
  let stepName: string | undefined;
  let budget: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--budget' || arg.startsWith('--budget=')) {
      if (budget !== undefined)
        usage(
          'wf round takes --budget once: the cap to raise the steps of the loop over their budget to, in dollars — wf round <runId> [<step>] --budget <amount>.',
        );
      budget = amountOf(
        arg === '--budget' ? argv[++i] : arg.slice('--budget='.length),
        'the most a step of the loop may cost together, in dollars, above what it has cost',
        'wf round <runId> [<step>] --budget <amount>',
      );
    } else if (arg.startsWith('--') || stepName !== undefined) {
      usage(
        'wf round takes the run and, when the run has more than one loop, the step that closes the one to go round: wf round <runId> [<step>] — and --budget <amount>, to raise the cap of a step of the loop over its budget.',
      );
    } else stepName = arg;
  }
  return { ...(stepName !== undefined ? { stepName } : {}), ...(budget !== undefined ? { budget } : {}) };
}

/**
 * `wf accept`'s arguments after the run: the step that closes the loop, when there is more than one, and `--message "<why>"`, at most once
 * each — the next argument is the words whatever it starts with, as `wf approve`'s is. Words that are missing or empty are refused where
 * every other refusal of this verb is (`acceptAsk`), which knows the run and can name it.
 */
function acceptHow(argv: string[]): { stepName?: string; message?: string } {
  let stepName: string | undefined;
  let message: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--message' || arg.startsWith('--message=')) {
      if (message !== undefined)
        usage('wf accept takes --message once: put all your words in it, quoted — wf accept <runId> [<step>] --message "<why>".');
      const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
      if (text === undefined)
        usage('--message takes why the work is good enough with its findings open, quoted: wf accept <runId> [<step>] --message "<why>".');
      message = text;
    } else if (arg.startsWith('--') || stepName !== undefined) {
      usage(
        'wf accept takes the run and, when the run has more than one loop, the step that closes the one to end: wf accept <runId> [<step>] --message "<why>".',
      );
    } else stepName = arg;
  }
  return { ...(stepName !== undefined ? { stepName } : {}), ...(message !== undefined ? { message } : {}) };
}

/**
 * The cursor `wf feed` and `wf watch` read from: 0 when none is given, a whole number of bytes otherwise, and nothing more. Whether the feed
 * has a line starting there is the feed's to say (`feedCursorRefusal`), in its words.
 */
function feedCursor(verb: 'feed' | 'watch', argv: string[]): number {
  if (argv.length > 1 || (argv[0] !== undefined && !/^\d+$/.test(argv[0]))) {
    usage(
      `wf ${verb} takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: wf ${verb} [cursor]`,
    );
  }
  return argv[0] === undefined ? 0 : Number(argv[0]);
}

/**
 * `wf watch` from a cursor already checked: the feed's lines as they are written, on stdout, until `stop()`; a feed cut under the watch is
 * said once on stderr, and followed from the start of the feed there is now (`watchFeed`).
 *
 * The banner is printed once the watch holds its cursor, not before: a reader that acts on `watching from` — cuts the feed, or writes to it —
 * finds a watch already there to see it, where a cut before the watch holds its cursor would have it refuse the cursor it was given.
 */
export function watchPrinted(from: number): { stop(): void } {
  const watch = watchFeed({
    from,
    onLine: (line) => console.log(feedLineWords(line)),
    onCut: (said) => console.error(`wf watch: ${said}`),
    onError: (err) => console.error(`wf watch: ${(err as Error).message ?? String(err)}`),
  });
  console.log(`watching from ${from}, ^C to stop`);
  return watch;
}

/**
 * Runs the verb `argv` names and prints what it did, or prints the help for a verb it does not know. `e` is the engine the verbs talk to:
 * the board under `WF_ROOT`, unless a test hands it one of its own. Beside what the help and the functions each verb calls say:
 * - `wf start` of a file that is not a plan's card (`cardToStart`) takes the whole file as the brief, frontmatter and all, and a card's own
 *   `workflow:` is found from its plan folder. `wf inbox add` and `wf inbox queue` read a `--workflow` path from where they are typed, and
 *   write it absolute (`workflowAt`).
 * - `wf tick` beside a daemon that ticks the store is refused, with no way to force it. `wf tick` and `wf up` start a queued card that
 *   names no repository on the one they are typed in, as `wf start` takes `.`.
 * - `wf up` refuses its interval (`everyOf`) and its ceilings (`ceilings`) before it takes the store. It beats on a timer of its own,
 *   unref'd, so a long pass is not taken for stalled and taken over mid-pass; it stops at the first pass that finds the store taken over
 *   (`stillHeld`), and a signal that stops it lets the store go, so it reads free at once. It says each failure once while it lasts — a
 *   queued card's start, the feed's, a move the lifecycle refused, a journal left out — going by what it has printed, not by the store.
 * - `wf ls <run>` judges the cap on runs in flight over the whole store. A listing views each task once and asks git of each repository's
 *   branches once (`viewedOnce`, `branchReader`), and says an ending's gate once, on its `to decide` line, and what a run has cost so
 *   far on its line, where the engine measured it. A run a task journal of which does not read is listed with its steps and
 *   `→ unreadable:` in the runtime's words (`unjudgedOf`), and `wf decide` of it fails with those words.
 * - `wf cancel` prints a line in every case, a run already finished and one with nothing in flight included.
 * - `wf rm`, and `wf prune` of named runs, judge each run on its own, a line each, a refusal included, and fail once every run has had its
 *   say: exit 2, or 1 when one failed otherwise. `wf prune` of every run says the runs not over in one line, and a run with nothing to
 *   prune not at all; each run is judged again before it is pruned, never trusted from the listing.
 * - `wf decide` refuses a flag before the run, which would otherwise print the help and exit 0. Every screen names the files a person gave
 *   the run under its line, as its steps were handed them. A run waiting on others (`--after`), held
 *   (`wf hold`), or held by the cap on runs in flight is offered nothing: its screen says what it waits on, and a hold beside a wait says
 *   that lifting it does not start the run. A running run's screen says what a step its harness blocked waits for, and the tries and
 *   rounds the next tick files, but a try the repository's checkout holds; an ending waiting for that checkout is said there and on the
 *   deciding screen. A shipped run whose ending never ran says so, as `wf ls` still shows it at its gate. A pruned run waits on nobody
 *   (`prunedRefusal`): how each step ended is said, and not that it waits on you. Each step's closeout, in the order the steps run
 *   (`namesInOrder`), is read off the engine's record, never a branch, so a dropped branch keeps its review. The top-level markdown files
 *   a branch added are printed, 120 lines at most. The git commands to ship or drop are printed only where no step merges (`merges`), never
 *   for a run that worked on its base branch itself (`--no-worktree`), and a folder run is offered `wf rm` alone.
 * - `wf say` takes every word after the step as one message, so an unquoted sentence is one; empty words are the engine's to refuse.
 * - `wf agents card` prints the card alone on stdout, so `| jq` reads it, and what it is not on stderr.
 */
export async function main(argv: string[], e: ReturnType<typeof engine> = engine()): Promise<void> {
  const [verb, ...rest] = argv;

  switch (verb) {
    case 'start': {
      const arg = rest[0];
      if (!arg || arg.startsWith('--')) return console.log(HELP);
      const how = startHow(rest.slice(1));
      const printStarted = (run: ReturnType<typeof start>, from?: string) => {
        const steps = stepsOf(run);
        console.log(
          `${run.id}  ${steps.length} step(s): ${steps.map((s) => (s.agent ? `${s.name} (${s.agent.name})` : s.name)).join(' → ')}`,
        );
        if (from) console.log(from);
        console.log(
          `workspace: ${run.workspace}${isGitRun(run) ? '' : ' — a folder per step, made as each is filed, with no git repository'}`,
        );
        if (run.inputs?.length) console.log(`inputs: ${run.inputs.join(', ')} — copied into ${inputsDir(run)}`);
        if (run.after?.length)
          console.log(`waits on: ${run.after.join(', ')} — nothing is filed until wf decide says each has shipped onto ${run.branch}`);
        const gates = gatesOf(steps, run);
        const ends = endingSteps(steps, run)
          .filter((s) => approvedFirst(s, run))
          .map((s) => s.name);
        const held = gates.filter((name) => !ends.includes(name));
        if (held.length)
          console.log(
            `gated at: ${held.join(', ')} — nothing after ${held.length > 1 ? 'each' : 'it'} is filed until wf approve ${run.id} <step>, once it has signed off`,
          );
        if (ends.length)
          console.log(
            `ends at: ${ends.join(', ')} — nothing of ${ends.length > 1 ? 'them' : 'it'} runs until wf approve ${run.id} ${ends[0]}, which is what files ${ends.length > 1 ? 'them' : 'it'}`,
          );
        console.log(`run 'wf tick' (or 'wf up') to start it`);
        for (const line of formerKeyLines(run.workflowDir)) console.log(line);
      };
      const inboxName = inboxNameAt(arg);
      if (inboxName !== null) {
        const brief =
          how.brief === undefined
            ? undefined
            : fs.statSync(how.brief, { throwIfNoEntry: false })?.isFile()
              ? fs.readFileSync(how.brief, 'utf8')
              : how.brief;
        const started = startFromInbox({
          name: inboxName,
          ...(brief !== undefined ? { brief } : {}),
          ...(how.workflows !== undefined ? { workflow: how.workflows } : {}),
          ...(how.repo !== undefined ? { repo: path.resolve(how.repo) } : {}),
          callerRepo: path.resolve('.'),
          isolate: how.isolate,
          after: how.after,
          inputs: how.inputs,
          gates: how.gates,
        });
        printStarted(
          started.run,
          started.removed
            ? `${fromNote(started.run)} — removed from the inbox`
            : `${fromNote(started.run)} — still in the inbox: ${started.why}. wf inbox lists it as started as ${started.run.id}: drop it with wf inbox rm ${inboxName}`,
        );
        if (started.ignoredRepo) console.log(ignoredRepoLine(started.ignoredRepo));
        return;
      }
      if (how.brief !== undefined)
        usage(
          `wf start takes --brief only for a card of the inbox, in place of its body: wf start ${path.join(inboxDir(), '<name>.md')} --brief "<brief>". Anywhere else the brief is its first argument: wf start "<brief>".`,
        );
      const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : undefined;
      const card = text === undefined ? null : cardToStart(arg, text, how.after);
      const repo = path.resolve(how.repo ?? '.');
      const run = start({
        brief: card ? card.body : (text?.trim() ?? arg),
        repo,
        repoNamed: how.repo !== undefined,
        workflowDir:
          how.workflows === undefined && card?.workflow !== undefined
            ? workflowFolder(card.workflow, path.dirname(path.resolve(arg)), repo)
            : workflowFolder(how.workflows ?? './workflows', process.cwd(), repo),
        isolate: how.isolate,
        after: how.after,
        inputs: how.inputs,
        gates: how.gates,
      });
      printStarted(run);
      return;
    }

    case 'plan': {
      if (rest.includes('--help')) return console.log(PLAN_HELP);
      const folder = rest[0];
      if (!folder || folder.startsWith('--')) return console.log(HELP);
      const plan = { dir: path.resolve(folder), repo: path.resolve(planHow(rest.slice(1)).repo ?? '.') };
      const { started, stopped, folderOf } = startPlan(plan);
      for (const line of planLines(started)) console.log(line);
      if (stopped) {
        const told = planStopped({ card: stopped.card, why: stopped.error.message, rest: stopped.rest }, started, { ...plan, folderOf });
        throw Object.assign(new Error(told), { exitCode: stopped.error.exitCode ?? 1 });
      }
      console.log(`run 'wf tick' (or 'wf up') to start them`);
      return;
    }

    case 'inbox': {
      const [sub, ...args] = rest;
      if (sub === '--help') return console.log(INBOX_HELP);
      if (sub === undefined) {
        const listing = readInbox();
        if (!listing.length) return console.log(`the inbox is empty — park an idea with wf inbox add "<idea>"`);
        for (const line of inboxLines(listing)) console.log(line);
        console.log(
          `\nstart one: wf start ${path.join(inboxDir(), '<name>.md')} [--workflows <w>] [--repo <r>] — queue one: wf inbox queue <name> — drop one: wf inbox rm <name>`,
        );
        return;
      }
      if (sub === 'add') {
        const idea = args[0];
        if (idea === undefined || idea.startsWith('--'))
          usage(
            'wf inbox add takes the idea, first: wf inbox add "<idea>" [--workflow <name>] [--repo <path>], or a file: wf inbox add ./idea.md. Nothing was filed.',
          );
        const how = inboxAddHow(args.slice(1));
        const at = fs.statSync(idea, { throwIfNoEntry: false });
        if (at?.isDirectory())
          usage(
            `${idea} is a directory, and wf inbox add takes the idea as text or as one file: wf inbox add "<idea>", or wf inbox add ./idea.md.`,
          );
        const workflow = how.workflow === undefined ? undefined : workflowAt(how.workflow, process.cwd());
        const { card, file } = addToInbox({
          text: at ? fs.readFileSync(idea, 'utf8') : idea,
          ...(at ? { from: idea, dir: path.dirname(path.resolve(idea)) } : { dir: process.cwd() }),
          ...(workflow !== undefined ? { workflow } : {}),
          ...(how.repo !== undefined ? { repo: path.resolve(how.repo) } : {}),
        });
        console.log(
          `${card.name}  ${card.body.split('\n')[0].slice(0, 56)}${card.workflow ? `  workflow: ${card.workflow}` : ''}${card.repo ? `  repo: ${card.repo}` : ''}`,
        );
        console.log(`filed: ${file} — start it with wf start ${file}${card.workflow ? '' : ' --workflows <w>'}`);
        return;
      }
      if (sub === 'queue') {
        const [name, ...more] = args;
        if (name === undefined || name.startsWith('--'))
          usage(
            'wf inbox queue takes the name of the card to queue, as wf inbox lists it: wf inbox queue <name> [--workflow <w>] [--off].',
          );
        const how = inboxQueueHow(more);
        const workflow = how.workflow === undefined ? undefined : workflowAt(how.workflow, process.cwd());
        const queued = queueInInbox(name, { off: how.off, ...(workflow !== undefined ? { workflow } : {}) });
        if (queued.was === 'not queued') return console.log(`${name}  not queued — nothing to take back`);
        if (queued.was === 'taken back')
          return console.log(`${name}  taken back: it no longer starts on its own — start it with wf start ${queued.file}`);
        console.log(
          `${name}  queued at ${queued.card.queued}, ${queued.place} of ${queued.of}  workflow: ${queued.card.workflow}${queued.card.repo ? `  repo: ${queued.card.repo}` : ''}`,
        );
        console.log(
          `the tick starts it on its own once its turn comes and a run slot is free${queued.card.repo ? '' : ', on the repository wf up runs in'} — take it back with wf inbox queue ${name} --off`,
        );
        return;
      }
      if (sub === 'rm') {
        const [name, ...more] = args;
        if (name === undefined || name.startsWith('--'))
          usage('wf inbox rm takes the name of the card to drop, as wf inbox lists it: wf inbox rm <name>.');
        if (more.length) usage(`wf inbox rm drops one card, and ${more[0]} is a second: wf inbox rm <name>, once per card.`);
        const dropped = dropFromInbox(name);
        return console.log(
          dropped.removed
            ? `${name}  dropped, and nothing started — ${dropped.file} removed`
            : `${noCardLine(name, dropped.cards)} Nothing to drop.`,
        );
      }
      return usage(
        `wf inbox does not take ${sub}. It lists the inbox — wf inbox — files a card with wf inbox add "<idea>", queues one with wf inbox queue <name>, and drops one with wf inbox rm <name> (wf inbox --help).`,
      );
    }

    case 'tick': {
      const stats = rest.includes('--stats');
      const other = rest.find((a) => a !== '--stats');
      if (other !== undefined)
        usage(`wf tick takes no ${other}: wf tick runs one pass, and wf tick --stats says after it what the pass cost.`);
      const held = storeRefusal('tick');
      if (held) throw new Conflict({ message: stats ? `${held} What its last pass cost is read without a pass: wf up --stats.` : held });
      const { runs: results, queue, feedError, cost, refused, unreadable } = await tick(e, { repo: path.resolve('.') });
      if (feedError) console.error(feedError);
      for (const why of unreadable ?? []) console.error(`left out: ${why}`);
      for (const line of refusalLines(refused ?? [], new Set()).lines) console.log(line);
      if (queue) console.log(queueLine(queue));
      if (!results.length && !queue && !unreadable?.length) console.log('no runs');
      for (const r of results) {
        const filed = r.filed.length ? `  filed: ${r.filed.join(', ')}` : '';
        const tried = r.tried.length ? `  tried again: ${r.tried.join(', ')}` : '';
        const looped = r.looped.length ? `  round again: ${r.looped.join(', ')}` : '';
        const checked = r.checked.length ? `  checking: ${r.checked.join(', ')}` : '';
        const blocked = r.blocked.length ? `  blocked: ${r.blocked.join(', ')}` : '';
        const waiting = r.waiting.length ? `  ${waitWord(r.waiting)}` : r.held ? `  ${slotWord(r.held)}` : '';
        console.log(`${r.run.id}  ${r.status}${filed}${tried}${looped}${checked}${blocked}${waiting}`);
        for (const note of r.notes) console.log(`   ${note}`);
      }
      if (stats) for (const line of cost ? breakdownLines(cost) : ['this pass was not measured']) console.log(line);
      return;
    }

    case 'up': {
      if (rest.includes('--stats')) {
        const other = rest.find((a) => a !== '--stats');
        if (other !== undefined)
          usage(
            `wf up --stats reads what the last pass cost and ticks nothing, so it takes no ${other}: wf up --stats alone, or wf up ${other} to tick.`,
          );
        const cost = lastPassCost();
        const daemon = storeRefusal('tick') !== undefined;
        if (!cost)
          return console.log(
            `no pass has written what it cost to ${path.join(HOME, 'tick-stats.json')} yet — ${daemon ? 'the wf up that holds this store writes it after its next pass' : 'no wf up holds this store: run wf tick --stats, or start wf up'}`,
          );
        for (const line of breakdownLines(cost)) console.log(line);
        return console.log(
          daemon
            ? 'written by the wf up that holds this store, after its last pass'
            : 'no wf up holds this store now, so this was the last pass anyone ran: wf tick --stats runs one and says what it cost',
        );
      }
      const asked = everyOf(rest[0]);
      const every = 'refusal' in asked ? usage(asked.refusal) : asked.every;
      const ceiling = ceilings();
      const { held, replaced } = takeStore({ every, cwd: path.resolve('.') });
      const store = HOME;
      console.log(`up — every ${every}ms, ^C to stop`);
      for (const line of ceilingLines(ceiling)) console.log(`   ${line}`);
      console.log(
        `   holds ${store} as pid ${held.pid} — a second wf up, or a wf tick, on this store is refused while it ticks (daemon.json)`,
      );
      const took = takeoverLine(replaced, store, Date.now());
      if (took) console.log(`   ${took}`);
      const stops = (
        [
          ['SIGINT', 130],
          ['SIGTERM', 143],
          ['SIGHUP', 129],
        ] as const
      ).map(([signal, code]) => {
        const stop = () => {
          releaseStore(held);
          process.exit(code);
        };
        process.once(signal, stop);
        return [signal, stop] as const;
      });
      const beating = setInterval(() => beat(held), every);
      beating.unref();
      try {
        let said: string | undefined;
        let feedSaid: string | undefined;
        let refusedSaid: ReadonlySet<string> = new Set();
        let unreadableSaid: ReadonlySet<string> = new Set();
        let interval: Interval | undefined;
        for (;;) {
          const by = stillHeld(held);
          if (by) throw new Error(takenFromLine(by, store));
          const { runs: advanced, queue, feedError, cost, refused, unreadable } = await tick(e, { repo: path.resolve('.') });
          passed(held);
          if (cost) interval = addPass(interval, cost, Date.now());
          if (summaryDue(interval, Date.now())) {
            console.log(`${new Date().toISOString().slice(11, 19)}  ${summaryLine(interval!, Date.now())}`);
            interval = undefined;
          }
          if (feedError && feedError !== feedSaid) console.error(`${new Date().toISOString().slice(11, 19)}  ${feedError}`);
          feedSaid = feedError;
          const stalled = refusalLines(refused ?? [], refusedSaid);
          for (const line of stalled.lines) console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`);
          refusedSaid = stalled.said;
          for (const why of unreadable ?? [])
            if (!unreadableSaid.has(why)) console.error(`${new Date().toISOString().slice(11, 19)}  left out: ${why}`);
          unreadableSaid = new Set(unreadable);
          if (queue) {
            const failure = 'failed' in queue ? `${queue.card}  ${queue.on ?? ''}  ${queue.failed}` : undefined;
            if (failure === undefined || failure !== said) console.log(`${new Date().toISOString().slice(11, 19)}  ${queueLine(queue)}`);
            said = failure;
          }
          for (const r of advanced) {
            for (const note of r.notes) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  ${note}`);
            if (r.filed.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  filed ${r.filed.join(', ')}`);
            if (r.tried.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  tried again ${r.tried.join(', ')}`);
            if (r.looped.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  round again ${r.looped.join(', ')}`);
            if (r.checked.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  checking ${r.checked.join(', ')}`);
          }
          await new Promise((r) => setTimeout(r, every));
        }
      } finally {
        clearInterval(beating);
        for (const [signal, stop] of stops) process.off(signal, stop);
        releaseStore(held);
      }
    }

    case 'feed': {
      const { lines, cursor } = readFeed(feedCursor('feed', rest));
      for (const line of lines) console.log(feedLineWords(line));
      return console.log(`cursor: ${cursor}`);
    }

    case 'watch': {
      const from = feedCursor('watch', rest);
      const refusal = feedCursorRefusal(from);
      if (refusal) usage(refusal);
      return new Promise<void>(() => {
        watchPrinted(from);
      });
    }

    case 'ls': {
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
        const calledOff = `${run.cancelledAt ? '  (cancelled)' : ''}${run.pruned ? '  (pruned)' : ''}`;
        const listed = await list(viewed, run, held.get(run.id), git).catch(async (err: unknown) => {
          const unjudged = await unjudgedOf(viewed, run, err, 'wf ls');
          if (!unjudged) throw err;
          return unjudged;
        });
        if ('said' in listed) {
          console.log(`${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${calledOff}`);
          const width = Math.max(20, ...listed.steps.map((s) => s.status.length));
          for (const s of listed.steps) console.log(`   ${s.name.padEnd(14)} ${s.status.padEnd(width)} ${s.branch ?? ''}`);
          console.log(`   → unreadable: ${listed.said}`);
          continue;
        }
        const { steps, waitingOnYou, waiting, holding, cost, toDecide } = listed;
        console.log(`${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${calledOff}${cost ? `  ${cost}` : ''}`);
        const said = steps.map((s) => `${s.status}${s.cost ? `  ${s.cost}` : ''}`);
        const width = Math.max(20, ...said.map((w) => w.length));
        for (const [i, s] of steps.entries()) {
          console.log(`   ${s.name.padEnd(14)} ${said[i].padEnd(width)} ${s.branch ?? ''}${s.note ? `  · ${s.note}` : ''}`);
        }
        if (toDecide) console.log(`   → to decide: ${toDecideWords(run, toDecide)}`);
        const onYou = onYouWords({ steps, waitingOnYou }).filter(
          (said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`),
        );
        if (onYou.length) console.log(`   → waiting on you: ${onYou.join(', ')}  —  wf decide ${run.id}`);
        if (waiting.some((w) => w.missing || w.cancelledAt || w.gone?.length))
          console.log(`   → waiting on you: ${waitAdvice(run, waiting)}`);
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
      return ticking();
    }

    case 'cancel': {
      if (!rest[0]) return console.log(HELP);
      const { run, plan } = await cancel(e, rest[0]);

      if (plan.kind === 'finished') return console.log(`${run.id}  already ${plan.status} — nothing to stop`);

      console.log(plan.kind === 'already-cancelled' ? `${run.id}  already cancelled at ${plan.at}` : `${run.id}  cancelled`);
      if (plan.stop.length)
        console.log(`   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`);
      else if (plan.kind === 'cancel') console.log(`   nothing was in flight — no further steps will be filed`);
      return;
    }

    case 'rm': {
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

    case 'prune': {
      const { ids, unmerged, yes, artifacts } = pruneHow(rest);
      const named = ids.length > 0;
      const found: Pruning[] = [];
      const notPruned: string[] = [];
      let failed = false;
      for (const id of named ? ids : listRuns().map((r) => r.id)) {
        try {
          found.push(await prune(e, id, { unmerged, artifacts }));
        } catch (err) {
          console.log(`${id}  not pruned: ${(err as Error).message}`);
          notPruned.push(id);
          if ((err as { exitCode?: number }).exitCode !== 2) failed = true;
        }
      }
      const running = found.filter((p) => !named && p.kind === 'refused' && /\bit is not over\b/.test(p.refusal ?? ''));
      for (const p of found) {
        if (!named && (p.kind === 'nothing' || running.includes(p))) continue;
        for (const line of pruneLines(p)) console.log(line);
        if (named && p.kind === 'refused') notPruned.push(p.id);
      }
      if (running.length)
        console.log(`${running.length} run${running.length > 1 ? 's' : ''} not over, not pruned: ${running.map((p) => p.id).join(', ')}`);
      const prunable = found.filter((p) => p.kind === 'prunable');
      const refusedNamed = () => {
        if (notPruned.length) {
          throw Object.assign(
            new Error(
              `wf prune: ${notPruned.join(', ')} not pruned — ${notPruned.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
            ),
            { exitCode: failed ? 1 : 2 },
          );
        }
      };
      if (!prunable.length) {
        if (!found.some((p) => p.kind === 'refused'))
          console.log(
            named ? 'nothing to prune' : `nothing to prune: no run that is over has a worktree${artifacts ? ' or files' : ''} left`,
          );
        return refusedNamed();
      }
      const total = sizeOf(prunable.reduce((sum, p) => sum + pruningBytes(p), 0));
      console.log(`${prunable.length} run${prunable.length > 1 ? 's' : ''} to prune, ${total} in all`);
      if (!yes && !(await confirmed('remove them? [y/N] '))) {
        console.log(
          `nothing removed: wf prune ${[...(named ? prunable.map((p) => p.id) : []), ...(unmerged ? ['--unmerged'] : []), ...(artifacts ? ['--artifacts'] : []), '--yes'].join(' ')} removes them`,
        );
        return refusedNamed();
      }
      for (const p of prunable) {
        try {
          const done = await prune(e, p.id, { unmerged, artifacts, yes: true });
          for (const line of pruneLines(done)) console.log(line);
          if (done.kind === 'refused' || done.left.length) notPruned.push(p.id);
        } catch (err) {
          console.log(`${p.id}  not pruned: ${(err as Error).message}`);
          notPruned.push(p.id);
          if ((err as { exitCode?: number }).exitCode !== 2) failed = true;
        }
      }
      return refusedNamed();
    }

    case 'hold': {
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

    case 'decide': {
      if (rest.includes('--help')) return console.log(DECIDE_HELP);
      if (!rest[0]) return console.log(HELP);
      if (rest[0].startsWith('--'))
        usage(`wf decide takes the run first: wf decide <runId> [--sensitive <globs>] — not ${rest[0]} before it.`);
      const { sensitive } = decideHow(rest.slice(1));
      const {
        run,
        decision,
        closeouts,
        checks,
        retrying,
        rounding,
        offers,
        overBudgetLine,
        used,
        costs,
        runCost,
        answers,
        answering,
        gates,
        accepted,
        waiting,
        holding,
        waitingOn,
        denied,
        said,
        timeline,
        held,
        checkout,
        standings,
        toDecide,
      } = await decide(e, rest[0]).catch(async (err: unknown) => {
        const unjudged = await unjudgedOf(e, readRun(rest[0]), err, 'wf decide');
        throw unjudged ? new Error(unjudged.said) : err;
      });
      const given = inputsNote(inputsDir(run), run.inputs);
      const from = fromNote(run);
      const pruned = run.pruned ? `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` : '';
      const head = `${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${from ? `\n  ${from}` : ''}${given ? `\n  ${given}` : ''}${pruned ? `\n  ${pruned}` : ''}`;
      const steps = stepsOf(run);

      if (decision.kind === 'cancelled') return console.log(`${head}\n\n  cancelled at ${decision.at} — nothing to decide`);
      if (waiting.length) {
        const never = run.hold && (!holding.length || holding.some((w) => w.missing || w.cancelledAt || w.gone?.length));
        const alsoHeld = run.hold
          ? `\n  ${holdWord(holding)} as well — ${never ? holdAdvice(run, holding) : `wf hold ${run.id} --off lifts the hold, and not the wait above`}`
          : '';
        return console.log(`${head}\n\n  ${waitWord(waiting)}\n  ${waitAdvice(run, waiting)}${alsoHeld}`);
      }
      if (run.hold) {
        console.log(`${head}\n\n  ${holdWord(holding)}`);
        if (decision.kind === 'running' && decision.waiting.length) console.log(`  still running: ${decision.waiting.join(', ')}`);
        for (const [name, line] of Object.entries(waitingOn)) console.log(`  ${name}: ${line}`);
        return console.log(`  ${holdAdvice(run, holding)}`);
      }
      if (held)
        return console.log(
          `${head}\n\n  ${slotWord(held)}\n  nothing of ${run.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`,
        );
      const ending = steps.find((s) => s.workspace === 'main');
      const heldOut = checkout && ending ? `  ${checkoutLine(ending.name, checkout)}` : '';
      if (decision.kind === 'running') {
        console.log(`${head}\n\n  still running: ${decision.waiting.join(', ')}`);
        for (const [name, line] of Object.entries(waitingOn)) console.log(`  ${name}: ${line}`);
        for (const r of retrying.filter((r) => !(heldOut && r.step === ending?.name)))
          console.log(
            `  ${r.step}: ${dueNote(
              steps.find((s) => s.name === r.step)!,
              run,
              r,
            )}`,
          );
        for (const r of rounding) console.log(`  ${r.step}: ${roundDueNote(steps, r)}`);
        if (heldOut) console.log(heldOut);
        return console.log('  nothing to decide yet');
      }
      if (decision.kind === 'shipped') {
        const unrun = steps.find((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId);
        const never = unrun
          ? `\n  ${unrun.name} never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: wf cancel ${run.id}`
          : '';
        return console.log(`${head}\n\n  shipped — ${decision.branches.join(', ')} is already on ${run.branch}${never}`);
      }

      console.log(`${head}\n`);
      const onYou = run.pruned ? '' : ', waiting on you';
      if (decision.failedCheck.length)
        console.log(
          `  FAILED CHECK: ${decision.failedCheck.join(', ')}  — the run executed its check and it did not exit 0; nothing after it ran`,
        );
      if (decision.unfinishedCheck.length)
        console.log(
          `  CHECK DID NOT FINISH: ${decision.unfinishedCheck.join(', ')}  — stopped, or killed before it exited: no verdict on the work, and no retry spent; nothing after it ran`,
        );
      if (decision.unsigned.length)
        console.log(
          `  UNSIGNED: ${decision.unsigned.map((n) => (signoffsSpent(run.steps[n]) ? `${n} (nudged to sign off once by the run, and unsigned again)` : n)).join(', ')}  — ended without the closeout it was asked for, or without a field its output: declares; nothing after it ran`,
        );
      if (decision.unverified.length)
        console.log(`  UNVERIFIED: ${decision.unverified.join(', ')}  — no check: declared; only its own word says it worked`);
      if (decision.failed.length) console.log(`  FAILED: ${decision.failed.join(', ')}  (wf logs ${run.id} <step>)`);
      if (decision.stuck.length) console.log(`  BLOCKED${onYou}: ${decision.stuck.join(', ')}`);
      if (decision.exhausted.length)
        console.log(
          `  ROUNDS EXHAUSTED${onYou}: ${decision.exhausted.join(', ')}  — asked for another round on the last one rounds: allows; its findings are below`,
        );
      if (overBudgetLine) console.log(`  ${overBudgetLine}`);
      if (decision.budgetExhausted.length)
        console.log(
          `  BUDGET EXHAUSTED${onYou}: ${decision.budgetExhausted.join(', ')}  — its harness ended its session at its budget:; nothing after it ran`,
        );
      if (decision.denied.length)
        console.log(
          `  DENIED${onYou}: ${decision.denied.join(', ')}  — its harness denied its try a call, and denials: fail passes none on; nothing after it ran, and its check was not run`,
        );
      const handedOn = decision.awaitingApproval.filter((name) => run.steps[name]?.taskId);
      const unrun = decision.awaitingApproval.filter((name) => !run.steps[name]?.taskId);
      if (handedOn.length)
        console.log(
          `  AWAITING APPROVAL${onYou}: ${handedOn.join(', ')}  — signed off at its gate; nothing after it ${run.pruned ? 'was filed, and pruned, it cannot be approved' : 'is filed until you approve it, or send it back'}`,
        );
      if (unrun.length)
        console.log(
          `  AWAITING APPROVAL${onYou}: ${unrun.join(', ')}  — this workflow's ending, at its gate: nothing of it has run${run.pruned ? ', and pruned, it cannot be approved' : ', and your approval is what runs it'}`,
        );
      if (decision.outcome === 'succeeded' && !decision.unverified.length) console.log(`  every step verified`);
      if (heldOut) console.log(heldOut);
      if (offers.length) console.log(`\n  once more, on the next tick:\n${offers.map((line) => `    ${line}`).join('\n')}`);

      const git = isGitRun(run) ? run : undefined;
      const touched = !git
        ? []
        : branchesToRead(
            decision.branches,
            namesInOrder(git, steps).map((name) => git.steps[name].branch),
            git.isolate ? git.branch : undefined,
          ).map((branch) => ({ branch, radius: touchedBy(git, branch) }));
      if (touched.length) {
        console.log();
        for (const line of touchedLines(touched)) console.log(`  ${line}`);
        console.log(`  ${lessonLine(touched)}`);
        for (const t of touched) {
          console.log();
          for (const line of inFullLines(t, sensitive, sensitiveDiff(git!, t, sensitive ?? CHECK_AFFECTING), touched.length > 1))
            console.log(`  ${line}`);
        }
      }

      for (const name of namesInOrder(run, steps)) {
        const c = closeouts[name];
        const check = checks[name];
        if (!c && !check && !run.steps[name]?.taskId) continue;
        const blocked = c && !('error' in c) && c.outcome === 'blocked';
        const step = steps.find((s) => s.name === name);
        const tried = step ? tryNote(step, run.steps[name], steps, Boolean(answers[name])) : '';
        console.log(`\n  ${name}${blocked ? '  BLOCKED' : ''}${tried ? `  (${tried})` : ''}`);
        if (gates[name]) console.log(`    gate  ${gates[name].split('\n').join('\n          ')}`);
        if (accepted[name]) console.log(`    accepted  ${accepted[name].split('\n').join('\n              ')}`);
        if (waitingOn[name]) console.log(`    harness  ${waitingOn[name]}`);
        if (denied[name]) console.log(`    ${denied[name]}`);
        if (check) {
          console.log(`    check  ${check.command}  →  ${verdictWord(check.verdict)} ${check.passed ? '✓' : '✗'}`);
          for (const [stream, text] of [
            ['stdout', check.stdout],
            ['stderr', check.stderr],
          ] as const) {
            if (!check.passed && text) console.log(`      ${stream}:\n        ${text.split('\n').join('\n        ')}`);
          }
        }
        const [usedLine, costOfTry] = usedLines(used[name]);
        console.log(`    ${usedLine}`);
        console.log(`    ${costs[name] ?? costOfTry}`);
        for (const line of timelineLines(timeline.steps[name] ?? [])) console.log(`    ${line}`);
        const answer = answers[name];
        if (answer?.needs) console.log(`    try ${answer.try - 1} needs: ${answer.needs.split('\n').join('\n    ')}`);
        if (answer) console.log(`    your answer: ${answer.message.split('\n').join('\n    ')}`);
        for (const line of saidLines(said[name] ?? []).flatMap((l) => l.split('\n'))) console.log(`    ${line}`);
        if (!c) continue;
        if ('error' in c) {
          console.log(`    closeout unreadable — ${c.error}`);
          continue;
        }
        if (c.summary) console.log(`    ${c.summary.split('\n').join('\n    ')}`);
        for (const line of step ? outputLines(step, c, owedFields(step, run, steps)) : []) console.log(`    ${line}`);
        if (c.needs) console.log(`    needs: ${c.needs}`);
        if (answering[name]) console.log(`    ${answering[name]}`);
        const files = artifactLines(artifactsDir(run, name), missingArtifacts(run, name, c), artifactFiles(run, name), run.pruned);
        for (const line of files) console.log(`    ${line}`);
      }
      console.log();
      const totals = [...runCost, ...timelineTotalLines(timeline)];
      if (totals.length) {
        for (const line of totals) console.log(`  ${line}`);
        console.log();
      }

      for (const branch of git ? decision.branches : []) {
        const stat = diffStat(git!, branch);
        console.log(`  ${branch}${stat ? `  —${stat}` : ''}`);

        const notes = artifacts(git!, branch).filter((f) => f.endsWith('.md') && !f.includes('/'));
        for (const file of notes) {
          const text = readArtifact(git!, branch, file).trimEnd();
          const lines = text.split('\n');
          console.log(`\n  ── ${file} ${'─'.repeat(Math.max(0, 64 - file.length))}`);
          for (const l of lines.slice(0, 120)) console.log(`  ${l}`);
          if (lines.length > 120) console.log(`  … ${lines.length - 120} more lines — git show ${branch}:${file}`);
        }
      }

      if (!git) {
        console.log(`\n  worked in folders, with no git repository: ${run.workspace}, a folder per step; nothing to merge`);
      } else if (decision.direct) {
        console.log(`\n  worked directly on ${run.branch}; nothing to merge; the base was ${run.baseRef}`);
        console.log(`  read it    git -C ${run.repo} diff ${run.baseRef}...${run.branch}`);
      } else if (standings.length) {
        console.log();
        for (const s of standings) console.log(`  branch    ${branchWord(run, s)}`);
      }

      if (toDecide?.kind === 'approve') {
        const step = steps.find((s) => s.name === toDecide.step)!;
        console.log(
          `\n  to decide  ${step.name}${toDecide.says === null ? ' has signed off and waits for your word' : " has not run: this workflow's ending, and your approval is what runs it"}:`,
        );
        if (toDecide.says !== null) for (const line of step.body.split(/\n[ \t]*\n/)[0].split('\n')) console.log(`    ${line}`);
        console.log(`\n  approve it    wf approve ${run.id} ${step.name} [--message "<words>"]`);
        for (const back of sendBackTo(step, run)) console.log(`  send it back  wf retry ${run.id} ${back} --message "<objection>"`);
        return;
      }

      if (!git) return console.log(`\n  done with it   wf rm ${run.id}  — forgets the run with its folders and files`);
      const first = decision.branches[0];
      if (first && !merges(steps) && !decision.direct) {
        console.log(`\n  ship it   git -C ${run.repo} merge --no-ff ${first}`);
        console.log(`  drop it   git -C ${run.repo} branch -D ${decision.branches.join(' ')}`);
      }
      return;
    }

    case 'retry': {
      const [runId, stepName] = rest;
      if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
      const { ask, file, stopFirst } = await retry(e, runId, stepName, retryHow(rest.slice(2)), { stopBlocked: true });
      const how = `${ask.model ? `--model ${ask.model}` : `--${ask.mode}`}${ask.budget !== undefined ? `, --budget ${ask.budget}` : ''}`;
      const then = stopFirst
        ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped'
        : 'the next tick files it, once';
      console.log(
        `${runId}  asked: try ${ask.try} of ${stepName} (${how})${ask.message !== undefined ? ', with your answer' : ''} — ${then}`,
      );
      console.log(`   ${file}`);
      return;
    }

    case 'approve': {
      const [runId, stepName, ...more] = rest;
      if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
      const { approval, file } = await approve(e, runId, stepName, approveHow(more));
      const after = readRun(runId);
      const waited = stepsOf(after).some((s) => s.after.includes(stepName));
      const files = !after.steps[stepName]?.taskId;
      console.log(
        `${runId}  approved: try ${approval.try} of ${stepName}${approval.message !== undefined ? ', with your words' : ''} — ${files ? `the next tick files ${stepName}` : waited ? 'the next tick files what waits on it' : 'nothing waits on it: its run can be decided'}`,
      );
      console.log(`   ${file}`);
      return;
    }

    case 'round': {
      const [runId, ...more] = rest;
      if (!runId || runId.startsWith('--')) return console.log(HELP);
      const { stepName, budget } = roundHow(more);
      const { ask, file } = await round(e, runId, stepName, budget);
      console.log(
        `${runId}  asked: round ${ask.round} of ${ask.step}'s loop${ask.budget !== undefined ? `, its cap raised to ${budgetWord(ask.budget)}` : ''} — the next tick files it, once`,
      );
      console.log(`   ${file}`);
      return;
    }

    case 'accept': {
      const [runId, ...more] = rest;
      if (!runId || runId.startsWith('--')) return console.log(HELP);
      const { stepName, message } = acceptHow(more);
      const { acceptance, file } = await accept(e, runId, stepName, message);
      const waited = stepsOf(readRun(runId)).some((s) => s.after.includes(acceptance.step));
      console.log(
        `${runId}  accepted: try ${acceptance.try} of ${acceptance.step} as it stands, its findings open — ${waited ? 'the next tick files what waits on it' : 'nothing waits on it: its run can be decided'}`,
      );
      console.log(`   ${file}`);
      return;
    }

    case 'say': {
      const [runId, stepName, ...words] = rest;
      if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
      const told = await say(e, runId, stepName, words.join(' '));
      const { at, attempt, text } = told.said;
      console.log(
        `${runId}  said to ${stepName}, try ${told.try}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${told.taskId}: wf decide ${runId} prints it under the step`,
      );
      for (const line of saidLines([{ at, attempt, text, try: told.try }])
        .slice(1)
        .flatMap((l) => l.split('\n')))
        console.log(`   ${line}`);
      return;
    }

    case 'show': {
      if (!rest[0]) return console.log(HELP);
      const run = readRun(rest[0]);
      const workflow = run.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
      console.log(JSON.stringify({ ...run, brief: `${run.brief.slice(0, 120)}…`, workflow }, null, 2));
      return;
    }

    case 'logs': {
      const [runId, stepName] = rest;
      if (!runId || !stepName) return console.log(HELP);
      const taskId = readRun(runId).steps[stepName]?.taskId;
      if (!taskId) return console.log(`${stepName} has not run yet`);
      return console.log(await e.logs(taskId));
    }

    case 'agents': {
      const [sub, ...args] = rest;
      if (sub === 'card') {
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
        return;
      }
      if (sub !== undefined && sub !== '--repo' && sub !== '--from') return console.log(HELP);
      const how = agentsHow(rest);
      const agents = listAgents(how.repo ?? '.');
      if (!agents.length)
        return console.log(
          `no agents — an agent is a file in <workflows>/agents: ${agentPlaces(path.resolve(how.repo ?? '.'))
            .map((p) => p.dir)
            .join(' or ')}`,
        );
      for (const { from, dir, name, agent } of agents) {
        if (agent instanceof Error) {
          console.log(`${name}  ${from}  does not read: ${agent.message.split('\n')[0]}`);
          continue;
        }
        console.log(`${name}  ${from}  ${agent.description ?? 'no description:'}`);
        let card: Array<{ id: string; name: string; description: string }>;
        try {
          card = cardSkills(agent, agentSkillsFound(dir, how.repo ?? '.'));
        } catch (err) {
          console.log(`   says nothing it can do — ${(err as Error).message.split('\n')[0]}`);
          card = [];
        }
        for (const skill of card) console.log(`   ${skill.id}  ${skill.name} — ${skill.description}`);
        if (agent.skills?.length) console.log(`   given the skills ${agent.skills.join(', ')}`);
        if (agent.systemPrompt !== undefined && agent.systemPrompt !== 'default') console.log(`   system prompt: ${agent.systemPrompt}`);
      }
      console.log(`\none in A2A's shape: wf agents card <name>`);
      return;
    }

    default:
      return console.log(HELP);
  }
}
