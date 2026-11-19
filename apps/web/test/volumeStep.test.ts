/**
 * Whether a factory, as the api reads it, holds its work (`heldOf`, `lib/volumeStep.ts`): a writable volume that no harness withholds its
 * trust from. The screen the step shows is `volumeStepOf`'s, proved by `contracts/volume-step.contract.ts`, and not restated here.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { heldOf } from '../src/lib/volumeStep.ts';

const AT = '/home/you/code/acme';

test('a writable volume no harness withholds its trust from is held; a read-only or an untrusted one is not', () => {
  assert.deepEqual(
    [
      heldOf({ volumes: [{ path: AT, readOnly: false }], untrusted: [] }),
      heldOf({ volumes: [{ path: AT, readOnly: true }], untrusted: [] }),
      heldOf({ volumes: [{ path: AT, readOnly: false }], untrusted: [{ place: AT }] }),
      heldOf({ volumes: [], untrusted: [] }),
    ],
    [true, false, false, false],
  );
});
