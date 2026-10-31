import fs from 'node:fs';
import path from 'node:path';
import type { Page, Response } from 'playwright';
import { fed, photograph, stepBar, themeOf } from '../board.ts';
import { cardOf, expectClearOfEachOther, showFinished } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { ENDING, FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A gate answered on the Factory, from the floor as the grid lays it out: the ending's card says what approving does and where a
   * send-back goes, and answers it; the ending's inspector says it in full, first, with the facts to decide on, FAKE's run in flight on
   * main its branch collides with among them; the step not filed says so rather than a table of dashes. In a page of its own whose one
   * refusal is the point, an approval made elsewhere first is refused; then the gate is approved on the card, confirmed, and sent back with
   * words. The page takes each file back and lays the floor out again, each card still clear of the one beneath it, so each page after it
   * reads the store and the floor as seeded.
   */
  name: 'factory-gate',
  route: '/factories/default',
  expect: async (page) => {
    const { id, ending, back } = ENDING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const approved = (r: Response) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${ending}/approve`;
    const retried = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${back}/retry`;
    const lineOf = (p: Page) => cardOf(p, id).locator(`[data-gate-line="${ending}"]`);
    const answerOf = (p: Page, label: 'Approve' | 'Send back') => cardOf(p, id).locator(`[data-answer="${label}"]`);
    const approval = (p: Page) => p.getByRole('dialog', { name: `Approve ${ending}` });
    const runNow = (p: Page) => approval(p).getByRole('button', { name: `Run ${ending} now`, exact: true });
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    const card = cardOf(page, id);
    await expectVisible(
      lineOf(page).filter({ hasText: `approve to run ${ending} on main, or send ${back} back` }),
      `the card says what approving ${ending} does`,
    );
    await expectCount(card.locator('[data-taken]'), 0, 'and nothing is answered yet');

    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      const listed = await (await refused.request.get(new URL('/api/runs', page.url()).href)).text();
      await refused.route(
        (url) => url.pathname === '/api/runs',
        (route) => route.fulfill({ status: 200, contentType: 'application/json', body: listed }),
      );
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      await expectVisible(
        answerOf(refused, 'Approve'),
        'Approve on the card, on a page of its own that holds the list as the card read it',
      );
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, `approve-${ending}-1`), JSON.stringify({ step: ending, try: 1, at: new Date().toISOString() }));
      await answerOf(refused, 'Approve').click();
      await expectVisible(approval(refused), 'Approve opens a popover to confirm it in');
      await approval(refused)
        .getByRole('textbox', { name: `Words to approve ${ending} with, if any` })
        .fill(ENDING.objection);
      const [answered] = await Promise.all([refused.waitForResponse(approved, { timeout: WAIT_MS }), runNow(refused).click()]);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 409 || !error)
        throw new Refused(
          `the package refuses an approval made after wf approve in a terminal — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      const refusal = approval(refused).locator('[data-refused]');
      await expectVisible(refusal.getByText('Not approved. The api refused it:'), 'the refusal is shown in the popover, not swallowed');
      const shown = await refusal.locator('p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      const kept = await approval(refused).getByRole('textbox').inputValue();
      if (kept !== ENDING.objection) throw new Refused('the words stay in the box after a refusal');
      await expectCount(cardOf(refused, id).locator('[data-taken]'), 0, 'and the card says nothing was taken');
      await settled(refused);
      await photograph(refused, path.join(OUT, `factory-gate-refused-${await themeOf(refused)}.png`), { fullPage: true });
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      fs.rmSync(asks, { recursive: true, force: true });
      fed(id, ending, 'awaiting approval');
    } finally {
      fs.rmSync(asks, { recursive: true, force: true });
      await refused.close();
    }
    await expectVisible(answerOf(page, 'Approve'), 'the gate is on the card again once the approval is taken back');

    await card.getByRole('button', { name: 'Show steps' }).click();
    const node = card.locator(`[data-tile="${ending}"]`);
    await expectVisible(node, `the card opens into its steps, ${ending} among them`);
    await expectVisible(
      node.locator('[data-need="approve"]', { hasText: `approve ${ending} to run it` }),
      `${ending}'s tile says approving runs it`,
    );
    await node.click();
    const inspector = stepBar(page, id, ending);
    const asked = inspector.locator(`section[aria-label="What ${ending} asks of you"]`);
    await expectVisible(asked, `the inspector of ${ending} opens on what it asks of you`);
    await expectVisible(
      asked.locator('[data-brief="waits"]', { hasText: `${ending} waits at its gate: it has not run, and it runs only on your approval.` }),
      'which step waits',
    );
    await expectVisible(
      asked.locator('[data-brief="approving"]', { hasText: `Approving runs ${ending} in the repository's own checkout, on main` }),
      'what approving does',
    );
    await expectVisible(asked.locator('[data-brief="approving"]', { hasText: `“${ENDING.says}”` }), "in the folder's own words");
    await expectVisible(
      asked.locator('[data-brief="sending-back"]', { hasText: `Sending back asks ${back} for a new try` }),
      `and that a send-back goes to ${back}`,
    );
    const facts = asked.locator('dl[aria-label="What to decide on"]');
    await expectVisible(facts.locator('[data-fact="round"]', { hasText: /^round \d/ }), 'the round, and its cost');
    await expectVisible(facts.locator('[data-fact="merges"]'), 'and whether the branch still merges onto main, off the decision');
    await expectVisible(
      facts.locator('[data-fact="others"][data-state="bad"]', {
        hasText: new RegExp(`^collides with 1 of the \\d runs in flight on main: ${FAKE.id}$`),
      }),
      `and the runs in flight on main its branch collides with: ${FAKE.id}, whose branch changed the same file`,
    );
    await expectVisible(
      facts.locator('[data-fact="collides"][data-state="bad"]', {
        hasText: `conflicts with ${FAKE.id}'s ${FAKE.branch} in 1 file: CLAUDE.md`,
      }),
      `with ${FAKE.branch}, and in which file`,
    );
    await expectVisible(
      inspector.locator('[data-unfiled]', { hasText: 'not filed yet: it waits at its gate' }),
      `${ending} is not filed, and its inspector says so`,
    );
    await expectCount(inspector.locator('dt', { hasText: /^sessions$/ }), 0, 'rather than a table of dashes');
    await expectVisible(asked.getByRole('button', { name: 'Approve', exact: true }), "the inspector answers it too, the run page's gate");
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-inspector-${await themeOf(page)}.png`), { fullPage: true });
    await inspector.getByRole('button', { name: 'Close', exact: true }).click();
    await card.getByRole('button', { name: 'Hide steps' }).click();

    await answerOf(page, 'Approve').click();
    await expectVisible(
      approval(page).getByText(`This runs ${ending} in the repository's own checkout on main, and it cannot be taken back.`),
      'the popover says what approving runs',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-confirm-${await themeOf(page)}.png`), { fullPage: true });
    const [response] = await Promise.all([page.waitForResponse(approved, { timeout: WAIT_MS }), runNow(page).click()]);
    if (response.status() !== 202)
      throw new Refused(`the api takes the approval — it answered ${response.status()}: ${await response.text()}`);
    const file = path.join(asks, `approve-${ending}-1`);
    const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
    if (written?.step !== ending || written?.try !== 1 || 'message' in written || fs.readdirSync(asks).length !== 1) {
      throw new Refused(
        `the approval is written as wf approve writes it, with no words, and nothing else — ${file} ${JSON.stringify(written)}`,
      );
    }
    await expectCount(approval(page), 0, 'the popover closes');
    await expectVisible(
      card.locator('[data-taken]', { hasText: `approved — the next pass files ${ending}` }),
      'the card says it is approved, and what comes next',
    );
    await expectCount(answerOf(page, 'Approve'), 0, 'and offers the gate no more');
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-approved-${await themeOf(page)}.png`), { fullPage: true });
    fs.rmSync(asks, { recursive: true, force: true });
    fed(id, ending, 'awaiting approval');
    await expectVisible(answerOf(page, 'Approve'), 'with the approval taken back, the card offers the gate again');
    await expectCount(card.locator('[data-taken]'), 0, 'and says nothing of the answer taken back');

    await answerOf(page, 'Send back').click();
    const sending = page.getByRole('dialog', { name: `Send ${back} back` });
    const send = sending.getByRole('button', { name: 'Send back', exact: true });
    await expectVisible(send, `the popover sends it to ${back}`);
    if (await send.isEnabled()) throw new Refused('Send back is disabled while there are no words — it was enabled with none');
    await sending.getByRole('textbox', { name: `What to change, sent back to ${back}` }).fill(ENDING.objection);
    const [sent] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), send.click()]);
    if (sent.status() !== 202)
      throw new Refused(`the api takes the send-back to ${back} — it answered ${sent.status()}: ${await sent.text()}`);
    const ask = path.join(asks, `retry-${back}-2`);
    const retry = fs.existsSync(ask) ? JSON.parse(fs.readFileSync(ask, 'utf8')) : undefined;
    if (retry?.step !== back || retry?.mode !== 'continue' || retry?.message !== ENDING.objection) {
      throw new Refused(`the send-back is written as wf retry --message writes it — ${ask} holds ${JSON.stringify(retry)}`);
    }
    await expectVisible(
      card.locator('[data-taken]', { hasText: `sent back to ${back} — try 2 asked` }),
      'the card says it is sent back, and what comes next',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-sent-back-${await themeOf(page)}.png`), { fullPage: true });
    fs.rmSync(asks, { recursive: true, force: true });
    fed(id, ending, 'awaiting approval');
    await expectVisible(
      answerOf(page, 'Approve'),
      'with the send-back taken back, the card offers the gate again, and the page ends as it began',
    );

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
    await showFinished(page);
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;
