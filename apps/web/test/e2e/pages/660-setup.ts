import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from 'playwright';
import { answered, photograph, READINESS_ROUTE, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import { HARNESS_SKIP_KEY } from '../../../src/lib/harnessSkip.ts';
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
 * A fix's start and its output held by the page (`route`): nothing ticks the e2e's store (`--no-tick`), so a fix the api filed would
 * never run; the page answers the start with the fix `made` pending, and its output as the api streams it — each of `chunks` an
 * `output` event, then `ended` with the fix as it ended, done — so the board's drawing of a running fix is what is held here, the api's
 * running of one in its own tests. Each start's body is kept in `sent`. Returns what unroutes both.
 */
async function holdFix(
  page: Page,
  made: (phase: 'pending' | 'succeeded', output: string, exitCode?: number) => object,
  chunks: readonly string[],
  sent: unknown[] = [],
): Promise<() => Promise<void>> {
  const start = (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(made('pending', '')) });
  };
  const output = (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: [...chunks.map((chunk) => sse('output', chunk)), sse('ended', JSON.stringify(made('succeeded', chunks.join(''), 0)))].join(''),
    });
  await page.route('**/api/readiness/fixes', start);
  await page.route('**/api/readiness/fixes/*/output', output);
  return async () => {
    await page.unroute('**/api/readiness/fixes', start);
    await page.unroute('**/api/readiness/fixes/*/output', output);
  };
}

/** A fix of a piece, as the api answers it: the keys the page reads. */
type PieceFix = { message: string; command: string; startable: boolean; index?: number; kind?: 'puts' | 'typed' | 'removes' };

/** A piece of the readiness read, as the api answers it: the keys the page reads. */
type Piece = {
  name: string;
  state: 'met' | 'missing' | 'unknown';
  message: string;
  fixes: PieceFix[];
  factory?: string;
  harness?: { name: string; part: 'install' | 'sign-in' };
};

/** A harness the read declares: its install piece and its sign-in piece, as the api answers them. */
type Harness = { name: string; install: Piece; signIn: Piece };

/** The harnesses the api's read declares, each with its two pieces; refused where it declares none, as every release declares one. */
async function harnessesRead(page: Page): Promise<Harness[]> {
  const { pieces } = await answered<{ pieces: Piece[] }>(page, '/api/readiness');
  const of = (name: string, part: 'install' | 'sign-in') => pieces.find((p) => p.harness?.name === name && p.harness.part === part);
  const harnesses = [...new Set(pieces.flatMap((p) => (p.harness ? [p.harness.name] : [])))].flatMap((name) => {
    const install = of(name, 'install');
    const signIn = of(name, 'sign-in');
    return install && signIn ? [{ name, install, signIn }] : [];
  });
  if (!harnesses.length) throw new Refused('the readiness read declares a harness, its install and its sign-in pieces — it declares none');
  return harnesses;
}

/** The readiness read: every piece drawn with the state the api answered, a piece not in place with each of its fixes, and NEED's. */
async function readsPieces(page: Page): Promise<void> {
  await expectVisible(page.locator('article[data-setup] [data-readiness]'), 'Setup draws the readiness read');
  const { pieces } = await answered<{ pieces: Piece[] }>(page, '/api/readiness');
  if (!pieces.some((piece) => piece.name === NEED)) throw new Refused(`the api lists the planted need ${NEED} — it lists none`);
  for (const piece of pieces) {
    const of = piece.factory === undefined ? '' : `[data-piece-factory="${piece.factory}"]`;
    const drawn = page.locator(`li[data-piece="${piece.name}"]${of}`).first();
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

/** A piece of a planted read: `name`, of `cost`, missing. */
const plantedPiece = (name: string, area: string, cost: 'run' | 'server') => ({
  name,
  area,
  state: 'missing',
  message: `${name}, planted by the e2e`,
  fixes: [],
  cost,
});

/**
 * The reads the banner is held to, each answered in place of the api's (`page.route`, as `holdFix` holds the fixes), since the api's
 * own answers a need `unknown` until its sweep reads it: on a server whose runs have started, a missing harness sign-in, which a run
 * waits on, raises the banner; linger alone, which no run waits on, raises none — the card's case.
 */
const PLANTED_READS = {
  waits: { ready: false, ran: true, pieces: [plantedPiece('claude-token', 'harness', 'run'), plantedPiece('linger', 'service', 'server')] },
  advised: { ready: false, ran: true, pieces: [plantedPiece('linger', 'service', 'server')] },
} as const;

/**
 * The banner over every other page: raised by a missing piece a run waits on, never saying "first run" on a server whose runs have
 * started nor "not ready", and raising none where the only missing piece is advised; then back to Setup.
 */
async function raisesBanner(page: Page): Promise<void> {
  const setup = page.url();
  let planted: keyof typeof PLANTED_READS = 'waits';
  const answer = (route: Route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLANTED_READS[planted]) })
      : route.fallback();
  await page.route(READINESS_ROUTE, answer);
  try {
    await page.goto(new URL('/', setup).href);
    await idle(page);
    const banner = page.locator('[data-setup-banner]');
    await expectVisible(banner, 'claude-token, which a run waits on, is missing: the banner is raised');
    const said = (await banner.textContent()) ?? '';
    if (/first run|not ready/.test(said))
      throw new Refused(`on a server whose runs have started, the banner says neither "first run" nor "not ready"; it says: ${said}`);
    if (!/a run waits on/.test(said) || !/no run waits on/.test(said))
      throw new Refused(`the banner says the piece a run waits on apart from the one advised; it says: ${said}`);
    await settled(page);
    await photograph(page, path.join(OUT, `setup-banner-${await themeOf(page)}.png`));
    planted = 'advised';
    await page.reload();
    await idle(page);
    await expectCount(banner, 0, 'linger alone is missing, and no run waits on it: no banner');
  } finally {
    await page.unroute(READINESS_ROUTE, answer);
  }
  await page.goto(setup);
  await idle(page);
}

/** NEED's fix started: its output drawn as it comes, its link a link that opens a new tab, its code large over it, and its end. */
async function runsFix(page: Page): Promise<void> {
  const unroute = await holdFix(page, fixOf, CHUNKS);
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

/** What the harness's install prints, in two chunks. */
const INSTALLED = ['added 1 package in 2s\n', 'linked into the tools folder\n'] as const;

/**
 * On a fresh seed no harness is installed (the store's `claude` is on no PATH of the api, served.ts), so Setup asks which to activate:
 * one option for each harness the read declares, titled by its install piece's sentence. Activate starts the install's fix (held by
 * `holdFix`: nothing ticks the store) with the install's need and its first fix, its output drawn in the question as it comes, and once
 * done the harness's sign-in fixes are shown there, a command to type with the control that copies it. A reload forgets the activation.
 */
async function asksAndActivates(page: Page): Promise<void> {
  const harnesses = await harnessesRead(page);
  for (const harness of harnesses)
    if (harness.install.state === 'met') throw new Refused(`a fresh seed has no harness installed — ${harness.name} is in place`);
  const asked = page.locator('section[data-harness-choice="asked"]');
  await expectVisible(asked, 'a first visit with no harness installed asks which to activate');
  await expectCount(asked.locator('[data-harness-option]'), harnesses.length, 'one option for each harness the read declares');
  for (const harness of harnesses)
    await expectVisible(
      asked.locator(`[data-harness-option="${harness.name}"]`, { hasText: harness.install.message }),
      `${harness.name}'s option is titled by its install piece's sentence`,
    );
  await settled(page);
  await photograph(page, path.join(OUT, `setup-harness-asked-${await themeOf(page)}.png`));

  const [first] = harnesses;
  const sent: unknown[] = [];
  const made = (phase: 'pending' | 'succeeded', output: string, exitCode?: number) => ({
    id: 'fix-e2e-harness',
    need: first.install.name,
    phase,
    output,
    ...(exitCode === undefined ? {} : { exitCode }),
  });
  const unroute = await holdFix(page, made, INSTALLED, sent);
  try {
    await asked.locator(`[data-harness-option="${first.name}"] [data-harness-activate]`).click();
    const chosen = page.locator(`section[data-harness-choice] [data-harness-option="${first.name}"]`);
    const run = chosen.locator(`section[data-fix-run="${first.install.name}"]`);
    await expectVisible(run, 'Activate starts the install, its run drawn in the question');
    const start = sent[0] as { need?: string; index?: number } | undefined;
    if (start?.need !== first.install.name || (start.index ?? 0) !== 0)
      throw new Refused(
        `Activate starts the install piece's first fix (${first.install.name}, index 0) — it sent ${JSON.stringify(start)}`,
      );
    await expectVisible(
      run.locator('[data-fix-output]', { hasText: 'linked into the tools folder' }),
      "the install's output is drawn as it comes",
    );
    await expectVisible(
      page.locator('section[data-harness-choice="installed"]'),
      'once the install is done, the question says it is installed',
    );
    const signIn = page.locator(`[data-harness-sign-in="${first.signIn.name}"]`);
    const fixes = first.signIn.fixes.filter((fix) => fix.kind !== 'removes');
    await expectCount(signIn.locator('[data-fix]'), fixes.length, `then ${first.signIn.name}'s fixes are shown, each of them`);
    for (const fix of fixes.filter((f) => !f.startable || f.kind === 'typed'))
      await expectVisible(
        signIn.locator(`[data-fix="typed"] [data-copy-text="${fix.command}"] button`),
        `a fix typed on the server is its command, ${fix.command}, with the control that copies it`,
      );
    await idle(page);
    await settled(page);
    await photograph(page, path.join(OUT, `setup-harness-installed-${await themeOf(page)}.png`));
  } finally {
    await unroute();
  }
  await page.reload();
  await idle(page);
  await expectVisible(
    page.locator('section[data-harness-choice="asked"]'),
    'a reload forgets the activation, and the question is asked again',
  );
}

/**
 * Skip keeps the skip in this browser (`lib/stored.ts`): the question goes, a line says it is skipped, and a reload does not ask it
 * again; the skip forgotten, it is asked again.
 */
async function skipsTheQuestion(page: Page): Promise<void> {
  const asked = page.locator('section[data-harness-choice="asked"]');
  try {
    await asked.locator('[data-harness-skip]').click();
    await expectCount(asked, 0, 'Skip takes the question away');
    await expectVisible(page.locator('[data-harness-choice="skipped"]'), 'and one line says it is skipped in this browser');
    await page.reload();
    await idle(page);
    await expectVisible(page.locator('article[data-setup] [data-readiness]'), 'Setup draws the readiness read again');
    await expectCount(asked, 0, 'reloaded, the question stays skipped');
    await settled(page);
    await photograph(page, path.join(OUT, `setup-harness-skipped-${await themeOf(page)}.png`));
  } finally {
    await page.evaluate((key) => localStorage.removeItem(key), HARNESS_SKIP_KEY);
  }
  await page.reload();
  await idle(page);
  await expectVisible(asked, 'the skip forgotten, the question is asked again');
}

/**
 * Deactivate, on a harness installed, is refused while an unfinished run of the seed needs it: the api's 409, said under the press as a
 * fix's refusal is, naming `nemia cancel <run>` for each run that holds it. The api's read is frozen at its first sweep (`--no-tick`), so
 * a second page of the browser answers it with the first harness's install in place, its one fix the removal the api offers on a met
 * install (index 1, `removes`); the start itself is the api's. That page's watch expects the 409 and nothing else.
 */
async function deactivateRefused(page: Page): Promise<void> {
  const [first] = await harnessesRead(page);
  const install = first.install;
  const other = await page.context().newPage();
  const { problems } = watch(other);
  try {
    await other.route('**/api/readiness', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const answer = await route.fetch();
      const read = (await answer.json()) as { ready: boolean; pieces: Piece[] };
      const removal: PieceFix = {
        message: `deactivate ${first.name}: remove what its install put in the tools folder`,
        command: `nemia doctor fix ${install.name} --index 1`,
        startable: true,
        index: 1,
        kind: 'removes',
      };
      const pieces = read.pieces.map((p) => (p.name === install.name ? { ...p, state: 'met' as const, fixes: [removal] } : p));
      await route.fulfill({ response: answer, json: { ...read, pieces } });
    });
    await other.goto(new URL('/setup', page.url()).href, { waitUntil: 'load' });
    await idle(other);
    const piece = other.locator(`li[data-piece="${install.name}"][data-piece-state="met"]`);
    await expectVisible(
      piece.locator('[data-fix="removes"] [data-fix-press]', { hasText: 'Deactivate' }),
      'a harness installed offers Deactivate',
    );
    await expectCount(other.locator('section[data-harness-choice]'), 0, 'and with one installed, the question is not asked');
    const [refusal] = await Promise.all([
      other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/readiness/fixes'),
      piece.locator('[data-fix="removes"] [data-fix-press]').click(),
    ]);
    if (refusal.status() !== 409)
      throw new Refused(`Deactivate is refused while a seeded unfinished run needs ${install.name} — the api answered ${refusal.status()}`);
    const { users } = (await refusal.json()) as { users?: string[] };
    if (!users?.length) throw new Refused(`the refusal names the runs that hold ${install.name} — it names none`);
    const said = piece.locator('[data-fix-refused]');
    await expectVisible(said, "the refusal is said under Deactivate, as a fix's refusal is");
    for (const run of users) await expectVisible(said.filter({ hasText: `nemia cancel ${run}` }), `it names nemia cancel ${run}`);
    await idle(other);
    await piece.scrollIntoViewIfNeeded();
    await settled(other);
    await photograph(other, path.join(OUT, `setup-deactivate-refused-${await themeOf(other)}.png`));
    const fixes = new URL('/api/readiness/fixes', page.url()).href;
    const others = problems().filter(
      (p) =>
        p !== `request answered 409: POST ${fixes}` &&
        !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
    );
    if (others.length) throw new Refused(`Deactivate's page saw its 409 alone — it saw:\n    ${others.join('\n    ')}`);
  } finally {
    await other.close();
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
   * Settings' Setup, over the api's own read (routed on past the piece every page's context plants, `bannerShown`): the readiness read
   * grouped by area, each piece drawn as the api answers it — its state in a word, and a piece not
   * in place with each of its fixes — and the banner over another page, over reads it plants, raised by a missing piece a run waits on
   * and by no piece advised alone; with a need the page plants in the checkout's `dev` (never in place, its fix a device sign-in); the
   * first visit's question of which harness to activate, Activate drawing the install's run and then the sign-in's fixes, and Skip
   * kept across a reload; Deactivate on a harness installed refused while a seeded run needs it, naming the run; that
   * fix started, its output drawn with its link a link and the code its need declares shown large (held by `holdFix`: nothing ticks the
   * store); a pairing a client asks for, listed by its name and approved by the code typed; and, on a second seat marked exposed, a
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
    const ownRead = (route: Route) => route.continue();
    await page.route(READINESS_ROUTE, ownRead);
    try {
      await page.reload();
      await idle(page);
      await readsPieces(page);
      await raisesBanner(page);
      await asksAndActivates(page);
      await skipsTheQuestion(page);
      await runsFix(page);
      await deactivateRefused(page);
      await approvesPairing(page);
      await signsInByLink(page);
    } finally {
      fs.writeFileSync(readme, found);
      takeBack(before);
    }
    await page.reload();
    await idle(page);
    await expectCount(page.locator(`li[data-piece="${NEED}"]`), 0, 'the planted need is taken back');
    await page.unroute(READINESS_ROUTE, ownRead);
  },
} satisfies PageSpec;
