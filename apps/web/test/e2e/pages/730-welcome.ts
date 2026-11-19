import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from 'playwright';
import { photograph, READINESS_ROUTE, runPath, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { HARNESS_SKIP_KEY } from '../../../src/lib/harnessSkip.ts';
import { GATED, LANDED } from '../seed.ts';
import { bearer } from '../served.ts';
import type { PageSpec } from '../visit.ts';
import { apiEnv, OUT, store } from '../world.ts';

/** A check of a harness, as the api answers it: the keys the page reads. */
type Check = { name: 'version' | 'turn'; state: 'passed' | 'failed' | 'running' | 'unrun'; message: string; fixes: [] };

/** The install piece of the e2e's harness, met with `checks` or missing with its one fix. */
const install = (checks?: Check[]) => ({
  name: 'claude',
  area: 'harness',
  state: checks === undefined ? 'missing' : 'met',
  message: 'Claude Code (claude), at the version this release was tested with',
  fixes:
    checks === undefined
      ? [{ message: 'install Claude Code into the tools folder', command: 'nemia doctor fix claude', startable: true, index: 0 }]
      : [],
  harness: { name: 'claude', part: 'install' },
  cost: 'run',
  ...(checks === undefined ? {} : { checks }),
});

/** The sign-in piece of the e2e's harness, in `state`. */
const signIn = (state: 'met' | 'missing') => ({
  name: 'claude-sign-in',
  area: 'harness',
  state,
  message: 'Claude Code is signed in as the user the daemon runs as',
  fixes: [],
  harness: { name: 'claude', part: 'sign-in' },
  cost: 'run',
});

/** No factory filed: with no harness installed, the store is fresh. */
const NO_FACTORY = { name: 'factory', area: 'factory', state: 'missing', message: 'no factory is filed', fixes: [], cost: 'run' };

/** A check named `name` in `state`. */
const check = (name: Check['name'], state: Check['state']) =>
  ({ name, state, message: `the ${name} check, ${state}`, fixes: [] }) satisfies Check;

/** The reads the page answers in place of the api's, by what it is showing: fresh, then the harness's two checks one way or another. */
const READS = {
  fresh: [install(), signIn('missing'), NO_FACTORY],
  turnFailed: [install([check('version', 'passed'), check('turn', 'failed')]), signIn('met'), NO_FACTORY],
  ready: [install([check('version', 'passed'), check('turn', 'passed')]), signIn('met'), NO_FACTORY],
} as const;

/**
 * The milestones read the page answers in place of the api's, whose seeded store already holds factories: the harness done, the
 * factory next.
 */
const FACTORY_NEXT = {
  milestones: [
    { name: 'harness', state: 'done', message: 'a harness is installed and signed in' },
    {
      name: 'factory',
      state: 'next',
      message: 'make a first factory: with Nemia, from a template, or from scratch; it may start with no volume',
    },
    { name: 'volume', state: 'later', message: 'give a factory a volume' },
    { name: 'landed', state: 'later', message: 'merge a first change into its base branch' },
  ],
};

/** The milestones read's route. */
const MILESTONES_ROUTE = '**/api/readiness/milestones';

/** The factory the page makes from sdlc, and takes back. */
const MADE = 'first-factory';

/** `method` of the api at `route`, from Node, presenting the seat's token: its status and its JSON, none where it answered none. */
async function asked(page: Page, method: 'GET' | 'DELETE', route: string) {
  const res = await fetch(
    new URL(route, page.url()),
    method === 'GET' ? { headers: bearer() } : { method, headers: { ...bearer(), 'content-type': 'application/json' }, body: '{}' },
  );
  return { status: res.status, body: (await res.json().catch(() => undefined)) as unknown };
}

/**
 * The factory step, from the ready welcome's Next: three tiles in order, Talk to Nemia first; From a template offers sdlc; a name typed and
 * Make pressed applies it through the real api, and the step shows the factory made, with Next. The factory is read from the api: made
 * from sdlc, with no volume. Its skip leaves for `/`.
 */
async function makesFromTemplate(page: Page) {
  await page.locator('article[data-welcome] [data-welcome-next]').click();
  await page.waitForURL((url) => url.pathname === '/welcome/factory');
  await idle(page);
  const step = page.locator('article[data-factory-step]');
  await expectVisible(step, 'Next leads to the factory step, at /welcome/factory');
  const ways = await step.locator('[data-factory-way]').evaluateAll((tiles) => tiles.map((t) => t.getAttribute('data-factory-way')));
  if (JSON.stringify(ways) !== JSON.stringify(['nemia', 'template', 'scratch']))
    throw new Refused(`the step offers Talk to Nemia, From a template and From scratch, in that order — it offers ${JSON.stringify(ways)}`);
  await expectVisible(step.locator('[data-factory-way="nemia"]').getByText('Recommended'), 'Talk to Nemia is marked Recommended');
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-factory-choose-${await themeOf(page)}.png`));
  await step.locator('[data-factory-way="template"]').click();
  await expectVisible(step.locator('[data-template-offer="sdlc"]'), 'From a template offers sdlc, as the api lists it');
  await step.getByRole('textbox', { name: /Name/ }).fill(MADE);
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-factory-template-${await themeOf(page)}.png`));
  const applied = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/factories/${MADE}/apply`,
  );
  await step.locator('[data-factory-make]').click();
  const answer = await applied;
  if (answer.status() !== 200) throw new Refused(`Make applies sdlc as ${MADE} — the api answered ${answer.status()}`);
  await expectVisible(page.locator('article[data-factory-step="made"]'), 'the apply answered, the step shows the factory made');
  await expectVisible(page.locator('article[data-factory-step="made"] [data-welcome-next]'), 'made, Next names what comes next');
  const read = await asked(page, 'GET', `/api/factories/${MADE}`);
  const spec = (read.body as { spec?: { template?: { source?: string }; volumes?: unknown[] } } | undefined)?.spec;
  if (read.status !== 200 || !(spec?.template?.source ?? '').includes('sdlc') || (spec?.volumes ?? []).length !== 0)
    throw new Refused(`${MADE} is filed from sdlc with no volume — the api answered ${read.status} ${JSON.stringify(spec)}`);
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-factory-made-${await themeOf(page)}.png`));
  await page.locator('article[data-factory-step] [data-welcome-next]').click();
  await page.waitForURL((url) => url.pathname === '/welcome/volume');
  await idle(page);
}

/** The folder the worker's api lists under (`WF_FOLDER_ROOTS`, `folderRootOf` in served.ts). */
const folderRoot = () => {
  const root = apiEnv.WF_FOLDER_ROOTS;
  if (!root) throw new Refused("the worker's api lists folders under WF_FOLDER_ROOTS, which its environment does not set");
  return fs.realpathSync(root);
};

/** The folders the page plants under the listing's root: `plain`, no repository, and `work`, a repository with one commit. */
function plantFolders() {
  const root = folderRoot();
  const plain = path.join(root, 'plain');
  const work = path.join(root, 'work');
  fs.mkdirSync(plain, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', ...args], {
      cwd: work,
      stdio: 'ignore',
    });
  git('init', '--quiet', '-b', 'main');
  git('commit', '--quiet', '--allow-empty', '-m', 'Begin');
  return { plain, work };
}

/** `path` typed into the folder way's field and used. */
async function useFolder(page: Page, at: string) {
  const step = page.locator('article[data-volume-step]');
  await step.getByRole('combobox', { name: /Folder/ }).fill(at);
  await step.locator('[data-folder-use]').click();
}

/**
 * The volume step, from the factory step's Next: the factory made chosen, A folder on this machine, the listing naming the planted
 * folders under its root; a folder that is no repository offered git init, and on No held, adding nothing; then a repository's folder
 * used, added writable to the factory, its trust asked (or, where no harness of the worker keeps one, the work in place at once), and
 * Not now leaving it waiting. The volume is read from the api. Trust is never pressed: it would write a harness's own trust file.
 */
async function givesAFolder(page: Page) {
  const { plain, work } = plantFolders();
  const step = page.locator('article[data-volume-step]');
  await expectVisible(step, 'Next leads to the volume step, at /welcome/volume');
  const choice = step.locator(`[data-volume-factory="${MADE}"]`);
  if ((await choice.count()) > 0) await choice.click();
  await expectVisible(page.locator('article[data-volume-step="choose"]'), `${MADE} holds no volume: the step offers its three ways`);
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-volume-choose-${await themeOf(page)}.png`));
  await step.locator('[data-volume-way="folder"]').click();
  await step.getByRole('combobox', { name: /Folder/ }).fill(`${folderRoot()}/`);
  const listbox = page.getByRole('listbox');
  await expectVisible(listbox.getByRole('option', { name: 'plain' }), 'the listing names the planted folder plain');
  await expectVisible(listbox.getByRole('option', { name: 'work' }), 'the listing names the planted folder work');
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-volume-folder-${await themeOf(page)}.png`));
  await page.keyboard.press('Escape');
  await useFolder(page, plain);
  await expectVisible(page.locator('article[data-volume-step="init"]'), 'a folder that is no repository is offered git init');
  await step.locator('[data-init-no]').click();
  await expectVisible(page.locator('article[data-volume-step="declined"]'), 'No holds the step on the folder, saying why');
  await step.locator('[data-init-another]').click();
  await useFolder(page, work);
  const added = page.locator('article[data-volume-step="trust"], article[data-volume-step="done"]');
  await expectVisible(added, 'the repository is added: its trust is asked, or, where no harness keeps one, the work is in place');
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-volume-added-${await themeOf(page)}.png`));
  if ((await page.locator('article[data-volume-step="trust"]').count()) > 0) {
    await step.locator('[data-trust-later]').click();
    await expectVisible(page.locator('article[data-volume-step="waiting"]'), 'Not now leaves the factory waiting on the trust');
  }
  const read = await asked(page, 'GET', `/api/factories/${MADE}`);
  const volumes = (read.body as { spec?: { volumes?: { path: string; readOnly: boolean }[] } } | undefined)?.spec?.volumes ?? [];
  if (volumes.length !== 1 || volumes[0]?.path !== work || volumes[0]?.readOnly !== false)
    throw new Refused(`${MADE} has one writable volume, ${work} — the api answered ${read.status} ${JSON.stringify(volumes)}`);
  await step.locator('[data-welcome-skip]').click();
  await page.waitForURL((url) => url.pathname === '/');
  await idle(page);
}

/** The label that marks a first card and its run, as the board files it (`FIRST_CARD_LABEL`). */
const FIRST_LABEL = 'onboarding=first-card';

/** The milestones answered once a change has landed: every one done. */
const ALL_DONE = { milestones: FACTORY_NEXT.milestones.map((m) => ({ ...m, state: 'done' })) };

/** `edits` made to the labels of the seeded run `id` through the api (`600-labels`' way). */
async function labelRun(page: Page, id: string, edits: string[]) {
  const answered = await page.request.post(new URL(`${await runPath(page, id)}/labels`, page.url()).href, {
    data: { labels: edits },
  });
  if (answered.status() !== 200) throw new Refused(`the api labels ${id} — it answered ${answered.status()}: ${await answered.text()}`);
}

/** The labels a first card's hints read taken back from the seeded run `id`, and the file the edit left. */
async function unlabelRun(page: Page, id: string) {
  await labelRun(page, id, ['onboarding-']).catch(() => undefined);
  if (store !== undefined) fs.rmSync(path.join(store, 'runs', `${id}.labels`), { force: true });
}

/** The workflows sdlc's render gives a factory made from it, which the board's first card picks quick among. */
const SDLC_WORKFLOWS = ['build', 'intake', 'janitor', 'quick'];

/** The folder the store keeps beside the factory `name`'s file: its rendered tree, which its removal leaves. */
const factoryFolder = (name: string) => {
  if (store === undefined) throw new Refused("the worker's store is not known, so the made factory's folder cannot be named");
  return path.join(store, 'factories', name);
};

/**
 * The factory `name`'s tree given `workflows`, as the daemon's render of its template writes its wiring (`tree/factory.json`): the
 * worker's api ticks nothing, so a factory just made from a template offers none until a pass renders it, and a templated factory reads
 * its workflows from its tree, never its file. The folder is taken back whole at the page's end (`factoryFolder`).
 * @param name The factory's name.
 * @param workflows The workflows its render offers.
 */
function rendered(name: string, workflows: readonly string[]) {
  const tree = path.join(factoryFolder(name), 'tree');
  fs.mkdirSync(tree, { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows, hires: {} }, null, 2));
}

/**
 * The first card, at `/welcome/card` for the factory made: a suggestion taken, the cost line drawn above Start, and Start filing the
 * card through the real api, labelled as the first card, then starting it in quick gated at its landing, the start answered here with a
 * seeded run at a gate, whose page the board opens. The card filed is answered back in `filed`.
 */
async function startsTheFirstCard(page: Page, filed: string[]) {
  rendered(MADE, SDLC_WORKFLOWS);
  await page.goto(new URL('/welcome/card', page.url()).href);
  await idle(page);
  const card = page.locator('article[data-first-card="write"]');
  await expectVisible(card, 'the first card page offers to write a card, at /welcome/card');
  const choice = card.locator(`[data-first-factory="${MADE}"]`);
  if ((await choice.count()) > 0) await choice.click();
  await card.locator('[data-first-suggestion]').first().click();
  const offered = card.locator('[data-first-workflow]');
  if ((await offered.count()) > 0) await offered.first().click();
  await expectVisible(card.locator('[data-cost-line]'), 'the cost line stands above Start');
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-card-${await themeOf(page)}.png`));
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/namespaces/${MADE}/cards`,
  );
  const started: unknown[] = [];
  const start = (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    started.push(route.request().postDataJSON());
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- the start answered: a real one runs a session on the seat's harness
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: GATED.id, card: name }) });
  };
  await page.route(`**/api/namespaces/${MADE}/cards/*/start`, start);
  try {
    await card.locator('[data-first-start]').click();
    const answer = await made;
    const body = (await answer.json().catch(() => undefined)) as { metadata?: { name?: string; labels?: Record<string, string> } };
    if (body?.metadata?.name !== undefined) filed.push(body.metadata.name);
    if (answer.status() !== 201 || body?.metadata?.labels?.onboarding !== 'first-card')
      throw new Refused(`Start files the card labelled ${FIRST_LABEL} — the api answered ${answer.status()} ${JSON.stringify(body)}`);
    await page.waitForURL((url) => url.pathname.endsWith(`/runs/${GATED.id}`));
    const asked = started[0] as { workflow?: string; gates?: string[] } | undefined;
    if (asked?.workflow !== 'quick' || JSON.stringify(asked.gates) !== JSON.stringify(['land']))
      throw new Refused(`Start starts the card in quick, gated at land — it sent ${JSON.stringify(asked)}`);
  } finally {
    await page.unroute(`**/api/namespaces/${MADE}/cards/*/start`, start);
  }
}

/** The run `id`'s page, labelled as a first card's, drawing the hint of `beat`. */
async function hints(page: Page, id: string, beat: 'gate' | 'landed') {
  await labelRun(page, id, [FIRST_LABEL]);
  await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
  await expectVisible(page.locator(`aside[data-first-hint="${beat}"]`), `a first card's run, ${id}, says the ${beat} beat on its page`);
  await settled(page);
  await photograph(page, path.join(OUT, `welcome-hint-${beat}-${await themeOf(page)}.png`));
}

/**
 * The first card's whole way: started (`startsTheFirstCard`), its gate's hint on the seeded gated run labelled as the first card, its
 * landed hint on the seeded landed run, whose button leads to "You are set", drawing its three next steps once the milestones say a
 * change landed. The labels and the card are taken back.
 */
async function runsTheFirstCard(page: Page, milestones: { answer: object }) {
  const filed: string[] = [];
  try {
    await startsTheFirstCard(page, filed);
    await hints(page, GATED.id, 'gate');
    await hints(page, LANDED.id, 'landed');
    milestones.answer = ALL_DONE;
    await page.locator('aside[data-first-hint="landed"] [data-first-next]').click();
    await page.waitForURL((url) => url.pathname === '/welcome/next');
    await idle(page);
    await expectVisible(page.locator('article[data-you-are-set="set"]'), 'a change landed: the last page says You are set');
    await expectVisible(page.locator('[data-next-step="level"]'), 'its first next step is the level of the factory');
    await expectVisible(page.locator('[data-next-step="terminal"]'), 'and one is the terminal');
    await settled(page);
    await photograph(page, path.join(OUT, `welcome-next-${await themeOf(page)}.png`));
  } finally {
    milestones.answer = FACTORY_NEXT;
    await unlabelRun(page, GATED.id);
    await unlabelRun(page, LANDED.id);
    for (const name of filed) await asked(page, 'DELETE', `/api/namespaces/${MADE}/cards/${encodeURIComponent(name)}`);
  }
}

/** The planted folders taken away. */
function takeBackFolders() {
  for (const name of ['plain', 'work']) fs.rmSync(path.join(folderRoot(), name), { recursive: true, force: true });
}

/** Activate starts the install's first fix, held here as `660-setup` holds it: the start answered, its output streamed and ended. */
async function holdInstall(page: Page, sent: unknown[]) {
  const made = (phase: 'pending' | 'succeeded') => ({ id: 'fix-e2e-welcome', need: 'claude', phase, output: '' });
  const start = (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.push(route.request().postDataJSON());
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- a start answered: no harness runs in the e2e's store
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(made('pending')) });
  };
  const output = (route: Route) =>
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- its output answered: no harness runs in the e2e's store
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: `event: output\ndata: added 1 package\n\nevent: ended\ndata: ${JSON.stringify(made('succeeded'))}\n\n`,
    });
  await page.route('**/api/readiness/fixes', start);
  await page.route('**/api/readiness/fixes/*/output', output);
  return (async () => {
    await page.unroute('**/api/readiness/fixes', start);
    await page.unroute('**/api/readiness/fixes/*/output', output);
  }) satisfies () => Promise<void>;
}

/**
 * The board's reads made again as a person coming back to its tab makes them (TanStack Query's refetch on focus): the welcome, once a
 * harness is installed, is no longer asked, so a reload would leave it.
 */
async function readAgain(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await idle(page);
}

/** The two ticks drawn on the welcome, the version's and the turn's, in `states`. */
async function drawsTicks(page: Page, states: readonly [Check['state'], Check['state']]) {
  const checks = page.locator('article[data-welcome] [data-harness-checks="claude"]');
  await expectVisible(checks, 'the welcome draws the harness’s checks under it');
  await expectVisible(checks.locator(`[data-harness-check="version"][data-check-state="${states[0]}"]`), `the version tick, ${states[0]}`);
  await expectVisible(checks.locator(`[data-harness-check="turn"][data-check-state="${states[1]}"]`), `the turn tick, ${states[1]}`);
}

export default {
  /**
   * The welcome, over readiness reads it answers in place of the api's: `/` on a fresh store lands on `/welcome`; Activate starts the
   * install piece's first fix; a turn failed and both passed are drawn as their ticks, Next shown once both passed, leading to the
   * factory step, where sdlc is applied through the real api (`makesFromTemplate`, the milestones answered too: factory next), and on to
   * the volume step, where a folder planted under the listing's root is given it (`givesAFolder`), and on to the first card, its hints on
   * a run's page and "You are set" (`runsTheFirstCard`); and the skip leaves for `/`, under the Setup banner, which no longer sends that
   * browser to the welcome. The factory, its folders, the card, the labels and the skip are taken back.
   */
  name: 'welcome',
  route: '/setup',
  expect: async (page) => {
    let planted: keyof typeof READS = 'fresh';
    const answer = (route: Route) =>
      route.request().method() === 'GET'
        ? // oxlint-disable-next-line landmines-testing/no-test-doubles -- readiness planted: the seat's machine has its own
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ready: false, ran: false, pieces: READS[planted] }),
          })
        : route.fallback();
    const held: { answer: object } = { answer: FACTORY_NEXT };
    const milestones = (route: Route) =>
      route.request().method() === 'GET'
        ? // oxlint-disable-next-line landmines-testing/no-test-doubles -- milestones planted: the seat's machine has its own
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(held.answer) })
        : route.fallback();
    await page.route(READINESS_ROUTE, answer);
    await page.route(MILESTONES_ROUTE, milestones);
    const sent: unknown[] = [];
    const unhold = await holdInstall(page, sent);
    try {
      await page.goto(new URL('/', page.url()).href);
      await idle(page);
      if (new URL(page.url()).pathname !== '/welcome') throw new Refused(`a fresh store's / lands on /welcome — it is at ${page.url()}`);
      const welcome = page.locator('article[data-welcome]');
      await expectVisible(
        welcome.locator('[data-harness-option="claude"] [data-harness-activate]'),
        'the welcome offers to activate claude',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `welcome-fresh-${await themeOf(page)}.png`));
      planted = 'turnFailed';
      await welcome.locator('[data-harness-option="claude"] [data-harness-activate]').click();
      await expectVisible(welcome.locator('section[data-fix-run="claude"]'), 'Activate starts the install, its run drawn on the welcome');
      const start = sent[0] as { need?: string; index?: number } | undefined;
      if (start?.need !== 'claude' || (start.index ?? 0) !== 0)
        throw new Refused(`Activate starts the install piece's first fix (claude, index 0) — it sent ${JSON.stringify(start)}`);
      await drawsTicks(page, ['passed', 'failed']);
      await expectCount(welcome.locator('[data-welcome-next]'), 0, 'a check failed: no Next');
      planted = 'ready';
      await readAgain(page);
      await drawsTicks(page, ['passed', 'passed']);
      await expectVisible(welcome.locator('[data-welcome-next]'), 'both checks passed: Next names what comes next');
      await settled(page);
      await photograph(page, path.join(OUT, `welcome-ready-${await themeOf(page)}.png`));
      await makesFromTemplate(page);
      await givesAFolder(page);
      await runsTheFirstCard(page, held);

      planted = 'fresh';
      await page.goto(new URL('/welcome/', page.url()).href);
      await idle(page);
      await expectVisible(
        welcome,
        "fresh again, the installer's address, /welcome/ (its base, `/welcome`, with `/?link=`), opens the welcome",
      );
      await welcome.locator('[data-welcome-skip]').click();
      await page.waitForURL((url) => url.pathname === '/');
      await idle(page);
      await expectVisible(page.locator('[data-setup-banner]'), 'skipped, the board stands under the Setup banner');
      await page.goto(new URL('/', page.url()).href);
      await idle(page);
      if (new URL(page.url()).pathname !== '/') throw new Refused(`skipped in this browser, / stays / — it went to ${page.url()}`);
    } finally {
      await asked(page, 'DELETE', `/api/factories/${MADE}`);
      if (store !== undefined) fs.rmSync(factoryFolder(MADE), { recursive: true, force: true });
      takeBackFolders();
      await page.unroute(MILESTONES_ROUTE, milestones);
      await page.evaluate((key) => localStorage.removeItem(key), HARNESS_SKIP_KEY);
      await unhold();
      await page.unroute(READINESS_ROUTE, answer);
    }
    const gone = await asked(page, 'GET', `/api/factories/${MADE}`);
    if (gone.status !== 404) throw new Refused(`${MADE} is taken back — the api still reads it, ${gone.status}`);
  },
} satisfies PageSpec;
