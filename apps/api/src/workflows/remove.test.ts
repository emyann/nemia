/**
 * The removal of a Workflow of yours (`DELETE /api/namespaces/default/workflows/<name>?resourceVersion=`, workflows/handlers.ts),
 * told as one story: a folder of yours refused while it is stale, unsaid, still needed by a queued card or
 * the repository's, then removed whole at the version the board read it at — in a scratch store and a scratch repository. Every refusal
 * leaves the folder as it was; the removal is read back from disk and from the listing.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../app.ts';
import { listedIn } from '../../test/definitions.ts';
import { Effect } from 'effect';
import { StoreRoot, workflowVersion as versionIn } from 'agent-orchestrator';
import { addFactory } from 'agent-orchestrator/testing';
/**
 * The scratch repository, read in the default factory by `?repo=` (`ON_REPO`), which the factory `remover`, filed on it, lets the api
 * read.
 */
const repo = scratch('nemia-api-remove-repo-');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
addFactory({ name: 'remover', repos: [repo] });
const ON_REPO = `repo=${encodeURIComponent(repo)}`;

type WorkflowRemoved = { metadata: { name: string }; status: { dir: string; origin: string } };

const STORE = path.join(root, 'workflows');
const json = { 'content-type': 'application/json' };

/** A folder's version as the board reads it, its agents and skills looked for in the repository and in yours. */
const versionOf = (dir: string): string =>
  Effect.runSync(versionIn(dir, { repo, home: root }).pipe(Effect.provideService(StoreRoot, root)));

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A workflow of yours, `plan` then `build`, with a README and a schema beside its steps. */
function planned(name: string): string {
  const dir = path.join(STORE, name);
  write(path.join(dir, 'README.md'), `# ${name}\n`);
  write(path.join(dir, 'plan.md'), '---\nplace: git\nharness: claude\n---\nWrite PLAN.md.\n');
  write(path.join(dir, 'build.md'), '---\nafter: plan\nplace: git\n---\nBuild what PLAN.md says.\n');
  write(path.join(dir, 'build.schema.json'), '{ "type": "object" }\n');
  return dir;
}

/** Every file under `dir`, with what it holds: what a refused removal must leave as it was. */
const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );

/** A DELETE at `version`: the folder's version as it is on disk now unless one is given, as a board that has just read it sends it. */
const remove = (name: string, version?: string | null, from = 'yours', headers: Record<string, string> = json) => {
  const read = version === undefined ? versionOf(path.join(from === 'yours' ? STORE : path.join(repo, 'workflows'), name)) : version;
  return app.request(
    `/api/namespaces/default/workflows/${name}?${ON_REPO}${read === null ? '' : `&resourceVersion=${encodeURIComponent(read)}`}`,
    {
      method: 'DELETE',
      headers,
    },
  );
};

/** Whether the namespace's workflows list `name` from `from`. */
async function listed(name: string, from = 'yours'): Promise<boolean> {
  const all = await listedIn<{ name: string; from: string }>(app, 'workflows', `origin=${from}&${ON_REPO}`);
  return all.some((w) => w.name === name && w.from === from);
}

const errorOf = async (res: Response): Promise<string> => ((await res.json()) as { error: string }).error;

test("a person removes a folder of theirs: refused while it is stale, unsaid, still needed or the repository's, then removed whole at the version read", async (t) => {
  const s = story(t);
  const dir = planned('done');
  const card = path.join(root, 'inbox', 'needing.md');

  await s.test(
    'REFUSED: a removal of a folder changed since it was read is a 409 naming both versions, and nothing is removed',
    async () => {
      const read = versionOf(dir);
      write(path.join(dir, 'ship.md'), '---\nafter: build\nplace: git\n---\nShip it.\n');
      const before = snapshot(dir);
      const res = await remove('done', read);
      assert.equal(res.status, 409);
      const error = await errorOf(res);
      for (const fact of [dir, read, versionOf(dir)]) assert.ok(error.includes(fact), `${fact}: ${error}`);
      assert.deepEqual(snapshot(dir), before);
      fs.rmSync(path.join(dir, 'ship.md'));
    },
  );

  await s.test('REFUSED: a removal that does not say the version it read is a 422 naming the route, and nothing is removed', async () => {
    const before = snapshot(dir);
    for (const version of [null, '']) {
      const res = await remove('done', version);
      assert.equal(res.status, 422, JSON.stringify(version));
      const error = await errorOf(res);
      assert.match(error, /\?resourceVersion=/, 'it names the query a removal says its version in');
    }
    assert.deepEqual(snapshot(dir), before);
  });

  await s.test(
    "REFUSED: a folder a queued card still needs is the package's 409, naming the card and the line that takes it back, and the folder is kept",
    async () => {
      write(card, `---\nworkflow: ${dir}\nqueued: 2026-10-01T00:00:00.000Z\n---\nAn idea.\n`);
      const before = snapshot(dir);
      const res = await remove('done');
      assert.equal(res.status, 409);
      const error = await errorOf(res);
      for (const fact of [dir, 'card needing', 'nemia inbox queue needing --off']) assert.ok(error.includes(fact), `${fact}: ${error}`);
      assert.deepEqual(snapshot(dir), before);
      fs.rmSync(card);
    },
  );

  await s.test(
    "REFUSED: the repository's workflow is not removed (422, no write of the api's), nor a name not there (404), and the folder of yours is kept",
    async () => {
      const theirs = path.join(repo, 'workflows', 'theirs');
      write(path.join(theirs, 'implement.md'), '---\nplace: git\nmodel: opus\n---\nImplement it.\n');
      const before = snapshot(theirs);
      const res = await remove('theirs', versionOf(theirs), 'repo');
      assert.equal(res.status, 422);
      assert.equal(((await res.json()) as { way?: string }).way, undefined, "the repository's is copied to yours, no namespace's way");
      assert.deepEqual(snapshot(theirs), before);
      assert.equal(fs.existsSync(dir), true, 'yours of the same name');
      assert.equal((await remove('nowhere', 'v')).status, 404);
    },
  );

  await s.test(
    'removed at the version it was read at, the folder is gone, the Workflow it was answered, and the listing no longer has it',
    async () => {
      assert.equal(await listed('done'), true, 'listed before');
      const res = await remove('done');
      assert.equal(res.status, 200, await res.clone().text());
      const answer = (await res.json()) as WorkflowRemoved;
      assert.deepEqual([answer.metadata.name, answer.status.dir, answer.status.origin], ['done', dir, 'yours']);
      assert.equal(fs.existsSync(dir), false);
      assert.equal(await listed('done'), false, 'listed after');
    },
  );
});
