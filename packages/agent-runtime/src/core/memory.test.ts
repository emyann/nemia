/**
 * A memory limit read off its quantity (`core/memory.ts`): the forms a container's `resources.limits.memory` takes, as bytes, and
 * those the runtime refuses, each with words. What a whole amount of a unit is, the contract proves (`contracts/memory.contract.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryBytesOf, memoryQuantityRefusal } from './memory.ts';

test('a quantity is read as the bytes it names, or refused with words', async (t) => {
  const READ: Array<[string, number]> = [
    ['8Gi', 8_589_934_592],
    ['512Mi', 536_870_912],
    ['4G', 4_000_000_000],
    ['1073741824', 1_073_741_824],
    ['64Ki', 65_536],
    ['2T', 2_000_000_000_000],
  ];
  for (const [quantity, bytes] of READ) {
    await t.test(`${quantity} is ${bytes} bytes`, () => {
      assert.equal(memoryBytesOf(quantity), bytes);
      assert.equal(memoryQuantityRefusal(quantity), undefined);
    });
  }
  const REFUSED = ['8 GB', '8gb', '129e6', '100m', '', '0', '-1Gi', '99999999Ti', '1.5Gi', '0.5', 'Gi', '8Gi '];
  for (const quantity of REFUSED) {
    await t.test(`${JSON.stringify(quantity)} is refused`, () => {
      assert.equal(memoryBytesOf(quantity), undefined);
      assert.equal(typeof memoryQuantityRefusal(quantity), 'string');
    });
  }
});
