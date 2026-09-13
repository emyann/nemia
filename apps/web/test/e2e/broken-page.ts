/**
 * A page that breaks one of the e2e's rules, put through the code `npm run e2e` puts the app's pages
 * through (visit.ts), in a process that exits as `npm run e2e` does. visit.test.ts runs it.
 *
 *   node test/e2e/broken-page.ts <console-error | failed-request | none> <screenshots directory>
 *
 * `none` breaks nothing, and must pass: otherwise the page itself is what fails, and a refusal of the
 * other two proves nothing about the break.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expectVisible } from './checks.ts';
import { exitOn, launch, visitAll } from './visit.ts';

const BREAKS: Record<string, string> = {
  'console-error': `console.error('the graph did not draw');`,
  // The server drops this one without an answer. Caught, so the only thing wrong is the request.
  'failed-request': `fetch('/api/dropped').catch(() => {});`,
  none: `fetch('/api/answered');`,
};

const [how = '', out] = process.argv.slice(2);
if (!(how in BREAKS) || !out) {
  console.error(`usage: node broken-page.ts <${Object.keys(BREAKS).join(' | ')}> <screenshots directory>`);
  process.exit(2);
}

const TEXT = 'A page for the e2e to look at';

const server = http.createServer((req, res) => {
  if (req.url === '/api/dropped') return void req.socket.destroy();
  if (req.url === '/api/answered') return void res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
  if (req.url !== `/${how}`) return void res.writeHead(204).end();
  // Painted for both themes, so the theme check passes and the break is what is left to fail.
  res.writeHead(200, { 'content-type': 'text/html' }).end(
    `<style>body{background:white}@media (prefers-color-scheme: dark){body{background:#111;color:#eee}}</style><p>${TEXT}</p><script>${BREAKS[how]}</script>`,
  );
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  const page = { name: how, route: `/${how}`, expect: (p: import('playwright').Page) => expectVisible(p.getByText(TEXT), 'the page says what it is') };
  const main = async () => {
    const browser = await launch();
    try {
      await visitAll(browser, `http://127.0.0.1:${port}`, [page], out);
    } finally {
      await browser.close();
    }
  };
  exitOn(main(), () => server.close());
});
