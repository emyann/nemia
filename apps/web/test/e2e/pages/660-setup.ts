import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from 'playwright';
import { answered, photograph, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import { FACTORIES, WORKFLOWS } from '../seed.ts';
import { serveExposed } from '../served.ts';
import type { PageSpec } from '../visit.ts';
import { apiEnv, OUT, REPO, store } from '../world.ts';

/** The need the page plants in the checkout's `dev`: never in place, its one fix a device sign-in that prints a link and a code. */
const NEED = 'e2e-device-sign-in';

/** The link and the code the fix prints, and the pattern its need declares for the code. */
const PRINTED = { link: 'https://example.com/login/device', code: 'K7QM-3XRP', pattern: '[A-Z0-9]{4}-[A-Z0-9]{4}' } as const;

/** The README of the checkout's `dev` with NEED declared in its frontmatter, over the README as the seed wrote it. */
const plantedReadme = (found: string): string =>
  [
    '---',
    'needs:',
    `  - name: ${NEED}`,
    '    message: a sign-in the e2e plants, never in place',
    '    check: "false"',
    '    fixes:',
    '      - message: sign in with a device code',
    `        command: printf 'Open ${PRINTED.link} and type ${PRINTED.code}\\n'`,
    `        code: "${PRINTED.pattern}"`,
    '---',
    found,
  ].join('\n');

/** The client name the page's pairing is asked under. */
const CLIENT = 'e2e-laptop';

/** The store's folders a link's claim and a pairing write: each file added is taken back, and a folder that was not there removed. */
const WRITTEN = ['person-tokens', 'pairings', 'links'] as const;

/** What each of WRITTEN holds now, by folder. */
const heldIn = (): Map<string, Set<string>> =>
  new Map(WRITTEN.map((dir) => [dir, new Set(fs.existsSync(path.join(store!, dir)) ? fs.readdirSync(path.join(store!, dir)) : [])]));

/** Each file added under WRITTEN since `before` removed, and each folder that did not exist then. */
function takeBack(before: Map<string, Set<string>>): void {
  for (const [dir, files] of before) {
    const full = path.join(store!, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full)) if (!files.has(file)) fs.rmSync(path.join(full, file), { recursive: true, force: true });
    if (files.size === 0) fs.rmSync(full, { recursive: true, force: true });
  }
}

/**
 * A first-visit link minted on the worker's store by `nemia board link`, as the person mints one at the server's shell, under `base`.
 */
function mintedLink(base: string): string {
  const printed = execFileSync(
    process.execPath,
    [path.join(REPO, 'packages', 'agent-orchestrator', 'bin', 'nemia.ts'), 'board', 'link', '--base', base],
    { encoding: 'utf8', env: apiEnv, stdio: 'pipe' },
  );
  const url = /^(https?:\/\/\S+\?link=\S+)$/m.exec(printed)?.[1];
  if (!url) throw new Refused(`nemia board link prints the link it mints — it printed:\n${printed}`);
  return url;
}

/** The fix the page's start is answered with, in `phase`, having printed `output`. */
const fixOf = (phase: 'pending' | 'succeeded', output: string, exitCode?: number) => ({
  id: 'fix-e2e',
  need: NEED,
  factory: FACTORIES.hiring.name,
  workflow: WORKFLOWS.good.name,
  phase,
  output,
  code: PRINTED.pattern,
  ...(exitCode === undefined ? {} : { exitCode }),
});

/** What the fix prints, in two chunks. */
const CHUNKS = [`Open ${PRINTED.link} and type`, ` ${PRINTED.code}\n`] as const;

/** One server-sent event named `event`, its data `data` written a line each. */
const sse = (event: string, data: string): string =>
  `event: ${event}\n${data
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')}\n\n`;

/**
 * The fix's start and its output held by the page (`route`): nothing ticks the e2e's store (`--no-tick`), so a fix the api filed would
 * never run; the page answers the start with the fix pending, and its output as the api streams it — two `output` chunks, then
 * `ended` with the fix as it ended — so the board's drawing of a running fix is what is held here, the api's running of one in its own
 * tests. Returns what unroutes both.
 */
async function holdFix(page: Page): Promise<() => Promise<void>> {
  const start = (route: Route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixOf('pending', '')) })
      : route.fallback();
  const output = (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: [...CHUNKS.map((chunk) => sse('output', chunk)), sse('ended', JSON.stringify(fixOf('succeeded', CHUNKS.join(''), 0)))].join(''),
    });
  await page.route('**/api/readiness/fixes', start);
  await page.route('**/api/readiness/fixes/*/output', output);
  return async () => {
    await page.unroute('**/api/readiness/fixes', start);
    await page.unroute('**/api/readiness/fixes/*/output', output);
  };
}

/** A piece of the readiness read, as the api answers it: the keys the page reads. */
type Piece = { name: string; state: 'met' | 'missing' | 'unknown'; fixes: unknown[] };

/** The readiness read: every piece drawn with the state the api answered, a piece not in place with each of its fixes, and NEED's. */
async function readsPieces(page: Page): Promise<void> {
  await expectVisible(page.locator('article[data-setup] [data-readiness]'), 'Setup draws the readiness read');
  const { pieces } = await answered<{ pieces: Piece[] }>(page, '/api/readiness');
  if (!pieces.some((piece) => piece.name === NEED)) throw new Refused(`the api lists the planted need ${NEED} — it lists none`);
  for (const piece of pieces) {
    const drawn = page.locator(`li[data-piece="${piece.name}"]`).first();
    await expectVisible(drawn, `the piece ${piece.name} is drawn`);
    const state = await drawn.getAttribute('data-piece-state');
    if (state !== piece.state) throw new Refused(`${piece.name} is drawn ${state}, as the api answered it ${piece.state}`);
    const word = (await drawn.locator('[data-piece-word]').textContent())?.trim();
    if (!word) throw new Refused(`${piece.name}'s state is said in a word, not by its colour alone`);
    if (piece.state !== 'met')
      await expectCount(drawn.locator('[data-fix]'), piece.fixes.length, `${piece.name}, not in place, shows each of its fixes`);
  }
  const planted = page.locator(`li[data-piece="${NEED}"]`);
  await expectVisible(planted.locator('[data-fix="startable"] [data-fix-press]'), `${NEED}'s fix is a press that starts it`);
  const missing = pieces.filter((piece) => piece.state === 'missing');
  await expectCount(page.locator('li[data-piece-state="missing"]'), missing.length, 'every missing piece is drawn missing');
  await settled(page);
  await photograph(page, path.join(OUT, `setup-pieces-${await themeOf(page)}.png`), { fullPage: true });
}

/** NEED's fix started: its output drawn as it comes, its link a link that opens a new tab, its code large over it, and its end. */
async function runsFix(page: Page): Promise<void> {
  const unroute = await holdFix(page);
  try {
    await page.locator(`li[data-piece="${NEED}"] [data-fix-press]`).click();
    const run = page.locator(`section[data-fix-run="${NEED}"]`);
    await expectVisible(run, 'the started fix is drawn over the read');
    const link = run.locator(`[data-fix-output] a[href="${PRINTED.link}"]`);
    await expectVisible(link, 'the URL the fix printed is a link');
    if ((await link.getAttribute('target')) !== '_blank') throw new Refused('the link opens in a new tab (target=_blank)');
    await expectVisible(run.locator(`[data-fix-code="${PRINTED.code}"]`), 'the code the need declares is shown over the output');
    await expectVisible(run.locator('[data-fix-code] button'), 'with the control that copies it');
    await expectVisible(page.locator(`section[data-fix-run="${NEED}"][data-fix-phase="succeeded"]`), 'its end is drawn: done');
    await idle(page);
    await run.scrollIntoViewIfNeeded();
    await settled(page);
    await photograph(run, path.join(OUT, `setup-fix-${await themeOf(page)}.png`));
  } finally {
    await unroute();
  }
}

/** A pairing asked for by a client, listed under Setup with its name, and approved there by the code the client shows. */
async function approvesPairing(page: Page): Promise<void> {
  const asked = await page.request.post(new URL('/api/pair', page.url()).href, { data: { client: CLIENT } });
  if (!asked.ok()) throw new Refused(`POST /api/pair asks a pairing — it answered ${asked.status()}`);
  const { code } = (await asked.json()) as { code: string };
  await page.reload();
  await idle(page);
  const row = page.locator(`li[data-pairing="${CLIENT}"]`);
  await expectVisible(row, 'the pairing that waits is listed under its client name');
  await expectCount(row.getByText(code), 0, 'and never with its code: the person types the one the client shows');
  await row.locator('[data-pairing-approve]').click();
  await row.locator('input[data-pairing-code]').fill(code);
  await row.scrollIntoViewIfNeeded();
  await settled(page);
  await photograph(page, path.join(OUT, `setup-approvals-${await themeOf(page)}.png`));
  const [approved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/pairings\/[^/]+\/approve$/.test(new URL(r.url()).pathname)),
    row.getByRole('button', { name: 'Approve' }).click(),
  ]);
  if (approved.status() !== 200) throw new Refused(`the code the client shows approves it — the api answered ${approved.status()}`);
  await expectVisible(page.locator('[data-pairing-approved]'), 'the page says it approved it');
  await expectCount(row, 0, 'and it waits no more');
  await idle(page);
}

/**
 * On a store marked exposed, a first-visit link signs the browser that opens it in, and the address loses its secret; opened a second
 * time, in a browser with no cookie, the link is refused as used, said on the sign-in, and the address loses it all the same.
 */
async function signsInByLink(page: Page): Promise<void> {
  const seat = await serveExposed();
  const context = await page
    .context()
    .browser()!
    .newContext({ colorScheme: (await themeOf(page)) as 'light' | 'dark', viewport: { width: 1280, height: 800 } });
  try {
    const url = mintedLink(seat.base);
    const other = await context.newPage();
    const { problems } = watch(other);
    await other.goto(url, { waitUntil: 'load' });
    await expectVisible(topBarOf(other), 'the link signs this browser in: the board is drawn, not the token page');
    await expectCount(other.locator('[data-token-page]'), 0, 'and no token is asked for');
    if (new URL(other.url()).searchParams.has('link')) throw new Refused(`the address loses the link's secret — it is ${other.url()}`);
    await idle(other);

    await context.clearCookies();
    await other.goto(url, { waitUntil: 'load' });
    await expectVisible(other.locator('form[data-token-page] [data-link-refused="used"]'), 'a used link is refused, said on the sign-in');
    if (new URL(other.url()).searchParams.has('link')) throw new Refused(`a refused link leaves the address too — it is ${other.url()}`);
    await expectVisible(other.locator('[data-pair-press]'), 'the sign-in offers to pair this browser');
    await settled(other);
    await photograph(other, path.join(OUT, `setup-link-refused-${await themeOf(other)}.png`));

    await other.locator('[data-pair-press]').click();
    const waiting = other.locator('[data-pair-browser="waiting"]');
    await expectVisible(waiting, 'pressed, the browser waits on the approval');
    const shown = (await waiting.locator('[data-pair-code]').textContent())?.trim() ?? '';
    if (!/\S{4,}/.test(shown)) throw new Refused(`the code to approve is shown, large — it shows "${shown}"`);
    await expectVisible(waiting.locator('[data-pair-said]'), 'and says it waits for the approval');
    await settled(other);
    await photograph(other, path.join(OUT, `setup-pair-waiting-${await themeOf(other)}.png`));

    const claim = new URL('/api/pair/link', seat.base).href;
    const others = problems().filter(
      (p) =>
        p !== `request answered 409: POST ${claim}` &&
        !p.startsWith('request answered 401: ') &&
        !/^console error: Failed to load resource: the server responded with a status of (401|409)\b/.test(p),
    );
    if (others.length)
      throw new Refused(`the link's pages saw its 409 and the store's 401s alone — they saw:\n    ${others.join('\n    ')}`);
  } finally {
    await context.close();
    await seat.stop();
  }
}

export default {
  /**
   * Settings' Setup: the readiness read grouped by area, each piece drawn as the api answers it — its state in a word, and a piece not
   * in place with each of its fixes — with a need the page plants in the checkout's `dev` (never in place, its fix a device sign-in);
   * that fix started, its output drawn with its link a link and the code its need declares shown large (held by `holdFix`: nothing ticks
   * the store); a pairing a client asks for, listed by its name and approved by the code typed; and, on a second seat marked exposed, a
   * first-visit link that signs a browser in and leaves the address, refused once used. The README, the tokens, the pairings and the
   * links are taken back.
   */
  name: 'setup',
  route: '/setup',
  expect: async (page) => {
    const readme = path.join(store!, 'checkout', 'workflows', WORKFLOWS.good.name, 'README.md');
    const found = fs.readFileSync(readme, 'utf8');
    const before = heldIn();
    fs.writeFileSync(readme, plantedReadme(found));
    try {
      await page.reload();
      await idle(page);
      await readsPieces(page);
      await runsFix(page);
      await approvesPairing(page);
      await signsInByLink(page);
    } finally {
      fs.writeFileSync(readme, found);
      takeBack(before);
    }
    await page.reload();
    await idle(page);
    await expectCount(page.locator(`li[data-piece="${NEED}"]`), 0, 'the planted need is taken back');
  },
} satisfies PageSpec;
