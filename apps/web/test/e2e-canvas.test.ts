/**
 * `photographCard`, the e2e's picture of one card on a canvas, does nothing unless the page being visited is pictured (`photographing`):
 * no zoom, no drag, no picture on a default run. Its page and card are fakes that record each property read and throw on it, so a call
 * that touches either rejects at once.
 * No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { photographCard } from './e2e/canvas.ts';
import { setPhotographing } from './e2e/world.ts';

after(() => setPhotographing(false));

/** A fake that records each property read of it in `reads`, then throws `touched`. */
const recording = (reads: string[], touched: Error): object =>
  new Proxy(
    {},
    {
      get: (_, key) => {
        reads.push(String(key));
        throw touched;
      },
    },
  );

test('not pictured, photographCard touches neither the page nor the card', async () => {
  setPhotographing(false);
  const reads: string[] = [];
  const touched = new Error('touched');
  await photographCard(recording(reads, touched) as never, recording(reads, touched) as never, 'x.png');
  assert.equal(reads.length, 0, `read: ${reads.join(', ')}`);
});

test('pictured, photographCard reaches the page: the fakes are what it would touch', async () => {
  setPhotographing(true);
  try {
    const reads: string[] = [];
    const touched = new Error('touched');
    await assert.rejects(photographCard(recording(reads, touched) as never, recording(reads, touched) as never, 'x.png'), touched);
    assert.deepEqual(reads, ['locator']);
  } finally {
    setPhotographing(false);
  }
});
