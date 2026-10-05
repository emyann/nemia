import type { Page } from 'playwright';
import { sidebar } from '../board.ts';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';

/** A name no factory has. */
const UNKNOWN = 'no-such-factory';

/** The requests `page` sends to a factory's instruction, from now on. */
function instructionReads(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (/^\/api\/factories\/[^/]+\/instruction(\/|$)/.test(new URL(request.url()).pathname)) seen.push(request.url());
  });
  return () => [...seen];
}

export default {
  /**
   * The settings of the default factory, which has no file and keeps no instruction, and of a name no factory has: each says so, draws no
   * instruction and asks the api for none, so no refusal is seen on the way.
   */
  name: 'factory-settings-none',
  route: '/',
  expect: async (page) => {
    const asked = instructionReads(page);
    await page.goto(new URL('/factories/default/settings', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(page.locator('[data-default-factory]'), 'the default factory says it keeps no settings');
    await sidebar(page);
    await page.goto(new URL(`/factories/${UNKNOWN}/settings`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(page.locator(`[data-no-factory="${UNKNOWN}"]`), 'a name no factory has says no factory is named so');
    await expectCount(page.locator('section[data-factory-instruction]'), 0, 'neither draws an instruction');
    if (asked().length) throw new Refused(`neither asks the api for an instruction — asked ${asked().join(', ')}`);
    await page.goto(new URL('/factories/default/settings', page.url()).href, { waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
