import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { expectRendered, fed, photograph, sidebar, themeOf, stepBar } from '../board.ts';
import { expectCount, expectLeftOf, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/**
 * Refuses unless `policy`, the step's policy at the gate `where`, is drawn open once: plan's own words and the deny its file adds, named as
 * a tightening of planner's fence, and what was told before it — never the planner's own instructions, which stay in the Told fold.
 */
async function expectPolicy(policy: Locator, where: string): Promise<void> {
  const { planner } = GATED;
  await expectCount(policy, 1, `${GATED.gated}'s policy is drawn open at its gate, ${where}`);
  await expectVisible(
    policy.locator('[data-layer="policy"] [data-markdown]', { hasText: planner.policy }),
    `with its words, ${planner.policy}`,
  );
  await expectVisible(
    policy.locator('[data-fence="disallowedTools"]', { hasText: `disallowedTools: ${planner.deny}` }),
    `and the deny its file adds, ${planner.deny}`,
  );
  await expectVisible(policy.getByText(`Tightens ${planner.name}'s fence:`), `named as a tightening of ${planner.name}'s fence`);
  await expectVisible(policy.getByText(`Told after ${planner.name}'s instructions; where they conflict, this wins.`), 'after what');
  await expectCount(policy.getByText(planner.instructions), 0, `and never ${planner.name}'s own words: they are in the Told fold`);
}

export default {
  /**
   * The gate on the board: a run waiting at plan's gate, the closeout plan handed on rendered in it, beside Approve and Send back. Refused
   * first, in a page of its own whose one refusal is the point: an approval of a step that is not gated, the page having read the gate and
   * the record lost it before Approve was pressed, in the package's words beside the button, and nothing written. Then approved from the
   * page, with words: the approval's file as `wf approve` writes it, and the page reads the approval under the step. Taken back, and sent
   * back from the page: the ask as `wf retry --message` writes it. Each file is taken back, so every page after this one reads the store as
   * seeded.
   */
  name: 'gate',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, gated } = GATED;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const recordFile = path.join(store!, 'runs', `${id}.json`);
    const seededRecord = fs.readFileSync(recordFile, 'utf8');
    const approved = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/approve`;
    const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/retry`;
    const gateOf = (p: Page) => p.locator(`section[aria-label="The gate of ${gated}"]`);
    const wordsOf = (p: Page) => gateOf(p).getByRole('textbox', { name: `Words to approve ${gated} with, if any` });
    const approveOf = (p: Page) => gateOf(p).getByRole('button', { name: 'Approve', exact: true });

    const banner = page.locator('section[aria-label="Waiting on you"]');
    const line = `Waiting on you: approve ${gated} — signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget — nemia decide ${id}`;
    await expectVisible(banner.locator(':scope > p', { hasText: line }), `the banner says, in wf ls's words, ${line}`);
    await expectCount(banner.locator(':scope > p'), 1, 'in its one line');
    await expectCount(
      banner.locator(`a[data-approve="${gated}"][href="#step-${gated}"]`),
      1,
      `approve ${gated} links to the step's section`,
    );
    await expectCount(banner.locator('li'), 0, 'and lists nothing under it: the approval is no question');

    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const node = graph.locator(`.react-flow__node[data-id="${gated}"]`);
    await expectVisible(
      node.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }),
      `${gated}'s chip reads awaiting approval, as a wait on a person`,
    );
    await expectVisible(
      node.locator('[data-need="approve"]', { hasText: `approve ${gated}` }),
      `${gated} is a human gate on the graph, and says approve ${gated}`,
    );
    await expectCount(node.getByRole('img', { name: 'running now' }), 0, 'and no spinner: nobody runs a step at its gate');

    await expectCount(
      page.getByText(/no longer reads as a workflow|has changed since this run started/),
      0,
      'no warning about the workflow folder: it reads as the workflow the run froze, its declared output with it',
    );
    const section = page.locator(`article > section#step-${gated}`);
    await expectVisible(gateOf(page), `${gated}'s section has its gate`);
    await expectVisible(
      gateOf(page).locator('p code').getByText(`nemia approve ${id} ${gated}`, { exact: true }),
      "and beside its Approve, the command that does the same, as the api's decision words it",
    );
    const handedOn = gateOf(page).locator(`section[aria-label="What ${gated} handed on"]`);
    await expectRendered(handedOn.locator('[data-handed-on] > [data-markdown]'), { heading: GATED.plan.heading, items: GATED.plan.items });
    await expectVisible(
      handedOn.locator('[data-field="approach"]', { hasText: GATED.output.approach }),
      `the plan's approach is at the gate, read without a tab (${GATED.output.approach})`,
    );
    for (const [name, entries] of [
      ['steps', GATED.output.steps],
      ['risks', GATED.output.risks],
    ] as const) {
      await expectVisible(
        handedOn.locator(`[data-field="${name}"]`, { hasText: entries[0] }),
        `its ${name}, ${entries.length} of them, drawn unfolded`,
      );
    }
    const files = handedOn.locator('details[data-fold="files"]:not([open])');
    await expectVisible(
      files.locator('summary', { hasText: `files · ${GATED.output.files.length}` }),
      `its ${GATED.output.files.length} files are folded, the fold saying how many`,
    );
    await expectCount(handedOn.getByText(GATED.output.files[0].path), 0, 'and no file is drawn while the fold is shut');
    await expectLeftOf(
      handedOn,
      gateOf(page).locator(`form[aria-label^="Approve"]`),
      'what is being approved is beside Approve, on its left',
    );
    await expectVisible(wordsOf(page), 'a box for the words to approve with');
    if (!(await approveOf(page).isEnabled())) throw new Refused('Approve is enabled with no words: an approval needs none');
    const objection = gateOf(page).getByRole('textbox', { name: `What to change, sent back to ${gated}` });
    const sendBack = gateOf(page).getByRole('button', { name: 'Send back', exact: true });
    await expectVisible(objection, 'and the answer box that sends it back');
    if (await sendBack.isEnabled()) throw new Refused('Send back is disabled while there is no objection — it was enabled with none');
    await expectVisible(
      gateOf(page).getByRole('radio', { name: /^a new session/ }),
      'a new session as an option to continuing its session',
    );
    await expectVisible(section.locator('dd', { hasText: /^awaiting approval$/ }), "the step's facts say its gate awaits approval");
    const decide = page.locator('section[aria-label="Decide"]');
    await expectCount(
      decide.locator('section[aria-label="Answer"]'),
      0,
      "the Decide section offers no answer of its own: the gate is the step's",
    );
    await expectVisible(
      decide.locator('[data-command="approve"] code', { hasText: new RegExp(`^nemia approve ${id} ${gated}$`) }),
      'the Decide section offers the approval to copy, as wf decide prints it under the step',
    );
    await expectVisible(
      decide.locator('[data-command="send back"] code', { hasText: `nemia retry ${id} ${gated} --message "<objection>"` }),
      'and the send-back',
    );
    await expectCount(
      decide.getByText('None yet: the run is still moving.'),
      0,
      'and does not say the run is still moving: it waits on you',
    );
    const policy = section.locator('[data-gate-policy]');
    await expectPolicy(policy, 'on the run page');
    await settled(page);
    await photograph(page, path.join(OUT, `gate-awaiting-${await themeOf(page)}.png`), { fullPage: true });
    await photograph(policy, path.join(OUT, `gate-policy-${await themeOf(page)}.png`));
    await files.locator('summary').click();
    await expectVisible(handedOn.getByText(GATED.output.files[0].path), 'opened, the fold draws the files');
    await handedOn.locator('details[data-fold="files"] summary').click();
    await expectCount(handedOn.locator('details[data-fold="files"][open]'), 0, 'and shuts again');

    await node.click();
    const inspector = stepBar(page, id, gated);
    await expectVisible(
      inspector.getByRole('tab', { name: 'Output', selected: true }),
      `${gated}'s inspector opens on Output: it has signed off`,
    );
    await expectVisible(inspector.locator('[data-field="approach"]', { hasText: GATED.output.approach }), 'with the approach in it');
    await expectVisible(
      inspector.locator('[data-answer-at="Details"]', { hasText: `${gated} waits at its gate on you` }),
      'and says the answer is under Details',
    );
    await settled(page);
    await expectLeftOf(node, inspector, `the run is too wide to fit beside the bar at 1280, so ${gated} alone is fitted clear of it`);
    await photograph(page, path.join(OUT, `gate-inspector-${await themeOf(page)}.png`), { fullPage: true });
    await inspector.getByRole('tab', { name: 'Details' }).click();
    await expectPolicy(inspector.locator('[data-gate-policy]'), 'in its inspector, under Details');
    await settled(page);
    await photograph(inspector, path.join(OUT, `gate-inspector-policy-${await themeOf(page)}.png`));
    await inspector.getByRole('button', { name: 'Close', exact: true }).click();
    await expectCount(inspector, 0, 'closed, so the rest of the page reads one gate');

    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      const detailPath = `/api/runs/${id}`;
      const read = await (await refused.request.get(new URL(detailPath, page.url()).href)).text();
      await refused.route(
        (url) => url.pathname === detailPath,
        (route) => route.fulfill({ status: 200, contentType: 'application/json', body: read }),
      );
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      await expectVisible(approveOf(refused), 'Approve, on a page of its own whose every read of the run is held as it was first read');
      const { gates: _gates, ...ungated } = JSON.parse(seededRecord) as { gates?: string[] };
      fs.writeFileSync(recordFile, JSON.stringify(ungated, null, 2));
      await wordsOf(refused).fill(GATED.words);
      const [answered] = await Promise.all([refused.waitForResponse(approved, { timeout: WAIT_MS }), approveOf(refused).click()]);
      const { error } = (await answered.json()) as { error?: string };
      if (
        answered.status() !== 409 ||
        !error?.startsWith(
          `${gated} has no gate: what waits on it is filed once it has signed off, with nobody's approval, so there is nothing to approve. ${id} is gated at no step.`,
        )
      ) {
        throw new Refused(
          `the package refuses an approval of a step that is not gated, as a run started without --gate reads — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      const refusal = gateOf(refused).locator('form[aria-label^="Approve"] [data-refused]');
      await expectVisible(refusal.getByText('Not approved. The api refused it:'), 'the refusal is shown beside Approve, not swallowed');
      const shown = await refusal.locator('p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal beside Approve is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      if ((await wordsOf(refused).inputValue()) !== GATED.words)
        throw new Refused('the words stay in the box after a refusal, to approve with again');
      if (fs.existsSync(asks))
        throw new Refused(`nothing is written on a refusal — ${asks} holds ${fs.readdirSync(asks, { recursive: true }).join(', ')}`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `gate-refused-${await themeOf(refused)}.png`), { fullPage: true });
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal, its answer and the line Chromium writes to the console for one, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      fs.writeFileSync(recordFile, seededRecord);
      fed(id, gated, 'awaiting approval');
    }

    await expectVisible(approveOf(page), `with its gate back on the record, ${gated} waits at it once the run is read again`);
    await wordsOf(page).fill(GATED.words);
    const [response] = await Promise.all([page.waitForResponse(approved, { timeout: WAIT_MS }), approveOf(page).click()]);
    if (response.status() !== 202)
      throw new Refused(
        `the api takes the approval, through the board's proxy — it answered ${response.status()}: ${await response.text()}`,
      );
    const took = (await response.json()) as { try?: unknown; at?: unknown; message?: unknown; file?: unknown };
    const file = path.join(asks, `approve-${gated}-1`);
    if (took.try !== 1 || typeof took.at !== 'string' || took.message !== GATED.words || took.file !== file) {
      throw new Refused(
        `the api answers with the try approved, when, the words and the approval's file — it answered ${JSON.stringify(took)}`,
      );
    }
    const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
    if (
      JSON.stringify(written) !== JSON.stringify({ step: gated, try: 1, at: took.at, message: GATED.words }) ||
      fs.readdirSync(asks).length !== 1
    ) {
      throw new Refused(
        `the approval is written as wf approve writes it, and nothing else — ${asks} holds ${fs.readdirSync(asks).join(', ')}, and ${file} ${JSON.stringify(written)}`,
      );
    }
    if (fs.readFileSync(recordFile, 'utf8') !== seededRecord)
      throw new Refused(`the api writes nothing of the run's record — ${recordFile} changed`);

    const approval = section.locator(`section[aria-label="The approval of ${gated}"]`);
    await expectVisible(approval, `the approval shows under ${gated} once the run is read again`);
    const words = await approval.locator('[data-words]').textContent();
    if (words !== GATED.words) throw new Refused(`the approval's words are shown as they were written — it shows ${JSON.stringify(words)}`);
    await expectVisible(approval.locator(`time[datetime="${took.at}"]`), 'with when it was given');
    await expectCount(gateOf(page), 0, 'and the gate is gone: nothing to approve');
    await expectCount(banner, 0, 'and the banner with it: nobody is waited on');
    await expectVisible(section.locator('dd', { hasText: /^approved, try 1$/ }), "the step's facts say its gate is approved");
    await settled(page);
    await photograph(page, path.join(OUT, `gate-approved-${await themeOf(page)}.png`), { fullPage: true });

    fs.rmSync(asks, { recursive: true, force: true });
    fed(id, gated, 'awaiting approval');
    await expectVisible(approveOf(page), `with the approval taken back, ${gated} waits at its gate again once the run is read again`);
    await expectCount(approval, 0, 'and its approval is gone from under it');
    await objection.fill(GATED.objection);
    const [sent] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), sendBack.click()]);
    if (sent.status() !== 202) throw new Refused(`the api takes the send-back — it answered ${sent.status()}: ${await sent.text()}`);
    const ask = path.join(asks, `retry-${gated}-2`);
    const asked = fs.existsSync(ask) ? JSON.parse(fs.readFileSync(ask, 'utf8')) : undefined;
    if (asked?.step !== gated || asked?.try !== 2 || asked?.mode !== 'nudge' || asked?.message !== GATED.objection) {
      throw new Refused(`the send-back is written as wf retry --message writes it — ${ask} holds ${JSON.stringify(asked)}`);
    }
    const note = 'try 2 asked (--nudge, with your answer) — the next tick files it';
    await expectVisible(
      section.locator('[data-note]', { hasText: note }),
      `${gated}'s section says what wf ls says of the try asked (${note})`,
    );
    await expectCount(gateOf(page), 0, 'and offers the gate no more: it is sent back');
    await settled(page);
    await photograph(page, path.join(OUT, `gate-sent-back-${await themeOf(page)}.png`), { fullPage: true });

    fs.rmSync(asks, { recursive: true, force: true });
    fed(id, gated, 'awaiting approval');
    await expectVisible(approveOf(page), `with the send-back taken back, ${gated} waits at its gate again, and the page ends as it began`);
    await settled(page);
  },
} satisfies PageSpec;
