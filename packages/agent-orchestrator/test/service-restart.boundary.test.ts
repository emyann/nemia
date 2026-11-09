/**
 * `nemia service restart` against a stub `systemctl`, run by the live host's own `systemCall`: a shell script first on `PATH` that keeps
 * the unit's state in a scratch file, as systemd does for a unit of `KillMode=process` whose daemon lets the store's lease go some reads
 * before its process exits. A start asked while the unit is still active is answered at once and changes nothing (`start no-op`), as
 * systemd answers it; the old process then exits and the unit reads inactive, with no process. The lease is the test's, read off the
 * stub's state: ticking for the old pid until the signal, stopped right after it (as the daemon's `releaseStore` writes it before its
 * exit), and ticking for the new pid once the unit runs one. The pause is the store's own, on a scratch `WF_ROOT`.
 *
 * The stub runs as a real process, so the file is a boundary test. The scratch-unit repro on a real systemd user manager is a by-hand
 * measure, written in the change's closeout and never in the suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import type { DaemonStanding } from '../src/daemon/daemon.ts';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';

const ROOT = scratch('wf-service-restart-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const HOME = path.join(ROOT, 'home');
const BIN = path.join(ROOT, 'bin');
const UNIT = path.join(ROOT, 'unit');
fs.mkdirSync(path.join(HOME, '.config', 'systemd', 'user'), { recursive: true });
fs.writeFileSync(path.join(HOME, '.config', 'systemd', 'user', 'nemia.service'), '[Service]\nExecStart=/bin/true\n');
fs.mkdirSync(BIN, { recursive: true });
fs.mkdirSync(UNIT, { recursive: true });
process.env.SYSTEMCTL_STUB = UNIT;
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH ?? ''}`;

const { liveHost } = await import('../src/service/service.verb.ts');
const { restartService } = await import('../src/service/restart.verb.ts');
const { readPause, resumePause } = await import('../src/pause/pause.store.ts');
const { engineOf, runWith: runEngine } = await import('../src/runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);

const OLD = 4242;
const NEW = 5151;

/**
 * The stub: `show` answers the unit's state, and after the signal (`SIGNALLED=1`) keeps answering the old process for `LINGER` more
 * reads before it reads inactive with no process; `start` of an active unit changes nothing, and of an inactive one runs `NEW`, leaves
 * it inactive (`START=none`), or fails as systemd does (`START=fail`). Each call is a line of `log`.
 */
const STUB = `#!/bin/sh
dir="$SYSTEMCTL_STUB"
. "$dir/state"
case "$2" in
  show)
    if [ "$ACTIVE" = active ] && [ "$SIGNALLED" = 1 ]; then
      if [ "$LINGER" -gt 0 ]; then LINGER=$((LINGER - 1)); else ACTIVE=inactive; PID=0; SIGNALLED=0; fi
    fi
    echo "show $ACTIVE $PID" >> "$dir/log"
    printf 'ActiveState=%s\\nUnitFileState=enabled\\nMainPID=%s\\n' "$ACTIVE" "$PID"
    ;;
  start)
    if [ "$START" = fail ]; then echo "start failed" >> "$dir/log"; echo "Job for $3 failed." >&2; exit 1; fi
    if [ "$ACTIVE" = active ]; then echo "start no-op" >> "$dir/log"
    elif [ "$START" = none ]; then echo "start nothing" >> "$dir/log"
    else ACTIVE=active; PID=${NEW}; echo "start" >> "$dir/log"; fi
    ;;
  *) echo "$*" >> "$dir/log" ;;
esac
printf 'ACTIVE=%s\\nPID=%s\\nSIGNALLED=%s\\nLINGER=%s\\nSTART=%s\\n' "$ACTIVE" "$PID" "$SIGNALLED" "$LINGER" "$START" > "$dir/state"
`;
fs.writeFileSync(path.join(BIN, 'systemctl'), STUB, { mode: 0o755 });

/** The unit as the stub keeps it. */
type Unit = { ACTIVE: string; PID: string; SIGNALLED: string; LINGER: string; START: string };

const unitNow = (): Unit =>
  Object.fromEntries(
    fs
      .readFileSync(path.join(UNIT, 'state'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  ) as Unit;

const unitSet = (unit: Partial<Unit>): void => {
  const next = { ...unitNow(), ...unit };
  fs.writeFileSync(
    path.join(UNIT, 'state'),
    Object.entries(next)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
  );
};

const stubLog = (): string[] => fs.readFileSync(path.join(UNIT, 'log'), 'utf8').split('\n').filter(Boolean);

/** A lease written by the api of `pid`, standing as `kind`, with a pass completed when `passed`. */
const lease = (pid: number, kind: 'ticking' | 'stopped', passed = false): DaemonStanding => ({
  kind,
  file: {
    pid,
    by: 'api',
    url: 'http://127.0.0.1:8790',
    startedAt: new Date().toISOString(),
    cwd: '/',
    every: 4000,
    passedAt: passed ? new Date().toISOString() : null,
  },
  last: Date.now(),
  quiet: 0,
  identity: 'same',
});

/**
 * The live host, its `systemctl` the stub's, over a scratch home, with the lease read off the stub's state: the old pid ticking until
 * the signal, then stopped; the new pid ticking, unpassed on its first read and passed after, once the unit runs it.
 */
function hostOf(start: string, linger: number) {
  fs.writeFileSync(path.join(UNIT, 'state'), `ACTIVE=active\nPID=${OLD}\nSIGNALLED=0\nLINGER=${linger}\nSTART=${start}\n`);
  fs.writeFileSync(path.join(UNIT, 'log'), '');
  let signalled = false;
  let newReads = 0;
  return {
    ...liveHost(),
    machine: () => ({ platform: 'linux', wsl: false, systemd: true }),
    dirs: () => ({ home: HOME, configHome: path.join(HOME, '.config') }),
    roots: () => ({ root: ROOT, defaultRoot: ROOT }),
    lease: (): DaemonStanding => {
      if (unitNow().PID === String(NEW)) return lease(NEW, 'ticking', newReads++ > 0);
      return lease(OLD, signalled ? 'stopped' : 'ticking');
    },
    signal: (pid: number) => {
      assert.equal(pid, OLD);
      signalled = true;
      unitSet({ SIGNALLED: '1' });
    },
    calls: () => Effect.succeed([]),
    drain: () => Effect.void,
    say: () => undefined,
    pollMs: 1,
    waitMs: 300,
    stopMs: 5_000,
  };
}

const restart = (host: ReturnType<typeof hostOf>) => runWith(engineOf(engine().layer), restartService({}, host));

/** Refused as a `Conflict` that exits 2, its message as `check` says. */
const conflict = (check: (message: string) => boolean) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === 'Conflict' && err.exitCode === 2 && check(err.message);

test('nemia service restart on a stub systemctl: the unit started once it has ended the old daemon, or a refusal that says so', async (t) => {
  await t.test("the systemctl the live host runs is the stub, never the machine's own", () => {
    assert.equal(execFileSync('sh', ['-c', 'command -v systemctl'], { encoding: 'utf8' }).trim(), path.join(BIN, 'systemctl'));
  });

  await t.test(
    'a daemon that lets the store go before it exits: the start waits for the unit to end it, and the new daemon ticks',
    async () => {
      const done = await restart(hostOf('run', 3));
      assert.equal(done.did, 'restarted');
      assert.equal(done.pid, NEW);
      const log = stubLog();
      assert.ok(!log.includes('start no-op'), log.join('\n'));
      assert.ok(log.indexOf('start') > log.lastIndexOf(`show active ${OLD}`), log.join('\n'));
      assert.equal(readPause(), null, "the first pass lifted the restart's pause");
    },
  );

  await t.test('a start that leaves the unit with no process: Conflict naming the start command, never "was started"', async () => {
    await assert.rejects(
      restart(hostOf('none', 0)),
      conflict((m) => /systemctl --user start nemia\.service/.test(m) && !/was started/.test(m)),
    );
    assert.ok(stubLog().includes('start nothing'));
    assert.match(readPause()?.by ?? '', /nemia service restart/, "the restart's pause stands");
    resumePause();
  });

  await t.test("a start systemd refuses: Conflict carrying systemd's line and the start command", async () => {
    await assert.rejects(
      restart(hostOf('fail', 0)),
      conflict((m) => /Job for nemia\.service failed\./.test(m) && /systemctl --user start nemia\.service/.test(m)),
    );
    resumePause();
  });
});
