/**
 * Every file of `src` that still calls the stores the Workflow door is over — a folder loaded (`loadWorkflows`), written or removed
 * (`writeWorkflow`, `removeWorkflow`, and their spellings that take a root), or its former spellings named (`formerKeyLines`), a call
 * spread into a list counted as any other — rather than yielding the door (`WorkflowDoor`, `src/workflows/workflows.store.ts`), with how
 * many calls do (`src/workflows/workflows.store.test.ts`). A debt, and nothing else: a program yields the door, whose writes are checked
 * on every layer and whose memory stand-in a test gives it.
 *
 * None is left. S5b moved the board's four workflow entries (`src/workflows/workflows.verb.ts`), and the start, the plan and the revisions
 * pinned; a run's steps then were read through the door (`stepsOf`); and the last readers followed — the inbox's two
 * (`cardRepoRefusal`, `cardGates`), the summaries' (`workflowsOf`, the door run at once), `nemia workflows write` (`draftSteps`) and the
 * start's former-key hints (`Started.hints`). `loadWorkflows` and `writeWorkflow` are the door's own file's, over its files layer, and
 * `src` calls neither.
 *
 * It only shrinks: a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the stores the door is over, comments left out. */
export const WORKFLOW_DOOR_DEBT: Readonly<Record<string, number>> = {};
