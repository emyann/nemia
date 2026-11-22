/**
 * A card carries its files to every run started from it: a card naming a kept File, started, leaves the File's bytes in the run's
 * `inputs/` under the name the card gives it, its name frozen on the record; a card whose File was let go of, and one whose file takes the
 * name of an `--input`, are refused before anything is written, by their kind. A card whose File is gone is answered as its refusal says:
 * the file attached again under its name replaces the reference, and the card starts. An idea whose `factory:` is not the namespace it is
 * filed in is refused, nothing filed, since its Files were uploaded to the namespace it was sent to.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { keysUnder, runRecord } from '../testing.ts';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { INBOX_ADD, INBOX_ATTACH, inboxDir, runWith, startFromInbox } from '../src/runner.ts';
import { Effect } from 'effect';
import { StoreRoot } from '../src/config/root.store.ts';
import { FileDoor } from '../src/start/files.store.ts';
import { inputsDir } from '../src/record/record.store.ts';
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
/** A handler's program over this test's engine and place. */
const served = <A, E>(program: Parameters<typeof stage.runWith<A, E>>[1]) => stage.runWith(stage.board().e, program);

/** A repository of the stage's place, with the one-step workflow `look` under its `workflows/`. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  fs.mkdirSync(path.join(repo, 'workflows', 'look'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'workflows', 'look', 'look.md'), '---\nplace: git\n---\nlook at it\n');
  return repo;
};

/** A File of the default namespace kept with `bytes`, as an upload keeps one, through the File door at the store's root. */
const kept = (bytes: Buffer, name = 'upload.png') =>
  Effect.runPromise(
    Effect.gen(function* () {
      const now = Date.now();
      const door = yield* FileDoor;
      const begun = yield* door.files.begin('default', now);
      assert.ok(begun);
      begun.write(bytes);
      begun.close();
      return yield* door.files.keep('default', {
        id: begun.id,
        name,
        mediaType: 'image/png',
        size: bytes.length,
        digest: begun.digest(),
        createdAt: new Date(now).toISOString(),
      });
    }).pipe(Effect.provideService(StoreRoot, ROOT)),
  );

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
const runsNow = () => [...fs.readdirSync(path.join(ROOT, 'runs')), ...keysUnder(ROOT, '/registry/runs/')].sort() satisfies string[];

describe("a card's files reach the run started from it", () => {
  test("the card's File is copied into the run's inputs under the card's name for it, and frozen on the record", async () => {
    const repo = aRepo();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const file = await kept(bytes);
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
    const file = await kept(Buffer.from('x'));
    await assert.rejects(
      runPlaced(startFromInbox({ name: card('look-e5f6', { 'shot.png': file.id }), callerRepo: repo, isolate: false, inputs: [given] })),
      (err: Error & { _tag?: string }) => err._tag === 'Invalid',
    );
    assert.deepEqual(runsNow(), before, 'no run is written');
  });
  test('a card whose File is gone starts once the file is attached again under its name, and a kept one is still not given twice', async () => {
    const repo = aRepo();
    const name = card('look-a7b8', { 'shot.png': `file_${'0'.repeat(32)}` });
    await assert.rejects(
      runPlaced(startFromInbox({ name, callerRepo: repo, isolate: false })),
      (err: Error & { _tag?: string }) => err._tag === 'Invalid',
    );
    const bytes = Buffer.from('again');
    const again = await kept(bytes);
    await served(INBOX_ATTACH.handler({ name, namespace: 'default', files: [{ file: again.id, name: 'shot.png' }] }));
    const text = fs.readFileSync(path.join(inboxDir(ROOT), `${name}.md`), 'utf8');
    assert.ok(text.includes(again.id) && !text.includes(`file_${'0'.repeat(32)}`), text);
    const twice = await kept(Buffer.from('twice'));
    await assert.rejects(
      served(INBOX_ATTACH.handler({ name, namespace: 'default', files: [{ file: twice.id, name: 'shot.png' }] })),
      (err: Error & { _tag?: string }) => err._tag === 'Invalid',
    );
    const { run } = await runPlaced(startFromInbox({ name, callerRepo: repo, isolate: false }));
    assert.deepEqual(fs.readFileSync(path.join(inputsDir(ROOT, runRecord(ROOT, run.id)), 'shot.png')), bytes);
  });
  test('REFUSED: an idea whose factory: is not the namespace it is filed in, nothing filed, naming where to file it; one naming default by name is filed there', async () => {
    const file = await kept(Buffer.from('pic'));
    fs.mkdirSync(inboxDir(ROOT), { recursive: true });
    const before = fs.readdirSync(inboxDir(ROOT)).sort();
    await assert.rejects(
      served(
        INBOX_ADD.handler({
          idea: '---\nfactory: elsewhere\nworkflow: look\n---\nLook at ![it](shot.png).\n',
          files: [{ file: file.id, name: 'shot.png' }],
        }),
      ),
      (err: Error & { _tag?: string }) => err._tag === 'Invalid' && err.message.includes('/api/namespaces/elsewhere/cards'),
    );
    assert.deepEqual(fs.readdirSync(inboxDir(ROOT)).sort(), before, 'no card is filed');
    const named = await served(INBOX_ADD.handler({ idea: '---\nfactory: default\n---\nFiled where it says\n' }));
    assert.equal(named.card.factory ?? 'default', 'default', 'an idea naming the default factory by name is filed in default');
  });
});
