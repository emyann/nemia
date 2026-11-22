/**
 * What a step's filing says of its session's memory (`memoryFiledOf`): its request and limit as its last attempt ran under them, else as
 * the task was filed, what admission counted it at, and the largest peak its attempts measured; null where none of them is said.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { memoryFiledOf } from './told.verb.ts';

const MI = 1024 ** 2;
const GI = 1024 * MI;

describe('`memoryFiledOf`: what a try asked of the memory, its limit, and the peak it reached', () => {
  test('a last attempt that ran under a request and a limit, two attempts measured: the larger peak, with its limit', () =>
    assert.deepEqual(
      memoryFiledOf({
        attempts: [
          {
            resources: { limits: { memory: '6Gi' }, requests: { memory: '1Gi' } },
            memory: { limitBytes: 6 * GI, peakBytes: 812 * MI, oomKills: 0 },
          },
          {
            resources: { limits: { memory: '6Gi' }, requests: { memory: '1Gi' } },
            memory: { limitBytes: 6 * GI, peakBytes: 700 * MI, oomKills: 0 },
          },
        ],
      }),
      { request: '1Gi', limit: '6Gi', askedBytes: GI, peakBytes: 812 * MI, peakLimitBytes: 6 * GI },
    ));
  test('a limit alone is what admission counts, and a peak not measured is null', () =>
    assert.deepEqual(
      memoryFiledOf({ attempts: [{ resources: { limits: { memory: '2Gi' } }, memory: { limitBytes: 2 * GI, oomKills: 0 } }] }),
      {
        request: null,
        limit: '2Gi',
        askedBytes: 2 * GI,
        peakBytes: null,
        peakLimitBytes: null,
      },
    ));
  test('an attempt an older runtime started ran under the resources its task was filed with', () =>
    assert.deepEqual(memoryFiledOf({ resources: { requests: { memory: '512Mi' } }, attempts: [{}] }), {
      request: '512Mi',
      limit: null,
      askedBytes: 512 * MI,
      peakBytes: null,
      peakLimitBytes: null,
    }));
  test('no resources and no record, or no attempt yet: nothing to say', () => {
    assert.equal(memoryFiledOf({ attempts: [{}] }), null);
    assert.equal(memoryFiledOf({ attempts: [] }), null);
  });
});
