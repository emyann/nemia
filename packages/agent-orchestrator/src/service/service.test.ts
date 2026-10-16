/**
 * The login service's pure part: the system a machine has, the refusals of a name and an environment, the unit's and the plist's text and
 * their reading back, the system's state read, and `nemia service status`'s lines. Nothing here writes a file or runs a program.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LET_GO_MS } from 'agent-runtime';
import type { DaemonStanding } from '../daemon/daemon.ts';
import {
  envRefusal,
  landingsOf,
  launchdState,
  nameRefusal,
  plistRead,
  plistText,
  specRefusal,
  statusLines,
  systemdState,
  systemOf,
  unitPathOf,
  unitRead,
  unitText,
  type ServiceRead,
  type ServiceSpec,
} from './service.ts';

const SPEC: ServiceSpec = {
  name: 'nemia',
  node: '/srv/ann/.nvm/versions/node/v24.20.0/bin/node',
  entry: '/srv/ann/nemia/apps/api/src/main.ts',
  cwd: '/srv/ann/nemia/apps/api',
  checkout: '/srv/ann/nemia',
  env: [
    ['WF_ROOT', '/srv/ann/.agent-workflows'],
    ['PATH', '/srv/ann/.nvm/versions/node/v24.20.0/bin:/usr/bin'],
    ['PORT', '8787'],
  ],
  logs: '/srv/ann/Library/Logs/nemia.log',
};

/** A lease held by `pid`, ticking unless said, written by the api. */
const lease = (pid: number, kind: 'ticking' | 'stopped' | 'gone' = 'ticking'): DaemonStanding => ({
  kind,
  file: { pid, by: 'api', url: 'http://127.0.0.1:8787', startedAt: new Date(0).toISOString(), cwd: '/', every: 4000, passedAt: null },
  last: 0,
  quiet: 0,
  identity: 'same',
});

test('the unit is written whole: the daemon under the installer’s node, its store and PATH, restarted on failure, started at login', () => {
  assert.equal(
    unitText(SPEC),
    [
      '[Unit]',
      'Description=Nemia daemon of the store /srv/ann/.agent-workflows, from the checkout /srv/ann/nemia',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'WorkingDirectory=/srv/ann/nemia/apps/api',
      'ExecStart="/srv/ann/.nvm/versions/node/v24.20.0/bin/node" "/srv/ann/nemia/apps/api/src/main.ts"',
      'Environment="WF_ROOT=/srv/ann/.agent-workflows"',
      'Environment="PATH=/srv/ann/.nvm/versions/node/v24.20.0/bin:/usr/bin"',
      'Environment="PORT=8787"',
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
    ].join('\n'),
  );
});

test('the unit and the plist each wait longer for a stop than the runtime takes to let its attached sessions go', () => {
  const waits: [string, number][] = [
    ['TimeoutStopSec', Number(/^TimeoutStopSec=(\d+)$/m.exec(unitText(SPEC))![1])],
    ['ExitTimeOut', Number(/<key>ExitTimeOut<\/key><integer>(\d+)<\/integer>/.exec(plistText(SPEC))![1])],
  ];
  for (const [key, seconds] of waits) {
    assert.ok(
      seconds * 1_000 > LET_GO_MS,
      `${key} is ${seconds} s and the runtime's let-go takes up to ${LET_GO_MS} ms: the daemon would be killed before it parks its ` +
        `sessions, so raise ${key} or lower LET_GO_MS`,
    );
    assert.ok(seconds * 1_000 - LET_GO_MS >= 15_000, `and ${key} leaves room over it for the park, the aborts and the lease`);
  }
});

test('REFUSED to kill the runs in flight: a stop or a restart signals the daemon’s main process alone (KillMode=process)', () => {
  const lines = unitText(SPEC).split('\n');
  assert.ok(lines.includes('KillMode=process'), 'without KillMode=process a restart kills every detached session and check in the cgroup');
  assert.equal(lines.filter((l) => l.startsWith('KillMode=')).length, 1);
  assert.match(plistText(SPEC), /<key>AbandonProcessGroup<\/key><true\/>/);
});

test('the plist is written whole: started at load, again on an unsuccessful exit, its process group left alone', () => {
  assert.equal(
    plistText(SPEC),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '  <key>Label</key><string>nemia</string>',
      '  <key>ProgramArguments</key><array><string>/srv/ann/.nvm/versions/node/v24.20.0/bin/node</string><string>/srv/ann/nemia/apps/api/src/main.ts</string></array>',
      '  <key>WorkingDirectory</key><string>/srv/ann/nemia/apps/api</string>',
      '  <key>EnvironmentVariables</key>',
      '  <dict>',
      '    <key>WF_ROOT</key><string>/srv/ann/.agent-workflows</string>',
      '    <key>PATH</key><string>/srv/ann/.nvm/versions/node/v24.20.0/bin:/usr/bin</string>',
      '    <key>PORT</key><string>8787</string>',
      '  </dict>',
      '  <key>RunAtLoad</key><true/>',
      '  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>',
      '  <key>ThrottleInterval</key><integer>30</integer>',
      '  <key>AbandonProcessGroup</key><true/>',
      '  <key>ExitTimeOut</key><integer>90</integer>',
      '  <key>StandardOutPath</key><string>/srv/ann/Library/Logs/nemia.log</string>',
      '  <key>StandardErrorPath</key><string>/srv/ann/Library/Logs/nemia.log</string>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n'),
  );
});

test('a value systemd would expand or end is escaped, and reads back as given: $, %, quotes, backslashes and spaces', () => {
  const odd = {
    ...SPEC,
    node: '/opt/my node$HOME/100%/bin/node',
    entry: '/srv/a "b" \\c/main.ts',
    cwd: '/srv/50% off/api',
    env: [...SPEC.env, ['TOKEN', 'a$b $$c %d "e" \\f g']] as const,
  };
  const text = unitText(odd);
  assert.ok(text.includes('ExecStart="/opt/my node$$HOME/100%%/bin/node" "/srv/a \\"b\\" \\\\c/main.ts"'), text);
  assert.ok(text.includes('Environment="TOKEN=a$b $$c %%d \\"e\\" \\\\f g"'), text);
  assert.ok(text.includes('WorkingDirectory=/srv/50%% off/api'), text);
  assert.deepEqual(unitRead(text), { node: odd.node, entry: odd.entry, cwd: odd.cwd, env: odd.env.map(([k, v]) => [k, v]) });
});

test('a plist’s values are XML-escaped and read back as given', () => {
  const odd = { ...SPEC, entry: '/srv/<a> & "b" \'c\'/main.ts', env: [['NOTE', 'x < y & z > "w"']] as const };
  const text = plistText(odd);
  assert.ok(!text.includes('<a>'));
  assert.deepEqual(plistRead(text), { node: odd.node, entry: odd.entry, cwd: odd.cwd, env: [['NOTE', 'x < y & z > "w"']] });
});

test('REFUSED: an --env with no value, no variable’s name, one install writes itself, one given twice, or a control character', () => {
  assert.equal(envRefusal(['PORT=8790', 'OTEL_SERVICE_NAME=nemia-trial', 'EMPTY=']), null);
  assert.match(envRefusal(['PORT'])!, /--env PORT has no value: give it as --env KEY=VALUE/);
  assert.match(envRefusal(['1PORT=1'])!, /--env 1PORT is not a variable's name/);
  assert.match(envRefusal(['A-B=1'])!, /--env A-B is not a variable's name/);
  assert.match(envRefusal(['WF_ROOT=/tmp/x'])!, /--env WF_ROOT is written from the environment install runs in/);
  assert.match(envRefusal(['PATH=/bin'])!, /--env PATH is written from the environment install runs in/);
  assert.match(envRefusal(['PORT=1', 'PORT=2'])!, /--env PORT is given twice/);
  assert.match(envRefusal([`X=a${String.fromCharCode(10)}ExecStart=/bin/sh`])!, /--env X's value holds a control character/);
  assert.match(envRefusal([`X=a${String.fromCharCode(127)}`])!, /--env X's value holds a control character/);
  assert.match(specRefusal({ ...SPEC, cwd: `/srv/a${String.fromCharCode(10)}b` })!, /the cwd path .* holds a control character/);
});

test('REFUSED: a store that is not the default without a name of its own, the default’s name for it, or a name that is no unit’s', () => {
  assert.equal(nameRefusal(undefined, '/srv/ann/.agent-workflows', '/srv/ann/.agent-workflows'), null);
  assert.equal(nameRefusal('nemia-trial', '/srv/trial', '/srv/ann/.agent-workflows'), null);
  assert.match(nameRefusal(undefined, '/srv/trial', '/srv/ann/.agent-workflows')!, /is not the default one.*--name <name>/);
  assert.match(nameRefusal('nemia', '/srv/trial', '/srv/ann/.agent-workflows')!, /the name nemia is the default store's service/);
  assert.match(nameRefusal('Nemia Trial', '/srv/ann/.agent-workflows', '/srv/ann/.agent-workflows')!, /is not a service's name/);
  assert.match(nameRefusal('../evil', '/srv/ann/.agent-workflows', '/srv/ann/.agent-workflows')!, /is not a service's name/);
});

test('REFUSED: WSL without systemd names how to turn it on; Linux with systemd and macOS each have their system', () => {
  const wsl = systemOf({ platform: 'linux', wsl: true, systemd: false });
  assert.ok('refusal' in wsl);
  for (const word of ['/etc/wsl.conf', '[boot]', 'systemd=true', 'wsl --shutdown', 'npm start in apps/api'])
    assert.ok(wsl.refusal.includes(word), word);
  assert.deepEqual(systemOf({ platform: 'linux', wsl: true, systemd: true }), { system: 'systemd' });
  assert.deepEqual(systemOf({ platform: 'linux', wsl: false, systemd: true }), { system: 'systemd' });
  assert.deepEqual(systemOf({ platform: 'darwin', wsl: false, systemd: false }), { system: 'launchd' });
  const bare = systemOf({ platform: 'linux', wsl: false, systemd: false });
  assert.ok('refusal' in bare && !bare.refusal.includes('wsl.conf'));
  assert.ok('refusal' in systemOf({ platform: 'win32', wsl: false, systemd: false }));
});

test('the service’s file: a user unit under the config folder, an agent under LaunchAgents', () => {
  const dirs = { home: '/srv/ann', configHome: '/srv/ann/.config' };
  assert.equal(unitPathOf('systemd', 'nemia-trial', dirs), '/srv/ann/.config/systemd/user/nemia-trial.service');
  assert.equal(unitPathOf('launchd', 'nemia', dirs), '/srv/ann/Library/LaunchAgents/nemia.plist');
});

test('the system’s state is read: systemd’s show, launchd’s print, and a label launchd does not know', () => {
  assert.deepEqual(systemdState('ActiveState=active\nUnitFileState=enabled\nMainPID=4242\n'), {
    active: 'active',
    enabled: 'enabled',
    pid: 4242,
  });
  assert.deepEqual(systemdState('ActiveState=inactive\nUnitFileState=enabled\nMainPID=0\n'), {
    active: 'inactive',
    enabled: 'enabled',
    pid: null,
  });
  assert.deepEqual(launchdState('gui/501/nemia = {\n\tstate = running\n\tpid = 777\n}'), {
    active: 'running',
    enabled: 'loaded',
    pid: 777,
  });
  assert.deepEqual(launchdState(null), { active: 'not loaded', enabled: 'not loaded', pid: null });
});

test('a take-over waits for the landing checks that run; a landing held staged, or a check held, does not hold it up', () => {
  const paused = {
    pause: { at: '', by: 'ann' },
    finishing: [
      { run: 'r1', step: 'build', kind: 'session' as const },
      { run: 'r2', step: 'test', kind: 'check' as const },
      { run: 'r3', step: 'ship', kind: 'landing' as const },
    ],
    staged: [{ run: 'r4', step: 'ship', repo: '/srv/repo' }],
    held: [{ run: 'r5', step: 'ship' }],
  };
  assert.deepEqual(landingsOf(paused), [{ run: 'r3', step: 'ship', kind: 'landing' }]);
  assert.deepEqual(landingsOf({ ...paused, finishing: paused.finishing.slice(0, 2) }), []);
});

const READ: ServiceRead = {
  name: 'nemia',
  system: 'systemd',
  file: '/srv/ann/.config/systemd/user/nemia.service',
  unit: { node: SPEC.node, entry: SPEC.entry, cwd: SPEC.cwd, env: [], checkout: SPEC.checkout },
  state: { active: 'active', enabled: 'enabled', pid: 4242 },
};

test('status names the unit, the checkout it runs, that its own process holds the store, and lingering', () => {
  const lines = statusLines(READ, lease(4242), true, { now: 0, user: 'ann' });
  assert.match(lines[0], /^service nemia \(systemd\): active, enabled, pid 4242 — \/srv\/ann\/\.config\/systemd\/user\/nemia\.service$/);
  assert.match(lines[1], /runs the checkout at \/srv\/ann\/nemia: .*main\.ts with .*node$/);
  assert.match(lines[2], /^daemon: the api of pid 4242 at http:\/\/127\.0\.0\.1:8787, ticking/);
  assert.match(lines[3], /the service's own process holds the store/);
  assert.match(lines[4], /^lingering: on/);
});

test('status beside a hand daemon names its pid and the take-over line; uninstalled says how to install; lingering off says the fix', () => {
  const beside = statusLines({ ...READ, state: { active: 'inactive', enabled: 'enabled', pid: null } }, lease(999), false, {
    now: 0,
    user: 'ann',
  });
  assert.ok(
    beside.some((l) => /pid 999 is not the service's: nemia service install --take-over 999 hands the store/.test(l)),
    beside.join('\n'),
  );
  assert.ok(beside.some((l) => /lingering: off .* loginctl enable-linger ann/.test(l)));
  const none = statusLines({ ...READ, name: 'nemia-trial', unit: null, state: null }, lease(999), undefined, { now: 0, user: 'ann' });
  assert.match(none[0], /not installed .* nemia service install writes it/);
  assert.ok(
    none.some((l) => /pid 999 is started by hand: nemia service install --name nemia-trial --take-over 999/.test(l)),
    none.join('\n'),
  );
  const stopped = statusLines(READ, lease(4242, 'stopped'), true, { now: 0, user: 'ann' });
  assert.match(stopped[2], /^daemon: none ticking/);
});
