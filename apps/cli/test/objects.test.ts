/**
 * The bound of a moved read (`src/objects.ts`): on a stand-in api that takes the connection and never answers, a read gives up once its
 * bound is gone, refused with the exit code of a usage refusal and naming what to type next. The shipped bound, `READ_BOUND_MS`, is not
 * waited out: the test shortens it at the seam `asked` gives for it, and floors the wait there.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from '../../api/test/scratch.ts';
import { asked } from '../src/objects.ts';
import { Refused } from '../src/refused.ts';

/** The bound the test gives the read, in place of the shipped one. */
const SHORT_MS = 200;

/** What a floor at `SHORT_MS` forgives: a timer fires up to a millisecond before a clock read around it says its delay is gone. */
const TIMER_SLACK_MS = 5;

/** A server that accepts every request and answers none, held open until the file ends. */
const silent = http.createServer(() => {});
await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
after(() => {
  silent.closeAllConnections();
  silent.close();
});

test('REFUSED: a moved read the api never answers gives up at its bound, exit 2, naming the status and the read in process', async () => {
  const root = path.join(scratch('nemia-bound-'), 'store');
  fs.mkdirSync(root, { recursive: true });
  const { port } = silent.address() as AddressInfo;
  fs.writeFileSync(path.join(root, 'daemon.json'), JSON.stringify({ url: `http://127.0.0.1:${port}` }));
  const env: NodeJS.ProcessEnv = { WF_ROOT: root, NEMIA_DAEMON_START: 'off' };

  const began = performance.now();
  const refused = await asked('show', (client) => client.runs.show({ params: { runId: 'any' } }), env, SHORT_MS).then(
    () => assert.fail('the read answered, though the api never did'),
    (err: unknown) => err,
  );
  const waited = performance.now() - began;

  assert.ok(refused instanceof Refused, `a Refused, not ${String(refused)}`);
  assert.equal(refused.code, 2);
  assert.match(refused.message, /nemia service status/, 'it names the status');
  assert.match(refused.message, /--local/, 'and the read in process');
  assert.ok(waited >= SHORT_MS - TIMER_SLACK_MS, `it waited out its bound before it gave up: ${waited} ms`);
});
