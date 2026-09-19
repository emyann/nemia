/**
 * The verbs. Parse, call, print — no logic lives here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_FACING, CHECK_AFFECTING, LESSON, approve, approvedFirst, branchWord, checkoutLine, endingSteps, merges, sendBackTo, toDecideWords, approvalWordsRefusal, ceilingLines, ceilings, queueInInbox, queueLine, runSlots, slotWord, addToInbox, dropFromInbox, fromNote, gatesOf, inboxDir, inboxLines, inboxNameAt, noCardLine, onYouWords, readInbox, startFromInbox, workflowAt, artifactFiles, budgetRefusal, budgetWord, artifactLines, artifacts, artifactsDir, branchesToRead, cancel, cardToStart, decide, diffStat, dueNote, engine, forget, forgetLine, inFullLines, inputsDir, inputsNote, lessonLine, list, listRuns, messageRefusal, missingArtifacts, namesInOrder, outputLines, owedFields, parseGlobs, planLines, planStopped, readArtifact, readRun, resultBranches, retry, round, roundDueNote, saidLines, say, sensitiveDiff, start, startPlan, stepsOf, tick, timelineLines, timelineTotalLines, touchedBy, touchedLines, tryNote, usedLines, verdictWord, waitAdvice, waitWord, type ForgetHow, type RetryHow, type RetryMode } from './runner.ts';
import { dollarsOf, workflowFolder } from './workflow.ts';

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
  wf tick                      one pass: tick the engine, file what became ready
  wf up [ms]                   the same, on a timer
  wf ls [runId]                runs and their steps — a run waiting on another says waiting on <run>,
                               one the cap on runs in flight holds waiting for a run slot (2 of 2 in
                               flight); what each step's tries and the run have cost, where measured
  wf cancel <runId>            stop what it has in flight; file nothing more
  wf rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]
                               forget runs that are over, a line each: a run's worktrees removed
                               through git, what one held uncommitted committed first, then its
                               record and every file under WF_ROOT keyed by its id. Refused while
                               a task of it is in flight, anything is due to be filed or asked
                               for, or a run waiting on it has not started. Its branches are kept:
                               --delete-branches deletes those merged into the run's base branch,
                               and --force-unmerged beside it the others, with their work
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
  wf say <runId> <step> "<words>"
                               tell a step's running session something, through its harness: the
                               engine journals the words on the step's task, wf ls notes the step
                               said to, and wf decide prints them under it. A try that continues
                               the session is handed them again, as ## Said to your session
  wf show <runId>              the run, and what each step was told
  wf logs <runId> <step>       that step's session output

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
\`output\` declares what a closeout says for a later step and \`input\` reads it, \`loop\` is the edge back
and \`rounds\` counts it — whether to go round is the step's own \`again\` — and the rest (model, effort,
permissionMode, tools, disallow, remote, deadlineSeconds, maxAttempts, budget) say who does the work, with
what, who may drive it, for how long and for how much. Everything else the agent is told is prose.

  wf ls says what the run established: verified ✓ · checking · failed ✗ check (exit N)
  · unverified (no check: declared) · unsigned (ended without its closeout, or without a field its
  output: declares) · BLOCKED · rounds exhausted (asked for another round on the last)
  · over budget $4.20 of $3 (its tries have cost their budget: or more, and nothing more is filed for
  it on the run's word) · budget exhausted (its harness ended its session at its budget:)
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

To follow what the engine is doing, use the engine — a run's task ids carry the run and the step,
so its output already names the work. Point it at this board:

    AE_ROOT="\${WF_ROOT:-$HOME/.agent-workflows}/engine" ae watch`;

const usage = (message: string): never => { throw Object.assign(new Error(message), { exitCode: 2 }); };

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
    const arg = argv[i]!;
    if (arg !== '--sensitive') usage(`wf decide does not take ${arg}. It takes the run and, at most once, --sensitive <globs> (wf decide --help).`);
    if (sensitive) usage('wf decide takes --sensitive once: put every glob in it, comma-separated, as in --sensitive "src/**,*.json".');
    const value = argv[++i];
    const globs = value === undefined || value.startsWith('--') ? [] : parseGlobs(value);
    if (!globs.length) usage('--sensitive takes the globs whose changed files to print in full, comma-separated: wf decide <runId> --sensitive "src/**,*.json".');
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
 * positional. Dropped, a misspelt `--after` started a run that waited on nothing, and the tick filed it at once.
 */
function readFlags(argv: string[], rules: FlagRules): { values: Record<string, string[]>; switches: string[] } {
  const values: Record<string, string[]> = {};
  const switches: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (rules.switches?.includes(arg)) { switches.push(arg); continue; }
    const joined = arg.startsWith('--') && arg.includes('=');
    const name = joined ? arg.slice(0, arg.indexOf('=')) : arg;
    if (rules.refuses && Object.hasOwn(rules.refuses, name)) usage(rules.refuses[name]!);
    if (!Object.hasOwn(rules.takes, name)) usage(rules.unknown(arg));
    const value = joined ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
    if (!value || (!joined && value.startsWith('--'))) usage(`${name} takes ${rules.takes[name]}`);
    if (values[name] && !rules.repeats?.includes(name)) usage(rules.twice(name));
    (values[name] ??= []).push(value!);
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
  '--gate': 'the step whose closeout waits for a person before anything after it is filed: wf start <brief> --gate <step> [--gate <step> ...]',
  '--brief': "what the run is asked to do in place of an inbox card's body, as text or a file: wf start <inbox>/<name>.md --brief \"<brief>\"",
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
    unknown: (arg) => (arg.startsWith('-')
      ? `wf start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on; --input <file> once per file to hand its steps; --gate <step> once per step to gate; and, for an inbox card, --brief "<brief>".`
      : `wf start takes one brief, and ${arg} is a second. Quote a brief with spaces — wf start "<brief>" — or give it as a file: wf start ./brief.md.`),
    twice: (flag) => `wf start takes ${flag} once: a run ${flag === '--brief' ? 'is asked one thing' : `works on one ${flag === '--repo' ? 'repository' : 'workflow'}`}.`,
  });
  return {
    workflows: values['--workflows']?.[0], repo: values['--repo']?.[0], isolate: !switches.length, after: values['--after'] ?? [], inputs: values['--input'] ?? [], gates: values['--gate'] ?? [],
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
      '--after': 'wf plan does not take --after: each card says what it waits on, in its after:, and the folder is the whole plan. To wait on a run already started, start the card by hand: wf start <card.md> --workflows <dir> --after <runId>.',
      '--workflows': 'wf plan does not take --workflows: each card names its own, in its workflow: — a folder under <repo>/workflows/, or a path from the plan folder.',
      '--input': "wf plan does not take --input: a card's inputs are not a thing yet. Start that card by hand with its files: wf start <card.md> --workflows <dir> --input <file>.",
      '--gate': "wf plan does not take --gate: a plan's cards are gated by their workflows' own gate: true. To gate one card's run at a step, start that card by hand: wf start <card.md> --workflows <dir> --gate <step>.",
    '--no-worktree': 'wf plan does not take --no-worktree: a card another waits on ships a result branch, and a run that works on its base branch has none, so every card after it would wait for ever.',
    },
    unknown: (arg) => (arg.startsWith('-')
      ? `wf plan does not take ${arg}. It takes the plan folder, then --repo <r>.`
      : `wf plan takes one folder, and ${arg} is a second. A plan is every card in one folder: wf plan <folder> --repo <r>.`),
    twice: () => 'wf plan takes --repo once: a plan works on one repository.',
  });
  return { repo: values['--repo']?.[0] };
}

/** `wf inbox queue`'s flags, after the card's name: `--workflow <w>` once, and `--off` — not both. */
function inboxQueueHow(argv: string[]): { workflow?: string; off: boolean } {
  const { values, switches } = readFlags(argv, {
    takes: { '--workflow': 'the workflow the card starts on, by name or as a path: wf inbox queue <name> --workflow <w>' },
    switches: ['--off'],
    unknown: (arg) => (arg.startsWith('-')
      ? `wf inbox queue does not take ${arg}. It takes the card's name, then --workflow <w>, or --off to take the card back.`
      : `wf inbox queue queues one card, and ${arg} is a second: wf inbox queue <name>, once per card.`),
    twice: () => 'wf inbox queue takes --workflow once: a card starts on one workflow.',
  });
  const workflow = values['--workflow']?.[0];
  if (switches.length && workflow !== undefined) usage('--off takes the card out of the queue, and --workflow writes what starts it: give one of them.');
  return { ...(workflow !== undefined ? { workflow } : {}), off: switches.length > 0 };
}

/** `wf inbox add`'s flags, after the idea: `--workflow <name>` and `--repo <path>`, once each. */
function inboxAddHow(argv: string[]): { workflow?: string; repo?: string } {
  const { values } = readFlags(argv, {
    takes: {
      '--workflow': 'the workflow to start the card on, by name or as a path: wf inbox add "<idea>" --workflow <name>',
      '--repo': 'the repository the idea is about: wf inbox add "<idea>" --repo <path>',
    },
    unknown: (arg) => (arg.startsWith('-')
      ? `wf inbox add does not take ${arg}. It takes the idea, then --workflow <name> and --repo <path>.`
      : `wf inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — wf inbox add "<idea>" — or give it as a file: wf inbox add ./idea.md.`),
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
    else if (arg.startsWith('-')) usage(`wf rm does not take ${arg}. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: wf rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]].`);
    else if (!ids.includes(arg)) ids.push(arg);
  }
  if (how.forceUnmerged && !how.deleteBranches) {
    usage('--force-unmerged forces --delete-branches to delete a branch not merged into its run\'s base branch, and alone deletes nothing: wf rm <runId> --delete-branches --force-unmerged.');
  }
  if (!ids.length && argv.length) usage('wf rm takes the runs to forget, by id: wf rm <runId> [<runId> ...] — wf ls lists them.');
  return { ids, how };
}

/** `wf retry`'s own flags: after `--message`, one of these alone is an answer left out, not an answer. */
const RETRY_FLAGS: readonly string[] = ['--nudge', '--fresh', '--recheck', '--model', '--message', '--budget'];

/**
 * `wf retry`'s one choice of how, read off its flags: at most one way, `--model` with a name, and `--message` at most once, with what
 * to tell the step — refused, before a run is read, when it is empty or rides on `--recheck` (`messageRefusal`).
 */
function retryHow(argv: string[]): RetryHow {
  const given: Array<{ mode: RetryMode; model?: string }> = [];
  let message: string | undefined;
  let budget: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--nudge' || arg === '--fresh' || arg === '--recheck') given.push({ mode: arg.slice(2) as RetryMode });
    else if (arg === '--model') {
      const model = argv[++i];
      if (!model || model.startsWith('--')) usage('--model takes the model to run the new session on: wf retry <runId> <step> --model <m>');
      given.push({ mode: 'fresh', model });
    } else if (arg === '--message' || arg.startsWith('--message=')) {
      if (message !== undefined) usage('wf retry takes --message once: put the whole answer in it, quoted — wf retry <runId> <step> --message "<answer>".');
      // The next argument is the answer, whatever it starts with: an answer about a flag names it ("--flag stays"). Only one of this verb's own
      // flags, alone, is read as the answer left out — and `--message=<answer>` carries even that.
      const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
      if (text === undefined) return usage('--message takes what to tell the step, quoted: wf retry <runId> <step> --message "<answer>"');
      if (arg === '--message' && RETRY_FLAGS.includes(text)) {
        usage(`--message takes what to tell the step, and ${text} is one of wf retry's own flags, so the answer was left out: wf retry <runId> <step> --message "<answer>". If ${text} is the whole answer, give it as --message=${text}.`);
      }
      message = text;
    } else if (arg === '--budget' || arg.startsWith('--budget=')) {
      if (budget !== undefined) usage('wf retry takes --budget once: the cap to raise the step to, in dollars — wf retry <runId> <step> --budget <amount>.');
      budget = amountOf(arg === '--budget' ? argv[++i] : arg.slice('--budget='.length), "the most the step's tries may cost together, in dollars, above what they have cost", 'wf retry <runId> <step> --budget <amount>');
    } else usage(`wf retry does not take ${arg}. It takes one of --nudge, --fresh, --model <m>, --recheck, and --message "<answer>" and --budget <amount>.`);
  }
  if (given.length > 1) usage('wf retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.');
  const how: RetryHow = { ...(given[0] ?? { mode: 'nudge' }), ...(message !== undefined ? { message } : {}), ...(budget !== undefined ? { budget } : {}) };
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
    const arg = argv[i]!;
    if (arg !== '--message' && !arg.startsWith('--message=')) {
      usage(`wf approve does not take ${arg}. It takes the run, the step, and --message "<words>": wf approve <runId> <step> [--message "<words>"].`);
    }
    if (message !== undefined) usage('wf approve takes --message once: put all your words in it, quoted — wf approve <runId> <step> --message "<words>".');
    const text = arg === '--message' ? argv[++i] : arg.slice('--message='.length);
    if (text === undefined) usage('--message takes the words that go with your approval, quoted: wf approve <runId> <step> --message "<words>".');
    message = text;
  }
  const wrong = approvalWordsRefusal(message);
  if (wrong) usage(wrong);
  return message;
}

/** A `--budget`'s value as dollars (`dollarsOf`), or refused, saying what it takes: an amount above zero, in digits. */
function amountOf(text: string | undefined, takes: string, form: string): number {
  const amount = text === undefined ? undefined : dollarsOf(text);
  if (amount === undefined) usage(`--budget takes ${takes} — an amount above zero, in digits, like 5 or 2.50${text === undefined ? '' : `, and ${text} is not one`}: ${form}`);
  return amount!;
}

/** `wf round`'s arguments after the run: the step that closes the loop, when there is more than one, and `--budget <amount>`, at most once each. */
function roundHow(argv: string[]): { stepName?: string; budget?: number } {
  let stepName: string | undefined;
  let budget: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--budget' || arg.startsWith('--budget=')) {
      if (budget !== undefined) usage('wf round takes --budget once: the cap to raise the steps of the loop over their budget to, in dollars — wf round <runId> [<step>] --budget <amount>.');
      budget = amountOf(arg === '--budget' ? argv[++i] : arg.slice('--budget='.length), 'the most a step of the loop may cost together, in dollars, above what it has cost', 'wf round <runId> [<step>] --budget <amount>');
    } else if (arg.startsWith('--') || stepName !== undefined) {
      usage('wf round takes the run and, when the run has more than one loop, the step that closes the one to go round: wf round <runId> [<step>] — and --budget <amount>, to raise the cap of a step of the loop over its budget.');
    } else stepName = arg;
  }
  return { ...(stepName !== undefined ? { stepName } : {}), ...(budget !== undefined ? { budget } : {}) };
}

/** `e` is the engine the verbs talk to: the board under `WF_ROOT`, unless a test hands it one of its own. */
export async function main(argv: string[], e: ReturnType<typeof engine> = engine()): Promise<void> {
  const [verb, ...rest] = argv;

  switch (verb) {
    case 'start': {
      const arg = rest[0];
      if (!arg || arg.startsWith('--')) return console.log(HELP);
      const how = startHow(rest.slice(1));
      const printStarted = (run: ReturnType<typeof start>, from?: string) => {
        const steps = stepsOf(run);
        // Each node with what is attached to it: `review (reviewer)`. A node with no agent is its name alone.
        console.log(`${run.id}  ${steps.length} step(s): ${steps.map((s) => s.agent ? `${s.name} (${s.agent.name})` : s.name).join(' → ')}`);
        if (from) console.log(from);
        console.log(`workspace: ${run.workspace}`);
        if (run.inputs?.length) console.log(`inputs: ${run.inputs.join(', ')} — copied into ${inputsDir(run)}`);
        if (run.after?.length) console.log(`waits on: ${run.after.join(', ')} — nothing is filed until wf decide says each has shipped onto ${run.branch}`);
        const gates = gatesOf(steps, run);
        // An ending step in the repository's checkout is held before it is filed, not after it signs off: its approval is what runs it.
        const ends = endingSteps(steps, run).filter((s) => approvedFirst(s, run)).map((s) => s.name);
        const held = gates.filter((name) => !ends.includes(name));
        if (held.length) console.log(`gated at: ${held.join(', ')} — nothing after ${held.length > 1 ? 'each' : 'it'} is filed until wf approve ${run.id} <step>, once it has signed off`);
        if (ends.length) console.log(`ends at: ${ends.join(', ')} — nothing of ${ends.length > 1 ? 'them' : 'it'} runs until wf approve ${run.id} ${ends[0]}, which is what files ${ends.length > 1 ? 'them' : 'it'}`);
        console.log(`run 'wf tick' (or 'wf up') to start it`);
      };
      // A card of the inbox starts out of it, and leaves it. Its brief is its body, or --brief; its workflow and repository are the flags', else its own.
      const inboxName = inboxNameAt(arg);
      if (inboxName !== null) {
        const brief = how.brief === undefined ? undefined : fs.statSync(how.brief, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(how.brief, 'utf8') : how.brief;
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
        printStarted(started.run, started.removed
          ? `${fromNote(started.run)} — removed from the inbox`
          : `${fromNote(started.run)} — still in the inbox: ${started.why}. wf inbox lists it as started as ${started.run.id}: drop it with wf inbox rm ${inboxName}`);
        return;
      }
      if (how.brief !== undefined) usage(`wf start takes --brief only for a card of the inbox, in place of its body: wf start ${path.join(inboxDir(), '<name>.md')} --brief "<brief>". Anywhere else the brief is its first argument: wf start "<brief>".`);
      const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : undefined;
      // A card of a plan — what `wf plan` prints `wf start <card>` for — starts its body. Any other file is the brief whole, frontmatter and all.
      const card = text === undefined ? null : cardToStart(arg, text, how.after);
      const repo = path.resolve(how.repo ?? '.');
      const run = start({
        brief: card ? card.body : text?.trim() ?? arg,
        repo,
        // A folder from here, or one of the repository's by name: `--workflows dev` is <repo>/workflows/dev. Without the flag, a card's
        // `workflow:`, found from its plan folder as `wf plan` finds it.
        workflowDir: how.workflows === undefined && card?.workflow !== undefined
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

    // A folder of cards, started as a whole. It writes the runs and nothing else; the tick does the waiting.
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

    // Cards before they are started. Each writes one card's file, or removes one, and nothing else: a card is started with wf start.
    case 'inbox': {
      const [sub, ...args] = rest;
      if (sub === '--help') return console.log(INBOX_HELP);
      if (sub === undefined) {
        const listing = readInbox();
        if (!listing.length) return console.log(`the inbox is empty — park an idea with wf inbox add "<idea>"`);
        for (const line of inboxLines(listing)) console.log(line);
        console.log(`\nstart one: wf start ${path.join(inboxDir(), '<name>.md')} [--workflows <w>] [--repo <r>] — queue one: wf inbox queue <name> — drop one: wf inbox rm <name>`);
        return;
      }
      if (sub === 'add') {
        const idea = args[0];
        if (idea === undefined || idea.startsWith('--')) usage('wf inbox add takes the idea, first: wf inbox add "<idea>" [--workflow <name>] [--repo <path>], or a file: wf inbox add ./idea.md. Nothing was filed.');
        const how = inboxAddHow(args.slice(1));
        const at = fs.statSync(idea!, { throwIfNoEntry: false });
        if (at?.isDirectory()) usage(`${idea} is a directory, and wf inbox add takes the idea as text or as one file: wf inbox add "<idea>", or wf inbox add ./idea.md.`);
        // A workflow given as a path is kept absolute, so it names the same folder from the inbox; a name stays a name, found in the repository at
        // start. The flag's is read from here; a file's own `workflow:`, from the file's folder.
        const workflow = how.workflow === undefined ? undefined : workflowAt(how.workflow, process.cwd());
        const { card, file } = addToInbox({
          text: at ? fs.readFileSync(idea!, 'utf8') : idea!,
          ...(at ? { from: idea, dir: path.dirname(path.resolve(idea!)) } : { dir: process.cwd() }),
          ...(workflow !== undefined ? { workflow } : {}),
          ...(how.repo !== undefined ? { repo: path.resolve(how.repo) } : {}),
        });
        console.log(`${card.name}  ${card.body.split('\n')[0]!.slice(0, 56)}${card.workflow ? `  workflow: ${card.workflow}` : ''}${card.repo ? `  repo: ${card.repo}` : ''}`);
        console.log(`filed: ${file} — start it with wf start ${file}${card.workflow ? '' : ' --workflows <w>'}`);
        return;
      }
      if (sub === 'queue') {
        const [name, ...more] = args;
        if (name === undefined || name.startsWith('--')) usage('wf inbox queue takes the name of the card to queue, as wf inbox lists it: wf inbox queue <name> [--workflow <w>] [--off].');
        const how = inboxQueueHow(more);
        // A workflow given as a path is kept absolute, as `wf inbox add` keeps it.
        const workflow = how.workflow === undefined ? undefined : workflowAt(how.workflow, process.cwd());
        const queued = queueInInbox(name!, { off: how.off, ...(workflow !== undefined ? { workflow } : {}) });
        if (queued.was === 'not queued') return console.log(`${name}  not queued — nothing to take back`);
        if (queued.was === 'taken back') return console.log(`${name}  taken back: it no longer starts on its own — start it with wf start ${queued.file}`);
        console.log(`${name}  queued at ${queued.card.queued}, ${queued.place} of ${queued.of}  workflow: ${queued.card.workflow}${queued.card.repo ? `  repo: ${queued.card.repo}` : ''}`);
        console.log(`the tick starts it on its own once its turn comes and a run slot is free${queued.card.repo ? '' : ", on the repository wf up runs in"} — take it back with wf inbox queue ${name} --off`);
        return;
      }
      if (sub === 'rm') {
        const [name, ...more] = args;
        if (name === undefined || name.startsWith('--')) usage('wf inbox rm takes the name of the card to drop, as wf inbox lists it: wf inbox rm <name>.');
        if (more.length) usage(`wf inbox rm drops one card, and ${more[0]} is a second: wf inbox rm <name>, once per card.`);
        const dropped = dropFromInbox(name!);
        return console.log(dropped.removed ? `${name}  dropped, and nothing started — ${dropped.file} removed` : `${noCardLine(name!, dropped.cards)} Nothing to drop.`);
      }
      return usage(`wf inbox does not take ${sub}. It lists the inbox — wf inbox — files a card with wf inbox add "<idea>", queues one with wf inbox queue <name>, and drops one with wf inbox rm <name> (wf inbox --help).`);
    }

    case 'tick': {
      // A queued card names no repository: it starts on this one, as `wf start` takes `.`.
      const { runs: results, queue } = await tick(e, { repo: path.resolve('.') });
      if (queue) console.log(queueLine(queue));
      if (!results.length && !queue) return console.log('no runs');
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
      return;
    }

    case 'up': {
      const every = Number(rest[0]) || 4_000;
      console.log(`up — every ${every}ms, ^C to stop`);
      // Both ceilings, in words, before the first pass: what the daemon holds work to.
      for (const line of ceilingLines(ceilings())) console.log(`   ${line}`);
      // The failure this daemon last said, so that it says it once and no more. A card whose start fails without a refusal is tried on
      // every pass, and the pass writes down what it said (`QueueTry`, `again`) — but that pass may have been another `wf up` or a
      // `wf tick`, whose line is on a terminal that is gone, and a person restarting the daemon to see why cards stopped starting must be
      // told. So the daemon goes by what it has said itself, not by what the store has written: `again` is not read here. Nothing is
      // decided on it — a pass decides what it decides, and this is only what has been printed.
      let said: string | undefined;
      for (;;) {
        // A queued card that names no repository starts on the one `wf up` runs in, as `wf start` takes `.`.
        const { runs: passed, queue } = await tick(e, { repo: path.resolve('.') });
        if (queue) {
          // A pass at a full cap reads no queue at all (`tick`), so the first pass that does is the first that can say anything.
          const failure = 'failed' in queue ? `${queue.card}  ${queue.on ?? ''}  ${queue.failed}` : undefined;
          if (failure === undefined || failure !== said) console.log(`${new Date().toISOString().slice(11, 19)}  ${queueLine(queue)}`);
          said = failure;
        }
        for (const r of passed) {
          for (const note of r.notes) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  ${note}`);
          if (r.filed.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  filed ${r.filed.join(', ')}`);
          if (r.tried.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  tried again ${r.tried.join(', ')}`);
          if (r.looped.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  round again ${r.looped.join(', ')}`);
          if (r.checked.length) console.log(`${new Date().toISOString().slice(11, 19)}  ${r.run.id}  checking ${r.checked.join(', ')}`);
        }
        await new Promise((r) => setTimeout(r, every));
      }
    }

    case 'ls': {
      const runs = rest[0] ? [readRun(rest[0])] : listRuns();
      if (!runs.length) return console.log('no runs');
      // Which runs the cap on runs in flight holds, judged over the whole store: a run is held by the runs beside it.
      const held = await runSlots(e);
      for (const run of runs) {
        const calledOff = run.cancelledAt ? '  (cancelled)' : '';
        const { steps, waitingOnYou, waiting, cost, toDecide } = await list(e, run, held.get(run.id));
        // What the run has cost so far, on its line, where the engine measured it.
        console.log(`${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}${calledOff}${cost ? `  ${cost}` : ''}`);
        // Each step's word, and what its tries have cost beside it: `verified ✓  $3.01`.
        const said = steps.map((s) => `${s.status}${s.cost ? `  ${s.cost}` : ''}`);
        // As wide as this run's longest status, so its branches still line up beside it.
        const width = Math.max(20, ...said.map((w) => w.length));
        for (const [i, s] of steps.entries()) {
          // The try a step is on, or the try due, beside its line: `try 2 asked (--nudge)`, `try 2, by retries: 1`.
          console.log(`   ${s.name.padEnd(14)} ${said[i]!.padEnd(width)} ${s.branch ?? ''}${s.note ? `  · ${s.note}` : ''}`);
        }
        // What is left to decide about the result: the ending step's gate, in the folder's own words, with the approval that runs it — or,
        // in a folder with no ending step, the branch nobody has merged. Said before who else the run waits on, since it is the run's end.
        if (toDecide) console.log(`   → to decide: ${toDecideWords(run, toDecide)}`);
        // The step a person has to act on, and where to act. Said here and not left to the result
        // line, because a run blocked on its first step has no result branch yet. A step at its gate is named with what is asked: approve plan.
        // The ending step's own gate is the line above, and is not said twice.
        const onYou = onYouWords({ steps, waitingOnYou }).filter((said) => !(toDecide?.kind === 'approve' && said === `approve ${toDecide.step}`));
        if (onYou.length) console.log(`   → waiting on you: ${onYou.join(', ')}  —  wf decide ${run.id}`);
        // A run it waits on that will never ship without a person — cancelled, say — is a person's to resolve, and the line says how.
        if (waiting.some((w) => w.missing || w.cancelledAt || w.gone?.length)) console.log(`   → waiting on you: ${waitAdvice(run, waiting)}`);
        // Where to go and look. A run whose result nobody can find is a run that did not happen.
        const result = resultBranches(run);
        if (result.length) console.log(`   → result: ${result.join(', ')}  —  wf decide ${run.id}`);
      }
      return;
    }

    case 'cancel': {
      if (!rest[0]) return console.log(HELP);
      const { run, plan } = await cancel(e, rest[0]);

      // Say what happened, in every case. A `wf cancel` that prints nothing is indistinguishable
      // from one that did nothing — and "already finished" and "nothing was in flight" are exactly
      // the answers a person cannot tell apart from silence.
      if (plan.kind === 'finished') return console.log(`${run.id}  already ${plan.status} — nothing to stop`);

      console.log(plan.kind === 'already-cancelled' ? `${run.id}  already cancelled at ${plan.at}` : `${run.id}  cancelled`);
      if (plan.stop.length) console.log(`   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`);
      else if (plan.kind === 'cancel') console.log(`   nothing was in flight — no further steps will be filed`);
      return;
    }

    // Forgetting a run that is over: never cancelling one. Each run is judged on its own and gets its line, a refusal included; a run not
    // forgotten makes the verb fail once every run has had its say, so a script sees it.
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
        throw Object.assign(new Error(`wf rm: ${notForgotten.join(', ')} not forgotten — ${notForgotten.length > 1 ? 'each' : 'its'} line above says why, and what to do.`), { exitCode: failed ? 1 : 2 });
      }
      return;
    }

    // The run does not end by going quiet. A review and a reply are two opinions and something
    // has to say what ships — which is a person's job, so the run's last act is to put the
    // material in front of one. Read-only on purpose: it shows the choice and the exact commands,
    // and does not decide anything itself.
    case 'decide': {
      if (rest.includes('--help')) return console.log(DECIDE_HELP);
      if (!rest[0]) return console.log(HELP);
      // Read before the run is: a mistyped flag is refused, not a screen quietly printed without it — and
      // so is a flag before the run, which would otherwise be the general help and exit 0.
      if (rest[0].startsWith('--')) usage(`wf decide takes the run first: wf decide <runId> [--sensitive <globs>] — not ${rest[0]} before it.`);
      const { sensitive } = decideHow(rest.slice(1));
      const { run, decision, closeouts, checks, retrying, rounding, offers, overBudgetLine, used, costs, runCost, answers, answering, gates, waiting, said, timeline, held, checkout, standings, toDecide } = await decide(e, rest[0]);
      // The files a person gave the run, under its line, on every screen: the steps were handed them.
      const given = inputsNote(inputsDir(run), run.inputs);
      // And the inbox card it was started from, when it was.
      const from = fromNote(run);
      const head = `${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}${from ? `\n  ${from}` : ''}${given ? `\n  ${given}` : ''}`;
      const steps = stepsOf(run);

      if (decision.kind === 'cancelled') return console.log(`${head}\n\n  cancelled at ${decision.at} — nothing to decide`);
      // Nothing of it is filed: the runs it waits on are the whole of what there is to say, and nothing else is offered.
      if (waiting.length) return console.log(`${head}\n\n  ${waitWord(waiting)}\n  ${waitAdvice(run, waiting)}`);
      // Nor while the cap on runs in flight holds it: the tick files its roots once a run in flight settles.
      if (held) return console.log(`${head}\n\n  ${slotWord(held)}\n  nothing of ${run.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`);
      // An ending a person's word would file, waiting for the repository's own checkout: which run's step is in it, and what frees this one.
      // Said on either screen — a run whose ending has not run is still running, and one whose ending ended blocked is waiting on a person.
      const ending = steps.find((s) => s.workspace === 'main');
      const heldOut = checkout && ending ? `  ${checkoutLine(ending.name, checkout)}` : '';
      if (decision.kind === 'running') {
        console.log(`${head}\n\n  still running: ${decision.waiting.join(', ')}`);
        // A try the next tick files is why a run that had stopped is running again: said, with whose word it is — unless the checkout holds
        // it, which the line below says instead: the next tick files nothing of it.
        for (const r of retrying.filter((r) => !(heldOut && r.step === ending?.name))) console.log(`  ${r.step}: ${dueNote(steps.find((s) => s.name === r.step)!, run, r)}`);
        // So is a loop going round again.
        for (const r of rounding) console.log(`  ${r.step}: ${roundDueNote(steps, r)}`);
        if (heldOut) console.log(heldOut);
        return console.log('  nothing to decide yet');
      }
      if (decision.kind === 'shipped') {
        // An ending that never ran, on a run git reads as shipped: its result was merged without it, and its line on `wf ls` still sits at its
        // gate — said here too, with the one command there still is, so the two screens do not disagree about who is waited on.
        const unrun = steps.find((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId);
        const never = unrun ? `\n  ${unrun.name} never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: wf cancel ${run.id}` : '';
        return console.log(`${head}\n\n  shipped — ${decision.branches.join(', ')} is already on ${run.branch}${never}`);
      }

      console.log(`${head}\n`);
      // The run's own verdicts first: they decide how much of the rest is worth reading.
      if (decision.failedCheck.length) console.log(`  FAILED CHECK: ${decision.failedCheck.join(', ')}  — the run executed its check and it did not exit 0; nothing after it ran`);
      if (decision.unfinishedCheck.length) console.log(`  CHECK DID NOT FINISH: ${decision.unfinishedCheck.join(', ')}  — stopped, or killed before it exited: no verdict on the work, and no retry spent; nothing after it ran`);
      if (decision.unsigned.length) console.log(`  UNSIGNED: ${decision.unsigned.join(', ')}  — ended without the closeout it was asked for, or without a field its output: declares; nothing after it ran`);
      if (decision.unverified.length) console.log(`  UNVERIFIED: ${decision.unverified.join(', ')}  — no check: declared; only its own word says it worked`);
      if (decision.failed.length) console.log(`  FAILED: ${decision.failed.join(', ')}  (wf logs ${run.id} <step>)`);
      // A step that stopped itself and said why is a different thing from one that broke, and the
      // difference decides whether you read a summary or a log.
      if (decision.stuck.length) console.log(`  BLOCKED, waiting on you: ${decision.stuck.join(', ')}`);
      // A reviewer still asking after the rounds its workflow allows is the sign of a design question or a decision, and it is yours.
      if (decision.exhausted.length) console.log(`  ROUNDS EXHAUSTED, waiting on you: ${decision.exhausted.join(', ')}  — asked for another round on the last one rounds: allows; its findings are below`);
      // A cap reached is a person's to raise: the run spends nothing more on the step on its own word.
      // Beside how each ended on its own work, above: why each is held — its own spend, or a step its loop would file again.
      if (overBudgetLine) console.log(`  ${overBudgetLine}`);
      if (decision.budgetExhausted.length) console.log(`  BUDGET EXHAUSTED, waiting on you: ${decision.budgetExhausted.join(', ')}  — its harness ended its session at its budget:; nothing after it ran`);
      // A gate is a person's word the run waits for: what the step handed on is below, with the approval that lets it go on and the
      // send-back. An ending step is held before it is filed, so it has handed nothing on: its approval is what runs it.
      const handedOn = decision.awaitingApproval.filter((name) => run.steps[name]?.taskId);
      const unrun = decision.awaitingApproval.filter((name) => !run.steps[name]?.taskId);
      if (handedOn.length) console.log(`  AWAITING APPROVAL, waiting on you: ${handedOn.join(', ')}  — signed off at its gate; nothing after it is filed until you approve it, or send it back`);
      if (unrun.length) console.log(`  AWAITING APPROVAL, waiting on you: ${unrun.join(', ')}  — this workflow's ending, at its gate: nothing of it has run, and your approval is what runs it`);
      if (decision.outcome === 'succeeded' && !decision.unverified.length) console.log(`  every step verified`);
      // And the checkout, where a try of the ending waits for it: the ask stands, and the tick files it once that step settles.
      if (heldOut) console.log(heldOut);
      // What a person can do about a step short of starting over: try it again, or a loop once more, the way that fits why it stopped.
      if (offers.length) console.log(`\n  once more, on the next tick:\n${offers.map((line) => `    ${line}`).join('\n')}`);

      // What the branch touched, before any step's account of it: which parts of the repository, and
      // whether among them are the files an agent reads as instructions or those that decide what its
      // check means. Then the lesson — CLAUDE.md's "When you miss", held to — and those check files in
      // full, because a check that passed says nothing about a check that was changed to pass.
      // Never the run's own base branch on a run that cut worktrees: a step that recorded it worked in the repository's checkout, and
      // what that branch holds against the run's frozen base is every other run's merge since, not this run's work (`branchesToRead`).
      const touched = branchesToRead(decision.branches, namesInOrder(run, steps).map((name) => run.steps[name]!.branch), run.isolate ? run.branch : undefined)
        .map((branch) => ({ branch, radius: touchedBy(run, branch) }));
      if (touched.length) {
        console.log();
        for (const line of touchedLines(touched)) console.log(`  ${line}`);
        console.log(`  ${lessonLine(touched)}`);
        for (const t of touched) {
          console.log();
          for (const line of inFullLines(t, sensitive, sensitiveDiff(run, t, sensitive ?? CHECK_AFFECTING), touched.length > 1)) console.log(`  ${line}`);
        }
      }

      // Each step's own closeout: the summary is written FOR this moment. The reviewer never saw
      // it — that is the point of the field — and you are the audience it was addressed to. Above it,
      // what the run's check of the step said: the machine's word before the agent's. Below it, what the
      // step declared for the steps after it — read off the engine's record, not a branch, so dropping
      // the branch does not drop the review.
      // In the order the steps run, whatever order the record is keyed in.
      for (const name of namesInOrder(run, steps)) {
        const c = closeouts[name];
        const check = checks[name];
        // A step the run filed consumed something, closeout or not; one never filed has nothing to say.
        if (!c && !check && !run.steps[name]?.taskId) continue;
        const blocked = c && !('error' in c) && c.outcome === 'blocked';
        const step = steps.find((s) => s.name === name);
        // The try — and the round — whose closeout and check these are, when it is not the first, and whether a person answered it.
        const tried = step ? tryNote(step, run.steps[name], steps, Boolean(answers[name])) : '';
        console.log(`\n  ${name}${blocked ? '  BLOCKED' : ''}${tried ? `  (${tried})` : ''}`);
        // Its gate, under its name: approved, when and with what words — or awaiting approval, and the commands that answer it.
        if (gates[name]) console.log(`    gate  ${gates[name].split('\n').join('\n          ')}`);
        if (check) {
          console.log(`    check  ${check.command}  →  ${verdictWord(check.verdict)} ${check.passed ? '✓' : '✗'}`);
          // For a check that refused, the last of each stream, labelled: which pipe a line came from
          // is the difference between a runner's progress noise and its summary.
          for (const [stream, text] of [['stdout', check.stdout], ['stderr', check.stderr]] as const) {
            if (!check.passed && text) console.log(`      ${stream}:\n        ${text.split('\n').join('\n        ')}`);
          }
        }
        // What its session consumed, beside the check's word on it — or that nobody measured it — and what its tries cost, against its budget.
        const [usedLine, costOfTry] = usedLines(used[name]);
        console.log(`    ${usedLine}`);
        console.log(`    ${costs[name] ?? costOfTry}`);
        // Where its time went, try by try and check by check: when each was filed, spawned and ended, how long it queued and ran.
        for (const line of timelineLines(timeline.steps[name] ?? [])) console.log(`    ${line}`);
        // What a person said to this try, beside what the try before it needed: the question and its answer, before what the try made of them.
        const answer = answers[name];
        if (answer?.needs) console.log(`    try ${answer.try - 1} needs: ${answer.needs.split('\n').join('\n    ')}`);
        if (answer) console.log(`    your answer: ${answer.message.split('\n').join('\n    ')}`);
        // What a person said to its sessions while they ran, as data, before the step's own account: a scope a person widened mid-flight is
        // the reviewer's to weigh, not the step's to claim.
        for (const line of saidLines(said[name] ?? []).flatMap((l) => l.split('\n'))) console.log(`    ${line}`);
        if (!c) continue;
        if ('error' in c) { console.log(`    closeout unreadable — ${c.error}`); continue; }
        if (c.summary) console.log(`    ${c.summary.split('\n').join('\n    ')}`);
        // What it declared — and, for a loop's target past its first round, its replies to the findings.
        for (const line of step ? outputLines(step, c, owedFields(step, run, steps)) : []) console.log(`    ${line}`);
        if (c.needs) console.log(`    needs: ${c.needs}`);
        // The question, then the command that answers it.
        if (answering[name]) console.log(`    ${answering[name]}`);
        // What it declared that is not where it says, then what is in the directory the run made for its
        // files: the screenshots a UI step's check took, say, which are on no branch.
        const files = artifactLines(artifactsDir(run, name), missingArtifacts(run, name, c), artifactFiles(run, name));
        for (const line of files) console.log(`    ${line}`);
      }
      console.log();
      // And the run's: what it cost, every step's tries together; then each round's time when its loop went round, and the whole run's.
      const totals = [...runCost, ...timelineTotalLines(timeline)];
      if (totals.length) {
        for (const line of totals) console.log(`  ${line}`);
        console.log();
      }

      for (const branch of decision.branches) {
        const stat = diffStat(run, branch);
        console.log(`  ${branch}${stat ? `  —${stat}` : ''}`);

        // Markdown a step ADDED is a message written for whoever reads next, and today that is
        // you. Source it added is in the diff, where source belongs.
        const notes = artifacts(run, branch).filter((f) => f.endsWith('.md') && !f.includes('/'));
        for (const file of notes) {
          const text = readArtifact(run, branch, file).trimEnd();
          const lines = text.split('\n');
          console.log(`\n  ── ${file} ${'─'.repeat(Math.max(0, 64 - file.length))}`);
          for (const l of lines.slice(0, 120)) console.log(`  ${l}`);
          if (lines.length > 120) console.log(`  … ${lines.length - 120} more lines — git show ${branch}:${file}`);
        }
      }

      // Worked on the base branch itself (`--no-worktree`): `merge --no-ff main` into main is nothing, `branch -D main` is not a command
      // to print beside it, and a standing would read `main is on main`. What there is to decide is still said, below.
      if (decision.direct) {
        console.log(`\n  worked directly on ${run.branch}; nothing to merge; the base was ${run.baseRef}`);
        console.log(`  read it    git -C ${run.repo} diff ${run.baseRef}...${run.branch}`);
      } else if (standings.length) {
        // The facts about the result, before anything to do about it: where each branch stands against the base branch, as git says it now.
        console.log();
        for (const s of standings) console.log(`  branch    ${branchWord(run, s)}`);
      }

      // What is left to decide: the step a person's word is waited on for. For an ending that has not run, what it would do, in the
      // folder's own words, since approving is what runs it; for a gated step that has, nothing but the word — its closeout is above.
      if (toDecide?.kind === 'approve') {
        const step = steps.find((s) => s.name === toDecide.step)!;
        console.log(`\n  to decide  ${step.name}${toDecide.says === null ? ' has signed off and waits for your word' : " has not run: this workflow's ending, and your approval is what runs it"}:`);
        if (toDecide.says !== null) for (const line of step.body.split(/\n[ \t]*\n/)[0]!.split('\n')) console.log(`    ${line}`);
        console.log(`\n  approve it    wf approve ${run.id} ${step.name} [--message "<words>"]`);
        for (const back of sendBackTo(step, run)) console.log(`  send it back  wf retry ${run.id} ${back} --message "<objection>"`);
        return;
      }

      // And where no step of the workflow merges (`merges`), the commands a person runs by hand: this folder says nothing about what
      // happens when the work is done, whether its last step was gated or not, and its branch is still a person's to land or drop.
      // None for a run that worked on the base branch itself: there is nothing to merge, and its own lines are above.
      const first = decision.branches[0];
      if (first && !merges(steps) && !decision.direct) {
        console.log(`\n  ship it   git -C ${run.repo} merge --no-ff ${first}`);
        console.log(`  drop it   git -C ${run.repo} branch -D ${decision.branches.join(' ')}`);
      }
      return;
    }

    // A person's word that a step gets one more try. It writes the ask and nothing else: the tick, which owns
    // the run's record, honours it once on its next pass, as it enforces a cancellation.
    case 'retry': {
      const [runId, stepName] = rest;
      if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
      // A step whose session its harness blocked is taken too: the tick stops that session, then files the try.
      const { ask, file, stopFirst } = await retry(e, runId, stepName, retryHow(rest.slice(2)), { stopBlocked: true });
      const how = `${ask.model ? `--model ${ask.model}` : `--${ask.mode}`}${ask.budget !== undefined ? `, --budget ${ask.budget}` : ''}`;
      const then = stopFirst ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped' : 'the next tick files it, once';
      console.log(`${runId}  asked: try ${ask.try} of ${stepName} (${how})${ask.message !== undefined ? ', with your answer' : ''} — ${then}`);
      console.log(`   ${file}`);
      return;
    }

    // A person's word at a gate. Like `wf retry`, it writes the approval and nothing else: the tick reads it on every pass, and files what waits.
    case 'approve': {
      const [runId, stepName, ...more] = rest;
      if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
      const { approval, file } = await approve(e, runId, stepName, approveHow(more));
      // What the approval lets happen: an ending step is filed by the next tick, since its approval is what files it; a step something
      // waits on hands on to what waits; a last step that has run hands its run on to be decided.
      const after = readRun(runId);
      const waited = stepsOf(after).some((s) => s.after.includes(stepName));
      const files = !after.steps[stepName]?.taskId;
      console.log(`${runId}  approved: try ${approval.try} of ${stepName}${approval.message !== undefined ? ', with your words' : ''} — ${files ? `the next tick files ${stepName}` : waited ? 'the next tick files what waits on it' : 'nothing waits on it: its run can be decided'}`);
      console.log(`   ${file}`);
      return;
    }

    // A person's "once more" for a loop whose rounds are spent. Like `wf retry`, it writes the ask and nothing else: the tick honours it once.
    case 'round': {
      const [runId, ...more] = rest;
      if (!runId || runId.startsWith('--')) return console.log(HELP);
      const { stepName, budget } = roundHow(more);
      const { ask, file } = await round(e, runId, stepName, budget);
      console.log(`${runId}  asked: round ${ask.round} of ${ask.step}'s loop${ask.budget !== undefined ? `, its cap raised to ${budgetWord(ask.budget)}` : ''} — the next tick files it, once`);
      console.log(`   ${file}`);
      return;
    }

    // A person's words to a step's running session, through the engine's `say`, which journals them: the one record, and this verb writes
    // nothing else. The words are everything after the step, so an unquoted sentence is one message; empty ones are the engine's to refuse.
    case 'say': {
      const [runId, stepName, ...words] = rest;
      if (!runId || !stepName || runId.startsWith('--') || stepName.startsWith('--')) return console.log(HELP);
      const told = await say(e, runId, stepName, words.join(' '));
      const { at, attempt, text } = told.said;
      console.log(`${runId}  said to ${stepName}, try ${told.try}${attempt > 1 ? `, attempt ${attempt}` : ''}, at ${at} — journalled on ${told.taskId}: wf decide ${runId} prints it under the step`);
      for (const line of saidLines([{ at, attempt, text, try: told.try }]).slice(1).flatMap((l) => l.split('\n'))) console.log(`   ${line}`);
      return;
    }

    case 'show': {
      if (!rest[0]) return console.log(HELP);
      const run = readRun(rest[0]);
      // The frozen workflow is shown by its keys; each step's prose is what `wf logs` is for.
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

    default:
      return console.log(HELP);
  }
}
