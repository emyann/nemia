import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'playwright';
import { expectRendered, fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectLeftOf, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { ENDING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A run at its ending's gate: what there is to decide, said above the page, and what the ending would act on beside its gate. The work
   * is sent back from the gate, written as wf retry --message writes it, and the page takes the send-back back and ends as it began.
   */
  name: 'decide',
  route: `/runs/${ENDING.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, ending, back } = ENDING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const said = `${ENDING.says} — nemia approve ${id} ${ending}`;

    const banner = page.locator('section[aria-label="To decide"]');
    await expectVisible(
      banner.locator('[data-approve]', { hasText: said }),
      `the banner above the page says ${said}, as wf ls prints → to decide: above → waiting on you, linked to the step's section`,
    );
    await expectCount(banner.locator(`a[data-approve="${ending}"][href="#step-${ending}"]`), 1, `to ${ending}'s section, where Approve is`);
    await expectCount(
      page.locator('section[aria-label="Waiting on you"]'),
      0,
      'and the banner below says nothing: the decision is the whole of what it waits on you for',
    );

    const node = page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${ending}"]`);
    await expectVisible(
      node.locator('[data-state="awaiting-approval"]', { hasText: 'waits on you' }),
      `${ending}'s chip, awaiting approval, reads waits on you`,
    );
    await expectVisible(
      node.locator('[data-need="approve"]', { hasText: `approve ${ending}` }),
      `${ending} is a human gate on the graph: nothing after it is filed until a person's word`,
    );

    const section = page.locator(`article > section#step-${ending}`);
    const acts = section.locator(`section[aria-label="What ${ending} would act on"]`);
    const gate = section.locator(`section[aria-label="The gate of ${ending}"]`);
    await expectVisible(
      acts.locator('[data-standing="ahead"]', { hasText: ENDING.standing }),
      `the panel says where the branch stands (${ENDING.standing})`,
    );
    await expectVisible(acts.locator('[data-stat]', { hasText: ENDING.stat }), `and how much it changed (${ENDING.stat})`);
    await expectRendered(acts.locator('[data-markdown]'), ENDING.review);
    await expectVisible(
      acts.locator(`[aria-label="Artifacts of ${back}"] a`, { hasText: ENDING.artifact }),
      `and the file ${back} named (${ENDING.artifact})`,
    );
    await expectVisible(gate, `${ending}'s section has its gate`);
    await expectLeftOf(acts, gate, 'the gate is beside what the ending would act on');
    await expectVisible(
      gate.getByText(`nothing of it runs until you approve it — your approval is what files it — or you send ${back} back.`),
      'the gate says approving is what files it: an ending has handed nothing on',
    );
    const approve = gate.getByRole('button', { name: 'Approve', exact: true });
    if (!(await approve.isEnabled())) throw new Refused('Approve is enabled with no words: an approval needs none');
    const words = gate.getByRole('textbox', { name: `Words to approve ${ending} with, if any` });
    const placeholder = await words.getAttribute('placeholder');
    if (placeholder !== 'Your words (optional): the step is handed them as the terms it acts on, under “Approved”.') {
      throw new Refused(
        `the approval's box says the words are the terms the step itself acts on, handed to it under ## Approved in its brief — it says ${JSON.stringify(placeholder)}`,
      );
    }
    await expectVisible(
      section.locator('dd', { hasText: /^base$/ }),
      `${ending}'s facts say it runs in the repository's own checkout (workspace base)`,
    );
    await expectVisible(section.locator('dd', { hasText: /^awaiting approval$/ }), 'and that its gate awaits approval');
    const sendBack = gate.getByRole('form', { name: `Send ${back} back` });
    await expectVisible(sendBack, `the send-back names ${back}, the step the package sends it to, the work the objection is about`);
    await expectCount(
      gate.getByRole('form', { name: `Send ${ending} back` }),
      0,
      `and never ${ending}, which has nothing of its own to object to and whose wf retry the package refuses`,
    );

    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(
      decide.locator('[data-command="approve"] code', { hasText: new RegExp(`^nemia approve ${id} ${ending}$`) }),
      'the Decide section offers the approval to copy',
    );
    await expectVisible(
      decide.locator('[data-command="send back"] code', { hasText: `nemia retry ${id} ${back} --message "<objection>"` }),
      'and the send-back, to the work',
    );
    await expectCount(
      decide.locator('[data-command="land it"], [data-command="drop it"]'),
      0,
      'and no git merge by hand: the ending step is what merges this branch',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `decide-awaiting-${await themeOf(page)}.png`), { fullPage: true });

    const retried = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${back}/retry`;
    await sendBack.getByRole('textbox').fill(ENDING.objection);
    const [sent] = await Promise.all([
      page.waitForResponse(retried, { timeout: WAIT_MS }),
      sendBack.getByRole('button', { name: 'Send back', exact: true }).click(),
    ]);
    if (sent.status() !== 202)
      throw new Refused(`the api takes the send-back to ${back} — it answered ${sent.status()}: ${await sent.text()}`);
    const ask = path.join(asks, `retry-${back}-2`);
    const asked = fs.existsSync(ask) ? JSON.parse(fs.readFileSync(ask, 'utf8')) : undefined;
    if (asked?.step !== back || asked?.try !== 2 || asked?.mode !== 'continue' || asked?.message !== ENDING.objection) {
      throw new Refused(`the send-back is written as wf retry --message writes it, for ${back} — ${ask} holds ${JSON.stringify(asked)}`);
    }
    if (fs.readdirSync(asks).length !== 1) throw new Refused(`and nothing else — ${asks} holds ${fs.readdirSync(asks).join(', ')}`);
    const note = 'try 2 asked (--continue, with your answer) — the next tick files it';
    await expectVisible(
      page.locator(`article > section#step-${back} [data-note]`, { hasText: note }),
      `${back}'s section says what wf ls says of the try asked`,
    );
    await expectCount(
      page.locator('section[aria-label="To decide"]'),
      0,
      'and there is nothing to decide while the work is asked for again',
    );
    await expectCount(gate, 0, 'and the gate holds nothing: it holds on the work, and the work was sent back');
    await expectVisible(
      section.locator('dd', { hasText: /^holds once the work has handed on, and your approval files it$/ }),
      `${ending}'s facts say its gate holds once the work has handed on, never once ${ending}, which its approval files, has signed off`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `decide-sent-back-${await themeOf(page)}.png`), { fullPage: true });

    fs.rmSync(asks, { recursive: true, force: true });
    fed(id, ending, 'awaiting approval');
    await expectVisible(
      banner.locator('[data-approve]', { hasText: said }),
      'with the send-back taken back, the gate holds again once the run is read again',
    );
    await expectVisible(gate, `and ${ending} waits at it`);
    await expectVisible(
      acts.locator('[data-standing="ahead"]', { hasText: ENDING.standing }),
      'and the panel says where the branch stands again, read again before the photograph',
    );
    await settled(page);
  },
} satisfies PageSpec;
