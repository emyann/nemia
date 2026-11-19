/**
 * The floor's Getting started list (`lib/gettingStarted.ts`): shown while the change milestone is not done, and never again in this
 * browser once dismissed, the dismissal read back as the floor draws the list again.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { MilestoneRead } from 'objects';
import { keepStarterDismissed, readStarterDismissed, starterShown } from '../src/lib/gettingStarted.ts';

/** The four milestones, the change one in `landed`'s state and the rest done. */
const read = (landed: MilestoneRead['state']) =>
  [
    { name: 'harness', state: 'done', message: '' },
    { name: 'factory', state: 'done', message: '' },
    { name: 'volume', state: 'done', message: '' },
    { name: 'landed', state: landed, message: '' },
  ] satisfies MilestoneRead[];

describe('Getting started: shown until a change is merged, or the person dismisses it', () => {
  describe('each row: whether the list is shown', () => {
    const rows: [MilestoneRead['state'], boolean, boolean][] = [
      ['next', false, true],
      ['later', false, true],
      ['done', false, false],
      ['next', true, false],
      ['done', true, false],
    ];
    for (const [landed, dismissed, shown] of rows)
      test(`the change ${landed}, dismissed ${dismissed}: ${shown ? 'shown' : 'hidden'}`, () =>
        assert.equal(starterShown(read(landed), dismissed), shown));
  });
  test('a dismissal kept is read back, as the floor reads it on its next draw', (t) => {
    const kept = new Map<string, string>();
    const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => kept.get(k) ?? null,
        setItem: (k: string, v: string) => void kept.set(k, v),
        removeItem: (k: string) => void kept.delete(k),
      },
      configurable: true,
      writable: true,
    });
    t.onTestFinished(() => {
      if (before) Object.defineProperty(globalThis, 'localStorage', before);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    });
    assert.equal(readStarterDismissed(), false, 'nothing kept: not dismissed');
    keepStarterDismissed();
    assert.equal(readStarterDismissed(), true);
    assert.equal(starterShown(read('next'), readStarterDismissed()), false, 'dismissed, the list stays hidden');
  });
});
