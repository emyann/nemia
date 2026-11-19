/**
 * sdlc's needs script (`sdlc/carried/needs.ts`, which the needs of `build` and `quick` run): `identity` sets git's name and noreply
 * email from the account gh is signed in to, `scope <s>` says whether gh's token holds a scope, and `install-gh` puts the latest gh
 * release into the tools folder, its sum checked. Driven as a check and a fix run it, each a subprocess: on a stub `gh` first on the
 * PATH (`test/origin.ts`), a scratch `HOME` and `GIT_CONFIG_GLOBAL`, and for the install a stub release server on 127.0.0.1 serving
 * a release, a tiny tarball and its checksums, at the address the script's `NEMIA_GH_RELEASE_URL` reads the release from. `browser`
 * is driven in a stand-in repository, its `playwright-core` (under `@playwright/mcp` or at its root) a stand-in that names a build under
 * a stand-in `PLAYWRIGHT_BROWSERS_PATH`, and whose installer records how it was run and puts the build there.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
async function needs(args: string[], rules: readonly Rule[], env: Record<string, string> = {}) {
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
  return { code, out, err, gitFile } satisfies Ran & { gitFile: string };
}

/** What git's global file `file` holds for `key`, or '' where it holds nothing. */
const gitConfig = (file: string, key: string) => {
  try {
    return execFileSync('git', ['config', '--file', file, key], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

/** `gh auth status` signed in with `scopes`, the lines as gh prints them. */
const signedIn = (scopes: string) =>
  ({
    when: 'auth status',
    out: [
      'github.com',
      '  ✓ Logged in to github.com account octo (keyring)',
      '  - Active account: true',
      `  - Token scopes: ${scopes}`,
    ].join('\n'),
  }) satisfies Rule;

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
function tarball() {
  const dir = scratch('nemia-needs-tar-');
  const top = ASSET.replace(/\.tar\.gz$/, '');
  fs.mkdirSync(path.join(dir, top, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, top, 'bin', 'gh'), `#!/bin/sh\necho "gh version ${VERSION}"\n`, { mode: 0o755 });
  const file = path.join(scratch('nemia-needs-out-'), ASSET);
  execFileSync('tar', ['-czf', file, '-C', dir, top]);
  return fs.readFileSync(file) satisfies Buffer;
}

/** A stub release server on 127.0.0.1 whose checksums say `sum` of the tarball (its true sum unless given): its release URL and stop. */
async function releaseServer(sum?: string) {
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
  return { url: `http://127.0.0.1:${port}/latest`, close: () => new Promise((resolve) => server.close(() => resolve())) } satisfies {
    url: string;
    close: () => Promise<void>;
  };
}

test.skipIf(process.platform !== 'linux')(
  'install-gh puts the release for this machine into the tools folder and links its gh into tools/bin',
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

test.skipIf(process.platform !== 'linux')(
  'REFUSED: install-gh where the tarball is not the one the checksums name, and nothing is linked',
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

/**
 * A stand-in `playwright-core` of version `build` in the folder `dir`: its `chromium.executablePath()` names
 * `<PLAYWRIGHT_BROWSERS_PATH>/chromium-<build>/chrome-linux/chrome`, as Playwright's does, and its `cli.js` appends how it was run to the
 * file `INSTALLED_LOG` names, then puts that build there.
 */
function standInCore(dir: string, build: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'playwright-core', version: `1.0.${build}`, main: 'index.js' }));
  const executable = `require('node:path').join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium-${build}', 'chrome-linux', 'chrome')`;
  fs.writeFileSync(path.join(dir, 'index.js'), `exports.chromium = { executablePath: () => ${executable} };\n`);
  fs.writeFileSync(
    path.join(dir, 'cli.js'),
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'fs.appendFileSync(process.env.INSTALLED_LOG, JSON.stringify([__filename, ...process.argv.slice(2)]) + "\\n");',
      `const file = ${executable};`,
      'fs.mkdirSync(path.dirname(file), { recursive: true });',
      "fs.writeFileSync(file, '');",
      '',
    ].join('\n'),
  );
}

/** A stand-in repository, its browsers folder holding `present` builds, and the log its installer writes. */
function browserRepo(present: string[]) {
  const repo = scratch('nemia-needs-browser-repo-');
  const browsers = scratch('nemia-needs-browsers-');
  for (const build of present) fs.mkdirSync(path.join(browsers, `chromium-${build}`, 'chrome-linux'), { recursive: true });
  for (const build of present) fs.writeFileSync(path.join(browsers, `chromium-${build}`, 'chrome-linux', 'chrome'), '');
  return { repo, browsers, log: path.join(scratch('nemia-needs-browser-log-'), 'installed.jsonl') } satisfies {
    repo: string;
    browsers: string;
    log: string;
  };
}

/** `node needs.ts browser <args>` run in `at.repo`, as a need of `scope: repository` is, its browsers folder `at.browsers`. */
function browserRan(at: { repo: string; browsers: string; log: string }, args: string[] = []) {
  const ran = spawnSync(process.execPath, [SCRIPT, 'browser', ...args], {
    cwd: at.repo,
    env: { PATH: process.env.PATH ?? '', HOME: scratch('nemia-needs-home-'), PLAYWRIGHT_BROWSERS_PATH: at.browsers, INSTALLED_LOG: at.log },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr } satisfies Ran;
}

/** How the stand-in installers were run, each as its file and its arguments. */
const installs = (log: string) =>
  (fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[])
    : []) satisfies string[][];

test("browser is missing, naming the build, where the repository's playwright-core names a build that is absent, and met once it is there", () => {
  const at = browserRepo(['1248']);
  standInCore(path.join(at.repo, 'node_modules', 'playwright-core'), '1243');
  const missing = browserRan(at);
  assert.equal(missing.code, 1, 'another build present is not enough');
  assert.match(missing.err, /1243/);
  fs.mkdirSync(path.join(at.browsers, 'chromium-1243', 'chrome-linux'), { recursive: true });
  fs.writeFileSync(path.join(at.browsers, 'chromium-1243', 'chrome-linux', 'chrome'), '');
  const met = browserRan(at);
  assert.equal(met.code, 0, met.err);
});

test("browser asks the playwright-core @playwright/mcp resolves before the repository's own, and its fix runs that one's installer", () => {
  const at = browserRepo(['1248']);
  standInCore(path.join(at.repo, 'node_modules', 'playwright-core'), '1248');
  const mcp = path.join(at.repo, 'node_modules', '@playwright', 'mcp');
  fs.mkdirSync(mcp, { recursive: true });
  fs.writeFileSync(path.join(mcp, 'package.json'), JSON.stringify({ name: '@playwright/mcp', version: '0.0.1', main: 'index.js' }));
  fs.writeFileSync(path.join(mcp, 'index.js'), '');
  const tools = path.join(mcp, 'node_modules', 'playwright-core');
  standInCore(tools, '1243');
  assert.equal(browserRan(at).code, 1, "the repository's own build is not the tools'");
  const fixed = browserRan(at, ['--install']);
  assert.equal(fixed.code, 0, fixed.err);
  assert.deepEqual(installs(at.log), [[path.join(fs.realpathSync(tools), 'cli.js'), 'install', 'chromium']]);
  assert.equal(browserRan(at).code, 0, 'the build the installer put is the one checked');
});

test("browser --install runs the repository's own playwright-core's installer where no @playwright/mcp is there", () => {
  const at = browserRepo([]);
  const core = path.join(at.repo, 'node_modules', 'playwright-core');
  standInCore(core, '1243');
  const fixed = browserRan(at, ['--install']);
  assert.equal(fixed.code, 0, fixed.err);
  assert.deepEqual(installs(at.log), [[path.join(fs.realpathSync(core), 'cli.js'), 'install', 'chromium']]);
});

test('browser, where the repository holds no playwright-core, is met by any Chromium where Playwright looks, and missing where it keeps none', () => {
  const none = browserRepo([]);
  assert.equal(browserRan(none).code, 1);
  const some = browserRan(browserRepo(['1200']));
  assert.equal(some.code, 0, some.err);
});

test('REFUSED: browser --install where the repository holds no playwright-core, and browser with a flag it has not', () => {
  const at = browserRepo([]);
  assert.equal(browserRan(at, ['--install']).code, 1);
  assert.deepEqual(installs(at.log), [], 'no installer was run');
  assert.equal(browserRan(at, ['--force']).code, 1);
});
