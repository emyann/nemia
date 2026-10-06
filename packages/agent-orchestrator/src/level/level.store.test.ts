/**
 * A factory's level file: written and read whole, removed once it holds neither a level nor a raise, and refused where it does not read,
 * naming the command that writes it again. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-level-');
process.env.WF_ROOT = ROOT;
const { factoryLevelFile, readFactoryLevel, writeFactoryLevel } = await import('./level.store.ts');

test("a factory's level file round-trips, and one with neither a level nor a raise is removed", () => {
  assert.equal(readFactoryLevel('pipao'), undefined, 'none written');
  const file = {
    level: 'manual',
    since: '2026-10-06T08:00:00.000Z',
    raise: { level: 'semi-auto', until: '2026-10-06T10:00:00.000Z' },
  } as const;
  writeFactoryLevel('pipao', file);
  assert.equal(factoryLevelFile('pipao'), path.join(ROOT, 'factories', 'pipao', 'level.json'));
  assert.deepEqual(readFactoryLevel('pipao'), file);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'factories', 'pipao')), ['level.json'], 'no hidden file left');
  writeFactoryLevel('pipao', { since: '2026-10-06T09:00:00.000Z' });
  assert.equal(fs.existsSync(factoryLevelFile('pipao')), false);
});

test('REFUSED: a level file that does not read, naming the file, its wrong field and the command that writes it again', () => {
  fs.mkdirSync(path.join(ROOT, 'factories', 'hkb'), { recursive: true });
  fs.writeFileSync(factoryLevelFile('hkb'), JSON.stringify({ level: 'on', since: '2026-10-06T08:00:00.000Z' }));
  assert.throws(
    () => readFactoryLevel('hkb'),
    (err: Error) =>
      err.message.startsWith(`${factoryLevelFile('hkb')}: its level `) && err.message.endsWith('nemia level manual --factory hkb.'),
  );
  fs.writeFileSync(factoryLevelFile('hkb'), '{');
  assert.throws(
    () => readFactoryLevel('hkb'),
    (err: Error) => err.message === `${factoryLevelFile('hkb')} is not JSON: set its level again with nemia level manual --factory hkb.`,
  );
  assert.throws(
    () => factoryLevelFile('../x'),
    (err: Error) => err.message.length > 0 && (err as { exitCode?: number }).exitCode === 2,
  );
});
