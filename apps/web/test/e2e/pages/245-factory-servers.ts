import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Request, Route } from 'playwright';
import { HEADER_MASK, type McpServerList } from 'objects';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory whose record the page reads and writes: `bare`, which no other page writes a record for. */
const FACTORY = FACTORIES.bare;

/** The record the page is given before it loads: a server that signs in, and one on the other transport. */
const RECORDED = {
  github: {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { 'X-MCP-Toolsets': 'actions,repos' },
    oauth: { clientId: 'Iv23li-e2e', callbackPort: 33418 },
  },
  docs: { type: 'sse', url: 'https://docs.example/mcp' },
};

/** The server the page records through the form, and takes off again. */
const ADDED = { name: 'linear', url: 'https://mcp.linear.app/mcp', header: 'X-Team=nemia' };

/**
 * The five words a harness has for a server's state, as the runtime carries them (`MCP_STATES`), and the board's word for none read.
 * A word outside this set means a harness grew one nobody has read, which the board draws as read and concludes nothing from.
 *
 * Which of them each server carries is not fixed here, and no seat of the e2e makes it so: the states are read by a real harness
 * session — the Agent SDK's own bundled Claude Code, not the `claude` first on the api's PATH, since the read names no executable —
 * and that session dials the recorded addresses for real. So `docs`, an address that answers nothing, reads `pending` while its connect
 * is still open and `failed` once the connect has failed, by how far the session got before it answered. The page holds every chip to
 * the state the api answered instead, which is the board's own promise and is true whatever the harness said.
 */
const HARNESS_STATES = ['connected', 'needs-auth', 'failed', 'pending', 'disabled'];

/** The word the board shows where no state was read (`UNREAD_STATE`), which is not an absence. */
const UNREAD = 'unread';

/** The state the api answered for each server of the record, by name: the harness's own word, or `null` where the look failed. */
type States = Map<string, string | null>;

/** The record as it stands in the store, by server name, read as the package writes it (`{ servers }`). */
const recorded = (file: string): Record<string, { url?: string; headers?: Record<string, string> }> =>
  fs.existsSync(file)
    ? ((JSON.parse(fs.readFileSync(file, 'utf8')) as { servers?: Record<string, { url?: string; headers?: Record<string, string> }> })
        .servers ?? {})
    : {};

/** Whether `request` is a read of the factory's servers, which is what reads their states. */
const isStatesRead = (request: Request): boolean =>
  request.method() === 'GET' && new URL(request.url()).pathname === `/api/namespaces/${FACTORY}/mcpservers`;

/**
 * The api's own answer to a states read, as a map by name, around `act` — the page's load, or a press of Check again — and the network
 * idle after it. A read is made on those two alone, once each, never on the board's poll nor again on the page's mount or focus: every
 * read issued from the start of `act` until the network idles is counted, one is refused but exactly one, and the answer the chips are
 * judged against is that read's, so it is the one that drew them — never a read an earlier navigation left in flight.
 */
async function statesRead(page: Page, what: string, act: () => Promise<unknown>): Promise<States> {
  const reads: Request[] = [];
  const count = (request: Request) => {
    if (isStatesRead(request)) reads.push(request);
  };
  page.on('request', count);
  try {
    await act();
    await idle(page);
  } finally {
    page.off('request', count);
  }
  if (reads.length !== 1) throw new Refused(`${what} reads the states once — it read them ${reads.length} times`);
  const answer = await reads[0].response();
  if (!answer) throw new Refused(`${what} reads the states — the read got no answer`);
  if (answer.status() !== 200) throw new Refused(`${what} reads the states — the api answered ${answer.status()}: ${await answer.text()}`);
  const body = (await answer.json()) as McpServerList;
  const states: States = new Map();
  for (const s of body.items) states.set(s.metadata.name, s.status?.state ?? null);
  return states;
}

/** The answer to the next `method` on a server's own route under the factory. */
const answered = (page: Page, method: 'PUT' | 'DELETE') =>
  page.waitForResponse(
    (r) => r.request().method() === method && new URL(r.url()).pathname.startsWith(`/api/namespaces/${FACTORY}/mcpservers/`),
    { timeout: WAIT_MS },
  );

/** Press `button` in the section, wait for the api's answer to `method`, and refuse any but a 200. */
async function wrote(page: Page, section: Locator, button: string, method: 'PUT' | 'DELETE'): Promise<void> {
  const [answer] = await Promise.all([answered(page, method), section.getByRole('button', { name: button, exact: true }).click()]);
  if (answer.status() !== 200) throw new Refused(`${button} writes — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
}

/**
 * Each recorded server is a row, with the state the api answered for it, its address, its headers and its sign-in facts. The chip
 * carries the harness's own word, or `unread` where none was read: a chip that said another state than the one the answer held — the
 * last read's word left on a stale cache, a word invented for an absence — would be the board reporting a state nobody did.
 */
async function expectRows(section: Locator, states: States): Promise<void> {
  await expectCount(section.locator('[data-factory-server]'), 2, 'each server of the record is a row, once');
  const row = section.locator('[data-factory-server="github"]');
  await expectVisible(row.getByText(RECORDED.github.url, { exact: false }), "a row shows the server's address");
  await expectVisible(
    row.locator('[data-server-headers]', { hasText: `X-MCP-Toolsets: ${HEADER_MASK}` }),
    'and the headers it is reached with, each value masked',
  );
  await expectCount(row.getByText(RECORDED.github.headers['X-MCP-Toolsets'], { exact: false }), 0, "a header's value is never shown");
  await expectVisible(row.locator('[data-server-oauth]', { hasText: 'Iv23li-e2e' }), 'and the client it signs in as');
  for (const name of ['github', 'docs']) {
    const state = states.get(name);
    if (state === undefined)
      throw new Refused(
        `the api answers a state for \`${name}\`, which the record holds — it answered for ${JSON.stringify([...states.keys()])}`,
      );
    if (state !== null && !HARNESS_STATES.includes(state))
      throw new Refused(
        `\`${name}\`'s state is a word a harness has (${HARNESS_STATES.join(', ')}) or none read — the api answered ${JSON.stringify(state)}`,
      );
    const chip = section.locator(`[data-factory-server="${name}"] [data-server-state]`);
    const word = await chip.getAttribute('data-server-state');
    if (word !== (state ?? UNREAD))
      throw new Refused(
        `${name}'s chip says the state the api answered, ${JSON.stringify(state ?? UNREAD)} — it says ${JSON.stringify(word)}`,
      );
    if (!(await chip.getAttribute('title'))) throw new Refused(`${name}'s chip says in its title what its word means`);
    await expectSignIn(section, name, state);
  }
}

/**
 * A row offers the sign-in its state asks for, and no other: Sign in where the api answered `needs-auth` for a server with an OAuth
 * client, Sign out where it answered `connected`, neither for any other state or a server with no client (`docs`). Neither is pressed:
 * the states come from a real harness session, and a press would write that harness's own store.
 */
async function expectSignIn(section: Locator, name: string, state: string | null): Promise<void> {
  const row = section.locator(`[data-factory-server="${name}"]`);
  const signs = name in RECORDED && 'oauth' in RECORDED[name as keyof typeof RECORDED];
  const offered = signs && state === 'needs-auth' ? 'Sign in' : signs && state === 'connected' ? 'Sign out' : null;
  for (const button of ['Sign in', 'Sign out']) {
    const shown = await row.getByRole('button', { name: button, exact: true }).count();
    if (shown !== (button === offered ? 1 : 0))
      throw new Refused(
        `${name}, answered ${JSON.stringify(state)}, ${button === offered ? 'offers' : 'does not offer'} ${button} — it shows ${shown}`,
      );
  }
}

/**
 * Press Check again, which is the card's own interaction: the states are read when the page opens and on this press alone, never on
 * the board's poll. The press must make the read happen again — a refetch wired to another query key, or a press left disabled, would
 * draw the same rows off the cache and nothing else would notice — so the page waits for the api's own answer to the read and reads
 * the rows off what came back.
 */
async function checkAgain(page: Page, section: Locator): Promise<void> {
  const states = await statesRead(page, 'Check again', () => section.getByRole('button', { name: 'Check again', exact: true }).click());
  await expectRows(section, states);
}

/** The form records a remote server, which the store's record holds and the list draws; Remove takes it off again. */
async function recordAndRemove(page: Page, section: Locator, file: string): Promise<void> {
  await section.getByRole('textbox', { name: 'Name' }).fill(ADDED.name);
  await section.getByRole('textbox', { name: 'Address' }).fill(ADDED.url);
  await section.getByRole('textbox', { name: 'Headers' }).fill(ADDED.header);
  await wrote(page, section, 'Record', 'PUT');
  const held = recorded(file)[ADDED.name];
  if (held?.url !== ADDED.url || held.headers?.['X-Team'] !== 'nemia')
    throw new Refused(`recorded, the server is the factory's record — it holds ${JSON.stringify(held)}`);
  await expectVisible(section.locator('[data-servers-done]', { hasText: 'Recorded' }), 'the page says what a run does with it now');
  await expectVisible(section.locator(`[data-factory-server="${ADDED.name}"]`), 'and the server is a row of the list');
  await settled(page);
  await photograph(page, path.join(OUT, `factory-servers-recorded-${await themeOf(page)}.png`), { fullPage: true });
  const row = section.locator(`[data-factory-server="${ADDED.name}"]`);
  const [answer] = await Promise.all([answered(page, 'DELETE'), row.getByRole('button', { name: 'Remove', exact: true }).click()]);
  if (answer.status() !== 200) throw new Refused(`Remove writes — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
  if (ADDED.name in recorded(file)) throw new Refused(`removed, the server is off the record — it holds ${JSON.stringify(recorded(file))}`);
  await expectCount(section.locator(`[data-factory-server="${ADDED.name}"]`), 0, 'and it is no longer a row');
  await expectVisible(section.locator('[data-servers-done]', { hasText: 'Removed' }), 'the page says what a step naming it resolves now');
}

/**
 * A recorded server loaded back into the form carries each header as the mask it was read with, and Record sends it back unchanged:
 * the store's record keeps the value it held, never the mask.
 */
async function keepsTheMask(page: Page, section: Locator, file: string): Promise<void> {
  await section.locator('[data-server-recorded]').getByRole('button', { name: 'github', exact: true }).click();
  const header = await section.getByRole('textbox', { name: 'Headers' }).inputValue();
  if (header !== `X-MCP-Toolsets=${HEADER_MASK}`)
    throw new Refused(`the form holds the header as the mask — it holds ${JSON.stringify(header)}`);
  await wrote(page, section, 'Record', 'PUT');
  const held = recorded(file).github?.headers?.['X-MCP-Toolsets'];
  if (held !== RECORDED.github.headers['X-MCP-Toolsets'])
    throw new Refused(`the mask sent back keeps the value recorded — the record holds ${JSON.stringify(held)}`);
}

/**
 * The harness's own folder in the store (`CLAUDE_CONFIG_DIR`) as it stands, and a call that puts it back. Reading a state starts a
 * short-lived harness session, which writes its own files there — its config, a backup of it, its credentials, its cache of the servers
 * that need a sign-in — none of them the page's subject and none of them the store's seed: the page takes them back itself rather than
 * the e2e's leftover watch being told to ignore a folder another page asserts on.
 */
function harnessFolder(): () => void {
  const dir = path.join(store!, 'claude');
  const was = new Map<string, Buffer>();
  for (const rel of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const file = path.join(dir, rel);
    if (fs.statSync(file).isFile()) was.set(rel, fs.readFileSync(file));
  }
  return () => {
    for (const rel of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      const file = path.join(dir, rel);
      if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
      const bytes = was.get(rel);
      if (bytes === undefined) fs.rmSync(file);
      else if (!bytes.equals(fs.readFileSync(file))) fs.writeFileSync(file, bytes);
    }
  };
}

/** What a person pastes back on the paste page: the address the browser landed on, with a code and a state, and one that is not it. */
const PASTE = {
  landed: `http://localhost:${RECORDED.github.oauth.callbackPort}/callback?code=e2e-code&state=e2e-state`,
  wrong: `http://localhost:${RECORDED.github.oauth.callbackPort}/callback?state=e2e-state`,
};

/** The path of `github`'s own route under the factory, and `sub` under it. */
const githubAt = (sub = '') => `/api/namespaces/${FACTORY}/mcpservers/github${sub}`;

/**
 * A sign-in completed by pasting back the address the browser landed on, on a page of its own whose watch expects its one refusal.
 *
 * The e2e's api runs the real engine, whose sign-in opens a real harness session against GitHub and writes that harness's own store, so
 * a sign-in is never started for real here: the page holds, by `route`, the four reads and writes a sign-in makes — the servers' read
 * (github answered `needs-auth`, then `connected` once the paste was taken), the press of Sign in (an address answered, nothing
 * spawned), the sign-in's state (`waiting`, then `connected`) and the paste of the landed address (its state answered). A paste that is
 * not that address goes to the api itself, where no sign-in waits: it is refused, 409, and the panel shows the api's own words, the
 * field still holding what was pasted. What the engine does with a paste is the runtime's and the api's tests' (`mcpSignInCallback`,
 * `apps/api/test/sign-in.boundary.test.ts`).
 */
async function pastesBack(page: Page): Promise<void> {
  const other = await page.context().newPage();
  try {
    const { problems } = watch(other);
    let taken = false;
    const until = new Date(Date.now() + 300_000).toISOString();
    const answer = (route: Route, json: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    await other.route(
      (url) => url.pathname === `/api/namespaces/${FACTORY}/mcpservers`,
      async (route) => {
        const read = await route.fetch();
        const list = (await read.json()) as McpServerList;
        const items = list.items.map((s) =>
          s.metadata.name === 'github' ? { ...s, status: { ...s.status, state: taken ? 'connected' : 'needs-auth' } } : s,
        );
        await route.fulfill({ response: read, json: { ...list, items } });
      },
    );
    await other.route(
      (url) => url.pathname === githubAt('/sign-in'),
      (route) =>
        route.request().method() === 'POST'
          ? answer(route, {
              authUrl: `https://github.com/login/oauth/authorize?client_id=${RECORDED.github.oauth.clientId}&state=e2e`,
              until,
            })
          : answer(route, taken ? { state: 'connected' } : { state: 'waiting', until }),
    );
    await other.route(
      (url) => url.pathname === githubAt('/sign-in/callback'),
      async (route) => {
        const { url } = (route.request().postDataJSON() ?? {}) as { url?: string };
        if (url !== PASTE.landed) return route.continue();
        taken = true;
        return answer(route, { state: 'waiting', until });
      },
    );
    await other.goto(page.url(), { waitUntil: 'load' });
    await idle(other);
    const row = other.locator('section[data-factory-servers] [data-factory-server="github"]');
    await row.getByRole('button', { name: 'Sign in', exact: true }).click();
    const panel = row.locator('[data-server-sign-in="waiting"]');
    await expectVisible(panel.locator('[data-sign-in-link]'), 'a sign-in started waits, with the address to open');
    const field = panel.getByRole('textbox', { name: 'the address your browser landed on' });
    await expectVisible(field, 'and a field to paste the address the browser landed on');
    const complete = panel.getByRole('button', { name: 'Complete', exact: true });

    await field.fill(PASTE.wrong);
    const [refused] = await Promise.all([
      other.waitForResponse((r) => new URL(r.url()).pathname === githubAt('/sign-in/callback'), { timeout: WAIT_MS }),
      complete.click(),
    ]);
    const { error } = (await refused.json()) as { error?: string };
    if (refused.status() !== 409 || !error)
      throw new Refused(`a paste where no sign-in waits is refused — the api answered ${refused.status()}: ${JSON.stringify(error)}`);
    const said = panel.locator('[data-sign-in-refused]');
    await expectVisible(said, 'the refusal is said in the panel');
    if ((await said.textContent()) !== error)
      throw new Refused(
        `the panel says the api's words — it says ${JSON.stringify(await said.textContent())}, the api ${JSON.stringify(error)}`,
      );
    if ((await field.inputValue()) !== PASTE.wrong) throw new Refused('the field still holds what was pasted after a refusal');
    await settled(other);
    await photograph(other, path.join(OUT, `factory-servers-paste-refused-${await themeOf(other)}.png`), { fullPage: true });

    await field.fill(PASTE.landed);
    const [handed] = await Promise.all([
      other.waitForResponse((r) => new URL(r.url()).pathname === githubAt('/sign-in/callback'), { timeout: WAIT_MS }),
      complete.click(),
    ]);
    if (handed.status() !== 200) throw new Refused(`the landed address is taken — it was answered ${handed.status()}`);
    await expectVisible(row.locator('[data-server-sign-in="connected"]'), 'the sign-in reads connected once the paste was taken');
    await expectVisible(row.locator('[data-server-state="connected"]'), "and the servers are read again: the row's chip says connected");
    await expectCount(row.locator('[data-sign-in-refused]'), 0, 'and the refusal is gone');
    await idle(other);
    const expected = `request answered 409: POST ${refused.url()}`;
    const seen = problems();
    const others = seen.filter(
      (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
    );
    if (!seen.includes(expected) || others.length)
      throw new Refused(`the paste page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
  } finally {
    await other.close();
  }
}

export default {
  /**
   * A factory's MCP servers on its settings page: the two the record holds, each a row with the state its harness reported — or none
   * read, drawn as unread, which is not an absence — its address, its headers and the client it signs in as. Each chip is held to the
   * state the api answered for that server, not to a word fixed here: the read starts a real harness session that dials the recorded
   * addresses, so which word comes back is the network's and the harness's, and what the page is about is that the board carries it.
   * The section says the servers are handed to the steps whose agent names one, before the checkout's `.mcp.json`, and that the state
   * is read on load and on a press alone, which Check again then does. The form records a remote server, which lands in the store's
   * record and in the list, and Remove takes it off again; a header's value is shown as the mask, and a recorded server loaded back
   * into the form and recorded again keeps the value the record holds. A sign-in waiting is completed by pasting back the address the
   * browser landed on, and a paste the api refuses is said in the panel (`pastesBack`). The record is taken back whatever happens.
   *
   * What the api refuses of a record — an `Authorization` header, a local server — is proven in its own tests of the McpServer's
   * write, each answered 422 by name, and not driven through the board, since the e2e's watch counts every 4xx against a page and a
   * `PageSpec` has no way to expect one (`checks.ts`, `visit.ts`): the rule `350-lift.ts` states. What a refusal
   * looks like drawn is the `ServerForm` stories' business, as the chips' colours are `ServerState`'s.
   */
  name: 'factory-servers',
  route: `/factories/${FACTORY}/settings`,
  expect: async (page) => {
    const folder = path.join(store!, 'factories', FACTORY);
    const file = path.join(folder, 'servers.json');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ servers: RECORDED }, null, 2)}\n`);
    const harnessWas = harnessFolder();
    try {
      const states = await statesRead(page, "the page's load", () => page.reload({ waitUntil: 'load' }));
      const section = page.locator('section[data-factory-servers]');
      await expectVisible(section, "the factory's servers are a section of its settings");
      await expectVisible(
        section.locator('[data-servers-told]', { hasText: 'before the checkout' }),
        'the section says the record is resolved before the checkout',
      );
      await expectVisible(
        section.locator('[data-servers-told]', { hasText: 'read when this page opens and when you press Check again' }),
        'and that a state is read on load and on a press, never on the poll',
      );
      await expectRows(section, states);
      await checkAgain(page, section);
      await settled(page);
      await photograph(page, path.join(OUT, `factory-servers-listed-${await themeOf(page)}.png`), { fullPage: true });
      await recordAndRemove(page, section, file);
      await keepsTheMask(page, section, file);
      await pastesBack(page);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
      harnessWas();
    }
  },
} satisfies PageSpec;
