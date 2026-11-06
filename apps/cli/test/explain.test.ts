/**
 * `nemia explain` against a served store (`served.ts`): a resource's kind, version, scope and verbs read off discovery, its fields off the
 * package's own OpenAPI document — the Card's `spec` and `status`, `spec.from` with the meaning the package gives it
 * (`CARD_KEY_MEANINGS`) — and a path the kind has no field at refused exit 2, naming the fields there are.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_KEY_MEANINGS } from 'objects';
import { fieldRowsOf } from '../src/objects/explain.ts';
import { servedStore } from './served.ts';

const store = await servedStore('nemia-cli-explain-', () => {});
test.after(() => store.stop());

test('`nemia explain cards` says the kind, its version, scope and verbs, and lists spec and status among its fields', async () => {
  const said = await store.nemia(['explain', 'cards']);
  assert.equal(said.code, 0, said.err);
  assert.match(said.out, /^KIND: +Card$/m);
  assert.match(said.out, /^VERSION: +nemia\/v1$/m);
  assert.match(said.out, /^RESOURCE: +cards \(namespaced; verbs: [a-z, ]*\blist\b/m);
  assert.match(said.out, /^ {2}spec\t<Object>/m);
  assert.match(said.out, /^ {2}status\t<Object>/m);
});

test('`nemia explain card.spec.from` prints the field, its type and the meaning the package gives the key', async () => {
  const said = await store.nemia(['explain', 'card.spec.from']);
  assert.equal(said.code, 0, said.err);
  assert.match(said.out, /^FIELD: +from <\[\]string>$/m);
  assert.ok(said.out.includes(CARD_KEY_MEANINGS.from), said.out);
});

test('REFUSED: `nemia explain cards.spec.nope` exits 2 naming the fields there are and the command that lists them', async () => {
  const refused = await store.nemia(['explain', 'cards.spec.nope']);
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /\bfrom\b/);
  assert.match(refused.err, /nemia explain card\.spec/);
  assert.equal(refused.out, '');
});

test('the rows flatten through arrays and $ref: every kind has fields, and a workflow step’s keys are under spec.steps', () => {
  assert.ok(fieldRowsOf('Run').some((r) => r.path === 'status'));
  assert.ok(fieldRowsOf('Workflow').some((r) => r.path === 'spec.steps.keys' && r.parent === 'spec.steps'));
  for (const kind of [
    'Run',
    'Card',
    'Factory',
    'McpServer',
    'Schedule',
    'Hire',
    'Volume',
    'Workflow',
    'Agent',
    'Skill',
    'Template',
    'Subscription',
    'Event',
  ] as const)
    assert.ok(
      fieldRowsOf(kind).some((r) => r.path === 'metadata.name'),
      kind,
    );
});

test('`nemia explain --help` is its own; `--local` is refused exit 2 naming `nemia service status`', async () => {
  const help = await store.nemia(['explain', '--help']);
  assert.equal(help.code, 0, help.err);
  assert.match(help.out, /^nemia explain <resource>/);
  const local = await store.nemia(['explain', 'cards', '--local']);
  assert.equal(local.code, 2, local.err);
  assert.match(local.err, /nemia service status/);
});
