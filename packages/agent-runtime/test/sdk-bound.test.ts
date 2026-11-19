/**
 * Each schema the runtime decodes an Agent SDK message with is bound to the SDK's type of that message (`boundTo`,
 * `src/harness/claude/stream.ts`), so a field the SDK renames, drops or retypes fails the typecheck rather than decoding as absent.
 *
 * The refusals are the typecheck's: `_plantedDrift` is never called, `npm run typecheck` reads its lines, and an `@ts-expect-error`
 * over a planted entry that stops erring is the failure.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import type { SDKPermissionDenial, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { boundTo } from '../src/harness/claude/stream.ts';

const Lenient = Schema.Struct({ tool_name: Schema.String, tool_use_id: Schema.optional(Schema.String) });

function _plantedDrift() {
  void boundTo<{ denial: SDKPermissionDenial }>()({ denial: Lenient });
  void boundTo<{ result: SDKResultMessage }>()({
    result: Schema.Struct({ subtype: Schema.optional(Schema.String), total_cost_usd: Schema.optional(Schema.Number) }),
  });
  // @ts-expect-error -- `tool_name_v2` is no key of `SDKPermissionDenial`: a field the SDK renamed or dropped
  void boundTo<{ denial: SDKPermissionDenial }>()({ denial: Schema.Struct({ tool_name_v2: Schema.optional(Schema.String) }) });
  // @ts-expect-error -- the SDK's `tool_input` is a record, wider than the string the schema reads
  void boundTo<{ denial: SDKPermissionDenial }>()({ denial: Schema.Struct({ tool_input: Schema.optional(Schema.String) }) });
  // @ts-expect-error -- `total_cost_usd` is a number in the SDK, wider than the literal the schema reads
  void boundTo<{ result: SDKResultMessage }>()({ result: Schema.Struct({ total_cost_usd: Schema.Literal(0) }) });
  // @ts-expect-error -- `subtype` is a union of words in the SDK, wider than the one the schema reads
  void boundTo<{ result: SDKResultMessage }>()({ result: Schema.Struct({ subtype: Schema.Literal('success') }) });
  // @ts-expect-error -- an entry whose kind names no SDK type
  void boundTo<{ denial: SDKPermissionDenial }>()({ denial: Lenient, other: Lenient });
  // @ts-expect-error -- a kind of the SDK's with no entry
  void boundTo<{ denial: SDKPermissionDenial; result: SDKResultMessage }>()({ denial: Lenient });
}

test('a bound schema is the schema it was given, decoding as before', () => {
  void _plantedDrift;
  const { denial } = boundTo<{ denial: SDKPermissionDenial }>()({ denial: Lenient });
  assert.equal(denial, Lenient);
  assert.deepEqual(Schema.decodeUnknownSync(denial)({ tool_name: 'Bash' }), { tool_name: 'Bash' });
});
