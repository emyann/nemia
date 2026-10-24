/**
 * Where a workflow's page is on the board, and each step's under it (apps/api/src/step/step.ts): the api answers it on a run's summary and
 * its page, so a run links to the page of the workflow it was started from without the board reading a folder's path.
 */
import { Schema } from 'effect';
import { decodes } from './decodes.ts';

/**
 * Mirrors `WorkflowPageAddress` in apps/api/src/step/step.ts: where the workflow is read from, its name, and the place it is read in — the
 * factory, null for the default, and the repository, null for the api's own or the factory's only one.
 */
export type WorkflowPageAddress = { from: 'repo' | 'yours'; workflow: string; factory: string | null; repo: string | null };

/** Decodes a `WorkflowPageAddress`. */
export const WorkflowPageAddressSchema = decodes<WorkflowPageAddress>()(
  Schema.Struct({
    from: Schema.Literals(['repo', 'yours']),
    workflow: Schema.String,
    factory: Schema.NullOr(Schema.String),
    repo: Schema.NullOr(Schema.String),
  }),
);
