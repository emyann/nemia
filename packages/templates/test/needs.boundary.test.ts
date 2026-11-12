/**
 * sdlc's needs script (`sdlc/carried/needs.ts`, which the needs of `build` and `quick` run): `identity` sets git's name and noreply
 * email from the account gh is signed in to, `scope <s>` says whether gh's token holds a scope, and `install-gh` puts the latest gh
 * release into the tools folder, its sum checked. Driven as a check and a fix run it, each a subprocess: on a stub `gh` first on the
 * PATH (`test/origin.ts`), a scratch `HOME` and `GIT_CONFIG_GLOBAL`, and for the install a stub release server on 127.0.0.1 serving
 * a release, a tiny tarball and its checksums, at the address the script's `NEMIA_GH_RELEASE_URL` reads the release from.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ghStub, type Rule } from './origin.ts';

const SCRIPT = path.join(import.meta.dirname, '..', 'sdlc', 'carried', 'needs.ts');

/** What the script did: its exit and its streams. */
type Ran = { code: number | null; out: string; err: string };

/**
 * `node needs.ts <args>` with a stub `gh` answering `rules` first on the PATH, a scratch home, git's global file in it, and `env`
 * besides; spawned without blocking, so a stub server in this process answers it. Its exit, its streams and its git file.
 */
async function needs(args: string[], rules: readonly Rule[], env: Record<string, string> = {}): Promise<Ran & { gitFile: string }> {
  const gh = ghStub(rules);
  const home = scratch('nemia-needs-home-');
  const gitFile = path.join(home, '.gitconfig');
  const child = spawn(process.execPath, [SCRIPT, ...args], {
    env: {
      PATH: `${gh.bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: home,
      GIT_CONFIG_GLOBAL: gitFile,
      GIT_CONFIG_NOSYSTEM: '1',
      ...gh.env(),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
  const code = await new Promise<number | null>((resolve) => child.once('close', resolve));
  return { code, out, err, gitFile };
}

/** What git's global file `file` holds for `key`, or '' where it holds nothing. */
const gitConfig = (file: string, key: string): string => {
  try {
    return execFileSync('git', ['config', '--file', file, key], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

/** `gh auth status` signed in with `scopes`, the lines as gh prints them. */
const signedIn = (scopes: string): Rule => ({
  when: 'auth status',
  out: ['github.com', '  ✓ Logged in to github.com account octo (keyring)', '  - Active account: true', `  - Token scopes: ${scopes}`].join(
    '\n',
  ),
});

test('identity writes the account name and its noreply email into git, the login where the account has no name', async () => {
  const named = await needs(['identity'], [{ when: 'api user', out: JSON.stringify({ login: 'octo', id: 583231, name: 'Octo Cat' }) }]);
  assert.equal(named.code, 0, named.err);
  assert.equal(gitConfig(named.gitFile, 'user.name'), 'Octo Cat');
  assert.equal(gitConfig(named.gitFile, 'user.email'), '583231+octo@users.noreply.github.com');
  const unnamed = await needs(['identity'], [{ when: 'api user', out: JSON.stringify({ login: 'octo', id: 7, name: null }) }]);
  assert.equal(unnamed.code, 0, unnamed.err);
  assert.equal(gitConfig(unnamed.gitFile, 'user.name'), 'octo');
  assert.equal(gitConfig(unnamed.gitFile, 'user.email'), '7+octo@users.noreply.github.com');
});

test('REFUSED: identity where gh is signed out, and git is left as it was', async () => {
  const ran = await needs(['identity'], [{ when: 'api user', status: 1, err: 'gh auth login' }]);
  assert.equal(ran.code, 1);
  assert.equal(gitConfig(ran.gitFile, 'user.email'), '');
});

test('scope exits 0 where the token holds it, 1 where it lacks it or gh is signed out', async () => {
  assert.equal((await needs(['scope', 'workflow'], [signedIn("'gist', 'read:org', 'repo', 'workflow'")])).code, 0);
  assert.equal((await needs(['scope', 'workflow'], [signedIn('gist, repo, workflow')])).code, 0, 'the older unquoted spelling');
  assert.equal((await needs(['scope', 'workflow'], [signedIn("'gist', 'read:org', 'repo'")])).code, 1);
  assert.equal((await needs(['scope', 'workflow'], [{ when: 'auth status', status: 1, err: 'not logged in' }])).code, 1);
  assert.equal((await needs(['scope'], [signedIn("'workflow'")])).code, 1, 'no scope named');
});

/** The release this test serves. */
const VERSION = '9.9.9';

/** The asset of the release for this machine, as `install-gh` names it. */
const ASSET = `gh_${VERSION}_linux_${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`;

/** A tarball holding `gh_<version>_linux_<arch>/bin/gh`, a script that prints its version, as gh's release lays it out. */
function tarball(): Buffer {
  const dir = scratch('nemia-needs-tar-');
  const top = ASSET.replace(/\.tar\.gz$/, '');
  fs.mkdirSync(path.join(dir, top, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, top, 'bin', 'gh'), `#!/bin/sh\necho "gh version ${VERSION}"\n`, { mode: 0o755 });
  const file = path.join(scratch('nemia-needs-out-'), ASSET);
  execFileSync('tar', ['-czf', file, '-C', dir, top]);
  return fs.readFileSync(file);
}

/** A stub release server on 127.0.0.1 whose checksums say `sum` of the tarball (its true sum unless given): its release URL and stop. */
async function releaseServer(sum?: string): Promise<{ url: string; close: () => Promise<void> }> {
  const tar = tarball();
  const sha = sum ?? createHash('sha256').update(tar).digest('hex');
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const files: Record<string, Buffer | string> = {
      '/latest': JSON.stringify({
        tag_name: `v${VERSION}`,
        assets: [ASSET, `gh_${VERSION}_checksums.txt`].map((name) => ({ name, browser_download_url: `${base}/download/${name}` })),
      }),
      [`/download/${ASSET}`]: tar,
      [`/download/gh_${VERSION}_checksums.txt`]: `${'0'.repeat(64)}  gh_${VERSION}_other.tar.gz\n${sha}  ${ASSET}\n`,
    };
    const body = files[req.url ?? ''];
    res.writeHead(body === undefined ? 404 : 200).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/latest`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

test(
  'install-gh puts the release for this machine into the tools folder and links its gh into tools/bin',
  { skip: process.platform !== 'linux' },
  async () => {
    const server = await releaseServer();
    try {
      const tools = path.join(scratch('nemia-needs-tools-'), 'tools');
      const ran = await needs(['install-gh'], [], { NEMIA_TOOLS: tools, NEMIA_GH_RELEASE_URL: server.url });
      assert.equal(ran.code, 0, ran.err);
      const linked = path.join(tools, 'bin', 'gh');
      assert.ok(fs.realpathSync(linked).startsWith(fs.realpathSync(path.join(tools, 'gh', VERSION))), 'linked into the version folder');
      assert.equal(execFileSync(linked, ['--version'], { encoding: 'utf8' }).trim(), `gh version ${VERSION}`);
      const again = await needs(['install-gh'], [], { NEMIA_TOOLS: tools, NEMIA_GH_RELEASE_URL: server.url });
      assert.equal(again.code, 0, `a second install relinks: ${again.err}`);
    } finally {
      await server.close();
    }
  },
);

test(
  'REFUSED: install-gh where the tarball is not the one the checksums name, and nothing is linked',
  { skip: process.platform !== 'linux' },
  async () => {
    const server = await releaseServer('f'.repeat(64));
    try {
      const tools = path.join(scratch('nemia-needs-tools-'), 'tools');
      const ran = await needs(['install-gh'], [], { NEMIA_TOOLS: tools, NEMIA_GH_RELEASE_URL: server.url });
      assert.equal(ran.code, 1);
      assert.equal(fs.existsSync(path.join(tools, 'bin', 'gh')), false);
      assert.equal(fs.existsSync(path.join(tools, 'gh', VERSION)), false);
    } finally {
      await server.close();
    }
  },
);

test('REFUSED: install-gh with no tools folder named, and a verb the script has not', async () => {
  assert.equal((await needs(['install-gh'], [], { NEMIA_TOOLS: '' })).code, 1);
  assert.equal((await needs(['nothing'], [])).code, 1);
});
