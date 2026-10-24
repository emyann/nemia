/**
 * What keeps the store's measure (`report.ts`) off the real world: the copy it measures on and what the copy leaves out
 * (`copyStore`, `LEFT_OUT`), the refusal of a copy inside the store it copies (`destinationRefusal`), the place it reads through,
 * which answers a read and refuses every write (`readOnlyPlace`), and the fence around its reads (`installFence`): every child
 * process and every write to the disk this process makes, judged as it is made.
 *
 * A pass on a copy of the store acts on the real repositories its records name (`packages/agent-orchestrator/CLAUDE.md`, *The tick*):
 * the place refuses its writes, and the fence refuses a git that writes, a write outside the copy and a signal to a process this one
 * did not start, on every read; on a pass (`arm('pass')`) it refuses any child but a read of git or Claude Code's list of its sessions
 * (`claudeListing`) besides. Each refusal is kept
 * (`refusals`), and the report refuses itself while one is there.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import type { Place } from 'agent-orchestrator';

/** What a copy of the workflows' store (`WF_ROOT`) leaves out, by its path from the store's root, and why. */
export const LEFT_OUT: readonly { path: string; why: string }[] = [
  { path: 'worktrees', why: "the runs' checkouts: gigabytes no read of the five opens, and a git repository each" },
  { path: 'api.log', why: "the api's log, which no read opens" },
  { path: 'wf-up.log', why: "the daemon's log, which no read opens" },
  {
    path: 'daemon.json',
    why: 'the live daemon, named as the holder of the store: a copy holding it would follow its sessions through the live process',
  },
  { path: 'engine/a2a', why: "the holder's token, a secret no read needs" },
];

/** What a copy of the runtime's own store (`AE_ROOT`) leaves out: the holder's token. */
export const AE_LEFT_OUT: readonly { path: string; why: string }[] = [{ path: 'a2a', why: "the holder's token, a secret no read needs" }];

/** What a copy holds: its files and their bytes, and each path of `LEFT_OUT` that was there to leave out. */
export type Copied = { files: number; bytes: number; leftOut: string[] };

/**
 * `from` copied into `to`, a folder not there yet, but each path of `leftOut` under `from`: its folders, files and links, a link kept as
 * a link. A store being written while it is copied is copied as it is read: a file gone before it is copied is passed over, and a line
 * torn in the middle is the copy's. Anything but a folder, a file or a link (a socket, a fifo) is passed over.
 */
export function copyStore(from: string, to: string, leftOut: readonly { path: string }[] = LEFT_OUT): Copied {
  const out = new Set(leftOut.map((l) => l.path));
  const copied: Copied = { files: 0, bytes: 0, leftOut: [] };
  const walk = (at: string): void => {
    fs.mkdirSync(path.join(to, at), { recursive: true });
    for (const entry of entriesOf(path.join(from, at))) {
      const here = at === '' ? entry.name : `${at}/${entry.name}`;
      if (out.has(here)) copied.leftOut.push(here);
      else if (entry.isDirectory()) walk(here);
      else passingGone(() => copyOne(path.join(from, here), path.join(to, here), entry, copied));
    }
  };
  walk('');
  return copied;
}

/** The entries of the folder `dir`, none where it went before it was read. */
const entriesOf = (dir: string): fs.Dirent[] => passingGone(() => fs.readdirSync(dir, { withFileTypes: true })) ?? [];

/** What `act` answers, or undefined where what it reads went before it was read (`ENOENT`); any other failure thrown. */
function passingGone<T>(act: () => T): T | undefined {
  try {
    return act();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return undefined;
  }
}

/** One entry copied from `source` to `dest`: a link as a link, a file counted into `copied`, anything else passed over. */
function copyOne(source: string, dest: string, entry: fs.Dirent, copied: Copied): void {
  if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(source), dest);
  else if (entry.isFile()) {
    fs.copyFileSync(source, dest);
    copied.files++;
    copied.bytes += fs.statSync(dest).size;
  }
}

/** Whether `inner` is `outer` or under it, each resolved. */
const within = (inner: string, outer: string): boolean => {
  const rel = path.relative(path.resolve(outer), path.resolve(inner));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** The real path of `p`, or `p` resolved where it is not there. */
const real = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/**
 * Why a copy made under `dest` would be inside one of the stores it copies, which a walk of that store would then copy into itself and
 * whose files the measure would read as the store's; or undefined.
 */
export function destinationRefusal(dest: string, sources: readonly string[]): string | undefined {
  const inside = sources.find((source) => within(real(dest), real(source)));
  return inside === undefined
    ? undefined
    : `the copy would be made in ${dest}, inside ${inside}, the store it copies: point TMPDIR at a folder outside both stores ` +
        '(TMPDIR=/tmp), or name another store with --from or --engine';
}

/** The place's verbs that change a repository or a checkout: each refused by `readOnlyPlace`. */
export const PLACE_WRITES = ['open', 'make', 'handoff', 'land', 'remove', 'export', 'seal'] as const;

const isWrite = (verb: string): boolean => (PLACE_WRITES as readonly string[]).includes(verb);

/** The words of a refused write, as the place's own refusal. */
const refusedWrite = (verb: string) => ({
  refused: `${verb} is a write, and the store's measure reads a copy of the store through a place that answers reads alone`,
});

/** How many writes each place `readOnlyPlace` made has refused, by verb. */
export const placeRefused: Record<string, number> = {};

/** `place`, answering its reads as it does and refusing every write (`PLACE_WRITES`) in its own words, never asking `place` of it. */
export function readOnlyPlace(place: Place): Place {
  const refuse = (verb: string) => {
    placeRefused[verb] = (placeRefused[verb] ?? 0) + 1;
    return refusedWrite(verb) as never;
  };
  return {
    declared: place.declared,
    ask: (verb, request, options) => (isWrite(verb) ? Effect.sync(() => refuse(verb)) : place.ask(verb, request, options)),
    askNow: (verb, request, options) => (isWrite(verb) ? refuse(verb) : place.askNow(verb, request, options)),
  };
}

/** git's options before its verb that take the word after them. */
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path']);

/** git's verbs that read and never write a ref, the index of a checkout aside, as the team's read-only set holds them (root CLAUDE.md). */
const GIT_READS = new Set([
  'rev-parse',
  'for-each-ref',
  'merge-base',
  'merge-tree',
  'cat-file',
  'show',
  'log',
  'diff',
  'diff-tree',
  'diff-index',
  'diff-files',
  'rev-list',
  'status',
  'ls-files',
  'ls-tree',
  'show-ref',
  'describe',
  'blame',
  'shortlog',
  'name-rev',
  'check-ignore',
  'check-attr',
  'var',
  'version',
  'count-objects',
  'grep',
  '--version',
]);

/** What `git branch` takes that changes a branch. */
const BRANCH_WRITES = /^(-[dDmMcCfut]|--delete|--move|--copy|--force|--track|--set-upstream-to.*|--unset-upstream|--edit-description)$/;

/** What `git branch` takes with a word after it, which is no branch's name. */
const BRANCH_VALUED = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort']);

/** Whether `git branch` with `args` lists, and makes, moves or deletes nothing. */
const branchReads = (args: readonly string[]): boolean => {
  if (args.some((a) => BRANCH_WRITES.test(a))) return false;
  if (args.some((a) => a === '--list' || a === '-l' || a === '--show-current')) return true;
  const named = args.filter((a, i) => !a.startsWith('-') && !BRANCH_VALUED.has(args[i - 1] ?? ''));
  return named.length === 0;
};

/**
 * Whether git run with `args` reads (`read`) or may write (`write`): a verb of `GIT_READS`, or one of `worktree`, `branch`, `config`,
 * `remote`, `tag`, `stash`, `symbolic-ref` and `notes` in a form that lists, is a read; any other verb, any `--output`, and git with no
 * verb is a write.
 */
export function gitVerdict(args: readonly string[]): 'read' | 'write' {
  let i = 0;
  while (i < args.length && args[i].startsWith('-') && args[i] !== '--version') i += GIT_VALUED.has(args[i]) ? 2 : 1;
  const verb = args[i];
  const rest = args.slice(i + 1);
  if (verb === undefined || rest.some((a) => a.startsWith('--output'))) return 'write';
  if (GIT_READS.has(verb)) return 'read';
  const sub = rest.find((a) => !a.startsWith('-'));
  const reads: Record<string, () => boolean> = {
    worktree: () => sub === 'list',
    branch: () => branchReads(rest),
    config: () => sub === 'get' || sub === 'list' || rest.some((a) => /^(--get|--get-all|--get-regexp|--get-urlmatch|--list|-l)$/.test(a)),
    remote: () => sub === undefined || sub === 'get-url' || sub === 'show',
    tag: () => rest.length === 0 || rest.some((a) => a === '-l' || a === '--list'),
    stash: () => sub === 'list' || sub === 'show',
    'symbolic-ref': () => !rest.some((a) => a === '-d' || a === '--delete') && rest.filter((a) => !a.startsWith('-')).length <= 1,
    notes: () => sub === 'list' || sub === 'show',
  };
  return reads[verb]?.() ? 'read' : 'write';
}

/** What the fence is armed for: a read of the api, or a pass of the tick, which may spawn git's reads alone. */
export type FenceMode = 'read' | 'pass';

/** A child process the fence saw: what ran, its verdict, and what the fence was armed for. */
export type Spawned = { command: string; verdict: 'git read' | 'git write' | 'claude read' | 'other'; on: FenceMode };

/**
 * Whether `words`, given to `claude`, list Claude Code's sessions and nothing else (`claude agents --all --json`): the runtime's view
 * of a held session reads that list on a pass, as the daemon's pass does, and it starts, stops and writes nothing.
 */
export const claudeListing = (words: readonly string[]): boolean =>
  words[0] === 'agents' && words.slice(1).every((w) => w === '--all' || w === '--json');

/** What the fence refused: a child process, a write to the disk, or a signal, with what it was and what the fence was armed for. */
export type Refusal = { kind: 'spawn' | 'write' | 'signal' | 'engine'; what: string; on: FenceMode };

/** The fence over this process, installed: arm it for a read or a pass, disarm it, read what it saw and refused, and take it off. */
export type Fence = {
  arm: (mode: FenceMode) => void;
  disarm: () => void;
  /** Keep a refusal the fence did not make itself: a verb of the engine a pass may not call (`report.ts`, `passEngine`). */
  refuse: (kind: Refusal['kind'], what: string) => Error;
  readonly refusals: Refusal[];
  readonly spawned: Spawned[];
  uninstall: () => void;
};

/** The paths a call of `fs`'s `name` writes, from its arguments: none for a read. */
type WrittenBy = (args: unknown[]) => unknown[];

const first: WrittenBy = (args) => [args[0]];
const second: WrittenBy = (args) => [args[1]];
const both: WrittenBy = (args) => [args[0], args[1]];

/** Whether an `open` with `flags` may write. */
const opensToWrite = (flags: unknown): boolean =>
  typeof flags === 'string'
    ? /[wa+]/.test(flags)
    : typeof flags === 'number'
      ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0
      : false;

/** Each of `fs`'s writes, by name, with the paths it writes: its sync, its callback and its promise forms share the name. */
const FS_WRITES: Record<string, WrittenBy> = {
  writeFile: first,
  appendFile: first,
  mkdir: first,
  mkdtemp: first,
  rm: first,
  rmdir: first,
  unlink: first,
  rename: both,
  copyFile: second,
  cp: second,
  symlink: second,
  link: second,
  truncate: first,
  utimes: first,
  lutimes: first,
  chmod: first,
  lchmod: first,
  chown: first,
  lchown: first,
  open: (args) => (opensToWrite(args[1]) ? [args[0]] : []),
  createWriteStream: first,
};

/** A path an `fs` call was handed, as a string, or undefined for a descriptor. */
const pathOf = (p: unknown): string | undefined =>
  typeof p === 'string' ? p : p instanceof URL ? fileURLToPath(p) : Buffer.isBuffer(p) ? p.toString() : undefined;

/** What a call of one of `child_process`'s functions runs: the program and its words. */
const commandOf = (name: string, args: unknown[]): { file: string; words: string[] } => {
  if (name === 'exec' || name === 'execSync') {
    const [file = '', ...words] = String(args[0]).trim().split(/\s+/);
    return { file, words };
  }
  if (name === 'fork') return { file: process.execPath, words: [String(args[0])] };
  const words = Array.isArray(args[1]) ? args[1].map(String) : [];
  const options = (Array.isArray(args[1]) ? args[2] : args[1]) as { shell?: unknown } | undefined;
  if (options?.shell) {
    const [file = '', ...rest] = [String(args[0]), ...words].join(' ').trim().split(/\s+/);
    return { file, words: rest };
  }
  return { file: String(args[0]), words };
};

/** What a fence holds while it is installed: what it is armed for, what it saw and refused, the processes it saw started. */
type FenceState = {
  mode: FenceMode | undefined;
  refusals: Refusal[];
  spawned: Spawned[];
  started: Set<number>;
  undo: (() => void)[];
};

/** `on[name]` replaced by what `wrap` makes of it, put back by `state.undo`; nothing where `on` has no such function. */
function replace(
  state: FenceState,
  on: object,
  name: string,
  wrap: (original: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown,
) {
  const held = on as Record<string, unknown>;
  const original = held[name];
  if (typeof original !== 'function') return;
  held[name] = wrap(original as (...a: unknown[]) => unknown);
  state.undo.push(() => {
    held[name] = original;
  });
}

/** A refusal kept in `state`, as the error a refused call of the system throws. */
function refused(state: FenceState, kind: Refusal['kind'], what: string): Error {
  state.refusals.push({ kind, what, on: state.mode ?? 'read' });
  return Object.assign(new Error(`EACCES: the store's measure refused ${kind === 'write' ? 'a write to' : kind} ${what}`), {
    code: 'EACCES',
  });
}

/** Every function of `child_process` judged as it is called: a git that writes refused, and on a pass anything but git. */
function fenceSpawns(state: FenceState): void {
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'])
    replace(
      state,
      childProcess,
      name,
      (original) =>
        function (this: unknown, ...args: unknown[]) {
          if (state.mode !== undefined) {
            const { file, words } = commandOf(name, args);
            const base = path.basename(file);
            const verdict: Spawned['verdict'] =
              base === 'git'
                ? gitVerdict(words) === 'read'
                  ? 'git read'
                  : 'git write'
                : base === 'claude' && claudeListing(words)
                  ? 'claude read'
                  : 'other';
            const command = [path.basename(file), ...words].join(' ');
            state.spawned.push({ command, verdict, on: state.mode });
            if (verdict === 'git write' || (verdict === 'other' && state.mode === 'pass')) throw refused(state, 'spawn', command);
          }
          const child = original.apply(this, args) as { pid?: number } | undefined;
          if (typeof child?.pid === 'number') state.started.add(child.pid);
          return child;
        },
    );
}

/** Every write of `fs`, in its sync, callback and promise forms, refused outside `allowed`. */
function fenceWrites(state: FenceState, allowed: readonly string[]): void {
  const written = (name: string, args: unknown[]) => {
    if (state.mode === undefined) return;
    for (const p of FS_WRITES[name](args)) {
      const file = pathOf(p);
      if (file === undefined) continue;
      const at = path.resolve(file);
      if (!allowed.some((root) => within(at, root))) throw refused(state, 'write', at);
    }
  };
  for (const name of Object.keys(FS_WRITES))
    for (const [on, as] of [
      [fs, name],
      [fs, `${name}Sync`],
      [fs.promises, name],
    ] as const)
      replace(
        state,
        on,
        as,
        (original) =>
          function (this: unknown, ...args: unknown[]) {
            written(name, args);
            return original.apply(this, args);
          },
      );
}

/** `process.kill` refused for any signal but 0 to a process the fence did not see started. */
function fenceSignals(state: FenceState): void {
  replace(state, process, 'kill', (original) => (pid: unknown, signal?: unknown) => {
    if (state.mode !== undefined && signal !== 0 && !state.started.has(Math.abs(Number(pid))))
      throw refused(state, 'signal', `${typeof signal === 'string' || typeof signal === 'number' ? signal : 'SIGTERM'} to ${Number(pid)}`);
    return original.call(process, pid, signal);
  });
}

/**
 * The fence, installed over `child_process`, `fs` and `process.kill` and synced into their ESM exports, disarmed: armed, it judges
 * every child process (`gitVerdict`) and refuses a git that writes, and on a pass anything but git; refuses every write to the disk
 * outside `roots` (and `/dev/null`); and refuses a signal but 0 to a process it did not see started. A refusal throws where the call was
 * made, as a refused call of the system would, and is kept in `refusals`.
 */
export function installFence(roots: readonly string[]): Fence {
  const state: FenceState = { mode: undefined, refusals: [], spawned: [], started: new Set(), undo: [] };
  fenceSpawns(state);
  fenceWrites(state, [...roots.flatMap((r) => [path.resolve(r), real(r)]), '/dev/null']);
  fenceSignals(state);
  syncBuiltinESMExports();
  return {
    arm: (m) => {
      state.mode = m;
    },
    disarm: () => {
      state.mode = undefined;
    },
    refuse: (kind, what) => refused(state, kind, what),
    refusals: state.refusals,
    spawned: state.spawned,
    uninstall: () => {
      state.mode = undefined;
      for (const put of state.undo.reverse()) put();
      syncBuiltinESMExports();
    },
  };
}
