/**
 * A run that needs no git repository: a team whose steps say `workspace: folder`, started, advanced, decided and forgotten from a
 * directory that is not a repository, with a `git` first on PATH that fails and writes down that it was asked. Every test ends by
 * reading that list: a folder run runs no git at all. `WF_ROOT` is set before the modules are imported, since they read it as they load.
 *
 * What the tests hold, beyond their names:
 * - A folder run's folders live until `nemia rm`, not until its end (features.md, *Decided: a folder lives as long as its run*): a run
 *   that ended on anything but success is written again in the folder it worked in. A try is filed there, a nudge continues a session
 *   tied to that directory, and what the first try left in it is what the second one works on.
 * - A folder team never reads a card's `repo:`, so a card filed with one is refused where it is written, in the words `nemia start --repo`
 *   is refused in; a card for a git team, and a card for a folder team with no repository, are filed.
 * - A card that already names a repository (written by hand, or before that refusal) cannot be edited from the board, so its start is
 *   not refused: the record has no repository, and the start says so, by hand and in the line a tick prints (`QueueStarted`).
 * - `nemia inbox queue <card> --workflow <w>` writes `workflow:` over the card's own, so it is judged as the card's writer is
 *   (`cardRepoRefusal`), taking it off the queue included (`queuedText`); a re-queue with no `--workflow` writes nobody's choice of team
 *   and is not refused, since refusing it would strand a card nobody can edit from the board.
 * - Every path a folder brief names is inside the step's folder and on disk: the run's inputs and the folders a fan-in waits on are
 *   copied in as the folder is made (`givenPlan`, `folderPlace.make`), because a `dontAsk` session is denied a read outside its fence
 *   with no prompt and carries on.
 * - `folderPlace.make` runs every time a step is filed, and a person's objection at a gate unfiles a step (`sentBack`) keeping its
 *   folder: the copy is replaced, never laid over the one before, or the step reads a file its parent has since deleted or renamed.
 * - The run makes no `given/` where a step has neither parent nor inputs, so a step's own file called `given` is work like any other
 *   (`folderFiles` lists it so) and reaches the step after it.
 * - `<folder>/given` is the run's to empty and write each time the step is filed: a link there is never followed, or the filing would
 *   remove and write wherever it points.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import type { Engine } from '../src/runtime-client.ts';
import { decideScreen } from './screens.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-folder-');
const NOT_A_REPO = path.join(ROOT, 'somewhere');
const TEAM = path.join(ROOT, 'workflows', 'note');
const GIT_ASKED = path.join(ROOT, 'git-asked');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(NOT_A_REPO, { recursive: true });
fs.mkdirSync(TEAM, { recursive: true });
fs.writeFileSync(path.join(TEAM, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nwrite the note\n');
fs.writeFileSync(path.join(TEAM, 'review.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nafter: write\n---\nreview the note\n');
/**
 * A fan-in: two roots, `a` and `b`, working side by side in folders of their own, and `c` that waits on both, the shape `folderPlace`
 * promises and the shipped `note` chain never meets; then `d`, which continues c's session, the `note` chain's shape: it works in c's
 * folder and is given nothing of its own, so its brief's `given/inputs` is true only because c's copy is in there.
 */
const FAN = path.join(ROOT, 'workflows', 'fan');
fs.mkdirSync(FAN, { recursive: true });
fs.writeFileSync(path.join(FAN, 'a.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nwrite side a\n');
fs.writeFileSync(path.join(FAN, 'b.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nwrite side b\n');
fs.writeFileSync(
  path.join(FAN, 'c.md'),
  '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\nafter: a, b\n---\nput the two together\n',
);
fs.writeFileSync(
  path.join(FAN, 'd.md'),
  '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\nafter: c\n---\nread it once more\n',
);
/** Two files a person hands the run with `nemia start --input`. */
const GIVEN_FILES = path.join(ROOT, 'given-files');
fs.mkdirSync(GIVEN_FILES, { recursive: true });
fs.writeFileSync(path.join(GIVEN_FILES, 'mock.png'), 'PNG');
fs.writeFileSync(path.join(GIVEN_FILES, 'brief notes.md'), '# what the tides do\n');

/** A team that works on a repository, to hold the refusals apart: a card for it keeps the repository it names. */
const GIT_TEAM = path.join(ROOT, 'workflows', 'change');
fs.mkdirSync(GIT_TEAM, { recursive: true });
fs.writeFileSync(path.join(GIT_TEAM, 'implement.md'), '---\nplace: git\n---\nmake the change\n');

/** Where a `git` that refuses and says so is put, first on PATH: anything that reaches for git during a folder run is written down. */
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(
  path.join(BIN, 'git'),
  `#!/bin/sh\necho "$*" >> ${JSON.stringify(GIT_ASKED)}\necho "fatal: not a git repository" >&2\nexit 128\n`,
  { mode: 0o755 },
);
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const gitAsked = (): string[] => (fs.existsSync(GIT_ASKED) ? fs.readFileSync(GIT_ASKED, 'utf8').trim().split('\n') : []);

process.env.WF_ROOT = ROOT;
const {
  addToInbox,
  advanceRun,
  decideRun,
  forgetRun,
  list,
  queueInInbox,
  queueLine,
  retryRun,
  startRun,
  startQueued,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { forgetLine, sentBack, stepTaskId } = await import('../src/run.ts');
const { main } = await import('../src/cli/main.ts');

/** What `main` printed, line by line, while it ran. */
const printed = async (argv: string[], e?: Engine): Promise<string[]> => {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  try {
    await main(argv, e);
  } finally {
    console.log = log;
  }
  return lines.join('\n').split('\n');
};

const SIGNED = { outcome: 'done', summary: 'wrote it', artifacts: ['note.md'], needs: null };

/** A closeout that names no file: a step that wrote no `note.md` names none, since a named file the run does not have refuses it. */
const WROTE_NONE = { ...SIGNED, artifacts: [] };

/** Just enough engine: what each task is doing and how it signed off, and every task's spec as it was filed. */
const board = () => {
  const tasks = new Map<
    string,
    { spec: { id: string; brief: string; cwd: string; config?: { mounts?: { path: string }[] } }; phase: string; closeout?: unknown }
  >();
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    ended: null,
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    exitCode: null,
                    usage: null,
                    startedAt: '2026-09-19T10:00:00Z',
                    spawnedAt: null,
                    endedAt: null,
                    reason: null,
                  },
                ],
        },
      };
    },
    file: async (spec: { id: string; brief: string; cwd: string }) => {
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
    logs: async () => '',
    feed: async () => ({ entries: [], cursor: 0 }),
  });
  const settle = (id: string, phase: string, closeout?: unknown) => {
    tasks.set(id, { ...tasks.get(id)!, phase, closeout });
  };
  return { e, tasks, settle };
};

const refusal = (fn: () => unknown): { message: string; exitCode: unknown } => {
  try {
    fn();
  } catch (err) {
    return { message: (err as Error).message, exitCode: (err as { exitCode?: unknown }).exitCode };
  }
  assert.fail('it was not refused');
};

const rejection = async (fn: () => Promise<unknown>): Promise<{ message: string; exitCode: unknown }> => {
  try {
    await fn();
  } catch (err) {
    return { message: (err as Error).message, exitCode: (err as { exitCode?: unknown }).exitCode };
  }
  assert.fail('it was not refused');
};

test('a folder team starts from a directory that is no repository, and its record has a place and no git', async () => {
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM }));
  const record = readRun(run.id);
  assert.deepEqual(record.place, { kind: 'folder' });
  assert.equal(record.workspace, path.join(ROOT, 'runs', run.id, 'work'));
  for (const key of ['repo', 'baseRef', 'branch', 'isolate'] as const)
    assert.equal(key in record, false, `${key} is not on a folder run's record`);
  assert.deepEqual(record.steps, { write: { taskId: null }, review: { taskId: null } });
  assert.deepEqual(gitAsked(), []);
});

test('a folder team refuses --repo, --no-worktree and --after, before anything is written', async () => {
  const before = fs.readdirSync(path.join(ROOT, 'runs')).sort();
  const named = await rejection(() => runPlaced(startRun({ brief: 'x', repo: NOT_A_REPO, repoNamed: true, workflowDir: TEAM })));
  assert.equal(named.exitCode, 2);
  assert.match(named.message, /^--repo .*: this workflow's steps say `place: folder`/);
  assert.match(named.message, /Start it without --repo/);

  const inPlace = await rejection(() => runPlaced(startRun({ brief: 'x', repo: NOT_A_REPO, workflowDir: TEAM, isolate: false })));
  assert.equal(inPlace.exitCode, 2);
  assert.match(inPlace.message, /^--no-worktree: this workflow's steps say `place: folder`/);

  const waiting = await rejection(() => runPlaced(startRun({ brief: 'x', repo: NOT_A_REPO, workflowDir: TEAM, after: ['some-run-a1b2'] })));
  assert.equal(waiting.exitCode, 2);
  assert.ok(waiting.message.startsWith('--after some-run-a1b2: '), waiting.message);
  assert.ok(waiting.message.includes('(place: folder)'), waiting.message);
  assert.ok(waiting.message.includes('Start it without --after'), 'and names the flag to drop');

  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'runs')).sort(), before, 'nothing was written');
  assert.deepEqual(gitAsked(), []);
});

test("REFUSED: a folder team whose agent is given the git place's skill, which has no repository to act on — before anything is written", async () => {
  const team = path.join(ROOT, 'workflows', 'gitted-note');
  fs.mkdirSync(team, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'clerk.md'), '---\ndescription: Writes notes.\nskills: git\n---\nWrite.\n');
  fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\nagent: clerk\n---\nwrite the note\n');
  const before = fs.readdirSync(path.join(ROOT, 'runs')).sort();
  const refused = await rejection(() => runPlaced(startRun({ brief: 'x', repo: NOT_A_REPO, workflowDir: team })));
  assert.equal(refused.exitCode, 2);
  assert.ok(refused.message.startsWith('write: its agent is given the skill `git`'), refused.message);
  assert.ok(refused.message.includes('`place: folder`'), refused.message);
  assert.match(refused.message, /Take `git` off the agent's `skills:`/);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'runs')).sort(), before, 'nothing was written');
  assert.deepEqual(gitAsked(), []);
});

test('a git team is still a repository run: from a directory that is no repository, it is refused by git', async () => {
  const GIT_TEAM = path.join(ROOT, 'workflows', 'plain');
  fs.mkdirSync(GIT_TEAM, { recursive: true });
  fs.writeFileSync(path.join(GIT_TEAM, 'write.md'), '---\nplace: git\n---\nwrite the note\n');
  await assert.rejects(async () => await runPlaced(startRun({ brief: 'x', repo: NOT_A_REPO, workflowDir: GIT_TEAM })));
  assert.ok(gitAsked().length > 0, 'a git team asks git');
  fs.rmSync(GIT_ASKED, { force: true });
});

test('a folder run advances, is decided and is forgotten with no git: each step works in its folder, the next continues it, and nemia rm takes it all', async () => {
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM }));
  const { e, tasks, settle } = board();

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['write']);
  const write = tasks.get(`${run.id}-write`)!.spec;
  const writeFolder = path.join(ROOT, 'runs', run.id, 'work', 'write');
  assert.equal(write.cwd, writeFolder);
  assert.ok(fs.statSync(writeFolder).isDirectory(), 'made before the step is filed');
  assert.equal(
    fs.existsSync(path.join(writeFolder, 'given')),
    false,
    'a run given no inputs whose steps are a chain is given nothing: nothing to copy, nothing made',
  );
  assert.doesNotMatch(write.brief, /\bgit\b|branch|commit/i);
  fs.writeFileSync(path.join(writeFolder, 'note.md'), '# Tides\n');

  settle(`${run.id}-write`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['review']);
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'write', 'note.md'), 'utf8'),
    '# Tides\n',
    "collected at the hand-off, as on a repository run, into the step's own files directory",
  );
  assert.equal(tasks.get(`${run.id}-review`)!.spec.cwd, writeFolder, "a chain continues its parent's folder");
  assert.equal(readRun(run.id).steps.review?.branch, undefined);

  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, artifacts: [] });
  await runWith(e, advanceRun(readRun(run.id)));
  const decided = await runWith(e, decideRun(run.id));
  assert.equal(decided.decision.kind, 'awaiting');
  assert.deepEqual(decided.decision.kind === 'awaiting' && [decided.decision.branches, decided.decision.direct], [[], false]);
  assert.deepEqual([decided.standings, decided.toDecide], [[], undefined]);
  const listed = await runWith(e, list(e, readRun(run.id)));
  assert.deepEqual(
    listed.steps.map((s) => s.branch),
    [null, null],
    'no branch to list',
  );

  const screen = await printed(['decide', run.id], e);
  assert.ok(
    screen.includes(
      `  worked in folders, with no git repository: ${path.join(ROOT, 'runs', run.id, 'work')}, a folder per step; nothing to merge`,
    ),
    `nemia decide says where the work is:\n${screen.join('\n')}`,
  );
  assert.equal(
    screen.at(-1),
    `  done with it   nemia rm ${run.id}  — forgets the run with its folders and files`,
    'and the one command there is',
  );
  assert.equal(screen.filter((l) => /\bgit (-C|merge|branch|diff)/.test(l)).length, 0, `and no git command:\n${screen.join('\n')}`);

  const forgot = await runWith(e, forgetRun(run.id));
  assert.equal(forgot.kind, 'forgotten');
  assert.equal(forgot.folder, true);
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', run.id)), false, 'its folders went with it');
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${run.id}.json`)), false);
  assert.match(
    forgetLine(forgot),
    new RegExp(`^${run.id}  forgotten: a folder run, whose steps worked in its own directory — no worktrees, no branches`),
  );
  assert.deepEqual(gitAsked(), [], 'and nothing asked git');
});

test("a folder run's folder outlives its end: a run that ended blocked is tried again in the folder its step left, with the step's work still in it", async () => {
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM }));
  const { e, tasks, settle } = board();
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['write']);
  const writeFolder = path.join(ROOT, 'runs', run.id, 'work', 'write');
  fs.writeFileSync(path.join(writeFolder, 'note.md'), '# Tides\n');

  settle(`${run.id}-write`, 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which tides?' });
  await runWith(e, advanceRun(readRun(run.id)));
  const ended = (await runWith(e, decideRun(run.id))).decision;
  assert.deepEqual(ended.kind === 'awaiting' && ended.outcome, 'waiting', JSON.stringify(ended));

  await runWith(e, retryRun(run.id, 'write', { mode: 'nudge', message: 'the ocean ones' }));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).tried, ['write']);
  const again = tasks.get(stepTaskId(readRun(run.id), 'write', 2));
  assert.ok(again, 'the try is filed');
  assert.equal(again.spec.cwd, writeFolder, 'in the folder the first try worked in');
  assert.equal(fs.readFileSync(path.join(writeFolder, 'note.md'), 'utf8'), '# Tides\n', 'which still holds what it wrote');
  assert.deepEqual(gitAsked(), []);
});

test('nemia start from a directory that is no repository: a folder team starts, and --repo named is refused in its words', async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    const out = await printed(['start', 'a note on tides', '--workflows', TEAM]);
    const id = out[0].split(' ')[0];
    assert.equal(readRun(id).place?.kind, 'folder');
    assert.ok(
      out.includes(`workspace: ${path.join(ROOT, 'runs', id, 'work')} — a folder per step, made as each is filed, with no git repository`),
      out.join('\n'),
    );
    await assert.rejects(
      main(['start', 'a note on tides', '--workflows', TEAM, '--repo', '.']),
      (err: Error & { exitCode?: number }) =>
        err.exitCode === 2 && err.message.startsWith(`--repo ${NOT_A_REPO}: this workflow's steps say \`place: folder\``),
    );
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

test('REFUSED: a card filed for a folder team with a repository — the card names what no run of it will look at', async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    assert.throws(
      () => addToInbox({ text: 'a note on tides', workflow: TEAM, repo: NOT_A_REPO }),
      (err: Error & { exitCode?: number }) =>
        err.exitCode === 2 &&
        err.message.startsWith(`--repo ${NOT_A_REPO}: this card's workflow has steps that say \`place: folder\``) &&
        err.message.includes('File the card without a repository') &&
        err.message.includes('or name a workflow'),
    );
    const inbox = path.join(ROOT, 'inbox');
    assert.deepEqual(fs.existsSync(inbox) ? fs.readdirSync(inbox) : [], [], 'refused before the card is written');
    assert.ok(addToInbox({ text: 'a note on tides', workflow: TEAM }).card.name, 'a folder team with no repository is filed');
    assert.ok(
      addToInbox({ text: 'a change to make', workflow: GIT_TEAM, repo: NOT_A_REPO }).card.repo,
      'a team that works on a repository keeps its repository',
    );
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

test('an inbox card of a folder team: --repo named at its start is refused, as on a brief, and a repo: already on the card is not looked at, and said', async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    const file = path.join(ROOT, 'inbox', 'a-note-on-tides-old.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nworkflow: ${TEAM}\nrepo: ${NOT_A_REPO}\n---\na note on tides\n`);
    await assert.rejects(
      main(['start', file, '--repo', '.']),
      (err: Error & { exitCode?: number }) =>
        err.exitCode === 2 && err.message.startsWith(`--repo ${NOT_A_REPO}: this workflow's steps say \`place: folder\``),
    );
    assert.ok(fs.existsSync(file), 'refused before anything is written: the card is still in the inbox');
    const out = await printed(['start', file]);
    const run = readRun(out[0].split(' ')[0]);
    assert.deepEqual(
      [run.place?.kind, run.from?.inbox, 'repo' in run],
      ['folder', 'a-note-on-tides-old', false],
      'the repository is ignored: the record has none',
    );
    assert.ok(
      out.some(
        (line) =>
          line === `the card's repo: ${NOT_A_REPO} was not looked at — this workflow's steps work in folders, with no git repository`,
      ),
      `the start says so, rather than leaving a person to look for the work in it:\n${out.join('\n')}`,
    );
    assert.ok(fs.existsSync(file), 'started, the card stays in the inbox');
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

test("a queued card of a folder team, started by a tick: its repo: is not looked at, and the tick's own line says so", async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    const card = (name: string, lines: string): string => {
      const file = path.join(ROOT, 'inbox', `${name}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `---\nworkflow: ${TEAM}\n${lines}---\na note on tides\n`);
      queueInInbox(name);
      return name;
    };
    const named = card('a-note-queued', `repo: ${NOT_A_REPO}\n`);
    const started = (await runPlaced(startQueued(NOT_A_REPO)))!;
    assert.ok('run' in started, JSON.stringify(started));
    const run = readRun(started.run);
    assert.deepEqual([run.place?.kind, run.from?.inbox, 'repo' in run], ['folder', named, false], 'the run looked at no repository');
    assert.equal(started.ignoredRepo, NOT_A_REPO, "the tick's start carries the card's repo, which the run looked at none of");
    assert.equal(
      queueLine(started),
      `started ${named} as ${started.run} (the card's repo: ${NOT_A_REPO} was not looked at — this workflow's steps work in folders, with no git repository)`,
      "and the line a daemon prints says it, in the sentence nemia start prints: a daemon's log is the only place a tick's start is read",
    );

    const plain = card('a-note-queued-plain', '');
    const next = (await runPlaced(startQueued(NOT_A_REPO)))!;
    assert.ok('run' in next, JSON.stringify(next));
    assert.equal(next.ignoredRepo, undefined, 'a card of the same folder team that names no repository has nothing to say');
    assert.equal(queueLine(next), `started ${plain} as ${next.run}`, 'so the line is not one every start carries');
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

/**
 * The paths a brief names, of the kind a session would open: every backtick-quoted token that reads as a path rather than as a command or
 * a key, but those in a folder the step is filed with (`mounted`). A folder step is fenced to its own directory (`dontAsk`) and reads a
 * mounted folder alone outside it, so each of them has to be inside it and on disk.
 */
const pathsNamed = (brief: string, mounted: readonly string[] = []): string[] =>
  [...brief.matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1])
    .filter((t) => /^given(\/|$)/.test(t) || t.startsWith('/'))
    .filter((t) => !mounted.some((m) => t === m || t.startsWith(`${m}/`)));

test('a folder team with a fan-in, given files at its start: what each brief tells a step to read is inside its own folder, and on disk', async () => {
  const run = await runPlaced(
    startRun({
      brief: 'two sides of a note',
      repo: NOT_A_REPO,
      workflowDir: FAN,
      inputs: [path.join(GIVEN_FILES, 'mock.png'), path.join(GIVEN_FILES, 'brief notes.md')],
    }),
  );
  const { e, tasks, settle } = board();
  const work = path.join(ROOT, 'runs', run.id, 'work');

  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['a', 'b']);
  for (const name of ['a', 'b']) {
    const folder = path.join(work, name);
    assert.deepEqual(
      fs.readdirSync(path.join(folder, 'given', 'inputs')).sort(),
      ['brief notes.md', 'mock.png'],
      `${name} was given the run's inputs`,
    );
    assert.equal(fs.readFileSync(path.join(folder, 'given', 'inputs', 'mock.png'), 'utf8'), 'PNG');
    assert.equal(fs.existsSync(path.join(folder, 'given', 'from')), false, "a root waits on nobody, so it is given nobody's folder");
  }
  fs.writeFileSync(path.join(work, 'a', 'side-a.md'), '# a\n');
  fs.writeFileSync(path.join(work, 'b', 'side-b.md'), '# b\n');
  fs.symlinkSync(path.join(ROOT, 'somewhere'), path.join(work, 'b', 'out'));

  for (const name of ['a', 'b']) settle(`${run.id}-${name}`, 'succeeded', WROTE_NONE);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['c']);
  const c = path.join(work, 'c');
  assert.equal(tasks.get(`${run.id}-c`)!.spec.cwd, c, 'a fan-in gets a folder of its own');
  assert.equal(fs.readFileSync(path.join(c, 'given', 'from', 'a', 'side-a.md'), 'utf8'), '# a\n');
  assert.equal(fs.readFileSync(path.join(c, 'given', 'from', 'b', 'side-b.md'), 'utf8'), '# b\n');
  assert.deepEqual(
    fs.readdirSync(path.join(c, 'given', 'inputs')).sort(),
    ['brief notes.md', 'mock.png'],
    "and the run's inputs, as its parents were",
  );
  assert.equal(
    fs.existsSync(path.join(c, 'given', 'from', 'b', 'out')),
    false,
    'a symlink is not copied: a link in the folder is the fence undone by a file',
  );
  assert.equal(
    fs.existsSync(path.join(c, 'given', 'from', 'b', 'given')),
    false,
    "nor a parent's own given/, which is its parents' work and not its own: what this step waits on is what that step made",
  );

  settle(`${run.id}-c`, 'succeeded', WROTE_NONE);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['d']);
  assert.equal(tasks.get(`${run.id}-d`)!.spec.cwd, c, 'd continues c where it left off');
  assert.equal(
    fs.existsSync(path.join(c, 'given', 'from', 'a')),
    true,
    "and what c was given is still there, since nothing was made anew: d's brief says the run's files are in this folder",
  );

  for (const name of ['a', 'b', 'c', 'd']) {
    const { brief, cwd, config } = tasks.get(`${run.id}-${name}`)!.spec;
    const mounted = (config?.mounts ?? []).map((m) => m.path);
    for (const at of mounted) assert.ok(brief.includes(`\`${at}\``), `${name}'s brief names ${at}, which it is filed with:\n${brief}`);
    assert.ok(
      !mounted.reduce((rest, at) => rest.replaceAll(at, ''), brief).includes(ROOT),
      `${name}'s brief names no path under the store but the folders it is filed with, which its fence denies it:\n${brief}`,
    );
    const named = pathsNamed(brief, mounted);
    assert.ok(named.length, `${name}'s brief names a path`);
    for (const at of named) {
      assert.equal(path.isAbsolute(at), false, `${name}: ${at} is named by its path from the folder`);
      assert.ok(fs.existsSync(path.join(cwd, at)), `${name}: ${at} is on disk in its folder`);
    }
  }
  assert.deepEqual(
    tasks.get(`${run.id}-c`)!.spec.config?.mounts?.map((m) => path.basename(m.path)),
    ['a', 'b'],
    "c is filed a's and b's artifacts folders, so its brief is held to naming them",
  );
  assert.match(tasks.get(`${run.id}-c`)!.spec.brief, /- a: `given\/from\/a`\n- b: `given\/from\/b`/);
  assert.match(
    tasks.get(`${run.id}-a`)!.spec.brief,
    /`mock\.png`, a picture; `brief notes\.md`, a text file\. They are copied into `given\/inputs` in this folder\./,
  );
  const d = tasks.get(`${run.id}-d`)!.spec.brief;
  assert.match(d, /`mock\.png`, a picture; `brief notes\.md`, a text file\. They are copied into `given\/inputs` in this folder\./);
  assert.doesNotMatch(d, /given\/from/, 'a step standing in the folder it was given is given nothing more');

  await runWith(e, forgetRun(run.id));
  assert.deepEqual(gitAsked(), []);
});

test("REFUSED: a card with a repository queued onto a folder team — `--workflow` writes that key, so it is judged as the card's own writer is", async () => {
  const cwd = process.cwd();
  process.chdir(NOT_A_REPO);
  try {
    const file = path.join(ROOT, 'inbox', 'a-card-with-a-repo.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const text = `---\nworkflow: ${GIT_TEAM}\nrepo: ${NOT_A_REPO}\n---\na change to make\n`;
    fs.writeFileSync(file, text);
    const refused = refusal(() => queueInInbox('a-card-with-a-repo', { workflow: TEAM }));
    assert.equal(refused.exitCode, 2);
    assert.ok(
      refused.message.startsWith(`--repo ${NOT_A_REPO}: this card's workflow has steps that say \`place: folder\``),
      refused.message,
    );
    assert.ok(refused.message.includes('File the card without a repository'), refused.message);
    assert.ok(refused.message.includes('or name a workflow'), refused.message);
    assert.equal(
      fs.readFileSync(file, 'utf8'),
      text,
      'refused before anything is written: the card is unqueued, and its workflow is its own',
    );
    assert.equal(
      queueInInbox('a-card-with-a-repo').was,
      'queued',
      'queued first, on the team it names: an unqueued card taken off the queue is left alone, whatever was passed',
    );
    const queued = fs.readFileSync(file, 'utf8');
    const off = refusal(() => queueInInbox('a-card-with-a-repo', { off: true, workflow: TEAM }));
    assert.equal(off.exitCode, 2, 'taken off the queue with --workflow writes the key just the same, so it is refused just the same');
    assert.ok(off.message.startsWith(`--repo ${NOT_A_REPO}: this card's workflow has steps that say \`place: folder\``), off.message);
    assert.equal(fs.readFileSync(file, 'utf8'), queued, 'and again nothing is written: the card is still queued, on its own team');
    assert.equal(queueInInbox('a-card-with-a-repo', { off: true }).was, 'taken back');

    assert.equal(
      queueInInbox('a-card-with-a-repo').was,
      'queued',
      "a re-queue with no --workflow writes nobody's choice of team, and refusing it would strand the card",
    );
    assert.equal(queueInInbox('a-card-with-a-repo', { off: true }).was, 'taken back');
    assert.equal(
      queueInInbox('a-card-with-a-repo', { workflow: GIT_TEAM }).was,
      'queued',
      'a card queued onto a team that works on a repository keeps on as before',
    );
    assert.equal(queueInInbox('a-card-with-a-repo', { off: true }).was, 'taken back');
    fs.writeFileSync(path.join(ROOT, 'inbox', 'a-card-with-none.md'), 'a note on tides\n');
    assert.equal(
      queueInInbox('a-card-with-none', { workflow: TEAM }).was,
      'queued',
      'a card with no repository is queued onto the folder team, which is the whole point of the key',
    );
    assert.equal(queueInInbox('a-card-with-none', { off: true }).was, 'taken back');
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(gitAsked(), []);
});

test("a fan-in filed a second time is given its parent's folder as it stands then, not laid over the copy it had", async () => {
  const run = await runPlaced(startRun({ brief: 'two sides, then a second look', repo: NOT_A_REPO, workflowDir: FAN }));
  const { e, tasks, settle } = board();
  const work = path.join(ROOT, 'runs', run.id, 'work');
  const givenA = path.join(work, 'c', 'given', 'from', 'a');

  await runWith(e, advanceRun(readRun(run.id)));
  fs.writeFileSync(path.join(work, 'a', 'keep.md'), '# kept\n');
  fs.writeFileSync(path.join(work, 'a', 'gone.md'), '# only the first time\n');
  for (const name of ['a', 'b']) settle(`${run.id}-${name}`, 'succeeded', WROTE_NONE);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['c']);
  assert.deepEqual(fs.readdirSync(givenA).sort(), ['gone.md', 'keep.md'], 'what a had made when c was first filed');
  settle(`${run.id}-c`, 'succeeded', WROTE_NONE);

  const record = readRun(run.id);
  record.steps.c = sentBack(record.steps.c);
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
  fs.rmSync(path.join(work, 'a', 'gone.md'));
  fs.writeFileSync(path.join(work, 'a', 'said.md'), '# what it says now\n');

  const again = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(again.filed, ['c'], again.notes.join('\n'));
  assert.equal(tasks.get(`${run.id}-c-try2`)!.spec.cwd, path.join(work, 'c'), 'the folder it had, since a send-back keeps it');
  assert.deepEqual(
    fs.readdirSync(givenA).sort(),
    ['keep.md', 'said.md'],
    "a's folder as it stands now — the copy is replaced, not merged over, or the step reads work that is not there any more",
  );

  await runWith(e, forgetRun(run.id));
  assert.deepEqual(gitAsked(), []);
});

test("a parent's regular file called `given` is its work, and reaches the step after it: only the run's own given/ directory stays behind", async () => {
  const run = await runPlaced(startRun({ brief: 'two sides, one of them fond of a name', repo: NOT_A_REPO, workflowDir: FAN }));
  const { e, settle } = board();
  const work = path.join(ROOT, 'runs', run.id, 'work');
  await runWith(e, advanceRun(readRun(run.id)));
  fs.writeFileSync(path.join(work, 'b', 'given'), 'what b was given to understand\n');
  for (const name of ['a', 'b']) settle(`${run.id}-${name}`, 'succeeded', WROTE_NONE);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['c']);
  assert.equal(
    fs.readFileSync(path.join(work, 'c', 'given', 'from', 'b', 'given'), 'utf8'),
    'what b was given to understand\n',
    "b has no parent and the run no inputs, so the run made no given/ in b's folder: b's file of that name is its work, copied on",
  );
  await runWith(e, forgetRun(run.id));
});

test("REFUSED: a step's given/ that is a link is never followed — filed again, nothing outside the folder is removed or written, and the pass says why", async () => {
  const run = await runPlaced(startRun({ brief: 'two sides, then a second look', repo: NOT_A_REPO, workflowDir: FAN }));
  const { e, settle } = board();
  const work = path.join(ROOT, 'runs', run.id, 'work');
  await runWith(e, advanceRun(readRun(run.id)));
  fs.writeFileSync(path.join(work, 'a', 'side-a.md'), '# a\n');
  for (const name of ['a', 'b']) settle(`${run.id}-${name}`, 'succeeded', WROTE_NONE);
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['c']);
  settle(`${run.id}-c`, 'succeeded', WROTE_NONE);

  const outside = path.join(ROOT, 'outside-the-run');
  fs.mkdirSync(path.join(outside, 'from', 'a'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'from', 'a', 'theirs.md'), "not the run's to touch\n");
  fs.rmSync(path.join(work, 'c', 'given'), { recursive: true });
  fs.symlinkSync(outside, path.join(work, 'c', 'given'));

  const record = readRun(run.id);
  record.steps.c = sentBack(record.steps.c);
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
  let said = '';
  let filed: string[] = [];
  try {
    const pass = await runWith(e, advanceRun(readRun(run.id)));
    filed = pass.filed;
    said = pass.notes.join('\n');
  } catch (err) {
    said = (err as Error).message;
  }
  assert.deepEqual(filed, [], 'c is not filed through a link');
  assert.match(said, /given is a link, and `given\/` in a step's folder is the run's own/);
  assert.match(said, /Remove or rename it/);
  assert.equal(
    fs.readFileSync(path.join(outside, 'from', 'a', 'theirs.md'), 'utf8'),
    "not the run's to touch\n",
    'what the link points at is as it was',
  );
  assert.deepEqual(
    fs.readdirSync(path.join(outside, 'from', 'a')),
    ['theirs.md'],
    'and nothing of the run was written in a directory shaped as the copy is, which a followed link would empty',
  );
  await runWith(e, forgetRun(run.id));
});

test('the whole screen of a folder run: where the work is, and the one command there is', async (t) => {
  const run = await runPlaced(startRun({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  fs.writeFileSync(path.join(ROOT, 'runs', run.id, 'work', 'write', 'note.md'), '# Tides\n');
  settle(`${run.id}-write`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, artifacts: [] });
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(await decideScreen(t, e, [run.id], { '<id>': run.id, '<root>': ROOT }), [
    '<id>  a note on tides',
    '',
    '  UNVERIFIED: review, write  — no check: declared; only its own word says it worked',
    '',
    '  write',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    wrote it',
    '    files:',
    '      <root>/runs/<id>/artifacts/write/note.md  8 B',
    '',
    '  review',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    wrote it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '',
    '  worked in folders, with no git repository: <root>/runs/<id>/work, a folder per step; nothing to merge',
    '',
    '  done with it   nemia rm <id>  — forgets the run with its folders and files',
  ]);
  assert.deepEqual(gitAsked(), []);
});
