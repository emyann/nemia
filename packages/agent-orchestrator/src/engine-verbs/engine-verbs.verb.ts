/**
 * Every verb of the runtime's engine, once (`ENGINE_VERBS`): the phase of the pass's meter it is counted in, and what it changes of a
 * task a wrapper kept a read of. Total over the engine's verbs (`satisfies Record<EngineVerb, …>`), so a verb the runtime adds fails the
 * typecheck here until it is placed, rather than being read by each table as whatever its default was. The views' wrappers
 * (`views/views.verb.ts`) and the meter (`meter/meter.verb.ts`) read it.
 */
import type { Engine } from '../runtime-client.ts';
import type { Phase } from '../meter/index.ts';

/** A verb of the runtime's engine, by its name. */
export type EngineVerb = keyof Engine;

/**
 * What a verb changes of a task: `none`, it changes none; `pass`, it is a pass of the runtime, which changes none a call's reads name, yet
 * after which a command reads every task afresh; `all`, it may change any, so a wrapper drops every read it kept; or the tasks its
 * arguments name.
 */
export type Changes = 'none' | 'pass' | 'all' | ((args: unknown[]) => readonly unknown[]);

/** What a verb is: the phase it is counted in, where the meter counts it, and what it changes (`Changes`). */
export type VerbKind = { readonly phase?: Phase; readonly changes: Changes };

/** The task a verb's first argument names. */
const first = ([id]: unknown[]): readonly unknown[] => [id];

/** The tasks a verb's first argument lists. */
const listed = ([ids]: unknown[]): readonly unknown[] => (Array.isArray(ids) ? ids : []);

/** Every verb of the engine: its phase (a journal read is `journals`, a verb that changes a task `act`) and what it changes. */
export const ENGINE_VERBS = {
  file: { phase: 'act', changes: ([spec]) => [(spec as { id?: unknown } | undefined)?.id] },
  tick: { phase: 'runtime', changes: 'pass' },
  admit: { phase: 'act', changes: listed },
  view: { phase: 'journals', changes: 'none' },
  path: { changes: 'none' },
  list: { phase: 'journals', changes: 'none' },
  stop: { phase: 'act', changes: first },
  logs: { phase: 'journals', changes: 'none' },
  transcript: { phase: 'journals', changes: 'none' },
  output: { phase: 'journals', changes: 'none' },
  follow: { changes: 'all' },
  say: { phase: 'act', changes: first },
  interrupt: { changes: 'all' },
  answerAsk: { changes: 'all' },
  quota: { changes: 'all' },
  mcpState: { phase: 'runtime', changes: 'none' },
  mcpSignIn: { phase: 'runtime', changes: 'none' },
  mcpSignInState: { phase: 'runtime', changes: 'none' },
  mcpSignOut: { phase: 'runtime', changes: 'none' },
  answer: { phase: 'act', changes: first },
  close: { phase: 'act', changes: first },
  sweep: { phase: 'journals', changes: 'none' },
  removeBody: { phase: 'act', changes: 'none' },
  forget: { phase: 'act', changes: listed },
  kept: { phase: 'journals', changes: 'none' },
  compact: { changes: 'all' },
  feed: { phase: 'journals', changes: 'none' },
  watch: { changes: 'none' },
  io: { changes: 'none' },
  tallied: { changes: 'none' },
  hold: { changes: 'all' },
  drain: { phase: 'act', changes: 'none' },
  drainSessions: { phase: 'act', changes: 'none' },
  up: { changes: 'pass' },
} as const satisfies Record<EngineVerb, VerbKind>;

/** The table's verb `key`, or undefined for a key that is no verb of the engine. */
export const verbOf = (key: string): VerbKind | undefined =>
  Object.hasOwn(ENGINE_VERBS, key) ? (ENGINE_VERBS as Record<string, VerbKind>)[key] : undefined;
