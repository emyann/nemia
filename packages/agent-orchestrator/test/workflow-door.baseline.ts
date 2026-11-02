/**
 * Every file of `src` that still calls the stores the Workflow door is over — a folder loaded (`loadWorkflows`), written or removed
 * (`writeWorkflow`, `removeWorkflow`, and their spellings that take a root), its former spellings named (`formerKeyLines`), or its
 * agents and skills found off the disk (`foundAt`, called by the folder's own stores alone) — rather than yielding the door
 * (`WorkflowDoor`, `src/workflows/workflows.store.ts`), with how many calls do (`src/workflows/workflows.store.test.ts`). A debt, and
 * nothing else: a program yields the door, whose writes are checked on every layer and whose memory stand-in a test gives it; a call
 * left on the seam is a synchronous caller S5b did not convert — the inbox, the writers and the board's folder read; a run's steps are
 * read through the door (`stepsOf`, `src/steps/steps.verb.ts`). S5b moved the
 * board's four workflow entries (`src/workflows/workflows.verb.ts`); the start (and so the plan) and the revisions pinned then read a
 * folder through the door.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the stores the door is over, comments left out. */
export const WORKFLOW_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/cli/writers.ts': 1,
  'src/inbox/inbox.store.ts': 1,
  'src/inbox/inbox.verb.ts': 1,
  'src/summary/reads.verb.ts': 1,
};
