/**
 * The Factory's places trusted again on the api (`nemia factory trust`, served as the Factory's `trust`): each place's root, which the
 * git place answers, trusted for Claude Code where the store runs. Git is its whole subject, so its place is a real repository; the
 * trust writes Claude Code's `.claude.json` in the harness's scratch `CLAUDE_CONFIG_DIR`, never the person's.
 */
import { config } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../app.ts';

type FactoryTrusted = import('objects').FactoryTrusted;

/** A git repository with one commit: a factory's place, whose root the git place answers. */
const gitRepo = (prefix: string): string => {
  const repo = scratch(prefix);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  return repo;
};

addFactory({ name: 'mill', repos: [gitRepo('nemia-api-factory-trust-')] });

const send = (method: string, url: string) => app.request(url, { method, headers: { 'content-type': 'application/json' }, body: '{}' });

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

test("a person trusts a factory's places again: each is trusted for Claude Code where the store runs, and a factory unknown is refused", async (t) => {
  const s = story(t);
  const claudeJson = path.join(config, '.claude.json');
  const trusted = (): boolean =>
    fs.existsSync(claudeJson) &&
    Object.values(
      (JSON.parse(fs.readFileSync(claudeJson, 'utf8')) as { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> }).projects ??
        {},
    ).some((p) => p.hasTrustDialogAccepted === true);

  await s.test('REFUSED: a factory not filed is a 404, and nothing is trusted', async () => {
    assert.equal((await send('POST', '/api/factories/nowhere/trust')).status, 404);
    assert.equal(trusted(), false);
  });

  await s.test('a POST answers what was asked of its place, written in the scratch .claude.json; a second writes nothing', async () => {
    const first = await answered<FactoryTrusted>(send('POST', '/api/factories/mill/trust'));
    assert.equal(first.name, 'mill');
    const claude = first.trusts.find((one) => 'harness' in one && one.wrote);
    assert.ok(claude !== undefined, JSON.stringify(first.trusts));
    assert.equal(trusted(), true);
    const again = await answered<FactoryTrusted>(send('POST', '/api/factories/mill/trust'));
    assert.deepEqual(
      again.trusts.filter((one) => 'wrote' in one && one.wrote),
      [],
    );
  });
});
