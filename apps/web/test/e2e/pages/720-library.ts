import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectVisible, idle } from '../checks.ts';
import { AGENTS, FACTORIES } from '../seed.ts';
import type { Page } from 'playwright';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

const IMPORTED = 'importee';

/**
 * Claude Code's own agents, offered to import: the api's read of `~/.claude/agents` answered with a file the page plants in its store,
 * since the api reads the machine's home, which no page may plant in. Its Import copies it through the api into the user library, the
 * Library then lists it as the user library's, and the row says it is held; the page takes back the copy and its record.
 */
async function imports(page: Page): Promise<void> {
  const dir = path.join(store!, 'claude-agents');
  const file = path.join(dir, `${IMPORTED}.md`);
  const copied = [path.join(store!, 'workflows', 'agents', `${IMPORTED}.md`), path.join(store!, 'agent-sources', `${IMPORTED}.json`)];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `---\nname: ${IMPORTED}\ndescription: Imports things.\n---\nImport them.\n`);
  const source = { place: 'path', repo: null, dir, file, name: IMPORTED, description: 'Imports things.', version: 'v1', error: null };
  await page.route('**/api/agent-sources*', (route) => route.fulfill({ json: { sources: [source] } }));
  try {
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    const row = page.locator(`[data-claude-import] [data-claude-agent="${IMPORTED}"]`);
    await expectVisible(row, `${IMPORTED} offered to import from Claude Code`);
    await row.locator('[data-claude-import-press]').click();
    await expectVisible(row.locator('[data-claude-held]'), 'imported, it is in the library');
    await expectVisible(
      page.locator(`[data-library-item="Agent.${IMPORTED}"] [data-library-origin="user"]`),
      `${IMPORTED} listed as the user library's`,
    );
    await photograph(page.locator('[data-claude-import]'), path.join(OUT, `library-import-${await themeOf(page)}.png`));
  } finally {
    await page.unroute('**/api/agent-sources*');
    for (const one of [...copied, dir]) fs.rmSync(one, { recursive: true, force: true });
  }
}

export default {
  /**
   * The store's library, lit in the rail: each kind under its heading, the seeded agent and skill as the user library's. On a factory
   * with no adds recorded, its settings page lists none, and Add from library adds the seeded skill: it resolves, and the Library says
   * the factory uses it. Removed, the page takes back the factory's record of its adds, so each visit reads the store as seeded. And
   * Claude Code's own agents are offered to import (`imports`).
   */
  name: 'library',
  route: '/library',
  expect: async (page) => {
    const { seeded, made } = AGENTS;
    const factory = FACTORIES.bare;
    const record = path.join(store!, 'factories', factory, 'library.json');
    const skill = page.locator(`[data-library-item="Skill.${made.skill.id}"]`);
    await expectVisible(page.locator('[data-library-page]'), 'the Library page');
    await expectVisible(
      page.locator(`[data-library-item="Agent.${seeded.name}"] [data-library-origin="user"]`),
      `${seeded.name} listed as the user library's`,
    );
    await expectVisible(skill.locator('[data-library-origin="user"]'), `${made.skill.id} listed as the user library's`);
    await photograph(page, path.join(OUT, `library-page-${await themeOf(page)}.png`), { fullPage: true });
    await imports(page);
    try {
      await page.goto(new URL(`/factories/${factory}/settings`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const adds = page.locator('[data-library-adds]');
      await expectVisible(adds, `${factory}'s adds from the library`);
      await adds.locator('[data-library-pick]').click();
      await page.getByRole('option', { name: `Skill.${made.skill.id}`, exact: true }).click();
      await adds.locator('[data-library-add-press]').click();
      const added = adds.locator(`[data-library-add="Skill.${made.skill.id}"]`);
      await expectVisible(added.locator('[data-add-state="resolved"]'), 'the add resolves');
      await photograph(adds, path.join(OUT, `library-adds-${await themeOf(page)}.png`));
      await page.goto(new URL('/library', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await expectVisible(skill.getByRole('link', { name: factory }), `the Library says ${factory} uses ${made.skill.id}`);
      await page.goto(new URL(`/factories/${factory}/settings`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await adds.locator(`[data-add-remove="Skill.${made.skill.id}"]`).click();
      await expectVisible(adds.getByText('Nothing added from the library yet.'), 'the add taken off');
    } finally {
      fs.rmSync(record, { force: true });
    }
  },
} satisfies PageSpec;
