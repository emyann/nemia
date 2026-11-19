/**
 * Whether a factory, as the api reads it, holds its work (`heldOf`, `lib/volumeStep.ts`): a writable volume that no harness withholds its
 * trust from; and the mode a volume is offered and added in (`modeOffered`, `addedAs`). The screen the step shows is `volumeStepOf`'s,
 * proved by `contracts/volume-step.contract.ts`, and not restated here.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { addedAs, heldOf, modeOffered } from '../src/lib/volumeStep.ts';

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

test('opened again, a mode is offered on a way that adds a folder or an address, never on a new repository, which is added writable', () => {
  const screens = ['choose', 'folder', 'address', 'new'] as const;
  assert.deepEqual(
    {
      again: screens.map((screen) => modeOffered(true, screen)),
      first: screens.map((screen) => modeOffered(false, screen)),
      added: [addedAs('new', 'ro'), addedAs('folder', 'ro'), addedAs('address', 'rw')],
    },
    { again: [false, true, true, false], first: [false, false, false, false], added: ['rw', 'ro', 'rw'] },
  );
});
