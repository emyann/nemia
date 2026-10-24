import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nemiaFence, widened } from './fence.ts';
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
    ],
    ask: ['Bash(nemia cancel:*)', 'Bash(nemia level manual:*)', 'Bash(nemia agents custom *--clear*)'],
    deny: ['Bash(nemia tick:*)'],
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
