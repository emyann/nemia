/**
 * Starts Astro's dev server on the site at `process.argv[2]`, on a free port, through `dev()` in this process, renders the runtime
 * page once and stops the server, all it logs printed on this process's output. Its last line out is `RESULT ` and the JSON
 * `{ status, drawn }`: the page's HTTP status, and whether its HTML holds the lifecycle's `input-required`. A child of
 * `build.test.ts`, so the dev toolchain's heap and Astro's process-wide handlers stay out of the test's process.
 */
import net from 'node:net';
import { dev } from 'astro';

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
console.log(`RESULT ${JSON.stringify({ status: page.status, drawn: html.includes('input-required') })}`);
process.exit(0);
