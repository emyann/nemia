/**
 * `nemia decide`: what a run produced and the choice it leaves a person — its help, its one flag, read off the command line, and the screen
 * it prints.
 */
import {
  AGENT_FACING,
  CHECK_AFFECTING,
  endsOnBase,
  LESSON,
  parseGlobs,
  answersOr,
  artifactFiles,
  askedQuestions,
  artifactLines,
  artifactsDir,
  branchWord,
  countsLine,
  checkoutLine,
  decideRun,
  decisionRead,
  dollars,
  runWith,
  type Place,
  dueNote,
  fromNote,
  inFullLines,
  inputsDir,
  inputsNote,
  isRepositoryRun,
  lackLines,
  lackedOf,
  lessonLine,
  missingArtifacts,
  namesInOrder,
  outputLines,
  owedFields,
  ownNote,
  prunedKept,
  questionLines,
  closeoutRefusals,
  prunedWords,
  runsAtOnce,
  roundDueNote,
  saidLines,
  signoffsSpent,
  slotWord,
  timelineLines,
  timelineTotalLines,
  touchedLines,
  tryNote,
  unjudgedOf,
  usedLines,
  verdictWord,
  type Env,
  wfRoot,
} from '../../runner.ts';
import type { BranchChanges, CheckReport, DecisionRead, DecideCommand, Decided, GateBudgets, RepositoryRun } from '../../runner.ts';
import type { RunHolding, RunWaiting } from 'objects';
import { HELP, placedIn, usage, type Engine } from '../flags.ts';

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

A closeout's questions are numbered, 1, 2… across its fields, each option lettered a, b… on its own line,
the recommended one marked; you answer them by those names with --answer, once for each question, on the
nemia retry of a step that signed off blocked or the nemia approve of one at its gate:

  --answer 1=a            question 1, option a
  --answer "2=a,c"        options a and c, where the question takes several
  --answer "3=b: words"   option b, and your own words
  --answer "3: words"     your own words alone

--message beside them is the note under your answers.

Last, the result: where each branch stands against the base branch — on it, ahead by N commits, gone —
and, at an ending's gate or after its landing check refused the merged tree, read live: whether each branch
ahead still merges onto the base (merges), which other runs in flight on the base it collides with and in
which files (others, collides), and a merge clean as text whose landing check refused the base as it is
now (semantic). Then what is left to decide. A workflow whose last step is an ending, gated, says in its own prose
what happens when the work is done; that prose is printed with the nemia approve that runs it and the nemia
retry --message that sends the work back. A workflow with no such step ends by handing you a branch, and
the git commands are printed instead: land it, drop it. Neither is run.

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
 * there and on the deciding screen. A landed run whose ending never ran says so, as `nemia ls` still shows it at its gate. A pruned run
 * waits on nobody (`prunedRefusal`): how each step ended is said, and not that it waits on you. A run a task journal of which does not read
 * fails with the runtime's words (`unjudgedOf`). Each step's closeout, in the order the steps run (`namesInOrder`), is read off the
 * engine's record, never a branch, so a dropped branch keeps its review. The top-level markdown files a branch added are printed, 120 lines
 * at most. The git commands to land or drop are printed only where no step merges (`merges`), never for a run that worked on its base
 * branch itself (`--no-worktree`), and a folder run is offered `nemia rm` alone.
 */
export async function decideVerb(env: Env, rest: string[], e: Engine, place: Place): Promise<void> {
  const home = wfRoot(env);
  if (rest.includes('--help')) return console.log(DECIDE_HELP);
  const [runId] = rest;
  if (!runId) return console.log(HELP);
  if (runId.startsWith('--'))
    usage(`nemia decide takes the run first: nemia decide <runId> [--sensitive <globs>] — not ${runId} before it.`);
  const { sensitive } = decideHow(rest.slice(1));
  const read = await runWith(e, placedIn(env, place, decisionRead(runId, sensitive ? { sensitive } : {}))).catch(async (err: unknown) => {
    const unjudged = await runWith(e, placedIn(env, place, unjudgedOf(e, runsAtOnce(home).runs.read(runId), err, 'nemia decide')));
    throw unjudged ? new Error(unjudged.said) : err;
  });
  const deciding = await standstill(env, home, read, e, place);
  if (!deciding) return;
  const { run, decided, decision, out } = deciding;
  const { steps } = decided;
  console.log(`${headOf(home, run)}\n`);
  printRefusals(home, run, decision);
  printStops(decided, decision, out.heldOut);
  printTouched(read.touched, sensitive);
  for (const name of namesInOrder(run, steps)) printStep(home, decided, name, steps, place);
  printTotals(decided);
  printBranches(read.results);
  printStanding(decided, decision, isRepositoryRun(run) ? run : undefined);
  printCollisions(decided);
  printChoice(decided, steps);
}

/**
 * Prints the whole screen of a run with nothing to decide, by the read model's decision (`decisionRead`) — called off or landed, waiting
 * on others, held, held by the cap on runs in flight, or running, a step of it waiting on you or not — and returns undefined; returns what
 * the deciding screen of a run awaiting a person prints, and prints nothing.
 */
/** A screen printed whole by `print`: nothing left to print after it. */
const shown = (print: () => void): undefined => {
  print();
  return undefined;
};

async function standstill(
  env: Env,
  home: string,
  { run, decision: said, decided }: DecisionRead,
  e: Engine,
  place: Place,
): Promise<{ run: Decided['run']; decided: Decided; decision: Awaiting; out: HeldOut } | undefined> {
  const head = headOf(home, run);
  if ('nothing' in said) return shown(() => console.log(`${head}\n\n  ${said.nothing}`));
  if ('waiting' in said) return shown(() => printWaiting(run, said.waiting, said.holding, head));
  if ('holding' in said && said.holding) {
    const inFlight = await runWith(e, placedIn(env, place, decideRun(run.id)));
    return shown(() => printHold(inFlight, said.holding, head));
  }
  if (decided === undefined)
    throw new Error(`the decision of ${run.id} was read without the run's reading: report it as a defect of nemia decide`);
  const out = heldOutOf(decided.steps, decided.checkout);
  const held = 'running' in said ? said.held : undefined;
  if (held)
    return shown(() =>
      console.log(
        `${head}\n\n  ${slotWord(held)}\n  nothing of ${run.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`,
      ),
    );
  const decision = decided.decision;
  if ('running' in said || decision.kind !== 'awaiting')
    return shown(() => printRunning(decided, decision.kind === 'running' ? decision.waiting : [], head, decided.steps, out));
  return { run, decided, decision, out };
}

/** The decision of a run waiting on a person: the one that has a deciding screen. */
type Awaiting = Extract<Decided['decision'], { kind: 'awaiting' }>;

/** A run's steps, as its workflow was frozen. */
type Steps = Decided['steps'];

/** The step at `workspace: base`, the run's ending, and the line that says it waits for the checkout another run's ending has, or `''`. */
type HeldOut = { ending?: Steps[number]; heldOut: string };

/** A step's closeout as `decide` read it, or why it could not be read. */
type Closeout = NonNullable<Decided['closeouts'][string]>;

/**
 * The first line of every screen: the run's id and its brief's first line, then its inbox card, its inputs and its pruning, each when it
 * has one.
 */
function headOf(home: string, run: Decided['run']): string {
  const given = inputsNote(inputsDir(home, run), run.inputs);
  const from = fromNote(run);
  const pruned = run.pruned ? `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` : '';
  const end = run.brief.indexOf('\n');
  const line = end < 0 ? run.brief : run.brief.slice(0, end);
  return `${run.id}  ${line.slice(0, 56)}${from ? `\n  ${from}` : ''}${given ? `\n  ${given}` : ''}${pruned ? `\n  ${pruned}` : ''}`;
}

/** The run's ending and the indented line that says it waits for the repository's checkout (`checkoutLine`): `''` when nothing holds it. */
function heldOutOf(steps: Steps, checkout: Decided['checkout']): HeldOut {
  const ending = steps.find((s) => endsOnBase(s));
  return { ending, heldOut: checkout && ending ? `  ${checkoutLine(ending.name, checkout)}` : '' };
}

/** The screen of a run waiting on others (`--after`): what it waits for, and a hold beside it, whose lifting does not start the run. */
function printWaiting(run: Decided['run'], waiting: RunWaiting, holding: RunHolding | undefined, head: string): void {
  const alsoHeld = holding
    ? `\n  ${holding.word} as well — ${holding.waitingOnYou ? holding.advice : `nemia hold ${run.id} --off lifts the hold, and not the wait above`}`
    : '';
  console.log(`${head}\n\n  ${waiting.word}\n  ${waiting.advice}${alsoHeld}`);
}

/** The screen of a run a person held (`nemia hold`): the hold, what still runs and what each blocked step waits for, and how to lift it. */
function printHold({ decision, waitingOn }: Decided, holding: RunHolding, head: string): void {
  console.log(`${head}\n\n  ${holding.word}`);
  if (decision.kind === 'running' && decision.waiting.length) console.log(`  still running: ${decision.waiting.join(', ')}`);
  for (const [name, line] of Object.entries(waitingOn)) console.log(`  ${name}: ${line}`);
  console.log(`  ${holding.advice}`);
}

/**
 * The screen of a running run: what runs, what a step its harness blocked waits for, the tries and rounds the next tick files — but a try
 * of the ending the checkout holds — and the ending's wait for that checkout.
 */
function printRunning(d: Decided, waiting: string[], head: string, steps: Steps, { ending, heldOut }: HeldOut): void {
  console.log(`${head}\n\n  still running: ${waiting.join(', ')}`);
  for (const [name, line] of Object.entries(d.waitingOn)) console.log(`  ${name}: ${line}`);
  for (const r of d.retrying.filter((r) => !(heldOut && r.step === ending?.name))) {
    const step = steps.find((s) => s.name === r.step);
    if (step === undefined)
      throw new Error(`a try is due of ${r.step}, which the run has no step of: report it as a defect of nemia decide`);
    console.log(`  ${r.step}: ${dueNote(step, d.run, r)}`);
  }
  for (const r of d.rounding) console.log(`  ${r.step}: ${roundDueNote(steps, r)}`);
  if (heldOut) console.log(heldOut);
  console.log('  nothing to decide yet');
}

/**
 * Under `UNSIGNED`, for a step whose closeout named files the run did not have (`lackedOf`): each file, why, and a near name its files
 * directory holds (`lackLines`), then what answers it. Nothing for a step unsigned for another reason.
 */
function lackedLines(home: string, run: Decided['run'], name: string): string[] {
  const lacked = lackedOf(run.steps[name]);
  if (!lacked.length) return [];
  const there = artifactFiles(home, run, name).map((file) => file.path);
  return [
    `${name}'s closeout named ${lacked.length === 1 ? 'a file' : 'files'} the run does not have:`,
    ...lackLines(lacked, artifactsDir(home, run, name), there).map((line) => `  ${line}`),
    `  it writes each where its brief says, or takes the name off: nemia retry ${run.id} ${name}`,
  ];
}

/** The verdicts on the work: failed and unfinished checks, unsigned steps, unverified ones, and failed ones. */
function printRefusals(home: string, run: Decided['run'], decision: Awaiting): void {
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
      `  UNSIGNED: ${decision.unsigned.map((n) => (signoffsSpent(run.steps[n]) ? `${n} (asked to sign off once by the run, and unsigned again)` : n)).join(', ')}  — ended without the closeout it was asked for, or without a field its output: declares, or its closeout named a file the run does not have; nothing after it ran`,
    );
  for (const line of decision.unsigned.flatMap((name) => lackedLines(home, run, name))) console.log(`    ${line}`);
  if (decision.unverified.length)
    console.log(`  UNVERIFIED: ${decision.unverified.join(', ')}  — no check: declared; only its own word says it worked`);
  if (decision.failed.length) console.log(`  FAILED: ${decision.failed.join(', ')}  (nemia logs ${run.id} <step>)`);
}

/**
 * The steps that stopped the run and wait on a person — but on a pruned run, which waits on nobody — then a run every step of which is
 * verified, the ending's wait for the checkout, and what the next tick does once more.
 */
function printStops({ run, steps, overBudgetLine, offers }: Decided, decision: Awaiting, heldOut: string): void {
  const onYouNote = run.pruned ? '' : ', waiting on you';
  if (decision.awaitingAnswer.length) console.log(`  BLOCKED${onYouNote}: ${decision.awaitingAnswer.join(', ')}`);
  if (decision.exhausted.length)
    console.log(
      `  ROUNDS EXHAUSTED${onYouNote}: ${decision.exhausted.join(', ')}  — asked for another round on the last one rounds: allows; its findings are below`,
    );
  if (overBudgetLine) console.log(`  ${overBudgetLine}`);
  if (decision.budgetExhausted.length)
    console.log(
      `  BUDGET EXHAUSTED${onYouNote}: ${decision.budgetExhausted.join(', ')}  — its harness ended its session at its budget:; nothing after it ran`,
    );
  if (decision.denied.length)
    console.log(
      `  DENIED${onYouNote}: ${decision.denied.join(', ')}  — its harness denied its try a call, and denials: fail passes none on; nothing after it ran, and its check was not run`,
    );
  printAwaitingApproval(run, steps, decision.awaitingApproval, onYouNote);
  if (decision.outcome === 'succeeded' && !decision.unverified.length) console.log(`  every step verified`);
  if (heldOut) console.log(heldOut);
  if (offers.length) console.log(`\n  once more, on the next tick:\n${offers.map((line) => `    ${line}`).join('\n')}`);
}

/**
 * The gated steps waiting for approval: those that signed off at their gate, then a condition never filed whose table answered, then the
 * ending that has not run.
 */
function printAwaitingApproval(run: Decided['run'], steps: Steps, awaitingApproval: string[], onYouNote: string): void {
  const handedOn = awaitingApproval.filter((name) => run.steps[name]?.taskId);
  const condition = (name: string): boolean => steps.some((s) => s.name === name && s.routes !== undefined);
  const routing = awaitingApproval.filter((name) => !run.steps[name]?.taskId && condition(name));
  const unrun = awaitingApproval.filter((name) => !run.steps[name]?.taskId && !condition(name));
  if (handedOn.length)
    console.log(
      `  AWAITING APPROVAL${onYouNote}: ${handedOn.join(', ')}  — signed off at its gate; nothing after it ${run.pruned ? 'was filed, and pruned, it cannot be approved' : 'is filed until you approve it, or send it back'}`,
    );
  if (routing.length)
    console.log(
      `  AWAITING APPROVAL${onYouNote}: ${routing.join(', ')}  — a condition at its gate, its table answered a route (nemia ls ${run.id}); nothing after it ${run.pruned ? 'was filed, and pruned, it cannot be approved' : 'is filed until you approve it, or send back what it routes on'}`,
    );
  if (unrun.length)
    console.log(
      `  AWAITING APPROVAL${onYouNote}: ${unrun.join(', ')}  — this workflow's ending, at its gate: nothing of it has run${run.pruned ? ', and pruned, it cannot be approved' : ', and your approval is what runs it'}`,
    );
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
function printStep(home: string, d: Decided, name: string, steps: Steps, place: Place): void {
  const c = d.closeouts[name];
  const check = d.checks[name];
  if (!c && !check && !d.run.steps[name]?.taskId) return;
  const step = steps.find((s) => s.name === name);
  printStepHead(d, name, step, steps);
  if (check) printCheck(check);
  printTries(d, name);
  if (c) printCloseout(home, d, name, step, steps, c, place);
}

/** A step's name, blocked or not, with its try; then its gate, its acceptance, what its harness waits for and what it was denied. */
function printStepHead(d: Decided, name: string, step: Steps[number] | undefined, steps: Steps): void {
  const { run, closeouts, answers, gates, accepted, waitingOn, denied, budgets } = d;
  const c = closeouts[name];
  const blocked = c && !('error' in c) && c.outcome === 'blocked';
  const tried = step ? tryNote(step, run.steps[name], steps, Boolean(answers[name])) : '';
  console.log(`\n  ${name}${blocked ? '  BLOCKED' : ''}${tried ? `  (${tried})` : ''}`);
  if (gates[name]) console.log(`    gate  ${gates[name].split('\n').join('\n          ')}`);
  for (const line of budgetLines(name, budgets[name], '    ')) console.log(line);
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

/**
 * A closeout's envelope as `nemia decide` prints it: its summary, its body beneath, each value as `name: value`, and what the run refused
 * of it and of its question fields (`closeoutRefusals`), each marked `!! not accepted`.
 */
const envelopeLines = (step: Steps[number] | undefined, c: Exclude<Closeout, { error: string }>, steps: Steps): string[] => [
  ...(c.summary ? [c.summary] : []),
  ...(c.body ? c.body.split('\n').map((l) => `  ${l}`) : []),
  ...(c.values ?? []).map((v) => `${v.name}: ${v.value}`),
  ...closeoutRefusals(step, c, steps).map((r) => `!! not accepted: ${r}`),
];

/**
 * A step's closeout: its envelope (`envelopeLines`), its output's fields — those that ask questions numbered, as `--answer` names them
 * (`questionLines`) — its needs and how to answer them, and its files; or why it does not read.
 */
function printCloseout(
  home: string,
  { run, answering }: Decided,
  name: string,
  step: Steps[number] | undefined,
  steps: Steps,
  c: Closeout,
  place: Place,
): void {
  if ('error' in c) return console.log(`    closeout unreadable — ${c.error}`);
  for (const line of envelopeLines(step, c, steps)) console.log(`    ${line}`);
  const asked = askedQuestions(step, c);
  const fields = step ? owedFields(step, run, steps, c).filter((f) => !asked.some((a) => a.field === f)) : [];
  for (const line of step ? [...outputLines(step, c, fields), ...questionLines(asked)] : []) console.log(`    ${line}`);
  if (c.needs) console.log(`    needs: ${c.needs}`);
  if (answering[name]) console.log(`    ${answering[name]}`);
  const files = artifactLines(
    artifactsDir(home, run, name),
    missingArtifacts(home, place, run, name, c),
    artifactFiles(home, run, name),
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
 * folder run, or the git commands to land or drop.
 */
function printChoice({ run, toDecide, commands, closeouts, budgets }: Decided, steps: Steps): void {
  if (toDecide?.kind === 'approve')
    return printApprove(run.id, toDecide, steps, commands, closeouts[toDecide.step], budgets[toDecide.step]);
  const said = (label: DecideCommand['label']) => commands.find((c) => c.label === label);
  const forget = said('forget it');
  if (forget) return console.log(`\n  done with it   ${forget.command}  — ${forget.said}`);
  const [land, drop] = [said('land it'), said('drop it')];
  if (land && drop) {
    console.log(`\n  land it   ${land.command}`);
    console.log(`  drop it   ${drop.command}`);
  }
}

/**
 * The budgets at a step's gate (`GateBudgets`), as `nemia decide` prints them before its approve line: whose they are, then a line for
 * each step — its amount, `above the workflow's $40.00` where it is above the step's own `budget:`, and why it was proposed — then the
 * run's line. None where the gate has none.
 */
function budgetLines(gated: string, budgets: GateBudgets | undefined, indent: string): string[] {
  if (!budgets) return [];
  const width = Math.max(...budgets.steps.map((b) => b.step.length));
  const whose =
    budgets.from === 'proposed'
      ? `${gated} proposes these caps for the steps after it, which your approval sets:`
      : `the caps your approval of ${gated} set:`;
  return [
    `${indent}budgets  ${whose}`,
    ...budgets.steps.map((b) => {
      const above = b.above && b.workflow !== null ? ` (above the workflow's ${dollars(b.workflow)})` : '';
      return `${indent}  ${b.step.padEnd(width)}  ${b.said}${above}${b.why ? ` — ${b.why}` : ''}`;
    }),
    `${indent}  ${budgets.said}`,
  ];
}

/**
 * The step at its gate: that it signed off, or that it is the ending not yet run, with the first paragraph of its own note (`ownNote`)
 * where it has one; then its approval — with an `--answer` for each question its closeout `said` asks — and the send-backs after it, as the
 * run's commands say them. The approval is the gate's own line, `nemia approve <run> <step>` word for word: a loop out of rounds is
 * labelled `approve` too, its line ending in `--message "<why>"`.
 */
function printApprove(
  runId: string,
  toDecide: Extract<Decided['toDecide'], { kind: 'approve' }>,
  steps: Steps,
  commands: readonly DecideCommand[],
  said: Closeout | undefined,
  budgets: GateBudgets | undefined,
): void {
  const step = steps.find((s) => s.name === toDecide.step);
  if (step === undefined) throw new Error(`the run has no step ${toDecide.step} to approve: report it as a defect of nemia decide`);
  const unrun = ` has not run: this workflow's ending, and your approval is what runs it${toDecide.says === null ? '' : ':'}`;
  console.log(`\n  to decide  ${step.name}${toDecide.filed ? ' has signed off and waits for your word:' : unrun}`);
  const [paragraph] = toDecide.says === null ? [] : ownNote(step).split(/\n[ \t]*\n/);
  for (const line of paragraph?.split('\n') ?? []) console.log(`    ${line}`);
  const at = commands.findIndex((c) => c.label === 'approve' && c.command === `nemia approve ${runId} ${step.name}`);
  const approve = commands[at];
  if (approve === undefined) return;
  if (budgets) console.log();
  for (const line of budgetLines(step.name, budgets, '  ')) console.log(line);
  const budgetHint = budgets?.from === 'proposed' ? ' [--budget <step>=<amount>]...' : '';
  console.log(`\n  approve it    ${approve.command} ${answersOr(step, said, '[--message "<words>"]')}${budgetHint}`);
  for (const back of commands.slice(at + 1)) {
    if (back.label !== 'send back' || back.said !== null) break;
    console.log(`  send it back  ${back.command}`);
  }
}
