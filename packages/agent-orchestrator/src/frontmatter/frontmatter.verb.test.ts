/**
 * `nemia frontmatter rewrite` over a scratch store and a folder: the former form rewritten as YAML in the store's workflows, inbox and a
 * templated factory's tree and applied base alike, the body untouched; a second run finds nothing; `--check` writes nothing and ends with
 * exit 1; a file in neither form is refused at its line, exit 2; and a ` #` tail of a YAML file is listed and left as written.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { readFrontmatter } from './frontmatter.ts';
import { readKeys } from '../former/former.ts';
import { splitFrontmatter, WorkflowError } from '../step/step.ts';
import { FRONTMATTER_REWRITE, rewriteFolders, rewrittenLines, storeFolders, type Rewritten } from './frontmatter.verb.ts';
import { parseAgent, parseWorkflow } from '../workflow.ts';

const FORMER = fs.readFileSync(path.join(import.meta.dirname, '../../test/fixtures/former-frontmatter/build-land.md'), 'utf8');
const TAIL = '---\ncheck: npm test # every file\nbudget: 2\n---\nThe body.\n';
const NEITHER = '---\nafter: [review\nthis line is prose\n---\nThe body.\n';

/** `text` written at `file`, its folders made. */
const put = (file: string, text: string, mode = 0o644): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.chmodSync(file, mode);
  return file;
};

/** What follows a file's frontmatter, byte for byte. */
const bodyOf = (text: string): string => text.slice(text.indexOf('\n---\n', 3) + 5);

/** A file's keys as the step and agent readers read them (`readKeys`), a harness's block read into its fence keys. */
const keysOf = (file: string, text: string) => readKeys(file, splitFrontmatter(file, text).block!, () => undefined).meta;

/** The command's handler run on `argv`'s arguments over the store `home`: its answer, or how it failed and the exit code it carries. */
async function rewrite(home: string, args: { folders?: string[]; check?: true }) {
  const exit = await Effect.runPromiseExit(FRONTMATTER_REWRITE.handler(args, {}, home) as Effect.Effect<Rewritten, unknown>);
  if (Exit.isSuccess(exit)) return { found: exit.value, failed: undefined };
  const failed = Cause.squash(exit.cause) as Error & { exitCode?: number };
  return { found: undefined, failed };
}

test("the store's workflows, inbox and a templated factory's tree and applied base are rewritten alike, once, the body untouched", async () => {
  const home = scratch('wf-frontmatter-store-');
  const files = [
    put(path.join(home, 'workflows', 'build', 'land.md'), FORMER),
    put(path.join(home, 'inbox', 'card.md'), FORMER),
    put(path.join(home, 'factories', 'acme', 'tree', 'workflows', 'build', 'land.md'), FORMER),
    put(path.join(home, 'factories', 'acme', 'applied', 'workflows', 'build', 'land.md'), FORMER, 0o444),
  ];
  put(path.join(home, 'workflows', 'node_modules', 'x', 'land.md'), FORMER);
  put(path.join(home, 'workflows', '.git', 'land.md'), FORMER);
  assert.deepEqual(storeFolders(home), [
    path.join(home, 'workflows'),
    path.join(home, 'inbox'),
    path.join(home, 'factories', 'acme', 'tree'),
    path.join(home, 'factories', 'acme', 'applied'),
  ]);

  const checked = await rewrite(home, { check: true });
  assert.equal(checked.failed?.exitCode, 1, '--check ends with exit 1 where a rewrite is due');
  for (const file of files) assert.equal(fs.readFileSync(file, 'utf8'), FORMER, '--check writes nothing');

  const first = await rewrite(home, {});
  assert.deepEqual(first.found?.rewritten, files, 'each of the four, and nothing under .git or node_modules');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.notEqual(text, FORMER);
    assert.equal(readFrontmatter(file, splitFrontmatter(file, text).block!).former, false, 'now YAML');
    assert.deepEqual(
      keysOf(file, text),
      keysOf(file, FORMER),
      'every value as the former reader read it, a top-level fence key read from its block',
    );
    assert.equal(bodyOf(text), bodyOf(FORMER), 'the body byte for byte');
  }
  assert.equal(fs.statSync(files[3]).mode & 0o777, 0o444, "the applied base's file stays read-only");
  assert.equal(fs.readFileSync(path.join(home, 'workflows', 'node_modules', 'x', 'land.md'), 'utf8'), FORMER);
  assert.deepEqual(fs.readdirSync(path.dirname(files[0])), ['land.md'], 'no file left beside the one renamed onto it');

  const again = await rewrite(home, {});
  assert.deepEqual(again.found?.rewritten, [], 'a second run finds nothing to rewrite');
  assert.equal((await rewrite(home, { check: true })).failed, undefined, 'and --check passes');
});

test('a folder given: a file in neither form refused at its line, a ` #` tail listed and left, a file already YAML untouched', async () => {
  const home = scratch('wf-frontmatter-home-');
  const dir = scratch('wf-frontmatter-folder-');
  const former = put(path.join(dir, 'a', 'former.md'), FORMER);
  const tail = put(path.join(dir, 'tail.md'), TAIL);
  const neither = put(path.join(dir, 'neither.md'), NEITHER);
  const plain = put(path.join(dir, 'plain.md'), 'No frontmatter.\n');

  const found = rewriteFolders([dir], false);
  assert.deepEqual(found.rewritten, [former]);
  assert.deepEqual(found.tails, [`${tail}:2`], 'the line YAML ends at " #"');
  assert.deepEqual(
    found.refused.map((r) => r.file),
    [neither],
  );
  assert.ok(found.refused[0].why.startsWith(`${neither}:`), 'the refusal names the file and its line');
  assert.equal(fs.readFileSync(tail, 'utf8'), TAIL, 'a tail is the author’s to settle: not rewritten');
  assert.equal(fs.readFileSync(neither, 'utf8'), NEITHER);
  assert.equal(fs.readFileSync(plain, 'utf8'), 'No frontmatter.\n');

  const handled = await rewrite(home, { folders: [dir] });
  assert.ok(handled.failed instanceof WorkflowError, 'a refused file ends the command as its refusal');
  assert.equal(handled.failed?.exitCode, 2);
  fs.rmSync(neither);
  const clean = await rewrite(home, { folders: [dir], check: true });
  assert.equal(clean.failed, undefined, 'a tail alone is no rewrite due');
  assert.deepEqual(clean.found?.tails, [`${tail}:2`]);
});

test("a top-level fence key moves into the block of the harness its file runs on, its agent's where it names none, every value kept", async () => {
  const home = scratch('wf-frontmatter-fence-');
  const dir = path.join(home, 'team');
  const step = put(
    path.join(dir, 'dev', 'review.md'),
    '---\nplace: git\nagent: reviewer\npermissionMode: bypassPermissions\n---\nReview.\n',
  );
  const agent = put(path.join(dir, 'agents', 'reviewer.md'), '---\nharness: codex\nmodel: gpt-5\n---\nYou review.\n');
  assert.equal((await rewrite(home, { folders: [dir], check: true })).failed?.exitCode, 1, '--check ends with exit 1: a move is due');
  assert.deepEqual((await rewrite(home, { folders: [dir] })).found?.rewritten, [step], 'the step alone: its agent writes no fence');
  const moved = fs.readFileSync(step, 'utf8');
  const read = readFrontmatter(step, splitFrontmatter(step, moved).block!).entries;
  assert.deepEqual(
    read.map((e) => e.key),
    ['place', 'agent', 'codex'],
    "no fence key left at the top level: the block named by its agent's harness",
  );
  assert.deepEqual(
    keysOf(step, moved),
    { place: 'git', agent: 'reviewer', sandbox: 'danger-full-access' },
    "codex's former mode is its sandbox",
  );
  assert.equal(bodyOf(moved), bodyOf('---\n---\nReview.\n'), 'the body byte for byte');
  assert.equal(fs.readFileSync(agent, 'utf8'), '---\nharness: codex\nmodel: gpt-5\n---\nYou review.\n');
  assert.equal((await rewrite(home, { folders: [dir], check: true })).failed, undefined, 'and --check passes after');
});

test('a step that names no agent: each fence key goes to the harness that takes it, and a `permissionMode` it cannot place is kept and said', async () => {
  const home = scratch('wf-frontmatter-hired-');
  const dir = path.join(home, 'factories', 'acme', 'applied', 'workflows', 'dev');
  const step = put(path.join(dir, 'review.md'), '---\nplace: git\nsandbox: read-only\npermissionMode: plan\n---\nReview.\n');
  const found = (await rewrite(home, { folders: [dir] })).found;
  assert.deepEqual(found?.rewritten, [step]);
  assert.deepEqual(found?.kept, [{ file: step, key: 'permissionMode' }], 'its harness is not known here: the line is kept');
  assert.ok(
    rewrittenLines(found).some((line) => line.startsWith('kept:') && line.includes(step) && line.includes('permissionMode')),
    'and the command says so',
  );
  const moved = fs.readFileSync(step, 'utf8');
  assert.deepEqual(
    readFrontmatter(step, splitFrontmatter(step, moved).block!).entries.map((e) => e.key),
    ['place', 'permissionMode', 'codex'],
    "`sandbox` under codex's block, whatever harness the file's own lines would guess",
  );
  const agents = new Map([['coder', parseAgent('coder', '---\nharness: codex\nmodel: gpt-5\n---\nYou code.\n')]]);
  const hired = parseWorkflow('review', moved.replace('permissionMode: plan\n', ''), undefined, agents, undefined, {
    agent: 'coder',
    factory: 'acme',
    step: 'dev/review',
  });
  assert.equal(hired.sandbox, 'read-only', 'the moved step loads hired onto a Codex agent');
});
