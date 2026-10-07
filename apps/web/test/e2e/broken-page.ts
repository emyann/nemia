/**
 * A page that breaks one of the e2e's rules, put through the code `npm run e2e` puts the app's pages
 * through (visit.ts), in a process that exits as `npm run e2e` does. visit.test.ts runs it.
 *
 *   node test/e2e/broken-page.ts <console-error | failed-request | covered | store-removed | store-swept | none>
 *     <screenshots directory> [--photos]
 *
 * It visits in the dark theme, pictured by no one, as `npm run e2e` does; with `--photos`, in light, then dark, the page pictured, as
 * `npm run e2e -- --photos` does. `none` breaks nothing, and must pass: otherwise the page itself is what fails, and a refusal of the
 * others proves nothing about the break; it takes a picture of its own too (`none-own-<theme>.png`), as a page of the app's does. The
 * page is painted for both themes, so the theme check passes and the break is what is left to fail. The two `store-` breaks break no
 * page: they remove the store the visit is handed, as a sweep of /tmp can remove the e2e's own, while the page looks (`store-removed`,
 * which then fails on what the store held) or at its end (`store-swept`, which passes, and with `--photos` fails before its dark visit).
 * That store is made in the screenshots directory, so one the page did not remove is a leftover the test's scratch root takes. A visit
 * that passes says what each page took in each theme, as JSON, on a line of its own (`e2e: timings`).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { photograph, themeOf } from './board.ts';
import { expectVisible } from './checks.ts';
import { exitOn, launch, visitAll } from './visit.ts';

const BREAKS: Record<string, string> = {
  'console-error': `console.error('the graph did not draw');`,
  /** A request the server drops without an answer, caught, so the only thing wrong is the request. */
  'failed-request': `fetch('/api/dropped').catch(() => {});`,
  /** A header over the button the page presses: Playwright tries the click until its timeout. */
  covered: `document.body.insertAdjacentHTML('beforeend', '<div data-cover style="position:fixed;inset:0"><span>resets 23:16</span></div>');`,
  none: `fetch('/api/answered');`,
  'store-removed': `fetch('/api/answered');`,
  'store-swept': `fetch('/api/answered');`,
};

const [how = '', out, flag] = process.argv.slice(2);
if (!(how in BREAKS) || !out || (flag !== undefined && flag !== '--photos')) {
  console.error(`usage: node broken-page.ts <${Object.keys(BREAKS).join(' | ')}> <screenshots directory> [--photos]`);
  process.exit(2);
}
const photos = flag === '--photos';

const TEXT = 'A page for the e2e to look at';
const PRESS = 'Press';
/** How long a press waits on a button it cannot reach, the page's own: the e2e's pages wait on Playwright's thirty seconds. */
const PRESS_MS = 2_000;

const server = http.createServer((req, res) => {
  if (req.url === '/api/dropped') return void req.socket.destroy();
  if (req.url === '/api/answered') return void res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
  if (req.url !== `/${how}`) return void res.writeHead(204).end();
  res
    .writeHead(200, { 'content-type': 'text/html' })
    .end(
      `<style>body{background:white}@media (prefers-color-scheme: dark){body{background:#111;color:#eee}}</style><p>${TEXT}</p><button>${PRESS}</button><script>${BREAKS[how]}</script>`,
    );
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  const store = how.startsWith('store-') ? path.join(out, 'store') : undefined;
  if (store) fs.mkdirSync(store);
  const page = {
    name: how,
    route: `/${how}`,
    expect: async (p: import('playwright').Page) => {
      await expectVisible(p.getByText(TEXT), 'the page says what it is');
      if (store) {
        fs.rmSync(store, { recursive: true, force: true });
        if (how === 'store-removed')
          await expectVisible(p.getByText('Give the board a look'), 'the page draws a run the store has', PRESS_MS);
        return;
      }
      await p.getByRole('button', { name: PRESS }).click({ timeout: PRESS_MS });
      if (how === 'none') await photograph(p, path.join(out, `none-own-${await themeOf(p)}.png`));
    },
  };
  const main = async () => {
    const browser = await launch();
    try {
      const { timings } = await visitAll(browser, `http://127.0.0.1:${port}`, [page], out, {
        store,
        themes: photos ? ['light', 'dark'] : ['dark'],
        pictured: () => photos,
      });
      console.log(`e2e: timings ${JSON.stringify(timings)}`);
    } finally {
      await browser.close();
    }
  };
  exitOn(main(), () => server.close());
});
