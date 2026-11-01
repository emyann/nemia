/**
 * One step's session followed live, across its attempts and its tries: the moments a follower is handed (`StepMoment`), and where the
 * following goes each time the step is read again (`nextOf`). Pure; `following.verb.ts` reads the record and the engine and follows.
 */

/**
 * What a follower of a step is handed. First, whether the step's harness pushes its session at all (`streamed`): `yes: false` ends the
 * stream, and the follower reads the transcript again instead. Then, of the attempt followed, its state as the runtime words it, the
 * transcript's whole events with the cursor after them, and each piece of the text being written (`partial`, under its block's `key`:
 * `append` adds to the text so far, `last` closes the block). `moved` says the step went on to another attempt or task, `taskId`, whose
 * history from its start follows as `events`. `settled` ends the stream: the step has finished.
 */
export type StepMoment<Event = { id: string }> =
  | { kind: 'streamed'; yes: boolean }
  | { kind: 'state'; state: StepSessionState }
  | { kind: 'events'; events: Event[]; cursor: string }
  | { kind: 'partial'; key: string; text: string; append: boolean; last: boolean }
  | { kind: 'moved'; taskId: string }
  | { kind: 'settled' };

/**
 * The state of the session a step's attempt runs, in A2A's TaskState words as the runtime says them (its `SessionState`), written out
 * here because this file imports no runtime, and held equal to the runtime's in `runtime-client.ts` (`stepSessionStateHeld`).
 */
export type StepSessionState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected';

/** The attempt a follower follows: the step's task, and the number of its attempt. */
export type FollowedAttempt = { taskId: string; attempt: number };

/**
 * The step as one read finds it: the task its record names (none before one is filed), the number of that task's last attempt (0 before
 * one starts), whether that attempt is live — started and its end not journalled — and whether the task has settled.
 */
export type StepNow = { taskId: string | null; attempt: number; live: boolean; settled: boolean };

/** Where a following goes from a read: follow an attempt, wait for the step's next line of the feed, or end, the step finished. */
export type Next = { follow: FollowedAttempt } | 'wait' | 'finished';

/**
 * Where the following of a step at `at` goes, the step read as `now`. A live attempt that is not the one followed is followed: the
 * record's task changed (a try), or its task has a later attempt (a person's answer, the next turn). Else a settled task has finished the
 * step, and anything else waits: a task with no attempt yet, and one whose attempt ended — a step held on a person — until its next
 * starts; the runtime follows no attempt that has ended. Pure.
 */
export const nextOf = (at: FollowedAttempt | undefined, now: StepNow): Next => {
  if (now.taskId === null) return 'wait';
  const other = at === undefined || at.taskId !== now.taskId || at.attempt < now.attempt;
  if (other && now.live) return { follow: { taskId: now.taskId, attempt: now.attempt } };
  return now.settled ? 'finished' : 'wait';
};
