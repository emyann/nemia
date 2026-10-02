/**
 * The probe, loaded with `--import` by a package's `test` script: `node --test` loads it in each test file's process and not in its own
 * runner. When the process ends, it leaves the reporter one fragment: the file it ran, the runner that started it (`process.ppid`, the
 * reporter's own pid), its wall time, its peak resident memory
 * (`process.resourceUsage().maxRSS`, in kilobytes on Linux and macOS alike), its CPU time and what writing the fragment cost. It does
 * nothing without `WF_ARTIFACTS`, which only a run's check is given, writes nothing to stdout, where the runner reads its protocol, and
 * swallows every error: a recording never fails a check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fragmentsDir, type Fragment } from './costs.ts';
import { packageOf } from './store.ts';

/** Writes this process's fragment under the check's files directory `artifacts`, or nothing when it cannot. */
function leaveFragment(artifacts: string): void {
  const started = performance.now();
  try {
    const usage = process.resourceUsage();
    const dir = fragmentsDir(artifacts, packageOf(process.cwd()));
    fs.mkdirSync(dir, { recursive: true });
    const fragment: Fragment = {
      file: path.resolve(process.argv[1] ?? ''),
      runner: process.ppid,
      wallMs: process.uptime() * 1000,
      maxRssKb: usage.maxRSS,
      cpuMs: (usage.userCPUTime + usage.systemCPUTime) / 1000,
      probeMs: 0,
    };
    fragment.probeMs = performance.now() - started;
    fs.writeFileSync(path.join(dir, `${process.pid}.json`), JSON.stringify(fragment));
  } catch (_error) {
    return;
  }
}

const artifacts = process.env.WF_ARTIFACTS;
if (artifacts) process.on('exit', () => leaveFragment(artifacts));
