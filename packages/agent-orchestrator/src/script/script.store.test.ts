/** A script condition's answer file, decoded (`scriptAnswerOf`): a route or `unsure`, exactly one of them, or nothing the run can use. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptAnswerOf } from './script.store.ts';

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
