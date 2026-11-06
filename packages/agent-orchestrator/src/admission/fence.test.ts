import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSIGNED, nemiaFence, widened } from './fence.ts';
import { PROPOSED_INSTEAD } from './class.ts';
import type { CommandClass } from './class.ts';
import { TABLE as COMMANDS } from '../command/commands.verb.ts';

/** A fixture table, one command of each class. */
const TABLE: { name: string; class: CommandClass }[] = [
  { name: 'ls', class: 'read' },
  { name: 'hold', class: 'act' },
  { name: 'approve', class: 'answer' },
  { name: 'cancel', class: 'ask' },
  { name: 'tick', class: 'none' },
  { name: 'level', class: { bare: 'read', sets: 'ask', setsBy: ['manual'] } },
  { name: 'agents custom', class: { bare: 'read', sets: 'ask', setsBy: ['--clear'], readsBy: ['--repo'] } },
];

test('her fence is derived from the classes: reads, her writes and answers run unasked, a prompt asks, out is denied, a setter asks set', () => {
  assert.deepEqual(nemiaFence(TABLE), {
    allow: [
      'Bash(nemia ls)',
      'Bash(nemia ls:*)',
      'Bash(nemia hold)',
      'Bash(nemia hold:*)',
      'Bash(nemia approve)',
      'Bash(nemia approve:*)',
      'Bash(nemia level)',
      'Bash(nemia level:*)',
      'Bash(nemia agents custom)',
      'Bash(nemia agents custom:*)',
      'Bash(nemia propose)',
      'Bash(nemia propose:*)',
      'Bash(nemia proposals approve)',
      'Bash(nemia proposals approve:*)',
      'Bash(nemia proposals decline)',
      'Bash(nemia proposals decline:*)',
    ],
    ask: ['Bash(nemia cancel:*)', 'Bash(nemia level manual:*)', 'Bash(nemia agents custom *--clear*)'],
    deny: ['Bash(nemia tick:*)', ASSIGNED],
  });
});

test('REFUSED to run unasked: a command reclassed as a prompt asks, and one reclassed out is denied, by its class alone', () => {
  const fence = nemiaFence(
    TABLE.map((c) => (c.name === 'hold' ? { ...c, class: 'ask' as const } : c.name === 'ls' ? { ...c, class: 'none' as const } : c)),
  );
  assert.ok(fence.ask.includes('Bash(nemia hold:*)'));
  assert.ok(fence.deny.includes('Bash(nemia ls:*)'));
  assert.ok(!fence.allow.some((r) => r.startsWith('Bash(nemia hold') || r.startsWith('Bash(nemia ls')));
});

test('REFUSED to widen what is not a prompt allowed by its own rule: an answer, a deny and a broader allow leave the fence as it is', () => {
  const fence = nemiaFence(TABLE);
  const allows = ['Bash(nemia cancel:*)', 'Bash(nemia approve:*)', 'Bash(nemia tick:*)', 'Bash(nemia:*)', 'Bash(nemia level:*)'];
  assert.deepEqual(widened(fence, allows), { ...fence, ask: ['Bash(nemia level manual:*)', 'Bash(nemia agents custom *--clear*)'] });
  assert.deepEqual(widened(fence, ['Bash(nemia:*)', 'Bash(nemia level:*)']), fence);
});

test("REFUSED to run unasked: a factory's level set, raised or its raise ended, as the store's level is", () => {
  const ask = nemiaFence(COMMANDS).ask;
  for (const rule of [
    'Bash(nemia level semi-auto:*)',
    'Bash(nemia level manual:*)',
    'Bash(nemia level *--factory*)',
    'Bash(nemia level *--for*)',
    'Bash(nemia level *--end*)',
  ])
    assert.ok(ask.includes(rule), rule);
});

/** Whether the rule `rule`, `Bash(<pattern>)`, reaches the shell line `line`: `<prefix>:*` a prefix, else a glob whose `*` is any text. */
const reaches = (rule: string, line: string): boolean => {
  const pattern = rule.slice('Bash('.length, -1);
  if (pattern.endsWith(':*')) return line === pattern.slice(0, -2) || line.startsWith(`${pattern.slice(0, -2)} `);
  const glob = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${glob.join('.*')}$`).test(line);
};

/** A line as an allow reads it: its leading assignments stripped, as Claude Code strips them before it matches an allow. */
const unassigned = (line: string): string => line.replace(/^(\w+=\S*\s+)+/, '');

test("REFUSED for an agent: a factory's definition written by hand is out of her reach, and she proposes it instead", () => {
  const fence = nemiaFence(COMMANDS);
  for (const name of PROPOSED_INSTEAD)
    assert.ok(
      COMMANDS.some((c) => c.name === name),
      `${name} is an entry of the table`,
    );
  const denied = (line: string) => fence.deny.some((rule) => reaches(rule, line));
  for (const line of [
    'nemia factory hire acme seldon --step build/design',
    'nemia workflows write factory build --folder d',
    'nemia factory rules acme --file r.md',
  ])
    assert.ok(denied(line), line);
  assert.ok(!denied('nemia factory rules acme'), 'the rules still read bare');
  const allowed = (line: string) => fence.allow.some((rule) => reaches(rule, unassigned(line)));
  assert.ok(allowed('nemia propose -f change.yaml -n acme'));
  assert.ok(allowed('nemia proposals approve seldon-ab12c -n acme'));
  assert.ok(!denied('nemia propose -f change.yaml -n acme'));
});

test('REFUSED on a planted line: an assignment before nemia, which would drop her token and act as the person', () => {
  const fence = nemiaFence(COMMANDS);
  const line = 'WF_SESSION_TOKEN= nemia proposals approve p';
  assert.ok(
    fence.allow.some((rule) => reaches(rule, unassigned(line))),
    'an allow alone would let it through, the assignment stripped',
  );
  assert.deepEqual(
    fence.deny.filter((rule) => reaches(rule, line)),
    [ASSIGNED],
  );
  for (const planted of ['HOME=/tmp nemia propose -f x', 'A=1 B=2 nemia proposals decline p', 'timeout 5 X=1 nemia ls'])
    assert.ok(reaches(ASSIGNED, planted), planted);
  assert.ok(!reaches(ASSIGNED, 'nemia inbox add --body "a=b"'), 'an = after nemia is a word of its own');
});
