/**
 * The verbs. Parse, call, print — no logic lives here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_FACING, CHECK_AFFECTING, LESSON, artifactFiles, artifactLines, artifacts, artifactsDir, branchesToRead, cancel, consumption, decide, diffStat, dueNote, engine, inFullLines, lessonLine, list, listRuns, missingArtifacts, outputLines, owedFields, parseGlobs, readArtifact, readRun, resultBranches, retry, round, roundDueNote, sensitiveDiff, start, stepsOf, tick, touchedBy, touchedLines, tryNote, usedLines, verdictWord, type RetryMode } from './runner.ts';

const HELP = `wf — run a workflow of agent steps

  wf start <brief.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree]
  wf tick                      one pass: tick the engine, file what became ready
  wf up [ms]                   the same, on a timer
  wf ls [runId]                runs and their steps
  wf cancel <runId>            stop what it has in flight; file nothing more
  wf decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (wf decide --help)
  wf retry <runId> <step> [--nudge | --fresh | --model <m> | --recheck]
                               try a step waiting on you again, once, on the next tick:
                               --nudge (default) continues its session, told what happened;
                               --fresh a new session on its branch; --model <m> the same, on m;
                               --recheck runs its check again, and files no session
  wf round <runId> [<step>]    once more: a loop out of rounds goes round again, once, on the
                               next tick — the step it loops to continued, then a new reviewer
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

const flag = (argv: string[], name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const usage = (message: string): never => { throw Object.assign(new Error(message), { exitCode: 2 }); };

const DECIDE_HELP = `wf decide <runId> [--sensitive <globs>]

What the run produced, and the choice it leaves you. It prints the commands — ship it, drop it, once
more — and runs none of them. On a run waiting on you, after the run's verdicts and before each step's
closeout:

  touched   what each result branch changed against the run's base: files and lines by workspace
            package or top-level directory, then, each only when true, the agent-facing files and
            the check-affecting ones
  lesson    whether the run changed a file where the next agent reads, or that it wrote nothing there
  in full   the whole diff of the check-affecting files: what a change could edit to make its check pass

and beside each step's check, what its session consumed — used, cost — or that nobody measured it.

  --sensitive <globs>  comma-separated globs whose changed files are printed in full instead, for this
                       screen; the touched lines still say which files are check-affecting

  check-affecting, the default --sensitive:  ${CHECK_AFFECTING.join(', ')}
  agent-facing:                              ${AGENT_FACING.join(', ')}
  where the next agent reads:                ${LESSON.join(', ')}

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

/** `wf retry`'s one choice of how, read off its flags: at most one, and `--model` with a name. */
function retryHow(argv: string[]): { mode: RetryMode; model?: string } {
  const given: Array<{ mode: RetryMode; model?: string }> = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--nudge' || arg === '--fresh' || arg === '--recheck') given.push({ mode: arg.slice(2) as RetryMode });
    else if (arg === '--model') {
      const model = argv[++i];
      if (!model || model.startsWith('--')) usage('--model takes the model to run the new session on: wf retry <runId> <step> --model <m>');
      given.push({ mode: 'fresh', model });
    } else usage(`wf retry does not take ${arg}. It takes one of --nudge, --fresh, --model <m>, --recheck.`);
  }
  if (given.length > 1) usage('wf retry asks for one try, one way: pick one of --nudge, --fresh, --model <m>, --recheck.');
  return given[0] ?? { mode: 'nudge' };
}

/** `e` is the engine the verbs talk to: the board under `WF_ROOT`, unless a test hands it one of its own. */
export async function main(argv: string[], e: ReturnType<typeof engine> = engine()): Promise<void> {
  const [verb, ...rest] = argv;

  switch (verb) {
    case 'start': {
      const arg = rest[0];
      if (!arg || arg.startsWith('--')) return console.log(HELP);
      const brief = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8').trim() : arg;
      const run = start({
        brief,
        repo: path.resolve(flag(rest, 'repo', '.')!),
        workflowDir: path.resolve(flag(rest, 'workflows', './workflows')!),
        isolate: !rest.includes('--no-worktree'),
      });
      const steps = stepsOf(run);
      console.log(`${run.id}  ${steps.length} step(s): ${steps.map((s) => s.name).join(' → ')}`);
      console.log(`workspace: ${run.workspace}`);
      console.log(`run 'wf tick' (or 'wf up') to start it`);
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
        console.log(`${r.run.id}  ${r.status}${filed}${tried}${looped}${checked}${blocked}`);
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
        const { steps, waitingOnYou } = await list(e, run);
        // As wide as this run's longest status, so its branches still line up beside it.
        const width = Math.max(20, ...steps.map((s) => s.status.length));
        for (const s of steps) {
          // The try a step is on, or the try due, beside its line: `try 2 asked (--nudge)`, `try 2, by retries: 1`.
          console.log(`   ${s.name.padEnd(14)} ${s.status.padEnd(width)} ${s.branch ?? ''}${s.note ? `  · ${s.note}` : ''}`);
        }
        // The step a person has to act on, and where to act. Said here and not left to the result
        // line, because a run blocked on its first step has no result branch yet.
        if (waitingOnYou.length) console.log(`   → waiting on you: ${waitingOnYou.join(', ')}  —  wf decide ${run.id}`);
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
      if (!rest[0] || rest[0].startsWith('--')) return console.log(HELP);
      // Read before the run is: a mistyped flag is refused, not a screen quietly printed without it.
      const { sensitive } = decideHow(rest.slice(1));
      const { run, decision, closeouts, checks, retrying, rounding, offers } = await decide(e, rest[0]);
      const head = `${run.id}  ${run.brief.split('\n')[0]!.slice(0, 56)}`;
      const steps = stepsOf(run);

      if (decision.kind === 'cancelled') return console.log(`${head}\n\n  cancelled at ${decision.at} — nothing to decide`);
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
      const used = await consumption(e, run);

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
        // The try — and the round — whose closeout and check these are, when it is not the first.
        const tried = step ? tryNote(step, run.steps[name], steps) : '';
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
        if (!c) continue;
        if ('error' in c) { console.log(`    closeout unreadable — ${c.error}`); continue; }
        if (c.summary) console.log(`    ${c.summary.split('\n').join('\n    ')}`);
        // What it declared — and, for a loop's target past its first round, its replies to the findings.
        for (const line of step ? outputLines(step, c, owedFields(step, run, steps)) : []) console.log(`    ${line}`);
        if (c.needs) console.log(`    needs: ${c.needs}`);
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
      const { ask, file } = await retry(e, runId, stepName, retryHow(rest.slice(2)));
      const how = ask.model ? `--model ${ask.model}` : `--${ask.mode}`;
      console.log(`${runId}  asked: try ${ask.try} of ${stepName} (${how}) — the next tick files it, once`);
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
