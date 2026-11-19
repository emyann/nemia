/**
 * The spellings a session's start is filed with, shared by the code and `contracts/session-home.contract.ts`, which imports them: the
 * expression a step's rule names its workspace by and its expansion, which the contract takes on trust (`expandedPure`, its laws held
 * by `spelled.test.ts`), the deny that holds a folder read-only, and the exclude that skips a folder's memory files. Each is joined
 * with `+`, which the verifier reads, where a template string is an unknown string of its parts.
 */

/** The expression a step's rule names its workspace by, expanded at filing. */
export const WORKSPACE_EXPRESSION = '${{ workspace }}';

/**
 * `text` with every `${{ workspace }}` in it replaced by the step's workspace.
 * @param text A rule as the step's fence writes it.
 * @param workspace The step's workspace, absolute.
 */
export const expandedIn = (text: string, workspace: string) => text.split(WORKSPACE_EXPRESSION).join(workspace);

/**
 * The deny that holds a folder read-only, spelled as the runtime spells a read-only mount's: `Edit(//<path>/**)`.
 * @param folder The folder denied, absolute.
 */
export const editDenied = (folder: string) => 'Edit(/' + folder + '/**)';

/**
 * The exclude that skips every memory file under a folder.
 * @param folder The folder skipped, absolute.
 */
export const everyFileUnder = (folder: string) => folder + '/**';
