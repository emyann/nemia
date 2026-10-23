/**
 * A folder run (`workspace: folder`, `place: { kind: 'folder' }` on the record), as the board reads it: no repository, no base, no
 * branch. The list, the detail and the decision answer for it without throwing, and say what the record says — null where a repository run
 * has a repository — rather than a repository run's words. In a scratch store, with no git repository anywhere, on the stand-ins: the
 * runtime's test engine, the step's task signed off by hand, and the test place.
 *
 * And a folder team as the board finds and files for it, with the repository the api is pointed at a plain directory that is no
 * repository at all: `repoOf` resolves a path and never asks git, so the api runs, the store's own workflows list, and a card for a
 * team that works in folders is filed with no `repo:` — and refused with one.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import { names } from './named.ts';
import { story } from './checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from './placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

/** What the board is pointed at, as `HKB_REPO`: a plain directory, no git, no workflows folder of its own, read as any repository. */
const notARepo = scratch('nemia-api-folder-here-');
process.env.HKB_REPO = notARepo;

/** A folder team of the store's own, as workflows/note is: every step says `workspace: folder`, so it looks at no repository. */
const team = path.join(root, 'workflows', 'notes');
fs.mkdirSync(team, { recursive: true });
fs.writeFileSync(
  path.join(team, 'write.md'),
  '---\nworkspace: folder\npermissionMode: dontAsk\nallowedTools: Edit(**)\n---\nWrite the note.\n',
);
/** A team of the store's own that works on a repository, to hold the two apart. */
const onRepo = path.join(root, 'workflows', 'change');
fs.mkdirSync(onRepo, { recursive: true });
fs.writeFileSync(path.join(onRepo, 'implement.md'), '---\nplace: git\n---\nMake the change.\n');

const at = '2026-09-19T00:10:00.000Z';
const work = path.join(root, 'runs', 'f-notes', 'work');

/** A task filed in the step's folder on the engine, and signed off. */
function signedOff(taskId: string, cwd: string): void {
  Effect.runSync(engine().file({ id: taskId, brief: 'Write it.', cwd, harness: 'claude' }));
  standIn().settle(taskId, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] },
  });
}

fs.mkdirSync(path.join(work, 'write'), { recursive: true });
beforeEachTest(() => {
  signedOff('t-write', path.join(work, 'write'));
});
fs.writeFileSync(
  path.join(root, 'runs', 'f-notes.json'),
  JSON.stringify({
    id: 'f-notes',
    /** A folder run whose one step signed off: its record as `nemia start` writes one, with `place`, none of a repository run's fields. */
    place: { kind: 'folder' },
    workspace: work,
    brief: 'Write a note.',
    createdAt: at,
    workflowDir: path.join(root, 'no-such-workflow'),
    workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'claude', workspace: 'folder' }],
    steps: { write: { taskId: 't-write', workspace: path.join(work, 'write') } },
  }),
);

/**
 * The folder of f-notes' step: the note it named in its closeout and the sketch it did not, a file of bytes, a directory, a link that
 * leads out of the folder, and a name the files route refuses. All but the first three are things the folder holds that no name can
 * reach: the listing carries them by their path, since they are the work too, and serves none of them.
 *
 * And given/, what the run itself copies in before the step starts, which is not what the step made: the files `nemia start --input`
 * gives it and a copy of each folder it waits on (`givenPlan` in the package). Every folder run started with `--input` has one.
 */
const wrote = path.join(work, 'write');
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
fs.writeFileSync(path.join(wrote, 'note.md'), 'The tides.\n');
fs.writeFileSync(path.join(wrote, 'sketch.png'), PNG);
fs.writeFileSync(path.join(wrote, 'bundle.zip'), 'PK');
fs.writeFileSync(path.join(wrote, '..hidden.md'), 'not reachable by name');
fs.mkdirSync(path.join(wrote, 'scratch'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', 'f-notes', 'outside.md'), 'outside the folder');
fs.symlinkSync(path.join(root, 'runs', 'f-notes', 'outside.md'), path.join(wrote, 'link.md'));
fs.mkdirSync(path.join(wrote, 'given', 'inputs'), { recursive: true });
fs.writeFileSync(path.join(wrote, 'given', 'inputs', 'mock.png'), PNG);
fs.mkdirSync(path.join(wrote, 'given', 'from', 'sketch'), { recursive: true });
fs.writeFileSync(path.join(wrote, 'given', 'from', 'sketch', 'side.md'), 'what the step before it made');

/** A word about git, which a person reading a folder run must not meet: it has no repository, no branch and nothing to merge. */
const GIT_WORD = /\b(branch|base|merge|merged|diff|commit|worktree|repository|repo|git)\b/i;

test("a folder run read on the board: listed by its kind and place, its page with no repository and its step's folder, its decision with nothing about git, its files served by name", async (t) => {
  const s = story(t);
  await s.test('the runs list shows a folder run with no repository, and says its kind', async () => {
    const res = await app().request('/api/runs');
    assert.equal(res.status, 200);
    const run = ((await res.json()) as { id: string; repo: unknown; place: unknown }[]).find((r) => r.id === 'f-notes');
    assert.ok(run, 'the folder run is listed');
    assert.equal(run.repo, null);
    assert.equal(run.place, 'folder');
  });
  await s.test(
    "the runs list says each run's place in the store's words: a folder run's, and a repository's for a record with no place",
    async () => {
      const record = path.join(root, 'runs', 'r-repo.json');
      fs.writeFileSync(
        record,
        JSON.stringify({
          id: 'r-repo',
          repo: notARepo,
          workspace: notARepo,
          baseRef: 'main',
          branch: 'main',
          isolate: true,
          brief: 'Make the change.',
          createdAt: at,
          workflowDir: onRepo,
          workflow: [{ name: 'implement', after: [], body: 'Make the change.' }],
          steps: { implement: { taskId: null } },
        }),
      );
      try {
        const listed = (await (await app().request('/api/runs')).json()) as { id: string; place: unknown }[];
        assert.deepEqual(
          listed.map((r) => [r.id, r.place]),
          [
            ['f-notes', 'folder'],
            ['r-repo', 'repository'],
          ],
        );
        assert.equal(((await (await app().request('/api/runs/r-repo')).json()) as { place: unknown }).place, 'repository');
      } finally {
        fs.rmSync(record);
      }
    },
  );
  await s.test(
    "a folder run's detail has no repository, base, branch or isolation — where its work is instead, and its step's folder",
    async () => {
      const res = await app().request('/api/runs/f-notes');
      assert.equal(res.status, 200);
      const run = (await res.json()) as Record<string, unknown> & {
        steps: {
          name: string;
          workspace: string | null;
          branch: string | null;
          note: string | null;
          status: string;
          spec: { place: string | null; workspace: string | null };
        }[];
      };
      assert.deepEqual([run.repo, run.baseRef, run.branch, run.isolate, run.place], [null, null, null, null, 'folder']);
      assert.deepEqual(
        [run.steps[0].spec.place, run.steps[0].spec.workspace],
        ['folder', null],
        'a step frozen as `workspace: folder`, the former spelling, is shown as `place: folder`',
      );
      assert.equal(
        run.work,
        work,
        'the one thing a person needs to find what it made, where a repository run has a repository and a branch',
      );
      const [write] = run.steps;
      assert.deepEqual([write.name, write.workspace, write.branch], ['write', path.join(work, 'write'), null]);
      for (const said of [run.warning, run.fromNote, ...run.steps.map((s) => s.note)]) {
        if (typeof said === 'string')
          assert.doesNotMatch(said, GIT_WORD, `the sentences it carries, what the board reads out loud, name no git: ${said}`);
      }
    },
  );
  await s.test("a folder run's decision reads, with nothing to merge and nothing about git", async () => {
    const res = await app().request('/api/runs/f-notes/decision');
    assert.equal(res.status, 200);
    const decision = (await res.json()) as {
      standings: unknown[];
      touched: unknown[];
      sensitive: unknown[];
      commands: { label: string; command: string; said: string | null }[];
      lesson: { said: string };
      overBudget: string | null;
    };
    assert.deepEqual(
      [decision.standings, decision.touched, decision.sensitive],
      [[], [], []],
      'no branch to stand against a base, none touched to diff, and none read in full',
    );
    assert.deepEqual(
      decision.commands,
      [{ label: 'forget it', command: 'nemia rm f-notes', said: 'forgets the run with its folders and files', step: null }],
      'what `nemia decide` offers instead: the one command, and nothing to merge or delete (cli/main.ts, !git)',
    );
    for (const said of [...decision.commands.flatMap((c) => [c.command, c.said ?? '']), decision.overBudget ?? '']) {
      assert.doesNotMatch(said, GIT_WORD, `a sentence the board shows out of this answer names no git: ${said}`);
    }
  });
  await s.test(
    'a folder step carries everything its folder holds: what a name reaches with its size and url, the rest by its path',
    async () => {
      const run = (await (await app().request('/api/runs/f-notes')).json()) as {
        steps: { files: { path: string; name?: string; url?: string; kind?: string; size?: number }[] }[];
      };
      const [write] = run.steps;
      assert.deepEqual(
        write.files,
        [
          { path: path.join(wrote, '..hidden.md') },
          {
            path: path.join(wrote, 'bundle.zip'),
            name: 'bundle.zip',
            url: '/api/runs/f-notes/steps/write/files/bundle.zip',
            kind: 'other',
            size: 2,
          },
          { path: path.join(wrote, 'link.md') },
          {
            path: path.join(wrote, 'note.md'),
            name: 'note.md',
            url: '/api/runs/f-notes/steps/write/files/note.md',
            kind: 'text',
            size: 11,
          },
          { path: path.join(wrote, 'scratch') },
          {
            path: path.join(wrote, 'sketch.png'),
            name: 'sketch.png',
            url: '/api/runs/f-notes/steps/write/files/sketch.png',
            kind: 'image',
            size: PNG.length,
          },
        ],
        "in name order: a directory, a link out of the folder and a name the route refuses carry a path and nothing else, since they are the work too and a board that says an empty list is an empty folder must not say it of a folder holding only scratch/; the run's own given/ is the one thing left out: it is not the step's work, and listed it would stand in the folder of every step of every run started with --input, so no step could ever be read as having made nothing",
      );
    },
  );
  await s.test('a folder the api cannot read says why, where one not there is an empty list', async () => {
    const notAFolder = path.join(root, 'runs', 'f-gone', 'not-a-folder');
    fs.mkdirSync(path.dirname(notAFolder), { recursive: true });
    fs.writeFileSync(notAFolder, 'a file where a folder should be');
    fs.writeFileSync(
      path.join(root, 'runs', 'f-gone.json'),
      JSON.stringify({
        id: 'f-gone',
        place: { kind: 'folder' },
        workspace: path.join(root, 'runs', 'f-gone'),
        brief: 'Write a note.',
        createdAt: at,
        workflowDir: path.join(root, 'no-such-workflow'),
        workflow: [
          { name: 'write', after: [], body: 'Write it.', harness: 'claude', workspace: 'folder' },
          { name: 'review', after: ['write'], body: 'Read it.', harness: 'claude', workspace: 'folder' },
        ],
        steps: {
          /**
           * A regular file where a folder should be, which `readdirSync` refuses with ENOTDIR as a folder removed under the run or one
           * nobody may read refuses with ENOENT or EACCES.
           */
          write: { taskId: 't-gone-write', workspace: notAFolder },
          /** A folder the run has not made yet. */
          review: { taskId: 't-gone-review', workspace: path.join(root, 'runs', 'f-gone', 'review') },
        },
      }),
    );

    const run = (await (await app().request('/api/runs/f-gone')).json()) as {
      steps: { name: string; files: unknown[]; filesError: string | null }[];
    };
    const write = run.steps.find((s) => s.name === 'write')!;
    assert.deepEqual(write.files, [], 'nothing to list');
    assert.equal(
      write.filesError,
      'Its folder could not be read (ENOTDIR).',
      'and why — an empty list here is the board saying the step made nothing when nobody could look',
    );
    const review = run.steps.find((s) => s.name === 'review')!;
    assert.deepEqual([review.files, review.filesError], [[], null], 'a folder the run has not made yet is empty, and no error');
  });
  await s.test("a folder step's file is served by name, and a name that is a path, or not in the folder, is refused", async () => {
    const base = '/api/runs/f-notes/steps/write/files';

    const note = await app().request(`${base}/note.md`);
    assert.deepEqual(
      [
        note.status,
        note.headers.get('content-type'),
        note.headers.get('cache-control'),
        note.headers.get('x-content-type-options'),
        await note.text(),
      ],
      [200, 'text/plain; charset=utf-8', 'no-store', 'nosniff', 'The tides.\n'],
    );
    assert.ok(
      (note.headers.get('content-security-policy') ?? '').split(/\s*;\s*/).includes('sandbox'),
      "an agent's text on the board's origin runs no script of its, as a step's named file does not",
    );
    assert.deepEqual(Buffer.from(await (await app().request(`${base}/sketch.png`)).arrayBuffer()), PNG);

    for (const name of ['..%2Foutside.md', 'scratch%2Fnothing.md', 'a%5Cb.md', '..hidden.md']) {
      const res = await app().request(`${base}/${name}`);
      assert.equal(
        res.status,
        400,
        `${name} names a file on disk: only the refusal stands between it and the response (an encoded .. alone is resolved before the route, so the separator is encoded instead)`,
      );
      names(((await res.json()) as { error: string }).error, decodeURIComponent(name), '`/`', '`..`');
    }
    for (const name of ['gone.md', 'scratch', 'link.md']) {
      const res = await app().request(`${base}/${name}`);
      assert.equal(res.status, 404, `${name} is not a regular file in the folder: absent, a directory, or a link that leads out of it`);
      assert.match(((await res.json()) as { error: string }).error, /has no file '.*' in its folder/, name);
    }
  });
  await s.test(
    "a file a step wrote called `given` is its own work, and is listed — only the run's own `given/` directory is left out",
    async () => {
      const folder = path.join(root, 'runs', 'f-given', 'work', 'write');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'given'), 'what I was given, in my own words');
      fs.writeFileSync(path.join(folder, 'note.md'), 'The tides.\n');
      signedOff('t-given-write', folder);
      fs.writeFileSync(
        path.join(root, 'runs', 'f-given.json'),
        JSON.stringify({
          id: 'f-given',
          place: { kind: 'folder' },
          workspace: path.join(root, 'runs', 'f-given', 'work'),
          brief: 'Write a note.',
          createdAt: at,
          workflowDir: path.join(root, 'no-such-workflow'),
          workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'claude', workspace: 'folder' }],
          steps: { write: { taskId: 't-given-write', workspace: folder } },
        }),
      );

      const run = (await (await app().request('/api/runs/f-given')).json()) as { steps: { files: { path: string; name?: string }[] }[] };
      assert.deepEqual(
        run.steps[0].files.map((f) => f.name ?? f.path),
        ['given', 'note.md'],
        "what the run makes is a directory, so a regular file named given is the step's: hiding it would be work made invisible on the one surface a person who never opens a terminal has",
      );
    },
  );
});

test('a folder team as the board finds and files for it, the repository a plain directory: listed as one, a card filed without a repository and refused with one, a card started on it says the repository it looked at none of', async (t) => {
  const s = story(t);
  await s.test('the workflows listing says which teams work in folders, with the repository a plain directory', async () => {
    const res = await app().request('/api/workflows');
    assert.equal(res.status, 200);
    const listed = (await res.json()) as { name: string; from: string; folderTeam: boolean; error: string | null }[];
    const folderTeams = listed.filter((w) => w.folderTeam).map((w) => w.name);
    assert.deepEqual(
      folderTeams,
      ['notes'],
      `the store's own list, the board pointed at a directory that is no repository: ${listed.map((w) => `${w.name} (${w.from}) ${w.folderTeam}`).join(', ')}`,
    );
    assert.equal(listed.find((w) => w.name === 'change')?.folderTeam, false, 'a team that works on a repository is not one');
  });
  await s.test(
    'REFUSED: POST /api/inbox files a card for a folder team with a repository — filed without one, refused with one',
    async () => {
      const json = { 'content-type': 'application/json' };
      const filed = await app().request('/api/inbox', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ body: 'a note on tides', workflow: 'notes', from: 'yours' }),
      });
      assert.equal(filed.status, 201);
      assert.equal(((await filed.json()) as { repo: string | null }).repo, null, 'filed with no repository');

      const refused = await app().request('/api/inbox', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ body: 'a note on tides', workflow: 'notes', from: 'yours', repo: notARepo }),
      });
      assert.equal(refused.status, 422);
      const { error } = (await refused.json()) as { error: string };
      names(error, `--repo ${notARepo}`, '`place: folder`');
      assert.deepEqual(fs.readdirSync(path.join(root, 'inbox')).length, 1, 'nothing more written');
    },
  );
  await s.test(
    'a card started on a folder team carries the repository it named and the run looked at none of — and a card that names none, nothing',
    async () => {
      const json = { 'content-type': 'application/json' };
      const file = async (body: string, repo?: string): Promise<string> => {
        const res = await app().request('/api/inbox', {
          method: 'POST',
          headers: json,
          /**
           * Filed for the team that works on a repository, which takes a `repo:`, and started on the one that works in folders, as the
           * board's start form lets a person pick another: how a card comes to name a repository no run looks at.
           */
          body: JSON.stringify({ body, workflow: 'change', from: 'yours', ...(repo !== undefined ? { repo } : {}) }),
        });
        const filed = (await res.json()) as { name?: string; error?: string };
        assert.equal(res.status, 201, filed.error);
        return filed.name!;
      };
      const startOn = async (card: string) =>
        app().request('/api/runs', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ workflow: 'notes', from: 'yours', brief: 'Write the note.', card }),
        });

      const named = await file('a note on the tides, from a card that names a repository', notARepo);
      const res = await startOn(named);
      const started = (await res.json()) as { id: string; card: string; removed: boolean; ignoredRepo?: string; error?: string };
      assert.equal(res.status, 201, started.error);
      assert.deepEqual(
        [started.card, started.removed, started.ignoredRepo],
        [named, true, notARepo],
        "the api says what `nemia start` prints and a tick's line carries: the card's `repo:` was not looked at",
      );
      const run = (await (await app().request(`/api/runs/${started.id}`)).json()) as { repo: unknown; place: unknown };
      assert.deepEqual(
        [run.repo, run.place],
        [null, 'folder'],
        'the run it started looked at none: no repository on its record, and its work is in a folder',
      );

      const plain = await file('a note on the moon, from a card that names none');
      const next = (await (await startOn(plain)).json()) as Record<string, unknown>;
      assert.equal(
        'ignoredRepo' in next,
        false,
        `the other way round, at the same shipped defaults: a card that names no repository has nothing to say, and the field is absent: ${JSON.stringify(next)}`,
      );
    },
  );
});
