/**
 * The store's releases on disk: `$WF_ROOT/releases/<tag>` each, `releases/current` the relative link to one, `releases/.logs/` what each
 * build said, and `releases/.building-<tag>-<pid>/` a build under way — its exported `tree/` and the `trial/` store its checks run on.
 * Reads the pointer and a release's `release.json` (`ReleaseFileSchema`), runs a build's commands with the build's output in its log, and
 * writes a release last, then the pointer, each by a rename, so no reader meets half of either.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Result, Schema } from 'effect';
import { wfRoot } from '../config/config.store.ts';
import { CURRENT, RELEASE_FILE, type Current, type ReleaseFile, type Running } from './release.ts';

/** `release.json` as an upgrade writes it (`ReleaseFile`). */
const ReleaseFileSchema = Schema.Struct({
  tag: Schema.String.check(Schema.isNonEmpty()),
  commit: Schema.String.check(Schema.isNonEmpty()),
  source: Schema.String,
  builtAt: Schema.String,
});

/** The store's releases folder. */
export const releasesDir = (root: string = wfRoot()): string => path.join(root, 'releases');

/** The folder `tag` is built into. */
export const releaseDir = (tag: string, root: string = wfRoot()): string => path.join(releasesDir(root), tag);

/** What the `release.json` at the root of `dir` says, or undefined where there is none or it does not read as one. */
export function releaseFileOf(dir: string): ReleaseFile | undefined {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, RELEASE_FILE), 'utf8');
  } catch {
    return undefined;
  }
  try {
    const decoded = Schema.decodeUnknownResult(ReleaseFileSchema)(JSON.parse(text));
    return Result.isFailure(decoded) ? undefined : decoded.success;
  } catch {
    return undefined;
  }
}

/** The code whose root is `root`: an install where a `release.json` sits there, else a checkout. */
export function runningAt(root: string): Running {
  const file = releaseFileOf(root);
  return file === undefined ? { kind: 'checkout', root } : { kind: 'install', root, ...file };
}

/** The release the store's pointer names, with its real folder, or null where there is no pointer or it names no built release. */
export function currentRelease(root: string = wfRoot()): Current | null {
  let dir: string;
  try {
    dir = fs.realpathSync(path.join(releasesDir(root), CURRENT));
  } catch {
    return null;
  }
  const file = releaseFileOf(dir);
  return file === undefined ? null : { ...file, dir };
}

/** The scripts of the `package.json` at the root of `dir`, or none where it has none. */
export function scriptsOf(dir: string): Readonly<Record<string, unknown>> {
  try {
    const scripts = (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { scripts?: unknown }).scripts;
    return typeof scripts === 'object' && scripts !== null ? (scripts as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Where a build of `tag` goes on: its folder, the exported tree, the trial store its checks run on, and its log. */
export type Building = { readonly dir: string; readonly tree: string; readonly trial: string; readonly log: string };

/** A new build of `tag`: `releases/.building-<tag>-<pid>/`, its `trial/` made, and its log under `releases/.logs/`, named by `stamp`. */
export function buildingOf(tag: string, stamp: string, root: string = wfRoot()): Building {
  const releases = releasesDir(root);
  const dir = path.join(releases, `.building-${tag}-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'trial'), { recursive: true });
  fs.mkdirSync(path.join(releases, '.logs'), { recursive: true });
  return { dir, tree: path.join(dir, 'tree'), trial: path.join(dir, 'trial'), log: path.join(releases, '.logs', `${tag}-${stamp}.log`) };
}

/**
 * The environment a release's commands run in: this process's, without `HKB_REPO`, with `WF_ROOT` and `AE_ROOT` in the build's own trial
 * store, so a release's suite never reads or writes a store a person's daemon serves.
 */
export function trialEnv(env: NodeJS.ProcessEnv, trial: string): NodeJS.ProcessEnv {
  const { HKB_REPO: _repo, WF_ROOT: _wf, AE_ROOT: _ae, ...rest } = env;
  return { ...rest, WF_ROOT: path.join(trial, 'workflows'), AE_ROOT: path.join(trial, 'engine') };
}

/** Runs `argv` in `cwd` with `env`, its output appended to `log` under a line naming it; answers its exit, or its signal's name. */
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

/** Writes `release.json` into the built tree, the last thing a build writes into it. */
export const writeReleaseFile = (tree: string, file: ReleaseFile): void =>
  fs.writeFileSync(path.join(tree, RELEASE_FILE), `${JSON.stringify(file, null, 2)}\n`);

/** Moves the built tree into `releases/<tag>`; answers false, moving nothing, where a release of that tag is there already. */
export function placeRelease(tree: string, tag: string, root: string = wfRoot()): boolean {
  const at = releaseDir(tag, root);
  if (fs.existsSync(at)) return false;
  fs.renameSync(tree, at);
  return true;
}

/** Takes a build's folder away, its tree and trial store with it. */
export const removeBuilding = (building: Building): void => fs.rmSync(building.dir, { recursive: true, force: true });

/** Points `releases/current` at `releases/<tag>`: a relative link made beside it, then renamed over it, so the pointer is never absent. */
export function switchCurrent(tag: string, root: string = wfRoot()): void {
  const releases = releasesDir(root);
  const hidden = path.join(releases, `.${CURRENT}-${process.pid}`);
  fs.rmSync(hidden, { force: true });
  fs.symlinkSync(tag, hidden);
  fs.renameSync(hidden, path.join(releases, CURRENT));
}
