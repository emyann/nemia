/**
 * What a step's attempts say of the code its session ran on (`attemptsIn`) and what `nemia ls` says of a step at work (`ranOnOf`), off
 * the engine's records: an image under the store's releases folder is that install, anywhere else a checkout, and an attempt that
 * recorded nothing says nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { attemptsIn } from './tries.verb.ts';
import { ranOnOf } from '../views/views.verb.ts';
import { engineOf } from '../runtime-client.ts';

const RELEASES = '/store/releases';
const engine = eachTest(testEngine);

/** The views of the tasks the stand-in holds, as a verb reads them. */
const viewsOf = async () => {
  const listed = await Effect.runPromise(engineOf(engine().layer).list());
  return new Map(listed.views.map((v) => [v.id, v]));
};

test('a step’s latest attempt says the release and harness its session ran on, and null for each it did not record', async (t) => {
  const e = engineOf(engine().layer);
  for (const id of ['installed', 'checkout', 'unrecorded'])
    await Effect.runPromise(e.file({ id, brief: 'b', cwd: '/r', harness: 'claude' }));
  engine().settle('installed', 'working', { image: path.join(RELEASES, 'v1.2.0', 'packages', 'agent-runtime'), harnessVersion: '2.1.316' });
  engine().settle('checkout', 'succeeded', { image: '/home/me/nemia/packages/agent-runtime' });
  engine().settle('unrecorded', 'working', {});
  const views = await viewsOf();
  await t.test('an install, at work', () => {
    const latest = attemptsIn('installed', views, RELEASES).latest;
    assert.deepEqual(
      [latest?.release, latest?.harness],
      [
        { kind: 'install', tag: 'v1.2.0' },
        { name: 'claude', version: '2.1.316' },
      ],
    );
    assert.equal(ranOnOf(views, RELEASES)('installed'), 'on v1.2.0, claude 2.1.316');
  });
  await t.test('a checkout, ended: the run object still says it, nemia ls no longer', () => {
    const latest = attemptsIn('checkout', views, RELEASES).latest;
    assert.deepEqual([latest?.release, latest?.harness], [{ kind: 'checkout', root: '/home/me/nemia/packages/agent-runtime' }, null]);
    assert.equal(ranOnOf(views, RELEASES)('checkout'), undefined);
  });
  await t.test('nothing recorded: null, and nothing said', () => {
    const latest = attemptsIn('unrecorded', views, RELEASES).latest;
    assert.deepEqual([latest?.release, latest?.harness], [null, null]);
    assert.equal(ranOnOf(views, RELEASES)('unrecorded'), undefined);
  });
});
