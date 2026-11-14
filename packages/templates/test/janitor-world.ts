/**
 * The served world the janitor's scripts are driven in (`cards.boundary.test.ts`, `groom.boundary.test.ts`): a scratch store served by
 * the api, `--no-tick`, with `nemia` first on the PATH as a factory has it, the client asking that api, and the factories a card is filed
 * in. Shared by both, so the world is set up one way.
 */
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { REPO } from 'test-kit/repo';
import { storeEnv } from './template.ts';

/** The client's bin (`apps/cli`), the `nemia` a factory's steps type, and the api it asks (`apps/api`), from the repository's root. */
export const CLIENT = path.join(REPO, 'apps', 'cli', 'bin', 'nemia.ts');
const API = path.join(REPO, 'apps', 'api');

/**
 * The store's credential put in place under `root` as the daemon puts it at its start, which an api served `--no-tick` does not: a token
 * of the person's named `local`, kept as its record by its sha-256 digest under `person-tokens/`, and itself in `credential` (0600),
 * which the client presents on this machine with nothing typed.
 */
function credentialIn(root: string): void {
  const token = crypto.randomBytes(32).toString('base64url');
  const dir = path.join(root, 'person-tokens');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  fs.writeFileSync(path.join(dir, `${digest}.json`), `${JSON.stringify({ name: 'local', createdAt: new Date().toISOString() })}\n`, {
    mode: 0o600,
  });
  fs.writeFileSync(path.join(root, 'credential'), `${token}\n`, { mode: 0o600 });
}

/**
 * The api served on the store `env` names, `--no-tick` on a free port, its lease written where the client reads it (`daemon.json`) and
 * the store's credential put in place (`credentialIn`): its url, once it listens, and stopped as the test ends.
 */
async function served(t: TestContext, env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(process.execPath, ['src/main.ts', '--no-tick'], { cwd: API, env: { ...env, PORT: '0' } });
  let said = '';
  const ended = new Promise<void>((resolve) => child.on('close', () => resolve()));
  t.after(async () => {
    child.kill();
    await ended;
  });
  const url = await new Promise<string>((resolve, reject) => {
    const look = () => {
      const m = /api listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(said);
      if (m?.[1]) resolve(m[1]);
    };
    child.stdout.on('data', (chunk) => ((said += chunk), look()));
    child.stderr.on('data', (chunk) => ((said += chunk), look()));
    void ended.then(() => reject(new Error(`the api ended before it listened:\n${said}`)));
  });
  fs.mkdirSync(env.WF_ROOT!, { recursive: true });
  fs.writeFileSync(path.join(env.WF_ROOT!, 'daemon.json'), JSON.stringify({ url }));
  credentialIn(env.WF_ROOT!);
}

/**
 * A scratch world: its store's environment, served by the api, with `nemia` first on the PATH as a factory has it — the client, which
 * files a card through the api under this machine's context, its daemon never started on demand.
 */
export async function world(t: TestContext): Promise<{ env: NodeJS.ProcessEnv; root: string }> {
  const at = scratch('nemia-janitor-');
  const env = storeEnv(at);
  for (const name of ['NEMIA_CONTEXT', 'XDG_CONFIG_HOME']) delete env[name];
  env.NEMIA_DAEMON_START = 'off';
  const bin = path.join(at, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'nemia'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(CLIENT)} "$@"\n`, {
    mode: 0o755,
  });
  env.PATH = `${bin}${path.delimiter}${env.PATH ?? ''}`;
  await served(t, env);
  for (const [factory, workflows] of Object.entries(FACTORIES)) {
    const repo = path.join(at, 'repos', factory);
    fs.mkdirSync(repo, { recursive: true });
    nemia(env, ['factory', 'add', factory, '--repo', repo, '--no-trust']);
    for (const workflow of workflows) nemia(env, ['factory', 'attach', factory, workflow]);
  }
  return { env, root: env.WF_ROOT! };
}

/** The factories the cards are filed in, each with the workflows it attaches: a card names its factory, which offers its workflow. */
export const FACTORIES: Readonly<Record<string, readonly string[]>> = { acme: ['build'], pipao: ['intake'] };

/** `nemia` typed in the world `env`, as a person sets the factory up: refused, the test fails with what it said. */
export function nemia(env: NodeJS.ProcessEnv, argv: readonly string[]): void {
  const ran = spawnSync(process.execPath, [CLIENT, ...argv], { env, encoding: 'utf8', timeout: 120_000 });
  assert.equal(ran.status, 0, `nemia ${argv.join(' ')}: ${ran.stdout}${ran.stderr}`);
}

/** The inbox's cards in `root`, by file name, with their text. */
export const inbox = (root: string): Record<string, string> => {
  const dir = path.join(root, 'inbox');
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
};
