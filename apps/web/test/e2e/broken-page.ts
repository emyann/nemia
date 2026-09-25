/**
 * A page that breaks one of the e2e's rules, put through the code `npm run e2e` puts the app's pages
 * through (visit.ts), in a process that exits as `npm run e2e` does. visit.test.ts runs it.
 *
 *   node test/e2e/broken-page.ts <console-error | failed-request | covered | store-removed | store-swept | none> <screenshots directory>
 *
 * `none` breaks nothing, and must pass: otherwise the page itself is what fails, and a refusal of the
 * other two proves nothing about the break. The two `store-` breaks break no page: they remove the store the visit is handed, as a
 * sweep of /tmp removed the e2e's own, while the page looks (`store-removed`, which then fails on what the store held) or at its end
 * (`store-swept`, which passes).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { expectVisible } from './checks.ts';
import { exitOn, launch, visitAll } from './visit.ts';

const BREAKS: Record<string, string> = {
  'console-error': `console.error('the graph did not draw');`,
  // The server drops this one without an answer. Caught, so the only thing wrong is the request.
  'failed-request': `fetch('/api/dropped').catch(() => {});`,
  // A header over the button the page presses, as the Factory's quota line once lay over a card: Playwright tries the click until its timeout.
  covered: `document.body.insertAdjacentHTML('beforeend', '<div data-cover style="position:fixed;inset:0"><span>resets 23:16</span></div>');`,
  none: `fetch('/api/answered');`,
  'store-removed': `fetch('/api/answered');`,
  'store-swept': `fetch('/api/answered');`,
};

const [how = '', out] = process.argv.slice(2);
if (!(how in BREAKS) || !out) {
  console.error(`usage: node broken-page.ts <${Object.keys(BREAKS).join(' | ')}> <screenshots directory>`);
  process.exit(2);
}

const TEXT = 'A page for the e2e to look at';
const PRESS = 'Press';
/** How long a press waits on a button it cannot reach, the page's own: the e2e's pages wait on Playwright's thirty seconds. */
const PRESS_MS = 2_000;

const server = http.createServer((req, res) => {
  if (req.url === '/api/dropped') return void req.socket.destroy();
  if (req.url === '/api/answered') return void res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
  if (req.url !== `/${how}`) return void res.writeHead(204).end();
  // Painted for both themes, so the theme check passes and the break is what is left to fail.
  res.writeHead(200, { 'content-type': 'text/html' }).end(
    `<style>body{background:white}@media (prefers-color-scheme: dark){body{background:#111;color:#eee}}</style><p>${TEXT}</p><button>${PRESS}</button><script>${BREAKS[how]}</script>`,
  );
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  // In the screenshots directory, so a store the page did not remove is a leftover the test's scratch root takes.
  const store = how.startsWith('store-') ? path.join(out, 'store') : undefined;
  if (store) fs.mkdirSync(store);
  const page = {
    name: how,
    route: `/${how}`,
    expect: async (p: import('playwright').Page) => {
      await expectVisible(p.getByText(TEXT), 'the page says what it is');
      if (store) {
        fs.rmSync(store, { recursive: true, force: true });
        if (how === 'store-removed') await expectVisible(p.getByText('Give the board a look'), 'the page draws a run the store has', PRESS_MS);
        return;
      }
      await p.getByRole('button', { name: PRESS }).click({ timeout: PRESS_MS });
    },
  };
  const main = async () => {
    const browser = await launch();
    try {
      await visitAll(browser, `http://127.0.0.1:${port}`, [page], out, store);
    } finally {
      await browser.close();
    }
  };
  exitOn(main(), () => server.close());
});
