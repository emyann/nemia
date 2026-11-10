/** What a step is told, layer by layer, and the parts of its task, as `objects` says them (`StepLayers`, `StepTold`). */
import type { StepTold } from 'objects';

export type { StepLayers } from 'objects';

/** A part of a step's task: its own text, or a run's section, with how the run was handed. */
export type TaskPart = NonNullable<StepTold['taskParts']>[number];
