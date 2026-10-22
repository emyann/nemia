import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
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
 * The words a chip may carry here. The seat's `claude` answers the SDK's status request with an empty success, so no server is named in
 * the answer and each is `pending`; where the SDK could not be spoken to at all the states are unread, which is not an absence. Any
 * other word would mean the board read a state nobody reported.
 */
const CHIPS = ['pending', 'unread'];

/** The record as it stands in the store, by server name, read as the package writes it (`{ servers }`). */
const recorded = (file: string): Record<string, { url?: string; headers?: Record<string, string> }> =>
  fs.existsSync(file)
    ? ((JSON.parse(fs.readFileSync(file, 'utf8')) as { servers?: Record<string, { url?: string; headers?: Record<string, string> }> })
        .servers ?? {})
    : {};

/** The answer to the next `method` on a server's own route under the factory. */
const answered = (page: Page, method: 'PUT' | 'DELETE') =>
  page.waitForResponse(
    (r) => r.request().method() === method && new URL(r.url()).pathname.startsWith(`/api/factories/${FACTORY}/servers/`),
    { timeout: WAIT_MS },
  );

/** Press `button` in the section, wait for the api's answer to `method`, and refuse any but a 200. */
async function wrote(page: Page, section: Locator, button: string, method: 'PUT' | 'DELETE'): Promise<void> {
  const [answer] = await Promise.all([answered(page, method), section.getByRole('button', { name: button, exact: true }).click()]);
  if (answer.status() !== 200) throw new Refused(`${button} writes — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
}

/** Each recorded server is a row, with a state the harness reported or none read, its address, its headers and its sign-in facts. */
async function expectRows(section: Locator): Promise<void> {
  await expectCount(section.locator('[data-factory-server]'), 2, 'each server of the record is a row, once');
  const row = section.locator('[data-factory-server="github"]');
  await expectVisible(row.getByText(RECORDED.github.url, { exact: false }), "a row shows the server's address");
  await expectVisible(row.locator('[data-server-headers]', { hasText: 'X-MCP-Toolsets' }), 'and the headers it is reached with');
  await expectVisible(row.locator('[data-server-oauth]', { hasText: 'Iv23li-e2e' }), 'and the client it signs in as');
  for (const name of ['github', 'docs']) {
    const chip = section.locator(`[data-factory-server="${name}"] [data-server-state]`);
    const word = await chip.getAttribute('data-server-state');
    if (word === null || !CHIPS.includes(word))
      throw new Refused(`${name}'s chip says a state the harness reported, or that none was read — it says ${JSON.stringify(word)}`);
    if (!(await chip.getAttribute('title'))) throw new Refused(`${name}'s chip says in its title what its word means`);
  }
}

/**
 * Press Check again, which is the card's own interaction: the states are read when the page opens and on this press alone, never on
 * the board's poll. The press must make the read happen again — a refetch wired to another query key, or a press left disabled, would
 * draw the same rows off the cache and nothing else would notice — so the page waits for the api's own answer to the read and reads
 * the rows off what came back.
 */
async function checkAgain(page: Page, section: Locator): Promise<void> {
  const read = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === `/api/factories/${FACTORY}/servers`,
    { timeout: WAIT_MS },
  );
  const [answer] = await Promise.all([read, section.getByRole('button', { name: 'Check again', exact: true }).click()]);
  if (answer.status() !== 200)
    throw new Refused(`Check again reads the states — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
  await expectRows(section);
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

export default {
  /**
   * A factory's MCP servers on its settings page: the two the record holds, each a row with the state its harness reported — or none
   * read, drawn as unread, which is not an absence — its address, its headers and the client it signs in as. The section says the
   * servers are handed to the steps whose agent names one, before the checkout's `.mcp.json`, and that the state is read on load and on
   * a press alone, which Check again then does. The form records a remote server, which lands in the store's record and in the list, and
   * Remove takes it off again. The record is taken back whatever happens.
   *
   * What the api refuses of a record — an `Authorization` header, a local server — is proven in its own tests
   * (`apps/api/src/servers/servers.test.ts`, each answered 422 by name) and not driven through the board, since the e2e's watch counts
   * every 4xx against a page and a `PageSpec` has no way to expect one (`checks.ts`, `visit.ts`): the rule `350-lift.ts` states. What
   * a refusal looks like drawn is the `ServerForm` stories' business, as the chips' colours are `ServerState`'s.
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
      await page.reload({ waitUntil: 'load' });
      await idle(page);
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
      await expectRows(section);
      await checkAgain(page, section);
      await settled(page);
      await photograph(page, path.join(OUT, `factory-servers-listed-${await themeOf(page)}.png`), { fullPage: true });
      await recordAndRemove(page, section, file);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
      harnessWas();
    }
  },
} satisfies PageSpec;
