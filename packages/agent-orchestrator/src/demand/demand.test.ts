/**
 * The daemon started on demand, judged: the environment a spawned daemon is given, and its lines. What each way the lease stands
 * starts is `demand.verb.test.ts`'s story.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daemonEnv, offLine, otherTookLine, serviceStartedLine, startedLine, unstartedLine } from './demand.ts';

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
