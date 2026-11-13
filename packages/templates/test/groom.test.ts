/**
 * The janitor's `amendment` (`workflows/janitor/groom.ts`), the pure function that places each stale fact Argus found in a card's body:
 * one row per refusal and per accepting case. Facts apply in order, each `was` found exactly once in the body as the facts before it
 * left it and replaced by its `now`; a fact it cannot place exactly once is refused by its index, so no amendment is a guess.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amendment } from '../sdlc/workflows/janitor/groom.ts';

const BODY = 'Read src/old.ts at line 12, then run wf ls.\n\nThe verb is `wf ls`.';

const fact = (was: string, now: string) => ({ was, now, why: 'moved' });

const rows: Array<{ name: string; facts: ReturnType<typeof fact>[]; is: ReturnType<typeof amendment> }> = [
  { name: 'no facts is refused', facts: [], is: { kind: 'refused', reason: 'no-facts', fact: -1 } },
  { name: 'an empty was is refused', facts: [fact('', 'x')], is: { kind: 'refused', reason: 'empty', fact: 0 } },
  { name: 'a was the same as its now is refused', facts: [fact('src/old.ts', 'src/old.ts')], is: { kind: 'refused', reason: 'unchanged', fact: 0 } },
  {
    name: 'a was the body lacks is refused, by its index',
    facts: [fact('src/old.ts', 'src/new.ts'), fact('line 99', 'line 3')],
    is: { kind: 'refused', reason: 'missing', fact: 1 },
  },
  { name: 'a was the body holds twice is refused', facts: [fact('wf ls', 'nemia ls')], is: { kind: 'refused', reason: 'twice', fact: 0 } },
  {
    name: 'one fact found once is replaced where it stands',
    facts: [fact('src/old.ts', 'src/new.ts')],
    is: { kind: 'amended', body: 'Read src/new.ts at line 12, then run wf ls.\n\nThe verb is `wf ls`.' },
  },
  {
    name: 'two facts apply in order',
    facts: [fact('src/old.ts', 'src/new.ts'), fact('line 12', 'line 30')],
    is: { kind: 'amended', body: 'Read src/new.ts at line 30, then run wf ls.\n\nThe verb is `wf ls`.' },
  },
  {
    name: 'a second fact is placed in the body as the first left it',
    facts: [fact('run wf ls.', 'run nemia ls.'), fact('wf ls', 'nemia ls')],
    is: { kind: 'amended', body: 'Read src/old.ts at line 12, then run nemia ls.\n\nThe verb is `nemia ls`.' },
  },
  {
    name: 'a fact that empties the body is not refused: the title is the write’s to check',
    facts: [fact(BODY, '')],
    is: { kind: 'amended', body: '' },
  },
];

for (const row of rows) test(row.name, () => assert.deepEqual(amendment(BODY, row.facts), row.is));
