/**
 * Each schema the runtime decodes an Agent SDK value with is bound to the SDK's type of that value (`reading(…).of<Sdk>()`,
 * `src/harness/claude/stream.ts`), so a field the SDK renames, drops or retypes fails the typecheck rather than decoding as absent.
 *
 * The refusals are the typecheck's: `_plantedDrift` is never called, `npm run typecheck` reads its lines, and an `@ts-expect-error`
 * over a planted binding that stops erring is the failure.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import type { SDKPartialAssistantMessage, SDKPermissionDenial, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { reading } from '../src/harness/claude/stream.ts';

const Lenient = Schema.Struct({ tool_name: Schema.String, tool_use_id: Schema.optional(Schema.String) });

type SdkDelta = Extract<SDKPartialAssistantMessage['event'], { type: 'content_block_delta' }>['delta'];

function _plantedDrift() {
  void reading(Lenient).of<SDKPermissionDenial>();
  void reading(
    Schema.Struct({ subtype: Schema.optional(Schema.String), total_cost_usd: Schema.optional(Schema.Number) }),
  ).of<SDKResultMessage>();
  void reading(Schema.Struct({ type: Schema.Literal('text_delta'), text: Schema.String })).of<Extract<SdkDelta, { type: 'text_delta' }>>();
  // @ts-expect-error -- `tool_name_v2` is no key of `SDKPermissionDenial`: a field the SDK renamed or dropped
  void reading(Schema.Struct({ tool_name_v2: Schema.optional(Schema.String) })).of<SDKPermissionDenial>();
  // @ts-expect-error -- the SDK's `tool_input` is a record, wider than the string the schema reads
  void reading(Schema.Struct({ tool_input: Schema.optional(Schema.String) })).of<SDKPermissionDenial>();
  // @ts-expect-error -- `total_cost_usd` is a number in the SDK, wider than the literal the schema reads
  void reading(Schema.Struct({ total_cost_usd: Schema.Literal(0) })).of<SDKResultMessage>();
  // @ts-expect-error -- `subtype` is a union of words in the SDK, wider than the one the schema reads
  void reading(Schema.Struct({ subtype: Schema.Literal('success') })).of<SDKResultMessage>();
  void reading(
    Schema.Struct({ type: Schema.Literal('text_delta'), text_v2: Schema.optional(Schema.String) }),
    // @ts-expect-error -- `text_v2` is no key of the SDK's `text_delta`, a member of a union a catch-all would take whole
  ).of<Extract<SdkDelta, { type: 'text_delta' }>>();
}

test('a bound schema is the schema it was given, decoding as before', () => {
  void _plantedDrift;
  const denial = reading(Lenient).of<SDKPermissionDenial>();
  assert.equal(denial, Lenient);
  assert.deepEqual(Schema.decodeUnknownSync(denial)({ tool_name: 'Bash' }), { tool_name: 'Bash' });
});
