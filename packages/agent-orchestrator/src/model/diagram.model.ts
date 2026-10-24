/**
 * The orchestrator's whole model as one diagram: every context's part (`<context>Model`, beside its glossary), merged in this order.
 * Another layer's entity is a node known by its id alone (the runtime's `TaskId`), drawn by no block of this layer's.
 */
import { erDiagram, type ErModel } from './er.model.ts';
import { recordModel } from '../record/record.model.ts';

/** Each context's part of the model, in the order the diagram draws them. */
const MODELS: readonly ErModel[] = [recordModel];

/** The orchestrator's `erDiagram`, printed between the `diagram:orchestrator-model` markers of `docs/model.md`. */
export const orchestratorModelDiagram = (): string =>
  erDiagram({
    entities: MODELS.flatMap((m) => m.entities),
    ids: Object.assign({}, ...MODELS.map((m) => m.ids)),
  });
