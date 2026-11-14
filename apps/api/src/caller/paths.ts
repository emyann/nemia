/** The paths the caller gate judges by, read by the gate (`caller.ts`) and its contract (`contracts/token-need.contract.ts`). */

/** The MCP port's path: it and every path under it need a standing token, one the person minted. */
export const MCP_PATH = '/mcp';

/**
 * The pairing routes' path: asking for a pairing, claiming it with the secret it was answered, and claiming a first-visit link
 * (`src/pairing/pairing.ts`). A client that holds no token yet reaches them, exposed or not: each judges its own secret, and none
 * answers with the store's data. `/api/pairings`, the person's list and approval, is not under it.
 */
export const PAIR_PATH = '/api/pair';
