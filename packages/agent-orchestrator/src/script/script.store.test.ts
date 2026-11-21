/** A script condition's answer file, decoded (`scriptAnswerOf`), and a command node's answer held to its output schema (`scriptCloseouts`). */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { scriptAnswerOf, scriptCloseouts } from './script.store.ts';
import type { StepSpec } from '../step/step.ts';
import { run } from '../../test/assessed.ts';

test('an answer file decodes to a route or to unsure, and to nothing with both, neither, a wrong type or text that is not JSON', () => {
  const rows: [string | undefined, ReturnType<typeof scriptAnswerOf>][] = [
    ['{"route":"web"}', { kind: 'route', route: 'web' }],
    ['{"route":"web","why":"it touches a page","evidence":{"files":2}}', { kind: 'route', route: 'web', why: 'it touches a page' }],
    ['{"route":"web","later":true}', { kind: 'route', route: 'web' }],
    ['{"unsure":"half web, half docs","evidence":[1]}', { kind: 'unsure', unsure: 'half web, half docs' }],
    ['{"route":"web","unsure":"or docs"}', undefined],
    ['{"why":"no route"}', undefined],
    ['{}', undefined],
    ['{"route":""}', undefined],
    ['{"unsure":""}', undefined],
    ['{"route":3}', undefined],
    ['{"route":"web","why":4}', undefined],
    ['["web"]', undefined],
    ['"web"', undefined],
    ['null', undefined],
    ['route: web', undefined],
    ['{"route":"web"} trailing', undefined],
    ['', undefined],
    [undefined, undefined],
  ];
  for (const [text, want] of rows) assert.deepEqual(scriptAnswerOf(text), want, String(text));
});

test("a command node's answer is held to its output schema: one it refuses signs nothing, one it takes is the node's output", () => {
  const node = {
    name: 'file-notes',
    after: [],
    body: '',
    run: 'node notes.ts file',
    output: { schema: { type: 'object', properties: { filed: { type: 'integer' } }, required: ['filed'] } },
  } as unknown as StepSpec;
  const closeoutOn = (answer: string) =>
    scriptCloseouts([node], () => ({ exitCode: 0, terminationMessage: answer }), run({ 'file-notes': 'r-1-file-notes' }), () => undefined)(
      'file-notes',
    );
  assert.deepEqual(closeoutOn('{"filed":2}')?.output, { filed: 2 });
  assert.equal(closeoutOn('{"filed":"two"}'), undefined);
  assert.equal(closeoutOn('{}'), undefined);
});
