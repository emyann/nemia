/**
 * What a run established, over one read of its tasks (`judge`): each step's word and note in `wf ls`'s words, who is waited on and why,
 * where the run stands, whether it still moves, what it has cost, and what a person has to decide about its result.
 */
import { answerIn, type BranchStanding, branchStandings, closeoutAsked, closeoutOf, closeoutReader, exitVerdicts, harnessBlocked, merges, nameFor, parentOf, type ParentRun, phaseOfView, readAnswers, readAsks, resultSteps, type Retry, type RetryAsk, runSpend, saidCount, sendBackTo, type Spend, type SpendOf, spendReader, spentWord, toDecideWords, type Wait, waitAdvice, waitingWords, waitWord } from 'agent-orchestrator';
import { assess, type Assessment, gated, inFlight, isGitRun, listing, onYouWords, type Run, type ToDecide, waitsOf } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { bare, e, judgedSteps, type Views } from './store.ts';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];

/**
 * What a person has to decide about a run's result — the fifth reason a run waits on one, beside a step blocked, unsigned, over budget or at
 * a gate — as the package decides it (`toDecide`) and words it (`toDecideWords`):
 *
 *   approve  the run is at its result and the gate on a last step has nobody's approval. `step` is that step, and `says` what it would do,
 *            the first line of the folder's own prose — null for a gated step that has signed off, whose closeout is what to read
 *   git      nothing waits at such a gate, every step finished, no step of the workflow merges, and `branches` are ahead of the base branch:
 *            merging or dropping them is a person's, by hand
 *
 * `said` is the whole of what `wf ls` prints after `→ to decide:`, and `command` the command at the end of it — `wf approve <run> <step>`,
 * or `wf decide <run>` for the branches, which the board runs no more than `wf ls` does.
 *
 * An approval carries what the Factory's card answers it with, off the record alone: `back`, the steps a send-back goes to (`sendBackTo`) —
 * the step itself once it has a task, and at an ending's gate, held before it is filed, the work it waits on — and `onto`, the base branch
 * the run's result is on its way to. Neither asks git anything, so the list the Factory polls can carry them.
 */
export type RunToDecide = (
  | (Extract<ToDecide, { kind: 'approve' }> & { back: string[]; onto: string | null })
  | Extract<ToDecide, { kind: 'git' }>
) & { said: string; command: string };

/**
 * What a person has to decide, as the board is given it: the package's own reading, with its words and the command that ends them. Null
 * where the package leaves it — a run still going, one called off, one whose ending has run, and a branch already on the base.
 */
function toDecideOf(run: Run, t: ToDecide | undefined, steps: readonly Workflow[]): RunToDecide | null {
  if (!t) return null;
  const said = toDecideWords(run, t);
  if (t.kind === 'git') return { ...t, said, command: `wf decide ${run.id}` };
  const step = steps.find((s) => s.name === t.step);
  return { ...t, back: step ? sendBackTo(step, run) : [t.step], onto: run.branch ?? null, said, command: `wf approve ${run.id} ${t.step}` };
}

/**
 * What sessions cost, as the package adds it up off the engine's `usage.costUsd` (`Spend`: `stepSpend`, `runSpend`): the dollars of the
 * attempts that ended with a cost on them, how many did (`measured`), and how many ended with none (`unmeasured`) — a session's cost is known
 * only once it ends, a job's (`claude -p`) with its result and a background session's with its attempt (agent-runtime's open issue 17), and one killed first, or on a model its harness could not price,
 * has none. An attempt still running is in neither. `said` is the package's word for it (`spentWord`): `$4.20`, and `≥$4.20` where an ended
 * attempt has no cost on it, so a part never reads as the whole. Null wherever no attempt was measured: a cost nobody measured is not $0.
 */
export type Spent = { usd: number; measured: number; unmeasured: number; said: string };

/** A spend as the board is given it (`Spent`), or null when nothing of it was measured. */
export const spentOf = (spend: Spend): Spent | null =>
  spend.measured ? { usd: spend.usd, measured: spend.measured, unmeasured: spend.unmeasured, said: spentWord(spend) } : null;

/**
 * What a run started `--after` still waits on, as `wf ls` and `wf decide` say it — never worded here.
 *
 * `runs` are the package's `waitsOf`: each run in `after` that has not shipped, as its own `wf decide` says it, and, for one that never
 * will without a person, why — the store has no such run (`missing`), it was cancelled, or a result branch it recorded is gone. `word` is
 * what `wf ls` prints on each root (`waitWord`), and `advice` the line `wf decide` prints under it (`waitAdvice`). `onYou` is whether a
 * person has to act — some run of `runs` never ships on its own — which is when `wf ls` prints `→ waiting on you:` before the advice.
 */
export type RunWaiting = {
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[] }>;
  word: string;
  advice: string;
  onYou: boolean;
};

/**
 * What a person has to know to act on a step, in the package's words and the engine's, never worked out here.
 *
 * `needs` is the closeout's, for a step whose current try signed off blocked: its question. Null for any other step.
 *
 * `blockedByHarness` is whether the harness marked the step's session blocked while it gave no closeout — the engine's
 * `needs-human` — which is no question of the step's: measured on "Could not refresh your login because another Claude Code
 * process is refreshing it". What the session said last is on the run's detail alone (`lastLine`): reading it observes the
 * harness again, and the list is read on every poll of the Factory for one observation.
 *
 * `waitingFor` is what that harness says the session waits for, where it says anything (`TaskView.waitingFor`, off the same
 * views — no observation of its own, unlike `lastLine`). Both halves are the package's words, never worded here: `words` is
 * the wait a card or a node says (`waiting for a permission prompt`), `advice` what a person does about it, naming the
 * session `claude agents` lists it under (`answerIn`). Said under the wait, never with it — one sentence between them, and
 * a surface with room for both. Null where the harness said nothing, and for a step nothing blocked — read afresh on every
 * request, so a session that stops waiting stops carrying it.
 *
 * `approve` is what `wf ls` asks of you for a step waiting at its gate, on a run nobody called off and with no send-back asked for: `approve
 * plan` (`onYouWords`). Null for any other step — one not gated, not signed off yet, approved, or sent back.
 */
export type StepNeeds = { needs: string | null; blockedByHarness: boolean; waitingFor: { words: string; advice: string } | null; approve: string | null };

/**
 * The runs a run's roots wait on (`waitsOf`), each read once with the package's `parentOf` — as `wf ls` and `wf decide` read them — and
 * none, without a look, for a run the gate no longer applies to (`gated`): one started without `--after`, called off, or already started.
 */
export async function waitsIn(run: Run, reader: typeof e): Promise<Wait[]> {
  if (!gated(run)) return [];
  const read = new Map<string, ParentRun>();
  for (const id of new Set(run.after)) read.set(id, await parentOf(reader, id));
  return waitsOf(run, (id) => read.get(id) ?? { shipped: false });
}

/**
 * A run waited on that never ships without a person: what `wf ls` prints `→ waiting on you:` for, and `waitAdvice` says is yours to resolve.
 *
 * The package decides it (`neverShips` in run.ts) and does not export it. Read here off `Wait`'s own contract — its id and, when it may
 * never ship without a person, why — so any reason it carries counts, one the package adds after `missing`, `cancelledAt` and `gone`
 * included, rather than a copy of the three it has today. Exporting `neverShips` would make this an import.
 */
const neverShips = (w: Wait): boolean => Object.entries(w).some(([key, why]) => key !== 'run' && why !== undefined);

/** What a run still waits on (`RunWaiting`), in the package's words; null when it waits on no run. */
export function waitingOf(run: Run, waits: readonly Wait[]): RunWaiting | null {
  if (!waits.length) return null;
  return {
    runs: waits.map((w) => ({ run: w.run, missing: Boolean(w.missing), cancelledAt: w.cancelledAt ?? null, gone: w.gone ?? [] })),
    word: waitWord(waits),
    advice: waitAdvice(run, waits),
    onYou: waits.some(neverShips),
  };
}

/**
 * The engine's own word for a task — `running (working)`, `needs-human`, `succeeded` — as `wf ls` shows it: `list`'s,
 * which the package does not export. `unknown` where `phaseOfView` says so, for a task the engine has no record of: the
 * engine folds it to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight.
 */
export const wordOf = (views: Views) => (taskId: string): string => {
  const view = views.get(taskId);
  return view && phaseOfView(view) !== 'unknown' ? view.phase : 'unknown';
};

/** What the run established, over one read of its tasks: each step's word and note, who is waited on, where the run stands, and whether it still moves. */
type Judged = {
  words: ReadonlyMap<string, string>;
  notes: ReadonlyMap<string, string | null>;
  waitingOnYou: string[];
  /** `waitingOnYou` in `wf ls`'s words (`onYouWords`): `approve plan` for a step at its gate. */
  onYou: string[];
  /** What a person has to decide about the result (`toDecide`), as `listing` reads it off the branch standings it was given; null while there is nothing. */
  toDecide: RunToDecide | null;
  status: RunStatus;
  moving: boolean;
  /** The runs its roots wait on (`waitingOf`). */
  waiting: RunWaiting | null;
  /** The tries people asked for that the next tick files, by step: `assess`'s, off their ask files. */
  asked: ReadonlyMap<string, Retry>;
  /** Every ask that carried a message, waiting or consumed (`readAnswers`): what says a try was answered (`answerOf`). */
  answers: readonly RetryAsk[];
  /** What each task's sessions cost, off the views read (`spendReader`): what holds a step to its `budget:`. */
  spendOf: SpendOf;
  /** What the run has cost, every step's tries (`runSpend`); null until a cost was measured. */
  cost: Spent | null;
};

/**
 * The result branches whose standing against the base branch decides anything, for this run: none unless it finished with every step
 * satisfied, it was not called off, it cut worktrees of its own, and no step of its workflow merges (`merges`) — a folder whose ending
 * merges answers for its own branch. Pure, and off the record alone: what `standingsOf` asks git about, and nothing more.
 */
const toDecideBranches = (run: Run, steps: readonly Workflow[], status: RunStatus): string[] =>
  (run.cancelledAt || status !== 'succeeded' || !run.isolate || merges(steps)
    ? []
    : [...new Set(resultSteps(steps).map((s) => run.steps[s.name]?.branch).filter((b): b is string => Boolean(b)))]);

/**
 * Result branches this process has seen on their base branch, as `<run>/<branch>` — a run id has no slash, so the pair is unambiguous —
 * against the work the run had filed when git said so (`workFiled`).
 *
 * A branch merged into the base does not come off it again short of a history rewrite, and it is the answer that says there is nothing left
 * to decide: remembering it can only forget a decision, never invent one, which is the safe direction of the level-triggered rule (the
 * dangerous answer, `ahead`, is asked every time). A read's cache, as the feed's filing times are: a fresh api asks git again.
 *
 * The work is what the answer is remembered against, because the other way a branch grows is a person trying a finished run's step again:
 * a run whose branch had nothing on it past its base reads `on` too (`isShipped`'s `unchanged`), and its next try may commit. A try or a
 * round files a task, which the record carries, so the memo is dropped and git is asked afresh. What is left is a person committing to a
 * finished run's branch by hand, which nothing on the board is told of either: `wf decide` reads git every time, and so does a fresh api.
 *
 * What it is for is the store's long tail. Of the author's 69 runs with a result branch on 2026-09-17, 66 were already on main — two `git`
 * calls each, on every poll of the list — and after the first poll they are three.
 */
const onTheBase = new Map<string, string>();

/**
 * The work a run has filed, for the memo above: each result step's current task and how many tries are behind it. A try a person asked for,
 * or a round, files a task of its own, so this changes exactly when the work that could grow a result branch has been done again.
 */
const workFiled = (run: Run, steps: readonly Workflow[]): string =>
  resultSteps(steps).map((s) => `${s.name}:${run.steps[s.name]?.taskId ?? ''}:${run.steps[s.name]?.tries?.length ?? 0}`).join(' ');

/**
 * Where each of a run's result branches stands against the base branch, as git says it now (`branchStandings`): what says a finished run
 * whose folder has no ending step is one nobody has decided (`toDecide`'s git kind).
 *
 * Asked of the runs where the answer can decide anything and of no other (`toDecideBranches`), because it is a few `git` calls a branch and
 * the list is polled every five seconds: a gate says a run is one to decide without git being asked at all. Level-triggered, as the package
 * is: read on the request that asks, stored nowhere but the memo of branches already on the base (`onTheBase`), so a branch a person merged
 * by hand stops being one to decide with nobody telling the run. A record whose branches cannot be read is no branch: git said nothing, and
 * only a gate says there is something to decide.
 *
 * The branches left out of the answer are the ones known to be on the base, which say nothing: `toDecide` reads the ones ahead of it.
 */
export function standingsOf(run: Run, steps: readonly Workflow[], status: RunStatus): BranchStanding[] {
  // A folder run has no branch to stand anywhere.
  if (!isGitRun(run)) return [];
  const filed = workFiled(run, steps);
  const branches = toDecideBranches(run, steps, status).filter((branch) => onTheBase.get(`${run.id}/${branch}`) !== filed);
  if (!branches.length) return [];
  try {
    const read = branchStandings(run, branches);
    for (const stood of read) if (stood.where === 'on') onTheBase.set(`${run.id}/${stood.branch}`, filed);
    return read;
  } catch {
    return [];
  }
}

/**
 * What `wf ls` says about each step, what `assess` says about the run, and whether the run still moves.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`,
 * `unsigned`, `succeeded · BLOCKED`, `rounds exhausted`, the engine's own word while a step runs, and `unknown` for a task it
 * has no record of — and so are the notes beside them. A step and a check are read as the tick reads them, off the package's
 * own `phaseOfView`, `closeoutAsked` and `exitVerdicts`.
 *
 * Given what people asked for with `wf retry` and `wf round`, read once, as the tick reads them (`readAsks`): without them a
 * step a person asked to try again, or a loop out of rounds a person sent round once more, reads as waiting on them, and the
 * run as not moving, for as long as the tick takes to file what they asked for. A step the page shows and the tick does not judge — one a pre-freeze record has and its folder
 * lost — is worded as a `bare` step, and has no say in the run's status. Everything is read off the views the request already has: calling `list` would
 * read every task again, and word only the steps the tick judges. The api test holds these words to `list`'s.
 *
 * Given the runs its roots wait on, read once (`waitsIn`): a root of a run waiting on runs says `waiting on <run>`, as `list` words it, and
 * the run moves while each may still ship — the tick files the roots when they do — and not once one never will without a person.
 *
 * And given where the run's result branches stand, asked of git for the runs where the answer can decide anything (`standingsOf`), which is
 * why the status is read first: without them only a gate says a run is one nobody has decided, and a finished run whose branch nobody merged
 * would say there is nothing to decide.
 */
export function judge(
  run: Run,
  names: readonly string[],
  folder: readonly Workflow[] | null,
  views: Views,
  waits: readonly Wait[],
  /** Where each result branch stands, asked once the run's status is known (`standingsOf`); left out, no branch is read, and a to-decide branch says nothing. */
  readStandings: (status: RunStatus, steps: readonly Workflow[]) => readonly BranchStanding[] = () => [],
): Judged {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const asked = closeoutAsked(views);
  // Off the engine's record of each check, not the log `wf ls` reads (`readVerdict`): the check prints the code it exits with,
  // so the two agree, and a `logs` call per refused check would observe every harness again, on every poll of the list.
  const verdicts = exitVerdicts(views, run);
  // Unreadable ask files are `notes` the tick prints and does not honour; neither does the board.
  const { asks, rounds } = readAsks(run.id);
  // And what people said with them, as `list` reads it: without it a try a person answered reads as one they did not.
  const answers = readAnswers(run.id);
  // And how many times a person said something to each step's current try (`wf say`), as `list` counts it: the note says so.
  // And what each task's sessions cost, as `list` reads it (`spendReader`), off views that hold every try's task: a step whose tries have
  // cost its cap says `over budget $4.25 of $3`, waits on you, and is filed nothing more — without it, it read as one with no cap.
  const spendOf = spendReader(views);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  // Given the verdict, as the tick is: without it `assess` cannot tell a check that refused, which `retries:` tries
  // again, from one that did not finish, which waits on a person — and the status and `listing`'s words would disagree.
  // And the harness's word, as the tick has it (`harnessBlocked`): a person's try of a step whose session the harness blocked is due, the
  // session stopped first. Without it that try is in `listing`'s note, which reads the engine's word, and neither `asked` nor `moving`.
  // And the cost, as the tick has it: a step over its budget is not tried, nor its loop sent round, on the run's word, so it does not move.
  const { status, ready, check, retry, round } = assess(steps, run, phase, closeoutReader(views, run), asked, verdicts, asks, rounds, harnessBlocked(views), spendOf);
  // The one thing read off git here, and only where it can decide anything: `listing` reads what is left to decide off it, on the same
  // inputs as `assess`, so the words and the judgement are the package's single reading.
  const standings = readStandings(status, steps);
  const said = listing(shown, run, wordOf(views), (name) => closeoutOf(views, run, name), asked, verdicts, asks, rounds, answers, waits, saidCount(views, run), spendOf, undefined, standings);
  const waiting = waitingOf(run, said.waiting);
  // A record the tick cannot read — from before runs froze their workflow, its folder gone — has nothing filed
  // for it, whatever its bare steps would make ready: the tick fails on it.
  const tickReads = Boolean(run.workflow ?? folder);
  const waitingOnYou = names.filter((name) => said.waitingOnYou.includes(name));
  return {
    words: new Map(said.steps.map((s) => [s.name, s.status])),
    notes: new Map(said.steps.map((s) => [s.name, s.note ?? null])),
    waitingOnYou,
    // In the page's order, as `waitingOnYou` is: the words `wf ls` prints after `→ waiting on you:`.
    onYou: onYouWords({ steps: said.steps, waitingOnYou }),
    toDecide: toDecideOf(run, said.toDecide, steps),
    status,
    // The line `cancelPlan` draws for a finished run, which `status` does not: nothing in flight, and nothing a
    // tick would still file. A cancelled run files nothing (`assess` makes nothing ready), and moves until its stop lands.
    // A round due is filed as a try is: a loop's looping step settled, and nothing of it in flight until the tick files the round.
    // Roots `assess` makes ready on a run waiting on runs are filed once those ship (`runReady`), which never happens on its own for a
    // run that never ships: the gate is the tick's, and `assess` does not know it.
    moving: inFlight(run, phase).length > 0 || (tickReads && ((ready.length > 0 && !waiting?.onYou) || check.length > 0 || retry.length > 0 || round.length > 0)),
    waiting,
    asked: new Map(retry.filter((r) => r.by === 'ask').map((r) => [r.step, r])),
    answers,
    spendOf,
    cost: spentOf(runSpend(run, spendOf)),
  };
}

/**
 * What a person has to know to act on a step (`StepNeeds`), off the views the request already read, with no observation of its own: its
 * current try's closeout, the engine's word for its task, and what the run established of it (`judge`) — for a step at its gate that waits
 * on you, what `wf ls` asks of you, in its words (`onYouWords`).
 */
export function needsOf(run: Run, name: string, views: Views, judged: Pick<Judged, 'words' | 'waitingOnYou'>): StepNeeds {
  const view = run.steps[name]?.taskId ? views.get(run.steps[name]!.taskId!) : undefined;
  const said = view ? closeoutOf(views, run, name) : undefined;
  const status = judged.words.get(name)!;
  const atGate = status === 'awaiting approval' && judged.waitingOnYou.includes(name);
  const blockedByHarness = view?.phase === 'needs-human' && said === undefined;
  // The harness's own word for what it waits on, where there is one, and the name `claude agents` lists that session under
  // (`nameFor`, the engine's). Only for a step the harness blocked: nothing else has a wait for a person to answer.
  const word = blockedByHarness ? view?.waitingFor : undefined;
  const attempt = view?.state.attempts.at(-1)?.n;
  return {
    needs: said && !('error' in said) && said.outcome === 'blocked' ? said.needs || null : null,
    blockedByHarness,
    waitingFor: word ? { words: waitingWords(word), advice: answerIn(attempt === undefined ? null : nameFor(run.steps[name]!.taskId!, attempt)) } : null,
    approve: atGate ? onYouWords({ steps: [{ name, status, branch: null }], waitingOnYou: [name] })[0]! : null,
  };
}
