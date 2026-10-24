/**
 * The factory model: a factory, its name, and a hire of an agent into a workflow's step, as Schemas at the context's door. A declaration
 * in S1: no read path decodes through it.
 */
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { StepName, WorkflowName } from '../record/record.model.ts';
import { AgentName } from '../agents/agents.model.ts';
import { factoryNameRefusal } from './factory.ts';

/** A factory's name: its file's in the store, minus `.json`, a lowercase slug (`factoryNameRefusal`, over `FACTORY_NAME`). */
export const FactoryName = brandedId('FactoryName', factoryNameRefusal);
export type FactoryName = Id<'FactoryName'>;

/** A schedule of a workflow a factory has attached (`Schedule`). */
const Schedule = Schema.Struct({
  cron: Schema.String,
  brief: Schema.String,
  repo: Schema.optional(Schema.String),
  tz: Schema.optional(Schema.String),
  since: Schema.String,
});

/** The workflow a hire's key `<workflow>/<step>` names. */
const workflowOf = (step: string): string => step.slice(0, step.indexOf('/'));

/**
 * A factory as its store reads it (`Factory`): its hires by `<workflow>/<step>`, its schedules by workflow. Its invariants are its
 * writers': it works on one repository at least (`factoryRepos`, factory.store.ts:176), and it hires and schedules only into a workflow
 * it offers — a hire into one it has not attached is refused (factory.store.ts:455), a schedule too (factory.store.ts:568), and a
 * workflow it still hires into or schedules is not detached (factory.store.ts:524, :528).
 */
export const Factory = Schema.Struct({
  name: FactoryName.OnRead,
  repos: Schema.Array(Schema.String),
  workflows: Schema.Array(WorkflowName.OnRead),
  hires: Schema.Record(Schema.String, AgentName.OnRead),
  schedules: Schema.Record(WorkflowName.OnRead, Schedule),
  instruction: Schema.optional(Schema.Union([Schema.Struct({ path: Schema.String }), Schema.Struct({ store: Schema.Literal(true) })])),
  template: Schema.optional(
    Schema.Struct({
      source: Schema.String,
      version: Schema.String,
      params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
    }),
  ),
  tree: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter((factory) => factory.repos.length > 0 || 'a factory works on no repository: nemia factory add <name> --repo <path>'),
    Schema.makeFilter((factory) => {
      const offered: ReadonlyArray<string> = factory.workflows;
      const unoffered = [...Object.keys(factory.hires).map(workflowOf), ...Object.keys(factory.schedules)].find(
        (workflow) => !offered.includes(workflow),
      );
      return unoffered === undefined || `it hires into or schedules ${unoffered}, which it does not offer: nemia factory attach it`;
    }),
  )
  .annotate({ identifier: 'Factory' });
export type Factory = typeof Factory.Type;

/** A factory's hire of an agent into one step of a workflow (`nemia factory hire`): a key `<workflow>/<step>` of its hires, split. */
export const Hire = Schema.Struct({
  factory: FactoryName.OnRead,
  workflow: WorkflowName.OnRead,
  step: StepName.OnRead,
  agent: AgentName.OnRead,
}).annotate({ identifier: 'Hire' });
export type Hire = typeof Hire.Type;

/** The factory context's part of the orchestrator's diagram. */
export const factoryModel = { entities: [Factory, Hire], ids: { FactoryName: 'Factory' } } satisfies ErModel;
