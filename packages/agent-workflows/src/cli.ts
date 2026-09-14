/**
 * The verbs. Parse, call, print — no logic lives here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_FACING, CHECK_AFFECTING, LESSON, artifactFiles, artifactLines, artifacts, artifactsDir, branchesToRead, cancel, decide, diffStat, dueNote, engine, inFullLines, lessonLine, list, listRuns, messageRefusal, missingArtifacts, outputLines, owedFields, parseGlobs, planLines, planStopped, readArtifact, readRun, resultBranches, retry, round, roundDueNote, saidLines, say, sensitiveDiff, start, startPlan, stepsOf, tick, touchedBy, touchedLines, tryNote, usedLines, verdictWord, waitAdvice, waitWord, type RetryHow, type RetryMode } from './runner.ts';
import { workflowFolder } from './workflow.ts';

const HELP = `wf — run a workflow of agent steps

  wf start <brief.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...]
                               --after <runId>: file nothing of this run until wf decide says that
                               run has shipped — finished, and its result branch on the base
                               branch — and start from the base as it is then; once per run.
                               --workflows takes a folder, or a name under <repo>/workflows/: dev
  wf plan <folder> [--repo .]  start a plan: one run per card in the folder, parents first, each
                               --after the runs of the cards its after: names (wf plan --help)
  wf tick                      one pass: tick the engine, file what became ready
  wf up [ms]                   the same, on a timer
  wf ls [runId]                runs and their steps — a run waiting on another says waiting on <run>
  wf cancel <runId>            stop what it has in flight; file nothing more
  wf decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (wf decide --help)
  wf retry <runId> <step> [--nudge | --fresh | --model <m> | --recheck] [--message "<answer>"]
                               try a step waiting on you again, once, on the next tick:
                               --nudge (default) continues its session, told what happened;
                               --fresh a new session on its branch; --model <m> the same, on m;
                               --recheck runs its check again, and files no session;
                               --message "<answer>" goes into the try's brief, as ## Your answer:
                               for a step that signed off blocked, the answer to its needs — or
                               what you have to say to any step you try again; not with --recheck.
                               The next argument is the answer, whatever it starts with; an answer
                               that is only one of these flags' names goes as --message=<answer>
  wf round <runId> [<step>]    once more: a loop out of rounds goes round again, once, on the
                               next tick — the step it loops to continued, then a new reviewer
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
tries the run may re-file a step its check refused, \`output\` declares what a closeout says for a later
step and \`input\` reads it, \`loop\` is the edge back and \`rounds\` counts it — whether to go round is the
step's own \`again\` — and the rest (model, effort, permissionMode, tools, deadlineSeconds, maxAttempts) say
who does the work, with what, and for how long. Everything else the agent is told is prose.

  wf ls says what the run established: verified ✓ · checking · failed ✗ check (exit N)
  · unverified (no check: declared) · unsigned (ended without its closeout, or without a field its
  output: declares) · BLOCKED · rounds exhausted (asked for another round on the last).

  WF_ROOT            where runs and the engine's board live
  WF_MAX_CONCURRENT  sessions per harness at once (default 2)

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

const DECIDE_HELP = `wf decide <runId> [--sensitive <globs>]

What the run produced, and the choice it leaves you. It prints the commands — ship it, drop it, once
more — and runs none of them. On a run waiting on you, after the run's verdicts and before each step's
closeout:

  touched   what each result branch changed against the run's base: files and lines by workspace
            package or top-level directory, then, each only when true, the agent-facing files and
            the check-affecting ones
  lesson    whether the run changed a file where the next agent reads, or that it wrote nothing there
  in full   the whole diff of the check-affecting files: what a change could edit to make its check pass

and beside each step's check, what its session consumed — used, cost — or that nobody measured it. Under
each step, before its closeout, what a person said to its sessions while they ran (wf say), with when.

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

type StartHow = { workflows?: string; repo?: string; isolate: boolean; after: string[] };

/** What each of `wf start`'s value flags takes, as its refusal says it. */
const START_TAKES = {
  '--workflows': 'the workflow folder: wf start <brief> --workflows <dir>',
  '--repo': 'the repository the run works on: wf start <brief> --repo <r>',
  '--after': 'the run this one waits on, by its id: wf start <brief> --after <runId> [--after <runId> ...]',
} as const;

/** `wf start`'s flags, after the brief: `--workflows <dir>`, `--repo <r>`, `--after <runId>` as often as there are runs to wait on, and `--no-worktree`. */
function startHow(argv: string[]): StartHow {
  const { values, switches } = readFlags(argv, {
    takes: START_TAKES,
    switches: ['--no-worktree'],
    repeats: ['--after'],
    unknown: (arg) => (arg.startsWith('-')
      ? `wf start does not take ${arg}. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId> once per run to wait on.`
      : `wf start takes one brief, and ${arg} is a second. Quote a brief with spaces — wf start "<brief>" — or give it as a file: wf start ./brief.md.`),
    twice: (flag) => `wf start takes ${flag} once: a run works on one ${flag === '--repo' ? 'repository' : 'workflow'}.`,
  });
  return { workflows: values['--workflows']?.[0], repo: values['--repo']?.[0], isolate: !switches.length, after: values['--after'] ?? [] };
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
      '--no-worktree': 'wf plan does not take --no-worktree: a card another waits on ships a result branch, and a run that works on its base branch has none, so every card after it would wait for ever.',
    },
    unknown: (arg) => (arg.startsWith('-')
      ? `wf plan does not take ${arg}. It takes the plan folder, then --repo <r>.`
      : `wf plan takes one folder, and ${arg} is a second. A plan is every card in one folder: wf plan <folder> --repo <r>.`),
    twice: () => 'wf plan takes --repo once: a plan works on one repository.',
  });
  return { repo: values['--repo']?.[0] };
}

/** `wf retry`'s own flags: after `--message`, one of these alone is an answer left out, not an answer. */
const RETRY_FLAGS: readonly string[] = ['--nudge', '--fresh', '--recheck', '--model', '--message'];

/**
 * `wf retry`'s one choice of how, read off its flags: at most one way, `--model` with a name, and `--message` at most once, with what
 * to tell the step — refused, before a run is read, when it is empty or rides on `--recheck` (`messageRefusal`).
 */
function retryHow(argv: string[]): RetryHow {
  const given: Array<{ mode: RetryMode; model?: string }> = [];
  let message: string | undefined;
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
    } else usage(`wf retry does not take ${arg}. It takes one of --nudge, --fresh, --model <m>, --recheck, and --message "<answer>".`);
  }
  if (given.length > 1) usage('wf retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.');
  const how: RetryHow = { ...(given[0] ?? { mode: 'nudge' }), ...(message !== undefined ? { message } : {}) };
  const wrong = messageRefusal(how);
  if (wrong) usage(wrong);
  return how;
}

/** `e` is the engine the verbs talk to: the board under `WF_ROOT`, unless a test hands it one of its own. */
export async function main(argv: string[], e: ReturnType<typeof engine> = engine()): Promise<void> {
  const [verb, ...rest] = argv;

  switch (verb) {
    case 'start': {
      const arg = rest[0];
      if (!arg || arg.startsWith('--')) return console.log(HELP);
      const how = startHow(rest.slice(1));
      const brief = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8').trim() : arg;
      const repo = path.resolve(how.repo ?? '.');
      const run = start({
        brief,
        repo,
        // A folder from here, or one of the repository's by name: `--workflows dev` is <repo>/workflows/dev.
        workflowDir: workflowFolder(how.workflows ?? './workflows', process.cwd(), repo),
        isolate: how.isolate,
        after: how.after,
      });
      const steps = stepsOf(run);
      console.log(`${run.id}  ${steps.length} step(s): ${steps.map((s) => s.name).join(' → ')}`);
      console.log(`workspace: ${run.workspace}`);
      if (run.after?.length) console.log(`waits on: ${run.after.join(', ')} — nothing is filed until wf decide says each has shipped onto ${run.branch}`);
      console.log(`run 'wf tick' (or 'wf up') to start it`);
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

    case 'tick': {
      const results = await tick(e);
      if (!results.length) return console.log('no runs');
      for (const r of results) {
        const filed = r.filed.length ? `  filed: ${r.filed.join(', ')}` : '';
        const tried = r.tried.length ? `  tried again: ${r.tried.join(', ')}` : '';
        const looped = r.looped.length ? `  round again: ${r.looped.join(', ')}` : '';
        const checked = r.checked.length ? `  checking: ${r.checked.join(', ')}` : '';
        const blocked = r.blocked.length ? `  blocked: ${r.blocked.join(', ')}` : '';
        const waiting = r.waiting.length ? `  ${waitWord(r.waiting)}` : '';
        console.log(`${r.run.id}  ${r.status}${filed}${tried}${looped}${checked}${blocked}${waiting}`);
        for (const note of r.notes) console.log(`   ${note}`);
      }
      return;
    }

    case 'up': {
      const every = Number(rest[0]) || 4_000;
      console.log(`up — every ${every}ms, ^C to stop`);
      for (;;) {
        for (const r of await tick(e)) {
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
      for (const run of runs) {
        const calledOff = run.cancelledAt ? '  (cancelled)' : '';
        console.log(`${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}${calledOff}`);
        const { steps, waitingOnYou, waiting } = await list(e, run);
        // As wide as this run's longest status, so its branches still line up beside it.
        const width = Math.max(20, ...steps.map((s) => s.status.length));
        for (const s of steps) {
          // The try a step is on, or the try due, beside its line: `try 2 asked (--nudge)`, `try 2, by retries: 1`.
          console.log(`   ${s.name.padEnd(14)} ${s.status.padEnd(width)} ${s.branch ?? ''}${s.note ? `  · ${s.note}` : ''}`);
        }
        // The step a person has to act on, and where to act. Said here and not left to the result
        // line, because a run blocked on its first step has no result branch yet.
        if (waitingOnYou.length) console.log(`   → waiting on you: ${waitingOnYou.join(', ')}  —  wf decide ${run.id}`);
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
      const { run, decision, closeouts, checks, retrying, rounding, offers, used, answers, answering, waiting, said } = await decide(e, rest[0]);
      const head = `${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}`;
      const steps = stepsOf(run);

      if (decision.kind === 'cancelled') return console.log(`${head}\n\n  cancelled at ${decision.at} — nothing to decide`);
      // Nothing of it is filed: the runs it waits on are the whole of what there is to say, and nothing else is offered.
      if (waiting.length) return console.log(`${head}\n\n  ${waitWord(waiting)}\n  ${waitAdvice(run, waiting)}`);
      if (decision.kind === 'running') {
        console.log(`${head}\n\n  still running: ${decision.waiting.join(', ')}`);
        // A try the next tick files is why a run that had stopped is running again: said, with whose word it is.
        for (const r of retrying) console.log(`  ${r.step}: ${dueNote(steps.find((s) => s.name === r.step)!, run, r)}`);
        // So is a loop going round again.
        for (const r of rounding) console.log(`  ${r.step}: ${roundDueNote(steps, r)}`);
        return console.log('  nothing to decide yet');
      }
      if (decision.kind === 'shipped') return console.log(`${head}\n\n  shipped — ${decision.branches.join(', ')} is already on ${run.branch}`);

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
      if (decision.outcome === 'succeeded' && !decision.unverified.length) console.log(`  every step verified`);
      // What a person can do about a step short of starting over: try it again, or a loop once more, the way that fits why it stopped.
      if (offers.length) console.log(`\n  once more, on the next tick:\n${offers.map((line) => `    ${line}`).join('\n')}`);

      // What the branch touched, before any step's account of it: which parts of the repository, and
      // whether among them are the files an agent reads as instructions or those that decide what its
      // check means. Then the lesson — CLAUDE.md's "When you miss", held to — and those check files in
      // full, because a check that passed says nothing about a check that was changed to pass.
      const touched = branchesToRead(decision.branches, Object.values(run.steps).map((s) => s.branch))
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
      for (const name of Object.keys(run.steps)) {
        const c = closeouts[name];
        const check = checks[name];
        // A step the run filed consumed something, closeout or not; one never filed has nothing to say.
        if (!c && !check && !run.steps[name]?.taskId) continue;
        const blocked = c && !('error' in c) && c.outcome === 'blocked';
        const step = steps.find((s) => s.name === name);
        // The try — and the round — whose closeout and check these are, when it is not the first, and whether a person answered it.
        const tried = step ? tryNote(step, run.steps[name], steps, Boolean(answers[name])) : '';
        console.log(`\n  ${name}${blocked ? '  BLOCKED' : ''}${tried ? `  (${tried})` : ''}`);
        if (check) {
          console.log(`    check  ${check.command}  →  ${verdictWord(check.verdict)} ${check.passed ? '✓' : '✗'}`);
          // For a check that refused, the last of each stream, labelled: which pipe a line came from
          // is the difference between a runner's progress noise and its summary.
          for (const [stream, text] of [['stdout', check.stdout], ['stderr', check.stderr]] as const) {
            if (!check.passed && text) console.log(`      ${stream}:\n        ${text.split('\n').join('\n        ')}`);
          }
        }
        // What its session consumed, beside the check's word on it — or that nobody measured it.
        for (const line of usedLines(used[name])) console.log(`    ${line}`);
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

      // Worked on the base branch itself: `merge --no-ff main` into main is nothing, and
      // `branch -D main` is not a command to print beside it.
      if (decision.direct) {
        console.log(`\n  worked directly on ${run.branch}; nothing to merge; the base was ${run.baseRef}`);
        console.log(`  read it    git -C ${run.repo} diff ${run.baseRef}...${run.branch}`);
        return;
      }
      const first = decision.branches[0];
      if (first) {
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
      const how = ask.model ? `--model ${ask.model}` : `--${ask.mode}`;
      const then = stopFirst ? 'its harness blocked its session: the next tick stops it, and files the try once it has stopped' : 'the next tick files it, once';
      console.log(`${runId}  asked: try ${ask.try} of ${stepName} (${how})${ask.message !== undefined ? ', with your answer' : ''} — ${then}`);
      console.log(`   ${file}`);
      return;
    }

    // A person's "once more" for a loop whose rounds are spent. Like `wf retry`, it writes the ask and nothing else: the tick honours it once.
    case 'round': {
      const [runId, stepName, ...extra] = rest;
      if (!runId || runId.startsWith('--')) return console.log(HELP);
      if (extra.length || stepName?.startsWith('--')) {
        usage('wf round takes the run and, when the run has more than one loop, the step that closes the one to go round: wf round <runId> [<step>].');
      }
      const { ask, file } = await round(e, runId, stepName);
      console.log(`${runId}  asked: round ${ask.round} of ${ask.step}'s loop — the next tick files it, once`);
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
