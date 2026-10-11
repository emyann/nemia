/**
 * The daemon started on demand, judged: the plan for each way the lease stands, the switch and an installed service; the environment a
 * spawned daemon is given; and its lines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DaemonStanding } from '../daemon/daemon.ts';
import { DEMAND_OFF, daemonEnv, demandPlan, offLine, otherTookLine, serviceStartedLine, startedLine, unstartedLine } from './demand.ts';

/** A lease of pid 4242 standing as `kind`. */
const standing = (kind: 'ticking' | 'stalled' | 'gone' | 'stopped'): DaemonStanding => ({
  kind,
  file: { pid: 4242, by: 'api', startedAt: '2026-10-06T08:00:00.000Z', cwd: '/', every: 4000, passedAt: null },
  last: 0,
  quiet: 0,
  identity: 'same',
});

const NO_SERVICE = () => false;

test('a daemon ticking is left alone, and the service is not even looked for', () => {
  assert.deepEqual(
    demandPlan(standing('ticking'), () => assert.fail('looked for a service beside a ticking daemon'), {}),
    { kind: 'ticking' },
  );
});

test('a lease stalled, gone, stopped, unreadable or absent is no holder: a daemon is started', () => {
  const free: DaemonStanding[] = [
    { kind: 'none' },
    { kind: 'unreadable', text: '{' },
    standing('stalled'),
    standing('gone'),
    standing('stopped'),
  ];
  for (const lease of free) assert.deepEqual(demandPlan(lease, NO_SERVICE, {}), { kind: 'spawn' }, lease.kind);
});

test('NEMIA_DAEMON_START=off starts nothing; an installed service is started before a daemon of another kind', () => {
  assert.deepEqual(demandPlan({ kind: 'none' }, NO_SERVICE, { [DEMAND_OFF]: 'off' }), { kind: 'off' });
  assert.deepEqual(
    demandPlan({ kind: 'none' }, () => true, { [DEMAND_OFF]: 'off' }),
    { kind: 'off' },
  );
  assert.deepEqual(
    demandPlan({ kind: 'none' }, () => true, {}),
    { kind: 'service' },
  );
  assert.deepEqual(demandPlan({ kind: 'none' }, NO_SERVICE, { [DEMAND_OFF]: 'on' }), { kind: 'spawn' });
});

test("the daemon's environment is the service's and the login's: nothing else of the command's shell", () => {
  const shell = {
    HOME: '/srv/ann',
    USER: 'ann',
    LOGNAME: 'ann',
    SHELL: '/bin/bash',
    LANG: 'C.UTF-8',
    XDG_RUNTIME_DIR: '/run/user/1000',
    WF_ROOT: '/elsewhere',
    PATH: '/shell/bin',
    HKB_REPO: '/repo',
    WF_MAX_CONCURRENT: '50',
    NEMIA_ON_INSTALLED: '1',
    NEMIA_DAEMON_START: 'on',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9',
    OTEL_SERVICE_NAME: 'probe',
  };
  assert.deepEqual(daemonEnv(shell, '/store', '/usr/bin:/bin'), {
    HOME: '/srv/ann',
    USER: 'ann',
    LOGNAME: 'ann',
    SHELL: '/bin/bash',
    XDG_RUNTIME_DIR: '/run/user/1000',
    LANG: 'C.UTF-8',
    WF_ROOT: '/store',
    PATH: '/usr/bin:/bin',
  });
  assert.deepEqual(daemonEnv({}, '/store', '/bin'), { WF_ROOT: '/store', PATH: '/bin' });
});

test('the lines name the pid, where it logs, how to stop it, and where the settings it lacks come from', () => {
  const started = startedLine({ pid: 77, entry: '/srv/nemia/apps/api/src/main.ts', root: '/store', log: '/store/daemon.log' });
  for (const said of [
    'pid 77',
    '/store/daemon.log',
    'kill 77',
    'nemia service install --take-over 77',
    'PORT',
    'WF_MAX_CONCURRENT',
    '--env',
  ])
    assert.ok(started.includes(said), `${said}: ${started}`);
  const systemd = { system: 'systemd', name: 'nemia', unit: 'nemia.service', home: '/srv/ann', uid: 1000 } as const;
  assert.match(
    serviceStartedLine({ ...systemd, root: '/store', pid: 9 }),
    /journalctl --user -u nemia\.service; stop it with systemctl --user stop nemia\.service/,
  );
  const launchd = { system: 'launchd', name: 'nemia', unit: 'nemia', home: '/Users/ann', uid: 501 } as const;
  assert.match(
    serviceStartedLine({ ...launchd, root: '/store', pid: 9 }),
    /\/Users\/ann\/Library\/Logs\/nemia\.log; stop it with launchctl bootout gui\/501\/nemia/,
  );
  assert.match(offLine('/store'), /nothing ticks \/store, and NEMIA_DAEMON_START=off here, so this command starts no daemon/);
  const ended = unstartedLine({
    what: 'a daemon (pid 77)',
    root: '/store',
    log: '/store/daemon.log',
    why: { kind: 'ended', code: 2, signal: null },
  });
  assert.match(ended, /it ended \(exit 2\) before it took the store: read \/store\/daemon\.log\. The command went on/);
  assert.match(
    unstartedLine({ what: 'a daemon', root: '/store', log: '/l', why: { kind: 'silent', waitedMs: 60_000 } }),
    /it has not taken the store after 60s/,
  );
  assert.match(
    otherTookLine({ pid: 77, holder: 88, root: '/store', log: '/l' }),
    /another daemon, pid 88, took \/store while this command started pid 77/,
  );
});
