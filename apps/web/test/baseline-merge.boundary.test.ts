/**
 * Two changes that each cut the stories baseline merge clean in git's own merge: laid out a file per list and source file
 * (`shardOf`, `test/baseline.ts`), a cut is a file deleted, so neighbouring cuts in different folders, and overlapping cuts of
 * different extent in one, never meet in one file, and the merged baseline holds the base's entries less both sides' cuts and with both
 * sides' additions. The same three states laid out a file per list, as the baseline was, conflict: the control, which shows the test
 * able to fail.
 *
 * A boundary test, and git's merge is its whole subject: `git merge-tree --write-tree` merges the two heads as a merge on GitHub's
 * side does, with no driver of ours and no checkout touched, in a scratch repository.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { scratch } from 'test-kit/scratch';
import type { BaselineList } from '../contracts/baseline-shard.contract.ts';
import { FOLDER, LISTS, shardOf } from './baseline.ts';

type Lists = Readonly<Record<BaselineList, readonly string[]>>;

/** A layout of the baseline: each file it writes, by its path from the workspace root, with its text. */
type Layout = (lists: Lists) => Record<string, string>;

/** A file per list and source file, as the tree keeps it. */
const sharded: Layout = (lists) => {
  const files: Record<string, string> = {};
  for (const list of LISTS) for (const entry of lists[list]) files[shardOf(list, entry)] = `${files[shardOf(list, entry)] ?? ''}${entry}\n`;
  return files;
};

/** A file per list, as the one-file baseline kept each list: the control. */
const perList: Layout = (lists) =>
  Object.fromEntries(LISTS.filter((list) => lists[list].length > 0).map((list) => [`${FOLDER}${list}.txt`, `${lists[list].join('\n')}\n`]));

/** Runs git in `dir`, answering its status and what it printed. */
const git = (dir: string, ...args: string[]) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const ran = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    env,
    encoding: 'utf8',
  });
  return { status: ran.status, out: ran.stdout };
};

/** Commits `lists` laid out by `layout` on `branch` of `dir`, from `from`, the baseline's folder written whole. */
const commit = (dir: string, branch: string, from: string | undefined, layout: Layout, lists: Lists) => {
  if (from !== undefined) git(dir, 'checkout', '-q', '-b', branch, from);
  fs.rmSync(path.join(dir, FOLDER), { recursive: true, force: true });
  for (const [file, text] of Object.entries(layout(lists))) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', branch);
  if (from === undefined) git(dir, 'branch', '-M', branch);
};

/** What git's merge of `ours` and `theirs` from `base` answers in a fresh repository, each laid out by `layout`. */
const merged = (layout: Layout, base: Lists, ours: Lists, theirs: Lists) => {
  const dir = scratch('web-baseline-merge-');
  git(dir, 'init', '-q');
  commit(dir, 'base', undefined, layout, base);
  commit(dir, 'ours', 'base', layout, ours);
  commit(dir, 'theirs', 'base', layout, theirs);
  const { status, out } = git(dir, 'merge-tree', '--write-tree', 'ours', 'theirs');
  const tree = out.split('\n')[0] ?? '';
  const files = status === 0 ? git(dir, 'ls-tree', '-r', '--name-only', tree).out.split('\n').filter(Boolean) : [];
  const entries = files.flatMap((file) => git(dir, 'show', `${tree}:${file}`).out.split('\n').filter(Boolean));
  return { status, entries: entries.sort() };
};

const src = (file: string) => `apps/web/src/components/${file}`;
const seconds = (files: readonly string[]) => files.map((file) => `${src(file)}#@/components/ui/button:Button`);

const CONVERSATION = ['conversation/Said.tsx', 'conversation/Turn.tsx', 'conversation/Trace.tsx'];
const FACTORY = ['factory/FactoryBar.tsx', 'factory/FactoryBlock.tsx', 'factory/FactoryPicker.tsx'];
const AGENT = ['agent/AgentForm.tsx', 'agent/AgentPage.tsx', 'agent/AgentsPage.tsx', 'agent/ContextPicker.tsx', 'agent/SkillForm.tsx'];
const AGENT_LATE = ['agent/SkillPage.tsx', 'agent/SkillPicker.tsx', 'agent/TryAgent.tsx'];

const BASE: Lists = {
  storyless: [...AGENT, ...AGENT_LATE, 'command/CommandLine.tsx'].map(src),
  argless: [`${src('run/RunsPage.stories.tsx')}#Default`],
  secondSystem: seconds(['command/CopyButton.tsx', ...CONVERSATION, ...FACTORY, 'field/FilePage.tsx']),
  handDrawn: [`${src('field/FilePage.tsx')}#<button>`],
  a11yTodo: [],
};

const OURS: Lists = {
  ...BASE,
  storyless: BASE.storyless.filter((entry) => ![...AGENT_LATE, 'agent/ContextPicker.tsx'].map(src).includes(entry)),
  secondSystem: BASE.secondSystem.filter((entry) => !seconds(CONVERSATION).includes(entry)),
};

const ADDED = [`${src('agent/AgentPage.stories.tsx')}#Default`];

const THEIRS: Lists = {
  ...BASE,
  storyless: BASE.storyless.filter((entry) => ![...AGENT, ...AGENT_LATE].map(src).includes(entry)),
  secondSystem: BASE.secondSystem.filter((entry) => !seconds(FACTORY).includes(entry)),
  a11yTodo: ADDED,
};

const cutBy = (side: Lists) => LISTS.flatMap((list) => BASE[list].filter((entry) => !side[list].includes(entry)));

test("two changes' cuts of the baseline, neighbours across folders and overlapping in one, merge clean with both sides' cuts and additions", () => {
  const { status, entries } = merged(sharded, BASE, OURS, THEIRS);
  assert.equal(status, 0, 'git merges the two cuts with no conflict');
  const cut = [...cutBy(OURS), ...cutBy(THEIRS)];
  assert.deepEqual(entries, [...LISTS.flatMap((list) => BASE[list]).filter((entry) => !cut.includes(entry)), ...ADDED].sort());
});

test('REFUSED: the same two cuts laid out a file per list conflict, so the layout is what merges them', () => {
  assert.equal(merged(perList, BASE, OURS, THEIRS).status, 1);
});
