/** The store's cordon, and each landing it holds with its merge staged: what the board's header says (`GET /api/cordon`, app.ts). */
import { COMMANDS, type Cordoned } from 'agent-orchestrator';
import type { Engine } from '../store.ts';

/** The package's read of the cordon (`cordonRead`), through its entry of the command table, served on the api alone. */
const CORDONED = COMMANDS.find((c) => c.name === 'cordoned')!;

/** The store's cordon or null, and each landing it holds with its merge staged in its checkout (MERGE_HEAD), read through `e`. */
export const cordonOf = async (e: Engine['Service']): Promise<Cordoned> => (await CORDONED.handler(e, {})) as Cordoned;
