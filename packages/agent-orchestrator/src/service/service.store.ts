/**
 * The login service on the machine: what the machine is (`machineOf`), where the checkout's daemon is (`daemonEntry`), the service's file
 * written, read and removed, the system's own programs called (`systemCall`), whether the user's services linger (`lingerOf`), the service
 * files of a folder (`unitsOf`), and a daemon spawned on demand in a session of its own (`spawnDetached`). Judged
 * and rendered by `service.ts`; the verbs call these through their host (`ServiceHost` in `service.verb.ts`), so a test hands fakes.
 *
 * Beneath the controllers: it imports only the bottom of the store's tree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { wfRoot } from '../config/config.store.ts';
import { Missing } from '../refusal/refusal.ts';
import type { Machine } from './service.ts';

/** The package's own folder, whose checkout the service runs until a release is installed. */
const PACKAGE = path.join(import.meta.dirname, '..', '..');

/** How long a call of the system's own programs may take before it is given up. */
const CALL_MS = 15_000;

/** A path's real path, or undefined where it is not there. */
const realOf = (at: string): string | undefined => {
  try {
    return fs.realpathSync(at);
  } catch {
    return undefined;
  }
};

/** A file's text, or null where it is not there. */
const textOf = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

/** What the machine is: its platform, whether the kernel is WSL's, and whether systemd is its init (`/run/systemd/system`). */
export function machineOf(): Machine {
  const release = textOf('/proc/sys/kernel/osrelease') ?? '';
  return {
    platform: process.platform,
    wsl: process.platform === 'linux' && (/microsoft|wsl/i.test(release) || process.env.WSL_DISTRO_NAME !== undefined),
    systemd: fs.existsSync('/run/systemd/system'),
  };
}

/** The `nemia.daemon` a folder's `package.json` names, or undefined where it names none or has none. */
const daemonNamed = (dir: string): string | undefined => {
  const text = textOf(path.join(dir, 'package.json'));
  if (text === null) return undefined;
  try {
    const named = (JSON.parse(text) as { nemia?: { daemon?: unknown } }).nemia?.daemon;
    return typeof named === 'string' ? named : undefined;
  } catch {
    return undefined;
  }
};

/** The first folder at or above `from` whose `package.json` names its daemon, with what it names, or undefined. */
function checkoutAbove(from: string): { checkout: string; daemon: string } | undefined {
  let at: string | undefined = realOf(from);
  while (at !== undefined) {
    const daemon = daemonNamed(at);
    if (daemon !== undefined) return { checkout: at, daemon };
    at = path.dirname(at) === at ? undefined : path.dirname(at);
  }
  return undefined;
}

/** The folder of the nearest `package.json` above `file`: the workspace the daemon's entry belongs to, which it runs in. */
function workspaceOf(file: string, checkout: string): string {
  for (let at = path.dirname(file); at.startsWith(checkout); at = path.dirname(at))
    if (fs.existsSync(path.join(at, 'package.json'))) return at;
  return checkout;
}

/**
 * Where the checkout this package runs from keeps its daemon: the first folder above the package whose `package.json` names it
 * (`"nemia": { "daemon": "<path>" }`), the entry it names, and the folder it runs in. Refused (`Missing`): no such folder, or an entry that
 * is not there.
 */
export function daemonEntry(from: string = PACKAGE): { checkout: string; entry: string; cwd: string } {
  const found = checkoutAbove(from);
  if (found === undefined)
    throw new Missing({
      message: `nemia service: no package.json above ${from} names the daemon to run: add "nemia": { "daemon": "apps/api/src/main.ts" } to the checkout's root package.json.`,
    });
  const entry = path.join(found.checkout, found.daemon);
  if (!fs.existsSync(entry))
    throw new Missing({
      message: `nemia service: ${found.checkout}/package.json names the daemon ${found.daemon}, which is not there: name the api's src/main.ts.`,
    });
  return { checkout: found.checkout, entry, cwd: workspaceOf(entry, found.checkout) };
}

/** The checkout a service's entry is of, as `daemonEntry` finds it, or undefined where it is gone. */
export const checkoutOf = (entry: string): string | undefined => checkoutAbove(path.dirname(entry))?.checkout;

/** Where a service's files go: the user's home, and the folder of its settings (`XDG_CONFIG_HOME`, else `~/.config`). */
export const serviceDirs = (): { home: string; configHome: string } => {
  const home = os.homedir();
  return { home, configHome: process.env.XDG_CONFIG_HOME || path.join(home, '.config') };
};

/** The store the service is of, and the default one: a store not the default is given a service name of its own. */
export const storeRoots = (): { root: string; defaultRoot: string } => ({ root: wfRoot(), defaultRoot: wfRoot({}) });

/** The service's file, or null where it is not installed. */
export const readUnit = (file: string): string | null => textOf(file);

/** Writes the service's file whole, through a hidden file renamed over it, so the system never reads half of it. */
export function writeUnit(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}`);
  fs.writeFileSync(hidden, text);
  fs.renameSync(hidden, file);
}

/** Removes the service's file; answers whether there was one. */
export function removeUnit(file: string): boolean {
  try {
    fs.unlinkSync(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/** Runs one of the system's own programs (`systemctl`, `launchctl`, `loginctl`) and answers what it printed; throws when it fails. */
export const systemCall = (argv: readonly string[]): string => {
  const [command, ...args] = argv;
  if (command === undefined) throw new Error('systemCall runs a program: give it argv with the program first.');
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: CALL_MS });
};

/** Whether `user`'s services outlive their login sessions (`loginctl show-user -p Linger`), or undefined where loginctl cannot say. */
export function lingerOf(user: string): boolean | undefined {
  try {
    const said = /^Linger=(yes|no)$/m.exec(systemCall(['loginctl', 'show-user', user, '-p', 'Linger']))?.[1];
    return said === undefined ? undefined : said === 'yes';
  } catch {
    return undefined;
  }
}

/** The user the services are installed for, by name and id: launchd's domain is `gui/<uid>`. */
export const userOf = (): { name: string; uid: number } => {
  const info = os.userInfo();
  return { name: info.username, uid: info.uid };
};

/**
 * The service files of the folder `dir` holds, by name, with their text: `nemia.service` or `nemia.plist` is `nemia`. None where it is
 * not.
 */
export function unitsOf(dir: string): { name: string; text: string }[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((file) => {
    const name = /^([a-z0-9][a-z0-9-]*)\.(?:service|plist)$/.exec(file)?.[1];
    const text = name === undefined ? null : textOf(path.join(dir, file));
    return name === undefined || text === null ? [] : [{ name, text }];
  });
}

/** How a spawned daemon ended: its exit code or the signal that ended it; an error that kept it from starting is a code of null. */
export type SpawnEnded = { code: number | null; signal: string | null };

/** A daemon spawned on demand: its pid, none where it could not start, and its end, which settles only once it has ended. */
export type Spawned = { pid: number | undefined; ended: Promise<SpawnEnded> };

/**
 * Starts `node entry` in `cwd` with `env` alone, in a session of its own (`detached`), so a closed terminal does not end it, its stdout and
 * stderr appended to `log`, and lets it go: this process ends without waiting for it.
 */
export function spawnDetached(s: { node: string; entry: string; cwd: string; env: Record<string, string>; log: string }): Spawned {
  fs.mkdirSync(path.dirname(s.log), { recursive: true });
  const fd = fs.openSync(s.log, 'a');
  try {
    const child = spawn(s.node, [s.entry], { cwd: s.cwd, env: s.env, detached: true, stdio: ['ignore', fd, fd] });
    const ended = new Promise<SpawnEnded>((resolve) => {
      child.once('error', () => resolve({ code: null, signal: null }));
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child.unref();
    return { pid: child.pid, ended };
  } finally {
    fs.closeSync(fd);
  }
}
