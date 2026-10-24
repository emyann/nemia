/**
 * Run-core's model: a run, its steps, their tries and rounds, and its landing, as Schemas at the context's door (decisions Q3–Q6).
 * A declaration in S1: no read path decodes through it yet; the Run door (S2) will.
 */
import { foreignId, brandedCount, brandedId, type Count, type Id } from '../model/brand.model.ts';
import { idRefusal } from '../forget/forget.ts';
import { stepNameRefusal } from '../folder/folder.ts';
import { workflowNameRefusal } from '../factory/factory.ts';

/** A run's id, as `runId` mints it (`record.store.ts`) and `idRefusal` takes it. */
export const RunId = brandedId('RunId', (value) => idRefusal(value));
export type RunId = Id<'RunId'>;

/** A step's name: its file's name in its workflow's folder, without `.md` (`stepNameRefusal`). */
export const StepName = brandedId('StepName', stepNameRefusal);
export type StepName = Id<'StepName'>;

/** A workflow's name: its folder's (`workflowNameRefusal`). */
export const WorkflowName = brandedId('WorkflowName', workflowNameRefusal);
export type WorkflowName = Id<'WorkflowName'>;

/** A try's number within its step, from 1. */
export const TryNumber = brandedCount('TryNumber', 1);
export type TryNumber = Count<'TryNumber'>;

/** The runtime's task a try ran as: the runtime's id, held by key alone (only `runtime-client.ts` imports the runtime). */
export const TaskId = foreignId('TaskId');
export type TaskId = Id<'TaskId'>;
