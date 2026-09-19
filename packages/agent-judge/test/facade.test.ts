/** The facade's refusals, and whether the judge is on: `available()`, `status()` and `judge status`. */
import { ENV, reached, stub, tmp } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { available, judge, noul, status } from '../src/facade.ts';
import { main } from '../src/cli.ts';

const refused = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (e: Error & { exitCode?: number }) => e.exitCode === 2 && pattern.test(e.message));

test('with no key the judge is off: available() is false, and judge status says why and exits 0', async () => {
  assert.equal(available({}), false);
  assert.equal(available({ TYPESAFE_API_KEY: ' \n' }), false);
  assert.equal(available(), false, 'the hermetic environment has no key');
  assert.equal(status({}), 'off: no TYPESAFE_API_KEY in the environment');
  const lines: string[] = [];
  assert.equal(await main(['status'], { env: {}, out: (l) => lines.push(l) }), 0);
  assert.deepEqual(lines, ['off: no TYPESAFE_API_KEY in the environment']);
  assert.equal(reached.length, 0);
});

test('with a key it is ready, and asks nothing to say so', async () => {
  assert.equal(available(ENV), true);
  assert.equal(status(ENV), 'ready');
  const lines: string[] = [];
  assert.equal(await main(['status'], { env: ENV, out: (l) => lines.push(l) }), 0);
  assert.deepEqual(lines, ['ready']);
  assert.equal(reached.length, 0);
  await assert.rejects(main(['status', 'now'], { env: ENV, out: () => {} }), (e: Error) => /^judge status takes nothing/.test(e.message));
});

test('the facade refuses a key passed in, an unknown option, no record, an alias and a bad mode', () => {
  const record = tmp('facade');
  refused(() => judge({ model: 'jev-1.13.0', record, apiKey: 'x' } as never), /^judge: unknown option `apiKey`\. The key is read from TYPESAFE_API_KEY/);
  refused(() => judge({ model: 'jev-1.13.0', record, timeout: 1 } as never), /^judge: unknown option `timeout`\. It takes model, record/);
  refused(() => judge({ model: 'jev-1.13.0' } as never), /^judge: `record` names the directory/);
  refused(() => judge({ model: 'jev-1.13.0', record: '' }), /^judge: `record` names the directory/);
  for (const model of ['jev', 'jev-latest', 'jev-1', 'JEV-1.13.0', '']) refused(() => judge({ model, record }), /^judge: the model must be pinned/);
  refused(() => judge({ model: 'jev-1.13.0', record, mode: 'live' as never }), /^judge: `mode` is recorded or replay, not "live"/);
});

test('ask refuses no questions and a state that is not JSON, before anything is claimed or sent', async () => {
  const s = stub();
  const j = judge({ model: 'jev-1.13.0', record: tmp('facade'), env: ENV, fetch: s.fetch });
  const rejects = (p: Promise<unknown>, pattern: RegExp) =>
    assert.rejects(p, (e: Error & { exitCode?: number }) => e.exitCode === 2 && pattern.test(e.message));
  await rejects(j.ask({ card: 'x' }, {}), /^judge: ask takes at least one question/);
  await rejects(j.ask(undefined as never, { web: noul('?', { true: 'y', false: 'n' }) }), /^judge: the state is empty/);
  await rejects(j.ask({ n: 10n } as never, { web: noul('?', { true: 'y', false: 'n' }) }), /^judge: the state is not JSON/);
  assert.equal(s.calls.length, 0);
});
