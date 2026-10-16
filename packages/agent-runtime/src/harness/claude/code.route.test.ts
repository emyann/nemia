/**
 * Which runner a Claude Code spawn goes to (`attachedLongLived`): a long-lived request runs attached while a holder holds the attached
 * sessions, and on `--bg` only when nothing holds them; a job's route is not this rule's, and a request for the claude.ai bridge does
 * not change it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachedLongLived } from './code.ts';

/** An attached runner that holds, or does not. */
const holder = (holding: boolean) => ({ holding: () => holding });

test('a long-lived request runs attached while a holder holds the attached sessions', () => {
  assert.equal(attachedLongLived({ restartPolicy: 'Always' }, holder(true)), true);
});

test('REFUSED: a long-lived request with no holder, and one where no attached runner is there at all, does not run attached', () => {
  assert.equal(attachedLongLived({ restartPolicy: 'Always' }, holder(false)), false, 'a holder that let go runs it `--bg`');
  assert.equal(attachedLongLived({ restartPolicy: 'Always' }, undefined), false, 'and an engine with no attached runner runs it `--bg`');
});

test('REFUSED: a request that is no long-lived session is not sent attached by this rule, holder or not', () => {
  assert.equal(attachedLongLived({}, holder(true)), false, 'a job takes its own route');
});
