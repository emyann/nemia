/**
 * The store's pause, each task still finishing under it, and each landing it holds with its merge staged: what the board's bottom bar says
 * (`GET /api/pause`, app.ts).
 */
import { COMMANDS, type Paused } from 'agent-orchestrator';
import type { Engine } from '../store.ts';

/** The package's read of the pause (`pausedRead`), through its entry of the command table, served on the api alone. */
const PAUSED = COMMANDS.find((c) => c.name === 'paused')!;

/**
 * The store's pause or null, each task still finishing under it, and each landing it holds with its merge staged in its checkout
 * (MERGE_HEAD), read through `e`.
 */
export const pauseOf = async (e: Engine['Service']): Promise<Paused> => (await PAUSED.handler(e, {})) as Paused;
