import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_WORDS, outcomeOf, outcomeWord } from '../src/lib/outcome.ts';
import type { StepAttempts, StepCloseout } from '../src/lib/api/tries.ts';
import type { AttemptEnd, AttemptOutcome } from '../src/lib/api/tries.ts';

const ended = (reason: AttemptEnd, how: AttemptOutcome = 'failed'): StepAttempts => ({
  count: 1,
  latest: { startedAt: 'a', ended: how, endedAt: 'b', reason, release: null, harness: null },
});
const said = (outcome: 'done' | 'blocked') =>
  ({
    apiVersion: null,
    outcome,
    summary: '',
    body: null,
    needs: null,
    values: [],
    refused: [],
    artifacts: [],
    output: {},
    missing: [],
    replies: null,
    schema: {},
    questions: [],
    raw: {},
  }) satisfies StepCloseout;

test("a try's outcome is the agent's when it gave a statement — and says when the machine cut it after", () => {
  assert.deepEqual(outcomeOf({ closeout: said('blocked'), unreadable: null, attempts: ended('harness', 'succeeded') }, '-'), {
    by: 'agent',
    outcome: 'blocked',
    cut: null,
  });
  assert.deepEqual(outcomeOf({ closeout: said('done'), unreadable: null, attempts: ended('deadline') }, '-'), {
    by: 'agent',
    outcome: 'done',
    cut: 'then it ran past its deadline and was stopped',
  });
});

test("with no statement, the machine's reason says why — each reason the engine records, and a harness that ended it failed or stopped", () => {
  for (const reason of ['unsigned', 'lost', 'unstartable', 'budget', 'operator', 'deadline'] as const) {
    const o = outcomeOf({ closeout: null, unreadable: null, attempts: ended(reason) }, '-');
    assert.deepEqual(o, { by: 'machine', reason, words: MACHINE_WORDS[reason] });
    assert.equal(outcomeWord(o), reason);
  }
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: ended('harness', 'stopped') }, '-'), {
    by: 'machine',
    reason: 'stopped',
    words: 'Its harness ended the session stopped, and it said nothing of how it went.',
  });
});

test("a statement that could not be read is the agent's, unreadable, and says why — ahead of any reason the machine gives", () => {
  const unreadable = { error: 'not an object', raw: ['done'] };
  const o = outcomeOf({ closeout: null, unreadable, attempts: ended('harness', 'succeeded') }, 'No closeout yet.');
  assert.deepEqual(o, {
    by: 'unreadable',
    words: 'It gave a closing statement that could not be read (not an object). Here it is as it came.',
  });
  assert.equal(outcomeWord(o), 'unreadable');
  assert.equal(
    outcomeOf({ closeout: null, unreadable, attempts: ended('budget') }, '-').by,
    'unreadable',
    'what it said comes first, as a statement does',
  );
});

test("with no statement and no reason — running, not filed, a harness's done — the inspector's words", () => {
  const nobody = { by: 'nobody', words: 'No closeout yet.' };
  assert.deepEqual(
    outcomeOf(
      {
        closeout: null,
        unreadable: null,
        attempts: { count: 1, latest: { startedAt: 'a', ended: null, endedAt: null, reason: null, release: null, harness: null } },
      },
      'No closeout yet.',
    ),
    nobody,
  );
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: { count: 0, latest: null } }, 'No closeout yet.'), nobody);
  assert.deepEqual(outcomeOf({ closeout: null, unreadable: null, attempts: ended('harness', 'succeeded') }, 'No closeout yet.'), nobody);
  assert.equal(outcomeWord(nobody as never), 'no closeout');
});
