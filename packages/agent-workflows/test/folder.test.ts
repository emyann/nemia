/**
 * A run that needs no git repository: a team whose steps say `workspace: folder`, started, advanced, decided and forgotten from a
 * directory that is not a repository, with a `git` first on PATH that fails and writes down that it was asked. Every test ends by
 * reading that list: a folder run runs no git at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-folder-'));
const NOT_A_REPO = path.join(ROOT, 'somewhere');
const TEAM = path.join(ROOT, 'workflows', 'note');
const GIT_ASKED = path.join(ROOT, 'git-asked');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(NOT_A_REPO, { recursive: true });
fs.mkdirSync(TEAM, { recursive: true });
fs.writeFileSync(path.join(TEAM, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Write(**)\n---\nwrite the note\n');
fs.writeFileSync(path.join(TEAM, 'review.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nafter: write\n---\nreview the note\n');

// A `git` that refuses and says so, first on PATH: anything that reaches for git during a folder run is written down.
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'git'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(GIT_ASKED)}\necho "fatal: not a git repository" >&2\nexit 128\n`, { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const gitAsked = (): string[] => (fs.existsSync(GIT_ASKED) ? fs.readFileSync(GIT_ASKED, 'utf8').trim().split('\n') : []);

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { addToInbox, advance, decide, forget, list, readRun, start } = await import('../src/runner.ts');
const { forgetLine } = await import('../src/run.ts');
const { main } = await import('../src/cli.ts');

/** What `main` printed, line by line, while it ran. */
const printed = async (argv: string[], e?: Engine): Promise<string[]> => {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try { await main(argv, e as Parameters<typeof main>[1]); } finally { console.log = log; }
  return lines.join('\n').split('\n');
};
type Engine = Parameters<typeof advance>[0];

const SIGNED = { outcome: 'done', summary: 'wrote it', artifacts: ['note.md'], needs: null };

/** Just enough engine: what each task is doing and how it signed off, and every task's spec as it was filed. */
const board = () => {
  const tasks = new Map<string, { spec: { id: string; brief: string; cwd: string }; phase: string; closeout?: unknown }>();
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', settled, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null, startedAt: '2026-09-19T10:00:00Z', spawnedAt: null, endedAt: null, reason: null }],
        },
      };
    },
    file: async (spec: { id: string; brief: string; cwd: string }) => { tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async () => {},
    logs: async () => '',
    feed: async () => ({ entries: [], cursor: 0 }),
  } as unknown as Engine;
  const settle = (id: string, phase: string, closeout?: unknown) => { tasks.set(id, { ...tasks.get(id)!, phase, closeout }); };
  return { e, tasks, settle };
};

const refusal = (fn: () => unknown): { message: string; exitCode: unknown } => {
  try { fn(); } catch (err) { return { message: (err as Error).message, exitCode: (err as { exitCode?: unknown }).exitCode }; }
  assert.fail('it was not refused');
};

test('a folder team starts from a directory that is no repository, and its record has a place and no git', () => {
  const run = start({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM });
  const record = readRun(run.id);
  assert.deepEqual(record.place, { kind: 'folder' });
  assert.equal(record.workspace, path.join(ROOT, 'runs', run.id, 'work'));
  for (const key of ['repo', 'baseRef', 'branch', 'isolate'] as const) assert.equal(key in record, false, `${key} is not on a folder run's record`);
  assert.deepEqual(record.steps, { write: { taskId: null }, review: { taskId: null } });
  assert.deepEqual(gitAsked(), []);
});

test('a folder team refuses --repo, --no-worktree and --after, before anything is written', () => {
  const before = fs.readdirSync(path.join(ROOT, 'runs')).sort();
  const named = refusal(() => start({ brief: 'x', repo: NOT_A_REPO, repoNamed: true, workflowDir: TEAM }));
  assert.equal(named.exitCode, 2);
  assert.match(named.message, /^--repo .*: this workflow's steps say `workspace: folder`/);
  assert.match(named.message, /Start it without --repo/);

  const inPlace = refusal(() => start({ brief: 'x', repo: NOT_A_REPO, workflowDir: TEAM, isolate: false }));
  assert.equal(inPlace.exitCode, 2);
  assert.match(inPlace.message, /^--no-worktree: this workflow's steps say `workspace: folder`/);

  const waiting = refusal(() => start({ brief: 'x', repo: NOT_A_REPO, workflowDir: TEAM, after: ['some-run-a1b2'] }));
  assert.equal(waiting.exitCode, 2);
  assert.match(waiting.message, /^--after some-run-a1b2: this run's team works in folders \(workspace: folder\)/);

  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'runs')).sort(), before, 'nothing was written');
  assert.deepEqual(gitAsked(), []);
});

test('a git team is still a git run: from a directory that is no repository, it is refused by git', () => {
  const GIT_TEAM = path.join(ROOT, 'workflows', 'plain');
  fs.mkdirSync(GIT_TEAM, { recursive: true });
  fs.writeFileSync(path.join(GIT_TEAM, 'write.md'), 'write the note\n');
  assert.throws(() => start({ brief: 'x', repo: NOT_A_REPO, workflowDir: GIT_TEAM }));
  assert.ok(gitAsked().length > 0, 'a git team asks git');
  fs.rmSync(GIT_ASKED, { force: true });
});

test('a folder run advances, is decided and is forgotten with no git: each step works in its folder, the next continues it, and wf rm takes it all', async () => {
  const run = start({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM });
  const { e, tasks, settle } = board();

  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['write']);
  const write = tasks.get(`${run.id}-write`)!.spec;
  const writeFolder = path.join(ROOT, 'runs', run.id, 'work', 'write');
  assert.equal(write.cwd, writeFolder);
  assert.ok(fs.statSync(writeFolder).isDirectory(), 'made before the step is filed');
  assert.doesNotMatch(write.brief, /\bgit\b|branch|commit/i);
  fs.writeFileSync(path.join(writeFolder, 'note.md'), '# Tides\n');

  settle(`${run.id}-write`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['review']);
  // Collected at the hand-off, as on a git run, into the step's own files directory.
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'write', 'note.md'), 'utf8'), '# Tides\n');
  // A chain continues its parent's folder.
  assert.equal(tasks.get(`${run.id}-review`)!.spec.cwd, writeFolder);
  assert.equal(readRun(run.id).steps.review?.branch, undefined);

  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, artifacts: [] });
  await advance(e, readRun(run.id));
  const decided = await decide(e, run.id);
  assert.equal(decided.decision.kind, 'awaiting');
  assert.deepEqual(decided.decision.kind === 'awaiting' && [decided.decision.branches, decided.decision.direct], [[], false]);
  assert.deepEqual([decided.standings, decided.toDecide], [[], undefined]);
  const listed = await list(e, readRun(run.id));
  assert.deepEqual(listed.steps.map((s) => s.branch), [null, null], 'no branch to list');

  // wf decide says where the work is and the one command there is, and no git command.
  const screen = await printed(['decide', run.id], e);
  assert.ok(screen.includes(`  worked in folders, with no git repository: ${path.join(ROOT, 'runs', run.id, 'work')}, a folder per step; nothing to merge`), screen.join('\n'));
  assert.equal(screen.at(-1), `  done with it   wf rm ${run.id}  — forgets the run with its folders and files`);
  assert.equal(screen.filter((l) => /\bgit (-C|merge|branch|diff)/.test(l)).length, 0, screen.join('\n'));

  const forgot = await forget(e, run.id);
  assert.equal(forgot.kind, 'forgotten');
  assert.equal(forgot.folder, true);
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', run.id)), false, 'its folders went with it');
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${run.id}.json`)), false);
  assert.match(forgetLine(forgot), new RegExp(`^${run.id}  forgotten: a folder run, whose steps worked in its own directory — no worktrees, no branches`));
  assert.deepEqual(gitAsked(), [], 'and nothing asked git');
});

test('wf start from a directory that is no repository: a folder team starts, and --repo named is refused in its words', async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    const out = await printed(['start', 'a note on tides', '--workflows', TEAM]);
    const id = out[0]!.split(' ')[0]!;
    assert.equal(readRun(id).place?.kind, 'folder');
    assert.ok(out.includes(`workspace: ${path.join(ROOT, 'runs', id, 'work')} — a folder per step, made as each is filed, with no git repository`), out.join('\n'));
    await assert.rejects(main(['start', 'a note on tides', '--workflows', TEAM, '--repo', '.']),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith(`--repo ${NOT_A_REPO}: this workflow's steps say \`workspace: folder\``));
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

test('an inbox card of a folder team: --repo named at its start is refused, as on a brief, and the card\'s own repo: is not looked at', async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    // As the board files one: with the repository it was about, which a folder team never reads.
    const { card, file } = addToInbox({ text: 'a note on tides', workflow: TEAM, repo: NOT_A_REPO });
    await assert.rejects(main(['start', file, '--repo', '.']),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith(`--repo ${NOT_A_REPO}: this workflow's steps say \`workspace: folder\``));
    assert.ok(fs.existsSync(file), 'refused before anything is written: the card is still in the inbox');
    const out = await printed(['start', file]);
    const run = readRun(out[0]!.split(' ')[0]!);
    assert.deepEqual([run.place?.kind, run.from?.inbox, 'repo' in run], ['folder', card.name, false]);
    assert.ok(!fs.existsSync(file), 'started, the card leaves the inbox');
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

test('the shipped note team is a folder team: it starts with no repository, and review continues write\'s folder, handed its title and gist', async () => {
  const shipped = path.join(import.meta.dirname, '..', '..', '..', 'workflows', 'note');
  const run = start({ brief: 'a note on how tides work', repo: NOT_A_REPO, workflowDir: shipped });
  assert.deepEqual(readRun(run.id).place, { kind: 'folder' });
  const { e, tasks, settle } = board();
  await advance(e, readRun(run.id));
  const write = tasks.get(`${run.id}-write`)!.spec;
  fs.writeFileSync(path.join(write.cwd, 'note.md'), '# Tides\n');
  settle(`${run.id}-write`, 'succeeded', { ...SIGNED, title: 'Tides', gist: 'The moon pulls the sea.' });
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['review']);
  const review = tasks.get(`${run.id}-review`)!.spec;
  assert.equal(review.cwd, write.cwd);
  assert.match(review.brief, /The moon pulls the sea\./);
  for (const brief of [write.brief, review.brief]) assert.doesNotMatch(brief, /\bgit\b|branch|commit|worktree/i);
  await forget(e, run.id);
  assert.deepEqual(gitAsked(), []);
});
