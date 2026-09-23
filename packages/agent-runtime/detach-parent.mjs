// The "engine": spawn the worker detached, then exit at once.
import { spawn } from 'node:child_process';
const [cwd, statusFile] = process.argv.slice(2);
const child = spawn(process.execPath, ['./detach-worker.mjs', cwd, statusFile], {
  detached: true, stdio: 'ignore', cwd: process.cwd(),
});
child.unref();
console.log(`parent spawned worker pid ${child.pid}, exiting now`);
process.exit(0);
