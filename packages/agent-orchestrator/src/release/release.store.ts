/**
 * The store's releases on disk: `$WF_ROOT/releases/<tag>` each, `releases/current` the relative link to one, `releases/.logs/` what each
 * build said, `releases/.building-<tag>-<pid>/` a build under way — its exported `tree/` and the `trial/` store its checks run on —,
 * `releases/.current-<pid>` the pointer's next link while it is switched, and `releases/.removing-<name>-<pid>` a release or a crashed
 * upgrade's leftover the retention moved aside to delete. Reads the pointer and a release's `release.json`
 * (`ReleaseFileSchema`), runs a build's commands with the build's output in its log, and writes a release last, then the pointer, each by
 * a rename, so no reader meets half of either; a release goes by a rename too, so no reader meets half of one removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Option, Result, Schema } from 'effect';
import { CURRENT, RELEASE_FILE, RELEASE_PLATFORMS, type Current, type ReleaseFile, type Running } from './release.ts';
import type { BuildLog, Installed, PidEntry } from '../retention/index.ts';

/** `release.json` as an upgrade writes it (`ReleaseFile`). */
const ReleaseFileSchema = Schema.Struct({
  tag: Schema.String.check(Schema.isNonEmpty()),
  commit: Schema.String.check(Schema.isNonEmpty()),
  source: Schema.String,
  builtAt: Schema.String,
  from: Schema.optionalKey(Schema.Literals(['build', 'archive'])),
  platform: Schema.optionalKey(Schema.Literals(RELEASE_PLATFORMS)),
});

/**
 * The store's releases folder.
 * @param root The store's folder.
 */
export const releasesDir = (root: string): string => path.join(root, 'releases');

/**
 * The store's releases folder as a real path, which an image a session recorded is compared with (`sessionRelease`): through
 * `fs.realpathSync`, so a store reached through a link compares as the folder it is; resolved as it stands where it does not exist yet.
 * @param home The store's folder.
 */
export function realReleasesDir(home: string): string {
  const dir = releasesDir(home);
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

/**
 * The folder `tag` is built into.
 * @param tag The release's tag.
 * @param root The store's folder.
 */
export const releaseDir = (tag: string, root: string): string => path.join(releasesDir(root), tag);

/**
 * What the `release.json` at the root of `dir` says, or undefined where there is none or it does not read as one.
 * @param dir The folder whose `release.json` is read: a release's tree or the code's root.
 */
export function releaseFileOf(dir: string): ReleaseFile | undefined {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, RELEASE_FILE), 'utf8');
  } catch {
    return undefined;
  }
  try {
    const decoded = Schema.decodeUnknownResult(Schema.fromJsonString(ReleaseFileSchema))(text);
    return Result.isFailure(decoded) ? undefined : decoded.success;
  } catch {
    return undefined;
  }
}

/**
 * The code whose root is `root`: an install where a `release.json` sits there, else a checkout.
 * @param root The root of the code this process runs from.
 */
export function runningAt(root: string): Running {
  const file = releaseFileOf(root);
  return file === undefined ? { kind: 'checkout', root } : { kind: 'install', root, ...file };
}

/**
 * The release the store's pointer names, with its real folder, or null where there is no pointer or it names no built release.
 * @param root The store's folder.
 */
export function currentRelease(root: string): Current | null {
  let dir: string;
  try {
    dir = fs.realpathSync(path.join(releasesDir(root), CURRENT));
  } catch {
    return null;
  }
  const file = releaseFileOf(dir);
  return file === undefined ? null : { ...file, dir };
}

/** A `package.json`'s scripts, as `scriptsOf` reads them: a map, or none. */
const scriptsIn = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ scripts: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)) })),
);

/**
 * The scripts of the `package.json` at the root of `dir`, or none where it has none.
 * @param dir The folder whose `package.json` is read.
 */
export function scriptsOf(dir: string): Readonly<Record<string, unknown>> {
  try {
    const read = scriptsIn(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return Option.isSome(read) ? (read.value.scripts ?? {}) : {};
  } catch {
    return {};
  }
}

/** Where a build of `tag` goes on: its folder, the exported tree, the trial store its checks run on, and its log. */
export type Building = { readonly dir: string; readonly tree: string; readonly trial: string; readonly log: string };

/**
 * A new build of `tag`: `releases/.building-<tag>-<pid>/`, its `trial/` made, and its log under `releases/.logs/`, named by `stamp`.
 * @param tag The tag being built.
 * @param stamp The time the build started, as a file name may hold it, which names the log.
 * @param root The store's folder.
 */
export function buildingOf(tag: string, stamp: string, root: string): Building {
  const releases = releasesDir(root);
  const dir = path.join(releases, `.building-${tag}-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'trial'), { recursive: true });
  fs.mkdirSync(path.join(releases, LOGS), { recursive: true });
  return { dir, tree: path.join(dir, 'tree'), trial: path.join(dir, 'trial'), log: path.join(releases, LOGS, `${tag}-${stamp}.log`) };
}

/**
 * The environment a release's commands run in: this process's, without `HKB_REPO`, with `WF_ROOT` and `AE_ROOT` in the build's own trial
 * store, so a release's suite never reads or writes a store a person's daemon serves.
 * @param env The environment of this process, which the commands' is made from.
 * @param trial The build's trial store, which `WF_ROOT` and `AE_ROOT` are put in.
 */
export function trialEnv(env: NodeJS.ProcessEnv, trial: string): NodeJS.ProcessEnv {
  const { HKB_REPO: _repo, WF_ROOT: _wf, AE_ROOT: _ae, ...rest } = env;
  return { ...rest, WF_ROOT: path.join(trial, 'workflows'), AE_ROOT: path.join(trial, 'engine') };
}

/**
 * Runs `argv` in `cwd` with `env`, its output appended to `log` under a line naming it; answers its exit, or its signal's name.
 * @param argv The program and its arguments.
 * @param cwd The folder it runs in.
 * @param env The environment it runs over.
 * @param log The file its output is appended to.
 */
export function ranInto(argv: readonly string[], cwd: string, env: NodeJS.ProcessEnv, log: string): number | string {
  fs.appendFileSync(log, `$ ${argv.join(' ')}\n`);
  const fd = fs.openSync(log, 'a');
  try {
    const [command, ...args] = argv;
    if (command === undefined) throw new Error('ranInto runs a command: give it argv with the program first.');
    const ran = spawnSync(command, args, { cwd, env, stdio: ['ignore', fd, fd] });
    if (ran.error) fs.appendFileSync(log, `${ran.error.message}\n`);
    return ran.status ?? ran.signal ?? 'not started';
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The size of `log` in bytes, 0 where it is not there yet: where what a command appends to it starts (`lastLineFrom`).
 * @param log The log's path.
 */
export const logSize = (log: string): number => fs.statSync(log, { throwIfNoEntry: false })?.size ?? 0;

/**
 * The last line with words in it that `log` holds past its first `from` bytes and the line `ranInto` names the command by, trimmed: where
 * what it ran ended its output; undefined where it printed none.
 * @param log The log's path.
 * @param from The size of the log in bytes before the command ran (`logSize`).
 */
export function lastLineFrom(log: string, from: number): string | undefined {
  const [, ...printed] = fs.readFileSync(log).subarray(from).toString('utf8').split('\n');
  return printed
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .at(-1);
}

/**
 * Writes `release.json` into the built tree, the last thing a build writes into it.
 * @param tree The built tree.
 * @param file What the tree's `release.json` says.
 */
export const writeReleaseFile = (tree: string, file: ReleaseFile): void =>
  fs.writeFileSync(path.join(tree, RELEASE_FILE), `${JSON.stringify(file, null, 2)}\n`);

/**
 * Moves the built tree into `releases/<tag>`; answers false, moving nothing, where a release of that tag is there already.
 * @param tree The built tree.
 * @param tag The release's tag.
 * @param root The store's folder.
 */
export function placeRelease(tree: string, tag: string, root: string): boolean {
  const at = releaseDir(tag, root);
  if (fs.existsSync(at)) return false;
  fs.renameSync(tree, at);
  return true;
}

/**
 * Takes a build's folder away, its tree and trial store with it.
 * @param building The build whose folder is taken away.
 */
export const removeBuilding = (building: Building): void => fs.rmSync(building.dir, { recursive: true, force: true });

/**
 * Points `releases/current` at `releases/<tag>`: a relative link made beside it, then renamed over it, so the pointer is never absent.
 * @param tag The release's tag the pointer is to name.
 * @param root The store's folder.
 */
export function switchCurrent(tag: string, root: string): void {
  const releases = releasesDir(root);
  const hidden = path.join(releases, `${CURRENT_LINK}${process.pid}`);
  fs.rmSync(hidden, { force: true });
  fs.symlinkSync(tag, hidden);
  fs.renameSync(hidden, path.join(releases, CURRENT));
}

/** The prefix of a build's folder, of the pointer's next link, and of what the retention moved aside to be deleted. */
const BUILDING = '.building-';
const CURRENT_LINK = `.${CURRENT}-`;
const REMOVING = '.removing-';
const LOGS = '.logs';

/** The names under the store's `releases/`, or none where it does not exist. */
function namesIn(home: string): string[] {
  try {
    return fs.readdirSync(releasesDir(home));
  } catch {
    return [];
  }
}

/**
 * The releases installed under the store's `releases/`: each real folder there — never the pointer, a link, nor a dot folder (`.logs`,
 * a build, a release moved aside) — whose `release.json` reads, by its folder's name and when it was built.
 * @param home The store's folder.
 */
export function installedReleases(home: string): Installed[] {
  return namesIn(home).flatMap((name) => {
    if (name.startsWith('.') || name === CURRENT) return [];
    const dir = path.join(releasesDir(home), name);
    if (!fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
    const file = releaseFileOf(dir);
    return file === undefined ? [] : [{ tag: name, builtAt: file.builtAt }];
  });
}

/**
 * The entries under the store's `releases/` an upgrade names by its pid: each build's folder (`.building-<tag>-<pid>`) and each pointer
 * link made beside `current` (`.current-<pid>`), with whether that pid, the name's last `-` part, is a live process (`live`, the daemon
 * store's `alive`, given by the caller). A name whose last part is no pid is left out, and so never removed.
 * @param home The store's folder.
 * @param live Whether a pid is a live process.
 */
export const pidEntries = (home: string, live: (pid: number) => boolean): PidEntry[] =>
  namesIn(home).flatMap((name) => {
    if (!name.startsWith(BUILDING) && !name.startsWith(CURRENT_LINK)) return [];
    const pid = Number(name.slice(name.lastIndexOf('-') + 1));
    return Number.isInteger(pid) && pid > 0 ? [{ name, live: live(pid) }] : [];
  });

/**
 * Whether an upgrade is building: a `.building-<tag>-<pid>` folder whose pid is a live process (`pidEntries`).
 * @param home The store's folder.
 * @param live Whether a pid is a live process.
 */
export const buildUnderWay = (home: string, live: (pid: number) => boolean): boolean =>
  pidEntries(home, live).some((e) => e.live && e.name.startsWith(BUILDING));

/**
 * The build logs under `releases/.logs/`: each regular file there, with when it was last written in whole milliseconds; none where the
 * folder does not exist.
 * @param home The store's folder.
 */
export function buildLogs(home: string): BuildLog[] {
  const dir = path.join(releasesDir(home), LOGS);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const stat = fs.lstatSync(path.join(dir, name), { throwIfNoEntry: false });
    return stat?.isFile() ? [{ name, modifiedMs: Math.floor(stat.mtimeMs) }] : [];
  });
}

/**
 * Where the build log `name` is, for the caller to delete.
 * @param home The store's folder.
 * @param name The log's file name under `releases/.logs/`.
 */
export const buildLogPath = (home: string, name: string): string => path.join(releasesDir(home), LOGS, name);

/**
 * Moves the leftover `releases/<name>` (a `pidEntries` entry) aside to `releases/.removing-<name>-<pid>`, a link as a link, for the
 * caller to delete off the event loop, and answers where; answers false, moving nothing, where it is gone already.
 * @param home The store's folder.
 * @param name The leftover's name under `releases/`.
 */
export function asideLeftover(home: string, name: string): string | false {
  const aside = path.join(releasesDir(home), `${REMOVING}${name}-${process.pid}`);
  try {
    fs.renameSync(path.join(releasesDir(home), name), aside);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  return aside;
}

/**
 * Moves `releases/<tag>` aside to `releases/.removing-<tag>-<pid>`, for the caller to delete off the event loop, and answers where;
 * answers false, moving nothing, where it is gone already, while an upgrade is building (it may be about to point at it) or the pointer
 * names it. Synchronous, so nothing in this process switches the pointer between the reads and the rename.
 * @param home The store's folder.
 * @param tag The release's tag.
 * @param live Whether a pid is a live process, which tells a live build.
 */
export function removeRelease(home: string, tag: string, live: (pid: number) => boolean): string | false {
  const dir = releaseDir(tag, home);
  let real: string;
  try {
    real = fs.realpathSync(dir);
  } catch {
    return false;
  }
  if (buildUnderWay(home, live) || currentRelease(home)?.dir === real) return false;
  const aside = path.join(releasesDir(home), `${REMOVING}${tag}-${process.pid}`);
  fs.renameSync(dir, aside);
  return aside;
}

/**
 * The releases moved aside and not yet deleted: one a sweep was stopped on, which the next deletes.
 * @param home The store's folder.
 */
export const leftRemovals = (home: string): string[] =>
  namesIn(home)
    .filter((name) => name.startsWith(REMOVING))
    .map((name) => path.join(releasesDir(home), name));
