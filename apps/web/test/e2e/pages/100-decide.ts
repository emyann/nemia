import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'playwright';
import { expectRendered, sidebar, themeOf } from '../board.ts';
import { expectCount, expectLeftOf, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { ENDING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  // A run at its ending's gate: what there is to decide, said above the page, and what the ending would act on beside its gate.
  name: 'decide',
  route: `/runs/${ENDING.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, ending, back } = ENDING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const said = `${ENDING.says} — wf approve ${id} ${ending}`;

    // Above the page, as `wf ls` prints `→ to decide:` above `→ waiting on you`: the ending's own words, linked to its section.
    const banner = page.locator('section[aria-label="To decide"]');
    await expectVisible(banner.locator('[data-approve]', { hasText: said }), `the banner says ${said}, linked to the step's section`);
    await expectCount(banner.locator(`a[data-approve="${ending}"][href="#step-${ending}"]`), 1, `to ${ending}'s section, where Approve is`);
    await expectCount(page.locator('section[aria-label="Waiting on you"]'), 0, 'and the banner below says nothing: the decision is the whole of what it waits on you for');

    // On the graph: a human gate, since nothing after it is filed until a person's word — and nobody runs it meanwhile.
    const node = page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${ending}"]`);
    await expectVisible(node.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }), `${ending}'s chip reads awaiting approval`);
    await expectVisible(node.locator('[data-need="approve"]', { hasText: `approve ${ending}` }), `${ending} is a human gate on the graph`);

    // Its section: what it would act on — the branch's standing and git's own diff stat, and the work's closeout with the file it named
    // — beside the gate. It has handed nothing on: its approval is what runs it.
    const section = page.locator(`article > section#step-${ending}`);
    const acts = section.locator(`section[aria-label="What ${ending} would act on"]`);
    const gate = section.locator(`section[aria-label="The gate of ${ending}"]`);
    await expectVisible(acts.locator('[data-standing="ahead"]', { hasText: ENDING.standing }), `the panel says where the branch stands (${ENDING.standing})`);
    await expectVisible(acts.locator('[data-stat]', { hasText: ENDING.stat }), `and git's own diff stat of it (${ENDING.stat})`);
    // What the work handed on, rendered as the markdown it is — scoped to the markdown, since the files beside it are a list too.
    await expectRendered(acts.locator('[data-markdown]'), ENDING.review);
    await expectVisible(acts.locator(`[aria-label="Artifacts of ${back}"] a`, { hasText: ENDING.artifact }), `and the file ${back} named (${ENDING.artifact})`);
    await expectVisible(gate, `${ending}'s section has its gate`);
    await expectLeftOf(acts, gate, 'the gate is beside what the ending would act on');
    await expectVisible(
      gate.getByText(`nothing of it runs until you approve it — your approval is what files it — or you send ${back} back.`),
      'the gate says approving is what files it: an ending has handed nothing on',
    );
    const approve = gate.getByRole('button', { name: 'Approve', exact: true });
    if (!(await approve.isEnabled())) throw new Refused('Approve is enabled with no words: an approval needs none');
    // The words go to the step itself, as its own brief is handed them (`## Approved`): nothing follows an ending to be handed anything.
    const words = gate.getByRole('textbox', { name: `Words to approve ${ending} with, if any` });
    const placeholder = await words.getAttribute('placeholder');
    if (placeholder !== 'Your words (optional): the step is handed them as the terms it acts on, under “Approved”.') {
      throw new Refused(`the approval's box says the words are the terms the step acts on — it says ${JSON.stringify(placeholder)}`);
    }
    // Its facts: it runs in the repository's own checkout, and its gate awaits your word.
    await expectVisible(section.locator('dd', { hasText: /^main$/ }), `${ending}'s facts say it runs in the repository's own checkout (workspace main)`);
    await expectVisible(section.locator('dd', { hasText: /^awaiting approval$/ }), 'and that its gate awaits approval');
    // The send-back goes to the work, which is what the objection is about: `wf retry` of the step at this gate is refused.
    const sendBack = gate.getByRole('form', { name: `Send ${back} back` });
    await expectVisible(sendBack, `the send-back names ${back}, the step the package sends it to`);
    await expectCount(gate.getByRole('form', { name: `Send ${ending} back` }), 0, `and never ${ending}, which has nothing of its own to object to`);

    // The Decide section's commands are the gate's, and never `git merge` by hand: this folder's ending is what merges.
    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(decide.locator('[data-command="approve"] code', { hasText: new RegExp(`^wf approve ${id} ${ending}$`) }), 'the Decide section offers the approval to copy');
    await expectVisible(decide.locator('[data-command="send back"] code', { hasText: `wf retry ${id} ${back} --message "<objection>"` }), 'and the send-back, to the work');
    await expectCount(decide.locator('[data-command="ship it"], [data-command="drop it"]'), 0, 'and no git merge by hand: the ending step is what merges this branch');
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `decide-awaiting-${await themeOf(page)}.png`), fullPage: true });

    // Sent back: the ask is written for the work, as `wf retry --message` writes it, and nothing else. The gate un-holds until it signs
    // off again, so the banner and the gate go with it.
    const retried = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${back}/retry`;
    await sendBack.getByRole('textbox').fill(ENDING.objection);
    const [sent] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), sendBack.getByRole('button', { name: 'Send back', exact: true }).click()]);
    if (sent.status() !== 202) throw new Refused(`the api takes the send-back to ${back} — it answered ${sent.status()}: ${await sent.text()}`);
    const ask = path.join(asks, `retry-${back}-2`);
    const asked = fs.existsSync(ask) ? JSON.parse(fs.readFileSync(ask, 'utf8')) : undefined;
    if (asked?.step !== back || asked?.try !== 2 || asked?.mode !== 'nudge' || asked?.message !== ENDING.objection) {
      throw new Refused(`the send-back is written as wf retry --message writes it, for ${back} — ${ask} holds ${JSON.stringify(asked)}`);
    }
    if (fs.readdirSync(asks).length !== 1) throw new Refused(`and nothing else — ${asks} holds ${fs.readdirSync(asks).join(', ')}`);
    const note = 'try 2 asked (--nudge, with your answer) — the next tick files it';
    await expectVisible(page.locator(`article > section#step-${back} [data-note]`, { hasText: note }), `${back}'s section says what wf ls says of the try asked`);
    await expectCount(page.locator('section[aria-label="To decide"]'), 0, 'and there is nothing to decide while the work is asked for again');
    await expectCount(gate, 0, 'and the gate holds nothing: it holds on the work, and the work was sent back');
    // And its facts say where that gate holds — never that it holds once a step whose approval is what files it has signed off.
    await expectVisible(
      section.locator('dd', { hasText: /^holds once the work has handed on, and your approval files it$/ }),
      `${ending}'s facts say its gate holds once the work has handed on`,
    );
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `decide-sent-back-${await themeOf(page)}.png`), fullPage: true });

    // Taken back, and the page ends as it began — the branch read again for the state it is back in, so its photograph is of the whole
    // panel and not of a panel still reading.
    fs.rmSync(asks, { recursive: true, force: true });
    await expectVisible(banner.locator('[data-approve]', { hasText: said }), 'with the send-back taken back, the gate holds again once the run is read again');
    await expectVisible(gate, `and ${ending} waits at it`);
    await expectVisible(acts.locator('[data-standing="ahead"]', { hasText: ENDING.standing }), 'and the panel says where the branch stands again');
    await settled(page);
  },
} satisfies PageSpec;
