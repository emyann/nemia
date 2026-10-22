import path from 'node:path';
import { photograph, sidebar, stepBar, themeOf } from '../board.ts';
import { OUT } from '../world.ts';
import { expectCount, expectDrawn, expectInside, expectUncut, expectVisible, Refused, settled } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * The run page of the seeded run: its header and step graph, the gate that asks and the check that refused, the calls its harness
   * denied, the Decide section read out of the run's real repository, what each session used and the mode it runs in, the timeline off
   * the engine's attempts and the filings on its feed, and the step inspector's Details, Activity and Output tabs. It ends with tokens'
   * Output open for the photograph, its image served as a PNG never cached and opened full-size in a tab of its own.
   *
   * The revisions band is photographed where it is read, before any sheet is open: the step sheet the page ends on covers the right third
   * of the page, so the whole-page picture shows neither the band's last tag nor its step-level line.
   */
  name: 'run',
  route: `/runs/${FAKE.id}`,
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      page.locator(`article header a[href="/workflows"][data-workflow="${FAKE.workflow}"]`),
      `the run's header names its workflow (${FAKE.workflow}), a folder the board pages on no address, linked to the Workflows page`,
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
      graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"]`).getByText('waiting on you'),
      `${FAKE.blocked} is drawn as a human gate`,
    );
    await expectVisible(
      graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"] [data-need="asks"]`, { hasText: `asks: ${SESSION.closeout.needs}` }),
      `${FAKE.blocked}'s node says what it asks (${SESSION.closeout.needs})`,
    );
    await expectVisible(
      page.locator(`section[aria-label="Waiting on you"] [data-need="asks"][data-step="${FAKE.blocked}"]`, {
        hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}`,
      }),
      `the banner says what ${FAKE.blocked} asks`,
    );
    await expectVisible(
      graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-state="failed-check"]`),
      `${FAKE.refused}'s refused check is a red chip on the run's graph`,
    );
    await expectVisible(
      page.locator('section[aria-label="Check"]').getByText(FAKE.said),
      `the run's page shows how ${FAKE.refused}'s check's output ended`,
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
      page.locator(`#step-${FAKE.refused} [data-fact="denied"] [data-denied]`, { hasText: calls }),
      `${FAKE.refused}'s section names each call denied (${calls})`,
    );
    await expectCount(page.locator('[data-fact="denied"]'), 1, 'and no other section has a denied row');

    await expectVisible(
      page.locator(`article > header + section[aria-label="Decide"] + section[aria-label="The run's steps as a graph"]`),
      'the Decide section, what wf decide shows, sits between the header and the canvas',
    );
    const decide = page.locator('section[aria-label="Decide"]');
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
      decide.locator('[data-command="ship it"] code', { hasText: `merge --no-ff ${FAKE.branch}` }),
      'ship it: the merge, as a line',
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
    const answers = decide.locator('section[aria-label="Answer"]');
    const answer = answers.locator(`[data-offer="answer"][data-step="${FAKE.blocked}"]`);
    await expectVisible(
      answer.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` }),
      `an answer box for ${FAKE.blocked}, which asks`,
    );
    await expectVisible(answer.getByRole('button', { name: 'Answer and continue' }), 'and its button');
    await expectVisible(answer.getByRole('radio', { name: /^a new session/ }), 'a new session as an option to the nudge');
    const again = answers.locator(`[data-offer="try-again"][data-step="${FAKE.refused}"]`);
    await expectVisible(again.getByRole('button', { name: 'Try again' }), `Try again for ${FAKE.refused}, whose check refused`);
    await expectVisible(again.getByRole('radio', { name: /^its check again/ }), 'its check run again as an option');
    await expectCount(
      decide.locator('button:not([data-copy])'),
      await answers.locator('button').count(),
      "every other button in the Decide section is an answer's",
    );

    const tokens = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.unverified, exact: true }) });
    await expectVisible(
      tokens.locator('dd', { hasText: FAKE.used }),
      `${FAKE.unverified}'s section says what its session used in wf decide's words (${FAKE.used})`,
    );
    await expectVisible(
      tokens.locator('[data-mark="default"]', { hasText: 'workspace-write · default' }),
      `${FAKE.unverified}'s spec says the sandbox its Codex session runs in, filed with none: its harness's choice, marked default (workspace-write · default)`,
    );
    const review = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: 'review', exact: true }) });
    await expectVisible(
      review.locator('[data-fact="sandbox"] dd', { hasText: /^read-only$/ }),
      "review's spec says its sandbox under Codex's name, read-only, read off a record that says permissionMode: read-only",
    );
    await expectCount(review.locator('[data-fact="permission mode"]'), 0, 'and no permission mode, which codex has not');
    const blocked = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.blocked, exact: true }) });
    await expectVisible(
      blocked.locator('[data-mark="default"]', { hasText: 'auto · default' }),
      `${FAKE.blocked}'s spec says the mode its Claude Code session runs in (auto · default)`,
    );

    const timeline = page.locator('section[aria-label="Timeline"]');
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
      timeline.locator('tr[data-step="review"][data-at="unknown"]', { hasText: `the engine has no record of ${FAKE.id}-review` }),
      'review, whose task the engine lost, is said, not timed',
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
    await expectVisible(
      inspected.getByRole('tab', { name: 'Output', selected: true }),
      `${FAKE.unverified}'s inspector opens on Output: it has signed off`,
    );
    await inspected.getByRole('tab', { name: 'Details' }).click();
    await expectVisible(inspected.locator('dd', { hasText: FAKE.used }), `the inspector's Details say what ${FAKE.unverified} used`);
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
    await inspector.getByRole('tab', { name: 'Activity' }).click();

    await expectVisible(
      inspector.locator('[data-session-turn="folded"]', { hasText: SESSION.folded }),
      `${SESSION.step}'s Activity tab draws its conversation by the family, the calls folded into one line (${SESSION.folded})`,
    );
    await expectVisible(
      inspector.locator('[data-session-talk].gap-2'),
      `${SESSION.step}'s Activity tab draws the talk compact, closer than the session's own page`,
    );
    await expectVisible(inspector.locator('[data-session-closeout]'), `${SESSION.step}'s Activity tab ends with its closeout`);
    await expectVisible(
      inspector.locator(`a[href="/runs/${FAKE.id}/steps/${SESSION.step}"]`, { hasText: 'Open the session' }),
      `${SESSION.step}'s Activity tab links to its session's page`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `run-activity-${await themeOf(page)}.png`), { fullPage: true });

    await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
    const output = stepBar(page, FAKE.id, FAKE.unverified);
    await output.getByRole('tab', { name: 'Output' }).click();
    const palette = output.locator(`img[alt="${FAKE.artifacts.image}"]`);
    await expectDrawn(palette, `${FAKE.unverified}'s Output tab draws the image it named inline (${FAKE.artifacts.image})`);
    const full = output.locator('a[target="_blank"]', { has: page.locator(`img[alt="${FAKE.artifacts.image}"]`) });
    await expectCount(full, 1, `${FAKE.artifacts.image} is inside a link that opens it in a new tab`);
    await expectVisible(
      output.locator('a[target="_blank"]', { hasText: FAKE.artifacts.text }),
      `the text file it named is a link (${FAKE.artifacts.text})`,
    );
    await expectVisible(
      output.getByText(FAKE.artifacts.path, { exact: true }),
      `a path on its branch is shown as it gave it (${FAKE.artifacts.path})`,
    );
    await expectDrawn(
      page.locator(`article > section [aria-label="Artifacts"] img[alt="${FAKE.artifacts.image}"]`),
      `${FAKE.unverified}'s section on the run's page draws the image too`,
    );
    await expectVisible(
      page.locator(`article > section [data-value="${FAKE.envelope.value.name}"] a[href="${FAKE.envelope.value.value}"]`, {
        hasText: FAKE.envelope.value.value,
      }),
      `${FAKE.unverified}'s section on the run's page draws the value it handed on, linked, beside its files`,
    );
    await expectVisible(
      output.locator('[data-body]', { hasText: FAKE.envelope.summary }),
      `${FAKE.unverified}'s whole v1 summary leads its body, so nothing it wrote is lost`,
    );
    await expectCount(
      output.locator('[data-summary]'),
      0,
      `and its cut line (${FAKE.envelope.cut}) is not drawn above the body that opens with it`,
    );
    await expectVisible(output.locator('[data-body] strong', { hasText: 'sky' }), 'its body is drawn as markdown');
    await expectVisible(
      output.locator(`[data-value="${FAKE.envelope.value.name}"] a[href="${FAKE.envelope.value.value}"][target="_blank"]`, {
        hasText: FAKE.envelope.value.value,
      }),
      `the value it handed on is labelled ${FAKE.envelope.value.name} and links to its address`,
    );
    await photograph(output, path.join(OUT, `run-envelope-${await themeOf(page)}.png`));
    const served = await page.request.get(new URL((await full.getAttribute('href')) ?? '', page.url()).href);
    const headers = served.headers();
    if (served.status() !== 200 || headers['content-type'] !== 'image/png' || headers['cache-control'] !== 'no-store') {
      throw new Refused(
        `the api serves ${FAKE.artifacts.image}, through the proxy the page reads it by, as a PNG, never cached — it answered ${served.status()}, ${headers['content-type']}, cache-control ${headers['cache-control']}`,
      );
    }
    const [tab] = await Promise.all([page.context().waitForEvent('page'), full.click()]);
    try {
      await tab.waitForLoadState();
      await expectDrawn(
        tab.locator('img'),
        `${FAKE.artifacts.image} opens full-size in a tab of its own, drawn under the api's sandboxing policy`,
      );
    } finally {
      await tab.close();
    }
    await settled(page);

    await output.getByRole('button', { name: 'Close', exact: true }).click();
    await expectCount(output, 0, "tokens' bar closes, and uncovers theme");
    await graph.locator('.react-flow__node[data-id="theme"]').click();
    const theme = stepBar(page, FAKE.id, 'theme');
    await theme.getByRole('tab', { name: 'Output' }).click();
    await expectVisible(
      theme.locator('[data-body]', { hasText: FAKE.envelope.v0.more }),
      "theme's v0 closeout reads its whole text as its body",
    );
    await expectVisible(theme.locator('[data-body]', { hasText: FAKE.envelope.v0.first }), 'which opens with its first line, its summary');
    await expectCount(theme.locator('[data-summary]'), 0, 'so the summary is said once, in the body, not again above it');
    await settled(page);
  },
} satisfies PageSpec;
