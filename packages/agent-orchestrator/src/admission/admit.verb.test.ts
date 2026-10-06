/**
 * `nemia admit --at-least`: each run a call names read off its record for its factory, and each factory for its level, at the moment of
 * the call; a call acting on a factory below the floor denied, one above it answered as with no floor, and a run that does not read
 * asked. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { board } from '../../test/engine-board.ts';

const ROOT = scratch('wf-admit-');
process.env.WF_ROOT = ROOT;
const { ADMIT, admitted } = await import('./admit.verb.ts');
const { TABLE } = await import('../command/commands.verb.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { writeFactoryLevel } = await import('../level/level.store.ts');
const { writeLevel } = await import('../nemia/level.store.ts');
const { engineOf, runWith } = await import('../runtime-client.ts');

const e = engineOf(board().layer);

/** Writes the run `id`'s record, started in `factory`, or in none. */
function writeRun(id: string, factory?: string) {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  const record = {
    id,
    workspace: ROOT,
    brief: `The brief of ${id}`,
    createdAt: '2026-10-06T08:00:00.000Z',
    workflowDir: path.join(ROOT, 'no-such-workflow'),
    place: { kind: 'folder' },
    workflow: [{ name: 'build', after: [], body: 'Build it.', harness: 'codex' }],
    steps: {},
    ...(factory === undefined ? {} : { factory }),
  };
  fs.writeFileSync(path.join(ROOT, 'runs', `${id}.json`), JSON.stringify(record));
}

for (const name of ['pipao', 'hkb']) addFactory({ name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });
writeRun('r-pipao', 'pipao');
writeRun('r-hkb', 'hkb');
writeRun('r-default');
writeFactoryLevel('hkb', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2099-01-01T00:00:00.000Z' } });

/** Admission's decision for the shell line `command` at the floor `semi-auto`, or none. */
const decided = async (command: string, floor: 'semi-auto' | 'none' = 'semi-auto') =>
  (await runWith(e, admitted(JSON.stringify({ tool: 'Bash', input: { command }, cwd: '/w' }), TABLE, floor === 'none' ? undefined : floor)))
    ?.decision;

test('REFUSED: a call on a run of a factory at manual, or on the factory, is denied; one raised is hers; an unread run is asked', async () => {
  assert.equal(await decided('nemia show r-pipao'), 'deny');
  assert.equal(await decided('nemia start ./brief.md --factory pipao'), 'deny');
  assert.equal(await decided('nemia show r-default'), 'deny', "the default factory follows the store's level, manual where unset");
  assert.equal(await decided('nemia show r-hkb'), undefined, 'a factory raised above manual is hers');
  assert.equal(await decided('nemia show r-gone'), 'ask');
  assert.equal(await decided('nemia show r-pipao', 'none'), undefined, 'no floor, no scope');
  writeLevel({ level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' });
  assert.equal(await decided('nemia show r-default'), undefined, "the store's level raises the default factory");
  assert.equal(await decided('nemia show r-pipao'), undefined, 'and every factory without its own');
});

test('REFUSED: a floor that is no level', () => {
  assert.equal(ADMIT.check?.({ atLeast: 'auto' }), '"auto" is no level: nemia admit [--at-least manual|semi-auto].');
  assert.equal(ADMIT.check?.({ atLeast: 'semi-auto' }), null);
});
