/**
 * The orchestrator's whole model as one diagram: every context's part (`<context>Model`, beside its glossary), merged in this order.
 * Another layer's entity is a node known by its id alone (the runtime's `TaskId`), drawn by no block of this layer's.
 */
import { erDiagram, type ErModel } from './er.model.ts';
import { recordModel } from '../record/record.model.ts';
import { inboxModel } from '../inbox/inbox.model.ts';
import { factoryModel } from '../factory/factory.model.ts';
import { templateModel } from '../templates/templates.model.ts';
import { placeModel } from '../place/place.model.ts';
import { agentsModel } from '../agents/agents.model.ts';
import { feedModel } from '../feed/feed.model.ts';

/** Each context's part of the model, in the order the diagram draws them. */
const MODELS: readonly ErModel[] = [recordModel, inboxModel, factoryModel, templateModel, placeModel, agentsModel, feedModel];

/** The orchestrator's `erDiagram`, printed between the `diagram:orchestrator-model` markers of `docs/model.md`. */
export const orchestratorModelDiagram = (): string =>
  erDiagram({
    entities: MODELS.flatMap((m) => m.entities),
    ids: Object.assign({}, ...MODELS.map((m) => m.ids)),
  });
