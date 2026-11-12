/**
 * The readiness read, its fixes and the pairing tickets (`src/readiness.ts`, `src/pairing.ts`), and a workflow's needs
 * (`src/workflow.ts`): each decoded as the api answers it, a need without its check, a state, area or phase outside its words refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { Fix, Need, Pairing, PairingClaimed, Readiness, WorkflowSpec } from 'objects';

const need = {
  name: 'gh',
  message: 'the GitHub CLI',
  check: 'command -v gh',
  fixes: [
    { command: 'node "$WF_CARRIED_FILES/needs.ts" install-gh', message: 'install gh', asks: [{ name: 'name', message: 'your name' }] },
  ],
};

const piece = { name: 'gh', area: 'workflow', state: 'missing', message: 'gh is not installed', fixes: [], factory: 'acme' };

test('a workflow carries its needs, a readiness read its pieces, a fix its phase, a pairing its phase', () => {
  assert.deepEqual(Schema.decodeUnknownSync(Need)(need), need);
  const spec = { steps: [], needs: [need] };
  assert.deepEqual(Schema.decodeUnknownSync(WorkflowSpec)(spec), spec);
  const read = { ready: false, pieces: [piece] };
  assert.deepEqual(Schema.decodeUnknownSync(Readiness)(read), read);
  const fix = {
    id: 'f1',
    need: 'gh',
    phase: 'running',
    output: 'https://github.com/login/device\nABCD-1234\n',
    code: '[A-Z0-9]{4}-[A-Z0-9]{4}',
  };
  assert.deepEqual(Schema.decodeUnknownSync(Fix)(fix), fix);
  const pairing = { id: 'p1', client: 'laptop', phase: 'waiting', createdAt: 'a', expiresAt: 'b' };
  assert.deepEqual(Schema.decodeUnknownSync(Pairing)(pairing), pairing);
});

test('REFUSED: a need without its check, a state, an area, a phase outside their words', () => {
  assert.throws(() => Schema.decodeUnknownSync(Need)({ name: 'gh', message: 'm' }), 'a need says its check');
  const read = (p: unknown) => Schema.decodeUnknownSync(Readiness)({ ready: true, pieces: [p] });
  assert.throws(() => read({ ...piece, state: 'broken' }), 'a state is one of NEED_STATES');
  assert.throws(() => read({ ...piece, area: 'laptop' }), 'an area is one of READINESS_AREAS');
  assert.throws(() => Schema.decodeUnknownSync(Fix)({ id: 'f', need: 'n', phase: 'done', output: '' }), 'a phase is one of FIX_PHASES');
  assert.throws(() => Schema.decodeUnknownSync(PairingClaimed)({ phase: 'approved' }), 'a phase is one of TICKET_STATES');
});
