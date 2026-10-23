/**
 * A factory's level file: written and read whole, removed once it holds neither a level nor a raise, and refused where it does not read,
 * naming the command that writes it again. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-level-');
process.env.WF_ROOT = ROOT;
const { factoryLevelFile, readFactoryLevel, writeFactoryLevel } = await import('./level.store.ts');

/** That reading hkb's file refuses, naming the file and each of `facts`, and the command that writes it again. */
const refused = (...facts: string[]) =>
  assert.throws(
    () => readFactoryLevel('hkb'),
    (err: Error) => {
      names(err.message, factoryLevelFile('hkb'), ...facts, 'nemia level manual --factory hkb.');
      return true;
    },
  );

test("a factory's level file: written and read whole, removed once it holds nothing, and refused where it does not read", async (t) => {
  await t.test("a factory's level file round-trips, and one with neither a level nor a raise is removed", () => {
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
  await t.test('REFUSED: a level file whose level is none, naming its wrong field', () => {
    fs.mkdirSync(path.join(ROOT, 'factories', 'hkb'), { recursive: true });
    fs.writeFileSync(factoryLevelFile('hkb'), JSON.stringify({ level: 'on', since: '2026-10-06T08:00:00.000Z' }));
    refused(`${factoryLevelFile('hkb')}: its level `);
  });
  await t.test('REFUSED: a level file that is not JSON', () => {
    fs.writeFileSync(factoryLevelFile('hkb'), '{');
    refused(`${factoryLevelFile('hkb')} is not JSON`);
  });
  await t.test('REFUSED: a factory name that is none, at exit 2', () => {
    assert.throws(
      () => factoryLevelFile('../x'),
      (err: Error) => err.message.length > 0 && (err as { exitCode?: number }).exitCode === 2,
    );
  });
});
