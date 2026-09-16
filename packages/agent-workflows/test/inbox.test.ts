/**
 * An inbox is cards before they are started: the card, and what `wf inbox` makes of the folder and the run records — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INBOX_KEYS, parseInboxCard } from '../src/inbox.ts';

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** The directories there are, for a card's `repo:`. */
const DIRS = new Set(['/home/me/code/app', '/home/me/code/other']);
const isDirectory = (at: string) => DIRS.has(at);
const read = (text: string, file = 'cache-the-views-k2q9.md') => parseInboxCard(file, text, isDirectory);

test('an inbox card is its file: the name without .md, `workflow:` and `repo:` from its frontmatter when set — each optional — and the body', () => {
  assert.deepEqual(INBOX_KEYS, ['workflow', 'repo']);
  assert.deepEqual(read('---\nworkflow: dev\nrepo: /home/me/code/app\n---\nCache the views.\n\nBetween passes.\n'),
    { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', workflow: 'dev', repo: '/home/me/code/app', body: 'Cache the views.\n\nBetween passes.' });
  assert.deepEqual(read('Cache the views.\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', body: 'Cache the views.' }, 'no frontmatter: an idea, and nothing else');
  assert.deepEqual(read('---\nrepo: /home/me/code/other\n---\nCache the views.\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', repo: '/home/me/code/other', body: 'Cache the views.' });
  assert.deepEqual(read('---\nworkflow: ../workflows/mine\n---\nx\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', workflow: '../workflows/mine', body: 'x' });
  // Saved on Windows, with a comment and a blank line in the frontmatter; and a frontmatter of only a comment, over a body that opens with a rule.
  assert.deepEqual(read('﻿---\r\n# what runs it\r\nworkflow: dev\r\n\r\n---\r\nCache the views.\r\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', workflow: 'dev', body: 'Cache the views.' });
  assert.deepEqual(read('---\n# no keys\n---\n---\ntitle: a brief that opens with a rule\n---\nx\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', body: '---\ntitle: a brief that opens with a rule\n---\nx' });
});

test('REFUSED by name at shipped defaults: a key an inbox card does not have — `after:` with where it is said instead — `workflow:` or `repo:` set to nothing or twice, a `repo:` that is not absolute or names no directory, an empty body, and a frontmatter that never closes', () => {
  assert.throws(() => read('---\nworkflow: dev\nharness: codex\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `harness` is not a key an inbox card has\. An inbox card's keys are: workflow, repo, each optional — what runs it, and the repository it is about;/));
  assert.throws(() => read('---\nrepos: /home/me/code/app\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repos` is not a key an inbox card has\./));
  assert.throws(() => read('---\nworkflow: dev\nafter: parse-the-flag-1x2y\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `after` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — wf start <inbox>\/cache-the-views-k2q9\.md --after <runId>\. Delete the line\.$/));
  assert.throws(() => read('---\nworkflow:\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `workflow` has no value\. Delete the line rather than leaving it blank/));
  assert.throws(() => read('---\nrepo:   \n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo` has no value\./));
  assert.throws(() => read('---\nrepo: /home/me/code/app\nrepo: /home/me/code/other\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo` is set twice/));
  assert.throws(() => read('---\nrepo: code/app\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repo: code\/app` is not an absolute path\. `repo:` is the repository the idea is about, from the root/));
  assert.throws(() => read('---\nrepo: ./app\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo: \.\/app` is not an absolute path\./));
  assert.throws(() => read('---\nrepo: /home/me/code/gone\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repo: \/home\/me\/code\/gone` names no directory\. Correct it to the repository the idea is about, or delete the line/));
  assert.throws(() => read('---\nworkflow: dev\n---\n'), refusedWith(/^cache-the-views-k2q9\.md: the body is empty\./));
  assert.throws(() => read('   \n'), refusedWith(/^cache-the-views-k2q9\.md: the body is empty\./));
  assert.throws(() => read('---\nworkflow dev\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `workflow dev` is not `key: value`\./));
  assert.throws(() => read('---\nworkflow: dev\nCache the views.\n'), refusedWith(/^cache-the-views-k2q9\.md: the frontmatter opened on the first line never closes/));
});
