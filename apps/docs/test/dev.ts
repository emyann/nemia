/**
 * Starts Astro's dev server on the site at `process.argv[2]`, on a free port, through `dev()` in this process, renders the runtime
 * page once and stops the server, all it logs printed on this process's output. Its last line out is `RESULT ` and the JSON
 * `{ status, drawn, pid, registered }`: the page's HTTP status, whether its HTML holds the lifecycle's `input-required`, this
 * process's own pid, and the pid the checkout's dev-server record names once the server has stopped, or null where it names none.
 * `registered` is what says the server left no record of itself: a pid another process wrote there, or none, is not this one's. A
 * child of `build.test.ts`, so the dev toolchain's heap and Astro's process-wide handlers stay out of the test's process.
 *
 * It is tied to its parent's stdin: the end of that pipe, when the test kills it or dies, ends it, so no bound of its own is needed.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { dev } from 'astro';

process.stdin.once('end', () => process.exit(1));
process.stdin.resume();
process.stdin.unref();

/** The pid the site's dev-server record names, or null where there is no record or it names none. */
const registeredPid = (root: string): number | null => {
  const file = path.join(root, '.astro', 'dev.json');
  if (!fs.existsSync(file)) return null;
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: unknown };
  return typeof record.pid === 'number' ? record.pid : null;
};

/** A port nothing listens on now: one the system gives a listener on port 0, released before it answers. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port given'))));
    });
  });

const root = process.argv[2];
if (!root) throw new Error('dev.ts: name the site root as the first argument');
const server = await dev({ root, server: { port: await freePort() } });
const page = await fetch(`http://localhost:${server.address.port}/runtime/`);
const html = await page.text();
await server.stop();
console.log(
  `RESULT ${JSON.stringify({ status: page.status, drawn: html.includes('input-required'), pid: process.pid, registered: registeredPid(root) })}`,
);
process.exit(0);
