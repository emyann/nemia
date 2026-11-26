/**
 * A factory's level record: written and read whole, none held once it says neither a level nor a raise, and refused where it does not
 * read, naming the command that writes it again.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import { plantKey, readFactoryLevel, recordText, writeFactoryLevel } from '../../testing.ts';
import { levelKey } from '../factory/door/index.ts';
import { levelOf } from './level.store.ts';

const ROOT = scratch('wf-level-');

/** That reading the level record `text` of hkb refuses, naming its key and each of `facts`, and the command that writes it again. */
const refused = (text: string, ...facts: string[]) => {
  plantKey(ROOT, levelKey('hkb'), text);
  assert.throws(
    () => readFactoryLevel(ROOT, 'hkb'),
    (err: Error) => {
      names(err.message, levelKey('hkb'), ...facts, 'nemia level manual --factory hkb.');
      return true;
    },
  );
};

describe("a factory's level record: written and read whole, none held once it holds nothing, and refused where it does not read", () => {
  test("a factory's level record round-trips, and one with neither a level nor a raise is removed", () => {
    assert.equal(readFactoryLevel(ROOT, 'pipao'), undefined, 'none written');
    const file = {
      level: 'manual',
      since: '2026-10-06T08:00:00.000Z',
      raise: { level: 'semi-auto', until: '2026-10-06T10:00:00.000Z' },
    } as const;
    writeFactoryLevel(ROOT, 'pipao', file);
    assert.deepEqual(readFactoryLevel(ROOT, 'pipao'), file);
    assert.deepEqual(levelOf(recordText(ROOT, levelKey('pipao')), 'pipao'), file);
    writeFactoryLevel(ROOT, 'pipao', { since: '2026-10-06T09:00:00.000Z' });
    assert.equal(recordText(ROOT, levelKey('pipao')), undefined);
  });
  test('REFUSED: a level record whose level is none, naming its wrong field', () => {
    refused(JSON.stringify({ level: 'on', since: '2026-10-06T08:00:00.000Z' }), 'its level ');
  });
  test('REFUSED: a level record that is not JSON', () => {
    refused('{', 'is not JSON');
  });
});
