/**
 * The proof that folder workspaces changed no git run: every shipped folder's runs read as they did before `workspace: folder` existed.
 *
 * `fixtures/git-runs-before.json` is what the code of the commit before folder workspaces read them as (`git-runs-pin.ts`): each step's
 * brief and workspace plan, and the run's decision, listing and offer to decide while running, once every step succeeded and once its
 * last steps failed — with worktrees and without — and a forget's line. A difference is a finding, not a fixture to refresh — with one
 * exception, because the fixture holds the shipped briefs' own words: a reword of a shipped folder or agent moves it too. Then write
 * `everything()` of `git-runs-pin.ts` over it, and read the fixture's diff: every changed line must be the sentence that was reworded,
 * and nothing else. (Done once, on 2026-09-19: main reworded the ui implementer's line about where a new e2e page goes while this
 * branch was in flight, and the ship step's check refused the merged tree. Done again on 2026-09-23, when the packages were renamed: the
 * package's `ui` copy moved folder, and the supervisor's brief names both packages' docs by their folders. And once more the same day,
 * when the supervisor became a background session in `dontAsk`: its wait is `sleep 60` alone, as its `allow:` lets no shell loop through.
 * And when `denials: fail` gave the decision a list of its own, `denied`: the diff was that key, empty, beside every `budgetExhausted`.
 * And again when `disallow:` and `allow:` took Claude Code's names, `disallowedTools:` and `allowedTools:`: the supervisor's brief names both.
 * And on 2026-09-25, when the e2e left every round's check for the merged tree: what moved is each implement check, as implement's brief
 * and the ship's *Where to look* print it, and the sentences of the implementer, ui implementer, ui reviewer, shipper and build ships that
 * say so. And later that day, when both ui folders gained the build folders' gated ship: only their two entries moved, each written from
 * `pin()` — ship's brief and plan, `ship` beside `review` where implement's brief names who worked in its workspace, and the decisions and
 * listings ending on `ship`, which waits for approval once the loop has succeeded, where they ended on the result branches.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SHIPPED, forgetLines, pin } from './git-runs-pin.ts';

const BEFORE: { folders: Record<string, unknown>; forget: string[] } =
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'git-runs-before.json'), 'utf8'));

test('the fixture holds every shipped folder, and nothing else', () => {
  assert.deepEqual(Object.keys(BEFORE.folders).sort(), [...SHIPPED].sort());
});

for (const folder of SHIPPED) {
  test(`${folder}: a git run reads as it did before folder workspaces`, () => {
    assert.deepEqual(pin(folder), BEFORE.folders[folder]);
  });
}

test('a git run is forgotten in the words it was before folder workspaces', () => {
  assert.deepEqual(forgetLines(), BEFORE.forget);
});
