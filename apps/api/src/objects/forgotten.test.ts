import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Forgot } from 'agent-orchestrator';
import { forgottenOf } from './forgotten.ts';

/** A run `nemia rm` forgot, with nothing done but what `more` says. */
const forgot = (more: Partial<Forgot> = {}): Forgot => ({
  id: 'r-1',
  kind: 'forgotten',
  removed: [],
  handedOff: [],
  gone: [],
  left: [],
  branches: [],
  files: [],
  ...more,
});

test('a removal answers each key of what `nemia rm` did with the run, and leaves out a key it has nothing for', async (t) => {
  await t.test(
    'every key: worktrees, hand-offs, those gone, files, each branch’s fate, base, repository, isolate and why it never froze',
    () => {
      const branches: Forgot['branches'] = [
        { branch: 'wf/r-1/a', deleted: true, why: 'merged' },
        { branch: 'wf/r-1/b', deleted: true, why: 'forced' },
        { branch: 'wf/r-1/c', deleted: false, why: 'default' },
        { branch: 'wf/r-1/d', deleted: false, why: 'unmerged' },
        { branch: 'wf/r-1/e', deleted: false, why: { git: 'checked out at /x' } },
        { branch: 'wf/r-1/f', deleted: false, why: { unread: 'timed out' } },
      ];
      const answered = forgottenOf(
        forgot({
          removed: ['/w/a', '/w/b'],
          handedOff: [
            { step: 'implement', branch: 'wf/r-1/implement', commit: 'abcdef1234' },
            { step: 'review', commit: '1234abcdef' },
          ],
          gone: ['/w/c'],
          files: ['runs/r-1.json', 'runs/r-1/'],
          branches,
          base: 'main',
          repo: '/r',
          isolate: true,
          unfrozen: 'no workflow folder at /wf/dev',
          left: [{ path: '/w/d', unknown: true }],
          engine: {
            forgotten: ['r-1-implement'],
            waiting: [],
            why: [],
            refused: [],
            refusedWhy: [],
            left: [],
            journalBytes: 1,
            feedLines: 1,
          },
        }),
      );
      assert.deepEqual(answered, {
        worktrees: ['/w/a', '/w/b'],
        handedOff: [
          { step: 'implement', branch: 'wf/r-1/implement', commit: 'abcdef1234' },
          { step: 'review', commit: '1234abcdef' },
        ],
        gone: ['/w/c'],
        files: ['runs/r-1.json', 'runs/r-1/'],
        branches,
        base: 'main',
        repo: '/r',
        isolate: true,
        unfrozen: 'no workflow folder at /wf/dev',
      });
    },
  );
  await t.test('a folder run says so; a run on its base itself says it cut no worktree; nothing else is sent empty', () => {
    assert.deepEqual(forgottenOf(forgot({ folder: true, files: ['runs/r-1.json'] })), {
      worktrees: [],
      handedOff: [],
      gone: [],
      files: ['runs/r-1.json'],
      branches: [],
      folder: true,
    });
    assert.deepEqual(forgottenOf(forgot({ isolate: false, repo: '/r' })), {
      worktrees: [],
      handedOff: [],
      gone: [],
      files: [],
      branches: [],
      repo: '/r',
      isolate: false,
    });
  });
});
