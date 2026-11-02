/**
 * Every key a step sets reaches the runtime, on every filing — told as one person's story on the stage (`story.ts`): a run started by
 * its workflow's name, whose implement sets its tools, effort, context window, both rule lists and a bridge, filed so on its first
 * filing, on a try `retries:` files, on a try `nemia retry` asks for and on a round, while its check — the run's own — is filed with none
 * of them; then a codex step's trust and sandbox, a run frozen under the former names, a step continuing another's window, and a step
 * at shipped defaults, which names none. What each key reads as is `src/workflow/step-file.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in repositories no factory holds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryRun, Run } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-filing-keys-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const { advanceRun, retryRun, startRun, runWith } = await import('../src/runner.ts');
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { isRepositoryRun } = await import('../src/run.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** A strict `findings` schema and `again`, as the tests' team's `test/fixtures/team/agents/review.schema.json` declares them. */
const LOOPING = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
    again: { type: 'boolean' },
  },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];
const REPLIES = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'the flag is parsed before it is read' }];
const reviewSays = (again: boolean) => ({ ...SIGNED, findings: FOUND, again });
const ANSWERED = { ...SIGNED, replies: REPLIES };

/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));
/** What the engine was filed with for the task `id`. */
const specOf = (id: string) => {
  const task = stage.board().tasks.get(id);
  assert.ok(task, `${id} was filed`);
  return task.spec;
};
/** The keys of a filing this file is about, as the engine's task holds them. */
const keysOf = (id: string) => {
  const { config } = specOf(id);
  return {
    tools: config?.tools,
    effort: config?.effort,
    contextTokens: config?.contextTokens,
    disallowedTools: config?.disallowedTools,
    allowedTools: config?.allowedTools,
    remoteControl: config?.claude?.remoteControl,
  };
};
/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};
/**
 * implement, checked and tried once more by `retries: 1`, with `implementKeys` → review, looping back to it, with `reviewKeys` — in
 * `dir`. Each key set ends with a newline.
 */
const looped = (dir: string, reviewKeys = '', implementKeys = '') => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\ncheck: npm test\nretries: 1\n${implementKeys}---\nimplement it\n`);
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    `---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n${reviewKeys}---\nreview it\n`,
  );
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(LOOPING, null, 2));
  return dir;
};
/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${implementKeys ? `${implementKeys}\n` : ''}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};
const repositoryRunOf = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};
/** `nemia start` over a fresh repository, the steps working in its checkout. */
const started = async (dir: string, repo = aRepo()) =>
  repositoryRunOf(await stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: dir, isolate: false })));
/** A run's record as it is on disk, its frozen steps as plain objects. */
const recordAt = (id: string) => path.join(ROOT, 'runs', `${id}.json`);
const frozenStep = (id: string, step = 'implement') =>
  (JSON.parse(fs.readFileSync(recordAt(id), 'utf8')) as { workflow: Array<Record<string, unknown>> }).workflow.find((s) => s.name === step);

const EDITS = ['Read', 'Edit', 'Write', 'Bash'];
const REVIEWS = ['Read', 'Grep', 'Glob', 'Bash'];
/** What implement sets, and every filing of its session carries. */
const IMPLEMENT = {
  tools: EDITS,
  effort: 'low',
  contextTokens: 200_000,
  disallowedTools: ['Bash(npm run build)', 'SendMessage'],
  allowedTools: ['Edit(**)', 'Bash(npm test)'],
  remoteControl: true,
};
/** What review sets: its own, and no allow list nor bridge. */
const REVIEW = {
  tools: REVIEWS,
  effort: 'max',
  contextTokens: undefined,
  disallowedTools: ['Bash(npm run build)'],
  allowedTools: undefined,
  remoteControl: undefined,
};
/** Nothing: what the run's own check, and a step at shipped defaults, is filed with. */
const NONE = {
  tools: undefined,
  effort: undefined,
  contextTokens: undefined,
  disallowedTools: undefined,
  allowedTools: undefined,
  remoteControl: undefined,
};

test('every key a step sets reaches the runtime, on every filing — and a check, and a step that sets none, is filed with none', async (t) => {
  const s = story(t);
  const repo = aRepo();
  const dir = looped(
    path.join(repo, 'workflows', 'keys'),
    'tools: Read, Grep, Glob, Bash\ndisallowedTools: Bash(npm run build)\neffort: max\n',
    'tools: Read, Edit, Write, Bash\neffort: low\ncontext: 200k\ndisallowedTools: Bash(npm run build), SendMessage\nallowedTools: Edit(**), Bash(npm test)\nremote: true\n',
  );
  let id = '';

  await s.test("`nemia start --workflows <name>` starts the repository's workflow of that name", async (c) => {
    const printed: string[] = [];
    c.mock.method(console, 'log', (...args: unknown[]) => {
      printed.push(args.join(' '));
    });
    await stage.main(['start', 'add a flag', '--workflows', 'keys', '--repo', repo]);
    id = printed[0].split(' ')[0];
    assert.equal(readRun(id).workflowDir, dir);
  });

  await s.test('REFUSED: a name the repository does not have, naming both places and the workflows it has', async () => {
    const before = fs.readdirSync(path.join(ROOT, 'runs')).length;
    await assert.rejects(stage.main(['start', 'add a flag', '--workflows', 'kyes', '--repo', repo]), (e: Error & { exitCode?: number }) => {
      assert.equal(e.exitCode, 2, e.message);
      for (const named of [
        `no workflow folder at ${path.resolve('kyes')}`,
        `nor a workflow named kyes in ${path.join(repo, 'workflows')}`,
        ': keys',
      ])
        assert.ok(e.message.includes(named), e.message);
      return true;
    });
    assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, before, 'no run is written');
  });

  await s.test('the first filing carries every key implement sets, and a job files no background session', async () => {
    assert.deepEqual((await tick(id)).filed, ['implement']);
    assert.deepEqual(keysOf(`${id}-implement`), IMPLEMENT);
    assert.equal('background' in (specOf(`${id}-implement`).config ?? {}), false);
  });

  await s.test("the check is the run's own, filed with none of them", async () => {
    stage.board().settle(`${id}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(id)).checked, ['implement']);
    assert.equal(specOf(`${id}-implement-check`).harness, 'check');
    assert.deepEqual(keysOf(`${id}-implement-check`), NONE);
  });

  await s.test('a try `retries:` files continues the session, with every key', async () => {
    stage.board().settle(`${id}-implement-check`, 'failed', undefined, 1);
    assert.deepEqual((await tick(id)).tried, ['implement']);
    assert.deepEqual(keysOf(`${id}-implement-try2`), IMPLEMENT);
    assert.equal(specOf(`${id}-implement-try2`).resumeFrom, `native-${id}-implement`);
  });

  await s.test('a try `nemia retry` asks for is a new session on the model asked for, with every key', async () => {
    stage.board().settle(`${id}-implement-try2`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(id)).checked, ['implement']);
    stage.board().settle(`${id}-implement-try2-check`, 'failed', undefined, 1);
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh', model: 'opus' }));
    assert.deepEqual((await tick(id)).tried, ['implement']);
    assert.deepEqual(keysOf(`${id}-implement-try3`), IMPLEMENT);
    assert.deepEqual([specOf(`${id}-implement-try3`).config?.model, specOf(`${id}-implement-try3`).resumeFrom], ['opus', undefined]);
  });

  await s.test('a round files its target with its keys, and the looping step — a new session each round — with its own', async () => {
    stage.board().settle(`${id}-implement-try3`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(id)).checked, ['implement']);
    stage.board().settle(`${id}-implement-try3-check`, 'succeeded', undefined, 0);
    assert.deepEqual((await tick(id)).filed, ['review']);
    assert.deepEqual(keysOf(`${id}-review`), REVIEW);
    stage.board().settle(`${id}-review`, 'succeeded', reviewSays(true));
    assert.deepEqual((await tick(id)).looped, ['review']);
    assert.deepEqual(keysOf(`${id}-implement-try4`), IMPLEMENT);
    assert.equal(specOf(`${id}-implement-try4`).resumeFrom, `native-${id}-implement-try3`, 'the round continues implement');
    stage.board().settle(`${id}-implement-try4`, 'succeeded', ANSWERED);
    assert.deepEqual((await tick(id)).checked, ['implement']);
    stage.board().settle(`${id}-implement-try4-check`, 'succeeded', undefined, 0);
    assert.deepEqual((await tick(id)).filed, ['review']);
    assert.deepEqual(keysOf(`${id}-review-try2`), REVIEW);
    assert.equal(specOf(`${id}-review-try2`).resumeFrom, undefined);
  });

  await s.test("a codex step of a repository run trusts its repository's real path, on its first filing, a try and a round", async () => {
    const real = aRepo();
    const link = path.join(scratch('wf-linked-'), 'repo');
    fs.symlinkSync(real, link);
    const run = await started(looped(fs.mkdtempSync(path.join(ROOT, 'wf-')), '', 'harness: codex\n'), link);
    assert.equal(run.repo, link, 'the record keeps the path the run was started with');
    const trusted = { trustFrom: fs.realpathSync(real) };
    await tick(run.id);
    assert.deepEqual(specOf(`${run.id}-implement`).config?.codex, trusted, 'the first filing');
    stage.board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(run.id)).checked, ['implement']);
    stage.board().settle(`${run.id}-implement-check`, 'failed', undefined, 1);
    assert.deepEqual((await tick(run.id)).tried, ['implement']);
    assert.deepEqual(specOf(`${run.id}-implement-try2`).config?.codex, trusted, 'the try `retries:` files');
    stage.board().settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(run.id)).checked, ['implement']);
    stage.board().settle(`${run.id}-implement-try2-check`, 'succeeded', undefined, 0);
    assert.deepEqual((await tick(run.id)).filed, ['review']);
    stage.board().settle(`${run.id}-review`, 'succeeded', reviewSays(true));
    assert.deepEqual((await tick(run.id)).looped, ['review']);
    assert.deepEqual(specOf(`${run.id}-implement-try3`).config?.codex, trusted, 'the round');
    assert.equal(specOf(`${run.id}-review`).config?.codex, undefined, 'a Claude Code step names no trust');
  });

  await s.test('a codex step of a folder run, and a codex try whose repository is gone, trust nothing', async () => {
    const team = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\nharness: codex\n---\nwrite the note\n');
    const inFolders = await stage.runPlaced(startRun({ brief: 'a note', repo: scratch('wf-not-a-repo-'), workflowDir: team }));
    assert.equal(isRepositoryRun(inFolders), false);
    await tick(inFolders.id);
    assert.deepEqual([specOf(`${inFolders.id}-write`).harness, specOf(`${inFolders.id}-write`).config?.codex], ['codex', undefined]);

    const repo = aRepo();
    const gone = await started(folder('harness: codex\ncheck: npm test\nretries: 1'), repo);
    await tick(gone.id);
    stage.board().settle(`${gone.id}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(gone.id)).checked, ['implement']);
    stage.board().settle(`${gone.id}-implement-check`, 'failed', undefined, 1);
    fs.rmSync(repo, { recursive: true, force: true });
    assert.deepEqual((await tick(gone.id)).tried, ['implement'], 'filed, rather than thrown out of the pass');
    assert.equal(specOf(`${gone.id}-implement-try2`).config?.codex, undefined);
  });

  await s.test("a codex step's `sandbox:` is filed as the engine's `permissionMode`, and a Claude Code step's mode as itself", async () => {
    const codex = await started(folder('harness: codex\nsandbox: read-only'));
    const claude = await started(folder('permissionMode: dontAsk'));
    await tick(codex.id);
    await tick(claude.id);
    assert.equal(specOf(`${codex.id}-implement`).config?.permissionMode, 'read-only');
    assert.equal(specOf(`${claude.id}-implement`).config?.permissionMode, 'dontAsk');
  });

  await s.test("a record holds each step's lists and a codex sandbox under today's names, at `nemia start` and after a pass", async () => {
    const lists = await started(folder('disallowedTools: SendMessage\nallowedTools: Edit(**), Bash(npm test)'));
    const codex = await started(folder('harness: codex\nsandbox: read-only'));
    const held = () => {
      const step = frozenStep(lists.id) ?? {};
      const sandboxed = frozenStep(codex.id) ?? {};
      return {
        lists: [step.disallowedTools, step.allowedTools],
        former: [Object.hasOwn(step, 'disallow'), Object.hasOwn(step, 'allow'), Object.hasOwn(sandboxed, 'permissionMode')],
        sandbox: sandboxed.sandbox,
      };
    };
    const TODAY = { lists: [['SendMessage'], ['Edit(**)', 'Bash(npm test)']], former: [false, false, false], sandbox: 'read-only' };
    assert.deepEqual(held(), TODAY, '`nemia start` writes them under the new names');
    await tick(lists.id);
    await tick(codex.id);
    assert.deepEqual(held(), TODAY, 'and the tick writes them back the same way');
  });

  await s.test(
    'a run frozen under `disallow` and `allow` loads, files its rules under the names they have now, and is written back so',
    async () => {
      const run = await started(folder('disallowedTools: SendMessage\nallowedTools: Edit(**), Bash(npm test)'));
      const record = JSON.parse(fs.readFileSync(recordAt(run.id), 'utf8')) as Run & { workflow: Array<Record<string, unknown>> };
      record.workflow = record.workflow.map(({ disallowedTools, allowedTools, ...step }) => ({
        ...step,
        ...(disallowedTools ? { disallow: disallowedTools } : {}),
        ...(allowedTools ? { allow: allowedTools } : {}),
      }));
      fs.writeFileSync(recordAt(run.id), JSON.stringify(record, null, 2));
      assert.doesNotMatch(fs.readFileSync(recordAt(run.id), 'utf8'), /"(disallowed|allowed)Tools":/, 'the fixture holds no new name');
      const read = readRun(run.id).workflow?.find((s) => s.name === 'implement');
      assert.deepEqual([read?.disallowedTools, read?.allowedTools], [['SendMessage'], ['Edit(**)', 'Bash(npm test)']]);
      assert.equal(Object.hasOwn(read ?? {}, 'allow') || Object.hasOwn(read ?? {}, 'disallow'), false);
      assert.deepEqual(listRuns().find((r) => r.id === run.id)?.workflow, readRun(run.id).workflow, 'listed as the tick reads it');
      await tick(run.id);
      const filed = keysOf(`${run.id}-implement`);
      assert.deepEqual([filed.disallowedTools, filed.allowedTools], [['SendMessage'], ['Edit(**)', 'Bash(npm test)']], 'none is dropped');
      const written = frozenStep(run.id) ?? {};
      assert.deepEqual([written.disallowedTools, written.allowedTools], [['SendMessage'], ['Edit(**)', 'Bash(npm test)']]);
      assert.equal(Object.hasOwn(written, 'disallow') || Object.hasOwn(written, 'allow'), false, 'written back under the new names alone');
    },
  );

  await s.test('a codex run frozen while its sandbox was `permissionMode` files that sandbox as it was frozen', async () => {
    for (const [sandbox, word] of [
      ['read-only', 'read-only'],
      ['danger-full-access', 'bypassPermissions'],
    ]) {
      const run = await started(folder(`harness: codex\nsandbox: ${sandbox}`));
      const record = JSON.parse(fs.readFileSync(recordAt(run.id), 'utf8')) as Run & { workflow: Array<Record<string, unknown>> };
      record.workflow = record.workflow.map(({ sandbox: given, permissionMode: _, ...step }) => ({
        ...step,
        ...(given ? { permissionMode: word } : {}),
      }));
      fs.writeFileSync(recordAt(run.id), JSON.stringify(record, null, 2));
      assert.doesNotMatch(fs.readFileSync(recordAt(run.id), 'utf8'), /"sandbox":/, 'the fixture holds no `sandbox`');
      const read = readRun(run.id).workflow?.find((s) => s.name === 'implement');
      assert.deepEqual([read?.permissionMode, read?.sandbox], [word, undefined], 'read as it was frozen');
      await tick(run.id);
      assert.equal(specOf(`${run.id}-implement`).config?.permissionMode, word, "not Codex's default");
    }
  });

  await s.test("a step continuing another's session inherits its window, and so does its retry", async () => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncontext: 200k\n---\nimplement it\n');
    fs.writeFileSync(path.join(dir, 'respond.md'), '---\nresume: implement\nplace: git\ncheck: npm test\n---\nanswer it\n');
    const run = await started(dir);
    await tick(run.id);
    stage.board().settle(`${run.id}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(run.id)).filed, ['respond']);
    assert.deepEqual(
      [specOf(`${run.id}-respond`).resumeFrom, specOf(`${run.id}-respond`).config?.contextTokens],
      [`native-${run.id}-implement`, 200_000],
    );
    stage.board().settle(`${run.id}-respond`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(run.id)).checked, ['respond']);
    stage.board().settle(`${run.id}-respond-check`, 'failed', undefined, 1);
    await stage.runWith(stage.board().e, retryRun(run.id, 'respond', { mode: 'continue', message: 'the test fails' }));
    assert.deepEqual((await tick(run.id)).tried, ['respond']);
    assert.equal(specOf(`${run.id}-respond-try2`).config?.contextTokens, 200_000, 'its nudge, continuing the same chain');
  });

  await s.test(
    "at shipped defaults a step names none, and is filed with none: the harness's own tools, window and effort, unbridged",
    async () => {
      const run = await started(folder());
      await tick(run.id);
      assert.deepEqual(keysOf(`${run.id}-implement`), NONE);
    },
  );
});
