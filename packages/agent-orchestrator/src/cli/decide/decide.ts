/**
 * `nemia decide`: what a run produced and the choice it leaves a person — its help, its one flag, read off the command line, and the screen
 * it prints.
 */
import {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  parseGlobs,
  approvedFirst,
  artifactFiles,
  artifactLines,
  artifactsDir,
  branchWord,
  branchesToRead,
  changesOf,
  countsLine,
  checkoutLine,
  decideRun,
  runShipped,
  shippedGitPlace,
  dueNote,
  fromNote,
  holdAdvice,
  holdWord,
  inFullLines,
  inputsDir,
  inputsNote,
  isRepositoryRun,
  lessonLine,
  missingArtifacts,
  namesInOrder,
  outputLines,
  owedFields,
  ownNote,
  prunedKept,
  prunedWords,
  runStore,
  roundDueNote,
  saidLines,
  signoffsSpent,
  slotWord,
  stepsOf,
  timelineLines,
  timelineTotalLines,
  touchedLines,
  tryNote,
  unjudgedOf,
  usedLines,
  verdictWord,
  waitAdvice,
  waitWord,
} from '../../runner.ts';
import type { BranchChanges, CheckReport, DecideCommand, Decided, RepositoryRun } from '../../runner.ts';
import { HELP, usage, type Engine } from '../flags.ts';

export const DECIDE_HELP = `nemia decide <runId> [--sensitive <globs>]

What the run produced, and the choice it leaves you. It reports facts and runs nothing. On a run waiting
on you, after the run's verdicts and before each step's closeout:

  touched   what each result branch changed against the run's base: files and lines by workspace
            package or top-level directory, then, each only when true, the agent-facing files and
            the check-affecting ones
  lesson    whether the run changed a file where the next agent reads, or that it wrote nothing there
  in full   the whole diff of the check-affecting files: what a change could edit to make its check pass

each read from the run's place as the screen is read; what the place could not say is said as not known,
never as no change.

and beside each step's check, what its session consumed — used, cost — or that nobody measured it, then
its timeline: for each try's session and each try's check, when it was filed, spawned and ended (UTC), how
long it queued for a slot and how long it ran; after the steps, each round's and the run's totals. Under
each step, before its closeout, what a person said to its sessions while they ran (nemia say), with when.
Under a gated step's name, its gate: approved, when and with what words — or awaiting approval, with the
nemia approve that lets what follows be filed and the nemia retry --message that sends it back.

Last, the result: where each branch stands against the base branch — on it, ahead by N commits, gone —
and, at an ending's gate or after its landing check refused the merged tree, read live: whether each branch
ahead still merges onto the base (merges), which other runs in flight on the base it collides with and in
which files (others, collides), and a merge clean as text whose landing check refused the base as it is
now (semantic). Then what is left to decide. A workflow whose last step is an ending, gated, says in its own prose
what happens when the work is done; that prose is printed with the nemia approve that runs it and the nemia
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

/** `nemia decide`'s one flag: `--sensitive`, once, with at least one glob. Anything else is refused before a run is read. */
export function decideHow(argv: string[]): { sensitive?: string[] } {
  let sensitive: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== '--sensitive')
      usage(`nemia decide does not take ${arg}. It takes the run and, at most once, --sensitive <globs> (nemia decide --help).`);
    if (sensitive) usage('nemia decide takes --sensitive once: put every glob in it, comma-separated, as in --sensitive "src/**,*.json".');
    const value = argv[++i];
    const globs = value === undefined || value.startsWith('--') ? [] : parseGlobs(value);
    if (!globs.length)
      usage(
        '--sensitive takes the globs whose changed files to print in full, comma-separated: nemia decide <runId> --sensitive "src/**,*.json".',
      );
    sensitive = globs;
  }
  return { sensitive };
}

/**
 * `nemia decide`: what a run produced and the choice it leaves a person. It refuses a flag before the run, which would otherwise print the
 * help and exit 0. Every screen names the files a person gave the run under its line, as its steps were handed them. A run waiting on
 * others (`--after`), held (`nemia hold`), or held by the cap on runs in flight is offered nothing: its screen says what it waits on, and a
 * hold beside a wait says that lifting it does not start the run. A running run's screen says what a step its harness blocked waits for,
 * and the tries and rounds the next tick files, but a try the repository's checkout holds; an ending waiting for that checkout is said
 * there and on the deciding screen. A shipped run whose ending never ran says so, as `nemia ls` still shows it at its gate. A pruned run
 * waits on nobody (`prunedRefusal`): how each step ended is said, and not that it waits on you. A run a task journal of which does not read
 * fails with the runtime's words (`unjudgedOf`). Each step's closeout, in the order the steps run (`namesInOrder`), is read off the
 * engine's record, never a branch, so a dropped branch keeps its review. The top-level markdown files a branch added are printed, 120 lines
 * at most. The git commands to ship or drop are printed only where no step merges (`merges`), never for a run that worked on its base
 * branch itself (`--no-worktree`), and a folder run is offered `nemia rm` alone.
 */
export async function decideVerb(rest: string[], e: Engine): Promise<void> {
  if (rest.includes('--help')) return console.log(DECIDE_HELP);
  if (!rest[0]) return console.log(HELP);
  if (rest[0].startsWith('--'))
    usage(`nemia decide takes the run first: nemia decide <runId> [--sensitive <globs>] — not ${rest[0]} before it.`);
  const { sensitive } = decideHow(rest.slice(1));
  const decided = await runShipped(e, decideRun(rest[0])).catch(async (err: unknown) => {
    const unjudged = await runShipped(e, unjudgedOf(e, runStore.runs.read(rest[0]), err, 'nemia decide'));
    throw unjudged ? new Error(unjudged.said) : err;
  });
  const { run } = decided;
  const steps = stepsOf(run);
  const head = headOf(run);
  const out = heldOutOf(steps, decided.checkout);
  const decision = standstill(decided, head, steps, out);
  if (!decision) return;

  console.log(`${head}\n`);
  printRefusals(run, decision);
  printStops(decided, decision, out.heldOut);
  const git = isRepositoryRun(run) ? run : undefined;
  const changes = git ? changesRead(git, decision.branches, steps, sensitive) : undefined;
  if (changes) printTouched(changes.toRead, sensitive);
  for (const name of namesInOrder(run, steps)) printStep(decided, name, steps);
  printTotals(decided);
  if (changes) printBranches(changes.results);
  printStanding(decided, decision, git);
  printCollisions(decided);
  printChoice(decided, steps);
}

/** The decision of a run waiting on a person: the one that has a deciding screen. */
type Awaiting = Extract<Decided['decision'], { kind: 'awaiting' }>;

/** A run's steps, as its workflow was frozen. */
type Steps = ReturnType<typeof stepsOf>;

/** The step at `workspace: main`, the run's ending, and the line that says it waits for the checkout another run's ending has, or `''`. */
type HeldOut = { ending?: Steps[number]; heldOut: string };

/** A step's closeout as `decide` read it, or why it could not be read. */
type Closeout = NonNullable<Decided['closeouts'][string]>;

/**
 * The first line of every screen: the run's id and its brief's first line, then its inbox card, its inputs and its pruning, each when it
 * has one.
 */
function headOf(run: Decided['run']): string {
  const given = inputsNote(inputsDir(run), run.inputs);
  const from = fromNote(run);
  const pruned = run.pruned ? `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` : '';
  return `${run.id}  ${run.brief.split('\n')[0].slice(0, 56)}${from ? `\n  ${from}` : ''}${given ? `\n  ${given}` : ''}${pruned ? `\n  ${pruned}` : ''}`;
}

/** The run's ending and the indented line that says it waits for the repository's checkout (`checkoutLine`): `''` when nothing holds it. */
function heldOutOf(steps: Steps, checkout: Decided['checkout']): HeldOut {
  const ending = steps.find((s) => s.workspace === 'main');
  return { ending, heldOut: checkout && ending ? `  ${checkoutLine(ending.name, checkout)}` : '' };
}

/**
 * Prints the whole screen of a run with nothing to decide — cancelled, waiting on others, held, held by the cap on runs in flight, running
 * or shipped — and returns undefined; returns the decision of a run awaiting a person, and prints nothing.
 */
function standstill(d: Decided, head: string, steps: Steps, out: HeldOut): Awaiting | undefined {
  const { run, decision } = d;
  if (decision.kind === 'cancelled') console.log(`${head}\n\n  cancelled at ${decision.at} — nothing to decide`);
  else if (d.waiting.length) printWaiting(d, head);
  else if (run.hold) printHold(d, head);
  else if (d.held)
    console.log(
      `${head}\n\n  ${slotWord(d.held)}\n  nothing of ${run.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`,
    );
  else if (decision.kind === 'running') printRunning(d, decision.waiting, head, steps, out);
  else if (decision.kind === 'shipped') printShipped(run, decision.branches, head, steps);
  else return decision;
  return undefined;
}

/** The screen of a run waiting on others (`--after`): what it waits for, and a hold beside it, whose lifting does not start the run. */
function printWaiting({ run, waiting, holding }: Decided, head: string): void {
  const never = run.hold && (!holding.length || holding.some((w) => w.missing || w.cancelledAt || w.gone?.length));
  const alsoHeld = run.hold
    ? `\n  ${holdWord(holding, run.hold)} as well — ${never ? holdAdvice(run, holding) : `nemia hold ${run.id} --off lifts the hold, and not the wait above`}`
    : '';
  console.log(`${head}\n\n  ${waitWord(waiting)}\n  ${waitAdvice(run, waiting)}${alsoHeld}`);
}

/** The screen of a run a person held (`nemia hold`): the hold, what still runs and what each blocked step waits for, and how to lift it. */
function printHold({ run, decision, holding, waitingOn }: Decided, head: string): void {
  console.log(`${head}\n\n  ${holdWord(holding, run.hold)}`);
  if (decision.kind === 'running' && decision.waiting.length) console.log(`  still running: ${decision.waiting.join(', ')}`);
  for (const [name, line] of Object.entries(waitingOn)) console.log(`  ${name}: ${line}`);
  console.log(`  ${holdAdvice(run, holding)}`);
}

/**
 * The screen of a running run: what runs, what a step its harness blocked waits for, the tries and rounds the next tick files — but a try
 * of the ending the checkout holds — and the ending's wait for that checkout.
 */
function printRunning(d: Decided, waiting: string[], head: string, steps: Steps, { ending, heldOut }: HeldOut): void {
  console.log(`${head}\n\n  still running: ${waiting.join(', ')}`);
  for (const [name, line] of Object.entries(d.waitingOn)) console.log(`  ${name}: ${line}`);
  for (const r of d.retrying.filter((r) => !(heldOut && r.step === ending?.name)))
    console.log(
      `  ${r.step}: ${dueNote(
        steps.find((s) => s.name === r.step)!,
        d.run,
        r,
      )}`,
    );
  for (const r of d.rounding) console.log(`  ${r.step}: ${roundDueNote(steps, r)}`);
  if (heldOut) console.log(heldOut);
  console.log('  nothing to decide yet');
}

/** The screen of a shipped run: its branches on the base branch, and an ending approved first that never ran. */
function printShipped(run: Decided['run'], branches: string[], head: string, steps: Steps): void {
  const unrun = steps.find((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId);
  const never = unrun
    ? `\n  ${unrun.name} never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel ${run.id}`
    : '';
  console.log(`${head}\n\n  shipped — ${branches.join(', ')} is already on ${run.branch}${never}`);
}

/** The verdicts on the work: failed and unfinished checks, unsigned steps, unverified ones, and failed ones. */
function printRefusals(run: Decided['run'], decision: Awaiting): void {
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
  if (decision.failed.length) console.log(`  FAILED: ${decision.failed.join(', ')}  (nemia logs ${run.id} <step>)`);
}

/**
 * The steps that stopped the run and wait on a person — but on a pruned run, which waits on nobody — then a run every step of which is
 * verified, the ending's wait for the checkout, and what the next tick does once more.
 */
function printStops({ run, overBudgetLine, offers }: Decided, decision: Awaiting, heldOut: string): void {
  const onYou = run.pruned ? '' : ', waiting on you';
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
  printAwaitingApproval(run, decision.awaitingApproval, onYou);
  if (decision.outcome === 'succeeded' && !decision.unverified.length) console.log(`  every step verified`);
  if (heldOut) console.log(heldOut);
  if (offers.length) console.log(`\n  once more, on the next tick:\n${offers.map((line) => `    ${line}`).join('\n')}`);
}

/** The gated steps waiting for approval: those that signed off at their gate, then the ending that has not run. */
function printAwaitingApproval(run: Decided['run'], awaitingApproval: string[], onYou: string): void {
  const handedOn = awaitingApproval.filter((name) => run.steps[name]?.taskId);
  const unrun = awaitingApproval.filter((name) => !run.steps[name]?.taskId);
  if (handedOn.length)
    console.log(
      `  AWAITING APPROVAL${onYou}: ${handedOn.join(', ')}  — signed off at its gate; nothing after it ${run.pruned ? 'was filed, and pruned, it cannot be approved' : 'is filed until you approve it, or send it back'}`,
    );
  if (unrun.length)
    console.log(
      `  AWAITING APPROVAL${onYou}: ${unrun.join(', ')}  — this workflow's ending, at its gate: nothing of it has run${run.pruned ? ', and pruned, it cannot be approved' : ', and your approval is what runs it'}`,
    );
}

/**
 * What the screen's branches changed, read once from the run's place (`changesOf`), with the diffs of the files `sensitive` names — the
 * check-affecting ones by default: the branches to read (`branchesToRead`) and the result branches.
 */
function changesRead(
  git: RepositoryRun,
  branches: string[],
  steps: Steps,
  sensitive: string[] | undefined,
): { toRead: BranchChanges[]; results: BranchChanges[] } {
  const toRead = branchesToRead(
    branches,
    namesInOrder(git, steps).map((name) => git.steps[name].branch),
    git.isolate ? git.branch : undefined,
  );
  const read = changesOf(shippedGitPlace, git, [...toRead, ...branches], sensitive ?? CHECK_AFFECTING);
  const of = (branch: string) => read.find((c) => c.branch === branch)!;
  return { toRead: toRead.map(of), results: branches.map(of) };
}

/**
 * What each branch to read touched, the lesson line, and each branch's files `sensitive` names — the check-affecting ones by default — in
 * full.
 */
function printTouched(touched: BranchChanges[], sensitive: string[] | undefined): void {
  if (!touched.length) return;
  console.log();
  for (const line of touchedLines(touched)) console.log(`  ${line}`);
  console.log(`  ${lessonLine(touched)}`);
  for (const t of touched) {
    console.log();
    for (const line of inFullLines(t, sensitive, t.inFull, touched.length > 1)) console.log(`  ${line}`);
  }
}

/** A step's block, for a step with a closeout, a check or a task: its head, its check, its tries and its closeout. */
function printStep(d: Decided, name: string, steps: Steps): void {
  const c = d.closeouts[name];
  const check = d.checks[name];
  if (!c && !check && !d.run.steps[name]?.taskId) return;
  const step = steps.find((s) => s.name === name);
  printStepHead(d, name, step, steps);
  if (check) printCheck(check);
  printTries(d, name);
  if (c) printCloseout(d, name, step, steps, c);
}

/** A step's name, blocked or not, with its try; then its gate, its acceptance, what its harness waits for and what it was denied. */
function printStepHead(d: Decided, name: string, step: Steps[number] | undefined, steps: Steps): void {
  const { run, closeouts, answers, gates, accepted, waitingOn, denied } = d;
  const c = closeouts[name];
  const blocked = c && !('error' in c) && c.outcome === 'blocked';
  const tried = step ? tryNote(step, run.steps[name], steps, Boolean(answers[name])) : '';
  console.log(`\n  ${name}${blocked ? '  BLOCKED' : ''}${tried ? `  (${tried})` : ''}`);
  if (gates[name]) console.log(`    gate  ${gates[name].split('\n').join('\n          ')}`);
  if (accepted[name]) console.log(`    accepted  ${accepted[name].split('\n').join('\n              ')}`);
  if (waitingOn[name]) console.log(`    harness  ${waitingOn[name]}`);
  if (denied[name]) console.log(`    ${denied[name]}`);
}

/** A step's check: its command and verdict, and, when it refused, its stdout and stderr. */
function printCheck(check: CheckReport): void {
  console.log(`    check  ${check.command}  →  ${verdictWord(check.verdict)} ${check.passed ? '✓' : '✗'}`);
  for (const [stream, text] of [
    ['stdout', check.stdout],
    ['stderr', check.stderr],
  ] as const) {
    if (!check.passed && text) console.log(`      ${stream}:\n        ${text.split('\n').join('\n        ')}`);
  }
}

/** What a step's sessions used and cost, its timeline, what it needed and the answer it was given, and what a person said to it. */
function printTries({ used, costs, timeline, answers, said }: Decided, name: string): void {
  const [usedLine, costOfTry] = usedLines(used[name]);
  console.log(`    ${usedLine}`);
  console.log(`    ${costs[name] ?? costOfTry}`);
  for (const line of timelineLines(timeline.steps[name] ?? [])) console.log(`    ${line}`);
  const answer = answers[name];
  if (answer?.needs) console.log(`    try ${answer.try - 1} needs: ${answer.needs.split('\n').join('\n    ')}`);
  if (answer) console.log(`    your answer: ${answer.message.split('\n').join('\n    ')}`);
  for (const line of saidLines(said[name] ?? []).flatMap((l) => l.split('\n'))) console.log(`    ${line}`);
}

/** A step's closeout: its summary, its output's fields, its needs and how to answer them, and its files — or why it does not read. */
function printCloseout({ run, answering }: Decided, name: string, step: Steps[number] | undefined, steps: Steps, c: Closeout): void {
  if ('error' in c) return console.log(`    closeout unreadable — ${c.error}`);
  if (c.summary) console.log(`    ${c.summary.split('\n').join('\n    ')}`);
  for (const line of step ? outputLines(step, c, owedFields(step, run, steps)) : []) console.log(`    ${line}`);
  if (c.needs) console.log(`    needs: ${c.needs}`);
  if (answering[name]) console.log(`    ${answering[name]}`);
  const files = artifactLines(
    artifactsDir(run, name),
    missingArtifacts(shippedGitPlace, run, name, c),
    artifactFiles(run, name),
    run.pruned,
  );
  for (const line of files) console.log(`    ${line}`);
}

/** The run's cost and timeline totals, after a blank line. */
function printTotals({ runCost, timeline }: Decided): void {
  console.log();
  const totals = [...runCost, ...timelineTotalLines(timeline)];
  if (totals.length) {
    for (const line of totals) console.log(`  ${line}`);
    console.log();
  }
}

/**
 * Each result branch's counts against the base (`countsLine`), none for a branch that changed no file, or that they are not known; and the
 * top-level markdown files it added.
 */
function printBranches(results: BranchChanges[]): void {
  for (const c of results) {
    const counts = 'error' in c.radius ? c.radius.error : countsLine(c.radius);
    console.log(`  ${c.branch}${counts ? `  — ${counts}` : ''}`);
    if ('error' in c.notes) {
      if (!('error' in c.radius)) console.log(`  notes  ${c.notes.error}`);
    } else printNotes(c.branch, c.notes);
  }
}

/** The top-level markdown files `branch` added, each under a rule, 120 lines at most, then how to read the rest. */
function printNotes(branch: string, notes: readonly { file: string; text: string }[]): void {
  for (const { file, text } of notes) {
    const lines = text.trimEnd().split('\n');
    console.log(`\n  ── ${file} ${'─'.repeat(Math.max(0, 64 - file.length))}`);
    for (const l of lines.slice(0, 120)) console.log(`  ${l}`);
    if (lines.length > 120) console.log(`  … ${lines.length - 120} more lines — git show ${branch}:${file}`);
  }
}

/** Where the work is: a folder run's folders, a run that worked on its base branch itself, or where each branch stands against the base. */
function printStanding({ run, standings }: Decided, decision: Awaiting, git: RepositoryRun | undefined): void {
  if (!git) {
    console.log(`\n  worked in folders, with no git repository: ${run.workspace}, a folder per step; nothing to merge`);
  } else if (decision.direct) {
    console.log(`\n  worked directly on ${git.branch}; nothing to merge; the base was ${git.baseRef}`);
    console.log(`  read it    git -C ${git.repo} diff ${git.baseRef}...${git.branch}`);
  } else if (standings.length) {
    console.log();
    for (const s of standings) console.log(`  branch    ${branchWord(run, s)}`);
  }
}

/** At an ending's decision, what its branches merge onto and collide with (`Decided.collisions`): a line for each fact, none without. */
function printCollisions({ collisions }: Decided): void {
  if (!collisions) return;
  for (const b of collisions.base) console.log(`  merges    ${b.branch} ${b.said}`);
  console.log(`  others    ${collisions.said}`);
  for (const c of collisions.colliding) console.log(`  collides  ${c.ours} ${c.said}`);
  if (collisions.semantic) console.log(`  semantic  ${collisions.semantic.said}`);
}

/**
 * What is left to decide, as the run's commands say it (`Decided.commands`): the gated step to approve or send back, `nemia rm` for a
 * folder run, or the git commands to ship or drop.
 */
function printChoice({ toDecide, commands }: Decided, steps: Steps): void {
  if (toDecide?.kind === 'approve') return printApprove(toDecide, steps, commands);
  const said = (label: DecideCommand['label']) => commands.find((c) => c.label === label);
  const forget = said('forget it');
  if (forget) return console.log(`\n  done with it   ${forget.command}  — ${forget.said}`);
  const [ship, drop] = [said('ship it'), said('drop it')];
  if (ship && drop) {
    console.log(`\n  ship it   ${ship.command}`);
    console.log(`  drop it   ${drop.command}`);
  }
}

/**
 * The step at its gate: that it signed off, or that it is the ending not yet run, with the first paragraph of its own note (`ownNote`)
 * where it has one; then its approval and the send-backs after it, as the run's commands say them.
 */
function printApprove(toDecide: Extract<Decided['toDecide'], { kind: 'approve' }>, steps: Steps, commands: readonly DecideCommand[]): void {
  const step = steps.find((s) => s.name === toDecide.step)!;
  const unrun = ` has not run: this workflow's ending, and your approval is what runs it${toDecide.says === null ? '' : ':'}`;
  console.log(`\n  to decide  ${step.name}${toDecide.filed ? ' has signed off and waits for your word:' : unrun}`);
  const [paragraph] = toDecide.says === null ? [] : ownNote(step).split(/\n[ \t]*\n/);
  for (const line of paragraph?.split('\n') ?? []) console.log(`    ${line}`);
  const at = commands.findIndex((c) => c.label === 'approve' && c.command.endsWith(` ${step.name}`));
  if (at < 0) return;
  console.log(`\n  approve it    ${commands[at].command} [--message "<words>"]`);
  for (const back of commands.slice(at + 1)) {
    if (back.label !== 'send back' || back.said !== null) break;
    console.log(`  send it back  ${back.command}`);
  }
}
