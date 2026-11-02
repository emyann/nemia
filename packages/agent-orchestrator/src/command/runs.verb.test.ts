/**
 * `nemia rm` and `nemia prune` as entries of the table: the runs a command line names, read in order and each once, and what the api
 * throws in place of an answer that removed nothing. Their arguments refused before any run is read are rows of `REFUSALS`
 * (`command.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetLine, type Forgot } from '../forget/forget.ts';
import type { Pruning } from '../prune/prune.ts';
import { commandLine, parseArgv } from './command.ts';
import { PRUNE, RM } from './runs.verb.ts';

test('the runs a command line names are read in the order given, each once, beside the switches in any place', () => {
  assert.deepEqual(parseArgv(RM.spec, ['a', 'b', 'a', '--delete-branches']), { runId: ['a', 'b'], deleteBranches: true });
  assert.deepEqual(parseArgv(RM.spec, ['b', '--delete-branches', 'a', '--force-unmerged']), {
    runId: ['b', 'a'],
    deleteBranches: true,
    forceUnmerged: true,
  });
  assert.deepEqual(parseArgv(PRUNE.spec, ['--yes', 'x', '--unmerged', 'y', '--artifacts']), {
    runId: ['x', 'y'],
    yes: true,
    unmerged: true,
    artifacts: true,
  });
  assert.deepEqual(parseArgv(RM.spec, []), {}, 'bare nemia rm names no run, and its runner prints the help');
  assert.deepEqual(parseArgv(PRUNE.spec, []), {}, 'bare nemia prune names no run: every run');
  assert.equal(commandLine(RM, { runId: ['a', 'b'] }), 'nemia rm a b');
  assert.equal(commandLine(RM, {}), 'nemia rm [<runId> ...]');
});

/** What `forget` answers of one run, with nothing done but what `more` says. */
const forgot = (more: Partial<Forgot> & Pick<Forgot, 'kind'>): Forgot => ({
  id: 'r-1',
  removed: [],
  handedOff: [],
  gone: [],
  left: [],
  branches: [],
  files: [],
  ...more,
});

/** The kind and the words of what the api throws of `data`, or null. */
const thrown = (refusal: { _tag: string; message: string } | null | undefined) =>
  refusal && { tag: refusal._tag, message: refusal.message };

test('REFUSED on the api: a removal that removed nothing is thrown in forget’s words — refused and held a Conflict, missing a Missing', () => {
  const rmRefusal = (f: Forgot) =>
    thrown(RM.apiRefusal?.({ id: f.id, removed: f.kind === 'forgotten', engine: null, forgot: f }, { runId: f.id }));
  const refused = forgot({ kind: 'refused', refusal: 'r-1 has a task in flight: nemia cancel r-1 first.' });
  assert.deepEqual(rmRefusal(refused), { tag: 'Conflict', message: 'r-1 has a task in flight: nemia cancel r-1 first.' });
  const held = forgot({ kind: 'held', left: [{ path: '/w/r-1/implement', heldBy: 'in use' }], removed: ['/w/r-1/plan'] });
  assert.deepEqual(rmRefusal(held), { tag: 'Conflict', message: forgetLine(held) });
  assert.match(forgetLine(held), /^r-1 {2}not forgotten:.*nemia rm r-1 again then\.$/);
  const missing = forgot({ kind: 'missing', files: ['runs/r-1.asks'] });
  assert.deepEqual(rmRefusal(missing), { tag: 'Missing', message: forgetLine(missing) });
  assert.equal(rmRefusal(forgot({ kind: 'forgotten' })), null);
});

/** What `prune` answers of one run, with nothing found but what `more` says. */
const pruning = (more: Partial<Pruning> & Pick<Pruning, 'kind'>): Pruning => ({ id: 'r-1', worktrees: [], left: [], ...more });

test('REFUSED on the api: a prune that removed nothing is thrown as a Conflict, in nemia prune’s words', () => {
  const pruneRefusal = (p: Pruning) =>
    thrown(
      PRUNE.apiRefusal?.(
        { id: p.id, pruned: p.kind === 'pruned', lines: [], worktrees: p.worktrees, artifacts: null, left: p.left, pruning: p },
        { runId: p.id },
      ),
    );
  assert.deepEqual(pruneRefusal(pruning({ kind: 'refused', refusal: 'r-1 is not over: nemia cancel r-1 first.' })), {
    tag: 'Conflict',
    message: 'r-1 is not over: nemia cancel r-1 first.',
  });
  assert.deepEqual(pruneRefusal(pruning({ kind: 'nothing', nothing: 'no worktree of it is left' })), {
    tag: 'Conflict',
    message: 'Nothing to prune: no worktree of it is left.',
  });
  assert.equal(pruneRefusal(pruning({ kind: 'pruned', worktrees: [{ path: '/w/r-1/plan', bytes: 10 }] })), null);
});
