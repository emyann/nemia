/**
 * The place's contract, as walks: `WALKS` holds, for every verb of `PLACE_VERBS`, the sequences a place is asked and the one answer each
 * must give (`says`), written once and run on both the git place and the test place (`walksOn`), so the stand-in is held to what git
 * says. A walk is written against a `Side`, a place and the handle on its repositories, in a scratch `area` of its own.
 *
 * What a walk answers is compared as `told` tells it: each commit by the order it is first named, the area as `<area>`, a refusal
 * as `{ refused: true }` and an unread answer by its verb alone, since the two places word them their own way. `unwalked` names a verb
 * with no walk, and `failing` the walks of a verb a side does not say: a stand-in that lies fails one.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { World } from '../place/memory/index.ts';
import type { Place } from '../src/place/place.store.ts';
import type { PlaceOutcome, PlaceRequests, PlaceVerb } from '../src/place/place.ts';
import { scratch } from './scratch.ts';

/** One side of the contract: a place, and the handle on the repositories it answers of. */
export type Side = { readonly place: Place; readonly world: World };

/** One walk: what it shows, the sequence it asks of a side in `area`, and the one answer both sides give, as `told` tells it. */
export type Walk = { readonly name: string; readonly walk: (side: Side, area: string) => unknown; readonly says: unknown };

/** The folders in a directory that are a place's own, and no part of its files. */
const OWN = new Set(['.git', '.test-place']);

/** The files of `dir` by path, in folders too, without a place's own. */
function filesIn(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const read = (at: string, prefix: string): void => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      if (OWN.has(entry.name)) continue;
      if (entry.isDirectory()) read(path.join(at, entry.name), `${prefix}${entry.name}/`);
      else files[`${prefix}${entry.name}`] = fs.readFileSync(path.join(at, entry.name), 'utf8');
    }
  };
  read(dir, '');
  return files;
}

/** What `told` knows as it reads: the area, and each commit's name by the order it was first read. */
type Telling = { readonly area: string; readonly commits: Map<string, string> };

/** A string as both sides say it: the area as `<area>`, and each commit id as the name of its first reading. */
const toldText = (text: string, telling: Telling): string =>
  text.replaceAll(telling.area, '<area>').replace(/\b[0-9a-f]{40}\b/g, (id) => {
    if (!telling.commits.has(id)) telling.commits.set(id, `commit-${telling.commits.size + 1}`);
    return telling.commits.get(id)!;
  });

/** `value` as both sides say it, its keys read in order: see the file's head. */
function toldOf(value: unknown, telling: Telling): unknown {
  if (typeof value === 'string') return toldText(value, telling);
  if (Array.isArray(value)) return value.map((one) => toldOf(one, telling));
  if (typeof value !== 'object' || value === null) return value;
  const fields = value as Record<string, unknown>;
  if (typeof fields.refused === 'string') return { refused: true };
  if (typeof fields.unread === 'object' && fields.unread !== null) return { unread: (fields.unread as { verb?: unknown }).verb };
  return Object.fromEntries(
    Object.keys(fields)
      .sort()
      .map((key) => [toldText(key, telling), toldOf(fields[key], telling)]),
  );
}

/** What a walk answered in `area`, as both sides say it. */
export const told = (value: unknown, area: string): unknown => toldOf(value, { area: fs.realpathSync(area), commits: new Map() });

/** A repository at `<area>/repo` holding `files`, and its first commit. */
function repoIn({ world }: Side, area: string, files: Record<string, string> = { 'a.txt': 'one\n' }) {
  const root = path.join(area, 'repo');
  fs.mkdirSync(root);
  return { root, base: world.repository(root, files) };
}

/** A workspace of `root` at `<area>/ws/<step>` on `wf/r/<step>`, cut from `from` with `also` merged in: the request, and its outcome. */
function cut({ place }: Side, area: string, root: string, step: string, from = 'main', also: readonly string[] = []) {
  const request = { repo: root, at: path.join(area, 'ws', step), name: `wf/r/${step}`, from, also };
  return { ...request, made: place.askNow('make', request) };
}

/** The answer of `outcome`, which is one. */
function answerOf<V extends PlaceVerb>(outcome: PlaceOutcome<V>) {
  assert.ok('answer' in outcome, `an answer was expected, not ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

/** `open` of `root`, its staged file read as whether it is there. */
function opened({ place }: Side, root: string): unknown {
  const outcome = place.askNow('open', { root, isolate: false });
  return 'answer' in outcome
    ? { ...outcome.answer, staged: outcome.answer.staged !== undefined && fs.existsSync(outcome.answer.staged) }
    : outcome;
}

/** `standing` of `branches` in `root` against main. */
const stand = ({ place }: Side, root: string, branches: PlaceRequests['standing']['branches'] = []) =>
  place.askNow('standing', { repo: root, base: 'main', branches });

/** The lines a diff adds and takes away, without the lines that name its two files. */
const changedLines = (diff: string): string[] => diff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));

/** A trial as both sides say it: what is not known, in no place's words. */
const triedOf = (trials: PlaceOutcome<'trial'>): unknown =>
  'answer' in trials ? { ...trials.answer, trials: trials.answer.trials.map((t) => ('unknown' in t ? { unknown: true } : t)) } : trials;

/** A repository whose `work` branch adds `b.txt`, and `clash` and main each change `a.txt` their own way. */
function forked(side: Side, area: string) {
  const { root, base } = repoIn(side, area);
  const work = side.world.branch(root, 'work', { 'b.txt': 'two\n' });
  const clash = side.world.branch(root, 'clash', { 'a.txt': 'theirs\n' });
  const main = side.world.branch(root, 'main', { 'a.txt': 'ours\n' });
  return { root, base, work, clash, main };
}

const OPEN: readonly Walk[] = [
  {
    name: 'a repository answers its root, the branch and the commit it is on, and a staged file that is not there',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      return { base, opened: opened(side, root) };
    },
    says: { base: 'commit-1', opened: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: false } },
  },
  {
    name: 'the staged file is there while a merge is staged, and gone once it is landed or taken back',
    walk: (side, area) => {
      const { root } = forked(side, area);
      const before = opened(side, root);
      side.world.stage(root, 'work');
      const staged = opened(side, root);
      side.place.askNow('land', { checkout: root, act: 'commit', message: 'land work' });
      const landed = opened(side, root);
      side.world.stage(root, 'clash');
      const again = opened(side, root);
      side.place.askNow('land', { checkout: root, act: 'abort' });
      return { before, staged, landed, again, takenBack: opened(side, root) };
    },
    says: {
      again: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: true },
      before: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: false },
      landed: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: false },
      staged: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: true },
      takenBack: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: false },
    },
  },
  {
    name: 'REFUSED: a path that is no directory, and a directory that is no repository',
    walk: (side, area) => [opened(side, path.join(area, 'none')), opened(side, area)],
    says: [{ refused: true }, { refused: true }],
  },
];

const MAKE: readonly Walk[] = [
  {
    name: "a branch's tip is the commit it is at: a cut's is the commit it was cut from, and a branch the repository lacks has none",
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      const before = side.world.tip(root, 'wf/r/one');
      const { name } = cut(side, area, root, 'one');
      const work = side.world.branch(root, 'work', { 'b.txt': 'two\n' });
      return {
        base,
        before,
        work,
        main: side.world.tip(root, 'main'),
        cut: side.world.tip(root, name),
        onWork: side.world.tip(root, 'work'),
        none: side.world.tip(root, 'gone'),
        commit: side.world.tip(root, base),
      };
    },
    says: {
      base: 'commit-1',
      before: null,
      commit: null,
      cut: 'commit-1',
      main: 'commit-1',
      none: null,
      onWork: 'commit-2',
      work: 'commit-2',
    },
  },
  {
    name: 'a cut is a directory at `at`, on a new branch at the commit it was cut from, holding its files',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area, { 'a.txt': 'one\n', 'dir/in.txt': 'x\n' });
      const { at, made } = cut(side, area, root, 'one', base);
      return { base, made, files: filesIn(at), head: side.world.head(at), standing: stand(side, root) };
    },
    says: {
      base: 'commit-1',
      files: { 'a.txt': 'one\n', 'dir/in.txt': 'x\n' },
      head: 'commit-1',
      made: { answer: { branch: 'wf/r/one', conflicts: [], notes: [], workspace: '<area>/ws/one' } },
      standing: { answer: { branches: [], heads: { main: 'commit-1', 'wf/r/one': 'commit-1' } } },
    },
  },
  {
    name: 'a branch of `also` that changed another file is merged in, in a commit after both',
    walk: (side, area) => {
      const { root, work, main } = forked(side, area);
      const { at, name, made } = cut(side, area, root, 'one', 'main', ['work']);
      return { main, work, made, files: filesIn(at), parents: side.world.read(root, name).parents };
    },
    says: {
      files: { 'a.txt': 'ours\n', 'b.txt': 'two\n' },
      made: { answer: { branch: 'wf/r/one', conflicts: [], notes: [], workspace: '<area>/ws/one' } },
      main: 'commit-1',
      parents: ['commit-1', 'commit-2'],
      work: 'commit-2',
    },
  },
  {
    name: 'a branch of `also` that only follows the cut is taken as it is, with no commit made',
    walk: (side, area) => {
      const { root, base, work } = forked(side, area);
      const { at, made } = cut(side, area, root, 'one', base, ['work']);
      return { work, made, files: filesIn(at), head: side.world.head(at) };
    },
    says: {
      files: { 'a.txt': 'one\n', 'b.txt': 'two\n' },
      head: 'commit-1',
      made: { answer: { branch: 'wf/r/one', conflicts: [], notes: [], workspace: '<area>/ws/one' } },
      work: 'commit-1',
    },
  },
  {
    name: 'a branch of `also` that changed the same path is left in conflict and listed, and the hand-off commits it after both',
    walk: (side, area) => {
      const { root, clash, main } = forked(side, area);
      const { at, name, made } = cut(side, area, root, 'one', 'main', ['clash', 'work']);
      const marked = fs.readFileSync(path.join(at, 'a.txt'), 'utf8');
      const handed = side.place.askNow('handoff', { workspace: at, step: 'one', why: '' });
      return {
        main,
        clash,
        made,
        marked: ['<<<<<<<', 'ours\n', '=======', 'theirs\n', '>>>>>>>'].every((part) => marked.includes(part)),
        handed,
        parents: side.world.read(root, name).parents,
      };
    },
    says: {
      clash: 'commit-1',
      handed: { answer: { commit: 'commit-2' } },
      made: { answer: { branch: 'wf/r/one', conflicts: ['a.txt'], notes: [], workspace: '<area>/ws/one' } },
      main: 'commit-3',
      marked: true,
      parents: ['commit-3', 'commit-1'],
    },
  },
  {
    name: 'asked again it takes up the same workspace, with the work left uncommitted in it kept',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      const first = cut(side, area, root, 'one');
      fs.writeFileSync(path.join(first.at, 'left.txt'), 'left by the step\n');
      const again = cut(side, area, root, 'one');
      return { base, first: first.made, again: again.made, files: filesIn(again.at), head: side.world.head(again.at) };
    },
    says: {
      again: { answer: { branch: 'wf/r/one', conflicts: [], notes: [], workspace: '<area>/ws/one' } },
      base: 'commit-1',
      files: { 'a.txt': 'one\n', 'left.txt': 'left by the step\n' },
      first: { answer: { branch: 'wf/r/one', conflicts: [], notes: [], workspace: '<area>/ws/one' } },
      head: 'commit-1',
    },
  },
  {
    name: 'REFUSED: asked again once its directory was removed, it is not taken up, and its branch is there already',
    walk: (side, area) => {
      const { root } = repoIn(side, area);
      const first = cut(side, area, root, 'one');
      fs.rmSync(first.at, { recursive: true, force: true });
      const again = cut(side, area, root, 'one');
      return { first: first.made, again: again.made, there: fs.existsSync(first.at) };
    },
    says: {
      again: { refused: true },
      first: { answer: { branch: 'wf/r/one', conflicts: [], notes: [], workspace: '<area>/ws/one' } },
      there: false,
    },
  },
  {
    name: 'a branch of `also` the repository lacks is a note, and the workspace is cut all the same',
    walk: (side, area) => {
      const { root } = repoIn(side, area);
      const { at, made } = cut(side, area, root, 'one', 'main', ['nope']);
      const { notes, ...rest } = answerOf(made);
      return { ...rest, notes: notes.length, files: filesIn(at) };
    },
    says: { branch: 'wf/r/one', conflicts: [], files: { 'a.txt': 'one\n' }, notes: 1, workspace: '<area>/ws/one' },
  },
  {
    name: 'REFUSED: an `at` held on another branch, a branch that is there already, a `from` that names nothing, and no directory',
    walk: (side, area) => {
      const { root } = repoIn(side, area);
      const { at } = cut(side, area, root, 'one');
      const ask = (request: Partial<PlaceRequests['make']>) =>
        side.place.askNow('make', { repo: root, at, name: 'wf/r/one', from: 'main', also: [], ...request });
      return [
        ask({ name: 'wf/r/two' }),
        ask({ at: path.join(area, 'ws', 'other') }),
        ask({ at: path.join(area, 'ws', 'three'), name: 'wf/r/three', from: 'nope' }),
        ask({ repo: path.join(area, 'none') }),
      ];
    },
    says: [{ refused: true }, { refused: true }, { refused: true }, { refused: true }],
  },
];

const HANDOFF: readonly Walk[] = [
  {
    name: 'a workspace holds uncommitted what a step left in it, by path in order, and nothing once it is handed off',
    walk: (side, area) => {
      const { root } = repoIn(side, area, { 'a.txt': 'one\n', 'gone.txt': 'bye\n' });
      const { at } = cut(side, area, root, 'one');
      const clean = side.world.changes(at);
      fs.writeFileSync(path.join(at, 'new.txt'), 'new\n');
      fs.writeFileSync(path.join(at, 'a.txt'), 'changed\n');
      fs.rmSync(path.join(at, 'gone.txt'));
      const left = side.world.changes(at);
      side.place.askNow('handoff', { workspace: at, step: 'one', why: '' });
      return { clean, left, handedOff: side.world.changes(at), checkout: side.world.changes(root) };
    },
    says: { checkout: [], clean: [], handedOff: [], left: ['a.txt', 'gone.txt', 'new.txt'] },
  },
  {
    name: 'a clean workspace hands off nothing',
    walk: (side, area) => {
      const { root } = repoIn(side, area);
      const { at } = cut(side, area, root, 'one');
      return side.place.askNow('handoff', { workspace: at, step: 'one', why: '' });
    },
    says: { answer: { commit: null } },
  },
  {
    name: "what a step left — a file added, one changed, one removed — is committed on its branch under the hand-off's message, once",
    walk: (side, area) => {
      const { root, base } = repoIn(side, area, { 'a.txt': 'one\n', 'gone.txt': 'bye\n' });
      const { at, name } = cut(side, area, root, 'one');
      fs.writeFileSync(path.join(at, 'a.txt'), 'changed\n');
      fs.mkdirSync(path.join(at, 'dir'));
      fs.writeFileSync(path.join(at, 'dir', 'new.txt'), 'new\n');
      fs.rmSync(path.join(at, 'gone.txt'));
      const request = { workspace: at, step: 'one', why: ', before its run was forgotten' };
      const first = side.place.askNow('handoff', request);
      const report = { repo: root, baseRef: base, onto: 'main', branches: [name], diffOf: [], present: [], atBase: [] };
      return {
        base,
        first,
        head: side.world.head(at),
        commit: side.world.read(root, name),
        second: side.place.askNow('handoff', request),
        files: answerOf(side.place.askNow('report', report)).files,
      };
    },
    says: {
      base: 'commit-1',
      commit: { message: 'one: hand off what was left uncommitted, before its run was forgotten', parents: ['commit-1'] },
      files: {
        'wf/r/one': [
          { added: 1, path: 'a.txt', removed: 1, status: 'M' },
          { added: 1, path: 'dir/new.txt', removed: 0, status: 'A' },
          { added: 0, path: 'gone.txt', removed: 1, status: 'D' },
        ],
      },
      first: { answer: { commit: 'commit-2' } },
      head: 'commit-2',
      second: { answer: { commit: null } },
    },
  },
  {
    name: 'a commit is read by the paths it changed against its first parent: a first commit, a hand-off, and a merge by what it brought',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area, { 'a.txt': 'one\n', 'gone.txt': 'bye\n', 'kept.txt': 'kept\n' });
      const { at, name } = cut(side, area, root, 'one');
      fs.writeFileSync(path.join(at, 'a.txt'), 'changed\n');
      fs.mkdirSync(path.join(at, 'dir'));
      fs.writeFileSync(path.join(at, 'dir', 'new.txt'), 'new\n');
      fs.rmSync(path.join(at, 'gone.txt'));
      side.place.askNow('handoff', { workspace: at, step: 'one', why: '' });
      side.world.branch(root, 'main', { 'main.txt': 'on main\n' });
      side.world.stage(root, name);
      const merge = side.world.commit(root, 'merge one');
      return {
        first: side.world.changed(root, base),
        handed: side.world.changed(root, name),
        merge: side.world.changed(root, merge),
        byBranch: side.world.changed(root, 'main'),
      };
    },
    says: {
      first: ['a.txt', 'gone.txt', 'kept.txt'],
      handed: ['a.txt', 'dir/new.txt', 'gone.txt'],
      merge: ['a.txt', 'dir/new.txt', 'gone.txt'],
      byBranch: ['a.txt', 'dir/new.txt', 'gone.txt'],
    },
  },
  {
    name: 'REFUSED: a path that is no directory, and a directory that is no workspace',
    walk: (side, area) => [
      side.place.askNow('handoff', { workspace: path.join(area, 'none'), step: 'one', why: '' }),
      side.place.askNow('handoff', { workspace: area, step: 'one', why: '' }),
    ],
    says: [{ refused: true }, { refused: true }],
  },
];

const REPORT: readonly Walk[] = [
  {
    name: "a branch's files changed, added and removed, with their counts, the diff's lines, what is present and the base's text",
    walk: (side, area) => {
      const { root, base } = repoIn(side, area, { 'a.txt': 'one\ntwo\nthree\n', 'gone.txt': 'bye\n', 'dir/in.txt': 'x\n' });
      side.world.branch(root, 'work', { 'a.txt': 'one\n2\nthree\nfour\n', 'new.txt': 'n1\nn2\n', 'gone.txt': null });
      const { diffs, ...rest } = answerOf(
        side.place.askNow('report', {
          repo: root,
          baseRef: base,
          onto: 'main',
          branches: ['work', 'nope'],
          diffOf: ['a.txt', 'new.txt', 'gone.txt', 'dir/in.txt'],
          present: ['a.txt', 'dir', 'gone.txt', 'nope'],
          atBase: ['a.txt', 'new.txt'],
        }),
      );
      const lines = Object.fromEntries(Object.entries(diffs.work).map(([file, diff]) => [file, changedLines(diff)]));
      return { ...rest, diffs: { ...diffs, work: lines } };
    },
    says: {
      at: { baseRef: 'commit-1', onto: 'commit-1', tips: { work: 'commit-2' } },
      atBase: { 'a.txt': 'one\ntwo\nthree\n', 'new.txt': null },
      diffs: { work: { 'a.txt': ['-two', '+2', '+four'], 'gone.txt': ['-bye'], 'new.txt': ['+n1', '+n2'] } },
      files: {
        work: [
          { added: 2, path: 'a.txt', removed: 1, status: 'M' },
          { added: 0, path: 'gone.txt', removed: 1, status: 'D' },
          { added: 2, path: 'new.txt', removed: 0, status: 'A' },
        ],
      },
      present: { work: { 'a.txt': 'file', dir: 'directory', 'gone.txt': 'absent', nope: 'absent' } },
    },
  },
  {
    name: 'a branch is read against the commit it shares with the base, so what the base gained since is none of its changes',
    walk: (side, area) => {
      const { root } = forked(side, area);
      const request = { repo: root, baseRef: 'main', onto: 'nope', branches: ['work', 'main'], diffOf: [], present: [], atBase: ['b.txt'] };
      return side.place.askNow('report', request);
    },
    says: {
      answer: {
        at: { baseRef: 'main', onto: null, tips: { main: 'commit-1', work: 'commit-2' } },
        atBase: { 'b.txt': null },
        diffs: { main: {}, work: {} },
        files: { main: [], work: [{ added: 1, path: 'b.txt', removed: 0, status: 'A' }] },
        present: { main: {}, work: {} },
      },
    },
  },
  {
    name: 'REFUSED: a base the repository cannot read, and a path that is no directory',
    walk: (side, area) => {
      const { root } = repoIn(side, area);
      const ask = (repo: string, baseRef: string) =>
        side.place.askNow('report', { repo, baseRef, onto: 'main', branches: [], diffOf: [], present: [], atBase: [] });
      return [ask(root, 'nope'), ask(path.join(area, 'none'), 'main')];
    },
    says: [{ refused: true }, { refused: true }],
  },
];

const STANDING: readonly Walk[] = [
  {
    name: 'every branch and its commit; a branch at its base is on it, with no work past it',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      const { name } = cut(side, area, root, 'one');
      return { base, none: stand(side, root), one: stand(side, root, [{ branch: name, baseRef: base }]) };
    },
    says: {
      base: 'commit-1',
      none: { answer: { branches: [], heads: { main: 'commit-1', 'wf/r/one': 'commit-1' } } },
      one: {
        answer: {
          branches: [{ ahead: 0, branch: 'wf/r/one', onBase: 'yes', pastBase: false, tip: 'commit-1' }],
          heads: { main: 'commit-1', 'wf/r/one': 'commit-1' },
        },
      },
    },
  },
  {
    name: 'a branch one commit ahead is not on its base; once landed it is, with work past the commit its run started from',
    walk: (side, area) => {
      const { root, base, work } = forked(side, area);
      const asked = [{ branch: 'work', baseRef: base }];
      const ahead = stand(side, root, asked);
      side.world.stage(root, 'work');
      side.place.askNow('land', { checkout: root, act: 'commit', message: 'land work' });
      return { base, work, ahead, landed: stand(side, root, asked) };
    },
    says: {
      ahead: {
        answer: {
          branches: [{ ahead: 1, branch: 'work', onBase: 'no', pastBase: null, tip: 'commit-1' }],
          heads: { clash: 'commit-2', main: 'commit-3', work: 'commit-1' },
        },
      },
      base: 'commit-4',
      landed: {
        answer: {
          branches: [{ ahead: 0, branch: 'work', onBase: 'yes', pastBase: true, tip: 'commit-1' }],
          heads: { clash: 'commit-2', main: 'commit-5', work: 'commit-1' },
        },
      },
      work: 'commit-1',
    },
  },
  {
    name: 'a base put back on the commit before a landing no longer holds the result: the branch is ahead again, the checkout as it was',
    walk: (side, area) => {
      const { root, base, main, work } = forked(side, area);
      const asked = [{ branch: 'work', baseRef: base }];
      side.world.stage(root, 'work');
      side.place.askNow('land', { checkout: root, act: 'commit', message: 'land work' });
      fs.writeFileSync(path.join(root, 'a.txt'), 'an edit left uncommitted\n');
      fs.writeFileSync(path.join(root, 'kept.txt'), 'a file no commit knows\n');
      const landed = stand(side, root, asked);
      side.world.putBack(root, main);
      const read = () => ({
        standing: stand(side, root, asked),
        head: side.world.head(root),
        tip: side.world.tip(root, 'main'),
        files: filesIn(root),
        changes: side.world.changes(root),
        staged: side.world.staged(root),
      });
      const putBack = read();
      side.world.stage(root, 'clash');
      side.world.putBack(root, main);
      return { main, work, landed, putBack, overStaged: read() };
    },
    says: {
      landed: {
        answer: {
          branches: [{ ahead: 0, branch: 'work', onBase: 'yes', pastBase: true, tip: 'commit-1' }],
          heads: { clash: 'commit-2', main: 'commit-3', work: 'commit-1' },
        },
      },
      main: 'commit-4',
      overStaged: {
        changes: ['kept.txt'],
        files: { 'a.txt': 'ours\n', 'kept.txt': 'a file no commit knows\n' },
        head: 'commit-4',
        staged: null,
        standing: {
          answer: {
            branches: [{ ahead: 1, branch: 'work', onBase: 'no', pastBase: null, tip: 'commit-1' }],
            heads: { clash: 'commit-2', main: 'commit-4', work: 'commit-1' },
          },
        },
        tip: 'commit-4',
      },
      putBack: {
        changes: ['kept.txt'],
        files: { 'a.txt': 'ours\n', 'kept.txt': 'a file no commit knows\n' },
        head: 'commit-4',
        staged: null,
        standing: {
          answer: {
            branches: [{ ahead: 1, branch: 'work', onBase: 'no', pastBase: null, tip: 'commit-1' }],
            heads: { clash: 'commit-2', main: 'commit-4', work: 'commit-1' },
          },
        },
        tip: 'commit-4',
      },
      work: 'commit-1',
    },
  },
  {
    name: 'a branch the repository no longer has is asked of by the tip its run recorded, and is unknown with none',
    walk: (side, area) => {
      const { root, base, work } = forked(side, area);
      const answer = answerOf(
        stand(side, root, [
          { branch: 'gone', tip: base, baseRef: base },
          { branch: 'gone-ahead', tip: work, baseRef: base },
          { branch: 'gone-untold', baseRef: base },
          { branch: 'gone-unreadable', tip: 'f'.repeat(40), baseRef: base },
          { branch: 'work', baseRef: 'nope' },
        ]),
      );
      return answer.branches;
    },
    says: [
      { ahead: null, branch: 'gone', onBase: 'yes', pastBase: false, tip: null },
      { ahead: null, branch: 'gone-ahead', onBase: 'no', pastBase: null, tip: null },
      { ahead: null, branch: 'gone-untold', onBase: 'unknown', pastBase: null, tip: null },
      { ahead: null, branch: 'gone-unreadable', onBase: 'unknown', pastBase: null, tip: null },
      { ahead: 1, branch: 'work', onBase: 'no', pastBase: null, tip: 'commit-1' },
    ],
  },
  {
    name: 'what was known of a branch is believed while its commit is the one judged, and asked again once it is another',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      const { name } = cut(side, area, root, 'one');
      const answer = answerOf(
        stand(side, root, [
          { branch: name, baseRef: base, known: { tip: base, pastBase: true } },
          { branch: name, baseRef: base, known: { tip: 'f'.repeat(40), pastBase: true } },
          { branch: name, baseRef: base, known: { tip: base, pastBase: null } },
        ]),
      );
      return answer.branches;
    },
    says: [
      { ahead: 0, branch: 'wf/r/one', onBase: 'yes', pastBase: true, tip: 'commit-1' },
      { ahead: 0, branch: 'wf/r/one', onBase: 'yes', pastBase: false, tip: 'commit-1' },
      { ahead: 0, branch: 'wf/r/one', onBase: 'yes', pastBase: false, tip: 'commit-1' },
    ],
  },
  {
    name: 'REFUSED: a directory that is no repository, a path that is none, and a base that names nothing',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      const ask = (repo: string, onto: string) =>
        side.place.askNow('standing', { repo, base: onto, branches: [{ branch: 'main', baseRef: base }] });
      return [ask(area, 'main'), ask(path.join(area, 'none'), 'main'), ask(root, 'nope')];
    },
    says: [{ refused: true }, { refused: true }, { refused: true }],
  },
];

const TRIAL: readonly Walk[] = [
  {
    name: 'a branch on another file tries clean, one on the same path conflicts with the path named, and one that is lacking is unknown',
    walk: (side, area) => {
      const { root, main } = forked(side, area);
      const trials = [
        { onto: 'main', branch: 'work' },
        { onto: 'main', branch: 'clash' },
        { onto: 'main', branch: 'nope' },
        { onto: 'nope', branch: 'work' },
        { onto: 'work', branch: 'main' },
      ];
      return { main, tried: triedOf(side.place.askNow('trial', { repo: root, trials })), head: side.world.head(root) };
    },
    says: {
      head: 'commit-1',
      main: 'commit-1',
      tried: {
        at: { main: 'commit-1', nope: null, work: 'commit-2' },
        trials: [{ clean: true }, { clean: false, conflicts: ['a.txt'] }, { unknown: true }, { unknown: true }, { clean: true }],
      },
    },
  },
  {
    name: 'REFUSED: a path that is no directory',
    walk: (side, area) => side.place.askNow('trial', { repo: path.join(area, 'none'), trials: [{ onto: 'main', branch: 'work' }] }),
    says: { refused: true },
  },
];

const STATUS: readonly Walk[] = [
  {
    name: 'nothing staged: no merge, and each tip the checkout does not hold is missing',
    walk: (side, area) => {
      const { root, base, work } = forked(side, area);
      return { base, work, status: side.place.askNow('status', { checkout: root, tips: { work, landed: base } }) };
    },
    says: {
      base: 'commit-1',
      status: { answer: { conflicted: false, head: 'commit-2', merging: 'none', missing: ['work'] } },
      work: 'commit-3',
    },
  },
  {
    name: "a merge staged of the run's tips is ours, with another commit it is another's, and a tip it leaves out is missing",
    walk: (side, area) => {
      const { root, work, clash } = forked(side, area);
      side.world.stage(root, 'work');
      const ask = (tips: Record<string, string>) => side.place.askNow('status', { checkout: root, tips });
      return { work, clash, ours: ask({ work }), leavesOut: ask({ work, clash }), other: ask({ clash }), none: ask({}) };
    },
    says: {
      clash: 'commit-1',
      leavesOut: { answer: { conflicted: false, head: 'commit-2', merging: 'ours', missing: ['clash'] } },
      none: { answer: { conflicted: false, head: 'commit-2', merging: 'other', missing: [] } },
      other: { answer: { conflicted: false, head: 'commit-2', merging: 'other', missing: ['clash'] } },
      ours: { answer: { conflicted: false, head: 'commit-2', merging: 'ours', missing: [] } },
      work: 'commit-3',
    },
  },
  {
    name: 'a merge a person stages is read by the commit it merges; taken back, nothing is staged, the checkout is clean and no merge is read',
    walk: (side, area) => {
      const { root, main, work, clash } = forked(side, area);
      const read = () => ({
        staged: side.world.staged(root),
        changes: side.world.changes(root),
        head: side.world.head(root),
        files: Object.keys(filesIn(root)),
        ours: filesIn(root)['a.txt'] === 'ours\n',
        opened: opened(side, root),
        status: side.place.askNow('status', { checkout: root, tips: { work } }),
      });
      side.world.takeBack(root);
      const nothingTaken = read();
      side.world.stage(root, 'work');
      const clean = read();
      side.world.takeBack(root);
      const cleanBack = read();
      side.world.stage(root, 'clash');
      const conflicted = read();
      side.world.takeBack(root);
      return { main, work, clash, nothingTaken, clean, cleanBack, conflicted, conflictedBack: read() };
    },
    says: {
      clash: 'commit-1',
      clean: {
        changes: ['b.txt'],
        files: ['a.txt', 'b.txt'],
        head: 'commit-2',
        opened: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: true },
        ours: true,
        staged: 'commit-3',
        status: { answer: { conflicted: false, head: 'commit-2', merging: 'ours', missing: [] } },
      },
      cleanBack: {
        changes: [],
        files: ['a.txt'],
        head: 'commit-2',
        opened: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: false },
        ours: true,
        staged: null,
        status: { answer: { conflicted: false, head: 'commit-2', merging: 'none', missing: ['work'] } },
      },
      conflicted: {
        changes: ['a.txt'],
        files: ['a.txt'],
        head: 'commit-2',
        opened: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: true },
        ours: false,
        staged: 'commit-1',
        status: { answer: { conflicted: true, head: 'commit-2', merging: 'other', missing: ['work'] } },
      },
      conflictedBack: {
        changes: [],
        files: ['a.txt'],
        head: 'commit-2',
        opened: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: false },
        ours: true,
        staged: null,
        status: { answer: { conflicted: false, head: 'commit-2', merging: 'none', missing: ['work'] } },
      },
      main: 'commit-2',
      nothingTaken: {
        changes: [],
        files: ['a.txt'],
        head: 'commit-2',
        opened: { baseRef: 'commit-2', branch: 'main', repo: '<area>/repo', staged: false },
        ours: true,
        staged: null,
        status: { answer: { conflicted: false, head: 'commit-2', merging: 'none', missing: ['work'] } },
      },
      work: 'commit-3',
    },
  },
  {
    name: 'a staged merge that conflicts says so, and one landed is no merge, its tip no longer missing',
    walk: (side, area) => {
      const { root, work, clash } = forked(side, area);
      side.world.stage(root, 'clash');
      const conflicted = side.place.askNow('status', { checkout: root, tips: { clash } });
      side.place.askNow('land', { checkout: root, act: 'abort' });
      side.world.stage(root, 'work');
      side.place.askNow('land', { checkout: root, act: 'commit', message: 'land work' });
      return { conflicted, landed: side.place.askNow('status', { checkout: root, tips: { work } }) };
    },
    says: {
      conflicted: { answer: { conflicted: true, head: 'commit-1', merging: 'ours', missing: [] } },
      landed: { answer: { conflicted: false, head: 'commit-2', merging: 'none', missing: [] } },
    },
  },
  {
    name: 'REFUSED: a directory that is no repository, and a path that is none',
    walk: (side, area) => [
      side.place.askNow('status', { checkout: area, tips: {} }),
      side.place.askNow('status', { checkout: path.join(area, 'none'), tips: {} }),
    ],
    says: [{ refused: true }, { refused: true }],
  },
];

const LAND: readonly Walk[] = [
  {
    name: 'commit answers the new head, a commit after the old head and the tip, under the message given, holding the merge',
    walk: (side, area) => {
      const { root, main, work } = forked(side, area);
      side.world.stage(root, 'work');
      const landed = side.place.askNow('land', { checkout: root, act: 'commit', message: 'Land work\n\nIt adds b.\n' });
      return { main, work, landed, head: side.world.head(root), commit: side.world.read(root, 'main'), files: filesIn(root) };
    },
    says: {
      commit: { message: 'Land work\n\nIt adds b.', parents: ['commit-1', 'commit-2'] },
      files: { 'a.txt': 'ours\n', 'b.txt': 'two\n' },
      head: 'commit-3',
      landed: { answer: { commit: 'commit-3' } },
      main: 'commit-1',
      work: 'commit-2',
    },
  },
  {
    name: 'the commit holds the merge as staged: a file left in the checkout since, and an edit not taken, stay uncommitted there',
    walk: (side, area) => {
      const { root, main } = forked(side, area);
      side.world.stage(root, 'work');
      fs.writeFileSync(path.join(root, 'left.txt'), 'left by the check\n');
      fs.writeFileSync(path.join(root, 'b.txt'), 'edited since\n');
      const landed = side.place.askNow('land', { checkout: root, act: 'commit', message: 'land work' });
      const report = { repo: root, baseRef: main, onto: 'main', branches: ['main'], diffOf: [], present: ['left.txt'], atBase: [] };
      const { files, present } = answerOf(side.place.askNow('report', { ...report, atBase: [] }));
      const after = answerOf(side.place.askNow('report', { ...report, baseRef: 'main', atBase: ['b.txt'] })).atBase;
      return { main, landed, files, present, after, checkout: listed(side, root, area) };
    },
    says: {
      after: { 'b.txt': 'two\n' },
      checkout: {
        branches: [],
        workspaces: [
          {
            branch: 'main',
            changes: ['b.txt', 'left.txt'],
            clean: false,
            detached: false,
            head: 'commit-1',
            onBranch: true,
            path: '<area>/repo',
            prunable: false,
          },
        ],
      },
      files: { main: [{ added: 1, path: 'b.txt', removed: 0, status: 'A' }] },
      landed: { answer: { commit: 'commit-1' } },
      main: 'commit-2',
      present: { main: { 'left.txt': 'absent' } },
    },
  },
  {
    name: 'a conflict resolved in the checkout is one no longer: status says so, and the commit holds the resolution',
    walk: (side, area) => {
      const { root, main, clash } = forked(side, area);
      side.world.stage(root, 'clash');
      const before = side.place.askNow('status', { checkout: root, tips: { clash } });
      fs.writeFileSync(path.join(root, 'a.txt'), 'both\n');
      side.world.resolve(root, 'a.txt');
      const resolved = side.place.askNow('status', { checkout: root, tips: { clash } });
      const landed = side.place.askNow('land', { checkout: root, act: 'commit', message: 'land clash' });
      const report = { repo: root, baseRef: 'main', onto: 'main', branches: [], diffOf: [], present: [], atBase: ['a.txt'] };
      return {
        main,
        clash,
        before,
        resolved,
        landed,
        commit: side.world.read(root, 'main'),
        text: answerOf(side.place.askNow('report', report)).atBase,
        checkout: listed(side, root, area),
      };
    },
    says: {
      before: { answer: { conflicted: true, head: 'commit-1', merging: 'ours', missing: [] } },
      checkout: {
        branches: [],
        workspaces: [
          { branch: 'main', clean: true, detached: false, head: 'commit-2', onBranch: true, path: '<area>/repo', prunable: false },
        ],
      },
      clash: 'commit-3',
      commit: { message: 'land clash', parents: ['commit-1', 'commit-3'] },
      landed: { answer: { commit: 'commit-2' } },
      main: 'commit-1',
      resolved: { answer: { conflicted: false, head: 'commit-1', merging: 'ours', missing: [] } },
      text: { 'a.txt': 'both\n' },
    },
  },
  {
    name: 'abort takes the merge back: the head where it was, the files as they were, and nothing staged',
    walk: (side, area) => {
      const { root, main } = forked(side, area);
      side.world.stage(root, 'clash');
      const aborted = side.place.askNow('land', { checkout: root, act: 'abort' });
      return { main, aborted, head: side.world.head(root), files: filesIn(root), opened: opened(side, root) };
    },
    says: {
      aborted: { answer: { aborted: true } },
      files: { 'a.txt': 'ours\n' },
      head: 'commit-1',
      main: 'commit-1',
      opened: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: false },
    },
  },
  {
    name: 'REFUSED: either act with nothing staged, a commit of a merge still in conflict, which stays staged, and no repository',
    walk: (side, area) => {
      const { root, main } = forked(side, area);
      const commit = (checkout: string) => side.place.askNow('land', { checkout, act: 'commit', message: 'land' });
      const nothing = [commit(root), side.place.askNow('land', { checkout: root, act: 'abort' })];
      side.world.stage(root, 'clash');
      return { main, nothing, conflicted: commit(root), head: side.world.head(root), opened: opened(side, root), none: commit(area) };
    },
    says: {
      conflicted: { refused: true },
      head: 'commit-1',
      main: 'commit-1',
      none: { refused: true },
      nothing: [{ refused: true }, { refused: true }],
      opened: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: true },
    },
  },
];

/** A repository with two workspaces: `one` as it was cut, and `two` with a commit of its own, a tracked file changed and one added. */
function twoWorkspaces(side: Side, area: string) {
  const { root, base } = repoIn(side, area);
  const one = cut(side, area, root, 'one');
  const two = cut(side, area, root, 'two');
  fs.writeFileSync(path.join(two.at, 'b.txt'), 'two\n');
  const committed = side.world.commit(two.at, 'add b');
  fs.writeFileSync(path.join(two.at, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(two.at, 'left.txt'), 'left\n');
  return { root, base, one, two, committed };
}

/** `inventory` of `root` under `under`, its workspaces by path. */
function listed(side: Side, root: string, under: string): unknown {
  const outcome = side.place.askNow('inventory', { repo: root, under, prefix: 'wf/r/', base: 'main' });
  if (!('answer' in outcome)) return outcome;
  return { ...outcome.answer, workspaces: [...outcome.answer.workspaces].sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

const INVENTORY: readonly Walk[] = [
  {
    name: 'the workspaces inside `under`, each clean or with the paths it holds uncommitted, and the branches under the prefix, merged or not',
    walk: (side, area) => {
      const { root, base, committed } = twoWorkspaces(side, area);
      side.world.branch(root, 'other', { 'c.txt': 'three\n' });
      return { base, committed, inside: listed(side, root, path.join(area, 'ws')), elsewhere: listed(side, root, path.join(area, 'else')) };
    },
    says: {
      base: 'commit-1',
      committed: 'commit-2',
      elsewhere: {
        branches: [
          { branch: 'wf/r/one', merged: true },
          { branch: 'wf/r/two', merged: false },
        ],
        workspaces: [],
      },
      inside: {
        branches: [
          { branch: 'wf/r/one', merged: true },
          { branch: 'wf/r/two', merged: false },
        ],
        workspaces: [
          { branch: 'wf/r/one', clean: true, detached: false, head: 'commit-1', onBranch: true, path: '<area>/ws/one', prunable: false },
          {
            branch: 'wf/r/two',
            changes: ['a.txt', 'left.txt'],
            clean: false,
            detached: false,
            head: 'commit-2',
            onBranch: true,
            path: '<area>/ws/two',
            prunable: false,
          },
        ],
      },
    },
  },
  {
    name: 'a new file in a folder the commit knows is its path, and a folder the commit does not know is named once, whatever it holds',
    walk: (side, area) => {
      const { root } = repoIn(side, area, { 'a.txt': 'one\n', 'kept/a.txt': 'one\n' });
      const { at } = cut(side, area, root, 'one');
      fs.writeFileSync(path.join(at, 'kept', 'new.txt'), 'new\n');
      fs.mkdirSync(path.join(at, 'fresh', 'deep'), { recursive: true });
      fs.writeFileSync(path.join(at, 'fresh', 'deep', 'new.txt'), 'new\n');
      fs.writeFileSync(path.join(at, 'fresh', 'other.txt'), 'new\n');
      const outcome = side.place.askNow('inventory', { repo: root, under: path.join(area, 'ws'), prefix: 'wf/r/', base: 'main' });
      return answerOf(outcome).workspaces.map((w) => w.changes);
    },
    says: [['fresh/', 'kept/new.txt']],
  },
  {
    name: 'a repository that is no directory left nothing: it answers empty',
    walk: (side, area) => listed(side, path.join(area, 'none'), area),
    says: { branches: [], workspaces: [] },
  },
  {
    name: 'a directory that is no repository is no answer: unread, never an empty inventory',
    walk: (side, area) => listed(side, area, area),
    says: { unread: 'inventory' },
  },
];

/** `remove` asked of `root`, what was left and kept said without the place's words. */
function removed(side: Side, root: string, workspaces: readonly string[], branches: readonly string[]): unknown {
  const outcome = side.place.askNow('remove', { repo: root, workspaces, branches });
  if (!('answer' in outcome)) return outcome;
  const { left, kept, ...rest } = outcome.answer;
  return { ...rest, left: left.map((l) => l.path), kept: kept.map((k) => k.branch) };
}

const REMOVE: readonly Walk[] = [
  {
    name: 'a clean workspace goes with its directory and its branch; one that holds work is left, its branch kept, as is one not there',
    walk: (side, area) => {
      const { root, one, two } = twoWorkspaces(side, area);
      const answer = removed(side, root, [one.at, two.at, path.join(area, 'ws', 'never')], [one.name, two.name, 'nope']);
      return {
        answer,
        there: [one.at, two.at].map((at) => fs.existsSync(at)),
        standing: stand(side, root),
        left: listed(side, root, area),
      };
    },
    says: {
      answer: { deleted: ['wf/r/one'], kept: ['wf/r/two', 'nope'], left: ['<area>/ws/two', '<area>/ws/never'], removed: ['<area>/ws/one'] },
      left: {
        branches: [{ branch: 'wf/r/two', merged: false }],
        workspaces: [
          { branch: 'main', clean: true, detached: false, head: 'commit-1', onBranch: true, path: '<area>/repo', prunable: false },
          {
            branch: 'wf/r/two',
            changes: ['a.txt', 'left.txt'],
            clean: false,
            detached: false,
            head: 'commit-2',
            onBranch: true,
            path: '<area>/ws/two',
            prunable: false,
          },
        ],
      },
      standing: { answer: { branches: [], heads: { main: 'commit-1', 'wf/r/two': 'commit-2' } } },
      there: [false, true],
    },
  },
  {
    name: 'a workspace whose directory is gone is forgotten, and its branch can then be deleted',
    walk: (side, area) => {
      const { root } = repoIn(side, area);
      const { at, name } = cut(side, area, root, 'one');
      const held = removed(side, root, [], [name]);
      fs.rmSync(at, { recursive: true });
      return { held, gone: removed(side, root, [], [name]), left: listed(side, root, path.join(area, 'ws')) };
    },
    says: {
      gone: { deleted: ['wf/r/one'], kept: [], left: [], removed: [] },
      held: { deleted: [], kept: ['wf/r/one'], left: [], removed: [] },
      left: { branches: [], workspaces: [] },
    },
  },
  {
    name: 'REFUSED: a path that is no directory',
    walk: (side, area) => removed(side, path.join(area, 'none'), [], []),
    says: { refused: true },
  },
];

const EXPORT: readonly Walk[] = [
  {
    name: "a tag's files are written into a folder not there yet, as the tag has them, with its commit",
    walk: (side, area) => {
      const { root, base } = repoIn(side, area, { 'a.txt': 'one\n', 'dir/in.txt': 'x\n' });
      side.world.tag(root, 'v1', base);
      side.world.branch(root, 'main', { 'a.txt': 'later\n', 'c.txt': 'three\n' });
      const into = path.join(area, 'out');
      return { base, exported: side.place.askNow('export', { repo: root, tag: 'v1', into }), files: filesIn(into) };
    },
    says: { base: 'commit-1', exported: { answer: { commit: 'commit-1' } }, files: { 'a.txt': 'one\n', 'dir/in.txt': 'x\n' } },
  },
  {
    name: 'REFUSED: a tag the repository lacks, a folder that holds something, and a path that is no directory',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      side.world.tag(root, 'v1', base);
      const ask = (repo: string, tag: string, into: string) => side.place.askNow('export', { repo, tag, into });
      return [ask(root, 'v2', path.join(area, 'out')), ask(root, 'v1', root), ask(path.join(area, 'none'), 'v1', path.join(area, 'out'))];
    },
    says: [{ refused: true }, { refused: true }, { refused: true }],
  },
];

const SEAL: readonly Walk[] = [
  {
    name: 'an exported tree is sealed once, its files as they were, and a folder no export wrote has nothing to take away',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      side.world.tag(root, 'v1', base);
      const into = path.join(area, 'out');
      side.place.askNow('export', { repo: root, tag: 'v1', into });
      const first = side.place.askNow('seal', { tree: into });
      fs.mkdirSync(path.join(area, 'plain'));
      const plain = side.place.askNow('seal', { tree: path.join(area, 'plain') });
      return { first, again: side.place.askNow('seal', { tree: into }), plain, files: filesIn(into), own: fs.readdirSync(into).sort() };
    },
    says: {
      again: { answer: { removed: false } },
      files: { 'a.txt': 'one\n' },
      first: { answer: { removed: true } },
      own: ['a.txt'],
      plain: { answer: { removed: false } },
    },
  },
  {
    name: 'REFUSED: a path that is no directory, and a repository that holds a commit, which is left as it is',
    walk: (side, area) => {
      const { root, base } = repoIn(side, area);
      const outcomes = [side.place.askNow('seal', { tree: path.join(area, 'none') }), side.place.askNow('seal', { tree: root })];
      return { base, outcomes, opened: opened(side, root) };
    },
    says: {
      base: 'commit-1',
      opened: { baseRef: 'commit-1', branch: 'main', repo: '<area>/repo', staged: false },
      outcomes: [{ refused: true }, { refused: true }],
    },
  },
];

/** The contract: every verb's walks. A verb of `PLACE_VERBS` with no entry does not compile, and one with none fails `unwalked`. */
export const WALKS: { readonly [V in PlaceVerb]: readonly Walk[] } = {
  open: OPEN,
  make: MAKE,
  handoff: HANDOFF,
  report: REPORT,
  standing: STANDING,
  trial: TRIAL,
  status: STATUS,
  land: LAND,
  inventory: INVENTORY,
  remove: REMOVE,
  export: EXPORT,
  seal: SEAL,
};

/** The verbs of `verbs` that `walks` holds no walk for. */
export const unwalked = (verbs: readonly string[], walks: Readonly<Record<string, readonly Walk[] | undefined>>): string[] =>
  verbs.filter((verb) => !walks[verb]?.length);

/** What `walk` answers on `side`, in an area of its own, as both sides say it. */
export function walked(walk: Walk, side: Side): unknown {
  const area = scratch('wf-place-walk-');
  return told(walk.walk(side, area), area);
}

/** The walks of `verb` that a side `sideOf` makes, a new one for each, does not answer as the contract says, by name. */
export const failing = (verb: PlaceVerb, sideOf: () => Side): string[] =>
  WALKS[verb]
    .filter((walk) => {
      try {
        assert.deepStrictEqual(walked(walk, sideOf()), walk.says);
        return false;
      } catch {
        return true;
      }
    })
    .map((walk) => walk.name);

/**
 * Every walk of the contract as a test of the side `sideOf` makes, a new one for each: its name, `<verb>: <walk>`, and its body. The
 * file of a side declares each with `test`, so the runner counts the test as that file's.
 */
export const walksOn = (sideOf: () => Side): (readonly [name: string, body: () => void])[] =>
  Object.entries(WALKS).flatMap(([verb, walks]) =>
    walks.map((walk) => [`${verb}: ${walk.name}`, () => assert.deepStrictEqual(walked(walk, sideOf()), walk.says)] as const),
  );
