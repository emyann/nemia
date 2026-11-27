/**
 * The decision of a process that wants to refresh a held MCP token while another holds the token's refresh lock (agent-runtime,
 * src/harness/mcp-token.ts, `refreshLockOf`). A provider that rotates its refresh tokens takes each one once, and GitHub's refresh
 * ends the old access token and the old refresh token both, so two refreshes of one token at once leave one process with a refusal
 * that would drop the token for every session. So a refresh runs under a lock file beside the token, taken whole or not at all, and a
 * process that finds it taken decides here what to do.
 *
 * - `refreshLockOf`: given what the lock file says of its holder and how long this process has waited on it, whether it waits on
 *   (`wait`), breaks a lock its holder left behind (`break`), or stops waiting and hands the token it read as it stands (`stand`).
 *
 * The I/O around it — the lock taken by an exclusive create, its holder read and judged alive by its pid and start, the pause between
 * two looks — is the caller's.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What the lock file says of the process that holds it: a process still running, the one that wrote it (`live`); one gone, or a pid
 * another process has taken since (`gone`); or nothing a reader can read, a file created and not yet written, or written by a process
 * that died between the two (`unreadable`).
 */
export type LockHolder = 'live' | 'gone' | 'unreadable';

/** What the process that found the lock taken does: looks again (`wait`), removes it (`break`), or hands the token as read (`stand`). */
export type LockStep = 'wait' | 'break' | 'stand';

/** The largest wait or bound, in whole milliseconds, a clock gives: half of 2^53, so that no sum of two rounds. */
const CLOCK_BOUND = 2 ** 52;

const refreshLockSpec = spec<(holder: LockHolder, waitedMs: number, boundMs: number) => LockStep>({
  requires: ({ input: [, waitedMs, boundMs] }) =>
    Number.isInteger(waitedMs) &&
    waitedMs >= 0 &&
    waitedMs <= CLOCK_BOUND &&
    Number.isInteger(boundMs) &&
    boundMs >= 0 &&
    boundMs <= CLOCK_BOUND,
  ensures: {
    aGoneHolderIsBroken: {
      description: 'A lock whose holder is gone is broken at once, so a refresh that died never stops the next one',
      condition: ({ input: [holder], output }) => holder !== 'gone' || output === 'break',
    },
    aLiveHolderIsWaitedForWithinTheBound: {
      description: 'A refresh another running process is making is waited for, within the bound, and never made twice',
      condition: ({ input: [holder, waitedMs, boundMs], output }) => holder !== 'live' || waitedMs >= boundMs || output === 'wait',
    },
    pastTheBoundTheTokenStandsAsRead: {
      description: 'Past the bound, a process waiting on a running refresh hands the token as it read it, rather than refresh it again',
      condition: ({ input: [holder, waitedMs, boundMs], output }) => holder !== 'live' || waitedMs < boundMs || output === 'stand',
    },
    anUnreadableLockIsWaitedForWithinTheBound: {
      description: 'A lock not yet written is waited for within the bound, since its holder may be writing it',
      condition: ({ input: [holder, waitedMs, boundMs], output }) => holder !== 'unreadable' || waitedMs >= boundMs || output === 'wait',
    },
    anUnreadableLockIsBrokenPastTheBound: {
      description: 'A lock still unreadable past the bound was left by a process that died writing it, and is broken',
      condition: ({ input: [holder, waitedMs, boundMs], output }) => holder !== 'unreadable' || waitedMs < boundMs || output === 'break',
    },
  },
});
export type RefreshLockOf = Implementation<typeof refreshLockSpec>;
