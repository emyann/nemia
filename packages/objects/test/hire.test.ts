/**
 * The Hire (`src/hire.ts`): a step's hire, named `<workflow>.<step>`, and a page of them decoded from JSON and encoded back equal, one
 * missing every optional key read; who fills it and where each setting came from closed words; and the write body as the old route was
 * sent it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Hire, HireList, HireWrite } from 'objects';

const hired = {
  apiVersion: API_VERSION,
  kind: 'Hire',
  metadata: { name: 'build.implement', namespace: 'mill', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'h1' },
  spec: { workflow: 'build', step: 'implement', agent: 'implementer' },
  status: {
    filled: 'factory',
    agent: 'implementer',
    settings: {
      model: { value: 'opus', from: 'agent' },
      effort: { value: 'high', from: 'step' },
      context: { from: 'default' },
      harness: { value: 'claude', from: 'default' },
      permissionMode: { value: 'auto', from: 'agent' },
      allowedTools: { value: ['Read', 'Bash(git log *)'], from: 'agent' },
      disallowedTools: { value: [], from: 'step' },
      skills: { value: ['git'], from: 'agent' },
      mcp: { from: 'default' },
    },
    harnessSettings: { claude: { model: 'opus' } },
  },
} as const;

/** A step nobody fills: no agent in spec or status, no harness settings, no error. */
const unfilled = {
  apiVersion: API_VERSION,
  kind: 'Hire',
  metadata: { name: 'build.review', namespace: 'mill', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'h2' },
  spec: { workflow: 'build', step: 'review' },
  status: {
    filled: 'unfilled',
    settings: Object.fromEntries(
      ['model', 'effort', 'context', 'harness', 'permissionMode', 'allowedTools', 'disallowedTools', 'skills', 'mcp'].map((k) => [
        k,
        { from: 'default' },
      ]),
    ),
  },
};

const clash = { ...unfilled, status: { ...unfilled.status, filled: 'refused', error: 'a.b.c is a.b/c and a/b.c: rename one' } };

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a hire and a page of them decode from JSON and encode back the same, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Hire, hired), hired);
  assert.deepEqual(roundTrip(Hire, unfilled), unfilled);
  assert.deepEqual(roundTrip(Hire, clash), clash);
  const page = { apiVersion: API_VERSION, kind: 'HireList', metadata: { remainingItemCount: 0 }, items: [hired, unfilled] };
  assert.deepEqual(roundTrip(HireList, page), page);
});

test('the write decodes as the old route was sent it', () => {
  assert.deepEqual(roundTrip(HireWrite, { agent: 'reviewer' }), { agent: 'reviewer' });
});

test('REFUSED: a fill origin or a setting origin off its words, a setting left out, a write with no agent, and another kind', () => {
  const decode = Schema.decodeUnknownSync(Hire);
  assert.throws(() => decode({ ...hired, status: { ...hired.status, filled: 'person' } }));
  const settings = { ...hired.status.settings, model: { value: 'opus', from: 'factory' } };
  assert.throws(() => decode({ ...hired, status: { ...hired.status, settings } }));
  const { mcp: _mcp, ...without } = hired.status.settings;
  assert.throws(() => decode({ ...hired, status: { ...hired.status, settings: without } }));
  assert.throws(() => decode({ ...hired, kind: 'Card' }));
  assert.throws(() => Schema.decodeUnknownSync(HireWrite)({}));
});
