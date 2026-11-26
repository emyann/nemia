/**
 * The command harness's declaration, with no I/O, so a caller that only reads what a harness can do reads it without loading the runner
 * (`command.ts`).
 */
import type { HarnessDeclaration } from '../declaration.ts';

/**
 * What the command harness declares: the process a task names (`command`, `niceness`, `terminationMessagePath`), an environment laid
 * under it, and a memory limit; it runs no brief and answers no Engine verb. Filed `restartPolicy: 'Always'` it is a process the runtime
 * starts again, after `RESTART_BACKOFF`, each time it ends with no stop asked (`keepsOpen`): a Pod's `restartPolicy: Always`, with no
 * session to resume.
 */
export const COMMAND_DECLARATION: HarnessDeclaration = { can: ['commandArgs', 'env', 'keepsOpen', 'memoryLimit'] };
