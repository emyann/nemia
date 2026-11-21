/**
 * A command node signs off with the closeout the run writes for it off its current try's last attempt (`commandCloseout`): `done` on exit
 * 0, its output the JSON object its script answered; nothing on another exit, on an end with none, on an answer that is not one JSON
 * object, or on a task of an earlier try.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { commandCloseout } from './command-node.ts';
import type { StepSpec } from '../step/step.ts';
import { run } from '../../test/assessed.ts';

const NODE = { name: 'file-cards', after: ['argus'], body: '', run: 'node cards.ts file' } as unknown as StepSpec & { run: string };

/** The closeout the node signs off with where its task's last attempt is `attempt`. */
const closeoutOn = (attempt: { exitCode?: number | null; reason?: string | null; terminationMessage?: string } | undefined) =>
  commandCloseout(NODE, run({ 'file-cards': 'r-1-file-cards' }), (id) => (id === 'r-1-file-cards' ? attempt : undefined));

describe('a command node signs off by its exit', () => {
  test('exit 0 with no answer: done, with no output', () => {
    const said = closeoutOn({ exitCode: 0 });
    assert.equal(said?.outcome, 'done');
    assert.equal(said?.output, undefined);
  });

  test('exit 0 with an answer: done, its output the answer', () => {
    assert.deepEqual(closeoutOn({ exitCode: 0, terminationMessage: '{"filed":2}' })?.output, { filed: 2 });
  });

  const unsigned: [string, Parameters<typeof closeoutOn>[0]][] = [
    ['a non-zero exit', { exitCode: 1 }],
    ['an end with no exit', { exitCode: null, reason: 'deadline' }],
    ['exit 0 with an answer that is no JSON object', { exitCode: 0, terminationMessage: '[1, 2]' }],
    ['exit 0 with an answer that is no JSON', { exitCode: 0, terminationMessage: 'filed' }],
    ['no attempt yet', undefined],
  ];
  for (const [what, attempt] of unsigned)
    test(`REFUSED: ${what} signs nothing`, () => {
      assert.equal(closeoutOn(attempt), undefined);
    });

  test("REFUSED: a task of an earlier try is not the node's current closeout", () => {
    const r = run({ 'file-cards': 'r-1-file-cards' });
    r.steps['file-cards'] = { ...r.steps['file-cards'], tries: [{ taskId: 'r-1-file-cards' }] } as never;
    assert.equal(
      commandCloseout(NODE, r, () => ({ exitCode: 0 })),
      undefined,
    );
  });
});
