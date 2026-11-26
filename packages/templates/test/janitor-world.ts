/**
 * The served world the janitor's scripts are driven in (`cards.boundary.test.ts`, `groom.boundary.test.ts`): a scratch store served by
 * the api, `--no-tick`, with `nemia` first on the PATH as a factory has it, the client asking that api, and the factories a card is filed
 * in. Shared by both, so the world is set up one way.
 */
import type { TestContext } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { REPO } from 'test-kit/repo';
import { storeEnv } from './template.ts';
import { cardNames, cardText } from 'agent-orchestrator/testing';

/** The client's bin (`apps/cli`), the `nemia` a factory's steps type, and the api it asks (`apps/api`), from the repository's root. */
export const CLIENT = path.join(REPO, 'apps', 'cli', 'bin', 'nemia.ts');
const API = path.join(REPO, 'apps', 'api');

/**
 * The store's credential put in place under `root` as the daemon puts it at its start, which an api served `--no-tick` does not: a token
 * of the person's named `local`, kept as its record by its sha-256 digest under `person-tokens/`, and itself in `credential` (0600),
 * which the client presents on this machine with nothing typed.
 */
function credentialIn(root: string) {
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
async function served(t: TestContext, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ['src/main.ts', '--no-tick'], { cwd: API, env: { ...env, PORT: '0' } });
  let said = '';
  const ended = new Promise<void>((resolve) => child.on('close', () => resolve()));
  t.onTestFinished(async () => {
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
export async function world(t: TestContext) {
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
    execFileSync('git', ['init', '-q'], { cwd: repo });
    nemia(env, ['factory', 'add', factory, '--volume', `${repo}:rw`, '--no-trust']);
    for (const workflow of workflows) nemia(env, ['factory', 'attach', factory, workflow]);
  }
  return { env, root: env.WF_ROOT! } satisfies { env: NodeJS.ProcessEnv; root: string };
}

/** The factories the cards are filed in, each with the workflows it attaches: a card names its factory, which offers its workflow. */
export const FACTORIES: Readonly<Record<string, readonly string[]>> = { acme: ['build'], pipao: ['intake'] };

/** `nemia` typed in the world `env`, as a person sets the factory up: refused, the test fails with what it said. */
export function nemia(env: NodeJS.ProcessEnv, argv: readonly string[]) {
  const ran = spawnSync(process.execPath, [CLIENT, ...argv], { env, encoding: 'utf8', timeout: 120_000 });
  assert.equal(ran.status, 0, `nemia ${argv.join(' ')}: ${ran.stdout}${ran.stderr}`);
}

/** The inbox's cards in `root`, by file name, with their text. */
export const inbox = (root: string) =>
  Object.fromEntries(cardNames(root).map((name) => [`${name}.md`, cardText(root, name) ?? ''])) satisfies Record<string, string>;

/** `nemia <argv>` typed by a person in the world `env`: its exit and streams. */
export const typed = (env: NodeJS.ProcessEnv, argv: string[]) => {
  const ran = spawnSync(process.execPath, [CLIENT, ...argv], { env, encoding: 'utf8', timeout: 120_000 });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

/**
 * The served world (`world`) with a janitor run started in the factory acme, never ticked: the run's name, which the check
 * is handed as `WF_RUN` and reads its factory by. The workflow is a folder step and its agent a stand-in, the run's subject being its
 * namespace alone.
 */
export async function janitorRun(t: TestContext) {
  const { env, root } = await world(t);
  fs.mkdirSync(path.join(root, 'workflows', 'janitor'), { recursive: true });
  fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workflows', 'janitor', 'argus.md'), '---\nplace: folder\n---\nRead the stats.\n');
  fs.writeFileSync(path.join(root, 'workflows', 'agents', 'scout.md'), '---\nharness: claude\n---\nYou are a scout.\n');
  nemia(env, ['factory', 'attach', 'acme', 'janitor']);
  nemia(env, ['factory', 'hire', 'acme', 'scout', '--step', 'janitor/argus']);
  nemia(env, ['start', 'Read the stats', '--workflows', 'janitor', '--factory', 'acme']);
  const listed = typed(env, ['get', 'runs', '-A', '-o', 'name']);
  const wf = listed.out.trim().replace(/^runs\//, '');
  assert.match(wf, /^[\w-]+$/, `one run is started: ${listed.out}${listed.err}`);
  return { env, root, wf };
}
