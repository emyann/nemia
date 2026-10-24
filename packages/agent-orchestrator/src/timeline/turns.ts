/**
 * Which turn of a session a try is: a try that answered an earlier try's task, held open, ran no session of its own but a turn of that
 * one, and its clock is that turn's.
 *
 * Pure, as `timeline.ts` is, and imports nothing of it: the tries of a step's record and a task's attempts in, the turn and its span out.
 */
import { parseCloseout } from '../closeout/index.ts';
import type { TryCause } from '../retry/index.ts';

/** A try of a step as a turn is read off it: its session's task, and what replaced it; `cause` absent on the step's current try. */
export type TurnTry = { taskId: string; cause?: TryCause };

/**
 * An attempt as a turn is read off it: its spawn, its end, the turn of a task held open the runtime stamped it with, and the closeout it
 * signed, as the runtime recorded it.
 */
export type TurnAttempt = { spawnedAt: string | null; endedAt: string | null; turn?: number; closeout?: unknown };

/**
 * The turn of an earlier try's session a try ran. `asked` is whether the turn before it signed off blocked, so that this one is a
 * person's answer to it: false for work sent back from a gate, whose turn before signed off done, and where that turn signed nothing
 * that reads. `heldFrom` is when the turn before it ended, `spawnedAt` its own first spawn and `endedAt` its last attempt's end: each
 * null where the task's attempts do not say.
 */
export type TurnSpan = { asked: boolean; heldFrom: string | null; spawnedAt: string | null; endedAt: string | null };

/**
 * The turn try `i` of `tries` is, of the session an earlier try filed. Null for a try on a task of its own, and for one a recheck
 * reached, which ran its check again and no turn. The turn is the count of the tries behind it on its task that were not replaced by a
 * recheck: the order the runtime numbers a held task's turns in, from 0.
 */
export function turnOf(tries: readonly TurnTry[], i: number): number | null {
  const behind = tries.slice(0, i).filter((t) => t.taskId === tries[i]?.taskId);
  const answered = behind.at(-1)?.cause;
  if (answered === undefined || answered === 'recheck') return null;
  return behind.filter((t) => t.cause !== 'recheck').length;
}

/** Whether an attempt signed off blocked: its closeout, as `parseCloseout` reads it, says so. An attempt that signed none did not. */
const signedBlocked = (a: TurnAttempt | undefined): boolean => {
  if (a?.closeout === undefined || a.closeout === null) return false;
  const said = parseCloseout(a.closeout);
  return !('error' in said) && said.outcome === 'blocked';
};

/**
 * The span of `turn` among a task's `attempts` (`TurnSpan`): an attempt with no turn is of turn 0. Where the runtime skipped the turn,
 * or the task has no attempt, each time is null and nothing was asked. The task's last turn has ended only once the task is `over`,
 * settled or signed and waiting on a person: an attempt of it that ended before may be followed by another.
 */
export function turnSpanOf(attempts: readonly TurnAttempt[], turn: number, over: boolean): TurnSpan {
  const own = attempts.filter((a) => (a.turn ?? 0) === turn);
  const before = own.length ? attempts.filter((a) => (a.turn ?? 0) < turn).at(-1) : undefined;
  const last = attempts.every((a) => (a.turn ?? 0) <= turn);
  return {
    asked: signedBlocked(before),
    heldFrom: before?.endedAt ?? null,
    spawnedAt: own.find((a) => a.spawnedAt)?.spawnedAt ?? null,
    endedAt: last && !over ? null : (own.at(-1)?.endedAt ?? null),
  };
}

/**
 * How long a run waited on a person's answer before the turn of try `t`, in ms: from the end of the turn that signed off blocked to
 * this one's first spawn, never negative. Null for a try that is no turn, a turn that answers no blocked sign-off (work sent back from
 * a gate, whose wait was at that gate), and one whose two times are not both known.
 */
export function answerWaitOf(t: { turn?: TurnSpan }): number | null {
  const turn = t.turn;
  if (!turn?.asked || !turn.heldFrom || !turn.spawnedAt) return null;
  return Math.max(0, Date.parse(turn.spawnedAt) - Date.parse(turn.heldFrom));
}
