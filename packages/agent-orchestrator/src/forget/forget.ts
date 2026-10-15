/**
 * `nemia rm`, from the run's side: whether a run may be forgotten (`idRefusal`, `forgetRefusal`), what becomes of its worktrees, branches
 * and check logs (`runWorktrees`, `heldWorktree`, `branchFates`, `checkLogsOf`), and the line that says what was done (`forgetLine`). Pure:
 * what the run's place reads of its repository is handed in.
 */
import type { Workflow } from '../step/step.ts';
import { andList, type CloseoutAsked, type Run, type TaskPhase } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import type { Verdict } from '../check/check.ts';
import { modeWord, spentAsks, type Retry, type RetryAsk } from '../retry/index.ts';
import {
  approvedFirst,
  landsOnCheck,
  ownStatus,
  resultOnBase,
  standing,
  type BranchStanding,
  type Round,
  type RoundAsk,
  type SpendOf,
} from '../status/status.ts';
import { landingOpen, type MergeState } from '../ending/ending.ts';
import { gated, holdWord } from '../wait/wait.ts';
import { assess, type Assessment } from '../tick/assess.ts';
import { spentRoundAsks } from '../round/round.ts';
import { inside } from '../workspace/workspace.ts';
import path from 'node:path';
import type { Held } from '../place/place.ts';
import { engineWords, type EngineForgetting } from '../forgetting/forgetting.ts';

/**
 * How `nemia rm` treats a run's branches. Kept by default, since a branch is where the work is: `deleteBranches` deletes each one merged
 * into the run's base branch, and `forceUnmerged`, beside it, each one that is not — and the work on it.
 */
export type ForgetHow = { deleteBranches?: boolean; forceUnmerged?: boolean };

/**
 * Why `nemia rm` — or `nemia prune`, `nemia hold`, or a `read` of a run's record by `command`, the `verb` — will not take this as a run's
 * id — or null. Pure, and asked before
 * anything is read. A run's id names files under `WF_ROOT` with a suffix added — `runs/<id>.json`, `.cancelled`, `.pruned`, `.hold`,
 * `.asks` — and directories — `runs/<id>/`, `worktrees/<id>/` — so only what `runId` mints is taken: lowercase letters, digits and dashes,
 * starting with a letter or a digit. With a dot, `r-xyz.json` — what `ls runs/` gives — names `runs/r-xyz.json` as a run's directory, which
 * is another run's record, and a run with no record of its own is swept of it with nothing asked. `..` or a path would name a directory
 * that is not the run's. One that is an id with a file's suffix on it is told the id.
 */
export function idRefusal(id: string, verb: 'rm' | 'prune' | 'hold' | 'read' = 'rm', command = `nemia ${verb}`): string | null {
  if (/^[a-z0-9][a-z0-9-]*$/.test(id)) return null;
  const file = /^([a-z0-9][a-z0-9-]*)(\.json|\.cancelled|\.pruned|\.hold|\.asks)$/.exec(id);
  if (file)
    return `${JSON.stringify(id)} is not a run's id: ${file[2]} is on the name of one of its files under runs/, not on the run's. Give the id nemia ls prints: ${command} ${file[1]}.`;
  const does =
    verb === 'hold'
      ? 'nemia hold writes its file under WF_ROOT by id'
      : verb === 'read'
        ? `${command} reads a run's record under WF_ROOT by id`
        : `nemia ${verb} removes what is under WF_ROOT by id`;
  return `${JSON.stringify(id)} is not a run's id, and ${does} — lowercase letters, digits and dashes: give the id nemia ls prints, as in ${command} add-a-flag-x1y2.`;
}

/**
 * An ask as `nemia rm` names it: a try (`retry`), a round (`round`) or a merge (`merge`, of the loop's target and its try), of which step,
 * and its number — what `askAt` finds its file by.
 */
export type AskName = { kind: 'retry' | 'round' | 'merge'; step: string; n: number };

/**
 * Why `nemia rm` will not forget this run, in words that say what to do instead — or null, when it may. Pure: handed the run with every
 * task a pass filed and never wrote down adopted onto it — a check, a try, a round, and a step, on a cancelled run too, since a pass that
 * read it before the cancel may be filing one — the asks in its directory, and the store's other runs.
 * Every reason is named at once, so a person clears them in one go.
 *
 * Refused:
 * - **a task in flight** — a step or its check, filed and settled neither way (`inFlight`), on a cancelled run too, whose tasks a tick is
 *   still stopping. Cancelling and forgetting are two decisions, and this never takes the first: a task the engine no longer knows is not
 *   in flight, so a run whose board was cleared is forgotten.
 * - **anything a pass would file** (`assess`): a step ready, a check, a try or a round due, on a run nobody called off. A pass may be
 *   filing it at this moment, into a worktree about to be removed. A run that waits on runs (`gated`) files its roots once they ship, and
 *   is held the same way.
 * - **an ask no pass has spent** (`spentAsks`, `spentRoundAsks`), on a run nobody called off: forgetting would drop a person's word
 *   unheard. One a pass files is the case above; one no pass files as the step stands is taken back by deleting its file (`askAt`).
 * - **a step waiting at its gate** (`awaiting approval`), on a run nobody called off: something is due to be asked for, and an approval
 *   files what waits on it — or, at an ending step's gate, the step itself, which has not run. Approve it, or call the run off first.
 * - **a run another run waits on, and has not started on** (`gated`): forgotten, it would read `waiting on <id> (no such run)` for ever.
 *   And a run another is held until (`Run.hold`), whose hold would wait on no such run the same way.
 * - **an ending that lands on its check whose merge is not landed** (`landingOpen`), with nothing of it running, cancelled or not: a pass
 *   checks it and commits or aborts it, and with the record gone none would, and the merge would stay staged in the checkout.
 *
 * An ending that has not run whose result git already has (`resultOnBase`) is not named at its gate: its approval is refused
 * (`approvalRefusal`). A held run is read as it will stand once its hold lifts: what a pass files then, and the gates a person answers
 * then, hold it too. A cancelled run never ships, so for a run held until it does, the fix named is lifting that hold.
 *
 * A cancelled run whose tasks have settled is forgettable: it files nothing, and its asks are never honoured. `steps` is undefined for a
 * record that froze no workflow and whose folder does not read (`stepsOf`): nothing ready can be judged, and nothing needs to be, since
 * no pass can file anything of it — every pass reads that folder, and dies on it. Its tasks in flight, its asks and the runs that wait on
 * it are judged as any run's.
 *
 * @param others Every other run in the store: whether one waits on this run, and has not started, or is held until it ships.
 * @param askAt Where an ask's file is, for the command that takes it back.
 * @param standings Where each result branch stands against the base branch, as git says it now (`branchStandings` in branches.store.ts): an
 *   ending whose result git already has holds nothing (`resultOnBase`). Left out, git is not asked, and every gate holds.
 * @param verb The verb the fixes name: `nemia prune` is held by every reason `nemia rm` is (`pruneRefusal`), and its fixes end in `nemia
 * prune`.
 * @param merging Whose merge is in progress in the repository's checkout, as the run's place reads it (`merging` in prune.verb.ts), for an
 *   ending that lands on its check: one staged and not landed holds the run (`landingOpen`). Left out, the place is not asked, and only
 *   what the record and the engine say holds it.
 * @param command The command its fixes name, when it is more than `nemia <verb> <id>`: a prune's, with the flags it was given
 * (`pruneAgain`).
 */
export function forgetRefusal(
  steps: readonly Workflow[] | undefined,
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  others: readonly Run[] = [],
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
  asks: readonly RetryAsk[] = [],
  roundAsks: readonly RoundAsk[] = [],
  spendOf: SpendOf = () => undefined,
  askAt: (ask: AskName) => string = (a) => `${run.id}.asks/${a.kind}-${a.step}-${a.n}`,
  standings: readonly BranchStanding[] = [],
  verb: 'rm' | 'prune' = 'rm',
  merging: MergeState['merging'] = 'none',
  command = `nemia ${verb} ${run.id}`,
): string | null {
  const asked: Forgetting = {
    steps,
    run,
    id: run.id,
    again: command,
    phaseOf,
    closeoutOf,
    askedCloseout,
    verdictOf,
    asks,
    roundAsks,
    spendOf,
    askAt,
    standings,
    verb,
    merging,
  };
  const c = factsOf(asked, others);
  const held = HELD.map((reason) => reason(c)).filter((words) => words !== undefined);
  const fixes = FIXES.map((fix) => fix(c)).filter((words) => words !== undefined);
  return held.length ? `${held.join('; ')}. ${fixes.join('. ')}.` : null;
}

/** What `forgetRefusal` was asked: its arguments, the run's id, and the command its fixes name (`again`). */
type Forgetting = {
  steps: readonly Workflow[] | undefined;
  run: Run;
  id: string;
  again: string;
  phaseOf: (taskId: string) => TaskPhase;
  closeoutOf: (step: string) => Closeout | undefined;
  askedCloseout: (taskId: string) => CloseoutAsked;
  verdictOf: (step: string) => Verdict | undefined;
  asks: readonly RetryAsk[];
  roundAsks: readonly RoundAsk[];
  spendOf: SpendOf;
  askAt: (ask: AskName) => string;
  standings: readonly BranchStanding[];
  verb: 'rm' | 'prune';
  merging: MergeState['merging'];
};

/**
 * The run read once for its reasons: its tasks in flight (`live`), its ending whose merge is not landed (`unlanded`), what a pass would
 * file were it not waiting on runs (`ready`, `waits`), the steps at their gates, what is due, the asks no pass files, the runs that wait on
 * it (`stranded`) or are held until it ships (`holders`), and how a hold on it is said (`lifts`).
 */
type Facts = Forgetting & {
  live: string[];
  unlanded?: Workflow;
  ready: string[];
  waits: boolean;
  atGates: string[];
  due: string[];
  unheard: AskName[];
  stranded: string[];
  holders: string[];
  lifts: string;
};

/** `forgetRefusal`'s facts of a run, among the store's `others`: a cancelled run's steps and asks are not judged. */
function factsOf(f: Forgetting, others: readonly Run[]): Facts {
  const { steps, run, id } = f;
  const { hold, ...free } = run;
  const live = liveTasks(run, f.phaseOf);
  const judged =
    !run.cancelledAt && steps
      ? {
          a: assess(steps, free, f.phaseOf, f.closeoutOf, f.askedCloseout, f.verdictOf, f.asks, f.roundAsks, () => false, f.spendOf),
          steps,
        }
      : undefined;
  const waits = judged !== undefined && gated(run) && judged.a.ready.length > 0;
  return {
    ...f,
    live,
    unlanded: unlandedEnding(f, live),
    ready: judged?.a.ready ?? [],
    waits,
    atGates: judged ? gatesOf(f, judged.steps) : [],
    due: judged ? dueOf(judged.a, judged.steps, waits) : [],
    unheard: run.cancelledAt ? [] : unheardOf(f, judged?.a),
    stranded: others
      .filter((o) => o.id !== id && o.after?.includes(id) && gated(o))
      .map((o) => o.id)
      .sort(),
    holders: others
      .filter((o) => o.id !== id && !o.cancelledAt && o.hold?.until.includes(id))
      .map((o) => o.id)
      .sort(),
    lifts: hold ? `, once the hold lifts — it is ${holdWord(hold.until.map((u) => ({ run: u })))}` : '',
  };
}

/** Each of the run's tasks — a step's, or its check's — that is pending or running, as `<label> is <phase>`. */
function liveTasks(run: Run, phaseOf: (taskId: string) => TaskPhase): string[] {
  const live: string[] = [];
  for (const [name, record] of Object.entries(run.steps)) {
    for (const [label, taskId] of [
      [name, record.taskId],
      [`${name}'s check`, record.check?.taskId],
    ] as const) {
      const phase = taskId ? phaseOf(taskId) : undefined;
      if (phase === 'pending' || phase === 'running') live.push(`${label} is ${phase}`);
    }
  }
  return live;
}

/** The ending that lands on its check whose merge is not landed (`landingOpen`), with nothing of the run in flight — or undefined. */
function unlandedEnding(f: Forgetting, live: readonly string[]): Workflow | undefined {
  const { steps, run, phaseOf, closeoutOf, askedCloseout, spendOf, merging } = f;
  const ending = steps?.find((s) => landsOnCheck(s, run));
  const unlanded =
    ending &&
    !live.length &&
    steps &&
    landingOpen(ending, run, ownStatus(ending, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf), phaseOf, () => merging);
  return unlanded ? ending : undefined;
}

/** The steps awaiting approval, but an ending whose result git already has and that never ran (`resultOnBase`). */
function gatesOf(f: Forgetting, steps: readonly Workflow[]): string[] {
  const { run, phaseOf, closeoutOf, askedCloseout, spendOf, verdictOf, standings } = f;
  const takenByHand = (st: Workflow): boolean => resultOnBase(standings) && approvedFirst(st, run) && !run.steps[st.name]?.taskId;
  return steps
    .filter(
      (s) =>
        standing(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).status === 'awaiting approval' && !takenByHand(s),
    )
    .map((s) => s.name);
}

/** On whose word a try is due, as `dueOf` says it: `retries:`, the run's sign-off nudge, `nemia pause --now`, or `nemia retry`. */
const dueBy = (r: Retry, step: Workflow | undefined): string => {
  if (r.by === 'retries') return `retries: ${step?.retries}`;
  if (r.by === 'signoff') return 'a nudge to sign off';
  return r.by === 'pause' ? 'nemia pause --now' : `nemia retry ${modeWord(r)}`;
};

/** Whether a try due answers an ask file: a person's `nemia retry`, or the ask `nemia pause --now` wrote. */
const askedFor = (r: Retry): boolean => r.by === 'ask' || r.by === 'pause';

/** What a pass would file now, each said: the steps ready, unless the run waits on runs (`waits`), the checks, tries and rounds due. */
function dueOf(a: Assessment, steps: readonly Workflow[], waits: boolean): string[] {
  const due: string[] = [];
  if (!waits && a.ready.length) due.push(`${andList(a.ready)} ${a.ready.length > 1 ? 'are' : 'is'} ready to be filed`);
  for (const name of a.check) due.push(`${name}'s check is due`);
  for (const r of a.retry) {
    const step = steps.find((s) => s.name === r.step);
    due.push(`try ${r.try} of ${r.step} is due (${dueBy(r, step)})`);
  }
  for (const r of a.round)
    due.push(
      r.merge ? mergeDueWords(r) : `round ${r.round} of ${r.step}'s loop is due (${r.by === 'again' ? 'again: true' : 'nemia round'})`,
    );
  return due;
}

/** The asks no pass has spent and none files as the run stands (`a`): tries, then rounds. */
function unheardOf(f: Forgetting, a: Assessment | undefined): AskName[] {
  const { run, asks, roundAsks } = f;
  const unheard: AskName[] = [];
  for (const ask of asks) {
    if (spentAsks(run, [ask]).length || a?.retry.some((r) => askedFor(r) && r.step === ask.step && r.try === ask.try)) continue;
    unheard.push({ kind: 'retry', step: ask.step, n: ask.try });
  }
  for (const ask of roundAsks) {
    if (spentRoundAsks(run, [ask]).length || a?.round.some((r) => roundHeard(r, ask))) continue;
    unheard.push(ask.merge ? { kind: 'merge', step: ask.merge.target, n: ask.merge.try } : { kind: 'round', step: ask.step, n: ask.round });
  }
  return unheard;
}

/** Whether the round due `r` is the one a person's ask asked for: its round on `nemia round`, its target's try on `nemia merge`. */
const roundHeard = (r: Round, ask: RoundAsk): boolean =>
  ask.merge
    ? r.merge?.target === ask.merge.target && r.merge.try === ask.merge.try
    : r.by === 'ask' && r.step === ask.step && r.round === ask.round;

/** A merge due, said: what its target merges, and that it spends no round. */
const mergeDueWords = (r: Round): string =>
  `the merge of ${r.merge!.onto} into ${r.target}'s work is due (nemia merge), on round ${r.round} of ${r.step}'s loop`;

/** An ask no pass files, named. */
const askNamed = (u: AskName): string =>
  u.kind === 'retry'
    ? `try ${u.n} of ${u.step}`
    : u.kind === 'merge'
      ? `the merge into ${u.step}'s work`
      : `round ${u.n} of ${u.step}'s loop`;

/** The run's tasks in flight. */
const liveHeld = (c: Facts): string | undefined => (c.live.length ? andList(c.live) : undefined);

/** An ending's merge the run has not yet committed or aborted. */
function unlandedHeld(c: Facts): string | undefined {
  const { unlanded: ending, run, merging } = c;
  if (!ending) return undefined;
  return merging === 'ours'
    ? `${ending.name}'s merge is staged in the repository's checkout (${run.repo}), and the run has not yet committed or aborted it`
    : `${ending.name} signed off, and the run has not yet checked its merge and committed or aborted it`;
}

/** What the run files once the runs it waits on have shipped. */
function waitsHeld(c: Facts): string | undefined {
  const { run, ready, waits } = c;
  if (!waits) return undefined;
  return `it waits on ${andList(run.after!)}, and files ${andList(ready)} once ${run.after!.length > 1 ? 'they have' : 'it has'} shipped`;
}

/** What each step at its gate files once approved: itself, when it never ran, or what waits on it. */
function gateFiles(atGates: readonly string[], run: Run): string {
  const one = atGates.length === 1;
  if (atGates.every((name) => !run.steps[name]?.taskId)) return one ? 'it is filed' : 'each is filed';
  return atGates.some((name) => !run.steps[name]?.taskId)
    ? 'each is filed, or what waits on it is'
    : `what waits on ${one ? 'it' : 'them'} is filed`;
}

/** The steps waiting at their gates, and the approvals that file them — once the hold lifts, on a held run. */
function gatesHeld(c: Facts): string | undefined {
  const { atGates, run, id, lifts } = c;
  const { hold } = run;
  if (!atGates.length) return undefined;
  const one = atGates.length === 1;
  const files = gateFiles(atGates, run);
  return `${andList(atGates)} ${one ? 'waits at its gate' : 'wait at their gates'} for your approval, and ${files} once ${one ? 'it is' : 'each is'} approved${hold ? lifts : `: ${atGates.map((name) => `nemia approve ${id} ${name}`).join(', ')}`}`;
}

/**
 * What a pass would file now — or once the hold lifts, on a held run: `them` for more than one thing due, or for more than one step ready.
 */
function dueHeld(c: Facts): string | undefined {
  const { due, run, lifts, ready, waits } = c;
  if (!due.length) return undefined;
  const many = due.length > 1 || (!waits && ready.length > 1);
  return run.hold ? `${andList(due)}${lifts}` : `${andList(due)}, and a pass may be filing ${many ? 'them' : 'it'} now`;
}

/** The asks no pass files as the run stands. */
function unheardHeld(c: Facts): string | undefined {
  const { unheard } = c;
  if (!unheard.length) return undefined;
  const named = unheard.map(askNamed);
  return `${andList(named)} ${unheard.length > 1 ? 'are' : 'is'} asked for, and no pass files ${unheard.length > 1 ? 'them' : 'it'} as the run stands`;
}

/** The runs that wait on this one and have not started. */
function strandedHeld(c: Facts): string | undefined {
  const { stranded, id } = c;
  if (!stranded.length) return undefined;
  const one = stranded.length === 1;
  return `${andList(stranded)} ${one ? 'waits' : 'wait'} on it and ${one ? 'has' : 'have'} not started: forgotten, ${one ? 'it' : 'each'} would read waiting on ${id} (no such run) for ever`;
}

/** The runs held until this one ships. */
function holdersHeld(c: Facts): string | undefined {
  const { holders } = c;
  if (!holders.length) return undefined;
  const one = holders.length === 1;
  return `${andList(holders)} ${one ? 'is' : 'are'} held until it ships: forgotten, ${one ? 'its hold' : 'each hold'} would wait on no such run for ever`;
}

/** Why the run is held, each reason in the order a person is told it. */
const HELD = [liveHeld, unlandedHeld, waitsHeld, gatesHeld, dueHeld, unheardHeld, strandedHeld, holdersHeld];

/** Wait for a cancelled run's tasks to settle — or cancel, which files nothing more, when anything is in flight or would be filed. */
function cancelFix(c: Facts): string | undefined {
  const { live, due, waits, atGates, run, id, again, verb } = c;
  if (live.length && run.cancelledAt) {
    return `It was cancelled at ${run.cancelledAt}, and a tick stops what is in flight: ${again} once it has settled (nemia ls ${id})`;
  }
  if (live.length || due.length || waits || atGates.length) {
    return `${verb === 'rm' ? 'Forgetting' : 'Pruning'} is not cancelling: nemia cancel ${id} ${live.length ? 'stops what is in flight and ' : ''}files nothing more, then ${again}${live.length ? ` once what was in flight has settled (nemia ls ${id})` : ''}`;
  }
  return undefined;
}

/** Take the unheard asks back, by their files. */
function unheardFix(c: Facts): string | undefined {
  const { unheard, again, askAt } = c;
  if (!unheard.length) return undefined;
  return `Take ${unheard.length > 1 ? 'those asks' : 'that ask'} back, then ${again}: rm ${unheard.map(askAt).join(' ')}`;
}

/** Wait for the next tick to land the ending's merge. */
function unlandedFix(c: Facts): string | undefined {
  const { unlanded: ending, again, id } = c;
  if (!ending) return undefined;
  return `The next tick lands it, cancelled or not: ${again} once nemia ls ${id} says what became of ${ending.name}'s merge`;
}

/** Let the runs that wait on this one start first, or call them off. */
function strandedFix(c: Facts): string | undefined {
  const { stranded, id } = c;
  if (!stranded.length) return undefined;
  const one = stranded.length === 1;
  return `Let ${one ? 'it' : 'them'} start first, on the pass after nemia decide says ${id} has shipped, or call ${one ? 'it' : 'them'} off: ${stranded.map((s) => `nemia cancel ${s}`).join(', ')}`;
}

/** Let the runs held until this one go on first, or lift their holds — only lift them, when this run was cancelled and never ships. */
function holdersFix(c: Facts): string | undefined {
  const { holders, run, id } = c;
  if (!holders.length) return undefined;
  const one = holders.length === 1;
  const lift = `${one ? 'the hold' : 'each hold'}: ${holders.map((h) => `nemia hold ${h} --off`).join(', ')}`;
  return run.cancelledAt
    ? `Lift ${lift}`
    : `Let ${one ? 'it' : 'them'} go on first, on the pass after nemia decide says ${id} has shipped, or lift ${lift}`;
}

/** What to do about each reason, in the order a person is told it. */
const FIXES = [cancelFix, unheardFix, unlandedFix, strandedFix, holdersFix];

/**
 * Why `nemia <verb>` touches nothing of the run `id`: its place did not read what the run left in `repo` — it refused, in its words, or
 * was not heard. Never read as nothing left to remove. Pure.
 */
export function inventoryUnread(
  verb: 'rm' | 'prune',
  id: string,
  repo: string,
  outcome: { readonly refused: string } | { readonly unread: { readonly said: string } },
): string {
  const why = 'refused' in outcome ? `refused to read it — ${outcome.refused}` : `was not heard — ${outcome.unread.said}`;
  return `its place's inventory of what it left in ${repo} ${why}; nothing was touched, as nothing says what is there: nemia ${verb} ${id} again once the place reads it`;
}

/**
 * The run's worktrees, and the paths its record names that its place's inventory does not list. Pure.
 *
 * Only what is inside `dir`, the run's own directory (`worktrees/<id>`): never the repository itself, where a `--no-worktree` run worked,
 * and never another run's, whose id may start with this one's. Git's list decides, so a worktree a pass cut and died before filing is found
 * too. Each carries the step a hand-off commits what it holds under: the last step, in the order they run, that the record puts in it —
 * every step after the first in a line of work inherits its directory — or, where the record puts none, its directory's name, which is the
 * name of the step it was cut for.
 */
export function runWorktrees(
  run: Run,
  names: readonly string[],
  dir: string,
  listed: readonly Held[],
): { worktrees: Array<Held & { step: string }>; unlisted: string[] } {
  const ours = (p: string) => Boolean(inside(path.resolve(dir), path.resolve(p)));
  const worktrees = listed
    .filter((w) => ours(w.path))
    .map((w) => {
      const working = names.filter(
        (name) => run.steps[name]?.workspace && path.resolve(run.steps[name].workspace) === path.resolve(w.path),
      );
      return { ...w, step: working.at(-1) ?? path.basename(w.path) };
    });
  const unlisted = [
    ...new Set(
      Object.values(run.steps)
        .map((s) => s.workspace)
        .filter((p): p is string => Boolean(p) && ours(p!)),
    ),
  ].filter((p) => !worktrees.some((w) => path.resolve(w.path) === path.resolve(p)));
  return { worktrees, unlisted };
}

/**
 * Why `nemia rm` leaves a worktree as it is — or null, when its place may be asked to remove it. Pure: handed what the place's inventory
 * read of it. Locked: git refuses, and so does `nemia rm`. Detached — a rebase, a bisect or a checkout of a commit left its HEAD on no
 * branch, as a session stopped in the middle of one does — unless it is clean and its HEAD's commit is on a branch already: a hand-off
 * there commits onto no branch, and removing it leaves that commit, and any the session made, on none.
 */
export function heldWorktree(w: Held): { locked: string } | { detached: string } | null {
  if (w.locked !== undefined) return { locked: w.locked };
  if (w.detached && !(w.clean === true && w.onBranch)) return { detached: w.head ?? '' };
  return null;
}

/**
 * What `nemia rm` does with one of the run's branches, and why: merged into its base, forced, kept by default, or kept unmerged — or git's
 * words, when it would not, or why the place's `remove` did not answer.
 */
export type BranchFate = {
  branch: string;
  deleted: boolean;
  why: 'merged' | 'forced' | 'default' | 'unmerged' | { git: string } | { unread: string };
};

/**
 * What becomes of each branch git has under the run's name, `wf/<id>/`. Pure. Only those: never the base branch a `--no-worktree` run
 * worked on, nor another run's. Kept unless `deleteBranches`; deleted when merged into the run's base branch (`merged`, git's word), or
 * with `forceUnmerged`; otherwise kept.
 */
export function branchFates(
  run: Pick<Run, 'id'>,
  listed: readonly string[],
  merged: (branch: string) => boolean,
  how: ForgetHow = {},
): BranchFate[] {
  return listed
    .filter((b) => b.startsWith(`wf/${run.id}/`))
    .sort()
    .map((branch): BranchFate => {
      if (!how.deleteBranches) return { branch, deleted: false, why: 'default' };
      if (merged(branch)) return { branch, deleted: true, why: 'merged' };
      return how.forceUnmerged ? { branch, deleted: true, why: 'forced' } : { branch, deleted: false, why: 'unmerged' };
    });
}

/**
 * The check logs in `checks/` that are the run's: `<id>-<step>-check.stderr` and `<id>-<step>-try<n>-check.stderr`, and each `.stdout`
 * beside them, for each step the record names: the files checks wrote before the runtime kept their streams. Pure. With no record
 * to name the steps, any `<id>-…-check.stderr` or `.stdout` — but none that could be another stored run's: one whose id starts with this
 * one's, or whose id this one starts with — `r-xyz-implement` is no run, and `r-xyz-implement-check.stderr` is `r-xyz`'s.
 */
export function checkLogsOf(
  id: string,
  names: readonly string[] | undefined,
  listing: readonly string[],
  otherIds: readonly string[] = [],
): string[] {
  const suffix = /-check\.std(err|out)$/;
  return listing
    .filter((file) => {
      const end = suffix.exec(file)?.index;
      if (end === undefined) return false;
      if (names) {
        return names.some((name) => {
          const prefix = `${id}-${name}`;
          return file.startsWith(prefix) && /^(-try\d+)?$/.test(file.slice(prefix.length, end));
        });
      }
      return file.startsWith(`${id}-`) && !otherIds.some((o) => o !== id && file.startsWith(`${o}-`));
    })
    .sort();
}

/**
 * What `nemia rm` did with one run, for `forgetLine` to say.
 *
 *   missing    the store has no record of it: what was left under its id, removed
 *   refused    `forgetRefusal` said why, and nothing was touched
 *   held       a worktree git would not remove, or a directory in the run's own that git does not know: what git removed is gone, and the
 *              record, its files and its branches are kept, so `nemia rm` again finishes the job
 *   forgotten  every worktree gone, the branches as asked, the record and its files removed
 */
export type Forgot = {
  id: string;
  kind: 'missing' | 'refused' | 'held' | 'forgotten';
  refusal?: string;
  /** The run's repository and base branch, and whether it cut worktrees: what the words about its worktrees and branches need. */
  repo?: string;
  base?: string;
  isolate?: boolean;
  /** A folder run's (`place`): no repository, worktree or branch to say anything of — its folders were under its own directory. */
  folder?: true;
  /** Worktrees git removed. */
  removed: string[];
  /** What a worktree held uncommitted, committed first under its step's name: on which branch, as which commit. */
  handedOff: Array<{ step: string; branch?: string; commit: string }>;
  /** Worktrees whose directory was already gone. */
  gone: string[];
  /**
   * What is still there: locked (with git's reason); on no branch (`detached`, at its HEAD's commit); holding what `step` left uncommitted,
   * which the hand-off could not commit (`uncommitted`, in git's words); refused by git (in its words); left as it was because the place's
   * `verb` did not answer (`unread`, with its refusal or why it was not heard); a directory git does not know as a worktree — or, for a run
   * with no record, its worktrees' directory, which nothing says whose worktrees are in. `fix` is the place's command for it, from its
   * `say`.
   */
  left: Array<{
    path: string;
    locked?: string;
    detached?: string;
    uncommitted?: string;
    step?: string;
    git?: string;
    unread?: { verb: string; said: string };
    unknown?: true;
    orphaned?: true;
    fix?: string;
  }>;
  branches: BranchFate[];
  /** What was removed besides the worktrees, from `WF_ROOT`: the record first. */
  files: string[];
  /** For a record that froze no workflow, when its folder does not read: why. */
  unfrozen?: string;
  /** What the engine did with the run's tasks once its record was removed (`forgetTasks`): absent while nothing was removed. */
  engine?: EngineForgetting;
};

/** One line for one run `nemia rm` was given, saying what happened, and what the engine did with its tasks (`engineWords`). Pure. */
export function forgetLine(f: Forgot): string {
  const engine = f.engine ? engineWords(f.engine, { id: f.id }) : '';
  return engine ? `${storeLine(f)}; ${engine}` : storeLine(f);
}

/** What `nemia rm` did with one run's worktrees, branches and files. */
function storeLine(f: Forgot): string {
  const them = (n: number) => (n > 1 ? 'them' : 'it');
  if (f.kind === 'refused') return `${f.id}  not forgotten: ${f.refusal}`;
  const files = f.files.length ? `removed ${f.files.join(', ')}` : '';
  if (f.kind === 'missing')
    return `${f.id}  no such run — ${files ? `nothing to forget but what was left under its id: ${files}` : 'nothing to forget'}${f.left.length ? `;${leftWords(f)}` : ''}`;

  const worktrees = [
    f.removed.length ? `removed ${f.removed.length} worktree${f.removed.length > 1 ? 's' : ''}` : '',
    ...f.handedOff.map((h) => `committed what ${h.step} left uncommitted${h.branch ? ` on ${h.branch}` : ''} as ${h.commit.slice(0, 7)}`),
    f.gone.length ? `${f.gone.length} worktree${f.gone.length > 1 ? 's were' : ' was'} already gone` : '',
  ].filter(Boolean);
  if (f.kind === 'held') {
    return `${f.id}  not forgotten:${leftWords(f)}${worktrees.length ? `; ${worktrees.join(', ')}` : ''}. Its record, files and branches are kept until every worktree is gone: nemia rm ${f.id} again then.`;
  }

  if (f.folder)
    return [
      `${f.id}  forgotten: a folder run, whose steps worked in its own directory — no worktrees, no branches`,
      files,
      f.unfrozen ? `its workflow was never frozen, and ${f.unfrozen}` : '',
    ]
      .filter(Boolean)
      .join('; ');

  const base = f.base ?? 'its base branch';
  const deleted = f.branches.filter((b) => b.deleted);
  const kept = (why: BranchFate['why']) => f.branches.filter((b) => !b.deleted && b.why === why).map((b) => b.branch);
  const branches = [
    deleted.length
      ? `deleted ${deleted.map((b) => `${b.branch} (${b.why === 'forced' ? `not merged into ${base}, forced` : `merged into ${base}`})`).join(', ')}`
      : '',
    kept('default').length
      ? `kept ${kept('default').join(', ')} — branches are kept unless asked: --delete-branches deletes those merged into ${base}`
      : '',
    kept('unmerged').length
      ? `kept ${kept('unmerged').join(', ')}: not merged into ${base} — --force-unmerged deletes ${them(kept('unmerged').length)}, and the work on ${them(kept('unmerged').length)}`
      : '',
    ...f.branches.map((b) =>
      typeof b.why !== 'object'
        ? ''
        : 'git' in b.why
          ? `kept ${b.branch}: git would not delete it — ${b.why.git}`
          : `kept ${b.branch}: the place's remove did not answer — ${b.why.unread}; nemia rm ${f.id} again deletes it once it does`,
    ),
  ].filter(Boolean);
  return [
    `${f.id}  forgotten: ${worktrees.length ? worktrees.join(', ') : f.isolate === false ? `no worktrees, it worked in ${f.repo} itself` : 'no worktrees'}`,
    files,
    branches.length ? branches.join('; ') : f.isolate === false ? 'no branch of its own' : 'no branches left',
    f.unfrozen ? `its workflow was never frozen, and ${f.unfrozen}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** What is still there after `nemia rm`, each with what to do about it, in its place's command (`fix`). */
function leftWords(f: Forgot): string {
  return f.left.map((l) => ` ${leftWord(f.id, l)}`).join(';');
}

/** What one thing still there after `nemia rm` is, why it is there, and what to do: `fix`, the place's command, where it has one. */
function leftWord(id: string, l: Forgot['left'][number]): string {
  const fix = (lead: string) => (l.fix ? `${lead}${l.fix}` : '');
  if (l.locked !== undefined)
    return `${l.path} is locked${l.locked ? ` (${l.locked})` : ''}, and git will not remove it — unlock it if nothing needs it${fix(': ')}`;
  if (l.detached !== undefined)
    return `${l.path} is on no branch — its HEAD is detached${l.detached ? ` at ${l.detached.slice(0, 7)}` : ''}, as a rebase, a bisect or a checkout of a commit leaves it — and removing it would leave what it holds, committed or not, on no branch: put it on one (${fix('')}${l.fix ? ', or ' : ''}finish or abort what left it there), then nemia rm ${id} again`;
  if (l.uncommitted !== undefined)
    return `${l.path} holds what ${l.step} left uncommitted, and the hand-off could not commit it — ${l.uncommitted}. That work is on no branch until it is committed, so nothing of it was removed: commit it there yourself (it is staged${fix(': ')}), then nemia rm ${id} again`;
  if (l.unread)
    return `${l.path} is left as it is: the place's ${l.unread.verb} did not answer — ${l.unread.said}. nemia rm ${id} again once it does`;
  if (l.git !== undefined)
    return `git would not remove ${l.path} — ${l.git}; what is uncommitted there is on no branch, so look in it before anything is forced${fix(': ')}`;
  if (l.orphaned) return `${l.path} is still there, and with no record nemia rm cannot say whose worktrees are in it${fix(' — ')}`;
  return `${l.path} is not a worktree git knows, and nemia rm removes worktrees only through git — look in it, and remove it yourself if nothing there is wanted`;
}
