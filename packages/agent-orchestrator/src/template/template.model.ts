/**
 * The template model: a factory template, keyed by where it is read from (`TemplateSource`), and the tree a write of one takes
 * (`TemplateTreeWrite`), as Schemas at the factory context's door. The Template door (`templates.store.ts`) checks every tree written
 * through it by `TemplateTreeWrite`; a source is checked on create and read by name alone (decision Q22), so a factory's file written
 * before the check still reads.
 */
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { WorkflowName } from '../record/record.model.ts';
import { AgentName } from '../agents/agents.model.ts';
import { templateNameRefusal, templateSourceRefusal, treePathRefusal } from './source.ts';
import { pathRefusals } from '../archive/archive.ts';

/** Where a template is read from: a folder that holds its `nemia.yaml`, or an archive `nemia template pack` wrote, by its whole path. */
export const TemplateSource = brandedId('TemplateSource', templateSourceRefusal);
export type TemplateSource = Id<'TemplateSource'>;

/** A template's name, its folder's: a plain string, which no relation names. */
const TemplateName = Schema.String.check(Schema.makeFilter((name: string) => templateNameRefusal(name) ?? true));

/** A parameter a template declares in its manifest (`Parameter`, `layout.ts`). */
const Parameter = Schema.Struct({
  type: Schema.Literals(['string', 'number', 'boolean']),
  description: Schema.String,
  default: Schema.optional(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
});

/**
 * A factory template as its manifest declares it (`nemia.yaml`, `FactorySpec`): read from its source, named by its folder, at a
 * version, with the parameters a factory gives it, the agents it hires into its workflows' steps, and the workflows it holds; and the
 * digest of its content (`contentDigest`), none where a path is longer than an archive holds.
 */
export const Template = Schema.Struct({
  source: TemplateSource.OnRead,
  name: TemplateName,
  version: Schema.String,
  parameters: Schema.Record(Schema.String, Parameter),
  hires: Schema.Record(Schema.String, AgentName.OnRead),
  workflows: Schema.Array(WorkflowName.OnRead),
  digest: Schema.optional(Schema.String),
}).annotate({ identifier: 'Template' });
export type Template = typeof Template.Type;

/** A file of a tree written: its path in the folder, its permission bits, its bytes (`TreeFile`, `archive.ts`). */
const TreeFileWrite = Schema.Struct({
  path: Schema.String.check(Schema.makeFilter((at: string) => treePathRefusal(at) ?? true)),
  mode: Schema.Number,
  bytes: Schema.Uint8Array,
});

/**
 * A template's tree as the door writes it, a folder or an archive: its name a template's (`templateNameRefusal`), each path one in its
 * folder, and each short enough for an archive to hold (`pathRefusals`), so a folder written packs and an archive written unpacks.
 */
export const TemplateTreeWrite = Schema.Struct({ name: TemplateName, files: Schema.Array(TreeFileWrite) }).check(
  Schema.makeFilter((tree) => {
    const [long] = pathRefusals(tree.name, tree.files);
    return long === undefined || long.message;
  }),
);

/** The factory context's template part of the orchestrator's diagram. */
export const templateModel = { entities: [Template], ids: { TemplateSource: 'Template' } } satisfies ErModel;
