/**
 * A send under way, as the registry records it: the lease its entry holds while the send is made, measured on the clock seam
 * (`core/clock.ts`), and whether the process making it lives.
 */
import { elapsedMs, type Instant, type Monotonic } from '../core/clock.ts';

/** What the lease reads of a registry entry: when it was sent, its Task once answered, and the send's monotonic stamp. */
export type Leased = { sentAt: string; taskId?: string; sending?: { mono?: Monotonic } };

/**
 * Whether the send of `e` still holds its lease at `now`: under way, with no Task yet, and sent less than `sendMs` ago —
 * on the monotonic clock when `now` and the send's stamp share a boot, so a stepped wall clock neither ends it early nor
 * keeps it past its bound; on the wall clock from `sentAt` for an entry with no stamp or one of another boot.
 */
export const sendHeld = (e: Leased, now: Instant, sendMs: number): boolean =>
  e.sending !== undefined &&
  e.taskId === undefined &&
  elapsedMs({ at: Date.parse(e.sentAt), ...(e.sending.mono ? { mono: e.sending.mono } : {}) }, now) < sendMs;

/** Whether a process lives: one this user cannot signal lives too. */
export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};
