/**
 * The removal's api (remove.ts): a folder of yours removed whole at the version the board read it at, in a scratch store and a scratch
 * repository. Every removal is read back from disk and from the listing, and every refusal is made to refuse, with the folder asserted
 * as it was.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import { workflowVersion as versionIn } from 'agent-orchestrator';
const repo = scratch('nemia-api-remove-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

type WorkflowRemoved = { dir: string; removed: string[] };

const STORE = path.join(root, 'workflows');
const json = { 'content-type': 'application/json' };

/** A folder's version as the board reads it, its agents and skills looked for in the repository and in yours. */
const versionOf = (dir: string): string => versionIn(dir, { repo, home: root });

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

/** A DELETE of `body`: the folder's version as it is on disk now unless the body is given, as a board that has just read it sends it. */
const remove = (name: string, body?: unknown, from = 'yours', headers: Record<string, string> = json) =>
  app.request(`/api/workflows/${from}/${name}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body ?? { version: versionOf(path.join(from === 'yours' ? STORE : path.join(repo, 'workflows'), name)) }),
  });

/** Whether GET /api/workflows lists `name` from `from`. */
async function listed(name: string, from = 'yours'): Promise<boolean> {
  const all = (await (await app.request('/api/workflows')).json()) as Array<{ name: string; from: string }>;
  return all.some((w) => w.name === name && w.from === from);
}

const errorOf = async (res: Response): Promise<string> => ((await res.json()) as { error: string }).error;

test('a folder of yours removed at the version it was read at is gone, every file it held named, and the listing no longer has it', async () => {
  const dir = planned('done');
  assert.equal(await listed('done'), true, 'listed before');
  const res = await remove('done');
  assert.equal(res.status, 200, await res.clone().text());
  const answer = (await res.json()) as WorkflowRemoved;
  assert.deepEqual(answer, {
    dir,
    removed: ['README.md', 'build.md', 'build.schema.json', 'plan.md'],
  });
  assert.equal(fs.existsSync(dir), false);
  assert.equal(await listed('done'), false, 'listed after');
});

test('REFUSED at shipped defaults: a removal of a folder changed since it was read is a 409 naming the version it is at now, and nothing is removed', async () => {
  const dir = planned('edited');
  const read = versionOf(dir);
  write(path.join(dir, 'ship.md'), '---\nafter: build\nplace: git\n---\nShip it.\n');
  const before = snapshot(dir);
  const res = await remove('edited', { version: read });
  assert.equal(res.status, 409);
  assert.equal(
    await errorOf(res),
    `${dir} has changed since it was read at version ${read}: a step, the README or a schema there was edited, added or removed, and removing it now would remove what was not seen. Nothing was removed. Read the folder again (it is at version ${versionOf(dir)}), and remove it as it is now.`,
  );
  assert.deepEqual(snapshot(dir), before);
});

test("REFUSED at shipped defaults: a removal that does not say the version it read is a 400 in the route's words, and nothing is removed", async () => {
  const dir = planned('unsaid');
  const before = snapshot(dir);
  const route = 'DELETE /api/workflows/yours/unsaid';
  const shape = '`{ "version": "<as GET /api/workflows lists it>" }`';
  for (const [body, was] of [
    [{}, 'undefined'],
    [{ version: '' }, '""'],
    [{ version: 3 }, '3'],
  ] as const) {
    const res = await remove('unsaid', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(
      await errorOf(res),
      `${route} takes the \`version\` the folder was read at, as GET /api/workflows lists it, so a folder changed since is not removed unseen: ${shape}. This request's was ${was}.`,
    );
  }
  assert.deepEqual(snapshot(dir), before);
});

test("REFUSED at shipped defaults: the repository's workflow is not removed (403), nor a name not there (404), and the folder of the same name in yours is kept", async () => {
  const theirs = path.join(repo, 'workflows', 'shared');
  write(path.join(theirs, 'implement.md'), '---\nplace: git\nmodel: opus\n---\nImplement it.\n');
  const mine = planned('shared');
  const before = snapshot(theirs);
  const res = await remove('shared', { version: versionOf(theirs) }, 'repo');
  assert.equal(res.status, 403);
  assert.match(await errorOf(res), /^DELETE \/api\/workflows\/repo\/shared /);
  assert.deepEqual(snapshot(theirs), before);
  assert.equal(fs.existsSync(mine), true, 'yours of the same name');
  const gone = await remove('nowhere', { version: 'v' });
  assert.equal(gone.status, 404);
});

test("REFUSED at shipped defaults: a folder a queued card still needs is the package's 409, in its words, and the folder is kept", async () => {
  const dir = planned('needed');
  const card = path.join(root, 'inbox', 'needing.md');
  write(card, `---\nworkflow: ${dir}\nqueued: 2026-10-01T00:00:00.000Z\n---\nAn idea.\n`);
  const before = snapshot(dir);
  const res = await remove('needed');
  assert.equal(res.status, 409);
  assert.equal(
    await errorOf(res),
    `${dir} is still needed: card needing is queued to start on ${dir}: nemia inbox queue needing --off takes it back, and nemia inbox queue needing --workflow <w> then queues it on another. Nothing was removed.`,
  );
  assert.deepEqual(snapshot(dir), before);
  fs.rmSync(card);
});
