import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admissionOf } from './admission.ts';
import { TABLE } from '../command/commands.verb.ts';

/** The state the fixtures read: `r`'s step `gate` awaits approval, `check` failed its check, and no other run is there. */
const waitOf = (runId: string, step: string): string | undefined =>
  runId !== 'r'
    ? `is not there: there is no run ${runId}`
    : step === 'check'
      ? undefined
      : step === 'gate'
        ? 'is awaiting approval'
        : 'is not there';

/** Admission's decision for a shell line, or undefined for none. */
const decided = (command: string, tool = 'Bash') => admissionOf({ tool, input: { command }, cwd: '/w' }, TABLE, waitOf)?.decision;

test('REFUSED to run unasked: an approval, a round and an accept whatever waits, and a retry of what waits on the person or raises a cap, each asked', () => {
  for (const line of [
    'nemia approve r gate',
    'nemia approve r check',
    'nemia accept r check',
    'nemia round r',
    'nemia accept r',
    'nemia retry r gate --message "go"',
    'nemia retry r check --budget 5',
    'nemia retry r check --budget=5',
    'nemia retry q check --recheck',
    'nemia retry r',
  ])
    assert.equal(decided(line), 'ask', line);
});

test('a retry of a step that waits on no one, a read and her own writes get no answer, and meet her static rules', () => {
  for (const line of ['nemia retry r check --recheck', 'nemia retry r check && nemia tick', 'nemia show r', 'nemia hold r', 'ls'])
    assert.equal(decided(line), undefined, line);
  assert.equal(decided('nemia approve r gate', 'Read'), undefined, 'no shell line');
});

test('REFUSED to pass unseen: an answer wrapped in a shell, behind a path, an alias or another command on the line', () => {
  for (const line of [
    "bash -c 'nemia approve r gate'",
    '/usr/local/bin/nemia approve r gate',
    'wf approve r gate',
    'timeout 30 nemia approve r gate',
    'nemia show r; nemia approve r gate',
    'echo $(nemia round r)',
    'WF_ROOT=/s nemia retry r gate',
  ])
    assert.equal(decided(line), 'ask', line);
});

test('the person reads why: the line, and what it answers', () => {
  const answer = (command: string) => admissionOf({ tool: 'Bash', input: { command }, cwd: '/w' }, TABLE, waitOf)?.reason;
  assert.equal(answer('nemia retry r gate'), 'nemia retry r gate answers what waits on you: gate of r is awaiting approval.');
  assert.equal(answer('nemia approve r gate'), 'nemia approve r gate answers what waits on you: it is yours to give.');
  assert.equal(answer('nemia retry r check --budget 5'), "nemia retry r check --budget 5 raises a step's cap: a budget is yours to raise.");
});

test('the class decides, not the name: a table that classes approve as hers lets it through', () => {
  const table = TABLE.map((c) => (c.name === 'approve' ? { ...c, nemia: 'hers' as const } : c));
  assert.equal(admissionOf({ tool: 'Bash', input: { command: 'nemia approve r gate' }, cwd: '/w' }, table, waitOf), undefined);
});
