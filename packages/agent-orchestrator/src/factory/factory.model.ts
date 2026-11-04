/**
 * The factory model: a factory, its name, and a hire of an agent into a workflow's step, as Schemas at the context's door. The Factory
 * door (`factories.store.ts`) checks every factory written through it by `Factory`, its invariants among it; a read is not decoded
 * through it, so a stored name stays readable (decision Q22).
 */
import path from 'node:path';
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { StepName, WorkflowName } from '../record/record.model.ts';
import { AgentName } from '../agents/agents.model.ts';
import { TemplateSource } from '../templates/templates.model.ts';
import { factoryNameRefusal, REVISIONS_POLICIES } from './factory.ts';

/** A factory's name: its file's in the store, minus `.json`, a lowercase slug (`factoryNameRefusal`, over `FACTORY_NAME`). */
export const FactoryName = brandedId('FactoryName', factoryNameRefusal);
export type FactoryName = Id<'FactoryName'>;

/**
 * A folder of the person's machine a factory mounts for every local step of its runs (`Volume`): its path, and whether steps only read it,
 * the runtime's `Mount` field and Kubernetes' `volumeMounts.readOnly`, compose's long-form `read_only`. Marked always.
 */
export const Volume = Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean }).annotate({ identifier: 'Volume' });
export type Volume = typeof Volume.Type;

/** A schedule of a workflow a factory has attached (`Schedule`). */
const Schedule = Schema.Struct({
  cron: Schema.String,
  brief: Schema.String,
  repo: Schema.optional(Schema.String),
  tz: Schema.optional(Schema.String),
  since: Schema.String,
});

/**
 * The template a factory was applied from (`nemia factory apply`), as its file records it under `template`: the template's source, the
 * version its file wants, and the parameters given with `--set`. Its source is read by name alone (Q22), as the file wrote it: a
 * template's whole path, or the name of a builtin template, which `templatePlace` resolves to its folder on each read.
 */
export const AppliedTemplate = Schema.Struct({
  source: TemplateSource.OnRead,
  version: Schema.String,
  params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
}).annotate({ identifier: 'AppliedTemplate' });
export type AppliedTemplate = typeof AppliedTemplate.Type;

/** The workflow a hire's key `<workflow>/<step>` names. */
const workflowOf = (step: string): string => step.slice(0, step.indexOf('/'));

/**
 * A factory as its store reads it (`Factory`): its hires by `<workflow>/<step>`, its schedules by workflow. Its invariants are the
 * door's: it works on one repository at least (`factoryRepos`), mounts no volume that is one of its repositories or named twice, and it hires and schedules only into a workflow it offers — a hire or a
 * schedule into one it has not attached is refused, and a workflow it still hires into or schedules is not detached (`wiringRefusal`,
 * `wiring.ts`, whose contract proves those refusals); this struct's own checks refuse a factory the door writes that breaks them.
 */
export const Factory = Schema.Struct({
  name: FactoryName.OnRead,
  repos: Schema.Array(Schema.String),
  workflows: Schema.Array(WorkflowName.OnRead),
  hires: Schema.Record(Schema.String, AgentName.OnRead),
  schedules: Schema.Record(WorkflowName.OnRead, Schedule),
  instruction: Schema.optional(Schema.Union([Schema.Struct({ path: Schema.String }), Schema.Struct({ store: Schema.Literal(true) })])),
  revisions: Schema.optional(Schema.Literals(REVISIONS_POLICIES)),
  template: Schema.optional(AppliedTemplate),
  tree: Schema.optional(Schema.String),
  volumes: Schema.optional(Schema.Array(Volume)),
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
    Schema.makeFilter((factory) => {
      const at = (factory.volumes ?? []).map((v) => path.resolve(v.path));
      const repos = new Set(factory.repos.map((r) => path.resolve(r)));
      const repo = at.find((v) => repos.has(v));
      if (repo !== undefined)
        return `its volume ${repo} is one of its repositories, which a run mounts already: nemia factory volume rm ${factory.name} ${repo}`;
      const twice = at.find((v, i) => at.indexOf(v) !== i);
      return twice === undefined || `it names the volume ${twice} twice: nemia factory volume rm ${factory.name} ${twice}, then add it once`;
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
export const factoryModel = { entities: [Factory, AppliedTemplate, Hire, Volume], ids: { FactoryName: 'Factory' } } satisfies ErModel;
