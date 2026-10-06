/**
 * An agent's rules for `auto` on disk, under a scratch store: a proposal touches the proposal's file alone; the first confirm seeds the
 * person's list with the rule that ships beside the one confirmed; a drop takes a rule out, the default among them; each refusal by its
 * kind writes nothing; and a proposal is stale once the custom instruction it was read from changes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { scratch } from '../../test/scratch.ts';
import { customInstructionsFile } from '../agents/custom-file.store.ts';
import { DEFAULT_AUTO } from './auto.ts';
import { confirmedFile, confirmRule, digestOf, dropRule, proposedFile, readConfirmed, writeProposed } from './auto.store.ts';
import { autoListOf, proposalOf } from './auto.verb.ts';

const NOW = new Date('2026-10-06T12:00:00.000Z');

/** A proposal of one rule, `tries`, and one word of guidance. */
const PROPOSAL = JSON.stringify({
  rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 20 }],
  guidance: ['be kind to the reviewer'],
});

/** A scratch store where nemia proposed `PROPOSAL` from no custom instruction. */
function proposed(): string {
  const home = scratch('auto-store-');
  writeProposed(home, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: null });
  return home;
}

/** The kind of what `fn` throws, and its message. */
function refusal(fn: () => unknown): { kind: string; message: string } {
  try {
    fn();
  } catch (err) {
    return { kind: (err as { _tag: string })._tag, message: (err as Error).message };
  }
  return assert.fail('no refusal');
}

test("a proposal writes the agent's file alone; the person's list stays as it was, and the default stays in force", () => {
  const home = proposed();
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  confirmRule(home, 'nemia', 'tries', NOW);
  const before = fs.readFileSync(confirmedFile(home, 'nemia'));
  writeProposed(home, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL.replace('20', '30')), digest: null });
  assert.deepEqual(fs.readFileSync(confirmedFile(home, 'nemia')), before, "the person's list is no proposal's to write");
  assert.equal(path.dirname(proposedFile(home, 'nemia')), path.dirname(confirmedFile(home, 'nemia')));
  const list = autoListOf(proposed(), 'nemia');
  assert.equal(list.isDefault, true);
  assert.deepEqual(
    list.rules.map((r) => r.id),
    ['default'],
  );
  assert.deepEqual(
    list.proposed?.rules.map((r) => [r.id, r.confirmed]),
    [['tries', false]],
    'a proposed rule is no confirmed one',
  );
  assert.deepEqual(list.proposed?.guidance, ['be kind to the reviewer']);
});

test('the first confirm seeds the list with the default beside the rule confirmed, marked by where each came from', () => {
  const home = proposed();
  confirmRule(home, 'nemia', 'tries', NOW);
  assert.deepEqual(readConfirmed(home, 'nemia'), {
    since: NOW.toISOString(),
    rules: [DEFAULT_AUTO, { id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 20, from: 'proposed' }],
  });
  const list = autoListOf(home, 'nemia');
  assert.equal(list.isDefault, false);
  assert.match(list.rules[1]?.words ?? '', /^Try again the step implement unasked when its check passed and the run has cost under \$20/);
});

test('a drop takes a rule out of force, the default among them, and the default is confirmed again by its id', () => {
  const home = proposed();
  dropRule(home, 'nemia', 'default', NOW);
  assert.deepEqual(readConfirmed(home, 'nemia')?.rules, [], 'nothing in force: every answer is asked');
  assert.equal(autoListOf(home, 'nemia').isDefault, false);
  confirmRule(home, 'nemia', 'default', NOW);
  assert.deepEqual(readConfirmed(home, 'nemia')?.rules, [DEFAULT_AUTO]);
});

test('REFUSED, writing nothing: a rule not proposed, one in force already, a drop of one not in force, a name that is no agent', () => {
  const home = proposed();
  assert.equal(refusal(() => confirmRule(home, 'nemia', 'ghost', NOW)).kind, 'Missing');
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  assert.equal(refusal(() => confirmRule(home, 'nemia', 'default', NOW)).kind, 'Conflict', 'the default is in force already');
  assert.equal(refusal(() => dropRule(home, 'nemia', 'tries', NOW)).kind, 'Missing');
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  confirmRule(home, 'nemia', 'tries', NOW);
  const { kind, message } = refusal(() => confirmRule(home, 'nemia', 'tries', NOW));
  assert.equal(kind, 'Conflict');
  assert.match(message, /^the rule tries is in force already for nemia: drop it first with nemia auto drop nemia tries/);
  assert.equal(refusal(() => confirmedFile(home, '../x')).kind, 'Invalid');
});

test("REFUSED (Invalid): a person's list that does not read, naming its file and the fix", () => {
  const home = scratch('auto-store-');
  fs.mkdirSync(path.dirname(confirmedFile(home, 'nemia')), { recursive: true });
  fs.writeFileSync(
    confirmedFile(home, 'nemia'),
    JSON.stringify({ since: NOW.toISOString(), rules: [{ id: 'x', answer: 'merge', when: [] }] }),
  );
  const { kind, message } = refusal(() => readConfirmed(home, 'nemia'));
  assert.equal(kind, 'Invalid');
  assert.match(message, /nemia\.json: its rules\.0\.answer [\s\S]*move it aside, and confirm the rules again/);
});

test('REFUSED (Invalid): a proposal with no JSON, no rules, a condition, an answer or a cap that is none, an id twice', () => {
  const rule = { id: 'r', answer: 'approve', when: ['checked'] };
  for (const words of [
    'not json',
    '{}',
    JSON.stringify({ rules: [{ ...rule, when: ['cheap'] }] }),
    JSON.stringify({ rules: [{ ...rule, answer: 'merge' }] }),
    JSON.stringify({ rules: [{ ...rule, under: -1 }] }),
    JSON.stringify({ rules: [rule, rule] }),
    JSON.stringify({ rules: [{ ...rule, id: 'default' }] }),
    JSON.stringify({ rules: [rule], guidance: [''] }),
  ])
    assert.equal(refusal(() => proposalOf(words)).kind, 'Invalid', words);
});

test('a proposal read from a custom instruction is stale once its words change', () => {
  const home = scratch('auto-store-');
  const file = customInstructionsFile(home, 'nemia');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'approve when all agree\n');
  writeProposed(home, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: digestOf('approve when all agree') });
  assert.equal(autoListOf(home, 'nemia').proposed?.stale, false);
  assert.equal(autoListOf(home, 'nemia').instruction, 'approve when all agree');
  fs.writeFileSync(file, 'approve when all agree, and retry a check once\n');
  assert.equal(autoListOf(home, 'nemia').proposed?.stale, true);
  writeProposed(home, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: null });
  assert.equal(autoListOf(home, 'nemia').proposed?.stale, true, 'proposed from no instruction');
});
