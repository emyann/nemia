import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'playwright';
import { expectRendered, fed, openFold, partOf, photograph, sidebar, themeOf, isRunAction } from '../board.ts';
import { expectCount, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { ENDING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A run at its ending's gate: what there is to decide, said at the top of the page, and what the ending would act on above its gate,
   * the work it acts on linked to that step's part, where what it said and gave is drawn once. The work
   * is sent back from the gate, written as wf retry --message writes it, and the page takes the send-back back and ends as it began.
   */
  name: 'decide',
  route: `/runs/${ENDING.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, ending, back } = ENDING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const said = `${ENDING.says} — nemia approve ${id} ${ending}`;
    const banner = page.locator('section[aria-label="Asks of you"]');
    const decision = banner.locator(`li[data-ask="decide"][data-step="${ending}"]`, { hasText: said });
    await expectVisible(decision, `the asks at the top of the page say ${said}, as wf ls prints → to decide:`);
    await expectCount(
      decision.locator(`a[data-ask-link="${ending}"][href$="#step-${ending}"]`),
      1,
      `linked to ${ending}'s part, where Approve is`,
    );
    await expectCount(banner.locator('li'), 1, 'and nothing else: the decision is the whole of what it waits on you for');

    const node = page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${ending}"]`);
    await expectVisible(
      node.locator('[data-state="awaiting-approval"]', { hasText: 'waits on you' }),
      `${ending}'s chip, awaiting approval, reads waits on you`,
    );
    await expectVisible(
      node.locator('[data-need="approve"]', { hasText: `approve ${ending}` }),
      `${ending} is a human gate on the graph: nothing after it is filed until a person's word`,
    );

    const section = partOf(page, ending);
    const acts = section.locator(`section[aria-label="What ${ending} would act on"]`);
    const gate = section.locator(`section[aria-label="The gate of ${ending}"]`);
    await expectVisible(
      acts.locator('[data-standing="ahead"]', { hasText: ENDING.standing }),
      `the panel says where the branch stands (${ENDING.standing})`,
    );
    await expectVisible(acts.locator('[data-stat]', { hasText: ENDING.stat }), `and how much it changed (${ENDING.stat})`);
    const work = acts.locator(`[data-acts-on="${back}"] a[href$="#step-${back}"]`, { hasText: `What ${back} gave` });
    await expectVisible(work, `and links to what ${back}, the work it acts on, gave`);
    await expectCount(acts.locator('[data-markdown]'), 0, `${back}'s closeout is not drawn again at the gate`);
    const worked = partOf(page, back);
    await expectRendered((await openFold(worked.locator('[data-part-said]'), 'account')).locator('[data-body]'), ENDING.review);
    await expectVisible(
      worked.locator('[data-part-gave] [data-artifacts] a', { hasText: ENDING.artifact }),
      `${back}'s part, where the link goes, draws the file it named (${ENDING.artifact})`,
    );
    await expectVisible(gate, `${ending}'s part has its gate`);
    const above = await section.evaluate((part, name) => {
      const a = part.querySelector(`section[aria-label="What ${name} would act on"]`);
      const g = part.querySelector(`section[aria-label="The gate of ${name}"]`);
      return !!a && !!g && !!(a.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, ending);
    if (!above) throw new Refused('what the ending would act on is drawn above its gate');
    const brief = section.locator('[data-part-asks] [data-asked="approve"]');
    await expectVisible(
      brief.locator('[data-brief="waits"]', { hasText: `${ending} waits at its gate: it has not run, and it runs only on your approval.` }),
      'what it asks says approving is what files it: an ending has handed nothing on',
    );
    await expectVisible(
      brief.locator('[data-brief="sending-back"]', { hasText: `Sending back asks ${back} for a new try` }),
      `and sending back asks ${back}`,
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
    const detail = await openFold(section, 'detail');
    await openFold(detail, 'spec');
    await expectVisible(
      detail.locator('dd', { hasText: /^base$/ }),
      `${ending}'s facts say it runs in the repository's own checkout (workspace base)`,
    );
    await expectVisible(detail.locator('dd', { hasText: /^awaiting approval$/ }), 'and that its gate awaits approval');
    const sendBack = gate.getByRole('form', { name: `Send ${back} back` });
    await expectVisible(sendBack, `the send-back names ${back}, the step the package sends it to, the work the objection is about`);
    await expectCount(
      gate.getByRole('form', { name: `Send ${ending} back` }),
      0,
      `and never ${ending}, which has nothing of its own to object to and whose wf retry the package refuses`,
    );

    const decide = (await openFold(page.locator('[data-asks]'), 'decide')).locator('section[aria-label="Decide"]');
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

    const retried = (r: Response) => r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/steps/${back}/retry`);
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
      page.locator(`section[aria-label="Asks of you"] [data-ask="asked"][data-step="${back}"]`, { hasText: note }),
      `the asks of you say what wf ls says of ${back}'s try asked`,
    );
    await expectVisible(
      (await openFold(worked, 'detail')).locator('[data-note]', { hasText: note }),
      `and ${back}'s part says it too, in its Detail`,
    );
    await expectCount(
      page.locator('section[aria-label="Asks of you"] li[data-ask="decide"]'),
      0,
      'and there is nothing to decide while the work is asked for again',
    );
    await expectCount(gate, 0, 'and the gate holds nothing: it holds on the work, and the work was sent back');
    await expectVisible(
      detail.locator('dd', { hasText: /^holds once the work has handed on, and your approval files it$/ }),
      `${ending}'s facts say its gate holds once the work has handed on, never once ${ending}, which its approval files, has signed off`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `decide-sent-back-${await themeOf(page)}.png`), { fullPage: true });

    fs.rmSync(asks, { recursive: true, force: true });
    fed(id, ending, 'awaiting approval');
    await expectVisible(decision, 'with the send-back taken back, the gate holds again once the run is read again');
    await expectVisible(gate, `and ${ending} waits at it`);
    await expectVisible(
      acts.locator('[data-standing="ahead"]', { hasText: ENDING.standing }),
      'and the panel says where the branch stands again, read again before the photograph',
    );
    await settled(page);
  },
} satisfies PageSpec;
