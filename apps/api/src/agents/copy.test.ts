/**
 * An agent file copied into your library on the board's route (`POST /api/agents/yours/copy`, `nemia agents copy`'s entry), the agent
 * files the store knows read on `GET /api/agents/sources`, and where a copy came from on `GET /api/agents` — in a scratch store, from a
 * scratch folder. Every write is read back from disk, and every refusal is made to refuse, asserted on its words, with yours as it was.
 *
 * One story — a person copying an agent with its skill, watching its source change, copying another of the same name under another,
 * and reading the agent files the store knows — then one table of what a copy refuses.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentSource } from 'agent-orchestrator';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import { story } from '../../test/checkpoints.ts';
const repo = scratch('nemia-api-copy-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });

type LibraryAgent = import('./agents.ts').LibraryAgent;

const AGENTS = path.join(root, 'workflows', 'agents');
const SKILLS = path.join(root, 'workflows', 'skills');
const from = scratch('nemia-api-copy-from-');

/** An agent file written into the folder copied from, with the frontmatter lines `keys` and the skill `scouting` beside it. */
function source(name: string, keys: string[], body = 'Scout the ground.'): string {
  fs.mkdirSync(path.join(from, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(from, 'skills', 'scouting'), { recursive: true });
  fs.writeFileSync(
    path.join(from, 'skills', 'scouting', 'SKILL.md'),
    '---\nname: scouting\ndescription: How to scout.\n---\nLook first.\n',
  );
  const file = path.join(from, 'agents', `${name}.md`);
  fs.writeFileSync(file, `---\n${keys.join('\n')}\n---\n${body}\n`);
  return file;
}

const json = { 'content-type': 'application/json' };
const copy = (body: unknown) =>
  app.request('/api/agents/yours/copy', { method: 'POST', headers: json, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** What yours holds: each file under the library's agents and skills, by its path, and the copies' records. */
const held = (): string[] =>
  [AGENTS, SKILLS, path.join(root, 'agent-sources')]
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((f) => path.join(dir, f)))
    .sort();

/** A copy refused with `status` and words `pattern` matches, and yours as it was. */
async function refused(body: unknown, status: number, pattern: RegExp): Promise<void> {
  const before = held();
  const res = await copy(body);
  const { error } = (await res.json()) as { error: string };
  assert.equal(res.status, status, error);
  assert.match(error, pattern);
  assert.deepEqual(held(), before, 'nothing written');
}

test('a person copies an agent into theirs with its skill, reads where it came from as its source changes and goes, copies another of that name under another, and reads the agent files the store knows', async (t) => {
  const s = story(t);

  await s.test(
    "an agent copied on the route is written into yours with its skill, and GET /api/agents lists where it came from, the source's change and its going",
    async () => {
      const file = source('scout', ['description: Scouts the ground.', 'skills: scouting', 'model: sonnet']);
      const res = await copy({ file });
      const answer = (await res.json()) as { name: string; copied: string[]; record: string };
      assert.equal(res.status, 200, JSON.stringify(answer));
      assert.equal(answer.name, 'scout');
      assert.deepEqual(answer.copied, ['scouting', 'agents/scout.md']);
      assert.match(fs.readFileSync(path.join(AGENTS, 'scout.md'), 'utf8'), /^skills: scouting$/m);
      assert.equal(fs.readFileSync(path.join(SKILLS, 'scouting', 'SKILL.md'), 'utf8').includes('Look first.'), true);
      assert.equal(answer.record, path.join(root, 'agent-sources', 'scout.json'));

      const copiedOf = async () => {
        const listed = (await (await app.request('/api/agents')).json()) as LibraryAgent[];
        return listed.find((a) => a.from === 'yours' && a.name === 'scout')?.copied;
      };
      const first = await copiedOf();
      assert.equal(first?.source, file);
      assert.equal(first?.now, 'same');
      fs.appendFileSync(file, 'And report back.\n');
      assert.deepEqual(await copiedOf(), { ...first, now: 'changed' }, 'the source changed since the copy');
      fs.rmSync(file);
      assert.deepEqual(await copiedOf(), { ...first, now: 'gone' }, 'the source gone');
    },
  );

  await s.test(
    'REFUSED at shipped defaults: an agent of yours of the same name, otherwise — a 409 naming `--as`, nothing written; under another name, copied',
    async () => {
      const file = source('scout', ['description: Another scout.', 'skills: scouting'], 'Scout elsewhere.');
      await refused({ file }, 409, /^nothing was copied: .*scout\.md is another agent of that name: .*--as <name>\.$/);
      const res = await copy({ file, as: 'outrider' });
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(fs.readFileSync(path.join(AGENTS, 'outrider.md'), 'utf8').includes('Scout elsewhere.'), true);
    },
  );

  await s.test(
    'the agent files the store knows are read on GET /api/agents/sources: yours, then the folder `path` names; a folder not there is a 404',
    async () => {
      fs.mkdirSync(AGENTS, { recursive: true });
      fs.writeFileSync(path.join(AGENTS, 'keeper.md'), '---\ndescription: Keeps the notes.\n---\nKeep them.\n');
      const folder = scratch('nemia-api-copy-sources-');
      fs.writeFileSync(path.join(folder, 'pathfinder.md'), '---\ndescription: Finds the path.\n---\nFind it.\n');
      fs.writeFileSync(path.join(folder, 'counted.md'), '---\ndescription: Counts.\nmaxTurns: 5\n---\nCount.\n');
      const res = await app.request(`/api/agents/sources?path=${encodeURIComponent(folder)}`);
      const { sources } = (await res.json()) as { sources: AgentSource[] };
      assert.equal(res.status, 200);
      const listed = sources.map((s) => `${s.place} ${s.name}`);
      assert.ok(listed.includes('library keeper'), listed.join(', '));
      assert.deepEqual(listed.slice(-2), ['path counted', 'path pathfinder'], 'the folder named comes last, sorted');
      assert.deepEqual(
        sources.filter((s) => s.place === 'path').map((s) => s.file),
        [path.join(folder, 'counted.md'), path.join(folder, 'pathfinder.md')],
      );
      assert.equal(sources.find((s) => s.name === 'counted')?.error?.includes('maxTurns'), true, 'one that does not read says why');
      const missing = await app.request(`/api/agents/sources?path=${encodeURIComponent(path.join(folder, 'nowhere'))}`);
      assert.equal(missing.status, 404);
      assert.match(((await missing.json()) as { error: string }).error, /is not a folder/);
    },
  );
});

test('a copy the store refuses — a key another harness writes, a file not there, a body it does not take — its status and the fact it names, and nothing written', async (t) => {
  await t.test(
    "REFUSED at shipped defaults: a key the store refuses in another harness's agent file — a 422 naming it and the copy to edit, nothing written",
    async () => {
      const file = source('counted', ['description: Counts.', 'maxTurns: 5']);
      await refused({ file }, 422, /maxTurns[\s\S]*delete that line there, and copy from that path/);
    },
  );

  await t.test(
    'REFUSED at shipped defaults: a file that is not there is a 404 naming `nemia agents sources`; a `keep` that is no list a 400 naming it',
    async () => {
      await refused({ file: path.join(from, 'agents', 'nobody.md') }, 404, /nemia agents sources lists the agents the store knows/);
      await refused({ file: source('scout', ['description: x']), keep: 'scouting' }, 400, /^`keep` lists the skills and the schema/);
      await refused(
        { file: source('scout', ['description: x']), also: true },
        400,
        /^POST \/api\/agents\/yours\/copy does not take `also`: /,
      );
    },
  );
});
