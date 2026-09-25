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
 * listings ending on `ship`, which waits for approval once the loop has succeeded, where they ended on the result branches.
 * And the same day, when the run began executing ship's check on the merge ship stages and landing it itself: each dev folder's ship brief
 * is the shipper's new recipe, with *The run checks and lands your merge* where the work's check was, and every implement and review brief
 * gained the paragraph on a job's turn. The one diff past the briefs is each dev folder's `succeeded` pin: its ship now has a check, and a
 * signed ending whose merge the run has not landed is `checking` and the run `running` — the pin writes no landing — where it read
 * `awaiting approval` before. Every other phase, plan and the forget lines are as they were. In review of that run, its round 1, each ship
 * brief gained one line under that section, that `git commit` and `git merge --continue` are denied it: the diff was that line, eight times.
 * Then that run merged main in, with the two changes above: the ship's new recipe reached both ui folders, whose ship is dev-build's,
 * each ship's check became its implement's new line, and the shipper's fourth item and the build ships' note say that check runs the
 * e2e no round's check ran. Past the briefs, the ui folders' `succeeded` pins moved to `checking` and `running`, as the dev folders' had.
 * And when planners and reviewers were given git's other read-only verbs (2026-09-25): every plan and review brief names them, from the
 * step's own directory, and the diff was that sentence, sixteen times — and nothing past the briefs.
 * And when an agent was rendered for Claude Code (2026-09-25, card 1 of the agents-and-skills design): a step whose agent has instructions
 * is told them in its system prompt (`--append-system-prompt-file`), and its brief opens on its own note, or on *What was asked for* when it
 * has none. Every one of the forty briefs moved, each exactly by its agent's instructions and the blank line after them, checked by
 * script — old brief = instructions, a blank line, new brief — and nothing past the briefs: plans, phases and forget lines stand.)
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
