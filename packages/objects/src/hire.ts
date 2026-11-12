/**
 * The Hire: one step a factory offers, served as an object in the factory's namespace and named `<workflow>.<step>`. Its `spec` is the
 * workflow, the step and the agent the factory hires into it, where it hires one; its `status` who fills the step (`FillOrigin`), the
 * agent that does, and where each setting a session there gets came from (`SettingOrigin`), with the factory's harness settings and why
 * the hire does not read — two steps joined to one name, or both the step and the factory naming an agent.
 *
 * Beside it, the body a write is sent (`HireWrite`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { HarnessSettings } from './factory.ts';
import { FactoryWritten } from './written.ts';
import { FILL_ORIGINS, SETTING_ORIGINS } from './words.ts';

/** The step, by its workflow and its name, and the agent the factory hires into it (absent where it hires none). */
export const HireSpec = Schema.Struct({
  workflow: Schema.String,
  step: Schema.String,
  agent: Schema.optionalKey(Schema.String),
});
export type HireSpec = typeof HireSpec.Type;

/** A setting a session gets: its value (absent where the harness's own default holds) and where it came from. */
export const HireSetting = Schema.Struct({
  value: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Array(Schema.String)])),
  from: Schema.Literals(SETTING_ORIGINS),
});
export type HireSetting = typeof HireSetting.Type;

/** Each setting a session on the step gets, by its name, each with where it came from. */
export const HireSettings = Schema.Struct({
  model: HireSetting,
  effort: HireSetting,
  context: HireSetting,
  harness: HireSetting,
  permissionMode: HireSetting,
  allowedTools: HireSetting,
  disallowedTools: HireSetting,
  skills: HireSetting,
  mcp: HireSetting,
});
export type HireSettings = typeof HireSettings.Type;

/**
 * Who fills the step (`filled`), the agent that does (absent where none), each setting with its origin, the factory's harness settings
 * a session there is given (absent where it names none), and why the hire does not read (`error`, absent where it does).
 */
export const HireStatus = Schema.Struct({
  filled: Schema.Literals(FILL_ORIGINS),
  agent: Schema.optionalKey(Schema.String),
  settings: HireSettings,
  harnessSettings: Schema.optionalKey(HarnessSettings),
  error: Schema.optionalKey(Schema.String),
});
export type HireStatus = typeof HireStatus.Type;

/** A step's hire, as an object; a write's answer says what it wrote (`written`). */
export const Hire = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Hire'),
  metadata: ObjectMeta,
  spec: HireSpec,
  status: HireStatus,
  written: Schema.optionalKey(FactoryWritten),
});
export type Hire = typeof Hire.Type;

/** A page of a factory's hires, one per step it offers. */
export const HireList = listOf('Hire', Hire);
export type HireList = typeof HireList.Type;

/** An agent hired into the step (`PUT …/hires/<workflow>.<step>`). */
export const HireWrite = Schema.Struct({ agent: Schema.String });
export type HireWrite = typeof HireWrite.Type;
