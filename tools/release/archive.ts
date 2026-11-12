/**
 * The archive of a release for one platform: what `install.sh` and `nemia upgrade` unpack into `$WF_ROOT/releases/<tag>` (`README.md`
 * beside this file). The repository's own tool, never shipped; it imports nothing installed.
 *
 * `node tools/release/archive.ts --platform <p> --tag <vX.Y.Z> --source <download base> --out <dir>`, run in a checkout at the tag on a
 * machine of that platform: `npm ci` and the board's build in the checkout, the tracked tree copied by `git archive` beside the built
 * board, production dependencies alone installed in the copy (`npm ci --omit=dev`), the pinned Node of `node.json` fetched and verified
 * into `node/`, then `pack`: the SDK's platform packages taken out of the tree (`dropHarnessBinaries`: a release carries no harness, a
 * person activates one with `nemia doctor fix`), `bin/nemia`, `release.json`, the tar.gz with its entries at its root, and its
 * `SHA256SUMS` line. Given `--tree <dir> --node <dir>` it packs that tree with that Node and builds nothing, which is
 * how `tools/guards/test/install.test.ts` makes an archive with no network.
 *
 * Exit codes: 0 written, 1 refused or failed (the line says what to do), 2 an argument it does not take.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The platforms a release is built for, as `process.platform`-`process.arch` names them. */
export const PLATFORMS = ['linux-x64', 'linux-arm64', 'darwin-arm64'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** The pinned Node: its version, where it is downloaded from, and the sha256 of each platform's `.tar.gz`. */
type NodePin = { version: string; source: string; sha256: Record<Platform, string> };

const HERE = import.meta.dirname;
const ROOT = path.join(HERE, '..', '..');

/** The bound on one command: `npm ci` on a cold runner is the slowest. */
const CALL_MS = 20 * 60_000;

/**
 * The launcher at `bin/nemia`: POSIX sh that follows its own path through every symlink (`~/.local/bin/nemia`, then
 * `releases/current`) to the release folder, and runs the bundled Node on the cli's `nemia` bin there.
 */
export const LAUNCHER = `#!/bin/sh
# nemia: run this release's own Node on its cli.
set -e
self=$0
while [ -L "$self" ]; do
  link=$(readlink "$self")
  case $link in
    /*) self=$link ;;
    *) self=$(dirname "$self")/$link ;;
  esac
done
root=$(cd "$(dirname "$self")/.." && pwd -P)
exec "$root/node/bin/node" "$root/apps/cli/bin/nemia.ts" "$@"
`;

/** A refusal: its message says what to do, and the tool exits 1 with it. */
class Refusal extends Error {}

/** An argument the tool does not take: it exits 2 with the usage. */
class Usage extends Refusal {}

/** The archive's file name, as `install.sh` and the upgrade fetch it. */
export const assetName = (tag: string, platform: Platform): string => `nemia-${tag}-${platform}.tar.gz`;

/** The platform `name` names, or a refusal naming the three. */
export const platformOf = (name: string | undefined): Platform => {
  const found = PLATFORMS.find((each) => each === name);
  if (found === undefined) throw new Refusal(`no platform ${String(name)}: pass --platform as one of ${PLATFORMS.join(', ')}`);
  return found;
};

/** The sha256 of a file, in hex. */
export const sha256Of = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Runs `command` in `cwd`, inheriting the output, and refuses on a non-zero exit, naming the command. */
const run = (command: string, args: string[], cwd: string): void => {
  const ran = spawnSync(command, args, { cwd, stdio: 'inherit', timeout: CALL_MS });
  if (ran.status !== 0)
    throw new Refusal(
      `${command} ${args.join(' ')} failed in ${cwd} (${ran.error?.message ?? `exit ${String(ran.status)}`}): fix it and run again`,
    );
};

/**
 * The name every platform package of the Agent SDK starts with, `@anthropic-ai/claude-agent-sdk-<platform>-<arch>`, each holding the
 * platform's own harness binary: the package the runtime's vocabulary installs a harness from (`claudeNeeds`,
 * `packages/agent-runtime/src/harness/claude/vocabulary.ts`). Spelled here because this tool imports nothing installed.
 */
export const SDK_PLATFORM_PREFIX = 'claude-agent-sdk-';
const SDK_SCOPE = '@anthropic-ai';

/** The `node_modules` folders under `dir`'s own, each package's nested one too, `dir`'s first. */
const nodeModulesUnder = (dir: string): string[] => {
  const modules = path.join(dir, 'node_modules');
  if (!fs.existsSync(modules)) return [];
  const packages = fs
    .readdirSync(modules, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .flatMap((entry) =>
      entry.name.startsWith('@')
        ? fs
            .readdirSync(path.join(modules, entry.name), { withFileTypes: true })
            .filter((inner) => inner.isDirectory())
            .map((inner) => path.join(modules, entry.name, inner.name))
        : [path.join(modules, entry.name)],
    );
  return [modules, ...packages.flatMap(nodeModulesUnder)];
};

/**
 * Takes every platform package of the SDK out of `tree`, any platform, wherever npm put it (the root's `node_modules`, a workspace's, a
 * package's nested one), and leaves the SDK itself: `npm ci --omit=dev` installs the one of the machine it runs on as the SDK's optional
 * dependency, and `--omit=optional` would drop every package's. Returns the folders it took out, relative to `tree`.
 */
export const dropHarnessBinaries = (tree: string): string[] => {
  const workspaces = ['packages', 'apps', 'tools']
    .map((group) => path.join(tree, group))
    .filter((group) => fs.existsSync(group))
    .flatMap((group) => fs.readdirSync(group).map((name) => path.join(group, name)));
  const dropped: string[] = [];
  for (const modules of [tree, ...workspaces].flatMap(nodeModulesUnder)) {
    const scope = path.join(modules, SDK_SCOPE);
    if (!fs.existsSync(scope)) continue;
    for (const name of fs.readdirSync(scope).filter((each) => each.startsWith(SDK_PLATFORM_PREFIX))) {
      fs.rmSync(path.join(scope, name), { recursive: true, force: true });
      dropped.push(path.relative(tree, path.join(scope, name)));
    }
  }
  return dropped;
};

/** What `pack` writes into a tree and from it. */
export type Packed = {
  tree: string;
  node: string;
  platform: Platform;
  tag: string;
  source: string;
  commit: string;
  builtAt: string;
  out: string;
};

/**
 * Packs `tree` as the release of `tag` for `platform`: the SDK's platform packages taken out (`dropHarnessBinaries`), `node` copied
 * to `node/`, the launcher to `bin/nemia`, `release.json` written
 * last into the tree, then `<out>/nemia-<tag>-<platform>.tar.gz` with the tree's entries at its root and `<out>/SHA256SUMS` holding its
 * one line. Returns the archive's path.
 */
export const pack = (given: Packed): string => {
  dropHarnessBinaries(given.tree);
  fs.cpSync(given.node, path.join(given.tree, 'node'), { recursive: true, verbatimSymlinks: true });
  fs.mkdirSync(path.join(given.tree, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(given.tree, 'bin', 'nemia'), LAUNCHER, { mode: 0o755 });
  const release = {
    tag: given.tag,
    commit: given.commit,
    source: given.source,
    builtAt: given.builtAt,
    from: 'archive',
    platform: given.platform,
  };
  fs.writeFileSync(path.join(given.tree, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
  fs.mkdirSync(given.out, { recursive: true });
  const name = assetName(given.tag, given.platform);
  const archive = path.join(given.out, name);
  run('tar', ['-czf', archive, '-C', given.tree, ...fs.readdirSync(given.tree).sort()], given.tree);
  fs.writeFileSync(path.join(given.out, 'SHA256SUMS'), `${sha256Of(archive)}  ${name}\n`);
  return archive;
};

/** The pinned Node, read from `node.json` beside this file. */
const nodePin = (): NodePin => JSON.parse(fs.readFileSync(path.join(HERE, 'node.json'), 'utf8')) as NodePin;

/** Downloads the pinned Node for `platform` into `work`, refuses it unless its sha256 is the pinned one, and returns its folder. */
const fetchNode = async (platform: Platform, work: string): Promise<string> => {
  const pin = nodePin();
  const base = `node-v${pin.version}-${platform}`;
  const url = `${pin.source}/v${pin.version}/${base}.tar.gz`;
  const answer = await fetch(url, { signal: AbortSignal.timeout(CALL_MS) });
  if (!answer.ok) throw new Refusal(`GET ${url} answered ${answer.status}: check node.json's version and source`);
  const tarball = path.join(work, `${base}.tar.gz`);
  fs.writeFileSync(tarball, Buffer.from(await answer.arrayBuffer()));
  const got = sha256Of(tarball);
  if (got !== pin.sha256[platform])
    throw new Refusal(`${url} has sha256 ${got}, not node.json's ${pin.sha256[platform]}: take the line from its SHASUMS256.txt`);
  run('tar', ['-xzf', tarball, '-C', work], work);
  return path.join(work, base);
};

/** The checkout's head commit. */
const commitOf = (): string => {
  const ran = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (ran.status !== 0) throw new Refusal(`git rev-parse HEAD failed in ${ROOT}: run this in a checkout of the repository`);
  return ran.stdout.trim();
};

/**
 * Builds the release folder in `work`: the board built in the checkout, the tracked tree copied, production dependencies installed;
 * `pack` takes the SDK's platform package back out.
 */
const buildTree = (work: string): string => {
  run('npm', ['ci'], ROOT);
  run('npm', ['run', 'build', '--workspace', 'web'], ROOT);
  const tree = path.join(work, 'tree');
  fs.mkdirSync(tree);
  const tar = path.join(work, 'tree.tar');
  run('git', ['archive', '--format=tar', '-o', tar, 'HEAD'], ROOT);
  run('tar', ['-xf', tar, '-C', tree], work);
  fs.rmSync(tar);
  fs.cpSync(path.join(ROOT, 'apps', 'web', 'dist'), path.join(tree, 'apps', 'web', 'dist'), { recursive: true });
  run('npm', ['ci', '--omit=dev'], tree);
  return tree;
};

/** The flags given, as `--name value` pairs; a flag with no value or a bare word is refused. */
const flagsOf = (argv: string[]): Record<string, string> => {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [name, value] = [argv[i], argv[i + 1]];
    if (!name.startsWith('--') || value === undefined) throw new Usage(`${name} takes a value: ${USAGE}`);
    flags[name.slice(2)] = value;
  }
  return flags;
};

const USAGE =
  'usage: node tools/release/archive.ts --platform <linux-x64|linux-arm64|darwin-arm64> --tag <vX.Y.Z> --source <download base> --out <dir> [--tree <dir> --node <dir>]';

/** The flags a run needs, each refused when missing. */
const needed = (flags: Record<string, string>, name: string): string => {
  const value = flags[name];
  if (value === undefined || value === '') throw new Usage(`--${name} is missing: ${USAGE}`);
  return value;
};

/** Builds and packs the archive the flags name: its path. */
const archive = async (flags: Record<string, string>): Promise<string> => {
  const platform = platformOf(flags.platform);
  const [tag, source, out] = [needed(flags, 'tag'), needed(flags, 'source'), path.resolve(needed(flags, 'out'))];
  const builtAt = new Date().toISOString();
  if (flags.tree !== undefined)
    return pack({ tree: flags.tree, node: needed(flags, 'node'), platform, tag, source, commit: commitOf(), builtAt, out });
  const host = `${process.platform}-${process.arch}`;
  if (host !== platform) throw new Refusal(`this machine is ${host}, not ${platform}: build each platform's archive on a machine of it`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-archive-'));
  try {
    const tree = buildTree(work);
    const node = await fetchNode(platform, work);
    return pack({ tree, node, platform, tag, source, commit: commitOf(), builtAt, out });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
};

/** Runs the tool: its exit code. */
export const main = async (argv: string[], out: (line: string) => void = console.log): Promise<number> => {
  try {
    out(`archive: wrote ${await archive(flagsOf(argv))}`);
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    out(error.message);
    return error instanceof Usage ? 2 : 1;
  }
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
