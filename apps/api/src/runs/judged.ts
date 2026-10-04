/**
 * What a run established, over one read of its tasks (`judge`): each step's word and note in `wf ls`'s words, who is waited on and why,
 * where the run stands, whether it still moves, what it has cost, and what a person has to decide about its result.
 */
import {
  answerIn,
  type BranchReader,
  branchReader,
  type BranchStanding,
  branchStandings,
  closeoutOf,
  deniedOf,
  holdAdvice,
  holdWord,
  merges,
  nameFor,
  type ParentRun,
  resultSteps,
  type Retry,
  type RetryAsk,
  runReading,
  sendBackTo,
  type Spend,
  type SpendOf,
  spentWord,
  toDecideWords,
  type Wait,
  waitAdvice,
  waitWord,
  wordOfView,
  bare,
  judgedSteps,
  type Views,
} from 'agent-orchestrator';
import { type Assessment, inFlight, isGitRun, onYouWords, type Run, type ToDecide } from 'agent-orchestrator/run';
import { isRemoteHarness, type Workflow } from 'agent-orchestrator/workflow';
import { type Engine } from '../store.ts';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];
/** What stopped a `failed` run in which no step broke, as `assess` words it (`Assessment['stoppedOn']`). */
export type RunStoppedOn = NonNullable<Assessment['stoppedOn']>;

/**
 * What a person has to decide about a run's result — the fifth reason a run waits on one, beside a step blocked, unsigned, over budget or
 * at a gate — as the package decides it (`toDecide`) and words it (`toDecideWords`):
 *
 *   approve  the run is at its result and the gate on a last step has nobody's approval. `step` is that step, `filed` whether it has run,
 *            and `says` what it would do, the first line of the step's own note (`ownNote`) — null where it has none, and for a gated step
 *            that has signed off, whose closeout is what to read
 *   git      nothing waits at such a gate, every step finished, no step of the workflow merges, and `branches` are ahead of the base
 *            branch: merging or dropping them is a person's, by hand
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
 * attempts that ended with a cost on them, how many did (`measured`), and how many ended with none (`unmeasured`) — a session's cost is
 * known only once it ends, a job's (`claude -p`) with its result and a background session's with its attempt, and one killed first, or on a
 * model its harness could not price, has none. An attempt still running is in neither. `said` is the package's word for it (`spentWord`):
 * `$4.20`, and `≥$4.20` where an ended attempt has no cost on it, so a part never reads as the whole. Null wherever no attempt was
 * measured: a cost nobody measured is not $0.
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
 * What a person's hold on a run says (`wf hold <run> --until <run>`, `Run.hold`), as `wf ls` and `wf decide` say it — never worded here.
 *
 * `at` is when the hold was put, as its file says it. `runs` are the package's `holdsOf`: each run the hold names that has not shipped,
 * and, for one that never will without a person, why — as `RunWaiting.runs` has them — or, in the moment every one has shipped and the next
 * tick has not yet lifted the hold, each of them `shipped`. `word` is what `wf ls` prints under the run (`holdWord`), with the person's why
 * and name when the hold has them, and `advice` the line
 * `wf decide` prints under it (`holdAdvice`). `onYou` is whether the hold lifts only by a person's hand: it names no run, or a run it names
 * never ships on its own — the rule `wf ls` prints the advice by. A hold asks nothing of anyone while it may still lift: every verb a
 * step's word would take is refused while it stands (`heldRefusal`), so no step of a held run waits on you (`waitingOnYou`) and nothing is
 * offered.
 */
export type RunHolding = {
  at: string;
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[]; shipped: boolean }>;
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
 * `needs-human` — which is no question of the step's, as when a session stops on "Could not refresh your login because another Claude
 * Code process is refreshing it". What the session said last is on the run's detail alone (`lastLine`): reading it observes the
 * harness again, and the list is read on every poll of the Factory for one observation.
 *
 * `waitingFor` is what that harness says the session waits for, where it says anything (`TaskView.waitingFor`, off the same
 * views — no observation of its own, unlike `lastLine`). Both halves are the package's words, never worded here: `words` is
 * the wait a card or a node says (`waiting for a permission prompt`), `advice` what a person does about it, naming the
 * session `claude agents` lists it under, or for a step on a remote A2A agent the `wf say` that answers its Task (`answerIn`). Said under
 * the wait, never with it — one sentence between them, and a surface with room for both. Null where the harness said nothing, and for a
 * step nothing blocked — read afresh on every request, so a session that stops waiting stops carrying it.
 *
 * `approve` is what `wf ls` asks of you for a step waiting at its gate, on a run nobody called off and with no send-back asked for:
 * `approve plan` (`onYouWords`). Null for any other step — one not gated, not signed off yet, approved, or sent back.
 *
 * `denied` is what the harness denied the step's current try, off the engine's record of each ended attempt (`deniedOf`, the same views):
 * `calls`, each as a permission rule names it (`Skill(look)`, `Bash(pytest)`), once each in the order first denied, and `words`, the line
 * `wf ls` and `wf decide` say (`deniedWords`: five named, the rest counted). Beside the status, never in it: the status is the word the
 * board's chip compares. Null for a step denied nothing — and for one whose harness cannot say, as a `background: true` session cannot.
 */
export type StepNeeds = {
  needs: string | null;
  blockedByHarness: boolean;
  waitingFor: { words: string; advice: string } | null;
  approve: string | null;
  denied: { words: string; calls: string[] } | null;
};

/**
 * A run waited on that never ships without a person: what `wf ls` prints `→ waiting on you:` for, and `waitAdvice` says is yours to
 * resolve.
 *
 * The package decides it (`neverShips` in its wait/wait.ts) and does not export it. Read here off `Wait`'s own contract — its id and, when
 * it may never ship without a person, why — so any reason it carries counts, not only `missing`, `cancelledAt` and `gone`.
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
 * Whether a held run's hold lifts only by a person's hand: it names no run, or a run it names never ships on its own — no such run, a
 * cancelled one, a result branch gone. As `wf ls` and `wf decide` decide it (cli/main.ts). Not `neverShips` above, which reads any reason a
 * `Wait` carries as one it may never ship for: a hold's `shipped` is the opposite.
 */
const holdNeedsYou = (holds: readonly Wait[]): boolean =>
  !holds.length || holds.some((w) => Boolean(w.missing || w.cancelledAt || w.gone?.length));

/** A person's hold on a run (`RunHolding`), in the package's words; null for a run nobody holds, and one called off. */
export function holdingOf(run: Run, holds: readonly Wait[]): RunHolding | null {
  if (!run.hold || run.cancelledAt) return null;
  return {
    at: run.hold.at,
    runs: holds.map((w) => ({
      run: w.run,
      missing: Boolean(w.missing),
      cancelledAt: w.cancelledAt ?? null,
      gone: w.gone ?? [],
      shipped: Boolean(w.shipped),
    })),
    word: holdWord(holds, run.hold),
    advice: holdAdvice(run, holds),
    onYou: holdNeedsYou(holds),
  };
}

/**
 * The engine's own word for a task — `running (working)`, `needs-human`, `succeeded` — as `wf ls` shows it (`wordOfView`): `unknown`
 * for a task the engine has no record of, which it folds to the state of one filed and waiting for a slot and calls `pending`, in flight;
 * and `succeeded` for a task held open that was closed after it signed, which it calls `between attempts` until its next pass settles it.
 */
export const wordOf =
  (views: Views) =>
  (taskId: string): string =>
    wordOfView(views.get(taskId));

/**
 * What the run established, over one read of its tasks: each step's word and note, who is waited on, where the run stands, and whether it
 * still moves.
 */
type Judged = {
  words: ReadonlyMap<string, string>;
  notes: ReadonlyMap<string, string | null>;
  /** What the reading says beside each step's word: what its harness waits for (`waits`) and what its try was denied (`denied`). */
  beside: ReadonlyMap<string, { waits?: string; denied?: string }>;
  waitingOnYou: string[];
  /** `waitingOnYou` in `wf ls`'s words (`onYouWords`), in the page's order: `approve plan` for a step at its gate. */
  onYou: string[];
  /**
   * What a person has to decide about the result (`toDecide`), as `listing` reads it off the branch standings it was given; null while
   * there is nothing.
   */
  toDecide: RunToDecide | null;
  status: RunStatus;
  /** What stopped a `failed` run in which no step broke, off the same `assess` as `status`: what `wf decide` says. Null otherwise. */
  stoppedOn: RunStoppedOn | null;
  /**
   * The line `cancelPlan` draws for a finished run, which `status` does not: something in flight, or something a tick would still file — a
   * check, a try, a round due once a loop's looping step settled, or roots `assess` makes ready. Roots of a run waiting on runs are filed
   * once those ship (`runReady`), which never happens on its own for one that never ships: the gate is the tick's, and `assess` does not
   * know it. A cancelled run files nothing (`assess` makes nothing ready), and moves until its stop lands. A held run's due is what it
   * files once its hold lifts, for a hold that lifts on its own; a hold that lifts only by a person's hand leaves nothing due. A record the
   * tick cannot read — no frozen workflow, its folder gone — has nothing filed for it, whatever its bare steps would make ready: the tick
   * fails on it.
   */
  moving: boolean;
  /** The runs its roots wait on (`waitingOf`). */
  waiting: RunWaiting | null;
  /** A person's hold on it (`holdingOf`). */
  holding: RunHolding | null;
  /** The tries people asked for that the next tick files, by step: `assess`'s, off their ask files. */
  asked: ReadonlyMap<string, Retry>;
  /** Every ask that carried a message, waiting or consumed (`runStore`): what says a try was answered (`answerOf`). */
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
  run.cancelledAt || status !== 'succeeded' || !run.isolate || merges(steps)
    ? []
    : [
        ...new Set(
          resultSteps(steps)
            .map((s) => run.steps[s.name]?.branch)
            .filter((b): b is string => Boolean(b)),
        ),
      ];

/**
 * Result branches this process has seen on their base branch, as `<run>/<branch>` — a run id has no slash, so the pair is unambiguous —
 * against the work the run had filed when git said so (`workFiled`).
 *
 * A branch merged into the base does not come off it again short of a history rewrite, and it is the answer that says there is nothing left
 * to decide: remembering it can only forget a decision, never invent one, which is the safe direction of the level-triggered rule (the
 * dangerous answer, `ahead`, is asked every time). A read's cache, as the feed's filing times are: a fresh api asks git again. It spares
 * the store's long tail — finished runs whose branches are already on the base — two `git` calls a branch on every poll of the list.
 *
 * The work is what the answer is remembered against, because the other way a branch grows is a person trying a finished run's step again:
 * a run whose branch had nothing on it past its base reads `on` too (`isShipped`'s `unchanged`), and its next try may commit. A try or a
 * round files a task, which the record carries, so the memo is dropped and git is asked afresh. What is left is a person committing to a
 * finished run's branch by hand, which nothing on the board is told of either: `wf decide` reads git every time, and so does a fresh api.
 */
const onTheBase = new Map<string, string>();

/**
 * The work a run has filed, for the memo above: each result step's current task and how many tries are behind it. A try a person asked for,
 * or a round, files a task of its own, so this changes exactly when the work that could grow a result branch has been done again.
 */
const workFiled = (run: Run, steps: readonly Workflow[]): string =>
  resultSteps(steps)
    .map((s) => `${s.name}:${run.steps[s.name]?.taskId ?? ''}:${run.steps[s.name]?.tries?.length ?? 0}`)
    .join(' ');

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
 * The branches left out of the answer are the ones known to be on the base, which say nothing: `toDecide` reads the ones ahead of it. A
 * folder run has no branch, and stands nowhere.
 *
 * `git` is the request's reader (`branchReader`: one listing of a repository's branches for every run of it). `asked`, where given, is told
 * what git was asked of — the branches it did not find on the base, which only their tips can move, a branch on the base staying there as
 * `onTheBase` has it; and whether git answered — which is what the list's memo of runs at rest watches (`resting.ts`).
 */
export function standingsOf(
  run: Run,
  steps: readonly Workflow[],
  status: RunStatus,
  git: BranchReader = branchReader(),
  asked?: Asked,
): BranchStanding[] {
  if (!isGitRun(run)) return [];
  const filed = workFiled(run, steps);
  const branches = toDecideBranches(run, steps, status).filter((branch) => onTheBase.get(`${run.id}/${branch}`) !== filed);
  if (!branches.length) return [];
  try {
    const read = branchStandings(run, branches, git);
    for (const stood of read) if (stood.where === 'on') onTheBase.set(`${run.id}/${stood.branch}`, filed);
    asked?.branches.push(...read.filter((stood) => stood.where !== 'on').map((stood) => stood.branch));
    return read;
  } catch {
    if (asked) asked.failed = true;
    return [];
  }
}

/** What `standingsOf` asked git about for one run: the result branches git did not find on the base, and whether git failed to answer. */
export type Asked = { branches: string[]; failed: boolean };

/**
 * What `judge` reads with: the request's reader (`seenBy`), which answers the run's tasks and those of the runs it waits on off the views
 * already read; the request's branch reader (`branchReader`), one listing of a repository's branches for every run of it, a fresh one
 * left out; where the run's result branches stand once its status is known (`standingsOf`), no branch read left out; and the runs it
 * waits on and is held until as the caller read them (`parentsOf`), read afresh left out.
 */
export type JudgeHow = {
  reader: Engine['Service'];
  git?: BranchReader;
  standings?: (status: RunStatus, steps: readonly Workflow[]) => readonly BranchStanding[];
  parent?: (id: string) => ParentRun;
};

/**
 * What `wf ls` says about each step, what `assess` says about the run, and whether the run still moves: the package's one reading of the
 * run (`runReading`), which `wf ls` answers from too, over the views the request already has.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`, `unsigned`, `succeeded · BLOCKED`,
 * `rounds exhausted`, the engine's bare word while a step runs (`needs-human`, which the board's chip and `needsOf` compare exactly), and
 * `unknown` for a task it has no record of — and so are the notes beside them; what the harness says a session waits for and what it was
 * denied are fields of the reading the board does not show here (`needsOf` says them). A step the page shows and the tick does not judge —
 * one a record names that has no frozen workflow and whose folder lacks it — is worded as a `bare` step, and has no say in the run's
 * status. A refused check's verdict is its exit off the engine's record (`exitVerdicts`), never a read of its logs on a poll.
 *
 * The runs its roots wait on and the runs a person holds it until are each read once, through the request's reader: a root of a run
 * waiting on runs says `waiting on <run>`, and the run moves while each may still ship — the tick files the roots when they do — and not
 * once one never will without a person. A held run moves as it would unheld while the hold may still lift on its own — the tick lifts it
 * once every run it names has shipped, and files then what is due — and not once it lifts only by a person's hand. No slot is said and no
 * checkout read: the board says the run slots over its Factory.
 *
 * Where the run's result branches stand is asked once the run's status is known (`standings`): left out, no branch is read, only a gate
 * says a run is one nobody has decided, and a finished run whose branch nobody merged says there is nothing to decide.
 */
export async function judge(
  run: Run,
  names: readonly string[],
  folder: readonly Workflow[] | null,
  views: Views,
  { reader, git, standings = () => [], parent }: JudgeHow,
): Promise<Judged> {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const read = await runReading(reader, run, { views, steps, shown, standings, ...(git ? { git } : {}), ...(parent ? { parent } : {}) });
  const { status, stoppedOn, ready, check, retry, round } = read.assessed;
  const waiting = waitingOf(run, read.waiting);
  const holding = holdingOf(run, read.holding ?? []);
  const { hold: _, ...unheld } = run;
  const due = holding && !holding.onYou ? read.assessOf(unheld) : { ready, check, retry, round };
  const tickReads = Boolean(run.workflow ?? folder);
  const waitingOnYou = names.filter((name) => read.waitingOnYou.includes(name));
  return {
    words: new Map(read.steps.map((s) => [s.name, s.status])),
    notes: new Map(read.steps.map((s) => [s.name, s.note ?? null])),
    beside: new Map(read.steps.map(({ name, waits, denied }) => [name, { waits, denied }])),
    waitingOnYou,
    onYou: onYouWords({ steps: read.steps, waitingOnYou }),
    toDecide: toDecideOf(run, read.toDecide, steps),
    status,
    stoppedOn: stoppedOn ?? null,
    moving:
      inFlight(run, read.phaseOf).length > 0 ||
      (tickReads && ((due.ready.length > 0 && !waiting?.onYou) || due.check.length > 0 || due.retry.length > 0 || due.round.length > 0)),
    waiting,
    holding,
    asked: new Map(retry.filter((r) => r.by === 'ask').map((r) => [r.step, r])),
    answers: read.answers,
    spendOf: read.spendOf,
    cost: spentOf(read.spend),
  };
}

/**
 * What a person has to know to act on a step (`StepNeeds`), off the views the request already read, with no observation of its own: its
 * current try's closeout, the engine's word for its task, and what the run established of it (`judge`) — for a step at its gate that waits
 * on you, what `wf ls` asks of you, in its words (`onYouWords`). A wait is said only for a step the harness blocked, nothing else having
 * one for a person to answer: the words the reading put beside its status (`waits`), and the name `claude agents` lists that session under
 * (`nameFor`). What its try was denied is the reading's words too (`denied`), with each call off the views (`deniedOf`).
 */
export function needsOf(run: Run, name: string, views: Views, judged: Pick<Judged, 'words' | 'waitingOnYou' | 'beside'>): StepNeeds {
  const view = run.steps[name]?.taskId ? views.get(run.steps[name].taskId) : undefined;
  const said = view ? closeoutOf(views, run, name) : undefined;
  const status = judged.words.get(name)!;
  const atGate = status === 'awaiting approval' && judged.waitingOnYou.includes(name);
  const blockedByHarness = view?.phase === 'needs-human' && said === undefined;
  const { waits, denied } = judged.beside.get(name) ?? {};
  const words = blockedByHarness ? waits : undefined;
  const attempt = view?.state.attempts.at(-1)?.n;
  return {
    needs: said && !('error' in said) && said.outcome === 'blocked' ? said.needs || null : null,
    blockedByHarness,
    waitingFor: words
      ? {
          words,
          advice: answerIn(
            attempt === undefined ? null : nameFor(run.steps[name].taskId!, attempt),
            isRemoteHarness(view?.state.harness) ? { run: run.id, step: name } : undefined,
          ),
        }
      : null,
    approve: atGate ? onYouWords({ steps: [{ name, status, branch: null }], waitingOnYou: [name] })[0] : null,
    denied: denied && view ? { words: denied, calls: deniedOf(views)(run.steps[name].taskId!) } : null,
  };
}
