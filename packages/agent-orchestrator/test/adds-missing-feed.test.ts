/**
 * A factory's library add gone missing said on the feed, a person's story on the stage (`story.ts`): `default` records its adds, one of
 * them a skill no library holds — what a builtin dropped by a newer Nemia leaves, or an item of the user library removed. The tick's next
 * pass writes one `AddsMissing` line about the factory, a warning labelled with it, its note the add's fix; later passes, and a daemon
 * restarted with no fold of its own, write none. The skill made again, the next pass writes one `AddsResolved` line, then none. A factory
 * that records no adds is never said. Neither the library's verbs nor the api write a line: the tick reads the adds on each pass
 * (`addsMissingNow`), as it reads the conflicts.
 *
 * The tick is the store's pass (`tickRun`), on the stage's engine given a pass of its own that does nothing, as `conflicts-feed.test.ts`
 * gives it. The store is its own, at `ROOT`, given as `ENV`.
 */
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { tickRun, readFeed } from '../src/runner.ts';
import { addsMissingNow } from '../src/library/library.verb.ts';
import { factoriesNow } from '../testing.ts';
import { libraryDir, writeLibraryAdds } from '../src/library/library.store.ts';
import { recordFeed, freshFeedMemo } from '../src/feed/feed.store.ts';
import { engineOf, runWith } from '../src/runtime-client.ts';
import { told } from './typed.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-adds-feed-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined, WF_MAX_CONCURRENT: undefined };
const stage = staged({ runWith, main: told, engineOf, env: ENV });

/** What the engine's own pass answers here: nothing admitted, nothing started, no view. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
const GONE = 'drafting-notes';

/** The feed's lines of a factory: its name, its reason, its type and its labels. */
const factorySaid = () =>
  readFeed(ROOT, 0)
    .lines.filter((l) => l.involved?.kind === 'Factory')
    .map((l) => [l.involved?.name, l.reason, l.type, l.labels]);

describe("a factory's library add gone missing said on the feed: one line when it goes, one when it is back, and none again", () => {
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    b = stage.board();
    Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
    return t.end;
  });
  const s = story(test);
  const pass = () => stage.runWith(b.e, tickRun());
  s.test('no factory records its adds: a pass says no factory', async () => {
    await pass();
    assert.deepEqual(factorySaid(), []);
  });
  s.test('default records an add no library holds: a pass says it missing, once, with its fix', async () => {
    writeLibraryAdds(ROOT, 'default', [
      { kind: 'Skill', name: 'create-an-agent' },
      { kind: 'Skill', name: GONE },
    ]);
    await pass();
    assert.deepEqual(factorySaid(), [['default', 'AddsMissing', 'Warning', { factory: 'default' }]]);
    const [line] = readFeed(ROOT, 0).lines.filter((l) => l.reason === 'AddsMissing');
    assert.ok(line?.note?.includes(`nemia library rm Skill ${GONE} --factory default`), 'its note names the fix');
  });
  s.test('more passes, and a daemon restarted with no fold of its own, say it no second time', async () => {
    await pass();
    await pass();
    assert.deepEqual(recordFeed(ROOT, new Map(), { memo: freshFeedMemo(), missing: factoriesNow(ROOT, addsMissingNow(ROOT)) }).lines, []);
    assert.equal(factorySaid().length, 1);
  });
  s.test('the skill made again in the user library: a pass says the adds resolved, once', async () => {
    const dir = path.join(libraryDir(ROOT), 'skills', GONE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${GONE}\ndescription: Drafts notes.\n---\nDraft them.\n`);
    await pass();
    await pass();
    assert.deepEqual(factorySaid().slice(1), [['default', 'AddsResolved', 'Normal', { factory: 'default' }]]);
  });
  s.test('taken away again and its add taken off: missing said, then resolved', async () => {
    fs.rmSync(path.join(libraryDir(ROOT), 'skills', GONE), { recursive: true });
    await pass();
    writeLibraryAdds(ROOT, 'default', [{ kind: 'Skill', name: 'create-an-agent' }]);
    await pass();
    assert.deepEqual(
      factorySaid()
        .slice(2)
        .map((l) => l[1]),
      ['AddsMissing', 'AddsResolved'],
    );
  });
});
