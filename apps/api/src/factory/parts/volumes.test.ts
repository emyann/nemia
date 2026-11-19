/**
 * A factory's volume's switches on the board (`PATCH /api/namespaces/<factory>/volumes/<name>`, factory/parts/volumes.ts, over `nemia
 * factory volume set`): a story of a switch set and then the other, each answered as the Volume read again with the file written; and
 * what a write refuses — in a scratch store whose factory is filed with the package's own verbs. Every write is read back from the
 * factory's file, and every refusal leaves it as it was.
 */
import { root } from '../../../test/harness.ts';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../../app.ts';

const notes = path.join(scratch('nemia-api-volumes-'), 'notes');
fs.mkdirSync(notes);
addFactory({ name: 'mill', volumes: [`${notes}:ro`] });

const RECORD = path.join(root, 'factories', 'mill.json');
const VOLUME = '/api/namespaces/mill/volumes/notes';

type Volume = import('objects').Volume;

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown) =>
  app.request(url, { method, headers: json, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** The volumes the factory's file holds. */
const stored = () => (JSON.parse(fs.readFileSync(RECORD, 'utf8')) as { volumes?: Array<Record<string, unknown>> }).volumes;

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200) {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** A request refused with `status`, the factory's file left as it was: its words. */
async function refused(res: () => Response | Promise<Response>, status: number) {
  const before = fs.readFileSync(RECORD, 'utf8');
  const answer = await res();
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.equal(fs.readFileSync(RECORD, 'utf8'), before, 'a refused request leaves the factory as it was');
  return body.error;
}

describe("a person turns a volume's CLAUDE.md on, then its skills off", () => {
  const s = story(test);
  s.test('PATCH sets the switch given, answered as the Volume with the file written, and a GET reads the same', async () => {
    const volume = await answered<Volume>(send('PATCH', VOLUME, { claudeMd: true }));
    assert.deepEqual([volume.kind, volume.spec.path, volume.spec.readOnly, volume.spec.claudeMd], ['Volume', notes, true, true]);
    assert.equal(volume.written?.file, RECORD);
    assert.deepEqual(stored(), [{ path: notes, readOnly: true, name: 'notes', claudeMd: true }]);
    const { written: _written, ...read } = volume;
    assert.deepEqual(await answered<Volume>(app.request(VOLUME)), read, 'got as the write answered it, but for what it wrote');
  });
  s.test('a second PATCH of the other switch keeps the first', async () => {
    const volume = await answered<Volume>(send('PATCH', VOLUME, { skills: false }));
    assert.deepEqual([volume.spec.claudeMd, volume.spec.skills], [true, false]);
    assert.deepEqual(stored(), [{ path: notes, readOnly: true, name: 'notes', claudeMd: true, skills: false }]);
  });
});

describe("REFUSED: what a volume's switches write refuses, the factory file as it was", () => {
  test('a name the factory holds no volume of is a 404 naming those it holds', async () => {
    assert.match(await refused(() => send('PATCH', '/api/namespaces/mill/volumes/ghost', { claudeMd: true }), 404), /notes/);
  });
  test('neither switch is a 422', async () => {
    await refused(() => send('PATCH', VOLUME, {}), 422);
  });
  test('a switch that is no boolean is a 400', async () => {
    await refused(() => send('PATCH', VOLUME, { claudeMd: 'on' }), 400);
  });
  test('the default factory is a 409', async () => {
    await refused(() => send('PATCH', '/api/namespaces/default/volumes/notes', { claudeMd: true }), 409);
  });
  test('a namespace that is no factory name is a 422, and one no factory has a 404', async () => {
    await refused(() => send('PATCH', '/api/namespaces/Not_A_Name/volumes/notes', { claudeMd: true }), 422);
    await refused(() => send('PATCH', '/api/namespaces/gone/volumes/notes', { claudeMd: true }), 404);
  });
});
