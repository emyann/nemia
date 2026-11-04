/**
 * The store's pause, each task still finishing under it, and each check it holds, a landing with its merge staged among them: what the
 * board's bottom bar says (`GET /api/pause`, app.ts); and what a pause at once would stop, with what it costs: what the board's confirm
 * says (`GET /api/pause/now`).
 */
import { type Interrupt, type Paused, type PauseRuns } from 'agent-orchestrator';
import type { Engine } from '../store.ts';
import type { Placed } from '../store.ts';
import { commandNamed, runPlaced } from '../store.ts';

/** The package's read of the pause (`pausedRead`), through its entry of the command table, served on the api alone. */
const PAUSED = commandNamed('paused');

/**
 * The package's read of what `nemia pause --now` would stop (`nowRead`), through its entry of the command table, served on the api alone.
 */
const PAUSE_NOW = commandNamed('pause now');

/** What a pause at once would cut, each task at work but a landing, and the sentence of what that costs. */
export type PauseNowRead = { interrupts: Interrupt[]; cost: string };

/**
 * The store's pause or null, with its timeout (`timeoutMs`) where it parks sessions; each task still finishing under it; each session it has
 * parked at a tool call's end (`parked`: its run, its step, and the call it stopped `after` or the call `cut`); each landing it holds with
 * its merge staged in its checkout (MERGE_HEAD); and each other check it holds, read through `e`.
 */
export const pauseOf = async (e: Engine['Service'], at: Placed): Promise<Paused> => (await runPlaced(at, e, PAUSED.handler({}))) as Paused;

/**
 * Each task a pause at once would cut now, read through `e` and never stored, and what that costs. `memo` is the app's
 * memo of what the pause reads of every run (`ReadMemo.records.pause`): with it, the confirm reads no finished run's record.
 */
export const pauseNowOf = async (e: Engine['Service'], at: Placed, memo?: PauseRuns): Promise<PauseNowRead> =>
  (await runPlaced(at, e, PAUSE_NOW.handler({}, undefined, undefined, { records: { pause: memo } }))) as PauseNowRead;
