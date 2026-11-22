/**
 * A card carries its files to every run started from it: a card naming a kept File, started, leaves the File's bytes in the run's
 * `inputs/` under the name the card gives it, its name frozen on the record; a card whose File was let go of, and one whose file takes the
 * name of an `--input`, are refused before anything is written, by their kind.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { inboxDir, runWith, startFromInbox } from '../src/runner.ts';
import { fileBegun, fileKept } from '../src/start/files.store.ts';
import { inputsDir, runRecord } from '../src/record/record.store.ts';
import { main as cli } from '../src/cli/main.ts';
import { engineOf } from '../src/runtime-client.ts';
import { staged } from './story.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-card-files-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
  WF_DEFAULT_FACTORY_STARTS: '1',
};
const stage = staged({ runWith, main: cli, engineOf, env: ENV });
const { runPlaced } = stage;

/** A repository of the stage's place, with the one-step workflow `look` under its `workflows/`. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  fs.mkdirSync(path.join(repo, 'workflows', 'look'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'workflows', 'look', 'look.md'), '---\nplace: git\n---\nlook at it\n');
  return repo;
};

/** A File of the default namespace kept with `bytes`, as an upload keeps one. */
const kept = (bytes: Buffer, name = 'upload.png') => {
  const now = Date.now();
  const begun = fileBegun(ROOT, 'default', now);
  assert.ok(begun);
  begun.write(bytes);
  begun.close();
  return fileKept(ROOT, 'default', {
    id: begun.id,
    name,
    mediaType: 'image/png',
    size: bytes.length,
    createdAt: new Date(now).toISOString(),
  });
};

/** Files the card `name` on the workflow `look`, carrying `files`, its text naming the first. */
const card = (name: string, files: Record<string, string>) => {
  fs.mkdirSync(inboxDir(ROOT), { recursive: true });
  const lines = Object.entries(files).map(([n, id]) => `  ${n}: ${id}`);
  fs.writeFileSync(
    path.join(inboxDir(ROOT), `${name}.md`),
    `---\nworkflow: look\nfiles:\n${lines.join('\n')}\n---\nLook at ![it](shot.png).\n`,
  );
  return name;
};

/** The store's runs, by their directory: what a refused start must leave as it was. */
const runsNow = () => fs.readdirSync(path.join(ROOT, 'runs')).sort() satisfies string[];

describe("a card's files reach the run started from it", () => {
  test("the card's File is copied into the run's inputs under the card's name for it, and frozen on the record", async () => {
    const repo = aRepo();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const file = kept(bytes);
    const { run } = await runPlaced(startFromInbox({ name: card('look-a1b2', { 'shot.png': file.id }), callerRepo: repo, isolate: false }));
    const record = runRecord(ROOT, run.id);
    assert.deepEqual(record.inputs, ['shot.png']);
    assert.deepEqual(fs.readFileSync(path.join(inputsDir(ROOT, record), 'shot.png')), bytes);
  });
  test('REFUSED: a card whose File is no longer kept, and one whose file takes the name of an --input, before anything is written', async () => {
    const repo = aRepo();
    const before = runsNow();
    await assert.rejects(
      runPlaced(startFromInbox({ name: card('look-c3d4', { 'shot.png': `file_${'0'.repeat(32)}` }), callerRepo: repo, isolate: false })),
      (err: Error & { _tag?: string }) => err._tag === 'Invalid',
    );
    const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'shot.png');
    fs.writeFileSync(given, 'another\n');
    const file = kept(Buffer.from('x'));
    await assert.rejects(
      runPlaced(startFromInbox({ name: card('look-e5f6', { 'shot.png': file.id }), callerRepo: repo, isolate: false, inputs: [given] })),
      (err: Error & { _tag?: string }) => err._tag === 'Invalid',
    );
    assert.deepEqual(runsNow(), before, 'no run is written');
  });
});
