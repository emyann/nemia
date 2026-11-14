/**
 * Whether a step that signed off `blocked` may have the check of the try before it run again (`nemia retry <run> <step> --recheck`), and
 * why not where it may not (agent-orchestrator, src/retry/retry.ts, `blockedRecheck`).
 *
 * The case it answers: a step's check failed, the run (`retries:`) or a person continued its session, and that session found its work
 * sound, changed nothing, and signed off `blocked` asking for the check again. The check is run again on the branch as it is, and no
 * session is filed. Only where nothing has changed since that check: a session that committed after it — or left work the run's hand-off
 * committed for it — has a branch the failed check never judged, and its `needs` is a real question, answered with a session as before.
 *
 * Read off the step's record and the world as they are on each read, never off a transition (`retryable`, `retriesDue`, `retryRefusal`):
 * - `blocked`: the step stands `blocked` on its own work (`ownStatus`);
 * - `settled`: the blocked session's task has settled, so no agent is still in the conversation;
 * - `handedOff`: the run has handed that task off (`StepRecord.handedOff` is the current task), so what it left uncommitted is on the
 *   branch, and `tipNow` reads it;
 * - `behind`: the try just behind the current one (`tries.at(-1)`), where it carries a check — whether it ran on the current task
 *   (`sameTask`: a recheck of this very task, not a session after the check), the phase of that check's task, and the commit the step's
 *   branch was at when the run filed that check (`CheckTask.tip`, written by the pass from `Filing.heads`; null on a record written
 *   before the field, or where the pass read no heads); null where there is no try behind, or it carries no check;
 * - `tipNow`: the commit the step's branch is at now, as the caller read it (the pass's heads, `standing.json` for `nemia decide`, the
 *   place asked live for `nemia retry`); null where it was not read — a folder run has no branch, and none is ever read.
 *
 * `BlockedRecheck` is what `retryable` reads to add `recheck` to a blocked step's ways, and what `retryRefusal` words a refusal from: each
 * `why` names what to do instead. Both are imported from here by the code, as src/retry/retry.ts imports its contracts' types.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TaskPhase } from '../src/record/record.ts';

/** What `blockedRecheck` is handed: see the file's head for each field. */
export type BlockedRecheckRead = {
  blocked: boolean;
  settled: boolean;
  handedOff: boolean;
  behind: { sameTask: boolean; checkPhase: TaskPhase; tip: string | null } | null;
  tipNow: string | null;
};

/**
 * Why a blocked step's check may not be run again:
 * - `not blocked`: the step does not stand `blocked`, and its ways are its own status's (`modesOf`);
 * - `unsettled`: its session has not settled — wait for it;
 * - `no failed check`: the try before it has no check that ran and did not pass — nothing to run again; answer it with a session;
 * - `not handed off`: the run has not yet committed what the session left — the next pass does; ask again after it;
 * - `unrecorded`: the failed check's commit was not recorded (a record from before the field) — what it judged is unknown; a session;
 * - `unread`: where the branch is now was not read — ask again once it is (`nemia up` reads it);
 * - `moved`: the branch moved since the failed check, from `was` to `now` — a new session's check, as before.
 */
export type BlockedRecheckWhy = 'not blocked' | 'unsettled' | 'no failed check' | 'not handed off' | 'unrecorded' | 'unread' | 'moved';

/** The judgement: the check may run again, or why not — a move says both commits. */
export type BlockedRecheck =
  | { recheck: true }
  | { recheck: false; why: Exclude<BlockedRecheckWhy, 'moved'> }
  | { recheck: false; why: 'moved'; was: string; now: string };

/** Whether a check's task settled without passing: its command refused, or it was ended before it finished. */
const didNotPass = (phase: TaskPhase): boolean => phase === 'failed' || phase === 'stopped';

/** Whether the try behind is a check that did not pass, judging a session other than the current one. */
const failedBefore = (i: BlockedRecheckRead): boolean => i.behind !== null && !i.behind.sameTask && didNotPass(i.behind.checkPhase);

/** Whether everything but the branch's place is as a recheck needs it. */
const readyButTheBranch = (i: BlockedRecheckRead): boolean => i.blocked && i.settled && failedBefore(i) && i.handedOff;

const blockedRecheckSpec = spec<(i: BlockedRecheckRead) => BlockedRecheck>({
  ensures: {
    rechecksExactlyWhenNothingChanged: {
      description:
        'The check runs again exactly when a settled, handed-off blocked session follows a check that did not pass, and the branch is at the commit that check was filed on',
      condition: ({ input: [i], output }) =>
        output.recheck ===
        (readyButTheBranch(i) && i.behind !== null && i.behind.tip !== null && i.tipNow !== null && i.tipNow === i.behind.tip),
    },
    onlyABlockedStep: {
      description: 'A step that does not stand blocked is told so, whatever its tries say',
      condition: ({ input: [i], output }) => (i.blocked ? true : !output.recheck && output.why === 'not blocked'),
    },
    neverBesideASession: {
      description: 'A blocked step whose session has not settled waits for it: a recheck never runs beside an agent',
      condition: ({ input: [i], output }) => (i.blocked && !i.settled ? !output.recheck && output.why === 'unsettled' : true),
    },
    onlyAfterAFailedCheck: {
      description:
        'A settled blocked step with no check behind it that did not pass — none, one that passed or never settled, or a recheck of this very task — has nothing to run again',
      condition: ({ input: [i], output }) =>
        i.blocked && i.settled && !failedBefore(i) ? !output.recheck && output.why === 'no failed check' : true,
    },
    afterTheHandOff: {
      description: 'Until the run has handed the session off, what it left is not on the branch, and no recheck is offered',
      condition: ({ input: [i], output }) =>
        i.blocked && i.settled && failedBefore(i) && !i.handedOff ? !output.recheck && output.why === 'not handed off' : true,
    },
    anUnrecordedCheckIsNotGuessed: {
      description: 'A failed check whose commit was never recorded is not rechecked: what it judged is unknown',
      condition: ({ input: [i], output }) =>
        readyButTheBranch(i) && i.behind !== null && i.behind.tip === null ? !output.recheck && output.why === 'unrecorded' : true,
    },
    anUnreadBranchIsNotGuessed: {
      description: 'Where the branch is now was not read, no recheck is taken on faith',
      condition: ({ input: [i], output }) =>
        readyButTheBranch(i) && i.behind !== null && i.behind.tip !== null && i.tipNow === null
          ? !output.recheck && output.why === 'unread'
          : true,
    },
    aMovedBranchSaysBothCommits: {
      description:
        'A branch that moved since the failed check is a new session’s check, and the refusal names the commit the check judged and the one the branch is at',
      condition: ({ input: [i], output }) =>
        readyButTheBranch(i) && i.behind !== null && i.behind.tip !== null && i.tipNow !== null && i.tipNow !== i.behind.tip
          ? !output.recheck && output.why === 'moved' && output.was === i.behind.tip && output.now === i.tipNow
          : true,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type BlockedRechecked = Implementation<typeof blockedRecheckSpec>;
