/**
 * The command harness's declaration, with no I/O, so a caller that only reads what a harness can do reads it without loading the runner
 * (`command.ts`).
 */
import type { HarnessDeclaration } from '../declaration.ts';

/**
 * What the command harness declares: the process a task names (`command`, `niceness`, `terminationMessagePath`), an environment laid
 * under it, and a memory limit; it runs no brief, keeps no session open and answers no Engine verb.
 */
export const COMMAND_DECLARATION: HarnessDeclaration = { can: ['commandArgs', 'env', 'memoryLimit'] };
