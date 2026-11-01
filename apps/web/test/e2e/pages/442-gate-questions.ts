import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { fed, photograph, sidebar, stepBar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { ASKING, writeAsking } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The labels chosen on the question titled `title`, in `where`. */
const chosenOn = (where: Locator, title: string): Promise<string[]> =>
  where
    .locator(`fieldset[data-question="${title}"] input:checked`)
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

/** The JSON of the ask `file`, or nothing where it is not there. */
const askIn = (file: string): { message?: string; mode?: string; step?: string; try?: number } =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

/** Whether `r` is the POST of `verb` on the gated step. */
const posted = (verb: string) => (r: { request: () => { method: () => string }; url: () => string }) =>
  r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${ASKING.id}/steps/${ASKING.gated}/${verb}`;

/** The gate's questions answered as a person would: the recommended answers chosen, and the question with none answered by a click. */
async function answer(page: Page, gate: Locator): Promise<void> {
  const { cut, where } = ASKING;
  const asked = gate.locator(`section[aria-label="What ${ASKING.gated} asks"]`);
  await asked.getByRole('button', { name: 'Choose the recommended answers' }).click();
  const cutChosen = await chosenOn(asked, cut.title);
  if (cutChosen.join() !== cut.recommended || (await chosenOn(asked, where.title)).length)
    throw new Refused(
      `Choose the recommended answers chooses ${JSON.stringify(cut.recommended)} and leaves the question with no recommendation as it was — it chose ${JSON.stringify(cutChosen)}`,
    );
  await asked.locator(`fieldset[data-question="${where.title}"] label[data-option="${where.options[1].label}"]`).click();
  await settled(page);
}

export default {
  /**
   * A gate whose step asks questions as data: they are drawn in its answer column, after what it handed on, which draws them no more,
   * and before Approve, which waits — the button disabled, what is unanswered on hover — until each has a choice, in the step's inspector
   * too. `Choose the recommended answers` chooses the one recommended, a click the other; then the approval goes with its note, and the
   * api writes the approval's words in the package's: whose questions they answer, each answer, the note. Taken back, the same answers go
   * with a send-back to the gated step, the objection their note, written as the next try's words. Each write is taken back, and the run
   * with them.
   */
  name: 'gate-questions',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const written = writeAsking(store!);
    const { id, gated, cut, where } = ASKING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const theme = await themeOf(page);
      const gate = page.locator(`section[aria-label="The gate of ${gated}"]`);
      const asked = gate.locator(`section[aria-label="What ${gated} asks"]`);
      await expectVisible(asked, `${gated}'s gate asks its questions`);
      await expectCount(asked.locator('fieldset[data-question]'), 2, 'a field for each question it asks');
      await expectCount(
        gate.locator(`section[aria-label="What ${gated} handed on"] [data-questions]`),
        0,
        'and what it handed on draws them no more: they are answered beside it',
      );
      const approve = gate.getByRole('button', { name: 'Approve', exact: true });
      const sendBack = gate.getByRole('button', { name: 'Send back', exact: true });
      if (await approve.isEnabled()) throw new Refused('Approve waits for every answer — it was enabled with none');
      const unanswered = `Not answered: ${cut.title} · ${where.title}`;
      if ((await approve.getAttribute('title')) !== unanswered)
        throw new Refused(`Approve says what is not answered, ${unanswered} — it says ${await approve.getAttribute('title')}`);
      if (await sendBack.isEnabled()) throw new Refused('Send back waits for words or answers — it was enabled with neither');
      await settled(page);
      await photograph(gate, path.join(OUT, `gate-questions-unanswered-${theme}.png`));

      await page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${gated}"]`).click();
      const inspector = stepBar(page, id, gated);
      await inspector.getByRole('tab', { name: 'Details' }).click();
      const inspected = inspector.locator(`section[aria-label="What ${gated} asks of you"]`);
      await expectCount(inspected.locator('fieldset[data-question]'), 2, `${gated}'s inspector asks its questions too, a field for each`);
      const approveThere = inspected.getByRole('button', { name: 'Approve', exact: true });
      if (await approveThere.isEnabled())
        throw new Refused("the inspector's Approve waits for every answer too — it was enabled with none");
      if ((await approveThere.getAttribute('title')) !== unanswered)
        throw new Refused(`the inspector's Approve says what is not answered — it says ${await approveThere.getAttribute('title')}`);
      await approveThere.scrollIntoViewIfNeeded();
      await settled(page);
      await photograph(inspector, path.join(OUT, `gate-questions-inspector-${theme}.png`));
      await inspector.getByRole('button', { name: 'Close', exact: true }).click();
      await expectCount(inspector, 0, 'closed, so the rest of the page reads one gate');

      await answer(page, gate);
      const note = gate.getByRole('textbox', { name: `A note beside the answers to ${gated}, if any` });
      await note.fill(ASKING.note);
      await expectVisible(
        gate.locator('form[aria-label^="Approve"] button[type="submit"]:enabled'),
        'every question answered, Approve is offered',
      );
      await settled(page);
      await photograph(gate, path.join(OUT, `gate-questions-answered-${theme}.png`));

      const [approved] = await Promise.all([page.waitForResponse(posted('approve'), { timeout: WAIT_MS }), approve.click()]);
      if (approved.status() !== 202)
        throw new Refused(`the api takes the approval with its answers — it answered ${approved.status()}: ${await approved.text()}`);
      const blocks = [
        `1. ${cut.title}\n   Chose: ${cut.recommended} — ${cut.options[0].meaning}`,
        `2. ${where.title}\n   Chose: ${where.options[1].label} — ${where.options[1].meaning}`,
      ];
      const words = [
        `The person's answers to ${gated}'s questions:`,
        ...blocks,
        `Note: ${ASKING.note}`,
        'Answered by: person, on the board',
      ];
      const approval = askIn(path.join(asks, `approve-${gated}-1`));
      if (approval.message !== words.join('\n\n'))
        throw new Refused(`the approval's words are the answers, in the package's words — it holds ${JSON.stringify(approval)}`);
      await expectVisible(
        page.locator(`section[aria-label="The approval of ${gated}"] [data-words]`, {
          hasText: `The person's answers to ${gated}'s questions:`,
        }),
        `the approval shows under ${gated}, its words the answers`,
      );

      fs.rmSync(asks, { recursive: true, force: true });
      fed(id, gated, 'awaiting approval');
      await expectVisible(asked, `with the approval taken back, ${gated} asks its questions again`);
      await answer(page, gate);
      await gate.getByRole('textbox', { name: `What to change, sent back to ${gated}` }).fill(ASKING.objection);
      const [sent] = await Promise.all([page.waitForResponse(posted('retry'), { timeout: WAIT_MS }), sendBack.click()]);
      if (sent.status() !== 202)
        throw new Refused(`the api takes the send-back with its answers — it answered ${sent.status()}: ${await sent.text()}`);
      const back = askIn(path.join(asks, `retry-${gated}-2`));
      const told = ['Answers to your questions:', ...blocks, `Note: ${ASKING.objection}`, 'Answered by: person, on the board'];
      if (back.mode !== 'continue' || back.message !== told.join('\n\n'))
        throw new Refused(`the send-back carries the answers, the objection their note — it holds ${JSON.stringify(back)}`);
      await expectCount(gate, 0, 'and the gate is offered no more: it is sent back');
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
    }
    await expectCount(page.locator(`a[href="/runs/${id}"]`), 0, 'taken back and said on the feed: the run is gone from the list');
  },
} satisfies PageSpec;
