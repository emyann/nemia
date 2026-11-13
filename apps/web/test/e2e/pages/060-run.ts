import path from 'node:path';
import { openFold, partOf, photograph, sidebar, stepBar, themeOf } from '../board.ts';
import { OUT } from '../world.ts';
import { expectCount, expectDrawn, expectInside, expectUncut, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * The run page of the seeded run: its asks and header, its step graph, the gate that asks and the check that refused, the calls its
   * harness denied, the Decide section read out of the run's real repository (folded under the asks), each step's answer in its own
   * part, what each session used and the mode it runs in (a part's Detail), the timeline off the engine's attempts and the filing each
   * task's view carries (a receipt), and the step bar's one scroll: the part whole, then its conversation. It ends with tokens' part in
   * the bar for the photograph, its picture a thumbnail served as a PNG never cached, opened in the viewer's sheet.
   *
   * The revisions band is photographed where it is read, before any sheet is open: the step sheet the page ends on covers the right third
   * of the page, so the whole-page picture shows neither the band's last tag nor its step-level line.
   */
  name: 'run',
  route: `/runs/${FAKE.id}`,
  expect: async (page) => {
    await sidebar(page);
    const where = await openFold(page.locator('section[aria-label="Receipts"]'), 'where');
    await expectVisible(
      where.locator(`a[href="/workflows"][data-workflow="${FAKE.workflow}"]`),
      `the run's receipt of where it ran names its workflow (${FAKE.workflow}), a folder the board pages on no address, linked to the Workflows page`,
    );
    await expectCount(page.locator('[data-from]'), 0, 'a run started with no card says it came from none');
    const behind = page.locator('section[aria-label="The revisions this run is behind on"]');
    await expectCount(
      behind.locator('[data-kind-behind]'),
      FAKE.behind.kinds,
      `the run says the drift of every kind it resolved (${FAKE.behind.kinds})`,
    );
    for (const words of [FAKE.behind.agent, FAKE.behind.skill, FAKE.behind.ran])
      await expectVisible(behind.locator('[data-kind-behind]', { hasText: words }), `the drift reads ${words}`);
    await expectVisible(behind.getByText(`nemia refresh ${FAKE.id}`), 'it says the verb that takes the new revisions');
    await photograph(behind, path.join(OUT, `run-kinds-${await themeOf(page)}.png`));
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    await expectCount(
      graph.locator('.react-flow__node'),
      FAKE.steps.length,
      `the run's graph has a node per step (${FAKE.steps.join(', ')})`,
    );
    for (const step of FAKE.steps) await expectVisible(graph.locator(`.react-flow__node[data-id="${step}"]`), `the graph has ${step}`);
    await expectVisible(
      graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"] [data-gate-band]`, { hasText: 'waits on you' }),
      `${FAKE.blocked} is drawn as a human gate`,
    );
    await expectVisible(
      graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"] [data-need="asks"]`, { hasText: `asks: ${SESSION.closeout.needs}` }),
      `${FAKE.blocked}'s node says what it asks (${SESSION.closeout.needs})`,
    );
    await expectVisible(
      page.locator(`section[aria-label="Asks of you"] [data-ask="needs"][data-step="${FAKE.blocked}"]`, {
        hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}`,
      }),
      `the asks of you say what ${FAKE.blocked} asks`,
    );
    await expectVisible(
      graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-state="failed-check"]`),
      `${FAKE.refused}'s refused check is a red chip on the run's graph`,
    );
    const refusedDetail = await openFold(partOf(page, FAKE.refused), 'detail');
    await expectVisible(
      refusedDetail.locator('section[aria-label="Check"]').getByText(FAKE.said),
      `the run's page shows how ${FAKE.refused}'s check's output ended, in its part's Detail`,
    );
    await expectCount(
      graph.locator('.react-flow__edge animateMotion'),
      0,
      `no dot travels the run's edges: nothing moves into ${FAKE.refused}, whose check refused`,
    );
    const denied = graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-denied][title="${FAKE.denied.words}"]`, {
      hasText: FAKE.denied.node,
    });
    await expectVisible(denied, `${FAKE.refused}'s node says its job was ${FAKE.denied.node}, and which on hover`);
    await expectUncut(denied, "and says it whole: the line is the node's width");
    await expectCount(graph.locator('[data-denied]'), 1, `no other step was denied a call, and no other node says so`);
    const calls = FAKE.denied.denials.map((d) => `${d.tool}(${d.what})`).join(', ');
    await expectVisible(
      refusedDetail.locator(`[data-fact="denied"] [data-denied]`, { hasText: calls }),
      `${FAKE.refused}'s part names each call denied (${calls}), in its Detail`,
    );
    for (const step of FAKE.steps) await openFold(partOf(page, step), 'detail');
    await expectCount(page.locator('[data-fact="denied"]'), 1, "and no other step's Detail has a denied row");

    const asks = page.locator('[data-asks]');
    const decide = (await openFold(asks, 'decide')).locator('section[aria-label="Decide"]');
    await expectVisible(decide, 'the Decide section, what wf decide shows, is a fold under the asks of you');
    const order = await page.evaluate(() => {
      const at = (selector: string) => document.querySelector(selector);
      const marks = ['[data-asks]', 'header[data-run-header]', `section[aria-label="The run's steps as a graph"]`].map(at);
      return marks.every((m, i) => m && (i === 0 || marks[i - 1]!.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    if (!order)
      throw new Refused('the asks of you, with Decide folded under them, come before the header, and the header before the canvas');
    await expectVisible(
      decide.locator(`[data-touched="${FAKE.branch}"]`),
      `the Decide section reads the run's result branch (${FAKE.branch})`,
    );
    for (const group of ['(root)', 'apps/web']) {
      await expectVisible(decide.locator(`[data-group="${group}"] [data-bar]`), `a row for ${group}, with its +/− bar`);
    }
    for (const file of FAKE.agentFacing) {
      await expectVisible(
        decide.locator('[data-chip="agent-facing"][title="the next agent reads this"]', { hasText: file }),
        `${file} is an agent-facing chip`,
      );
    }
    for (const file of FAKE.checkAffecting) {
      await expectVisible(
        decide.locator('[data-chip="check-affecting"][title="could make its check pass"]', { hasText: file }),
        `${file} is a check-affecting chip`,
      );
    }
    await expectVisible(
      decide.locator('[data-lesson="written"]', { hasText: FAKE.lesson }),
      `the lesson chip says what the run wrote (${FAKE.lesson})`,
    );
    await expectCount(decide.locator('details[open]'), 0, 'every check-affecting diff is folded until opened');
    const capped = decide.locator(`details[data-diff="${FAKE.capped}"]`);
    await capped.locator('summary').click();
    await expectVisible(capped.locator('[data-line="hunk"]'), `${FAKE.capped}'s diff opens on a click, a hunk's header in it`);
    await expectVisible(capped.locator('[data-line="added"]'), `${FAKE.capped}'s diff shows its added lines`);
    await expectVisible(
      capped.locator('[data-cut]', { hasText: /^\d+ more lines — the command line's decide prints them all$/ }),
      `${FAKE.capped}'s diff is capped, and says so`,
    );
    const manifest = decide.locator('details[data-diff="package.json"]');
    await manifest.locator('summary').click();
    await expectVisible(manifest.locator('[data-line="removed"]'), "package.json's diff shows the line it removed");
    await expectCount(manifest.locator('[data-cut]'), 0, "package.json's diff is shown whole");
    await expectVisible(
      decide.locator('section[aria-label="Used"] dd', { hasText: 'not measured' }),
      'the run total says not measured, since not every step was',
    );
    await expectVisible(
      decide.locator('[data-command="land it"] code', { hasText: `merge --no-ff ${FAKE.branch}` }),
      'land it: the merge, as a line',
    );
    await expectVisible(
      decide.locator('[data-command="drop it"] code', { hasText: `branch -D ${FAKE.branch}` }),
      'drop it: the branch deleted, as a line',
    );
    await expectVisible(
      decide.locator('[data-command="once more"] code', { hasText: `nemia retry ${FAKE.id} ${FAKE.refused}` }),
      `once more: ${FAKE.refused} tried again, as a line`,
    );
    await expectCount(
      decide.locator('button[data-copy]'),
      await decide.locator('[data-command]').count(),
      'a copy button beside each command',
    );
    await expectCount(
      decide.locator('section[aria-label="Commands"] button:not([data-copy])'),
      0,
      'no button among the commands but one that copies',
    );
    const answer = partOf(page, FAKE.blocked).locator(`[data-part-asks] [data-offer="answer"][data-step="${FAKE.blocked}"]`);
    await expectVisible(
      answer.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` }),
      `an answer box for ${FAKE.blocked}, which asks, in what its part asks of you`,
    );
    await expectVisible(answer.getByRole('button', { name: 'Answer and continue' }), 'and its button');
    await expectVisible(answer.getByRole('radio', { name: /^a new session/ }), 'a new session as an option to the nudge');
    const again = partOf(page, FAKE.refused).locator(`[data-part-asks] [data-offer="try-again"][data-step="${FAKE.refused}"]`);
    await expectVisible(
      again.getByRole('button', { name: 'Try again' }),
      `Try again for ${FAKE.refused}, whose check refused, in its part`,
    );
    await expectVisible(again.getByRole('radio', { name: /^its check again/ }), 'its check run again as an option');
    await expectCount(decide.locator('[data-offer]'), 0, "the Decide section holds no answer: each is in its step's part");

    const tokens = partOf(page, FAKE.unverified);
    await openFold(tokens.locator('[data-part-detail]'), 'spec');
    await expectVisible(
      tokens.locator('dd', { hasText: FAKE.used }),
      `${FAKE.unverified}'s part's Detail says what its session used in wf decide's words (${FAKE.used})`,
    );
    await expectVisible(
      tokens.locator('[data-mark="default"]', { hasText: 'workspace-write · default' }),
      `${FAKE.unverified}'s spec says the sandbox its Codex session runs in, filed with none: its harness's choice, marked default (workspace-write · default)`,
    );
    const review = partOf(page, 'review');
    await openFold(review.locator('[data-part-detail]'), 'spec');
    await expectVisible(
      review.locator('[data-fact="sandbox"] dd', { hasText: /^read-only$/ }),
      "review's spec says its sandbox under Codex's name, read-only, read off a record that says permissionMode: read-only",
    );
    await expectCount(review.locator('[data-fact="permission mode"]'), 0, 'and no permission mode, which codex has not');
    const blocked = partOf(page, FAKE.blocked);
    await openFold(blocked.locator('[data-part-detail]'), 'spec');
    await expectVisible(
      blocked.locator('[data-mark="default"]', { hasText: 'auto · default' }),
      `${FAKE.blocked}'s spec says the mode its Claude Code session runs in (auto · default)`,
    );

    const timeline = (await openFold(page.locator('section[aria-label="Receipts"]'), 'timeline')).locator('section[aria-label="Timeline"]');
    const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    for (const [step, [queued, ran]] of Object.entries(FAKE.timeline.sessions)) {
      const row = timeline.locator(`tr[data-step="${step}"][data-task="session"][data-at="ended"]`);
      await expectVisible(
        row.locator('[data-cell="queued"]', { hasText: exactly(queued) }),
        `the timeline says ${step} queued ${queued} for a slot, filed → spawned`,
      );
      await expectVisible(
        row.locator('[data-cell="ran"]', { hasText: exactly(ran) }),
        `the timeline says ${step} ran ${ran}, spawned → ended`,
      );
    }
    const [checkQueued, checkRan] = FAKE.timeline.check;
    const checkRow = timeline.locator(`tr[data-step="${FAKE.refused}"][data-task="check"][data-at="ended"]`);
    await expectVisible(
      checkRow.locator('[data-cell="queued"]', { hasText: exactly(checkQueued) }),
      `${FAKE.refused}'s check queued ${checkQueued}`,
    );
    await expectVisible(checkRow.locator('[data-cell="ran"]', { hasText: exactly(checkRan) }), `${FAKE.refused}'s check ran ${checkRan}`);
    await expectVisible(
      timeline.locator(`tr[data-step="${FAKE.unverified}"] [data-cell="used"]`, { hasText: FAKE.used }),
      `what ${FAKE.unverified}'s session used, beside its times`,
    );
    await expectVisible(
      timeline.locator('tr[data-step="review"][data-at="unknown"]', { hasText: `no record of ${FAKE.id}-review` }),
      'review, whose task has no record, is said, not timed',
    );
    await expectCount(timeline.locator('tr[data-step="respond"]'), 0, 'respond, not filed, has no row');
    const total = timeline.locator('tr[data-total="run"]');
    for (const cell of ['queued', 'ran'] as const) {
      await expectVisible(
        total.locator(`[data-cell="${cell}"]`, { hasText: exactly(FAKE.timeline.run[cell]) }),
        `the run's total ${cell} is ${FAKE.timeline.run[cell]}`,
      );
    }
    await expectVisible(
      total.locator('[data-cell="wall"]', { hasText: `wall ${FAKE.timeline.run.wall}` }),
      `the run's wall is ${FAKE.timeline.run.wall}: a task it cannot time`,
    );
    await expectCount(timeline.locator('tr[data-total^="round-"]'), 0, "one round: the run's total alone");
    await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
    const inspected = stepBar(page, FAKE.id, FAKE.unverified);
    await expectVisible(inspected.locator(`[data-part-gave="L"]`), `${FAKE.unverified}'s inspector draws what it gave: it has signed off`);
    await openFold(partOf(inspected, FAKE.unverified), 'detail');
    await expectVisible(inspected.locator('dd', { hasText: FAKE.used }), `the inspector's Detail says what ${FAKE.unverified} used`);
    await inspected.getByRole('button', { name: 'Close', exact: true }).click();
    await expectCount(inspected, 0, "the inspector's Close closes it, and uncovers the steps it floated over");

    await graph.locator('.react-flow__node[data-id="review"]').click();
    await expectVisible(stepBar(page, FAKE.id, 'review'), 'the step inspector opens on a click on review');
    await settled(page);
    await expectInside(
      graph.locator('.react-flow__node'),
      graph.locator('.react-flow'),
      'every step is on the canvas, the whole width of the page, under the bar that floats over it',
    );

    await graph.locator(`.react-flow__node[data-id="${SESSION.step}"]`).click();
    const inspector = stepBar(page, FAKE.id, SESSION.step);
    const talk = inspector.locator('section[aria-label="Its conversation"]');
    await expectVisible(partOf(inspector, SESSION.step).locator('[data-part-said]'), `${SESSION.step}'s bar draws its part whole first`);
    await expectCount(inspector.getByRole('tab'), 0, 'in one scroll, with no tabs');
    await expectVisible(
      talk.locator('[data-session-turn="folded"]', { hasText: SESSION.folded }),
      `${SESSION.step}'s conversation, under its part, is drawn by the family, the calls folded into one line (${SESSION.folded})`,
    );
    await expectVisible(
      talk.locator('[data-session-talk].gap-2'),
      `${SESSION.step}'s bar draws the talk compact, closer than the session's own page`,
    );
    await expectVisible(talk.locator('[data-session-closeout]'), `${SESSION.step}'s conversation ends with its closeout's line`);
    await expectVisible(
      talk.locator(`a[href="/runs/${FAKE.id}/steps/${SESSION.step}"]`, { hasText: 'Open the session' }),
      `${SESSION.step}'s conversation links to its session's page`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `run-activity-${await themeOf(page)}.png`), { fullPage: true });

    await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
    const output = stepBar(page, FAKE.id, FAKE.unverified);
    const gave = partOf(output, FAKE.unverified).locator('[data-part-gave="L"]');
    const palette = gave.locator(`img[alt="${FAKE.artifacts.image}"]`);
    await expectDrawn(palette, `${FAKE.unverified}'s part in the bar draws the image it named as a thumbnail (${FAKE.artifacts.image})`);
    const thumb = gave.locator('a[data-opens-view]', { has: page.locator(`img[alt="${FAKE.artifacts.image}"]`) });
    await expectCount(thumb, 1, `${FAKE.artifacts.image} is inside a link that opens it in the viewer's sheet`);
    await expectVisible(
      gave.locator('a[data-opens-view]', { hasText: FAKE.artifacts.text }),
      `the text file it named is a link to its viewer (${FAKE.artifacts.text})`,
    );
    await expectVisible(
      gave.getByText(FAKE.artifacts.path, { exact: true }),
      `a path on its branch is shown as it gave it (${FAKE.artifacts.path})`,
    );
    const row = partOf(page.locator('section[aria-label="Every step"]'), FAKE.unverified);
    await expectDrawn(
      row.locator(`[data-part-gave] img[alt="${FAKE.artifacts.image}"]`),
      `${FAKE.unverified}'s row of the ledger on the run's page draws the image too`,
    );
    await expectVisible(
      row.locator(`[data-value="${FAKE.envelope.value.name}"] a[href="${FAKE.envelope.value.value}"]`, {
        hasText: FAKE.envelope.value.value,
      }),
      `${FAKE.unverified}'s row on the run's page draws the value it handed on, linked, beside its files`,
    );
    const said = output.locator('[data-part-said]');
    await expectVisible(
      said.locator('[data-summary]', { hasText: FAKE.envelope.cut.replace(/…$/, '') }),
      `${FAKE.unverified}'s Said opens with its summary`,
    );
    await expectCount(said.locator('[data-body]'), 0, 'its account one fold down, closed');
    const account = await openFold(said, 'account');
    await expectVisible(
      account.locator('[data-body]', { hasText: FAKE.envelope.summary }),
      `${FAKE.unverified}'s whole v1 summary leads its account, so nothing it wrote is lost`,
    );
    await expectVisible(account.locator('[data-body] strong', { hasText: 'sky' }), 'its account is drawn as markdown');
    await expectVisible(
      gave.locator(`[data-value="${FAKE.envelope.value.name}"] a[href="${FAKE.envelope.value.value}"][target="_blank"]`, {
        hasText: FAKE.envelope.value.value,
      }),
      `the value it handed on is labelled ${FAKE.envelope.value.name} and links to its address`,
    );
    await photograph(output, path.join(OUT, `run-envelope-${await themeOf(page)}.png`));
    const src = new URL((await palette.getAttribute('src')) ?? '', page.url()).href;
    const served = await page.request.get(src);
    const headers = served.headers();
    if (served.status() !== 200 || headers['content-type'] !== 'image/png' || headers['cache-control'] !== 'no-store') {
      throw new Refused(
        `the api serves ${FAKE.artifacts.image}, through the proxy the page reads it by, as a PNG, never cached — it answered ${served.status()}, ${headers['content-type']}, cache-control ${headers['cache-control']}`,
      );
    }
    const tab = await page.context().newPage();
    try {
      await tab.goto(src);
      await expectDrawn(tab.locator('img'), `${FAKE.artifacts.image} opened alone is drawn under the api's sandboxing policy`);
    } finally {
      await tab.close();
    }
    const opens = await thumb.getAttribute('data-opens-view');
    await thumb.click();
    await page.waitForURL((url) => url.searchParams.get('view') === `${FAKE.unverified}/${opens}`, { timeout: WAIT_MS });
    await expectDrawn(
      page.locator(`[data-viewer-sheet] img[data-viewer="picture"][alt="${FAKE.artifacts.image}"]`),
      `a press on the thumbnail opens ${FAKE.artifacts.image} in the viewer's sheet, by the address`,
    );
    await page.goBack();
    await expectCount(page.locator('[data-viewer-sheet]'), 0, 'Back closes the sheet');
    await settled(page);

    await output.getByRole('button', { name: 'Close', exact: true }).click();
    await expectCount(output, 0, "tokens' bar closes, and uncovers theme");
    await graph.locator('.react-flow__node[data-id="theme"]').click();
    const theme = stepBar(page, FAKE.id, 'theme');
    const themeSaid = theme.locator('[data-part-said]');
    await expectVisible(
      themeSaid.locator('[data-summary]', { hasText: FAKE.envelope.v0.first }),
      "theme's v0 closeout says its first line as its summary",
    );
    const themeAccount = await openFold(themeSaid, 'account');
    await expectVisible(themeAccount.locator('[data-body]', { hasText: FAKE.envelope.v0.more }), 'and reads its whole text as its account');
    await expectVisible(themeAccount.locator('[data-body]', { hasText: FAKE.envelope.v0.first }), 'which opens with its first line');
    await settled(page);
  },
} satisfies PageSpec;
