/**
 * The Template: a factory template Nemia builds in, served as an object no namespace holds (cluster-scoped), by its name. Its `spec` is
 * its manifest's spec as written (`nemia.yaml`): the content's version, the factory's instruction and rules, the parameters a person
 * fills when applying it, who fills each `<workflow>/<step>`, and whether its runs follow merged revisions. Its `status` is what Nemia
 * read of it: where it is read from, its content's digest, the names of its workflows, agents and skills — each served as a
 * sub-resource, in the Schemas a namespace serves them in — and what stops it being read, where something does.
 *
 * Applying it stays a Factory's action. Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { REVISIONS_POLICIES, TEMPLATE_PARAMETER_TYPES } from './words.ts';

/** Text as a template writes it: the words themselves, a file of the template (`{ path }`), or a parameter's value (`{ param }`). */
export const TemplateText = Schema.Union([Schema.String, Schema.Struct({ path: Schema.String }), Schema.Struct({ param: Schema.String })]);
export type TemplateText = typeof TemplateText.Type;

/** A value a person gives when the template is applied: its type, what it is for, and the value taken when they give none. */
export const TemplateParameter = Schema.Struct({
  type: Schema.Literals(TEMPLATE_PARAMETER_TYPES),
  description: Schema.String,
  default: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
});
export type TemplateParameter = typeof TemplateParameter.Type;

/** The manifest's spec, as written; a key it does not give is absent. */
export const TemplateSpec = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  instruction: Schema.optionalKey(TemplateText),
  rules: Schema.optionalKey(TemplateText),
  parameters: Schema.Record(Schema.String, TemplateParameter),
  hires: Schema.Record(Schema.String, Schema.String),
  revisions: Schema.optionalKey(Schema.Literals(REVISIONS_POLICIES)),
});
export type TemplateSpec = typeof TemplateSpec.Type;

/**
 * What Nemia read of it: where it is read from (`source`), its content's digest (absent where its tree does not read), the names of its
 * workflows, agents and skills, sorted, and each problem that stops it being read or applied, as a person reads one.
 */
export const TemplateStatus = Schema.Struct({
  source: Schema.String,
  digest: Schema.optionalKey(Schema.String),
  workflows: Schema.Array(Schema.String),
  agents: Schema.Array(Schema.String),
  skills: Schema.Array(Schema.String),
  problems: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type TemplateStatus = typeof TemplateStatus.Type;

/** A template, as an object. */
export const Template = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Template'),
  metadata: ObjectMeta,
  spec: TemplateSpec,
  status: TemplateStatus,
});
export type Template = typeof Template.Type;

/** A page of the templates. */
export const TemplateList = listOf('Template', Template);
export type TemplateList = typeof TemplateList.Type;
