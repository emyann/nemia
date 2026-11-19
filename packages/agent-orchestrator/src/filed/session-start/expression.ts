/**
 * The expression a step's rule names its workspace by, and its expansion at filing: what `contracts/session-home.contract.ts` takes
 * of it on trust (`expandedPure`), its laws held on the real function by `expression.test.ts`.
 */

/** The expression a step's rule names its workspace by, expanded at filing. */
export const WORKSPACE_EXPRESSION = '${{ workspace }}';

/**
 * `text` with every `${{ workspace }}` in it replaced by the step's workspace.
 * @param text A rule as the step's fence writes it.
 * @param workspace The step's workspace, absolute.
 */
export const expandedIn = (text: string, workspace: string): string => text.split(WORKSPACE_EXPRESSION).join(workspace);
