import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { budgetWord } from '../../../src/lib/money.ts';
import { FACTORIES, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory whose settings the page reads and writes: its first folder is the e2e's checkout. */
const FACTORY = FACTORIES.hiring.name;
/** The words the page keeps in the store. */
const WORDS = 'Run the checks before every commit, and say in the message why the change is made.';
/** The rules the page writes for the factory. */
const RULES = 'Never push on a Friday. A change comes with the test that proves it.';
/** A file of the checkout the page points the instruction at: the README of the workflow `dev`. */
const README = path.join('workflows', WORKFLOWS.good.name, 'README.md');

/** The workflow the factory offers, whose cost line the page sets and clears, and the line it sets. */
const LINED = { workflow: WORKFLOWS.good.name, usd: 80 } as const;

const route = `/api/factories/${FACTORY}/instruction`;
const rulesRoute = `/api/factories/${FACTORY}/rules`;

/** Which route a press writes: the instruction's, its words', the rules', or the cost line's of LINED's workflow. */
type Written = 'instruction' | 'words' | 'rules' | 'costLine';

const ROUTES: Record<Written, string> = {
  instruction: route,
  words: `${route}/words`,
  rules: rulesRoute,
  costLine: `/api/factories/${FACTORY}/costlines/${LINED.workflow}`,
};

/** The answer to the next `method` on the route of `what`. */
const answered = (page: Page, method: 'PUT' | 'DELETE', what: Written) =>
  page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === ROUTES[what], { timeout: WAIT_MS });

/** Press `button` in `section`, wait for the api's answer to `method` on the route of `what`, and refuse any but a 200. */
async function wrote(page: Page, section: Locator, button: string, method: 'PUT' | 'DELETE', what: Written = 'instruction'): Promise<void> {
  const [answer] = await Promise.all([answered(page, method, what), section.getByRole('button', { name: button, exact: true }).click()]);
  if (answer.status() !== 200) throw new Refused(`${button} writes — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
}

/**
 * The factory's rules, above its instruction: none yet, and no Clear offered; written, they are the store's file, said saved, and read
 * again on a reload; cleared, asked twice, the file is gone. The instruction's block says it is Nemia's, told to no step.
 */
async function keepRules(page: Page, kept: string): Promise<void> {
  const section = page.locator('section[data-factory-rules]');
  const instruction = page.locator('section[data-factory-instruction]');
  const above = await section.evaluate(
    (el, other) => Boolean(other && el.compareDocumentPosition(other) & 4),
    await instruction.elementHandle(),
  );
  if (!above) throw new Refused("the factory's rules are drawn above its instruction");
  await expectVisible(
    section.locator('[data-rules-told]', {
      hasText:
        "Told to every agent hired into this factory, after its custom instructions and before the step's own policy. Runs already started keep what they were told.",
    }),
    'the rules say who is told them, where in the order, and that a run keeps what it was told',
  );
  await expectVisible(
    instruction.getByText('What Nemia is to know about this factory', { exact: false }),
    "the instruction's block says it is Nemia's",
  );
  await expectVisible(instruction.getByText('no step of a run is told it', { exact: false }), 'and that no step is told it');
  const shown = await section.locator('[data-rules-file]').textContent();
  if (shown !== kept) throw new Refused(`the rules name the file they are kept in, ${kept} — they name ${JSON.stringify(shown)}`);
  const words = section.getByRole('textbox', { name: 'Words' });
  if ((await words.inputValue()) !== '') throw new Refused(`a factory with no rules shows none — ${await words.inputValue()}`);
  await expectCount(section.getByRole('button', { name: 'Clear…' }), 0, 'with no rules kept, there is nothing to clear');
  await words.fill(RULES);
  await wrote(page, section, 'Save', 'PUT', 'rules');
  if (!fs.existsSync(kept) || fs.readFileSync(kept, 'utf8') !== `${RULES}\n`)
    throw new Refused(`saved, the rules are ${kept}'s — it holds ${fs.existsSync(kept) ? fs.readFileSync(kept, 'utf8') : 'nothing'}`);
  await expectVisible(section.locator('[data-rules-done]', { hasText: 'Saved' }), 'the page says they are saved');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectVisible(words, 'the rules, read again');
  if ((await words.inputValue()) !== RULES) throw new Refused(`reloaded, the rules are read again — ${await words.inputValue()}`);
  await settled(page);
  await photograph(page, path.join(OUT, `factory-settings-rules-${await themeOf(page)}.png`));
  await section.getByRole('button', { name: 'Clear…' }).click();
  await expectVisible(section.locator('[data-rules-clear-asks]'), 'Clear asks once more before it removes them');
  await settled(page);
  await photograph(section, path.join(OUT, `factory-settings-rules-clear-${await themeOf(page)}.png`));
  await wrote(page, section, 'Clear', 'DELETE', 'rules');
  if (fs.existsSync(kept)) throw new Refused(`cleared, ${kept} is gone`);
  if ((await words.inputValue()) !== '') throw new Refused(`cleared, the rules are empty — ${await words.inputValue()}`);
  await expectVisible(section.locator('[data-rules-done]', { hasText: 'Cleared' }), 'the page says they are cleared');
}

/** The cost lines the factory's file keeps, as it reads now. */
const costLinesIn = (factoryFile: string): unknown =>
  (JSON.parse(fs.readFileSync(factoryFile, 'utf8')) as { costLines?: unknown }).costLines;

/**
 * The factory's cost lines: a row per workflow it offers, none set yet and nothing to clear; a line typed and saved is the factory's
 * file's `costLines`, shown on the row and read again on a reload; cleared, the file keeps none and the row says so.
 */
async function setCostLine(page: Page, factoryFile: string): Promise<void> {
  const { workflow, usd } = LINED;
  const section = page.locator('[data-cost-lines]');
  const row = section.locator(`[data-cost-line="${workflow}"]`);
  await expectCount(section.locator('[data-cost-line]'), 1, 'a row for each workflow the factory offers');
  await expectVisible(row.locator('[data-cost-line-said="none"]'), `${workflow} has no cost line yet, and its row says so`);
  await expectCount(row.getByRole('button', { name: 'Clear', exact: true }), 0, 'with no line set, there is nothing to clear');
  await row.getByRole('spinbutton', { name: `The cost line of ${workflow}, in dollars` }).fill(String(usd));
  await wrote(page, row, 'Save', 'PUT', 'costLine');
  const kept = costLinesIn(factoryFile);
  if (JSON.stringify(kept) !== JSON.stringify({ [workflow]: usd }))
    throw new Refused(
      `saved, the factory's file keeps the line, ${JSON.stringify({ [workflow]: usd })} — it keeps ${JSON.stringify(kept)}`,
    );
  const said = row.locator(`[data-cost-line-said="${usd}"]`, { hasText: budgetWord(usd) });
  await expectVisible(said, `the row shows ${workflow}'s line, ${budgetWord(usd)}`);
  await expectVisible(row.locator('[data-cost-line-done]'), 'and says it is saved');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectVisible(said, 'the line, read again on a reload');
  await settled(page);
  await photograph(section, path.join(OUT, `factory-settings-cost-lines-${await themeOf(page)}.png`));
  await wrote(page, row, 'Clear', 'DELETE', 'costLine');
  const left = costLinesIn(factoryFile);
  if (left !== undefined && JSON.stringify(left) !== '{}')
    throw new Refused(`cleared, the factory's file keeps no line — it keeps ${JSON.stringify(left)}`);
  await expectVisible(row.locator('[data-cost-line-said="none"]'), 'cleared, the row says there is no line');
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
  await wrote(page, section, 'Save', 'PUT', 'words');
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
  await wrote(page, section, 'Clear', 'DELETE', 'words');
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

/** A factory's file as the door reads it: one written before the counter reads as generation 1, so writing it 1 changes nothing. */
const asRead = (text: string): Record<string, unknown> => ({ generation: 1, ...(JSON.parse(text) as Record<string, unknown>) });

export default {
  /**
   * A factory's settings, reached by the Settings link on its floor. Its rules, drawn above its instruction: none yet; written, they are
   * the store's `RULES.md` for the factory, read again on a reload, then cleared, asked twice. Its instruction, said as Nemia's, read by
   * default from `NEMIA.md` in the factory's first folder, no file there yet. Pointed at a file of that folder, it reads that file and
   * the factory's file names its path; Back to NEMIA.md undoes it. Kept in the store, its words are saved to the store's file and read
   * again on a reload, then cleared, asked twice; Back to NEMIA.md leaves the factory's file as it was. The factory's file and the
   * store's folder for it are taken back whatever happens. Its cost lines, a row per workflow it offers: a line set is the factory's
   * file's `costLines`, shown and read again on a reload, then cleared.
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
      await keepRules(page, path.join(folder, 'RULES.md'));
      await pointAtFile(page, section, checkout, factoryFile);
      await keepInStore(page, section, stored);
      await wrote(page, section, 'Back to NEMIA.md', 'DELETE');
      await expectKept(section, 'folder', path.join(checkout, 'NEMIA.md'), 'Back to NEMIA.md reads NEMIA.md again');
      if (JSON.stringify(asRead(fs.readFileSync(factoryFile, 'utf8'))) !== JSON.stringify(asRead(factoryText)))
        throw new Refused(`back to NEMIA.md, the factory's file is as it was — it holds ${fs.readFileSync(factoryFile, 'utf8')}`);
      await setCostLine(page, factoryFile);
    } finally {
      fs.writeFileSync(factoryFile, factoryText);
      fs.rmSync(folder, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
