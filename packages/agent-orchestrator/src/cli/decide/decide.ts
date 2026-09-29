/**
 * `wf decide`: what a run produced and the choice it leaves a person — its help, its one flag, read off the command line, and the screen it
 * prints.
 */
import {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  parseGlobs,
  approvedFirst,
  artifactFiles,
  artifactLines,
  artifacts,
  artifactsDir,
  branchWord,
  branchesToRead,
  checkoutLine,
  decide,
  diffStat,
  dueNote,
  fromNote,
  holdAdvice,
  holdWord,
  inFullLines,
  inputsDir,
  inputsNote,
  isGitRun,
  lessonLine,
  merges,
  missingArtifacts,
  namesInOrder,
  outputLines,
  owedFields,
  prunedKept,
  prunedWords,
  readArtifact,
  readRun,
  roundDueNote,
  saidLines,
  sendBackTo,
  sensitiveDiff,
  signoffsSpent,
  slotWord,
  stepsOf,
  timelineLines,
  timelineTotalLines,
  touchedBy,
  touchedLines,
  tryNote,
  unjudgedOf,
  usedLines,
  verdictWord,
  waitAdvice,
  waitWord,
} from '../../runner.ts';
import { HELP, usage, type Engine } from '../flags.ts';

export const DECIDE_HELP = `wf decide <runId> [--sensitive <globs>]

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
export function decideHow(argv: string[]): { sensitive?: string[] } {
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
 * `wf decide`: what a run produced and the choice it leaves a person. It refuses a flag before the run, which would otherwise print the help
 * and exit 0. Every screen names the files a person gave the run under its line, as its steps were handed them. A run waiting on others
 * (`--after`), held (`wf hold`), or held by the cap on runs in flight is offered nothing: its screen says what it waits on, and a hold beside
 * a wait says that lifting it does not start the run. A running run's screen says what a step its harness blocked waits for, and the tries
 * and rounds the next tick files, but a try the repository's checkout holds; an ending waiting for that checkout is said there and on the
 * deciding screen. A shipped run whose ending never ran says so, as `wf ls` still shows it at its gate. A pruned run waits on nobody
 * (`prunedRefusal`): how each step ended is said, and not that it waits on you. A run a task journal of which does not read fails with the
 * runtime's words (`unjudgedOf`). Each step's closeout, in the order the steps run (`namesInOrder`), is read off the engine's record, never
 * a branch, so a dropped branch keeps its review. The top-level markdown files a branch added are printed, 120 lines at most. The git
 * commands to ship or drop are printed only where no step merges (`merges`), never for a run that worked on its base branch itself
 * (`--no-worktree`), and a folder run is offered `wf rm` alone.
 */
export async function decideVerb(rest: string[], e: Engine): Promise<void> {
  if (rest.includes('--help')) return console.log(DECIDE_HELP);
  if (!rest[0]) return console.log(HELP);
  if (rest[0].startsWith('--')) usage(`wf decide takes the run first: wf decide <runId> [--sensitive <globs>] — not ${rest[0]} before it.`);
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
