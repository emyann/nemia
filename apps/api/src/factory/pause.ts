/**
 * The store's pause, each task still finishing under it, and each landing it holds with its merge staged: what the board's bottom bar says
 * (`GET /api/pause`, app.ts); and what a pause at once would stop, with what it costs: what the board's confirm says (`GET /api/pause/now`).
 */
import { COMMANDS, type Interrupt, type Paused } from 'agent-orchestrator';
import type { Engine } from '../store.ts';

/** The package's read of the pause (`pausedRead`), through its entry of the command table, served on the api alone. */
const PAUSED = COMMANDS.find((c) => c.name === 'paused')!;

/** The package's read of what `wf pause --now` would stop (`nowRead`), through its entry of the command table, served on the api alone. */
const PAUSE_NOW = COMMANDS.find((c) => c.name === 'pause now')!;

/** What a pause at once would stop, each task at work but a landing, and the sentence of what an interrupted step costs. */
export type PauseNowRead = { interrupts: Interrupt[]; cost: string };

/**
 * The store's pause or null, each task still finishing under it, and each landing it holds with its merge staged in its checkout
 * (MERGE_HEAD), read through `e`.
 */
export const pauseOf = async (e: Engine['Service']): Promise<Paused> => (await PAUSED.handler(e, {})) as Paused;

/** Each task a pause at once would stop now, read through `e` and never stored, and what an interrupted step costs. */
export const pauseNowOf = async (e: Engine['Service']): Promise<PauseNowRead> => (await PAUSE_NOW.handler(e, {})) as PauseNowRead;
