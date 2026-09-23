import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { sidebar, themeOf } from '../board.ts';
import { expectCount, expectInside, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { COSTLY } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  // What a run cost, and steps held on their budget: the run's cost in its header, a cost column on the timeline, a step's cost of its cap on
  // its node and in the inspector, red past it — and the raises the Decide section offers, one refused in a page of its own, where it is not
  // above what was spent, in the package's words and with nothing written. Nothing is taken: every page after this one reads the store as seeded.
  name: 'cost',
  route: `/runs/${COSTLY.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { over, held, asks: askingStep } = COSTLY;
    await expectCount(page.getByText(/no longer reads as a workflow|has changed since this run started/), 0, 'no warning about the workflow folder: it reads as the budgets the run froze');
    await expectVisible(page.locator('article header [data-run-cost]', { hasText: `cost ${COSTLY.cost}` }), `the run's header says what it cost (${COSTLY.cost})`);
    // Beside it, what the same sessions read: the classes every one of them measured, and the resumed session that rebuilt its cache.
    const runRead = page.locator('article header [data-run-read]');
    await expectVisible(runRead.locator('.font-mono', { hasText: COSTLY.read.run }), `and what its sessions read, by price (${COSTLY.read.run})`);
    await expectVisible(runRead.locator('[data-rebuilt="1"]', { hasText: COSTLY.read.rebuilt }), 'and that a resumed session rebuilt its cache, in words that say so');
    await expectCount(runRead.locator('[data-peak]'), 0, "no peak on the run's: review's Codex sessions measured none");
    // palette's section: its peak past 200k with no cap, marked.
    const palette = page.locator(`section#step-${COSTLY.asks.step}`);
    await expectVisible(palette.locator('dd [data-read]', { hasText: COSTLY.read.palette.counts }), `${COSTLY.asks.step}'s section says what its session read (${COSTLY.read.palette.counts})`);
    await expectVisible(palette.locator('[data-peak="large"]', { hasText: COSTLY.read.palette.peak }), `and marks its peak, past 200k with no cap`);
    // Whole: implement and review did their work, and are held on implement's budget alone — the reason has to be among those the banner gives.
    const reasons = `Waiting on you: ${COSTLY.steps.join(', ')} — signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget — wf decide ${COSTLY.id}`;
    await expectVisible(page.locator('section[aria-label="Waiting on you"] > p', { hasText: reasons }), `the banner says every step past its budget waits on you, and why: ${reasons}`);
    await expectVisible(
      page.locator(`section[aria-label="Waiting on you"] [data-need="asks"][data-step="${askingStep.step}"]`, { hasText: `${askingStep.step} asks: ${askingStep.needs}` }),
      `the banner says what ${askingStep.step}, signed off blocked past its budget, asks`,
    );

    // On the graph: each step's word with its amounts, amber and a human gate, and what its tries cost of its cap — red past it.
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const node = (name: string) => graph.locator(`.react-flow__node[data-id="${name}"]`);
    await expectCount(graph.locator('.react-flow__node'), COSTLY.steps.length, `the run's graph has a node per step (${COSTLY.steps.join(', ')})`);
    for (const [name, status] of [[over.step, over.status], [held.step, held.status], [held.target, held.targetStatus], [askingStep.step, askingStep.status]] as const) {
      await expectVisible(node(name).locator('[data-state="over-budget"]', { hasText: status }), `${name}'s chip on the graph says ${status}, amber`);
      await expectVisible(node(name).getByText('human gate'), `${name}, past a budget, is drawn as a human gate`);
    }
    await expectVisible(node(over.step).locator('[data-cost="over"]', { hasText: over.of }), `${over.step}'s node says what its tries cost of its cap (${over.of}), red past it`);
    await expectVisible(node(held.target).locator('[data-cost="over"]', { hasText: '$2.10 of $2' }), `${held.target}'s node says what its rounds cost of its cap`);
    await expectVisible(node(askingStep.step).locator('[data-cost="over"]', { hasText: askingStep.of }), `${askingStep.step}'s node says what its session cost of its cap (${askingStep.of})`);
    await expectCount(node(held.step).locator('[data-cost]'), 0, `${held.step}, with no cap and no session priced, has no cost row: not $0`);

    // The timeline's cost column: each session's, `not measured` for the Codex sessions nobody priced, nothing for a check, and the totals.
    const timeline = page.locator('section[aria-label="Timeline"]');
    const cellsSay = async (cells: Locator, want: readonly string[], assertion: string) => {
      await expectCount(cells, want.length, assertion);
      const said = await cells.allTextContents();
      if (JSON.stringify(said) !== JSON.stringify(want)) throw new Refused(`${assertion} — it says ${JSON.stringify(said)}`);
    };
    for (const [name, costs] of Object.entries(COSTLY.sessions)) {
      await cellsSay(timeline.locator(`tr[data-step="${name}"][data-task="session"] [data-cell="cost"]`), costs, `the timeline says what each of ${name}'s sessions cost (${costs.join(', ')})`);
    }
    await cellsSay(timeline.locator(`tr[data-step="${over.step}"][data-task="check"] [data-cell="cost"]`), ['', ''], `${over.step}'s checks cost nothing, and say nothing`);
    await cellsSay(timeline.locator('tfoot tr[data-total^="round-"] [data-cell="cost"]'), COSTLY.rounds, `each round of ${held.step}'s loop says what its sessions cost (${COSTLY.rounds.join(', ')})`);
    await cellsSay(timeline.locator('tfoot tr[data-total="run"] [data-cell="cost"]'), [COSTLY.cost], `the run's total says what it cost (${COSTLY.cost})`);

    // What `wf decide` says of steps held on their budget, and the raises: tokens' with its try, review's with its round, and none of implement's own.
    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(
      decide.locator('[data-over-budget]', { hasText: 'OVER BUDGET, waiting on you: implement ($2.10 of $2), palette ($1.50 of $1), review (held: its round would file implement again' }),
      "the Decide section says why each step past its budget is held, in wf decide's words",
    );
    await expectVisible(decide.locator('section[aria-label="Used"] dd', { hasText: 'run $7.85 measured · 2 attempts not measured' }), "and what every try of the run cost, in wf decide's words");
    const answers = decide.locator('section[aria-label="Answer"]');
    const raiseRow = (p: Page | Locator, name: string) => p.locator(`section[aria-label="Answer"] [data-offer="raise"][data-step="${name}"]`);
    const amountOf = (row: Locator, name: string) => row.getByRole('spinbutton', { name: new RegExp(`^The cap to raise ${name} to, in dollars`) });
    for (const [name, startsAt, button] of [
      [over.step, over.startsAt, 'Raise the budget and try again'], [held.step, held.startsAt, 'Raise the budget and go round again'], [askingStep.step, askingStep.startsAt, 'Raise the budget and answer'],
    ] as const) {
      const row = raiseRow(decide, name);
      await expectVisible(amountOf(row, name), `a box for the cap to raise ${name} to`);
      const value = await amountOf(row, name).inputValue();
      if (value !== startsAt) throw new Refused(`the box for ${name}'s cap starts at the first whole dollar above what was spent, ${startsAt} — it starts at ${value}`);
      await expectVisible(row.getByRole('button', { name: button }), `${name}'s row offers ${button}`);
    }
    await expectVisible(raiseRow(decide, over.step).getByRole('radio', { name: /^a new session/ }), `a new session as an option to continuing ${over.step}'s`);
    // Its check refused: its check again is a way on too, which needs no raise; and anything to tell a new session, if you like.
    await expectVisible(raiseRow(decide, over.step).getByRole('radio', { name: /^its check again/ }), `its check again as an option for ${over.step}, whose check refused`);
    await expectVisible(raiseRow(decide, over.step).getByRole('textbox', { name: `What to tell ${over.step}, if anything` }), `a box for anything to tell ${over.step}`);
    // Signed off blocked past its budget: its question on its row, and the answer beside the raise — the button waits for it, and is not pressed.
    const answering = raiseRow(decide, askingStep.step);
    await expectVisible(answering.locator('[data-asks]', { hasText: `asks: ${askingStep.needs}` }), `${askingStep.step}'s row says what it asks`);
    const answerBox = answering.getByRole('textbox', { name: `Your answer to ${askingStep.step}` });
    await expectVisible(answerBox, `an answer box for ${askingStep.step}, which asks, beside its raise`);
    const raiseAndAnswer = answering.getByRole('button', { name: 'Raise the budget and answer' });
    if (await raiseAndAnswer.isEnabled()) throw new Refused(`Raise the budget and answer is disabled while there is no answer — it was enabled with none`);
    await answerBox.fill('Warm ones.');
    if (!(await raiseAndAnswer.isEnabled())) throw new Refused('Raise the budget and answer is enabled once an answer is written — it stayed disabled');
    await answerBox.fill('');
    await expectCount(raiseRow(decide, held.step).getByRole('radio'), 0, 'a round has no mode to choose');
    await expectCount(answers.locator(`[data-step="${held.target}"]`), 0, `${held.target} has no row of its own: it goes again with ${held.step}'s round`);
    await expectVisible(decide.locator('[data-command="once more"] code', { hasText: `wf retry ${COSTLY.id} ${over.step} --budget <amount>` }), 'once more: the try with its cap raised, as a line');
    await expectVisible(decide.locator('[data-command="once more"] code', { hasText: `wf round ${COSTLY.id} ${held.step} --budget <amount>` }), 'once more: the round with its cap raised, as a line');

    // A raise not above what tokens' tries cost, in a page of its own whose one refusal is the point: the package's sentence beside the box,
    // word for word, the amount still in it, and nothing written.
    const asks = path.join(store!, 'runs', `${COSTLY.id}.asks`);
    const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${COSTLY.id}/steps/${over.step}/retry`;
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      const row = raiseRow(refused, over.step);
      const box = amountOf(row, over.step);
      await expectVisible(box, `the box for ${over.step}'s cap, on a page of its own`);
      await box.fill(String(COSTLY.refused));
      const [answered] = await Promise.all([
        refused.waitForResponse(retried, { timeout: WAIT_MS }),
        row.getByRole('button', { name: 'Raise the budget and try again' }).click(),
      ]);
      const sent = answered.request().postDataJSON() as { mode?: unknown; budget?: unknown } | null;
      if (sent?.mode !== 'nudge' || sent.budget !== COSTLY.refused) {
        throw new Refused(`the raise is sent as wf retry --budget ${COSTLY.refused} sends it, a nudge with the amount as a number — the board sent ${JSON.stringify(sent)}`);
      }
      const { error } = (await answered.json()) as { error?: string };
      const sentence = `--budget ${COSTLY.refused} is not above $4.25, what ${over.step}'s tries have cost: a try under it would read over budget again as soon as it ended.`;
      if (answered.status() !== 409 || !error?.startsWith(sentence)) {
        throw new Refused(`the package refuses a raise not above what ${over.step}'s tries cost — the api answered ${answered.status()}: ${JSON.stringify(error)}`);
      }
      await expectVisible(row.locator('[data-refused]'), 'the refusal is shown beside the box, not swallowed');
      const shown = await row.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error) throw new Refused(`the refusal beside the box is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`);
      if ((await box.inputValue()) !== String(COSTLY.refused)) throw new Refused('the amount stays in the box after a refusal, to raise again');
      if (fs.existsSync(asks)) throw new Refused(`nothing is written on a refusal — ${asks} holds ${fs.readdirSync(asks, { recursive: true }).join(', ')}`);
      await settled(refused);
      await refused.screenshot({ path: path.join(OUT, `cost-refused-${await themeOf(refused)}.png`), fullPage: true });
      await idle(refused);
      // The one refusal made, as the browser reports it — its answer, and the line Chromium writes to the console for one — and nothing else.
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
      if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await refused.close();
      fs.rmSync(asks, { recursive: true, force: true });
    }

    // tokens' Details: what its tries cost of its cap, red past it. Left open for the photograph.
    await node(over.step).click();
    const inspector = page.locator(`aside[aria-label="Step ${over.step}"]`);
    await expectVisible(inspector.locator('[data-spent="over"]', { hasText: over.of }), `the inspector's Details say what ${over.step}'s tries cost of its cap (${over.of}), red past it`);
    await expectVisible(inspector.locator('[data-state="over-budget"]', { hasText: over.status }), `and its word, ${over.status}`);
    // And what its try read: its peak at its `context: 200k` cap, and its resumed session's rebuilt cache, each marked.
    await expectVisible(inspector.locator('[data-peak="cap"]', { hasText: COSTLY.read.tokens.peak }), `the inspector marks ${over.step}'s peak at its cap (${COSTLY.read.tokens.peak})`);
    await expectVisible(inspector.locator('[data-rebuilt="1"]', { hasText: COSTLY.read.rebuilt }), `and says its resumed session rebuilt its cache`);
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas beside the open inspector');
  },
} satisfies PageSpec;
