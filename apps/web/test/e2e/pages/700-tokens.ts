import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { mintPersonToken, SEAT_TOKEN } from '../served.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The person's token the page mints and retires. */
const RETIRED = 'e2e-retire';

/** The agent's token the page mints beside it: bound to no factory, narrowed to reading. */
const AGENT = { name: 'e2e-ops', agent: 'operator' } as const;

/** The row of the token `name` in the page's table. */
const rowOf = (page: Page, name: string) => page.locator(`[data-tokens-page="loaded"] tr[data-token="${name}"]`);

/** The token files under the store's `person-tokens/`, by name. */
const tokenFiles = (): Set<string> => new Set(fs.readdirSync(path.join(store!, 'person-tokens')));

/** Refuses unless the row of `name` says its holder, its factory and its narrowing as the board words them. */
async function rowSays(page: Page, name: string, [holder, factory, narrowed]: readonly [string, string, string]): Promise<void> {
  const row = rowOf(page, name);
  await expectVisible(row, `the token ${name} is listed`);
  await expectTexts(row.locator('[data-token-holder]'), [holder], `${name} is held by ${holder}`);
  await expectTexts(row.locator('[data-token-factory]'), [factory], `${name} reaches ${factory}`);
  await expectTexts(row.locator('[data-token-narrowed]'), [narrowed], `${name} is narrowed: ${narrowed}`);
  await expectCount(row.locator('[data-token-minted] time'), 1, `${name} says when it was minted`);
}

/** The Retire of `name`, asked once and confirmed: `DELETE /api/tokens/{name}` answered 200, its row and its record gone. */
async function retires(page: Page, name: string, before: ReadonlySet<string>): Promise<void> {
  await rowOf(page, name).locator(`[data-token-retire="${name}"]`).click();
  const confirm = page.locator(`[data-token-confirm="${name}"]`);
  await expectVisible(confirm, 'Retire asks once before anything is sent');
  await settled(page);
  await photograph(page, path.join(OUT, `tokens-confirm-${await themeOf(page)}.png`));
  const [answered] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/tokens/${encodeURIComponent(name)}`,
      { timeout: WAIT_MS },
    ),
    confirm.locator('[data-token-confirm-press]').click(),
  ]);
  if (answered.status() !== 200) throw new Refused(`the api retires ${name} — DELETE answered ${answered.status()}`);
  await expectCount(rowOf(page, name), 0, `${name} is gone from the list, read again`);
  await expectCount(confirm, 0, 'and the ask is closed');
  const left = [...tokenFiles()].filter((file) => !before.has(file));
  if (left.length !== 1)
    throw new Refused(`the store keeps no record of ${name} once retired — it keeps ${left.join(', ')} beside the seed`);
}

export default {
  /**
   * Settings' Tokens lists the store's standing tokens: the seat's own, the person's (`yours`, store-wide, not narrowed), and an agent's
   * minted beside it by hand (its agent's name, store-wide, narrowed to reading), each with when it was minted. A person's token minted
   * for the page is retired from its row, asked once, and is gone from the list and the store; the agent's is taken back at the end.
   */
  name: 'tokens',
  route: '/tokens',
  expect: async (page) => {
    const before = tokenFiles();
    try {
      mintPersonToken(store!, RETIRED);
      mintPersonToken(store!, AGENT.name, { kind: 'agent', agent: AGENT.agent, factory: null, narrowed: 'read' });
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await rowSays(page, SEAT_TOKEN, ['yours', 'store-wide', '—']);
      await rowSays(page, RETIRED, ['yours', 'store-wide', '—']);
      await rowSays(page, AGENT.name, [AGENT.agent, 'store-wide', 'read']);
      await settled(page);
      await photograph(page, path.join(OUT, `tokens-list-${await themeOf(page)}.png`));
      await retires(page, RETIRED, before);
      await expectVisible(rowOf(page, SEAT_TOKEN), "the seat's own token is still listed, and this browser still reads with it");
    } finally {
      for (const file of tokenFiles()) if (!before.has(file)) fs.rmSync(path.join(store!, 'person-tokens', file), { force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectCount(rowOf(page, AGENT.name), 0, "the agent's token is taken back");
  },
} satisfies PageSpec;
