import path from 'node:path';
import type { Page, Response } from 'playwright';
import { LIST_PAGE } from 'objects';
import { fed, photograph, stepBar, themeOf, isRunAction } from '../board.ts';
import { cardOf, expectClearOfEachOther, gateAnswer, gateApprove, showFinished } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { ENDING, FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredAsks, OUT, storeAsk, storedAsks } from '../world.ts';

export default {
  /**
   * A gate answered on the Factory, from the floor as the grid lays it out: the gated step's card says what approving does and where a
   * send-back goes, and answers it; its inspector says it in full, first, with the facts to decide on, FAKE's run in flight on
   * main its branch collides with among them. In a page of its own whose one refusal is the point, an approval with words made
   * elsewhere first is refused; then the gate is approved on the card with one press of Approve, and sent back… with words from its
   * split button's menu. The page takes each file back and lays
   * the floor out again, each card still clear of the one beneath it, so each page after it reads the store and the floor as seeded.
   */
  name: 'factory-gate',
  route: '/factories/default',
  expect: async (page) => {
    const { id, ending, back } = ENDING;
    const approved = (r: Response) =>
      r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${ending}/approve`);
    const retried = (r: Response) => r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${back}/retry`);
    const lineOf = (p: Page) => cardOf(p, id).locator(`[data-gate-line="${ending}"]`);
    const approveOf = (p: Page) => gateApprove(cardOf(p, id));
    const approval = (p: Page) => p.getByRole('dialog', { name: `Approve ${ending}` });
    const confirm = (p: Page) => approval(p).getByRole('button', { name: 'Approve', exact: true });
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    const card = cardOf(page, id);
    await expectVisible(
      lineOf(page).filter({ hasText: `approve what ${ending} handed on, or send it back` }),
      `the card says what approving ${ending} does`,
    );
    await expectCount(card.locator('[data-taken]'), 0, 'and nothing is answered yet');

    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      const listed = await (await refused.request.get(new URL(`/api/runs?limit=${LIST_PAGE.most}`, page.url()).href)).text();
      await refused.route(
        (url) => url.pathname === '/api/runs' && !url.searchParams.has('fieldSelector'),
        (route) => route.fulfill({ status: 200, contentType: 'application/json', body: listed }),
      );
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      await expectVisible(approveOf(refused), 'Approve on the card, on a page of its own that holds the list as the card read it');
      storeAsk(id, `approve-${ending}-1`, JSON.stringify({ step: ending, try: 1, at: new Date().toISOString() }));
      await gateAnswer(refused, cardOf(refused, id), ending, 'Approve with words…');
      await expectVisible(approval(refused), 'Approve with words… opens a popover to confirm it in');
      await approval(refused)
        .getByRole('textbox', { name: `Words to approve ${ending} with, if any` })
        .fill(ENDING.objection);
      const [answered] = await Promise.all([refused.waitForResponse(approved, { timeout: WAIT_MS }), confirm(refused).click()]);
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
      dropStoredAsks(id);
      fed(id, ending, 'awaiting approval');
    } finally {
      dropStoredAsks(id);
      await refused.close();
    }
    await expectVisible(approveOf(page), 'the gate is on the card again once the approval is taken back');

    await card.getByRole('button', { name: 'Show steps' }).click();
    const node = card.locator(`[data-tile="${ending}"]`);
    await expectVisible(node, `the card opens into its steps, ${ending} among them`);
    await expectVisible(
      card.locator(`[data-gate-line="${ending}"]`, { hasText: `approve what ${ending} handed on` }),
      `the opened card's gate says approving takes what ${ending} handed on`,
    );
    await node.click();
    const inspector = stepBar(page, id, ending);
    const asked = inspector.locator(`section[aria-label="What ${ending} asks of you"]`);
    await expectVisible(asked, `the inspector of ${ending} opens on what it asks of you`);
    await expectVisible(
      asked.locator('[data-brief="waits"]', {
        hasText: `${ending} has signed off and waits at its gate: nothing after it is filed until you approve what it handed on.`,
      }),
      'which step waits',
    );
    await expectVisible(
      asked.locator('[data-brief="approving"]', { hasText: 'Approving files nothing: no step waits on it' }),
      'what approving does',
    );
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
    await expectVisible(asked.getByRole('button', { name: 'Approve', exact: true }), "the inspector answers it too, the run page's gate");
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-inspector-${await themeOf(page)}.png`), { fullPage: true });
    await inspector.getByRole('button', { name: 'Close', exact: true }).click();
    await card.getByRole('button', { name: 'Hide steps' }).click();

    await settled(page);
    const [response] = await Promise.all([page.waitForResponse(approved, { timeout: WAIT_MS }), approveOf(page).click()]);
    if (response.status() !== 202)
      throw new Refused(`the api takes the approval — it answered ${response.status()}: ${await response.text()}`);
    const file = `approve-${ending}-1`;
    const written = JSON.parse(storedAsks(id)[file] ?? 'null');
    if (written?.step !== ending || written?.try !== 1 || 'message' in written || Object.keys(storedAsks(id)).length !== 1) {
      throw new Refused(
        `the approval is written as wf approve writes it, with no words, and nothing else — the run's ask ${file} holds ${JSON.stringify(written)}, beside ${Object.keys(storedAsks(id)).join(', ')}`,
      );
    }
    await expectVisible(
      card.locator('[data-taken]', { hasText: `approved — the next pass files what waits on ${ending}` }),
      'the card says it is approved, and what comes next',
    );
    await expectCount(approveOf(page), 0, 'and offers the gate no more');
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-approved-${await themeOf(page)}.png`), { fullPage: true });
    dropStoredAsks(id);
    fed(id, ending, 'awaiting approval');
    await expectVisible(approveOf(page), 'with the approval taken back, the card offers the gate again');
    await expectCount(card.locator('[data-taken]'), 0, 'and says nothing of the answer taken back');

    await card.getByRole('button', { name: `Other answers to ${ending}`, exact: true }).click();
    const answers = page.getByRole('menu');
    await expectVisible(answers.getByRole('menuitem', { name: 'Approve with words…', exact: true }), 'the menu offers Approve with words…');
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-menu-${await themeOf(page)}.png`), { fullPage: true });
    await answers.getByRole('menuitem', { name: 'Send back…', exact: true }).click();
    const sending = page.getByRole('dialog', { name: `Send ${back} back` });
    const send = sending.getByRole('button', { name: 'Send back', exact: true });
    await expectVisible(send, `the popover sends it to ${back}`);
    if (await send.isEnabled()) throw new Refused('Send back is disabled while there are no words — it was enabled with none');
    await sending.getByRole('textbox', { name: `What to change, sent back to ${back}` }).fill(ENDING.objection);
    const [sent] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), send.click()]);
    if (sent.status() !== 202)
      throw new Refused(`the api takes the send-back to ${back} — it answered ${sent.status()}: ${await sent.text()}`);
    const ask = `retry-${back}-2`;
    const retry = JSON.parse(storedAsks(id)[ask] ?? 'null');
    if (retry?.step !== back || retry?.mode !== 'continue' || retry?.message !== ENDING.objection) {
      throw new Refused(`the send-back is written as wf retry --message writes it — the run's ask ${ask} holds ${JSON.stringify(retry)}`);
    }
    await expectVisible(
      card.locator('[data-taken]', { hasText: `sent back to ${back} — try 2 asked` }),
      'the card says it is sent back, and what comes next',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-gate-sent-back-${await themeOf(page)}.png`), { fullPage: true });
    dropStoredAsks(id);
    fed(id, ending, 'awaiting approval');
    await expectVisible(approveOf(page), 'with the send-back taken back, the card offers the gate again, and the page ends as it began');

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
    await showFinished(page);
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;
