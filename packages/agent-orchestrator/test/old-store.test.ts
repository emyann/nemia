/**
 * The oldest store still read, as one story on the stage (`story.ts`): `test/fixtures/old-store/` is a store as earlier ticks left it, its
 * runs in the oldest shapes `readRun` still reads. The story copies it into a scratch store, `@ROOT@` and `@BASE@` in its records made
 * that store's root and its repository's first commit, and never writes the fixture; then it walks the copy through a pass, `nemia ls`,
 * `nemia decide` and `nemia rm`, and reads each record back under the names its keys have now.
 *
 * What each run holds:
 * - `tides`, a repository run frozen while the lists were `disallow:` and `allow:` (`FORMER_KEYS`), its agent's harness prompt under
 *   `systemPrompt: own` and frozen before an agent's denies were kept apart (`agentDenies`), a codex step whose sandbox is the former
 *   `permissionMode`, and an ending frozen as `workspace: main` with `background:`, a key no step has now, its agent on `systemPrompt:
 *   no-coding`. It has filed nothing, and its folder is gone, so a pass files it from what it froze.
 * - `notes`, a repository run that froze no workflow, its steps read off its folder (`workflows/notes`, whose ending says `workspace:
 *   main`), with an earlier try under the former `then`, one whose cause is the former `nudge`, a check, a hand-off, a landing and a
 *   held slot. Its tasks are the engine's as they stood, filed and settled before the walk.
 * - `drafts`, a folder run whose one step says the former `workspace: folder`, a list under its former name beside the new one on the
 *   step and in its agent's `given`, its agent's harness prompt as `systemPrompt: default`, and a key on the record and one on the step
 *   that a newer nemia wrote and this one does not name. It has filed nothing, and its folder is gone too.
 * - `workflows/renamed`, and the agent it names in `workflows/agents`, a folder whose files still write `disallow:` and `allow:`.
 *
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-old-store-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { runWith, tickRun } = await import('../src/runner.ts');
const { listRuns, readRun, rewriteRun, runFile } = await import('../src/record/record.store.ts');
const { ownDenies } = await import('../src/workflow/index.ts');
const { stepPlace } = await import('../src/workflow.ts');
const { renderedFlags } = await import('../src/agents/agents.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'old-store');
const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };

/** The fixture copied into the scratch store, its placeholders made this store's: the fixture itself is never written. */
const copied = (base: string): void => {
  for (const entry of fs.readdirSync(FIXTURE, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(entry.parentPath, entry.name);
    const to = path.join(ROOT, path.relative(FIXTURE, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replaceAll('@ROOT@', ROOT).replaceAll('@BASE@', base));
  }
};

/** A record as it stands on disk. */
const written = (id: string): Record<string, unknown> & { workflow: Array<Record<string, unknown>> } =>
  JSON.parse(fs.readFileSync(runFile(id), 'utf8'));

/** Whether `object` holds any of `keys` as its own. */
const holdsAny = (object: unknown, ...keys: string[]): boolean => keys.some((key) => Object.hasOwn(object as object, key));

/** What `nemia argv` printed on stdout, a line each. */
const printed = async (t: { mock: test.TestContext['mock'] }, argv: string[]): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(a.map(String).join(' ')));
  const error = t.mock.method(console, 'error', () => {});
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return out.join('\n').split('\n');
};

test('the oldest store still works: a pass, `nemia ls`, `nemia decide` and `nemia rm` over it, and each record written back under the names it has now', async (t) => {
  const s = story(t);
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  const pass = () => stage.runWith(b.e, tickRun({ repo: ROOT }));
  const fixtureBytes = fs.readFileSync(path.join(FIXTURE, 'runs', 'tides.json'), 'utf8');

  await s.test('the old store, copied, reads every run under the names its keys have now', async () => {
    const repo = path.join(ROOT, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'desk'), { recursive: true });
    copied(stage.place().world.repository(repo, {}));

    const [implement, review, ship] = readRun('tides').workflow!;
    assert.deepEqual(
      [implement.disallowedTools, implement.allowedTools, implement.agent?.keys],
      [
        ['SendMessage', 'Bash(git push)'],
        ['Edit(**)', 'Bash(npm test)'],
        ['disallowedTools', 'allowedTools'],
      ],
      'a list frozen under its former name reads under the name it has now, on the step and among its agent’s keys',
    );
    assert.deepEqual(implement.agent?.given, { disallowedTools: 'SendMessage, Bash(git push)', allowedTools: 'Edit(**), Bash(npm test)' });
    assert.equal(holdsAny(implement, 'disallow', 'allow'), false, 'and holds no former name');
    assert.deepEqual(
      [implement.agent?.harnessPrompt, holdsAny(implement.agent, 'systemPrompt')],
      ['replace', false],
      '`systemPrompt: own` reads as `harnessPrompt: replace`, and no reader sees the former field',
    );
    assert.deepEqual(
      ownDenies(implement),
      ['SendMessage', 'Bash(git push)'],
      'an agent frozen before its denies were kept apart: the line whole',
    );
    assert.equal(stepPlace(implement), 'git', 'a step frozen before `place:` works on a repository, as it did');
    assert.deepEqual(
      [review.permissionMode, review.sandbox],
      ['bypassPermissions', undefined],
      'a codex sandbox frozen as `permissionMode` reads as frozen',
    );
    assert.deepEqual(
      [ship.workspace, ship.agent?.keys, Reflect.get(ship, 'background')],
      ['base', ['workspace'], true],
      '`workspace: main` reads as `base`; `background:` still decodes',
    );

    const notes = readRun('notes');
    assert.equal(notes.workflow, undefined, 'a record with no frozen workflow reads');
    const tries = notes.steps.implement.tries!;
    assert.deepEqual(
      [tries[0].cause, holdsAny(tries[0], 'then'), tries[1].cause],
      ['retries', false, 'continue'],
      'the former `then` and `nudge` read as today',
    );
    assert.deepEqual(
      [notes.steps.implement.check?.taskId, Reflect.get(notes.steps.ship.landed ?? {}, 'commit')],
      ['notes-implement-try2-check', 'fed789'],
    );

    const [write] = readRun('drafts').workflow!;
    assert.deepEqual(
      [write.place, write.workspace, write.agent?.keys, write.disallowedTools, write.agent?.given],
      ['folder', undefined, ['place', 'disallowedTools'], ['SendMessage'], { disallowedTools: 'SendMessage' }],
      '`workspace: folder` reads as `place: folder`, its agent’s keys too; the former name beside the new one reads under the new alone',
    );
    assert.equal(write.agent?.harnessPrompt, 'keep', '`systemPrompt: default` reads as `harnessPrompt: keep`');
    assert.deepEqual(
      [
        renderedFlags(implement, '/a')?.systemPromptFile,
        renderedFlags(write, '/a')?.appendSystemPromptFile,
        ship.agent?.harnessPrompt,
        renderedFlags(ship, '/a')?.appendSystemPromptFile,
      ],
      ['/a/prompt.md', '/a/prompt.md', 'no-coding', '/a/prompt.md'],
      'each is filed with the flag it was filed with before the rename',
    );

    const listed = listRuns(() => assert.fail('the old store lists every run'));
    for (const id of ['tides', 'notes', 'drafts'])
      assert.deepEqual(listed.find((r) => r.id === id)?.workflow, readRun(id).workflow, `${id} is listed as the tick reads it`);
  });

  await s.test('a pass judges every run and files what is due, each step with its rules under the names they have now', async () => {
    for (const taskId of [
      'notes-implement',
      'notes-implement-check',
      'notes-implement-try1b',
      'notes-implement-try2',
      'notes-implement-try2-check',
      'notes-ship',
    ]) {
      await Effect.runPromise(b.e.file({ id: taskId, brief: 'as it stood', cwd: ROOT, harness: 'claude' }));
      b.settle(taskId, 'succeeded', SIGNED);
    }
    const report = await pass();
    assert.equal(report.unreadable, undefined, `no run is left out: ${JSON.stringify(report.unreadable)}`);
    assert.deepEqual(
      ['tides', 'notes', 'drafts'].map((id) => report.runs.find((a) => a.run.id === id)?.filed ?? []),
      [['implement'], [], ['write']],
      'the unfiled runs file their first step, and the run that froze no workflow files nothing it has already run',
    );
    assert.equal(
      report.runs.find((a) => a.run.id === 'notes')?.status,
      'succeeded',
      'and is judged on its tries, its check and its landing',
    );
    const implement = b.tasks.get('tides-implement')!.spec.config;
    assert.deepEqual(
      [implement?.disallowedTools, implement?.allowedTools],
      [
        ['SendMessage', 'Bash(git push)'],
        ['Edit(**)', 'Bash(npm test)'],
      ],
      'the frozen rules reach the engine: none is dropped',
    );
    const write = b.tasks.get('drafts-write')!.spec;
    assert.deepEqual(write.config?.disallowedTools, ['SendMessage']);
    assert.equal(
      write.cwd,
      path.join(ROOT, 'runs', 'drafts', 'work', 'write'),
      'the step read as `place: folder` works in a folder of its own',
    );
  });

  await s.test('each record the pass wrote holds the names its keys have now alone, and what a newer nemia wrote', () => {
    const [implement, review, ship] = written('tides').workflow;
    assert.deepEqual(
      [implement.disallowedTools, implement.allowedTools],
      [
        ['SendMessage', 'Bash(git push)'],
        ['Edit(**)', 'Bash(npm test)'],
      ],
    );
    assert.equal(holdsAny(implement, 'disallow', 'allow') || holdsAny(implement.agent, 'systemPrompt'), false, 'no former name written');
    assert.deepEqual([review.permissionMode, ship.workspace], ['bypassPermissions', 'base']);
    const drafts = written('drafts');
    const [write] = drafts.workflow;
    assert.deepEqual([write.place, holdsAny(write, 'workspace', 'disallow')], ['folder', false]);
    assert.deepEqual([drafts.fromANewerNemia, write.aNewStepKey], [{ kept: true }, 3], 'a key the tick does not name survives its write');

    assert.ok(rewriteRun(readRun('notes')), 'the run that froze no workflow, read and written back');
    const [first, second] = (written('notes').steps as { implement: { tries: object[] } }).implement.tries;
    assert.deepEqual([Reflect.get(first, 'cause'), holdsAny(first, 'then'), Reflect.get(second, 'cause')], ['retries', false, 'continue']);
    assert.equal(fs.readFileSync(path.join(FIXTURE, 'runs', 'tides.json'), 'utf8'), fixtureBytes, 'the fixture is not written');
  });

  await s.test('the next pass files the codex step with the sandbox it was frozen with, as the engine calls it', async () => {
    b.settle('tides-implement', 'succeeded', SIGNED);
    await pass();
    assert.equal(b.tasks.get('tides-review')?.spec.config?.permissionMode, 'bypassPermissions', 'not Codex’s default');
  });

  await s.test('`nemia ls` lists every run of the old store, and none unreadable', async (c) => {
    const lines = await printed(c, ['ls']);
    for (const id of ['tides', 'notes', 'drafts'])
      assert.ok(
        lines.some((l) => l.startsWith(`${id}  `)),
        lines.join('\n'),
      );
    assert.doesNotMatch(lines.join('\n'), /unreadable/);
  });

  await s.test('`nemia decide` decides a run of the old store', async (c) => {
    const lines = await printed(c, ['decide', 'notes']);
    assert.ok(lines[0].startsWith('notes  take the notes'), lines.join('\n'));
  });

  await s.test(
    '`nemia start` on a folder still on the former names starts under the new, naming each line to rename; renamed, it says nothing',
    async (c) => {
      const dir = path.join(ROOT, 'workflows', 'renamed');
      const said = await printed(c, ['start', 'write it', '--workflows', dir, '--repo', path.join(ROOT, 'repo'), '--no-worktree']);
      const write = readRun(said[0].split(' ')[0]).workflow!.find((step) => step.name === 'write')!;
      assert.deepEqual([write.disallowedTools, write.allowedTools], [['SendMessage'], ['Edit(**)']], 'the run started, its lists read');
      const text = said.join('\n');
      assert.ok(text.includes(`${path.join(dir, 'write.md')}: \`disallow:\` is read as \`disallowedTools:\``), text);
      assert.ok(text.includes(`${path.join(ROOT, 'workflows', 'agents', 'writer.md')}: \`allow:\` is read as \`allowedTools:\``), text);
      const run = readRun(said[0].split(' ')[0]);
      assert.equal(holdsAny(written(run.id).workflow[0], 'disallow', 'allow'), false, '`nemia start` writes no former name');
      await stage.runWith(b.e, tickRun({ repo: ROOT }));
      assert.equal(holdsAny(written(run.id).workflow[0], 'disallow', 'allow'), false, 'nor does the pass after it');

      const sandboxed = path.join(ROOT, 'workflows', 'sandboxed');
      fs.mkdirSync(sandboxed);
      fs.writeFileSync(path.join(sandboxed, 'work.md'), '---\nplace: git\nharness: codex\nsandbox: read-only\n---\nWork it.\n');
      const codex = await printed(c, ['start', 'work it', '--workflows', sandboxed, '--repo', path.join(ROOT, 'repo'), '--no-worktree']);
      const codexId = codex[0].split(' ')[0];
      const sandbox = () => [written(codexId).workflow[0].sandbox, holdsAny(written(codexId).workflow[0], 'permissionMode')];
      assert.deepEqual(sandbox(), ['read-only', false], "a codex step's sandbox is written under `sandbox` alone");
      await stage.runWith(b.e, tickRun({ repo: ROOT }));
      assert.deepEqual(sandbox(), ['read-only', false], 'at `nemia start` and after a pass');

      fs.writeFileSync(path.join(dir, 'write.md'), '---\nplace: git\nagent: writer\ndisallowedTools: SendMessage\n---\n');
      fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'writer.md'), '---\nallowedTools: Edit(**)\n---\nWrite it.\n');
      const again = await printed(c, ['start', 'write it', '--workflows', dir, '--repo', path.join(ROOT, 'repo'), '--no-worktree']);
      assert.doesNotMatch(again.join('\n'), /former name|is read as `/);
    },
  );

  await s.test('`nemia rm` forgets a run of the old store, and the others stay', async (c) => {
    const said = await printed(c, ['rm', 'notes']);
    assert.ok(
      said.some((l) => l.startsWith('notes  ')),
      said.join('\n'),
    );
    assert.equal(fs.existsSync(runFile('notes')), false, 'its record is gone');
    assert.deepEqual(
      listRuns(() => {})
        .map((r) => r.id)
        .filter((id) => ['tides', 'notes', 'drafts'].includes(id))
        .sort(),
      ['drafts', 'tides'],
    );
  });
});
