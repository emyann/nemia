/**
 * A remote A2A agent's declaration, with no I/O, so a caller that only reads what a harness can do reads it without loading the client
 * (`remote.ts`).
 */
import type { HarnessDeclaration } from '../harness/declaration.ts';

/**
 * What a remote A2A agent declares: nothing. It takes no key of a task's config (`remoteRefuses`), keeps no session open past its turn,
 * holds no process or cgroup of this host's, and answers no Engine verb: it runs as its operator configured it.
 */
export const REMOTE_DECLARATION: HarnessDeclaration = { can: [] };
