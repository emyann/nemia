import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Locator, Page } from 'playwright';
import { photograph, pickIn, startOf, themeOf, isRunStart } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, onSeveralRepos, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, takeBackRuns } from '../world.ts';

/**
 * The File records the page's uploads made in the store's keyspace (`<store>/db/state.db`, laid out as Kine's), taken back: a tombstone
 * row appended for each live `/registry/files/<factory>/<id>` of `names`, at the store's next revision, as the store deletes one, and its
 * pointers dropped. What the File door keeps of an upload beside its bytes, which the page removes itself.
 * @param factory The factory the files were uploaded to.
 * @param names The names the uploads left in the factory's files folder, a File's id among them.
 */
function fileRecordsTakenBack(factory: string, names: readonly string[]) {
  const file = path.join(store!, 'db', 'state.db');
  if (!fs.existsSync(file)) return;
  const db = new DatabaseSync(file, { timeout: 30_000 });
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const id of new Set(names.map((name) => name.replace(/\.part$/, '')))) {
      const key = `/registry/files/${factory}/${id}`;
      const last = db.prepare('SELECT id, create_revision, deleted, value FROM kine WHERE name = ? ORDER BY id DESC LIMIT 1').get(key) as
        | { id: number; create_revision: number; deleted: number; value: string | Uint8Array }
        | undefined;
      if (last === undefined || last.deleted) continue;
      const head = (db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'kine'").get() as { seq: number }).seq;
      db.prepare(
        'INSERT INTO kine (id, name, created, deleted, create_revision, prev_revision, lease, value, old_value) VALUES (?, ?, 0, 1, ?, ?, 0, ?, ?)',
      ).run(head + 1, key, last.create_revision, last.id, last.value, last.value);
      db.prepare('DELETE FROM kine_pointers WHERE name = ?').run(key);
    }
    db.exec('COMMIT');
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}

/** The brief the page starts its run with. */
const BRIEF = 'Start a run from the floor of its factory';
/** The file the page hands its run, and its bytes: a PNG's signature and a little more, as small as a screenshot gets. */
const SHOT = 'shot.png';
const SHOT_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** The step of `dev` whose file names no agent, which leaves the workflow unfilled in a factory until it hires into it. */
const UNFILLED = 'review';
/** The agent the page writes into the checkout's `workflows/agents/` for the factory to hire into `review`. */
const REVIEWER = 'reviewer-e2e';

/** The factory's file `text` with `hires` in place of the seed's. */
const withHires = (text: string, hires: Record<string, string>) => JSON.stringify({ ...(JSON.parse(text) as object), hires }, null, 2);

/**
 * Open the pane's start on a fresh load of the floor, with no bar open (one would cover the pane under 1600), and the side sheet it
 * opens.
 */
async function openStart(page: Page) {
  const floor = new URL(page.url());
  floor.searchParams.delete('bar');
  await page.goto(floor.href, { waitUntil: 'load' });
  await idle(page);
  await startOf(page).click();
  const bar = page.getByRole('complementary', { name: `Start a run in ${FACTORIES.hiring.name}` });
  await expectVisible(bar, "the pane's Start a run opens its bar in the side sheet, naming the factory");
  return bar;
}

/** Picks `workflow` in the bar, and the start it offers. */
async function pickWorkflow(bar: Locator, workflow: string) {
  await bar.locator(`[data-workflow="repo:${workflow}"]`).click();
  const form = bar.locator(`form[aria-label="Start a run of ${workflow}"]`);
  await expectVisible(form, `picked, ${workflow} offers its start`);
  return form;
}

/** A half-typed brief is not lost to one Escape: the first leaves its field, the brief kept and the bar open; the second closes the bar. */
async function keptOnEscape(page: Page, bar: Locator, form: Locator) {
  const brief = form.getByRole('textbox');
  await brief.fill(BRIEF);
  await page.keyboard.press('Escape');
  await idle(page);
  if (!new URL(page.url()).searchParams.has('bar'))
    throw new Refused(`Escape in a field that holds text leaves the bar open — ${page.url()}`);
  await expectVisible(bar, 'Escape in a field that holds text leaves the bar open');
  if ((await brief.inputValue()) !== BRIEF)
    throw new Refused(`and keeps the brief typed — it holds ${JSON.stringify(await brief.inputValue())}`);
  if (await brief.evaluate((el) => el === document.activeElement)) throw new Refused('and leaves the field');
  await page.keyboard.press('Escape');
  await expectCount(bar, 0, 'a second Escape closes the bar');
}

/**
 * The factory on two repositories: no repository to pick; `workflow`, picked by name, unwired says the attach, and wired to `checkout`'s
 * folder name in the factory's file says it, offering its start there. The file is put back.
 */
async function severalRepos(page: Page, workflow: string, checkout: string, theme: string) {
  const factory = FACTORIES.hiring.name;
  const { back } = onSeveralRepos(store!);
  try {
    let bar = await openStart(page);
    await expectCount(bar.getByRole('option', { name: 'Pick where it runs' }), 0, 'on two repositories, none is offered to pick');
    await pickIn(page, bar.locator('[data-pick-workflow]'), workflow);
    await expectVisible(
      bar.locator('[data-unwired="unwired"]', { hasText: `nemia factory attach ${factory} ${workflow} --repo <name>` }),
      `${workflow} unwired says the attach that names its repository`,
    );
    await expectCount(bar.locator('form[aria-label^="Start a run of"]'), 0, 'with no Start: the api would refuse it');
    await settled(page);
    await photograph(page, path.join(OUT, `factory-start-unwired-${theme}.png`));

    const file = path.join(store!, 'factories', `${factory}.json`);
    const read = JSON.parse(fs.readFileSync(file, 'utf8')) as object;
    fs.writeFileSync(file, JSON.stringify({ ...read, workflowRepos: { [workflow]: path.basename(checkout) } }, null, 2));
    bar = await openStart(page);
    await pickIn(page, bar.locator('[data-pick-workflow]'), workflow);
    await expectVisible(bar.locator('[data-repo]', { hasText: `On ${checkout}` }), `wired, ${workflow} says the repository it runs on`);
    await expectVisible(
      bar.locator(`form[aria-label="Start a run of ${workflow}"]`).or(bar.locator(`[data-workflow="repo:${workflow}"]`)),
      'and offers it there',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-start-wired-${theme}.png`));
  } finally {
    back();
  }
}

export default {
  /**
   * A run is started from a factory's floor: the pane's Start a run opens its bar in the side sheet on the factory's one repository,
   * fixed, listing the workflows it offers there with its hires. A workflow whose step the factory hires no one into says so in the
   * package's words and cannot be picked. Once the factory hires into it, it is picked; Escape in its brief leaves the field and keeps the
   * brief, and a second Escape closes the bar. Picked again, with a file chosen, the file is listed, uploaded to the factory's files by
   * the board's cookie, and named by its id among the start's inputs, the run holding its bytes; the start sends `?factory=` and
   * `?repo=`: the record names both. The hires,
   * the agent hired and the run are taken back. On a second repository the factory then works on two: the bar offers no repository to pick,
   * the workflow is picked by name, and, unwired, it says why with the attach; wired by the factory's file, it says the wired one.
   */
  name: 'factory-start',
  route: `/factories/${FACTORIES.hiring.name}`,
  expect: async (page) => {
    const runsDir = path.join(store!, 'runs');
    const checkout = path.join(store!, 'checkout');
    const factory = FACTORIES.hiring.name;
    const workflow = WORKFLOWS.good.name;
    const factoryFile = path.join(store!, 'factories', `${factory}.json`);
    const factoryText = fs.readFileSync(factoryFile, 'utf8');
    const reviewerFile = path.join(checkout, 'workflows', 'agents', `${REVIEWER}.md`);
    const runsBefore = fs.readdirSync(runsDir).sort();
    const filesDir = path.join(store!, 'files', factory);
    const kept = () => (fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : []) satisfies string[];
    const filesBefore = new Set(kept());
    const theme = await themeOf(page);
    const other = await page.context().newPage();
    try {
      fs.writeFileSync(factoryFile, withHires(factoryText, {}));
      const { problems } = watch(other);
      await other.goto(page.url(), { waitUntil: 'load' });
      let bar = await openStart(other);
      await expectVisible(bar.locator('[data-repo]', { hasText: `On ${checkout}` }), "on the factory's one repository, fixed");
      const row = bar.locator(`[data-workflow="repo:${workflow}"]`);
      await expectVisible(
        row.locator('[data-why-not]', { hasText: `nemia factory hire ${factory} <agent> --step ${workflow}/${UNFILLED}` }),
        `${workflow}'s ${UNFILLED} has no agent in ${factory}: its row says so, and the hire that fills it`,
      );
      if (!(await row.getByRole('radio').isDisabled())) throw new Refused(`${workflow} cannot be picked while it is unfilled`);
      await expectCount(bar.locator('form[aria-label^="Start a run of"]'), 0, 'with no Start: the api would refuse it');
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-unfilled-${theme}.png`));
      await bar.getByRole('button', { name: 'Close' }).click();
      await expectCount(bar, 0, 'Close closes the bar');

      fs.writeFileSync(reviewerFile, '---\ndescription: Use this when a change needs reviewing.\n---\nYou review the change.\n');
      fs.writeFileSync(factoryFile, withHires(factoryText, { [`${workflow}/${UNFILLED}`]: REVIEWER }));
      bar = await openStart(other);
      await expectCount(
        bar.locator(`[data-workflow="repo:${workflow}"] [data-why-not]`),
        0,
        `hired into ${UNFILLED}, ${workflow} can start`,
      );
      let form = await pickWorkflow(bar, workflow);
      await expectVisible(form.getByText(`in the factory ${factory}`, { exact: false }), `which says the run runs in ${factory}`);
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-picked-${theme}.png`));
      await keptOnEscape(other, bar, form);
      bar = await openStart(other);
      form = await pickWorkflow(bar, workflow);
      await form.getByRole('textbox').fill(BRIEF);
      await form.locator('input[type="file"]').setInputFiles({ name: SHOT, mimeType: 'image/png', buffer: SHOT_BYTES });
      await expectVisible(form.locator(`[data-start-input="${SHOT}"]`), `${SHOT} is listed by its name and size before the start`);
      const [uploaded, started] = await Promise.all([
        other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/namespaces/${factory}/files`, {
          timeout: WAIT_MS,
        }),
        other.waitForResponse((r) => r.request().method() === 'POST' && isRunStart(new URL(r.url()).pathname), { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      if (uploaded.status() !== 201)
        throw new Refused(
          `${SHOT} is uploaded to ${factory}'s files by the board's cookie — it answered ${uploaded.status()}: ${await uploaded.text()}`,
        );
      const { id: fileId } = (await uploaded.json()) as { id: string };
      const sent = started.request().postDataJSON() as { inputs?: { name?: string; file?: string }[] };
      if (JSON.stringify(sent.inputs) !== JSON.stringify([{ name: SHOT, file: fileId }]))
        throw new Refused(`the start names ${SHOT} among its inputs by its id ${fileId} — it sent ${JSON.stringify(sent.inputs)}`);
      const sentTo = new URL(started.url());
      if (sentTo.pathname !== `/api/namespaces/${factory}/runs` || sentTo.searchParams.get('repo') !== checkout)
        throw new Refused(`the start is sent in the factory's namespace, its repository in its query — it was sent to ${started.url()}`);
      if (started.status() !== 201)
        throw new Refused(`the api starts the run in ${factory} — it answered ${started.status()}: ${await started.text()}`);
      const { id, run } = (await started.json()) as { id: string; run?: { inputs?: { names: string[]; dir: string } } };
      await expectVisible(bar.locator(`[data-started="${id}"]`), `the bar says ${id} started, and links to it`);
      if (!run?.inputs?.names.includes(SHOT))
        throw new Refused(`the run holds ${SHOT} among its inputs — it answered ${JSON.stringify(run?.inputs)}`);
      if (!fs.readFileSync(path.join(run.inputs.dir, SHOT)).equals(SHOT_BYTES))
        throw new Refused(`the run's ${SHOT} holds the bytes the board uploaded`);
      const record = JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), 'utf8')) as { factory?: string; repo?: string };
      if (record.factory !== factory || record.repo !== checkout)
        throw new Refused(
          `the record names ${factory} and ${checkout} — it holds ${JSON.stringify({ factory: record.factory, repo: record.repo })}`,
        );
      await idle(other);
      await settled(other);
      await photograph(other, path.join(OUT, `factory-start-started-${theme}.png`));
      await severalRepos(other, workflow, checkout, theme);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request while starting a run from a floor — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await other.close();
      takeBackRuns(runsDir, runsBefore);
      const added = kept().filter((name) => !filesBefore.has(name));
      for (const name of added) fs.rmSync(path.join(filesDir, name), { force: true });
      fileRecordsTakenBack(factory, added);
      fs.rmSync(reviewerFile, { force: true });
      fs.writeFileSync(factoryFile, factoryText);
    }
  },
} satisfies PageSpec;
