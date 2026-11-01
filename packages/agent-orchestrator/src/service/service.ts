/**
 * The daemon as a login service — pure: which system a machine starts it with (a systemd user unit, or a launchd agent), the refusals of
 * what a person gives it (a name, an environment), the unit's and the plist's text, read back, and the lines `nemia service status` says.
 * `service.store.ts` reads the machine and writes the file; nothing here reads a disk or runs a program.
 *
 * The service runs the same daemon a person starts by hand: the checkout's api (`nemia.daemon` in its root `package.json`), under the node
 * that ran the install, in the api's folder, with the environment written once. It restarts on failure but a refusal (exit 2), starts at
 * login, and is stopped by SIGTERM, which the api answers by writing `stoppedAt` into the lease. Only its main process is signalled
 * (`KillMode=process`, `AbandonProcessGroup`): the runtime's detached sessions and checks live on through a restart.
 */
import { DAEMON_FILE, holderWords, lastPassWords, type DaemonStanding } from '../daemon/daemon.ts';
import type { Finishing, Paused } from '../pause/pause.ts';

/** What the machine is, as the store reads it: its platform, whether it is WSL, and whether systemd runs as its init. */
export type Machine = { readonly platform: string; readonly wsl: boolean; readonly systemd: boolean };

/** The system that starts the service at login. */
export type ServiceSystem = 'systemd' | 'launchd';

/** The service's default name: the owner's one daemon, on the default store. */
export const DEFAULT_NAME = 'nemia';

/** How systemd is turned on in a WSL distro, said wherever the service is refused for want of it. */
export const WSL_SYSTEMD_WORDS =
  'turn systemd on: add [boot] with systemd=true to /etc/wsl.conf (sudo), then run wsl --shutdown from Windows and open the distro again';

/**
 * The system `machine` starts a service with, or why it has none: Linux with systemd running, or macOS. Refused: WSL without systemd,
 * saying how to turn it on; Linux without it; any other platform. Starting the daemon by hand works on each.
 */
export function systemOf(machine: Machine): { system: ServiceSystem } | { refusal: string } {
  if (machine.platform === 'darwin') return { system: 'launchd' };
  if (machine.platform === 'linux' && machine.systemd) return { system: 'systemd' };
  const byHand = 'Until then, start the daemon by hand: npm start in apps/api, or nemia up.';
  if (machine.platform === 'linux' && machine.wsl)
    return {
      refusal: `nemia service: this WSL distro runs without systemd, so it has no login service to install — ${WSL_SYSTEMD_WORDS}. ${byHand}`,
    };
  if (machine.platform === 'linux')
    return { refusal: `nemia service: this Linux runs without systemd as its init, so there is no user unit to install. ${byHand}` };
  return {
    refusal: `nemia service: ${machine.platform} has no login service nemia installs: systemd on Linux, launchd on macOS. ${byHand}`,
  };
}

/** A name for an environment variable: a letter or `_`, then letters, digits and `_`. */
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A control character: a newline, a carriage return, a tab, a NUL, DEL. */
// oxlint-disable-next-line no-control-regex -- a value holding a control character is refused, so the class must name them
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The keys the install writes itself, from the environment it runs in: the store, and the programs' path. */
export const OWN_KEYS = ['WF_ROOT', 'PATH'] as const;

/** The environment as given on the command line, `KEY=VALUE` each, split at its first `=`; a word with none keeps an empty key's place. */
export const envPairs = (given: readonly string[]): [string, string][] => given.map(envPair);

/** One word of the environment as given, `KEY=VALUE`, split at its first `=`; a word with none is the key, with an empty value. */
function envPair(word: string): [string, string] {
  return word.includes('=') ? [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] : [word, ''];
}

/**
 * Why `--env` cannot be written into a unit, or null: a word with no `=`, a key that is no variable's name, a key given twice or one the
 * install writes itself (`OWN_KEYS`), or a value holding a control character, which would end the unit's line and start another.
 */
export function envRefusal(given: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const word of given) {
    const [key, value] = envPair(word);
    if (!word.includes('=')) return `nemia service install: --env ${word} has no value: give it as --env KEY=VALUE.`;
    if (!ENV_KEY.test(key))
      return `nemia service install: --env ${key} is not a variable's name: a letter or _, then letters, digits and _.`;
    if ((OWN_KEYS as readonly string[]).includes(key))
      return `nemia service install: --env ${key} is written from the environment install runs in: set ${key} on the install's own command line.`;
    if (seen.has(key)) return `nemia service install: --env ${key} is given twice: give each variable once.`;
    if (CONTROL.test(value))
      return `nemia service install: --env ${key}'s value holds a control character (a newline, a tab): a unit takes one line per value, so give it without one.`;
    seen.add(key);
  }
  return null;
}

/**
 * Why `name` cannot name the service of the store `root`, or null. A name is lowercase letters, digits and `-`, starting with a letter or
 * digit; a store that is not the default one (`defaultRoot`) is given a name of its own, never `nemia`, so a trial never writes over the
 * owner's unit.
 */
export function nameRefusal(name: string | undefined, root: string, defaultRoot: string): string | null {
  if (name !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(name))
    return `nemia service: --name ${name} is not a service's name: lowercase letters, digits and -, like nemia-trial.`;
  if (root === defaultRoot) return null;
  if (name === undefined)
    return `nemia service: the store ${root} is not the default one, so its service is given a name of its own: --name <name>, like --name nemia-trial.`;
  if (name === DEFAULT_NAME)
    return `nemia service: the name ${DEFAULT_NAME} is the default store's service, and ${root} is another store: give it --name of its own, like --name nemia-trial.`;
  return null;
}

/**
 * What a service is made of: its `name`, the `node` that runs `entry` in `cwd`, the checkout `entry` is of, and its environment in the
 * order written. `logs` is where launchd writes what the daemon prints; systemd keeps it in its journal.
 */
export type ServiceSpec = {
  readonly name: string;
  readonly node: string;
  readonly entry: string;
  readonly cwd: string;
  readonly checkout: string;
  readonly env: readonly (readonly [string, string])[];
  readonly logs: string;
};

/** Why a path of the spec cannot be written into a unit, or null: one holding a control character, which would end its line. */
export const specRefusal = (spec: Pick<ServiceSpec, 'node' | 'entry' | 'cwd'>): string | null => {
  const bad = (['node', 'entry', 'cwd'] as const).find((k) => CONTROL.test(spec[k]));
  return bad
    ? `nemia service install: the ${bad} path ${JSON.stringify(spec[bad])} holds a control character: move it to a path without one.`
    : null;
};

/** A specifier escaped for any line of a unit: `%` is systemd's, and `%%` is one. */
const percent = (text: string): string => text.replaceAll('%', '%%');

/** A word quoted for a unit's line: `\` and `"` escaped inside double quotes, and `%` as a specifier. */
const quoted = (text: string): string => `"${percent(text.replaceAll('\\', '\\\\').replaceAll('"', '\\"'))}"`;

/** A word of `ExecStart=`, where systemd also expands `$`: `$$` is one. */
const argWord = (text: string): string => quoted(text).replaceAll('$', '$$$$');

/** The unit's description: which store's daemon it runs, and from which checkout. */
const describe = (spec: ServiceSpec, root: string): string => `Nemia daemon of the store ${root}, from the checkout ${spec.checkout}`;

/** The store a spec's environment names. */
const rootOf = (spec: ServiceSpec): string => spec.env.find(([k]) => k === 'WF_ROOT')?.[1] ?? '';

/**
 * The systemd user unit for `spec`: started at login (`default.target`), restarted on failure five seconds on but never after a refusal
 * (exit 2), and a stop by a signal counted as a clean one. A stop signals the main process alone (`KillMode=process`), so the sessions and
 * checks the runtime started detached live on.
 *
 * `TimeoutStopSec` stands above the runtime's own let-go of its attached sessions, so a `systemctl stop` or `restart` of a daemon
 * whose session is in a call that never ends is not killed in the middle of it: the daemon parks each session with the call it cut,
 * says so on its log and releases the lease, instead of leaving the store to be taken over as one gone without a stop. The number is
 * written here and held above the runtime's in `service.test.ts`, which reads the runtime's rather than repeat it.
 */
export const unitText = (spec: ServiceSpec): string =>
  [
    '[Unit]',
    `Description=${percent(describe(spec, rootOf(spec)))}`,
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${percent(spec.cwd)}`,
    `ExecStart=${argWord(spec.node)} ${argWord(spec.entry)}`,
    ...spec.env.map(([k, v]) => `Environment=${quoted(`${k}=${v}`)}`),
    'Restart=on-failure',
    'RestartSec=5',
    'RestartPreventExitStatus=2',
    'SuccessExitStatus=129 130 143',
    'KillMode=process',
    'KillSignal=SIGTERM',
    'TimeoutStopSec=90',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');

/** Text escaped for XML: the five entities. */
const xml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

/** A plist's string. */
const str = (text: string): string => `<string>${xml(text)}</string>`;

/**
 * The launchd agent for `spec`: loaded and started at login (`RunAtLoad`), started again when it exits unsuccessfully, at most every 30
 * seconds, and its process group left alone when it stops (`AbandonProcessGroup`), so the runtime's detached work lives on.
 */
export const plistText = (spec: ServiceSpec): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>${str(spec.name)}`,
    `  <key>ProgramArguments</key><array>${str(spec.node)}${str(spec.entry)}</array>`,
    `  <key>WorkingDirectory</key>${str(spec.cwd)}`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    ...spec.env.map(([k, v]) => `    <key>${xml(k)}</key>${str(v)}`),
    '  </dict>',
    '  <key>RunAtLoad</key><true/>',
    '  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>',
    '  <key>ThrottleInterval</key><integer>30</integer>',
    '  <key>AbandonProcessGroup</key><true/>',
    '  <key>ExitTimeOut</key><integer>90</integer>',
    `  <key>StandardOutPath</key>${str(spec.logs)}`,
    `  <key>StandardErrorPath</key>${str(spec.logs)}`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');

/** The service's file for `system`: a user unit under `configHome` (`~/.config`), or an agent under `home`'s `Library/LaunchAgents`. */
export const unitPathOf = (system: ServiceSystem, name: string, dirs: { home: string; configHome: string }): string =>
  system === 'systemd' ? `${dirs.configHome}/systemd/user/${name}.service` : `${dirs.home}/Library/LaunchAgents/${name}.plist`;

/** The unit's file name as systemd knows it, or the agent's label. */
export const unitName = (system: ServiceSystem, name: string): string => (system === 'systemd' ? `${name}.service` : name);

/** The file launchd writes what the agent `name` prints into, under `home`'s `Library/Logs`. */
export const launchdLogs = (home: string, name: string): string => `${home}/Library/Logs/${name}.log`;

/** How a person reads the service's log: `journalctl --user -u <unit>` for systemd, the file launchd writes for launchd. */
export const logsLine = (system: ServiceSystem, name: string, home: string): string =>
  system === 'systemd' ? `journalctl --user -u ${unitName(system, name)}` : `less ${launchdLogs(home, name)}`;

/** A unit's double-quoted word read back: its escapes undone, `$$` too where it is a word of `ExecStart=`. */
const unquoted = (word: string, exec: boolean): string => {
  const inner = word.replace(/^"|"$/g, '').replaceAll('%%', '%');
  const plain = inner.replace(/\\(["\\])/g, '$1');
  return exec ? plain.replaceAll('$$', '$') : plain;
};

/** The double-quoted words of a unit's line. */
const words = (line: string): string[] => [...line.matchAll(/"(?:[^"\\]|\\.)*"/g)].map((m) => m[0]);

/** What a unit's or a plist's text says it runs: its node, its entry, its folder and its environment, read back as written. */
export type UnitRead = { node?: string; entry?: string; cwd?: string; env: [string, string][] };

/** A unit's text read back (`unitText`): its `ExecStart=`, `WorkingDirectory=` and each `Environment=`, as the values were given. */
export function unitRead(text: string): UnitRead {
  const lines = text.split('\n');
  const value = (key: string) => lines.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
  const [node, entry] = words(value('ExecStart') ?? '').map((w) => unquoted(w, true));
  const cwd = value('WorkingDirectory')?.replaceAll('%%', '%');
  const env = lines
    .filter((l) => l.startsWith('Environment='))
    .flatMap((l) => words(l).map((w) => unquoted(w, false)))
    .map((pair): [string, string] => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]);
  return { node, entry, cwd, env };
}

/** Text unescaped from XML. */
const unxml = (text: string): string =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&');

/** A plist's text read back (`plistText`): its program's two arguments, its folder and its environment. */
export function plistRead(text: string): UnitRead {
  const strings = (block: string) =>
    [...block.matchAll(/<string>([\s\S]*?)<\/string>/g)].flatMap(([, inner]) => (inner === undefined ? [] : [unxml(inner)]));
  const [node, entry] = strings(/<key>ProgramArguments<\/key><array>([\s\S]*?)<\/array>/.exec(text)?.[1] ?? '');
  const cwd = strings(/<key>WorkingDirectory<\/key>(<string>[\s\S]*?<\/string>)/.exec(text)?.[1] ?? '')[0];
  const envBlock = /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(text)?.[1] ?? '';
  const env = [...envBlock.matchAll(/<key>([\s\S]*?)<\/key><string>([\s\S]*?)<\/string>/g)].flatMap(
    ([, key, value]): Array<[string, string]> => (key === undefined || value === undefined ? [] : [[unxml(key), unxml(value)]]),
  );
  return { node, entry, cwd, env };
}

/**
 * What the system says of the service: whether it is active (systemd's active, inactive, failed or activating; launchd's running or not),
 * whether it starts at login (`enabled`), and its main process — none when it does not run.
 */
export type UnitState = { readonly active: string; readonly enabled: string; readonly pid: number | null };

/** `systemctl --user show -p ActiveState,UnitFileState,MainPID` read: `MainPID=0` is no process. */
export function systemdState(text: string): UnitState {
  const value = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
  const pid = Number(value('MainPID'));
  return { active: value('ActiveState') || 'unknown', enabled: value('UnitFileState') || 'unknown', pid: pid > 0 ? pid : null };
}

/** `launchctl print gui/<uid>/<label>` read: its `state` and `pid`; a label it does not know is not loaded. */
export function launchdState(text: string | null): UnitState {
  if (text === null) return { active: 'not loaded', enabled: 'not loaded', pid: null };
  const state = /^\s*state = (.*)$/m.exec(text)?.[1]?.trim() ?? 'unknown';
  const pid = Number(/^\s*pid = (\d+)$/m.exec(text)?.[1]);
  return { active: state, enabled: 'loaded', pid: pid > 0 ? pid : null };
}

/** The service as `nemia service status` reads it: its name, system and file, and, when installed, what it runs and its state. */
export type ServiceRead = {
  readonly name: string;
  readonly system: ServiceSystem;
  readonly file: string;
  readonly unit: (UnitRead & { checkout?: string }) | null;
  readonly state: UnitState | null;
};

/** Who holds the lease beside the service: the service's own process, another daemon, or none ticking. */
export type HolderOf = 'service' | 'other' | 'none';

/** Who of the service and another daemon ticks the store, by the lease and the unit's main process. */
export const holderOfLease = (lease: DaemonStanding, state: UnitState | null): HolderOf => {
  if (lease.kind !== 'ticking') return 'none';
  return state?.pid === lease.file.pid ? 'service' : 'other';
};

/**
 * The landing checks a take-over waits out: each still running under the pause. A landing held staged or a check held unfiled does not
 * run until the resume, so it never holds up the hand-over.
 */
export const landingsOf = (paused: Paused): Finishing[] => paused.finishing.filter((f) => f.kind === 'landing');

/** How to stop the holder that is not the service and hand the store to it. */
export const takeOverLine = (pid: number, name: string): string =>
  `nemia service install${name === DEFAULT_NAME ? '' : ` --name ${name}`} --take-over ${pid}`;

/** The service's own lines: installed or not, its state, what it runs, and from which checkout. */
const unitLines = (read: ServiceRead): string[] => {
  if (read.unit === null)
    return [`service ${read.name} (${read.system}): not installed — no ${read.file}; nemia service install writes it`];
  const state = read.state;
  const running = state ? `${state.active}, ${state.enabled}${state.pid ? `, pid ${state.pid}` : ''}` : 'state unknown';
  return [
    `service ${read.name} (${read.system}): ${running} — ${read.file}`,
    `  runs the checkout at ${read.unit.checkout ?? '(not found)'}: ${read.unit.entry ?? '(no entry)'} with ${read.unit.node ?? '(no node)'}`,
  ];
};

/** The lease's line, and who of the service and another daemon holds it. */
const leaseLines = (lease: DaemonStanding, read: ServiceRead, now: number): string[] => {
  if (lease.kind === 'none') return [`daemon: none has held this store (no ${DAEMON_FILE})`];
  if (lease.kind === 'unreadable') return [`daemon: none known — ${DAEMON_FILE} does not read as a holder`];
  const holder = holderOfLease(lease, read.state);
  if (lease.kind !== 'ticking')
    return [`daemon: none ticking — ${holderWords(lease.file)} is ${lease.kind}; its ${lastPassWords(lease.file, now)}`];
  const head = `daemon: ${holderWords(lease.file)}, ticking — ${lastPassWords(lease.file, now)}`;
  if (holder === 'service') return [head, `  the service's own process holds the store`];
  const by = read.unit === null ? 'started by hand' : `not the service's${read.state?.pid ? ` (its pid is ${read.state.pid})` : ''}`;
  return [head, `  pid ${lease.file.pid} is ${by}: ${takeOverLine(lease.file.pid, read.name)} hands the store to the service`];
};

/** Whether the user's services outlive their login sessions, in words: lingering on or off, and what off means. */
const lingerLine = (linger: boolean | undefined, system: ServiceSystem, user: string): string[] => {
  if (system !== 'systemd') return [];
  if (linger === undefined) return ['lingering: unknown — loginctl did not say'];
  return linger
    ? ['lingering: on — the service starts at boot and runs without a login session']
    : [`lingering: off — the service starts at login and stops at the last logout; loginctl enable-linger ${user} keeps it running`];
};

/** `nemia service status`'s lines: the service, the lease and who holds it, and lingering, each named. */
export const statusLines = (
  read: ServiceRead,
  lease: DaemonStanding,
  linger: boolean | undefined,
  { now, user }: { now: number; user: string },
): string[] => [...unitLines(read), ...leaseLines(lease, read, now), ...lingerLine(linger, read.system, user)];
