/**
 * Other projects are described, never named.
 *
 * Before the repository went public (`docs/plan-github-ci.md`) the owner decided that two groups of other projects are said by what
 * they do, in a few words, with no name and no link: an agent kanban this design was compared with, and a Go agent SDK, the sandbox
 * runtime it reaches through one file, and an A2A adapter for Claude Code that the thin runtime's evaluation read (2026-09-25). So
 * every file the repository holds is read, as `names.test.ts` reads them, and a line that names one is refused, history included:
 * history was rewritten too, and the Jev experiments whose recorded quotes named them left the tree on 2026-09-25.
 *
 * The names are kept here in base64, so this file does not name them either, and a search of the repository finds none. What we
 * integrate — Claude Code, Codex, A2A and its SDK — and what is compared by name on purpose are not on the list.
 *
 * Turbo caches this package's pass by this package's files, so a change elsewhere alone replays it: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, textOf } from './repo-files.ts';

/** Each name, and the one tool-call prefix that names the kanban as well as its name does. */
const NAMES = ['aGVybWVz', 'bm91c3Jlc2VhcmNo', 'Z29vZ2xlL2F4', 'c3Vic3RyYXRl', 'Y2xhdWRlLWEyYQ==', 'amN3YXRzb24=', 'a2FuYmFuXw=='].map(
  (b) => Buffer.from(b, 'base64').toString('utf8'),
);

/** Any of them, in any case: a name spelled with a capital, in a link or inside a longer word is the same name. */
const NAMED = new RegExp(NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'), 'i');

/** What is not ours to rewrite, by path from the root: the lockfile, and the vendored skill (a folder, `/` at its end). */
const NOT_OURS = ['package-lock.json', '.claude/skills/shadcn/'];

const ours = (file: string): boolean => !NOT_OURS.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

/** Each line of `text` that names another project, as `<line>: <text>`. */
function othersNamed(text: string): string[] {
  return text.split('\n').flatMap((line, i) => (NAMED.test(line) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

test('no file names another project the owner chose to describe instead', () => {
  const read = files().filter(ours);
  const found = read.flatMap((f) => {
    const text = textOf(f);
    return text === undefined ? [] : othersNamed(text).map((l) => `${f}:${l}`);
  });
  assert.deepEqual(found, [], `these name another project; say what it does in a few words, and drop its link:\n${found.join('\n')}`);
  for (const f of ['packages/agent-runtime/README.md', 'docs/eval-thin-runtime.md']) {
    assert.ok(read.includes(f), `${f} is read: the rule reads the files that named them`);
  }
});

test('REFUSED: each name, in a sentence, a link, a comment, a quote or another case', () => {
  const [kanban, research, sdk, runtime, adapter, author, tool] = NAMES as [string, string, string, string, string, string, string];
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  for (const line of [
    `This is ${cap(kanban)} Kanban's terminal tool call.`,
    `[the kanban](https://${kanban}-agent.${research}.com/docs/user-guide/features/kanban)`,
    ` * as ${sdk} reaches agent-${runtime} through one file of its own.`,
    `as ${cap(runtime)} keeps each sandbox class in its own binary`,
    `**The pattern to follow:** <https://github.com/${author}/${adapter}>`,
    `"quote": "the approver is a file. ${cap(kanban)} runs a decomposer in the dispatcher every tick"`,
    `the reviewer answers with \`${tool}request_changes\``,
    `${kanban.toUpperCase()}`,
  ]) assert.deepEqual(othersNamed(line), [`1: ${line.trim()}`], line);
  assert.deepEqual(othersNamed(`one\ntwo ${cap(runtime)}\nthree`), [`2: two ${cap(runtime)}`], 'the line is named');
});

test('a description, what we integrate and what is compared by name pass', () => {
  for (const line of [
    'An agent kanban we compared with runs a decomposer in its dispatcher every tick.',
    'as a Go agent SDK reaches its sandbox runtime through one file of its own',
    'the pattern of an A2A adapter that keeps one Claude Code process per session',
    "Claude Code, Codex, A2A and `@a2a-js/sdk`; TypeSafe's Jev; Tekton, Argo, n8n, Kubernetes",
    'The harness kanban board, rebuilt on the two libraries that replaced its core. `.kanban/` and `kb-*` worktrees',
    'const max = Math.max(ax, 1); // a word that only contains a short name',
  ]) assert.deepEqual(othersNamed(line), [], line);
});

test('REFUSED: only the lockfile and the vendored skill are left unread, matched whole', () => {
  assert.equal(ours('package-lock.json'), false);
  assert.equal(ours('.claude/skills/shadcn/SKILL.md'), false);
  for (const read of [
    'packages/agent-orchestrator/package-lock.json', 'package-lock.json.bak', '.claude/skills/shadcn-notes.md', '.claude/skills/look/SKILL.md',
    'docs/eval-2026-09-12/REPORT.md', 'docs/pivot-2026-09-18/experiments/README.md', 'CLAUDE.md',
  ]) assert.equal(ours(read), true, read);
  const all = files();
  for (const entry of NOT_OURS) assert.ok(all.some((f) => !ours(f) && (f === entry || f.startsWith(entry))), `${entry} is left unread and holds no file`);
});
