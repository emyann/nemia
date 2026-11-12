/**
 * `GET /api/health` answers the release the api runs (`release`), the tag of an install's `release.json`, which the client holds its own
 * against; and none for a checkout, or for an app given no release.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Layer } from 'effect';
import type { Running } from 'agent-orchestrator';
import type { Health } from 'objects';
import { appOf, liveOf } from '../app.ts';
import { ApiConfig } from '../layer.ts';
import { healthOf } from './server.ts';

const INSTALL: Running = { kind: 'install', root: '/s/releases/v9', tag: 'v9', commit: 'abc', source: '/home/me/nemia', builtAt: '' };
const CHECKOUT: Running = { kind: 'checkout', root: '/home/me/nemia' };

/** What `GET /api/health` answers an app that runs `running`. */
async function healthOn(running: Running): Promise<Health> {
  const { app } = appOf(Layer.merge(liveOf(), ApiConfig.layer(process.env, running)));
  const res = await app.request('/api/health');
  assert.equal(res.status, 200);
  return (await res.json()) as Health;
}

test("health answers an install's release, and none for a checkout or an app given no release", async () => {
  assert.deepEqual(await healthOn(INSTALL), { ok: true, release: 'v9' });
  assert.deepEqual(await healthOn(CHECKOUT), { ok: true });
  assert.deepEqual(healthOf(undefined), { ok: true });
});
