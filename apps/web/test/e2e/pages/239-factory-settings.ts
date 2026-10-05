import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory whose settings the page reads and writes: its first folder is the e2e's checkout. */
const FACTORY = FACTORIES.hiring.name;
/** The words the page keeps in the store. */
const WORDS = 'Run the checks before every commit, and say in the message why the change is made.';
/** A file of the checkout the page points the instruction at: the README of the workflow `dev`. */
const README = path.join('workflows', WORKFLOWS.good.name, 'README.md');

const route = `/api/factories/${FACTORY}/instruction`;

/** The answer to the next `method` on the instruction's route, or on its words' with `words`. */
const answered = (page: Page, method: 'PUT' | 'DELETE', words = false) =>
  page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === (words ? `${route}/words` : route), {
    timeout: WAIT_MS,
  });

/** Press `button` in `section`, wait for the api's answer to `method`, and refuse any but a 200. */
async function wrote(page: Page, section: Locator, button: string, method: 'PUT' | 'DELETE', words = false): Promise<void> {
  const [answer] = await Promise.all([answered(page, method, words), section.getByRole('button', { name: button, exact: true }).click()]);
  if (answer.status() !== 200) throw new Refused(`${button} writes — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
}

/** Where the section says the instruction is kept, and the file it names. */
async function expectKept(section: Locator, kept: 'store' | 'folder', file: string, assertion: string): Promise<void> {
  await expectVisible(section.locator(`[data-instruction-kept="${kept}"]`), assertion);
  const shown = await section.locator('[data-instruction-file]').textContent();
  if (shown !== file) throw new Refused(`${assertion}: the file it names is ${file} — it names ${JSON.stringify(shown)}`);
}

/**
 * The floor's Settings leads to the factory's settings page, whose sidebar still picks the factory, and which reads the instruction from
 * `NEMIA.md`, no file there yet.
 */
async function followSettings(page: Page, section: Locator, checkout: string): Promise<void> {
  await page.locator('[data-factory-settings-link]').click();
  await page.waitForURL((url) => url.pathname === `/factories/${FACTORY}/settings`, { timeout: WAIT_MS });
  await idle(page);
  await expectVisible(page.getByRole('heading', { level: 1, name: FACTORY }), "the page is headed with the factory's name");
  await sidebar(page);
  await expectKept(
    section,
    'folder',
    path.join(checkout, 'NEMIA.md'),
    "by default the instruction is read from NEMIA.md in the factory's folder",
  );
  await expectVisible(section.locator('[data-instruction-none]'), 'no file there yet, and the page says so');
  await expectCount(section.getByRole('button', { name: 'Back to NEMIA.md' }), 0, 'nor offers to go back where it already is');
  await settled(page);
  await photograph(page, path.join(OUT, `factory-settings-folder-${await themeOf(page)}.png`));
}

/** Pointed at a file of the folder, the instruction reads it, and the factory's file names it; Back to NEMIA.md undoes it. */
async function pointAtFile(page: Page, section: Locator, checkout: string, factoryFile: string): Promise<void> {
  await section.getByRole('textbox', { name: /Or read it from a file/ }).fill(README);
  await wrote(page, section, 'Read this file', 'PUT');
  await expectKept(section, 'folder', path.join(checkout, README), 'pointed at a file, the instruction is read from it');
  await expectVisible(section.locator('[data-instruction-words]', { hasText: 'A second paragraph' }), "and the file's words are shown");
  const record = JSON.parse(fs.readFileSync(factoryFile, 'utf8')) as { instruction?: unknown };
  if (JSON.stringify(record.instruction) !== JSON.stringify({ path: README }))
    throw new Refused(`the factory's file names the path — it says ${JSON.stringify(record.instruction)}`);
  await settled(page);
  await photograph(page, path.join(OUT, `factory-settings-file-${await themeOf(page)}.png`));
  await wrote(page, section, 'Back to NEMIA.md', 'DELETE');
  await expectKept(section, 'folder', path.join(checkout, 'NEMIA.md'), 'Back to NEMIA.md reads NEMIA.md again');
}

/** Kept in the store, the words are written there and read again on a reload; cleared, asked twice, the store keeps none. */
async function keepInStore(page: Page, section: Locator, stored: string): Promise<void> {
  await wrote(page, section, 'Keep it in the store instead', 'PUT');
  await expectKept(section, 'store', stored, 'kept in the store, the instruction is read from the store');
  if (await section.getByRole('button', { name: 'Read this file' }).isEnabled())
    throw new Refused('kept in the store, an empty path reads no file: Read this file waits for one');
  await section.getByRole('textbox', { name: 'Words' }).fill(WORDS);
  await wrote(page, section, 'Save', 'PUT', true);
  if (!fs.existsSync(stored) || fs.readFileSync(stored, 'utf8').trim() !== WORDS)
    throw new Refused(`saved, the words are ${stored}'s — it holds ${fs.existsSync(stored) ? fs.readFileSync(stored, 'utf8') : 'nothing'}`);
  await expectVisible(section.locator('[data-instruction-done]', { hasText: 'Saved.' }), 'the page says they are saved');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  const words = section.getByRole('textbox', { name: 'Words' });
  await expectVisible(words, 'the words, read again');
  if ((await words.inputValue()) !== WORDS) throw new Refused(`reloaded, the words are read again — ${await words.inputValue()}`);
  await settled(page);
  const theme = await themeOf(page);
  await photograph(page, path.join(OUT, `factory-settings-store-${theme}.png`));
  await onPhone(page, theme);

  await section.getByRole('button', { name: 'Clear…' }).click();
  await expectVisible(section.locator('[data-instruction-clear-asks]'), 'Clear asks once more before it removes them');
  await wrote(page, section, 'Clear', 'DELETE', true);
  if (fs.existsSync(stored)) throw new Refused(`cleared, ${stored} is gone`);
  if ((await words.inputValue()) !== '') throw new Refused(`cleared, the words are empty — ${await words.inputValue()}`);
}

/** The settings page on a phone's screen, the words kept in the store, in a page of its own. */
async function onPhone(page: Page, theme: string): Promise<void> {
  const phone = await page.context().newPage();
  try {
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(page.url(), { waitUntil: 'load' });
    await idle(phone);
    await expectVisible(phone.locator('[data-instruction-kept="store"]'), 'on a phone, the instruction kept in the store');
    await settled(phone);
    await photograph(phone, path.join(OUT, `factory-settings-store-phone-${theme}.png`), { fullPage: true });
  } finally {
    await phone.close();
  }
}

export default {
  /**
   * A factory's settings, reached by the Settings link on its floor: its instruction, read by default from `NEMIA.md` in the factory's
   * first folder, no file there yet. Pointed at a file of that folder, it reads that file and the factory's file names its path; Back to
   * NEMIA.md undoes it. Kept in the store, its words are saved to the store's file and read again on a reload, then cleared, asked twice;
   * Back to NEMIA.md leaves the factory's file as it was. The factory's file and the store's folder for it are taken back whatever happens.
   */
  name: 'factory-settings',
  route: `/factories/${FACTORY}`,
  expect: async (page) => {
    const checkout = path.join(store!, 'checkout');
    const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
    const folder = path.join(store!, 'factories', FACTORY);
    const stored = path.join(folder, 'NEMIA.md');
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    if (!fs.existsSync(path.join(checkout, README))) throw new Refused(`the checkout holds ${README} for the page to point at`);
    if (fs.existsSync(path.join(checkout, 'NEMIA.md'))) throw new Refused('the checkout holds no NEMIA.md: the page reads it as none yet');
    const section = page.locator('section[data-factory-instruction]');
    try {
      await followSettings(page, section, checkout);
      await pointAtFile(page, section, checkout, factoryFile);
      await keepInStore(page, section, stored);
      await wrote(page, section, 'Back to NEMIA.md', 'DELETE');
      await expectKept(section, 'folder', path.join(checkout, 'NEMIA.md'), 'Back to NEMIA.md reads NEMIA.md again');
      if (JSON.stringify(JSON.parse(fs.readFileSync(factoryFile, 'utf8'))) !== JSON.stringify(JSON.parse(factoryText)))
        throw new Refused(`back to NEMIA.md, the factory's file is as it was — it holds ${fs.readFileSync(factoryFile, 'utf8')}`);
    } finally {
      fs.writeFileSync(factoryFile, factoryText);
      fs.rmSync(folder, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
