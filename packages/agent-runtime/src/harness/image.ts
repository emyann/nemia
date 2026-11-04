/**
 * The code a runner's process runs, as that process sees it: a Pod's container image (`containerStatuses[].image`), which the
 * runtime records on each attempt (`Sighting.image`) so that the layer above can say which release a session runs on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The real folder of this runtime package (`packages/agent-runtime`), the folder `WORKER` and `CLAUDE_JOB_BIN` are found from: through
 * `fs.realpathSync`, so a process reached through a link — a release's `current` pointer, a workspace's `node_modules` — names the
 * folder it really runs from. The spawn writes it on a job's run file and every holder of a long-lived session on that session's.
 */
export const IMAGE = fs.realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
