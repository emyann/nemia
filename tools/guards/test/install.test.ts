/**
 * `tools/release/install.sh` run for real on a release `tools/release/archive.ts` packs, both as a person's machine meets them: a
 * fixture tree with a stand-in Node (a shell script that prints what it was asked to run) packed for this machine's platform by
 * `pack`, laid out under a `file://` download base as GitHub lays a release out (`<base>/download/<tag>/<asset>`,
 * `<base>/latest/download/latest.json`), and the installer run with `--yes --no-service` into a scratch HOME and `WF_ROOT`. It asserts
 * the release folder and its `release.json`, the relative `releases/current`, the `~/.local/bin/nemia` link and that the launcher runs
 * the release's own Node on the cli through both links; then a release whose `SHA256SUMS` line is wrong refused with exit 1, leaving
 * `current`, the releases and the link as they were. What it asserts is exit codes and files, never a sentence.
 *
 * The stand-in Node is also the stand-in `nemia` of the steps after the unpacking: given `STUB_LOG`, it logs each verb it is asked,
 * answers `service addresses` with one address of each kind, `token add` with a person token (on its `Authorization:` line and
 * another), `board link` with a link, `readiness` with a missing piece and exit 1, and keeps what `claude-token set` read and the
 * token file `config set-context` was handed beside the log. A person's answers are lines of a file named by `NEMIA_INSTALL_TTY`,
 * which the installer reads in place of its terminal; `loginctl` and `systemctl` are stand-ins first on PATH, so no test touches
 * the machine's own.
 *
 * `install.sh` is POSIX sh: each test parses it with `sh -n` first, so a bashism the host's sh refuses fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { assetName, pack, PLATFORMS, type Platform } from '../../release/archive.ts';

const INSTALL = path.join(import.meta.dirname, '..', '..', 'release', 'install.sh');

/** This machine's platform as a release names it, or undefined where no archive is built for it. */
const HOST = PLATFORMS.find((each) => each === `${process.platform}-${process.arch}`);

/**
 * The stand-in Node, so the stand-in `nemia`: `$1` is the cli's path, the verb follows. With no `STUB_LOG` it prints its argv, as
 * the launcher's test reads it.
 */
const STUB = [
  '#!/bin/sh',
  'if [ -z "${STUB_LOG:-}" ]; then printf "%s\\n" "$0" "$@"; exit 0; fi',
  'shift',
  'printf "%s\\n" "$*" >>"$STUB_LOG"',
  'case "$1 $2" in',
  '  "service addresses") printf "127.0.0.1 lo loopback\\n192.168.1.20 eth0 private\\n100.100.1.2 tailscale0 shared\\n" ;',
  '    printf "fd7a::1 tailscale0 unique-local\\n203.0.113.5 eth1 public\\n" ;;',
  '  "token add") printf "minted person-secret-1 for %s\\nAuthorization: Bearer person-secret-1\\n" "$3" ;;',
  '  "claude-token set") cat >"$STUB_LOG.claude" ;;',
  '  "config set-context") if [ "$3" = local ]; then cat "$5" >"$STUB_LOG.local"; ls -l "$5" | cut -c1-10 >"$STUB_LOG.mode"; fi ;;',
  '  "board link") printf "%s/link/first-visit\\n" "${4:-http://127.0.0.1:8787}" ;;',
  '  "readiness ") printf "harness missing: nemia claude-token set\\n"; exit 1 ;;',
  'esac',
  '',
].join('\n');

/** A release's tree, as the archive tool is handed one: a root manifest, the cli's bin, and a Node that prints its argv. */
const fixture = (root: string): { tree: string; node: string } => {
  const tree = path.join(root, 'tree');
  fs.mkdirSync(path.join(tree, 'apps', 'cli', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'package.json'), '{ "name": "nemia", "version": "1.2.3" }\n');
  fs.writeFileSync(path.join(tree, 'apps', 'cli', 'bin', 'nemia.ts'), '');
  const node = path.join(root, 'node');
  fs.mkdirSync(path.join(node, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(node, 'bin', 'node'), STUB, { mode: 0o755 });
  return { tree, node };
};

/** Publishes the release `tag` for `platform` under the download base `base`, as the workflow's upload lays it out. */
const publish = (base: string, tag: string, platform: Platform): string => {
  const { tree, node } = fixture(scratch('install-tree-'));
  const out = path.join(base, 'download', tag);
  pack({ tree, node, platform, tag, source: `file://${base}`, commit: 'f'.repeat(40), builtAt: '2026-11-11T00:00:00.000Z', out });
  fs.mkdirSync(path.join(base, 'latest', 'download'), { recursive: true });
  fs.writeFileSync(path.join(base, 'latest', 'download', 'latest.json'), JSON.stringify({ tag, version: tag.slice(1) }));
  return out;
};

/** A person's machine: an empty HOME and its store under it. */
const machine = () => {
  const home = fs.realpathSync(scratch('install-home-'));
  return { home, root: path.join(home, '.agent-workflows') };
};

/** Runs the installer with `args` on `home`, its store at `root`, and `more` in its environment. */
const install = (home: string, root: string, args: string[], more: Record<string, string> = {}) => {
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, WF_ROOT: root, ...more };
  const ran = spawnSync('sh', [INSTALL, ...args], { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: ran.status, out: `${ran.stdout}${ran.stderr}` };
};

test('install.sh parses as POSIX sh', () => {
  const ran = spawnSync('sh', ['-n', INSTALL], { encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
});

test(
  'install.sh lays down the latest release from a file:// base, points current at it and links nemia to its launcher',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    const base = fs.realpathSync(scratch('install-base-'));
    publish(base, 'v1.2.3', HOST as Platform);
    const { home, root } = machine();

    const ran = install(home, root, ['--yes', '--no-service', '--base', `file://${base}`]);
    assert.equal(ran.status, 0, ran.out);

    const releases = path.join(root, 'releases');
    const release = JSON.parse(fs.readFileSync(path.join(releases, 'current', 'release.json'), 'utf8')) as Record<string, string>;
    assert.deepEqual(
      { tag: release.tag, from: release.from, platform: release.platform, source: release.source },
      { tag: 'v1.2.3', from: 'archive', platform: HOST, source: `file://${base}` },
    );
    assert.equal(fs.readlinkSync(path.join(releases, 'current')), 'v1.2.3', 'current is the relative link to the tag');
    const link = path.join(home, '.local', 'bin', 'nemia');
    assert.equal(fs.readlinkSync(link), path.join(releases, 'current', 'bin', 'nemia'));
    assert.deepEqual(
      fs.readdirSync(releases).filter((name) => name.startsWith('.')),
      [],
      'no hidden folder is left behind',
    );

    const launched = spawnSync(link, ['version'], { encoding: 'utf8' });
    assert.equal(launched.status, 0, launched.stderr);
    assert.deepEqual(launched.stdout.trim().split('\n'), [
      path.join(releases, 'v1.2.3', 'node', 'bin', 'node'),
      path.join(releases, 'v1.2.3', 'apps', 'cli', 'bin', 'nemia.ts'),
      'version',
    ]);
  },
);

test(
  'REFUSED: a release whose SHA256SUMS names another sum exits 1 and leaves current, the releases and the link as they were',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    const base = fs.realpathSync(scratch('install-base-'));
    publish(base, 'v1.2.3', HOST as Platform);
    const { home, root } = machine();
    assert.equal(install(home, root, ['--yes', '--no-service', '--base', `file://${base}`]).status, 0);

    const out = publish(base, 'v1.2.4', HOST as Platform);
    fs.writeFileSync(path.join(out, 'SHA256SUMS'), `${'0'.repeat(64)}  ${assetName('v1.2.4', HOST as Platform)}\n`);
    const releases = path.join(root, 'releases');
    const before = fs.readdirSync(releases).sort();

    const ran = install(home, root, ['--yes', '--no-service', '--base', `file://${base}`]);
    assert.equal(ran.status, 1, ran.out);
    assert.equal(fs.readlinkSync(path.join(releases, 'current')), 'v1.2.3', 'current still names the release before');
    assert.deepEqual(fs.readdirSync(releases).sort(), before, 'no folder of v1.2.4, and no hidden folder left');
    assert.equal(fs.readlinkSync(path.join(home, '.local', 'bin', 'nemia')), path.join(releases, 'current', 'bin', 'nemia'));
  },
);

test('REFUSED: an argument the installer does not take exits 2, and a flag with no value too', () => {
  const { home, root } = machine();
  assert.equal(install(home, root, ['--yes', '--no-such-flag']).status, 2);
  assert.equal(install(home, root, ['--yes', '--version']).status, 2);
  assert.equal(fs.existsSync(root), false, 'nothing is written before the arguments are read');
});

/** Stand-in `loginctl` and `systemctl` that answer yes, first on PATH, so a service install touches neither of the machine's. */
const systemStandIns = (): string => {
  const dir = fs.realpathSync(scratch('install-system-'));
  for (const name of ['loginctl', 'systemctl']) fs.writeFileSync(path.join(dir, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return dir;
};

/**
 * A person's machine with the release `v1.2.3` published for it, and `run`, which installs on it with `args` and, when `answers`
 * is given, those lines as what the person types. It returns the exit, everything printed, and what the stand-in `nemia` logged.
 */
const server = () => {
  const base = fs.realpathSync(scratch('install-base-'));
  publish(base, 'v1.2.3', HOST as Platform);
  const system = systemStandIns();
  return (args: string[], answers?: string[]) => {
    const { home, root } = machine();
    const log = path.join(home, 'nemia.log');
    const more: Record<string, string> = { STUB_LOG: log, PATH: `${system}:${process.env.PATH ?? '/usr/bin:/bin'}` };
    if (answers !== undefined) {
      more.NEMIA_INSTALL_TTY = path.join(home, 'answers');
      fs.writeFileSync(more.NEMIA_INSTALL_TTY, answers.map((line) => `${line}\n`).join(''));
    }
    const ran = install(home, root, [...args, '--base', `file://${base}`], more);
    const asked = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    const kept = (suffix: string) => (fs.existsSync(`${log}.${suffix}`) ? fs.readFileSync(`${log}.${suffix}`, 'utf8') : undefined);
    return { ...ran, asked, kept };
  };
};

const onHost = { skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}` };

test(
  'a person asked on the terminal: the Claude token with no y/N first, the bind picked from the private addresses, no token printed, a link, and readiness last',
  onHost,
  () => {
    const run = server();
    const ran = run([], ['claude-oat-secret', '', '2']);
    assert.equal(ran.status, 0, ran.out);

    assert.doesNotMatch(ran.out, /\[y\/N\]/, 'the Claude token is asked outright');
    assert.equal(ran.kept('claude'), 'claude-oat-secret\n', 'the Claude token reaches claude-token set by its stdin');
    assert.doesNotMatch(ran.out, /claude-oat-secret/, 'the Claude token is never printed');

    for (const offered of ['127.0.0.1', '192.168.1.20', '100.100.1.2', 'fd7a::1'])
      assert.match(ran.out, new RegExp(offered.replaceAll('.', '\\.')));
    assert.doesNotMatch(ran.out, /203\.0\.113\.5/, 'a public address is never offered');
    assert.ok(ran.asked.includes('service install --size auto --bind 192.168.1.20'), ran.asked.join('\n'));

    assert.doesNotMatch(ran.out, /person-secret-1/, 'the person token is never printed');
    assert.doesNotMatch(ran.out, /Authorization:/, 'nor its header line');
    const set = ran.asked.find((line) => line.startsWith('config set-context local --token-file '));
    assert.ok(set, ran.asked.join('\n'));
    assert.equal(ran.kept('local'), 'person-secret-1\n', 'the local context is handed the token alone, by its file');
    assert.equal(ran.kept('mode'), '-rw-------\n', 'a file only its owner reads');
    assert.equal(fs.existsSync(set.slice('config set-context local --token-file '.length)), false, 'and the file is gone after');

    assert.ok(ran.asked.includes('board link --base http://192.168.1.20:8787'), ran.asked.join('\n'));
    assert.match(ran.out, /http:\/\/192\.168\.1\.20:8787\/link\/first-visit/, 'the first-visit link is printed');
    assert.equal(ran.asked.at(-1), 'readiness', 'the install ends on the readiness read, its exit 1 no failure of the install');
  },
);

test('a typed address is taken, and the 1 of the offer binds this machine alone, with no token minted', onHost, () => {
  const run = server();
  const typed = run([], ['claude-oat-secret', '', '10.0.0.7']);
  assert.equal(typed.status, 0, typed.out);
  assert.ok(typed.asked.includes('service install --size auto --bind 10.0.0.7'), typed.asked.join('\n'));
  assert.ok(typed.asked.includes('board link --base http://10.0.0.7:8787'), 'the link is made under the bind, not the lease');
  const v6 = run([], ['claude-oat-secret', '', 'fd7a::7']);
  assert.ok(v6.asked.includes('board link --base http://[fd7a::7]:8787'), v6.asked.join('\n'));

  const alone = run([], ['claude-oat-secret', '', '1']);
  assert.equal(alone.status, 0, alone.out);
  assert.ok(alone.asked.includes('service install --size auto'), alone.asked.join('\n'));
  assert.equal(
    alone.asked.some((line) => line.startsWith('token add') || line.startsWith('board link')),
    false,
    alone.asked.join('\n'),
  );
  assert.equal(alone.asked.at(-1), 'readiness');
});

test('REFUSED: a public or wildcard bind exits 1 with no service installed, unless --public, which is passed on', onHost, () => {
  const run = server();
  for (const bind of ['203.0.113.5', '0.0.0.0']) {
    const refused = run(['--yes', '--bind', bind]);
    assert.equal(refused.status, 1, `${bind}: ${refused.out}`);
    assert.equal(
      refused.asked.some((line) => line.startsWith('service install')),
      false,
      `${bind}: ${refused.asked.join('\n')}`,
    );
  }
  const typed = run([], ['claude-oat-secret', '', '203.0.113.5']);
  assert.equal(typed.status, 1, typed.out);
  assert.equal(
    typed.asked.some((line) => line.startsWith('service install')),
    false,
    typed.asked.join('\n'),
  );

  const acknowledged = run(['--yes', '--bind', '203.0.113.5', '--public', '--board-base', 'https://nemia.example.org']);
  assert.equal(acknowledged.status, 0, acknowledged.out);
  assert.ok(acknowledged.asked.includes('service install --size auto --bind 203.0.113.5 --public'), acknowledged.asked.join('\n'));
  assert.ok(acknowledged.asked.includes('board link --base https://nemia.example.org'), acknowledged.asked.join('\n'));
  assert.match(acknowledged.out, /https:\/\/nemia\.example\.org\/link\/first-visit/);
  assert.doesNotMatch(acknowledged.out, /person-secret-1|Authorization:/);
});

test('under --yes with no --claude-token-file the Claude token is skipped, not asked, and the install goes on', onHost, () => {
  const run = server();
  const ran = run(['--yes', '--no-service']);
  assert.equal(ran.status, 0, ran.out);
  assert.equal(
    ran.asked.some((line) => line.startsWith('claude-token set')),
    false,
    ran.asked.join('\n'),
  );
  assert.equal(ran.asked.at(-1), 'readiness');
});

test(
  "a client install pairs with its server, under its --context when given; a token by --token-file is still the context's, and no token is printed",
  onHost,
  () => {
    const run = server();
    const client = ['--yes', '--client', '--server', 'http://100.64.0.1:8787'];
    const paired = run(client);
    assert.equal(paired.status, 0, paired.out);
    assert.deepEqual(paired.asked, ['pair http://100.64.0.1:8787', 'readiness']);

    const named = run([...client, '--context', 'vps']);
    assert.equal(named.status, 0, named.out);
    assert.deepEqual(named.asked, ['pair http://100.64.0.1:8787 --context vps', 'readiness']);

    const tokenFile = path.join(fs.realpathSync(scratch('install-token-')), 'token');
    fs.writeFileSync(tokenFile, 'a-token\n', { mode: 0o600 });
    const given = run([...client, '--token-file', tokenFile]);
    assert.equal(given.status, 0, given.out);
    assert.deepEqual(given.asked, [
      `config set-context remote --server http://100.64.0.1:8787 --token-file ${tokenFile}`,
      'config use-context remote',
      'readiness',
    ]);
    assert.doesNotMatch(given.out, /a-token/, 'the token itself is never printed');
  },
);

test('REFUSED: a client install with no server exits 1 under --yes, pairing with nothing', onHost, () => {
  const run = server();
  const ran = run(['--yes', '--client']);
  assert.equal(ran.status, 1, ran.out);
  assert.deepEqual(ran.asked, []);
});

/**
 * A download base reached over http, as a stand-in `curl` first on PATH serves it: `latest.json` naming `tag`, every other URL logged
 * and answered as missing (exit 22, as `curl -f` does on a 404). The log says what the installer asked to download.
 */
const mirror = (tag: string) => {
  const dir = fs.realpathSync(scratch('install-curl-'));
  const log = path.join(dir, 'fetched');
  const latest = path.join(dir, 'latest.json');
  fs.writeFileSync(latest, JSON.stringify({ tag, version: tag.slice(1) }));
  fs.writeFileSync(
    path.join(dir, 'curl'),
    [
      '#!/bin/sh',
      'out=; url=',
      'while [ "$#" -gt 0 ]; do case $1 in -o) out=$2; shift ;; -*) ;; *) url=$1 ;; esac; shift; done',
      `printf '%s\\n' "$url" >>'${log}'`,
      `case $url in */latest/download/latest.json) cp '${latest}' "$out" ;; *) exit 22 ;; esac`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return { dir, log };
};

test(
  'REFUSED: a release tag that is not v and three dotted numbers, a pre-release too, exits 1 before anything is downloaded or deleted, by --version or latest.json',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    for (const tag of ['v1.0.0/../..', 'v1.0.0 ', 'v1.2.3-rc.1', 'v1.2.3.4', 'v1.2.3.']) {
      for (const by of ['latest.json', '--version']) {
        const { dir, log } = mirror(tag);
        const { home, root } = machine();
        fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
        const kept = path.join(root, 'kept');
        fs.writeFileSync(kept, 'the store above releases/\n');
        const args = [
          '--yes',
          '--no-service',
          '--base',
          'https://mirror.invalid/releases',
          ...(by === '--version' ? ['--version', tag] : []),
        ];
        const env = { PATH: `${dir}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: home, WF_ROOT: root };
        const ran = spawnSync('sh', [INSTALL, ...args], { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
        const label = `${JSON.stringify(tag)} by ${by}`;
        assert.equal(ran.status, 1, `${label}: ${ran.stdout}${ran.stderr}`);
        const fetched = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
        assert.deepEqual(
          fetched.filter((url) => !url.endsWith('/latest/download/latest.json')),
          [],
          `${label}: no archive is downloaded`,
        );
        assert.equal(fs.existsSync(kept), true, `${label}: nothing above releases/ is deleted`);
        assert.deepEqual(fs.readdirSync(path.join(root, 'releases')), [], `${label}: no folder is left under releases/`);
        assert.equal(fs.existsSync(path.join(home, '.local')), false, `${label}: no link is made`);
      }
    }
  },
);

test(
  'a release tag of v and three dotted numbers is taken, by --version and by latest.json: its archive is the next thing downloaded',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    for (const by of ['latest.json', '--version']) {
      const { dir, log } = mirror('v1.20.3');
      const { home, root } = machine();
      const args = [
        '--yes',
        '--no-service',
        '--base',
        'https://mirror.invalid/releases',
        ...(by === '--version' ? ['--version', 'v1.20.3'] : []),
      ];
      const env = { PATH: `${dir}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: home, WF_ROOT: root };
      const ran = spawnSync('sh', [INSTALL, ...args], { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
      assert.equal(ran.status, 1, 'the stand-in mirror has no archive, so the download fails');
      const fetched = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      assert.equal(
        fetched.at(-1),
        `https://mirror.invalid/releases/download/v1.20.3/${assetName('v1.20.3', HOST as Platform)}`,
        `${by}: ${ran.stdout}${ran.stderr}`,
      );
    }
  },
);
