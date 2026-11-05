/**
 * Whether the store's pause has outlived the process that holds it (agent-orchestrator, src/pause/pause.ts): `pauseLapsed`, judged on
 * each daemon pass (`liftLapsedPause`, pause/pause.store.ts) from what the process table says of the pause's holder (`identify`,
 * daemon/daemon.store.ts), never from anything a pass remembers. A take-over (`nemia service restart`, `nemia upgrade`, `nemia service
 * install --take-over`) writes its own process into the pause it puts, so the pause ends with its command however that command ends; a
 * person's `nemia pause` writes none, and stands until `nemia resume`.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Identity } from '../src/daemon/daemon.ts';

/** The process the pause names runs no more: its pid is dead, or is another process's now. */
const holderGone = (identity: Identity): boolean => identity === 'gone' || identity === 'other';

/**
 * `holder` is what the process table says of the process the pause's file names (`Identity`), or null for a pause that names none: a
 * person's, or one put before a pause named its holder.
 */
const pauseLapsedSpec = spec<(holder: Identity | null) => boolean>({
  ensures: {
    aPersonsPauseNeverLapses: {
      description: 'A pause no process holds, a person’s, never lapses: only nemia resume lifts it',
      condition: ({ input: [holder], output }) => holder !== null || output === false,
    },
    lapsesExactlyWhenItsHolderIsGone: {
      description:
        'A pause a process holds lapses exactly when the process table says that process is gone, or its pid is another process’s now',
      condition: ({ input: [holder], output }) => holder === null || output === holderGone(holder),
    },
    anUnconfirmedHolderKeepsIt: {
      description:
        'A holder alive whose start cannot be compared keeps its pause, as it keeps the lease: a store paused longer is the lesser mistake',
      condition: ({ input: [holder], output }) => holder !== 'unknown' || output === false,
    },
  },
});
export type PauseLapsed = Implementation<typeof pauseLapsedSpec>;
