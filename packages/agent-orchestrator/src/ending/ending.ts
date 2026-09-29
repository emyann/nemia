/**
 * A run's ending step: when its merge lands on its check (`landingDue`, `landingOpen`), what landed (`landedWords`), the one checkout
 * it holds (`checkoutLine`), and what is left for a person to decide (`toDecide`, `gateRefusal`). Pure: the tick merges and commits.
 */
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../step/step.ts';
import { terminalSteps } from '../workflow/index.ts';
import { tryOf, type RetryAsk } from '../retry/retry-ask.ts';
import {
  andList,
  firstLine,
  refusedCheck,
  SETTLED,
  TRIED_FROM,
  type Landed,
  type Run,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import { approvalOf, approvedFirst, branchWord, hasGate, landsOnCheck, resultOnBase, type BranchStanding } from '../status/status.ts';
import type { CheckoutHold } from '../cap/cap.ts';
import type { Assessment } from '../run.ts';

/**
 * What the session of an ending that lands on its check is denied beyond its own `disallowedTools:`: the two commands that commit a staged
 * merge. The run commits it, on the check's word; a shipper that committed first would put the merge on the base branch unchecked, and the
 * pass after could only record it as committed before its check ran. A deny is a prefix, not a sandbox — `git merge` without `--no-commit`
 * still commits a clean merge, and `git -C . commit` is not `git commit` — so the brief says it too, and a commit made anyway is recorded as
 * such (`landingDue`'s `onHead`). The parser refuses a landing on codex, which takes no deny list.
 */
export const LANDING_DENIED: readonly string[] = ['Bash(git commit:*)', 'Bash(git merge --continue:*)'];

/** The deny list a step is filed with, each try and each round: its own, and `LANDING_DENIED` for an ending that lands on its check. Pure. */
export const filedDenies = (
  step: Pick<Workflow, 'name' | 'gate' | 'workspace' | 'check' | 'disallowedTools'>,
  run: Pick<Run, 'gates'>,
): string[] | undefined =>
  landsOnCheck(step, run) ? [...new Set([...(step.disallowedTools ?? []), ...LANDING_DENIED])] : step.disallowedTools;

/** The repository's own checkout as a pass reads it for an ending that lands on its check (`mergeState` in worktree.ts). */
export type MergeState = {
  /**
   * `ours`: a merge is in progress — MERGE_HEAD — and every commit it merges is the tip of one of this run's result branches; `other`: one is,
   * and it merges something else, a person's or another run's; `none`: no merge is in progress.
   */
  merging: 'ours' | 'other' | 'none';
  /** Whether git holds a path unmerged. */
  conflicted: boolean;
  /** The result branches neither in the merge nor already on the checkout's HEAD: what a commit now would leave out. */
  missing: readonly string[];
  /** The checkout's HEAD, what a result already on it landed as. */
  head?: string;
};

/** What a pass does about an ending's staged merge (`landingDue`): commit it with the step's message, abort it, or only write down how it stands. */
export type Landing = { act: 'commit'; message: string } | { act: 'abort'; why: string } | { act: 'record'; landed: Landed };

/**
 * What this pass does with the merge an ending that lands on its check staged in the repository's checkout (`landsOnCheck`), or undefined
 * when it does nothing. Pure: the tick acts, and writes what it did on the step's record (`landed`), once for each try. The checkout is read
 * through `merge` (`mergeState`: a handful of git calls in a person's own checkout), and only once a landing can be due: never while the
 * step's session or its check runs, and, for a step that ended any way but a signed hand-off, only where `staged` — MERGE_HEAD is there,
 * read off the file system with no git — says a merge is in progress to take back. So an ending that ended blocked with nothing staged
 * is recorded as landing nothing on the first pass that reads it settled (a task the engine does not know reads `running`, and waits),
 * with one `stat` of the checkout and no git, and the merges a person stages there after it — to resolve by hand what stopped it, or a
 * trial merge — are never the run's to abort. Level-triggered: a pass after a restart — the daemon's, or the machine's — reads the
 * checkout and the engine as they are and does the same, so a merge staged by an ending is never left staged once nothing of it runs.
 *
 * Nothing while the step's session or its check is in flight, since each is working on that merge; nor on the pass that files its check,
 * with the merge staged or on HEAD, unless the run is held, which aborts it; nor on a merge that is not this run's (`other`), which is
 * never touched — the run did not start it. Once neither runs:
 * - **commit**: the step signed off done (`own` is `checking`), its check passed on the merge, the merge takes in every result branch and
 *   has no conflict, and the step's closeout gave a message. Only then does anything land on the base branch: the step was filed on a
 *   person's approval, and its check is the run's own, from the folder frozen on the record.
 * - **abort**, of a merge that is this run's: its check refused it or did not finish — a check that did not finish is no verdict, and no merge
 *   waits on one, since nothing would ever commit it; the step signed off anything but done, or ended with no closeout, failed or was
 *   stopped; the run was called off, or held before the check was filed; the merge has a conflict, or leaves a result branch out; or the
 *   step gave no message to commit it with.
 * - **record**, with no merge of the run's to act on: the step ended anything but done with nothing staged; it signed off done having
 *   staged none (nothing is checked or committed); the check passed and the result is on the checkout's HEAD already (it landed there as
 *   that commit); or the check ended and the merge it judged is no longer staged.
 */
export function landingDue(
  step: Workflow,
  run: Run,
  own: StepStatus,
  phaseOf: (taskId: string) => TaskPhase,
  message: string | undefined,
  verdict: Verdict | undefined,
  staged: boolean,
  merge: () => MergeState,
): Landing | undefined {
  const record = run.steps[step.name];
  if (!landsOnCheck(step, run) || !record?.taskId || record.landed) return undefined;
  const busy = (phase: TaskPhase) => phase === 'pending' || phase === 'running';
  if (busy(phaseOf(record.taskId))) return undefined;
  const check = record.check ? phaseOf(record.check.taskId) : undefined;
  if (check && busy(check)) return undefined;
  const ended = SETTLED.has(phaseOf(record.taskId)) && (TRIED_FROM.has(own) || own === 'budget exhausted');
  const nothing = ended
    ? { act: 'record' as const, landed: { untouched: `${step.name} ended ${own}, and nothing of it was staged` } }
    : undefined;
  if (own !== 'checking' && !staged) return nothing;
  const { merging, conflicted, missing, head } = merge();
  if (merging === 'other') return undefined;
  const ours = merging === 'ours';
  const onHead = !ours && merging === 'none' && missing.length === 0;
  const end = (why: string): Landing | undefined => (ours ? { act: 'abort', why } : { act: 'record', landed: { aborted: why } });
  if (own !== 'checking') return ours ? { act: 'abort', why: `${step.name} ended ${own} with its merge staged` } : nothing;
  if (run.cancelledAt) return end('the run was called off before its merge was committed');
  if (ours && conflicted) return end('the merge it staged has conflicts');
  if (ours && missing.length) return end(`the merge it staged leaves out ${andList(missing)}`);
  if (!check) {
    if (ours || onHead) return run.hold ? end('the run was held before its check was filed') : undefined;
    return {
      act: 'record',
      landed: { aborted: `${step.name} signed off with no merge of the run's result staged, so nothing was checked or committed` },
    };
  }
  if (check === 'succeeded') {
    if (ours) return message?.trim() ? { act: 'commit', message } : end(`${step.name} signed off no commit message`);
    if (onHead && head) return { act: 'record', landed: { commit: head } };
    return {
      act: 'record',
      landed: { aborted: 'its check passed, and the merge it judged was no longer staged, so nothing was committed' },
    };
  }
  const why = refusedCheck(check, verdict) ? `its check refused the merge (exit ${verdict})` : 'its check did not finish';
  return end(onHead ? `${why}, and the result is on ${run.branch} already: it was committed before its check ran` : why);
}

/**
 * Whether an ending that lands on its check still owes the checkout a landing, and holds it: filed, with nothing landed yet, and its session
 * or its check in flight, its check due, or its merge staged. What keeps another run's ending out of the checkout (`mainClaim`) and `wf rm`
 * from forgetting a run whose merge nothing would then commit or abort (`forgetRefusal`). Pure.
 */
export const landingOpen = (
  step: Workflow,
  run: Run,
  own: StepStatus,
  phaseOf: (taskId: string) => TaskPhase,
  merging: MergeState['merging'],
): boolean => {
  const record = run.steps[step.name];
  if (!landsOnCheck(step, run) || !record?.taskId || record.landed) return false;
  const busy = (phase: TaskPhase | undefined) => phase === 'pending' || phase === 'running';
  return busy(phaseOf(record.taskId)) || busy(record.check && phaseOf(record.check.taskId)) || own === 'checking' || merging === 'ours';
};

/**
 * What the run did with an ending's merge — `the run committed its merge onto main as 1a2b3c4`, or why it made no commit — as the tick's
 * note says it (the daemon's log), `wf ls` on the step's line (`listing`, clipped), and `wf decide` in its offer of a try of a merge the run
 * aborted (`retryLines`).
 */
export const landedWords = (run: Pick<Run, 'branch'>, landed: Landed): string =>
  'commit' in landed
    ? `the run committed its merge onto ${run.branch} as ${landed.commit.slice(0, 7)}`
    : 'aborted' in landed
      ? `nothing landed on ${run.branch}: ${landed.aborted}`
      : `${landed.untouched}: the run left the checkout as it found it`;

/** The longest `landedWords` a `wf ls` line prints: the reason for an abort can be git's refusal, whole (`commitMerge`). */
export const LANDED_CAP = 160;

/**
 * When the person's word that would file a run's ending step was given (`MainClaim`): the approval of an ending that has not run
 * (`approvalOf`), or the ask for the try that would file it again — a step that ended blocked, or whose check refused, is tried like any
 * other, and its try works in that same checkout. Undefined where there is no such word, and nothing of it would be filed. Pure.
 */
export const endingAsked = (run: Run, step: Workflow, asks: readonly RetryAsk[]): string | undefined =>
  run.steps[step.name]?.taskId
    ? asks.find((a) => a.step === step.name && a.try === tryOf(run, step.name) + 1)?.at
    : approvalOf(run, step.name)?.at;

/**
 * A run whose ending step waits for the repository's own checkout, as `wf ls` says it on that step's line: `waiting on the checkout
 * (r-1's ship has it)`. Pure.
 *
 * `waiting on …`, and not `waiting for …`, because the board reads the words: `stepState` (`apps/web/src/lib/status.ts`) takes `waiting`,
 * `waiting on …` and `pending` as a step not filed, `slotWord`'s `waiting for a run slot` as a step the cap holds, and anything else as one
 * still working, so a step with no session of its own would be drawn as one whose session is running.
 */
export const checkoutWord = (hold: CheckoutHold): string => `waiting on the checkout (${hold.run}'s ${hold.step} has it)`;

/**
 * What `wf decide` says for an ending step still waiting for the repository's own checkout: which run's step is in it, and what frees this
 * one. Pure.
 */
export const checkoutLine = (step: string, hold: CheckoutHold): string =>
  `${step}: ${checkoutWord(hold)} — it works in the repository's own checkout, and two endings never do at once; the next tick files ${step} once ${hold.run}'s ${hold.step} has settled`;

/**
 * An ending at its gate whose work git already has on the base branch, beside its line on `wf ls` where the approval would be: where each
 * branch stands, that nothing is left for the step to merge and the run has shipped as git reads it (`decision`), and the one command there
 * still is. Pure.
 */
export const onBaseNote = (run: Pick<Run, 'id' | 'branch'>, step: string, standings: readonly BranchStanding[]): string =>
  `${standings.map((s) => branchWord(run, s)).join(', ')} — nothing is left for ${step} to merge: the run has shipped as git reads it, and nothing waits on you; close the record if you want it closed: wf cancel ${run.id}`;

/**
 * What a person has to decide about a run's result — the fifth reason a run waits on one, beside a step blocked, unsigned, over budget or
 * at a gate.
 *
 *   approve  the run is at its result and the gate on a last step has nobody's approval: `says` is what that step would do, in the folder's
 *            own words, for an ending that has not run — and null for a gated step that has signed off, whose closeout is what to read,
 *            since approving that one accepts what it did rather than letting it act
 *   git      nothing waits at such a gate, every step of the run finished, no step of the workflow merges (`workspace: main`), and a result
 *            branch is ahead of the base branch and not gone: the branch is the product, and merging or dropping it is a person's, by hand
 *
 * A folder whose ending merges answers for its own branch, so once that step has run there is nothing here to say; every other folder hands
 * a person a branch, whether its last step was gated or not, and a gate approved is not a branch merged.
 *
 * Level-triggered: nothing is stored, the branches are read off git each pass, and a run whose branch a person merged stops being one to
 * decide without anybody telling the run. Nothing while the run is running, nor for a cancelled one.
 *
 * Never `approve` on a pruned run, whose approval is refused (`prunedRefusal`): what its branches hold is what is left to decide. Nothing
 * for an ending that has not run whose result git already has (`resultOnBase`): there is nothing for an approval to file, and `wf
 * approve` is refused in those words. `git` only on a run every step of which finished: one that waits on a person for a step that
 * broke says so.
 */
export function toDecide(
  steps: readonly Workflow[],
  run: Run,
  status: Assessment['status'],
  statusOf: (step: string) => StepStatus,
  standings: readonly BranchStanding[] = [],
): ToDecide | undefined {
  if (run.cancelledAt || status === 'running' || status === 'cancelled') return undefined;
  const waiting = endingSteps(steps, run).find((s) => statusOf(s.name) === 'awaiting approval');
  if (waiting && !run.pruned) {
    if (approvedFirst(waiting, run) && !run.steps[waiting.name]?.taskId && resultOnBase(standings)) return undefined;
    return { kind: 'approve', step: waiting.name, says: run.steps[waiting.name]?.taskId ? null : firstLine(waiting.body) };
  }
  if (status !== 'succeeded' || merges(steps)) return undefined;
  const ahead = standings.filter((b) => b.where === 'ahead').map((b) => b.branch);
  return ahead.length ? { kind: 'git', branches: ahead } : undefined;
}

/**
 * Whether the workflow has a step that acts on the base branch itself (`workspace: main`): the folder says what happens when the work is
 * done, so nobody is handed its branch and told to type `git merge`. Pure.
 */
export const merges = (steps: readonly Workflow[]): boolean => steps.some((s) => s.workspace === 'main');

/**
 * The workflow's ending steps: the steps nothing waits on that have a gate (`hasGate`). Pure.
 *
 * An ending is where a person's word ends the run. In a folder written for it, that step says in prose what happens when the work is done
 * — merge it, open a pull request, publish the study — and where it acts on the base branch it says `workspace: main` and is held before it
 * is filed. A gate a run was started with (`--gate <the last step>`) makes an ending of a step that was written as work: approving it is
 * then acceptance, and what becomes of the branch is still a person's (`merges`). Usually one; several only where a workflow ends wide.
 */
export const endingSteps = (steps: readonly Workflow[], run: Pick<Run, 'gates'>): Workflow[] =>
  terminalSteps(steps).filter((s) => hasGate(s, run));

/**
 * What a run waits on a person to decide (`toDecide`): its ending step, which approving runs or accepts — or its result branches, which git
 * ships. `says` is the ending's first line, what it would do, and null for a gated step that has already done it.
 */
export type ToDecide = { kind: 'approve'; step: string; says: string | null } | { kind: 'git'; branches: string[] };

/** What `wf ls` says after `→ to decide:`, and the board's banner: what is to be decided, and the command that decides it. Pure. */
export const toDecideWords = (run: Pick<Run, 'id' | 'branch'>, t: ToDecide): string =>
  t.kind === 'approve'
    ? `${t.says ?? `${t.step} has signed off at its gate`} — wf approve ${run.id} ${t.step}`
    : `${t.branches.join(', ')} ${t.branches.length > 1 ? 'are' : 'is'} ahead of ${run.branch}, and nothing has merged ${t.branches.length > 1 ? 'them' : 'it'} — wf decide ${run.id}`;

/**
 * Why a run cannot be gated at these steps, in words that name the fix — or null. Pure, and asked at start before anything is written: a step
 * given twice, and a step the workflow does not have, naming the steps it has. `said` is how a refusal names what gave the gate: `--gate <step>`
 * by default, a card's `gate:` for a card's.
 */
export function gateRefusal(
  gates: readonly string[],
  steps: readonly Pick<Workflow, 'name'>[],
  said: (step: string) => string = (step) => `--gate ${step}`,
): string | null {
  const seen = new Set<string>();
  for (const step of gates) {
    if (seen.has(step)) return `${said(step)} is given twice, and a run is gated at a step once. Give each step one --gate.`;
    seen.add(step);
    if (!steps.some((s) => s.name === step)) {
      return `${said(step)}: the workflow has no step ${JSON.stringify(step)}, so nothing would ever wait at it. Its steps are: ${steps.map((s) => s.name).join(', ')} — gate one of them by its name.`;
    }
  }
  return null;
}
