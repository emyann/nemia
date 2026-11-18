/** `retriesNamed`: the `nemia retry` commands a text names for one run, as `nemia decide` judges a blocked step's `needs`. */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { retriesNamed } from './named.ts';

describe('retriesNamed: each nemia retry of this run a text names, with how it asks', () => {
  const rows: Array<[string, string, ReturnType<typeof retriesNamed>]> = [
    [
      'a recheck in a sentence',
      'Re-run the check: nemia retry r-1 implement --recheck.',
      [{ step: 'implement', how: { mode: 'recheck' } }],
    ],
    [
      'in backticks, fresh, on a model',
      '`nemia retry r-1 implement --fresh --model sonnet`',
      [{ step: 'implement', how: { mode: 'fresh', model: 'sonnet' } }],
    ],
    ['a placeholder is no message', 'nemia retry r-1 implement --message "<answer>"', [{ step: 'implement', how: { mode: 'continue' } }]],
    [
      'a message, and a budget',
      "nemia retry r-1 review --budget 5 --message 'ship it'",
      [{ step: 'review', how: { mode: 'continue', budget: 5, message: 'ship it' } }],
    ],
    ['another run is not this one', 'nemia retry r-2 implement --recheck', []],
    ['none', 'which flag name ships?', []],
  ];
  for (const [name, text, named] of rows) test(name, () => assert.deepEqual(retriesNamed(text, 'r-1'), named));
});
