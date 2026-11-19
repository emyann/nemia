/**
 * `node tools/observe/render/reap.ts <name> <seconds>` — the reaper of a held stack, started detached by `--hold`.
 *
 * Waits on the container `name` (`docker wait`) beside a bound counted on a monotonic clock. When the bound ends, or on a signal, it
 * removes the container by that name; when the container ends first, stopped by `--stop` or dead, it removes nothing more. Either
 * way it lets the machine's render slot go, only if the slot is still that container's.
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { release } from './lock.ts';
import { NAME, remove } from './stack.ts';

const [name = '', bound = ''] = process.argv.slice(2);
if (!NAME.test(name) || !/^\d+$/.test(bound)) {
  process.stderr.write('reap: usage: reap.ts <nemia-render-…> <seconds>; it is started by render.ts --hold\n');
  process.exit(2);
}

const began = performance.now();
const waiting = spawn('docker', ['wait', name], { stdio: 'ignore' });
let ended = false;

/** End once: remove the container when `gone` does not say it already is, stop waiting, and let the slot go. */
function end(gone: boolean): void {
  if (ended) return;
  ended = true;
  if (!gone) remove(name);
  waiting.kill();
  release(name);
  process.exit(0);
}

waiting.on('exit', (code) => end(code === 0));
waiting.on('error', () => end(false));
setInterval(() => (performance.now() - began >= Number(bound) * 1000 ? end(false) : undefined), 200);
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => end(false));
