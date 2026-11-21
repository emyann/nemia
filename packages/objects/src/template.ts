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
export const TemplateText = Schema.Union([
  Schema.String,
  Schema.Struct({ path: Schema.String.annotate({ description: 'A file of the template whose text it is.' }) }),
  Schema.Struct({ param: Schema.String.annotate({ description: 'The name of the parameter whose value it is.' }) }),
]);
export type TemplateText = typeof TemplateText.Type;

/** A value a person gives when the template is applied: its type, what it is for, and the value taken when they give none. */
export const TemplateParameter = Schema.Struct({
  type: Schema.Literals(TEMPLATE_PARAMETER_TYPES).annotate({ description: "The parameter's type." }),
  description: Schema.String.annotate({ description: 'What the parameter is for.' }),
  default: Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Number, Schema.Boolean]).annotate({ description: 'The value taken when the person gives none.' }),
  ),
  whenOrigin: Schema.optionalKey(
    Schema.String.annotate({
      description: "The host whose clones set this boolean true when it is a factory's first writable volume, and any other volume false.",
    }),
  ),
  ask: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: 'Whether the template asks this parameter of a person applying it, drawn open rather than folded; never with whenOrigin.',
    }),
  ),
});
export type TemplateParameter = typeof TemplateParameter.Type;

/** The manifest's spec, as written; a key it does not give is absent. */
export const TemplateSpec = Schema.Struct({
  version: Schema.optionalKey(Schema.String.annotate({ description: "The content's version." })),
  description: Schema.optionalKey(Schema.String.annotate({ description: 'What the template is.' })),
  instruction: Schema.optionalKey(TemplateText.annotate({ description: "The factory's instruction." })),
  rules: Schema.optionalKey(TemplateText.annotate({ description: "The factory's rules." })),
  parameters: Schema.Record(Schema.String, TemplateParameter).annotate({
    description: 'The values a person fills when applying the template, by parameter name.',
  }),
  hires: Schema.Record(Schema.String, Schema.String).annotate({
    description: 'The agent that fills each <workflow>/<step>, by that name.',
  }),
  revisions: Schema.optionalKey(
    Schema.Literals(REVISIONS_POLICIES).annotate({ description: "Whether the factory's runs follow merged revisions." }),
  ),
}).annotate({
  description: "The template's manifest as written: its version, description, instruction, rules, parameters, hires and revisions policy.",
});
export type TemplateSpec = typeof TemplateSpec.Type;

/**
 * What Nemia read of it: where it is read from (`source`), its content's digest (absent where its tree does not read), the names of its
 * workflows, agents and skills, sorted, and each problem that stops it being read or applied, as a person reads one.
 */
export const TemplateStatus = Schema.Struct({
  source: Schema.String.annotate({ description: 'Where the template is read from.' }),
  digest: Schema.optionalKey(Schema.String.annotate({ description: "Its content's digest; absent where its tree does not read." })),
  workflows: Schema.Array(Schema.String).annotate({ description: 'The names of its workflows, sorted.' }),
  agents: Schema.Array(Schema.String).annotate({ description: 'The names of its agents, sorted.' }),
  skills: Schema.Array(Schema.String).annotate({ description: 'The names of its skills, sorted.' }),
  problems: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: 'Each problem that stops it being read or applied, as a person reads one.' }),
  ),
}).annotate({
  description:
    'What Nemia read of the template: where it is read from, its digest, its workflows, agents and skills, and each problem that stops it being read or applied.',
});
export type TemplateStatus = typeof TemplateStatus.Type;

/** A template, as an object. */
export const Template = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Template').annotate({
    description: 'What the object is: a Template, a factory template Nemia builds in, applied to make a factory.',
  }),
  metadata: ObjectMeta,
  spec: TemplateSpec,
  status: TemplateStatus,
});
export type Template = typeof Template.Type;

/** A page of the templates. */
export const TemplateList = listOf('Template', Template);
export type TemplateList = typeof TemplateList.Type;
