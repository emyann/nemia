/**
 * What an upgrade carries, read and done on the disk: the harnesses the tools folder holds activated (`<tools>/harnesses/<name>/`) and
 * those a release's tree carries in its own `node_modules` (a platform package `<name>-<platform>-<arch>` holding the harness's program,
 * as a release that bundled its default harness does), judged by `upgradeCarries` over the harnesses whose adapters declare needs, and
 * each installed at this release's pin by its declared `install` (`carryHarnesses`, what `nemia doctor carry` runs). And the adoption the
 * daemon's start makes (`adoptBundled`): where the tools folder has no program of a harness, the one a release carries is copied into
 * it, so sessions run at once while its pin's install is filed.
 */
import { Option, Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HARNESS_DECLARATIONS, type HarnessNeeds } from 'agent-runtime/vocabulary';
import { pathLedByTools, toolsBinDir, toolsDir } from '../config/root.store.ts';
import { installedReleases, releaseDir } from './release.store.ts';
import { upgradeCarries } from './carry.ts';
import { DEACTIVATED, harnessInstallCommand } from '../needs/index.ts';

/** A harness whose adapter declares needs (`HarnessNeeds`), by its name. */
export type PinnedHarness = { readonly name: string; readonly needs: HarnessNeeds };

/** The harnesses whose adapters declare needs, in `HARNESS_DECLARATIONS`' order: the ones a release pins. */
export const pinnedHarnesses = () =>
  Object.entries(HARNESS_DECLARATIONS).flatMap(([name, declaration]) =>
    declaration.needs === undefined ? [] : [{ name, needs: declaration.needs }],
  );

/**
 * The folder of the tools folder each harness is installed under, `<tools>/harnesses/<name>/<version>/`.
 * @param home The store's folder.
 */
export const harnessesDir = (home: string) => path.join(toolsDir(home), 'harnesses');

/** Whether `file` is a folder (`directory`) or a file (`file`), followed through a link; false where nothing is there. */
const isA = (file: string, kind: 'directory' | 'file') => {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return kind === 'directory' ? stat?.isDirectory() === true : stat?.isFile() === true;
};

/** The names in `dir`, sorted; none where it cannot be read. */
const namesIn = (dir: string) => {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
};

/** Whether a person deactivated the harness `name` in the store at `home`: its removal's mark in its folder (`DEACTIVATED`). */
const deactivated = (home: string, name: string) => isA(path.join(harnessesDir(home), name, DEACTIVATED), 'file');

/**
 * The harnesses of `pinned` the tools folder of the store at `home` holds activated: a `<tools>/harnesses/<name>/` folder of each, with
 * no removal's mark in it (`deactivated`).
 * @param home The store's folder.
 * @param pinned The harnesses whose adapters declare needs, every one where absent.
 */
export const activatedHarnesses = (home: string, pinned: readonly PinnedHarness[] = pinnedHarnesses()) =>
  pinned.filter((h) => isA(path.join(harnessesDir(home), h.name), 'directory') && !deactivated(home, h.name)).map((h) => h.name);

/**
 * The program `program` that the tree at `tree` carries in a platform package of this machine — `node_modules/<scope>/<name>-<platform>-
 * <arch>/<program>`, or one with no scope — the first by name; undefined where it carries none.
 * @param tree The release's tree whose `node_modules` is searched.
 * @param program The program's file name, as the harness's needs name it.
 * @param platform The platform of the package, this machine's where absent.
 * @param arch The architecture of the package, this machine's where absent.
 */
export function bundledProgramIn(tree: string, program: string, platform: string = process.platform, arch: string = process.arch) {
  const modules = path.join(tree, 'node_modules');
  const suffix = `-${platform}-${arch}`;
  const packages = namesIn(modules).flatMap((entry) =>
    entry.startsWith('@') ? namesIn(path.join(modules, entry)).map((name) => path.join(modules, entry, name)) : [path.join(modules, entry)],
  );
  return packages
    .filter((dir) => dir.endsWith(suffix))
    .map((dir) => path.join(dir, program))
    .find((file) => isA(file, 'file'));
}

/**
 * The harnesses of `pinned` some tree of `trees` carries its program of (`bundledProgramIn`).
 * @param trees The release trees searched.
 * @param pinned The harnesses whose adapters declare needs, every one where absent.
 */
export const bundledHarnesses = (trees: readonly string[], pinned: readonly PinnedHarness[] = pinnedHarnesses()) =>
  pinned.filter((h) => trees.some((tree) => bundledProgramIn(tree, h.needs.program) !== undefined)).map((h) => h.name);

/**
 * The trees of the releases installed in the store at `home` (`installedReleases`): each `releases/<tag>/`, never the pointer.
 * @param home The store's folder.
 */
export const releaseTrees = (home: string) => installedReleases(home).map((r) => releaseDir(r.tag, home));

/**
 * What the store at `home` holds of the harnesses: activated in its tools folder, and carried by any of `trees` — but one a person
 * deactivated (`deactivated`), which an older release's tree still carrying it brings back neither way.
 * @param home The store's folder.
 * @param trees The release trees searched for bundled programs.
 * @param pinned The harnesses whose adapters declare needs, every one where absent.
 */
export const harnessesHeld = (home: string, trees: readonly string[], pinned: readonly PinnedHarness[] = pinnedHarnesses()) => ({
  activated: activatedHarnesses(home, pinned),
  bundled: bundledHarnesses(trees, pinned).filter((name) => !deactivated(home, name)),
});

/**
 * Whether the harness `harness` is at this release's pin in the store at `home`: the tools folder's `bin/<program>` resolves into its
 * pin's folder, `<tools>/harnesses/<name>/<pin>/`, as its install and an adoption at the pin both link it.
 * @param home The store's folder.
 * @param harness The harness and its needs, whose pin and program are read.
 */
export function atPin(home: string, harness: PinnedHarness) {
  try {
    const real = fs.realpathSync(path.join(toolsBinDir(home), harness.needs.program));
    const pinDir = fs.realpathSync(path.join(harnessesDir(home), harness.name, harness.needs.pin));
    return real.startsWith(`${pinDir}${path.sep}`);
  } catch {
    return false;
  }
}

/** What the carry did of one harness: installed at its pin now, found there already, or its install exited non-zero. */
export type HarnessCarried = { readonly name: string; readonly pin: string; readonly kind: 'installed' | 'at-pin' | 'failed' };

/** What `carryHarnesses` did: each harness it carried, and the exit it ends with, 1 where an install failed. */
export type CarryRan = { readonly harnesses: readonly HarnessCarried[]; readonly code: 0 | 1 };

/**
 * Installs at this release's pins, in the store at `home`, what an upgrade carries (`upgradeCarries`): each harness activated in its
 * tools folder, and each that `tree` — the release this code runs from — or another installed release carries in its own tree. A harness
 * at its pin already (`atPin`) is said and left; each other's `install` runs in turn, synchronously, as `sh -c` in the store's folder over
 * `env`, with `NEMIA_TOOLS` the tools folder and its `bin/` first on PATH, its output the process's. Each is said by `say`, and the
 * carry ends 1 once any install fails, after trying the rest.
 * @param home The store's folder, where each install runs.
 * @param env The environment each install runs over.
 * @param tree The tree of the release this code runs from.
 * @param say Where each line said of a harness goes, the console where absent.
 */
export function carryHarnesses(
  home: string,
  env: NodeJS.ProcessEnv,
  tree: string,
  say: (line: string) => void = (line) => console.log(line),
) {
  const pinned = pinnedHarnesses();
  const carried = upgradeCarries(
    harnessesHeld(home, [tree, ...releaseTrees(home)], pinned),
    pinned.map((h) => h.name),
  );
  const harnesses = pinned
    .filter((h) => carried.includes(h.name))
    .map((h) => {
      if (atPin(home, h)) {
        say(`${h.needs.title} is at ${h.needs.pin} already`);
        return { name: h.name, pin: h.needs.pin, kind: 'at-pin' } satisfies HarnessCarried;
      }
      say(`installing ${h.needs.title} ${h.needs.pin} into ${harnessesDir(home)}`);
      fs.mkdirSync(toolsBinDir(home), { recursive: true });
      const ran = spawnSync('sh', ['-c', harnessInstallCommand(h.name, h.needs)], {
        cwd: home,
        env: { ...env, PATH: pathLedByTools(home, env.PATH), NEMIA_TOOLS: toolsDir(home) },
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      if (ran.status === 0) return { name: h.name, pin: h.needs.pin, kind: 'installed' } satisfies HarnessCarried;
      say(
        `${h.needs.title} ${h.needs.pin} did not install (${ran.error?.message ?? `exit ${ran.status ?? ran.signal}`}): nemia doctor fix ${h.name} runs its install again.`,
      );
      return { name: h.name, pin: h.needs.pin, kind: 'failed' } satisfies HarnessCarried;
    });
  if (harnesses.length === 0) say('no harness to carry: none is activated in the tools folder, and no release carries one');
  return { harnesses, code: harnesses.some((h) => h.kind === 'failed') ? 1 : 0 } satisfies CarryRan;
}

/** The key of a bundling package's `package.json` that names the version of the program its platform package carries. */
const BUNDLED_VERSION_KEY = 'claudeCodeVersion';

/** A `package.json`'s text decoded as a record of its keys. */
const packageIn = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));

/** The `package.json` at `dir` read as a record, or undefined where it does not read as one. */
const packageOf = (dir: string) => {
  try {
    return Option.getOrUndefined(packageIn(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
};

/**
 * The version of the program at `program`, read as it was bundled: its package's bundling package (the platform package's name without
 * `-<platform>-<arch>`, beside it) names it under `BUNDLED_VERSION_KEY`; else the platform package's own version; else `bundled`.
 */
function bundledVersionOf(program: string, platform: string, arch: string) {
  const own = path.dirname(program);
  const bundling = path.join(path.dirname(own), path.basename(own).slice(0, -`-${platform}-${arch}`.length));
  const named = packageOf(bundling)?.[BUNDLED_VERSION_KEY];
  if (typeof named === 'string' && /^[\w.+-]+$/.test(named)) return named;
  const version = packageOf(own)?.version;
  return typeof version === 'string' && /^[\w.+-]+$/.test(version) ? version : 'bundled';
}

/** A harness adopted from a release's tree: its name, the version it was bundled at, and the file it was copied from. */
export type Adopted = { readonly name: string; readonly version: string; readonly from: string };

/**
 * Adopts, into the tools folder of the store at `home`, each harness with needs whose program the folder's `bin/` lacks and one of `trees`
 * carries (`bundledProgramIn`, the first tree that does): its program copied into `<tools>/harnesses/<name>/<version>/<program>` (the
 * version read off its bundling package, `bundledVersionOf`), by a copy beside it renamed into place so no reader meets half of it, and
 * linked as `<tools>/bin/<program>`. A harness whose program the folder holds, one a person deactivated (`deactivated`), or one no tree
 * carries, is left. Answers what it adopted.
 * @param home The store's folder.
 * @param trees The release trees searched, the first that carries a program giving it.
 * @param platform The platform of the package, this machine's where absent.
 * @param arch The architecture of the package, this machine's where absent.
 */
export function adoptBundled(home: string, trees: readonly string[], platform: string = process.platform, arch: string = process.arch) {
  return pinnedHarnesses().flatMap((h) => {
    const link = path.join(toolsBinDir(home), h.needs.program);
    if (fs.existsSync(link) || deactivated(home, h.name)) return [];
    const from = trees.map((tree) => bundledProgramIn(tree, h.needs.program, platform, arch)).find((file) => file !== undefined);
    if (from === undefined) return [];
    const version = bundledVersionOf(from, platform, arch);
    const dir = path.join(harnessesDir(home), h.name, version);
    const target = path.join(dir, h.needs.program);
    fs.mkdirSync(dir, { recursive: true });
    if (!isA(target, 'file')) {
      const partial = `${target}.${process.pid}.partial`;
      fs.copyFileSync(from, partial);
      fs.chmodSync(partial, 0o755);
      fs.renameSync(partial, target);
    }
    fs.mkdirSync(toolsBinDir(home), { recursive: true });
    fs.rmSync(link, { force: true });
    fs.symlinkSync(target, link);
    return [{ name: h.name, version, from }];
  });
}
