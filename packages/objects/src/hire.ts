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
  workflow: Schema.String.annotate({ description: "The step's workflow." }),
  step: Schema.String.annotate({ description: "The step's name." }),
  agent: Schema.optionalKey(
    Schema.String.annotate({ description: 'The agent the factory hires into the step; absent where it hires none.' }),
  ),
}).annotate({ description: 'The step, by its workflow and name, and the agent the factory hires into it, absent where it hires none.' });
export type HireSpec = typeof HireSpec.Type;

/** A setting a session gets: its value (absent where the harness's own default holds) and where it came from. */
export const HireSetting = Schema.Struct({
  value: Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Array(Schema.String)]).annotate({
      description: "The setting's value; absent where the harness's own default holds.",
    }),
  ),
  from: Schema.Literals(SETTING_ORIGINS).annotate({ description: 'Where the setting came from.' }),
});
export type HireSetting = typeof HireSetting.Type;

/** Each setting a session on the step gets, by its name, each with where it came from. */
export const HireSettings = Schema.Struct({
  model: HireSetting.annotate({ description: 'The model a session on the step runs on.' }),
  effort: HireSetting.annotate({ description: 'How hard the harness thinks.' }),
  context: HireSetting.annotate({ description: "The session's context window, in tokens." }),
  harness: HireSetting.annotate({ description: 'What runs the session.' }),
  permissionMode: HireSetting.annotate({ description: "Claude Code's permission mode." }),
  allowedTools: HireSetting.annotate({ description: 'What the session may do without being asked.' }),
  disallowedTools: HireSetting.annotate({ description: 'What the session may not have.' }),
  skills: HireSetting.annotate({ description: 'The skills the session is given.' }),
  mcp: HireSetting.annotate({ description: 'The MCP servers the session loads.' }),
});
export type HireSettings = typeof HireSettings.Type;

/**
 * Who fills the step (`filled`), the agent that does (absent where none), each setting with its origin, the factory's harness settings
 * a session there is given (absent where it names none), and why the hire does not read (`error`, absent where it does).
 */
export const HireStatus = Schema.Struct({
  filled: Schema.Literals(FILL_ORIGINS).annotate({ description: 'Who fills the step.' }),
  agent: Schema.optionalKey(Schema.String.annotate({ description: 'The agent that fills the step; absent where none does.' })),
  settings: HireSettings.annotate({ description: 'Each setting a session on the step gets, with where it came from.' }),
  harnessSettings: Schema.optionalKey(
    HarnessSettings.annotate({ description: "The factory's harness settings a session there is given; absent where it names none." }),
  ),
  error: Schema.optionalKey(Schema.String.annotate({ description: 'Why the hire does not read; absent where it does.' })),
}).annotate({
  description:
    'Who fills the step and the agent that does, each setting a session there gets with where it came from, and why the hire does not read.',
});
export type HireStatus = typeof HireStatus.Type;

/** A step's hire, as an object; a write's answer says what it wrote (`written`). */
export const Hire = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Hire').annotate({
    description: 'What the object is: a Hire, one step a factory offers and the agent that fills it.',
  }),
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
export const HireWrite = Schema.Struct({ agent: Schema.String.annotate({ description: 'The agent to hire into the step.' }) });
export type HireWrite = typeof HireWrite.Type;
