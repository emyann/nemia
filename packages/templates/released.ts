/**
 * The record of what this workspace releases (`released.json`: by template, its version and the digest of its content) and the one
 * command that cuts it again: `node packages/templates/released.ts cut`, the command the landing runs where a run's branch lacks its
 * base (the factory's landingRefresh parameter in sdlc).
 *
 * `cut` is run from the root of a worktree with a merge of the base in progress (`MERGE_HEAD` the base, `HEAD` the branch's reviewed
 * tip). For each template of the workspace it reads the version the base records, the version where the branch forked (the merge base)
 * and the branch's own, merges `nemia.yaml` over the three with their version line set to the base's, and digests the merged content at
 * the base's version: where that is the digest the base records, nothing of the template changed and the base's record stands; where it
 * is not, the template takes the least version above the base's of the kind the branch bumped by (`landedVersion`, which
 * `contracts/version.contract.ts` proves), and its record is that version with the digest of the content under it. So two runs that
 * changed one template side by side never both claim one version. It writes the version into `nemia.yaml` and the record into
 * `released.json`, and `git add`s each, changing nothing else; it refuses, exit 1 with what to do on stderr and the merge as it was,
 * where a file it derives conflicts outside the version line, where another file is left unmerged, or where a template changed and its
 * branch bumped nothing. A template the base does not record is new on the branch, and keeps the branch's version and record.
 *
 * The digest is the one `nemia template lint <folder>` prints, of the folder's files with their modes. A checkout's modes are its umask's,
 * so the digest is read over a scratch copy whose modes are git's (100644 a 0o644, 100755 a 0o755: `modesOf`), never over the checkout as
 * it is (`digestOf`). The lint is the orchestrator's CLI, resolved by its entry (`agent-orchestrator/bin`) and spawned on a throwaway
 * store and home, so nothing of the person's is read or written. `test/released.test.ts` reads the same digest.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bump, Landed, LandedVersion, Semver } from './contracts/version.contract.ts';

/** The record of what is released, by its name in the workspace. */
export const RELEASED = 'released.json';

/** A template's record: the version released, and the digest of its content under it. */
export type Recorded = { version: string; digest: string };

/** The whole record: each template's, by its name. */
export type Records = { [template: string]: Recorded };

/** A refusal of `cut`: said on stderr, exit 1. */
class Refusal extends Error {}

/** The highest part `to` grew over `from` by precedence, or `none` where `to` is not above `from`. */
const bumpOf = (from: Semver, to: Semver): Bump => {
  if (to[0] !== from[0]) return to[0] > from[0] ? 'major' : 'none';
  if (to[1] !== from[1]) return to[1] > from[1] ? 'minor' : 'none';
  return to[2] > from[2] ? 'patch' : 'none';
};

/**
 * The version a template takes where its branch lands: the base's where its content did not change, else the least above the base's of
 * the kind the branch bumped by since it forked, refused where it bumped nothing.
 */
export const landedVersion: LandedVersion = (seam): Landed => {
  if (!seam.changed) return { kind: 'kept', version: seam.base };
  const bump = bumpOf(seam.forked, seam.branch);
  const [major, minor, patch] = seam.base;
  if (bump === 'major') return { kind: 'taken', version: [major + 1, 0, 0] };
  if (bump === 'minor') return { kind: 'taken', version: [major, minor + 1, 0] };
  if (bump === 'patch') return { kind: 'taken', version: [major, minor, patch + 1] };
  return { kind: 'refused', reason: 'unbumped' };
};

/** `git <args>` in `cwd`: its exit and its streams, never thrown. */
const git = (cwd: string, ...args: string[]): { code: number | null; out: string; err: string } => {
  const ran = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: ran.status, out: ran.stdout ?? '', err: ran.stderr ?? '' };
};

/** `git <args>` in `cwd`, its standard output; throws where git refuses. */
const gitOut = (cwd: string, ...args: string[]): string => {
  const ran = git(cwd, ...args);
  if (ran.code !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${ran.err.trim()}`);
  return ran.out;
};

/** The text of `file` (from the repository's root) at `commit`, or `undefined` where the commit holds no such file. */
const shown = (root: string, commit: string, file: string): string | undefined => {
  const ran = git(root, 'show', `${commit}:${file}`);
  return ran.code === 0 ? ran.out : undefined;
};

/** Each file of the folder `dir` that git tracks, by its path from `dir`, with the permission bits git records for it. */
export function modesOf(dir: string): Map<string, number> {
  const listed = git(dir, 'ls-files', '-s', '-z', '.');
  if (listed.code !== 0) throw new Error(`git ls-files could not list ${dir}: ${listed.err.trim()}; run it in a git checkout`);
  return new Map(
    listed.out
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const [meta = '', file = ''] = entry.split('\t');
        return [file, meta.startsWith('100755') ? 0o755 : 0o644] as const;
      }),
  );
}

/** The templates of the workspace `root`: each folder of it that holds a `nemia.yaml`. */
export const templatesIn = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'nemia.yaml')))
    .map((entry) => entry.name)
    .sort();

/**
 * `nemia template lint <folder>` by the orchestrator's CLI, bounded, on a store and home of its own under `work`: an environment that
 * holds the path alone besides, so no telemetry, session or serving variable of the caller reaches it.
 */
function lint(work: string, folder: string): { code: number | null; out: string; err: string } {
  const bin = fileURLToPath(import.meta.resolve('agent-orchestrator/bin'));
  const home = path.join(work, 'home');
  fs.mkdirSync(home, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    WF_ROOT: path.join(work, 'store'),
    AE_ROOT: path.join(work, 'engine'),
    HOME: home,
    CLAUDE_CONFIG_DIR: path.join(work, 'claude'),
  };
  const ran = spawnSync(process.execPath, [bin, 'template', 'lint', folder], { env, encoding: 'utf8', timeout: 120_000 });
  return { code: ran.status, out: ran.stdout ?? '', err: ran.stderr ?? '' };
}

/**
 * The digest of the content of the template `folder` (a folder of `root`), as `nemia template lint` prints it over a scratch copy: its
 * files' modes set from `modes` (0o644 for a file git does not track yet), and each file `replaced` names (by its path in the folder)
 * holding the text given there rather than the checkout's.
 */
export function digestOf(
  root: string,
  folder: string,
  modes: ReadonlyMap<string, number>,
  replaced: Readonly<{ [file: string]: string }> = {},
): string {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-released-'));
  try {
    const copy = path.join(work, folder);
    fs.cpSync(path.join(root, folder), copy, { recursive: true });
    for (const [file, text] of Object.entries(replaced)) fs.writeFileSync(path.join(copy, file), text);
    for (const file of fs.readdirSync(copy, { recursive: true, encoding: 'utf8' })) {
      const at = path.join(copy, file);
      fs.chmodSync(at, fs.statSync(at).isDirectory() ? 0o755 : (modes.get(`${folder}/${file.split(path.sep).join('/')}`) ?? 0o644));
    }
    const linted = lint(work, copy);
    if (linted.code !== 0)
      throw new Error(`nemia template lint refused ${folder}: ${linted.err.trim()}; fix what it names in the template`);
    const digest = /^digest of the content: (sha256:[0-9a-f]{64})$/m.exec(linted.out)?.[1];
    if (digest === undefined) throw new Error(`nemia template lint printed no digest for ${folder}: ${linted.out.trim()}`);
    return digest;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** A template's version line in its `nemia.yaml`: `spec.version`, the one key of `spec` at its indent. */
const VERSION_LINE = /^( {2}version: )(\d+)\.(\d+)\.(\d+)[ \t]*$/gm;

/** A version as it is written. */
const spelt = (v: Semver): string => `${v[0]}.${v[1]}.${v[2]}`;

/** The version `text`, a record's, read at `where`; refused where it is no `major.minor.patch`. */
const parsed = (text: string, where: string): Semver => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (m === null) throw new Refusal(`${where} records the version ${text}, which is no major.minor.patch: write it as one, e.g. 1.0.0`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** The `spec.version` of the manifest `text` read at `where`; refused where it holds not exactly one version line. */
const versionIn = (text: string, where: string): Semver => {
  const lines = [...text.matchAll(VERSION_LINE)];
  const [line] = lines;
  if (line === undefined || lines.length !== 1)
    throw new Refusal(`${where} holds ${lines.length} spec.version lines: write exactly one, as "  version: 1.0.0" under spec`);
  return [Number(line[2]), Number(line[3]), Number(line[4])];
};

/** The manifest `text` with its version line saying `v`. */
const withVersion = (text: string, v: Semver): string => text.replace(VERSION_LINE, (_, head: string) => `${head}${spelt(v)}`);

/** The record `text`, a `released.json` read at `where`: none where there is no such file. */
const recordsOf = (text: string | undefined, where: string): Records => {
  if (text === undefined) return {};
  try {
    return JSON.parse(text) as Records;
  } catch {
    throw new Refusal(`${where} is no JSON: write it as ${RELEASED} is written on the base, then land again`);
  }
};

/** `ours` merged with what `theirs` changed since `forked`, by `git merge-file`; `undefined` where a change of both sides conflicts. */
function merged(ours: string, forked: string, theirs: string): string | undefined {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-released-merge-'));
  try {
    const at = (name: string, text: string): string => {
      const file = path.join(work, name);
      fs.writeFileSync(file, text);
      return file;
    };
    const ran = git(work, 'merge-file', '-p', at('ours', ours), at('forked', forked), at('theirs', theirs));
    if (ran.code === null || ran.code > 127) throw new Error(`git merge-file failed: ${ran.err.trim()}`);
    return ran.code === 0 ? ran.out : undefined;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Where `cut` reads: the repository's root, the workspace's path from it, the commit the branch forked at, and git's modes there. */
type Seat = { root: string; ws: string; fork: string; modes: ReadonlyMap<string, number> };

/** What `cut` writes of one template: its manifest's text, where it writes one, and its record, where there is one. */
type Cut = { template: string; manifest: string | undefined; record: Recorded | undefined };

/** The template `template` cut against the base: its manifest merged, and its version and record decided by `landedVersion`. */
function cutOne(seat: Seat, template: string, records: { base: Records; head: Records }): Cut {
  const { root, ws, fork, modes } = seat;
  const file = `${ws}/${template}/nemia.yaml`;
  const recorded = records.base[template];
  if (recorded === undefined) return { template, manifest: undefined, record: records.head[template] };
  const head = shown(root, 'HEAD', file);
  if (head === undefined) return { template, manifest: undefined, record: recorded };
  const base = shown(root, 'MERGE_HEAD', file);
  if (base === undefined)
    throw new Refusal(`the base records ${template} in ${ws}/${RELEASED} and holds no ${file}: record only the templates it holds`);
  const forked = shown(root, fork, file);
  const seam = {
    base: parsed(recorded.version, `the base's ${ws}/${RELEASED} for ${template}`),
    forked: forked === undefined ? ([0, 0, 0] as const) : versionIn(forked, `${file} where the branch forked`),
    branch: versionIn(head, `${file} on the branch`),
  };
  const manifest = merged(withVersion(head, seam.base), withVersion(forked ?? '', seam.base), withVersion(base, seam.base));
  if (manifest === undefined)
    throw new Refusal(
      `${file} conflicts with the base outside its version line: merge the base into the branch, resolve ${file} there and bump its spec.version, then land again`,
    );
  const changed = digestOf(path.join(root, ws), template, modes, { 'nemia.yaml': manifest }) !== recorded.digest;
  const landed = landedVersion({ ...seam, changed });
  if (landed.kind === 'refused')
    throw new Refusal(
      `${template} changed on the branch and its spec.version (${spelt(seam.branch)}) is not above ${spelt(seam.forked)}, where it forked: bump spec.version in ${file} by the kind of the change and record it in ${ws}/${RELEASED} on the branch, then land again`,
    );
  if (landed.kind === 'kept') return { template, manifest, record: recorded };
  const taken = withVersion(manifest, landed.version);
  const digest = digestOf(path.join(root, ws), template, modes, { 'nemia.yaml': taken });
  return { template, manifest: taken, record: { version: spelt(landed.version), digest } };
}

/**
 * `cut`, run from a worktree of the repository with a merge of the base in progress: each template's version and record cut against the
 * base, written and added, a line per template returned. Refused with what to do, having written nothing.
 */
export function cut(cwd: string): string[] {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  if (top.code !== 0) throw new Refusal(`${cwd} is in no git repository: run it from the root of the run's worktree`);
  const root = top.out.trim();
  const ws = path
    .relative(root, import.meta.dirname)
    .split(path.sep)
    .join('/');
  if (ws.startsWith('..') || path.isAbsolute(ws))
    throw new Refusal(`${import.meta.dirname} is outside ${root}: run the released.ts of the worktree being merged, from its root`);
  if (git(root, 'rev-parse', '-q', '--verify', 'MERGE_HEAD').code !== 0)
    throw new Refusal('no merge is in progress here: run it where the base is being merged, after git merge --no-ff --no-commit <base>');
  const templates = templatesIn(path.join(root, ws));
  const derived = new Set([`${ws}/${RELEASED}`, ...templates.map((t) => `${ws}/${t}/nemia.yaml`)]);
  const unmerged = gitOut(root, 'diff', '--name-only', '--diff-filter=U')
    .split('\n')
    .filter((f) => f !== '' && !derived.has(f));
  if (unmerged.length > 0)
    throw new Refusal(
      `the merge leaves ${unmerged.join(', ')} unmerged, which ${RELEASED} does not derive: merge the base into the branch and resolve them there, then land again`,
    );
  const seat: Seat = { root, ws, fork: gitOut(root, 'merge-base', 'HEAD', 'MERGE_HEAD').trim(), modes: modesOf(path.join(root, ws)) };
  const records = {
    base: recordsOf(shown(root, 'MERGE_HEAD', `${ws}/${RELEASED}`), `the base's ${ws}/${RELEASED}`),
    head: recordsOf(shown(root, 'HEAD', `${ws}/${RELEASED}`), `the branch's ${ws}/${RELEASED}`),
  };
  const cuts = templates.map((t) => cutOne(seat, t, records));
  const record: Records = { ...records.base };
  const added = [`${ws}/${RELEASED}`];
  for (const { template, manifest, record: r } of cuts) {
    if (r !== undefined) record[template] = r;
    if (manifest === undefined) continue;
    fs.writeFileSync(path.join(root, ws, template, 'nemia.yaml'), manifest);
    added.push(`${ws}/${template}/nemia.yaml`);
  }
  fs.writeFileSync(path.join(root, ws, RELEASED), `${JSON.stringify(record, null, 2)}\n`);
  gitOut(root, 'add', '--', ...added);
  return cuts.map(({ template, record: r }) => `${template}: ${r?.version ?? 'not recorded'}`);
}

/** The command: `cut`, a line per template on stdout, exit 0; a refusal on stderr, exit 1; another verb, exit 2. */
function main(argv: readonly string[]): number {
  if (argv[0] !== 'cut') {
    process.stderr.write(
      'usage: node packages/templates/released.ts cut, from the root of a worktree with a merge of the base in progress\n',
    );
    return 2;
  }
  try {
    for (const line of cut(process.cwd())) process.stdout.write(`${line}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
