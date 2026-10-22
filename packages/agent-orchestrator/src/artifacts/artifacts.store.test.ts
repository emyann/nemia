/**
 * The files of a step, one table per function, and the artifact path rules as one table: where a named file is from
 * (`artifactPlace`), one file a step left read by name and never by path (`fileIn`, `artifactFile`), and each reason a named file is not
 * one the run has, off the disk alone (`filesLacked`). Then those that are there for the step after (`filesHanded`), the tasks whose
 * files a pass reads (`filesDue`), a near name (`nearName`), what a step is told of its files (`artifactsContract`) and what `nemia
 * decide` says of them (`artifactLines`). A closeout naming files in a run is told in `test/closeouts.test.ts`. `WF_ROOT` is set before
 * the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-artifacts-root-');
process.env.WF_ROOT = ROOT;
const { artifactFile, fileIn, filesHanded, filesLacked } = await import('./artifacts.store.ts');
const { REFUSING, artifactLines, artifactPlace, artifactsContract, filesDue, nearName } = await import('./artifacts.ts');
import type { Run } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import type { StepRecord } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { names } from '../../test/assessed.ts';

/** A run whose step `build` works in `workspace`, with its files directory made: the run, and that directory. */
function aRun(workspace: string | undefined): { run: Run; dir: string } {
  const id = path.basename(scratch('wf-lacked-'));
  const dir = path.join(ROOT, 'runs', id, 'artifacts', 'build');
  fs.mkdirSync(dir, { recursive: true });
  const run = { id, steps: { build: { taskId: 't1', ...(workspace ? { workspace } : {}) } } } as unknown as Run;
  return { run, dir };
}

/** A closeout that names `artifacts`. */
const naming = (...artifacts: string[]): Closeout => ({ outcome: 'done', summary: 'done', artifacts });

const FILES = '/wf/runs/r-1/artifacts/implement';

test('the artifact path rules: artifactPlace, fileIn and filesLacked', async (t) => {
  await t.test(
    'artifactPlace: from the workspace by a relative path, refused when it climbs out of it; in the files directory by an absolute one inside it; outside anywhere else',
    () => {
      for (const f of ['RESPONSE.md', 'docs/notes.md', './docs/notes.md', 'docs/../RESPONSE.md', '.e2e/shot.png', '..notes.md'])
        assert.equal(artifactPlace(f, FILES), 'workspace', f);
      for (const f of ['../outside.md', '..', '../', 'docs/../../outside.md', './../outside.md'])
        assert.equal(artifactPlace(f, FILES), 'escapes', f);
      for (const f of [
        `${FILES}/factory-light.png`,
        `${FILES}/shots/run-dark.png`,
        `${FILES}/shots/../factory-light.png`,
        `${FILES}/..hidden.png`,
      ])
        assert.equal(artifactPlace(f, FILES), 'files', f);
      for (const f of [
        '/etc/passwd',
        FILES,
        `${FILES}/`,
        `${FILES}/..`,
        `${FILES}/../review/shot.png`,
        `${FILES}-old/shot.png`,
        `${FILES}2/shot.png`,
      ])
        assert.equal(artifactPlace(f, FILES), 'outside', f);
    },
  );
  await t.test(
    'REFUSED: artifactPlace through a folder a harness reads as its own configuration is `configuration`, after escapes and outside',
    () => {
      for (const f of [
        '.claude/skills/x/SKILL.md',
        'docs/.claude/agents/a.md',
        './.claude/settings.json',
        'docs/../.claude/skills/x/SKILL.md',
        `${FILES}/.claude/skills/x/SKILL.md`,
        `${FILES}/shots/.claude/x.md`,
      ])
        assert.equal(artifactPlace(f, FILES), 'configuration', f);
      for (const f of ['claude/x.md', '.claude-notes/x.md', 'x.claude', '.e2e/shot.png'])
        assert.equal(artifactPlace(f, FILES), 'workspace', f);
      assert.equal(artifactPlace(`${FILES}/claude/x.png`, FILES), 'files');
      assert.equal(
        artifactPlace('/srv/.claude/r/files/shot.png', '/srv/.claude/r/files'),
        'files',
        'only the path inside the directory counts',
      );
      assert.equal(artifactPlace('../.claude/x', FILES), 'escapes');
      assert.equal(artifactPlace('/etc/.claude/x', FILES), 'outside');
      assert.equal(artifactPlace(`${FILES}-old/.claude/x`, FILES), 'outside');
    },
  );
  await t.test("fileIn and artifactFile: a step's file is read by its name, from its files directory or from any folder", () => {
    const dir = path.join(ROOT, 'runs', 'r-1', 'artifacts', 'build');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
    assert.equal(artifactFile({ id: 'r-1' }, 'build', 'shot.png')?.toString(), 'png');
    assert.equal(fileIn(dir, 'shot.png')?.toString(), 'png');
    assert.equal(fileIn(dir, 'gone.png'), null);
  });
  await t.test('REFUSED: fileIn of a name that is a path reads none, though the file it reaches is there; nor a folder, nor a link', () => {
    const dir = scratch('wf-artifacts-');
    const beside = scratch('wf-artifacts-beside-');
    fs.writeFileSync(path.join(beside, 'secret.txt'), 'secret');
    fs.mkdirSync(path.join(dir, 'inner'));
    fs.writeFileSync(path.join(dir, 'inner', 'notes.md'), 'notes');
    fs.symlinkSync(path.join(beside, 'secret.txt'), path.join(dir, 'link.txt'));
    assert.equal(fileIn(dir, `../${path.basename(beside)}/secret.txt`), null);
    assert.equal(fileIn(dir, 'inner/notes.md'), null);
    assert.equal(fileIn(dir, 'inner'), null);
    assert.equal(fileIn(dir, 'link.txt'), null);
  });
  await t.test(
    'REFUSED: filesLacked reads each reason a named file is not one the run has off the disk, and every one of them refuses',
    () => {
      const workspace = scratch('wf-lacked-ws-');
      const beside = scratch('wf-lacked-beside-');
      const { run, dir } = aRun(workspace);
      fs.writeFileSync(path.join(beside, 'secret.txt'), 'secret');
      fs.mkdirSync(path.join(workspace, 'shots'));
      fs.symlinkSync(path.join(beside, 'secret.txt'), path.join(workspace, 'link.txt'));
      const lacked = filesLacked(
        run,
        'build',
        naming(
          'gone.md',
          path.join(dir, 'gone.png'),
          'shots',
          'link.txt',
          '../up.md',
          path.join(beside, 'secret.txt'),
          '.claude/note.md',
          'closeout.json',
          path.join(dir, 'closeout.json'),
        ),
      );
      assert.deepEqual(lacked, [
        { path: 'gone.md', why: 'not there' },
        { path: path.join(dir, 'gone.png'), why: 'missing' },
        { path: 'shots', why: 'directory' },
        { path: 'link.txt', why: 'escapes' },
        { path: '../up.md', why: 'escapes' },
        { path: path.join(beside, 'secret.txt'), why: 'outside' },
        { path: '.claude/note.md', why: 'configuration' },
        { path: 'closeout.json', why: 'reserved' },
        { path: path.join(dir, 'closeout.json'), why: 'reserved' },
      ]);
      for (const { why } of lacked) assert.ok(REFUSING.has(why as never), `${why} refuses`);
      assert.deepEqual([...REFUSING].sort(), [...new Set(lacked.map((l) => l.why))].sort(), 'and no other reason does');
    },
  );
  await t.test(
    'filesLacked: a named file the run has is not lacked — in the files directory, collected there, or still in the workspace',
    () => {
      const workspace = scratch('wf-lacked-ws-');
      const { run, dir } = aRun(workspace);
      fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
      fs.writeFileSync(path.join(dir, 'collected.md'), 'copied, and since removed from the workspace');
      fs.writeFileSync(path.join(workspace, 'uncopied.md'), 'in the workspace');
      fs.mkdirSync(path.join(dir, 'blocked.md'));
      fs.writeFileSync(path.join(workspace, 'blocked.md'), 'its copy is refused by a directory in its place');
      assert.deepEqual(filesLacked(run, 'build', naming(path.join(dir, 'shot.png'), 'collected.md', 'uncopied.md', 'blocked.md')), []);
      assert.deepEqual(filesLacked(run, 'build', naming()), []);
      assert.deepEqual(filesLacked(run, 'build', undefined), []);
    },
  );
  await t.test(
    'filesLacked: a path from the workspace root is not judged where there is no workspace to read, none on the record or none on disk',
    () => {
      assert.deepEqual(filesLacked(aRun(undefined).run, 'build', naming('gone.md')), []);
      assert.deepEqual(filesLacked(aRun(path.join(scratch('wf-lacked-ws-'), 'removed')).run, 'build', naming('gone.md')), []);
    },
  );
});

test('filesHanded', async (t) => {
  await t.test('the step after is handed the named files that are there, by absolute path, and a count of the rest', () => {
    const { run, dir } = aRun(scratch('wf-lacked-ws-'));
    fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
    fs.mkdirSync(path.join(dir, 'notes'));
    fs.writeFileSync(path.join(dir, 'notes', 'a.md'), 'collected');
    const handed = filesHanded(
      run,
      'build',
      naming(path.join(dir, 'shot.png'), 'notes/a.md', path.join(dir, 'gone.png'), 'gone.md', '/etc/hosts'),
    );
    assert.deepEqual(handed, { there: [path.join(dir, 'shot.png'), path.join(dir, 'notes', 'a.md')], gone: 3 });
    assert.deepEqual(filesHanded(run, 'build', undefined), { there: [], gone: 0 });
  });
});

const STEPS = [
  { name: 'implement', after: [] },
  { name: 'review', after: ['implement'], loop: 'implement' },
] as unknown as Workflow[];

/** A run whose `implement` is on task `t1`, with `settlesCounted` as given (none for `null`). */
const runOf = (record: Partial<StepRecord> = {}, counted: string[] | null = []): Run =>
  ({ id: 'r-1', steps: { implement: { taskId: 't1', ...record } }, ...(counted ? { settlesCounted: counted } : {}) }) as unknown as Run;

const NAMING = () => ({ artifacts: ['a.md'] });
const SUCCEEDED = (): 'succeeded' => 'succeeded';

test('filesDue: the files of a task are read once, on the pass that first reads it signed, and never of one an earlier tick left unread', async (t) => {
  const rows: Array<[string, Workflow[], Run, (id: string) => string, () => { artifacts: string[] } | undefined, string[]]> = [
    ['signed, naming a file, and unread: due', STEPS, runOf(), SUCCEEDED, NAMING, ['implement']],
    ['still running', STEPS, runOf(), () => 'running', NAMING, []],
    ['failed', STEPS, runOf(), () => 'failed', NAMING, []],
    ['a closeout that names none', STEPS, runOf(), SUCCEEDED, () => ({ artifacts: [] }), []],
    ['no closeout', STEPS, runOf(), SUCCEEDED, () => undefined, []],
    ['a settle an earlier pass counted', STEPS, runOf({}, ['t1']), SUCCEEDED, NAMING, []],
    ['a record that counts no settle', STEPS, runOf({}, null), SUCCEEDED, NAMING, []],
    ['read, and nothing lacked', STEPS, runOf({ filesRead: { taskId: 't1', lacked: {} } }), SUCCEEDED, NAMING, []],
    ['read, and something lacked', STEPS, runOf({ filesRead: { taskId: 't1', lacked: { 'a.md': 'not there' } } }), SUCCEEDED, NAMING, []],
    ['read of another task: due', STEPS, runOf({ filesRead: { taskId: 't0', lacked: {} } }), SUCCEEDED, NAMING, ['implement']],
    ['a check filed before any read', STEPS, runOf({ check: { taskId: 't1-check' } }), SUCCEEDED, NAMING, []],
    ['a pruned run', STEPS, { ...runOf(), pruned: { at: '2026-01-01T00:00:00Z' } } as unknown as Run, SUCCEEDED, NAMING, []],
    ['a step on a remote agent', [{ ...STEPS[0], harness: 'a2a:elsewhere' }, STEPS[1]], runOf(), SUCCEEDED, NAMING, []],
  ];
  for (const [name, steps, r, phaseOf, closeoutOf, due] of rows)
    await t.test(name, () => assert.deepEqual(filesDue(steps, r, phaseOf as never, closeoutOf as never), due));
});

test('nearName: one with the same last name, letter case aside, in the folder named or in another', async (t) => {
  const there = ['/files/builder-dark.png', '/files/shots/factory-dark.png'];
  const rows: Array<[string, string, string | undefined]> = [
    ['in the folder named, another case', '/files/Builder-Dark.png', '/files/builder-dark.png'],
    ['in another folder', '/files/factory-dark.png', '/files/shots/factory-dark.png'],
    ['an unrelated name gives none', '/files/builder-agent-dark.png', undefined],
    ['nor the file itself', '/files/builder-dark.png', undefined],
  ];
  for (const [name, named, near] of rows) await t.test(name, () => assert.equal(nearName(named, there), near));
});

test('artifactsContract: what a step is told of its files', async (t) => {
  await t.test('given the directory as `WF_ARTIFACTS`, a workspace file copied there before its check, and what is refused', () => {
    assert.match(artifactsContract(FILES), /given the same directory as `WF_ARTIFACTS`/);
    assert.match(
      artifactsContract(FILES),
      /the run copies each such file into that directory, at the\n  same path, before it checks your work/,
    );
    assert.match(
      artifactsContract(FILES),
      /Refused, and not read: an absolute\npath anywhere else, and a path that climbs out of the workspace with `\.\.`/,
    );
  });
  await t.test(
    'a file under a configuration folder is not handed over, naming the folder; a step in the checkout is told none of it',
    () => {
      for (const contract of [artifactsContract(FILES), artifactsContract(FILES, false, true)])
        assert.match(
          contract,
          /A file whose path passes through `\.claude`, a folder a harness reads as its own configuration, is\nrefused/,
        );
      assert.doesNotMatch(artifactsContract(FILES, true), /configuration/, 'nothing follows a step in the checkout to read it');
    },
  );
});

test('artifactLines: what `nemia decide` says of a step’s files', async (t) => {
  await t.test('REFUSED: a file under a configuration folder is named, and how to name it instead', () => {
    const lines = artifactLines(FILES, [{ path: '.claude/skills/x/SKILL.md', why: 'configuration' }], []);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith('!! '), lines[0]);
    names(lines[0], 'not handed over: .claude/skills/x/SKILL.md', 'name it outside `.claude`');
  });
  await t.test('each reason a declared file is missing is told apart, never passed over, then the files with their sizes', () => {
    const lines = artifactLines(
      FILES,
      [
        { path: 'NOTES.md', why: 'not there' },
        { path: `${FILES}/gone.png`, why: 'missing' },
        { path: '/etc/passwd', why: 'outside' },
        { path: 'shots', why: 'directory' },
        { path: '../secret.txt', why: 'escapes' },
        { path: 'leak.txt', why: 'escapes' },
        { path: '.e2e/shot.png', why: 'not collected' },
      ],
      [
        { path: `${FILES}/factory-light.png`, bytes: 512 },
        { path: `${FILES}/shots/run-dark.png`, bytes: 48_230 },
        { path: `${FILES}/trace.zip`, bytes: 3 * 1024 * 1024 },
      ],
    );
    assert.deepEqual(lines, [
      '!! declared but not in the workspace: NOTES.md  — nothing to collect',
      '!! declared a directory, not collected: shots  — a step names each file',
      `!! declared and not collected: .e2e/shot.png  — in the workspace, and not in ${FILES}`,
      `!! declared but not in ${FILES}: ${FILES}/gone.png`,
      `!! declared outside the workspace, and not read: ../secret.txt, leak.txt  — name a file from the workspace root, or put it in ${FILES}`,
      `!! declared outside ${FILES}, and not read: /etc/passwd  — a step's files go in its own directory`,
      'files:',
      `  ${FILES}/factory-light.png  512 B`,
      `  ${FILES}/shots/run-dark.png  47.1 KB`,
      `  ${FILES}/trace.zip  3.0 MB`,
    ]);
  });
  await t.test('nothing missing and no files: nothing to say', () => assert.deepEqual(artifactLines(FILES, [], []), []));
});
