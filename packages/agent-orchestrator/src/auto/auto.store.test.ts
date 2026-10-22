/**
 * An agent's rules for `auto` on disk, under a scratch store: a proposal touches the proposal's file alone; the first confirm seeds the
 * person's list with the rule that ships beside the one confirmed, and binds to the words the person read; a drop takes a rule out, the
 * default among them; each refusal by its kind writes nothing; and a proposal is stale once the custom instruction it was read from
 * changes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { scratch } from '../../test/scratch.ts';
import { customInstructionsFile } from '../agents/read.store.ts';
import { DEFAULT_AUTO, ruleWords } from './auto.ts';
import { confirmedFile, confirmRule, digestOf, dropRule, proposedFile, readConfirmed, writeProposed } from './auto.store.ts';
import { autoListOf, proposalOf } from './auto.verb.ts';

const NOW = new Date('2026-10-06T12:00:00.000Z');

/** A proposal of one rule, `tries`, and one word of guidance. */
const PROPOSAL = JSON.stringify({
  rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 20 }],
  guidance: ['be kind to the reviewer'],
});

/** The words the person reads of `tries`, as proposed, and of the default. */
const TRIES = ruleWords(proposalOf(PROPOSAL).rules[0]);
const DEFAULT = ruleWords(DEFAULT_AUTO);

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
  confirmRule(home, 'nemia', 'tries', TRIES, NOW);
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
  confirmRule(home, 'nemia', 'tries', TRIES, NOW);
  assert.deepEqual(readConfirmed(home, 'nemia'), {
    since: NOW.toISOString(),
    rules: [DEFAULT_AUTO, { id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 20, from: 'proposed' }],
  });
  const list = autoListOf(home, 'nemia');
  assert.equal(list.isDefault, false);
  const words = list.rules[1]?.words ?? '';
  for (const fact of ['Try again', 'implement', 'its check passed', 'under $20']) assert.ok(words.includes(fact), words);
});

test('a drop takes a rule out of force, the default among them, and the default is confirmed again by its id', () => {
  const home = proposed();
  dropRule(home, 'nemia', 'default', NOW);
  assert.deepEqual(readConfirmed(home, 'nemia')?.rules, [], 'nothing in force: every answer is asked');
  assert.equal(autoListOf(home, 'nemia').isDefault, false);
  confirmRule(home, 'nemia', 'default', DEFAULT, NOW);
  assert.deepEqual(readConfirmed(home, 'nemia')?.rules, [DEFAULT_AUTO]);
});

test('REFUSED, writing nothing: a rule not proposed, one in force already, a drop of one not in force, a name that is no agent', () => {
  const home = proposed();
  assert.equal(refusal(() => confirmRule(home, 'nemia', 'ghost', TRIES, NOW)).kind, 'Missing');
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  assert.equal(refusal(() => confirmRule(home, 'nemia', 'default', DEFAULT, NOW)).kind, 'Conflict', 'the default is in force already');
  assert.equal(refusal(() => dropRule(home, 'nemia', 'tries', NOW)).kind, 'Missing');
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  confirmRule(home, 'nemia', 'tries', TRIES, NOW);
  const { kind, message } = refusal(() => confirmRule(home, 'nemia', 'tries', TRIES, NOW));
  assert.equal(kind, 'Conflict');
  assert.ok(message.includes('nemia auto drop nemia tries'), message);
  assert.equal(refusal(() => confirmedFile(home, '../x')).kind, 'Invalid');
});

test('REFUSED (Conflict), writing nothing: a confirm of words the rule under its id no longer reads, proposed again since', () => {
  const home = proposed();
  writeProposed(home, 'nemia', {
    at: NOW.toISOString(),
    ...proposalOf(JSON.stringify({ rules: [{ id: 'tries', answer: 'approve', when: [] }], guidance: [] })),
    digest: null,
  });
  const { kind, message } = refusal(() => confirmRule(home, 'nemia', 'tries', TRIES, NOW));
  assert.equal(kind, 'Conflict');
  assert.ok(message.startsWith("nemia's rule tries"), message);
  assert.ok(message.includes('"Approve any step unasked'), message);
  assert.ok(message.includes('nemia auto nemia'), message);
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  assert.equal(refusal(() => confirmRule(home, 'nemia', 'default', `${DEFAULT} `, NOW)).kind, 'Conflict', "the default's own words");
  assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
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
  assert.ok(message.includes('nemia.json: its rules.0.answer'), message);
  assert.ok(message.includes('move it aside'), message);
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
