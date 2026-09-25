import { sidebar } from '../board.ts';
import { expectCount, expectDrawn, expectInside, expectUncut, expectVisible, Refused, settled } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  name: 'run',
  route: `/runs/${FAKE.id}`,
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      page.locator(`article header a[href="/workflows"][data-workflow="${FAKE.workflow}"]`),
      `the run's header names its workflow (${FAKE.workflow}), linked to the Workflows page`,
    );
    await expectCount(page.locator('[data-from]'), 0, 'a run started with no card says it came from none');
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    await expectCount(graph.locator('.react-flow__node'), FAKE.steps.length, `the run's graph has a node per step (${FAKE.steps.join(', ')})`);
    for (const step of FAKE.steps) await expectVisible(graph.locator(`.react-flow__node[data-id="${step}"]`), `the graph has ${step}`);
    await expectVisible(graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"]`).getByText('waiting on you'), `${FAKE.blocked} is drawn as a human gate`);
    // What it waits for, as its closeout gave it: on its node, and in the banner at the top of the page.
    await expectVisible(
      graph.locator(`.react-flow__node[data-id="${FAKE.blocked}"] [data-need="asks"]`, { hasText: `asks: ${SESSION.closeout.needs}` }),
      `${FAKE.blocked}'s node says what it asks (${SESSION.closeout.needs})`,
    );
    await expectVisible(
      page.locator(`section[aria-label="Waiting on you"] [data-need="asks"][data-step="${FAKE.blocked}"]`, { hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}` }),
      `the banner says what ${FAKE.blocked} asks`,
    );
    await expectVisible(graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-state="failed-check"]`), `${FAKE.refused}'s refused check is a red chip on the run's graph`);
    await expectVisible(page.locator('section[aria-label="Check"]').getByText(FAKE.said), `the run's page shows how ${FAKE.refused}'s check's output ended`);
    await expectCount(graph.locator('.react-flow__edge animateMotion'), 0, `no dot travels the run's edges: nothing moves into ${FAKE.refused}, whose check refused`);
    // What the harness denied its job: how many on its node, read whole, with which on hover, and each call on its section.
    const denied = graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-denied][title="${FAKE.denied.words}"]`, { hasText: FAKE.denied.node });
    await expectVisible(denied, `${FAKE.refused}'s node says its job was ${FAKE.denied.node}, and which on hover`);
    await expectUncut(denied, 'and says it whole: the line is the node\'s width');
    await expectCount(graph.locator('[data-denied]'), 1, `no other step was denied a call, and no other node says so`);
    const calls = FAKE.denied.denials.map((d) => `${d.tool}(${d.what})`).join(', ');
    await expectVisible(page.locator(`#step-${FAKE.refused} [data-fact="denied"] [data-denied]`, { hasText: calls }), `${FAKE.refused}'s section names each call denied (${calls})`);
    await expectCount(page.locator('[data-fact="denied"]'), 1, 'and no other section has a denied row');

    // What `wf decide` shows, between the banner and the canvas, read out of the run's real repository.
    await expectVisible(
      page.locator(`article > header + section[aria-label="Decide"] + section[aria-label="The run's steps as a graph"]`),
      'the Decide section sits between the header and the canvas',
    );
    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(decide.locator(`[data-touched="${FAKE.branch}"]`), `the Decide section reads the run's result branch (${FAKE.branch})`);
    for (const group of ['(root)', 'apps/web']) {
      await expectVisible(decide.locator(`[data-group="${group}"] [data-bar]`), `a row for ${group}, with its +/− bar`);
    }
    for (const file of FAKE.agentFacing) {
      await expectVisible(decide.locator('[data-chip="agent-facing"][title="the next agent reads this"]', { hasText: file }), `${file} is an agent-facing chip`);
    }
    for (const file of FAKE.checkAffecting) {
      await expectVisible(decide.locator('[data-chip="check-affecting"][title="could make its check pass"]', { hasText: file }), `${file} is a check-affecting chip`);
    }
    await expectVisible(decide.locator('[data-lesson="written"]', { hasText: FAKE.lesson }), `the lesson chip says what the run wrote (${FAKE.lesson})`);
    // Each check-affecting file folded, until a person opens it: then a coloured diff, cut where the api cut it.
    await expectCount(decide.locator('details[open]'), 0, 'every check-affecting diff is folded until opened');
    const capped = decide.locator(`details[data-diff="${FAKE.capped}"]`);
    await capped.locator('summary').click();
    await expectVisible(capped.locator('[data-line="hunk"]'), `${FAKE.capped}'s diff opens on a click, a hunk's header in it`);
    await expectVisible(capped.locator('[data-line="added"]'), `${FAKE.capped}'s diff shows its added lines`);
    await expectVisible(capped.locator('[data-cut]', { hasText: /^\d+ more lines — wf decide prints all$/ }), `${FAKE.capped}'s diff is capped, and says so`);
    const manifest = decide.locator('details[data-diff="package.json"]');
    await manifest.locator('summary').click();
    await expectVisible(manifest.locator('[data-line="removed"]'), "package.json's diff shows the line it removed");
    await expectCount(manifest.locator('[data-cut]'), 0, "package.json's diff is shown whole");
    await expectVisible(decide.locator('section[aria-label="Used"] dd', { hasText: 'not measured' }), 'the run total says not measured, since not every step was');
    // The commands as lines to copy, and nothing that runs one.
    await expectVisible(decide.locator('[data-command="ship it"] code', { hasText: `merge --no-ff ${FAKE.branch}` }), 'ship it: the merge, as a line');
    await expectVisible(decide.locator('[data-command="drop it"] code', { hasText: `branch -D ${FAKE.branch}` }), 'drop it: the branch deleted, as a line');
    await expectVisible(decide.locator('[data-command="once more"] code', { hasText: `wf retry ${FAKE.id} ${FAKE.refused}` }), `once more: ${FAKE.refused} tried again, as a line`);
    await expectCount(decide.locator('button[data-copy]'), await decide.locator('[data-command]').count(), 'a copy button beside each command');
    await expectCount(decide.locator('section[aria-label="Commands"] button:not([data-copy])'), 0, 'no button among the commands but one that copies');
    // Before them, the answers: a box for the step that asks, and Try again for the step whose check refused, its check again an option.
    const answers = decide.locator('section[aria-label="Answer"]');
    const answer = answers.locator(`[data-offer="answer"][data-step="${FAKE.blocked}"]`);
    await expectVisible(answer.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` }), `an answer box for ${FAKE.blocked}, which asks`);
    await expectVisible(answer.getByRole('button', { name: 'Answer and continue' }), 'and its button');
    await expectVisible(answer.getByRole('radio', { name: /^a new session/ }), 'a new session as an option to the nudge');
    const again = answers.locator(`[data-offer="try-again"][data-step="${FAKE.refused}"]`);
    await expectVisible(again.getByRole('button', { name: 'Try again' }), `Try again for ${FAKE.refused}, whose check refused`);
    await expectVisible(again.getByRole('radio', { name: /^its check again/ }), 'its check run again as an option');
    await expectCount(decide.locator('button:not([data-copy])'), await answers.locator('button').count(), "every other button in the Decide section is an answer's");

    // What a step consumed, in its section and in the inspector's Details, in `wf decide`'s words.
    const tokens = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.unverified, exact: true }) });
    await expectVisible(tokens.locator('dd', { hasText: FAKE.used }), `${FAKE.unverified}'s section says what its session used (${FAKE.used})`);
    // The mode each session runs in, filed with none: its harness's choice, marked default — never "the harness's own".
    await expectVisible(
      tokens.locator('[data-mark="default"]', { hasText: 'workspace-write · default' }),
      `${FAKE.unverified}'s spec says the sandbox its Codex session runs in (workspace-write · default)`,
    );
    // A codex step's fence under Codex's name, read off a record frozen when it was written `permissionMode: read-only`.
    const review = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: 'review', exact: true }) });
    await expectVisible(review.locator('[data-fact="sandbox"] dd', { hasText: /^read-only$/ }), "review's spec says its sandbox, read-only, from a record frozen before the key was named so");
    await expectCount(review.locator('[data-fact="permission mode"]'), 0, 'and no permission mode, which codex has not');
    const blocked = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.blocked, exact: true }) });
    await expectVisible(blocked.locator('[data-mark="default"]', { hasText: 'auto · default' }), `${FAKE.blocked}'s spec says the mode its Claude Code session runs in (auto · default)`);

    // Where the run's time went: a row per try's session and per check, each queued filed → spawned and ran spawned → ended, off the
    // engine's attempts and the filings on its feed.
    const timeline = page.locator('section[aria-label="Timeline"]');
    const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    for (const [step, [queued, ran]] of Object.entries(FAKE.timeline.sessions)) {
      const row = timeline.locator(`tr[data-step="${step}"][data-task="session"][data-at="ended"]`);
      await expectVisible(row.locator('[data-cell="queued"]', { hasText: exactly(queued) }), `the timeline says ${step} queued ${queued} for a slot`);
      await expectVisible(row.locator('[data-cell="ran"]', { hasText: exactly(ran) }), `the timeline says ${step} ran ${ran}`);
    }
    const [checkQueued, checkRan] = FAKE.timeline.check;
    const checkRow = timeline.locator(`tr[data-step="${FAKE.refused}"][data-task="check"][data-at="ended"]`);
    await expectVisible(checkRow.locator('[data-cell="queued"]', { hasText: exactly(checkQueued) }), `${FAKE.refused}'s check queued ${checkQueued}`);
    await expectVisible(checkRow.locator('[data-cell="ran"]', { hasText: exactly(checkRan) }), `${FAKE.refused}'s check ran ${checkRan}`);
    await expectVisible(timeline.locator(`tr[data-step="${FAKE.unverified}"] [data-cell="used"]`, { hasText: FAKE.used }), `what ${FAKE.unverified}'s session used, beside its times`);
    await expectVisible(timeline.locator('tr[data-step="review"][data-at="unknown"]', { hasText: `the engine has no record of ${FAKE.id}-review` }), 'review, whose task the engine lost, is said, not timed');
    await expectCount(timeline.locator('tr[data-step="respond"]'), 0, 'respond, not filed, has no row');
    const total = timeline.locator('tr[data-total="run"]');
    for (const cell of ['queued', 'ran'] as const) {
      await expectVisible(total.locator(`[data-cell="${cell}"]`, { hasText: exactly(FAKE.timeline.run[cell]) }), `the run's total ${cell} is ${FAKE.timeline.run[cell]}`);
    }
    await expectVisible(total.locator('[data-cell="wall"]', { hasText: `wall ${FAKE.timeline.run.wall}` }), `the run's wall is ${FAKE.timeline.run.wall}: a task it cannot time`);
    await expectCount(timeline.locator('tr[data-total^="round-"]'), 0, "one round: the run's total alone");
    await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
    const inspected = page.locator(`aside[aria-label="Step ${FAKE.unverified}"]`);
    await expectVisible(inspected.locator('dd', { hasText: FAKE.used }), `the inspector's Details say what ${FAKE.unverified} used`);

    await graph.locator('.react-flow__node[data-id="review"]').click();
    await expectVisible(page.locator('aside[aria-label="Step review"]'), 'the step inspector opens on a click on review');
    // The canvas narrows for the inspector and fits itself again; judged once it has.
    await settled(page);
    await expectInside(graph.locator('.react-flow__node'), graph.locator('.react-flow'), 'every step is on the canvas beside the open inspector');

    // implement's Activity: the tail of its session's conversation, folded as its page folds it, and the way to that page.
    await graph.locator(`.react-flow__node[data-id="${SESSION.step}"]`).click();
    const inspector = page.locator(`aside[aria-label="Step ${SESSION.step}"]`);
    await inspector.getByRole('tab', { name: 'Activity' }).click();
    await expectVisible(inspector.locator('[data-turn="tools"]', { hasText: SESSION.folded }), `${SESSION.step}'s Activity tab draws its conversation, the calls folded into one line (${SESSION.folded})`);
    await expectVisible(inspector.locator('section[aria-label="Closeout"]'), `${SESSION.step}'s Activity tab ends with its closeout`);
    await expectVisible(inspector.locator(`a[href="/runs/${FAKE.id}/steps/${SESSION.step}"]`, { hasText: 'Open the session' }), `${SESSION.step}'s Activity tab links to its session's page`);
    await settled(page);

    // tokens' Output: the image it named drawn inline, opening full-size in a new tab; its text file a link; a path on its
    // branch as it gave it. Left open for the photograph.
    await graph.locator(`.react-flow__node[data-id="${FAKE.unverified}"]`).click();
    const output = page.locator(`aside[aria-label="Step ${FAKE.unverified}"]`);
    await output.getByRole('tab', { name: 'Output' }).click();
    const palette = output.locator(`img[alt="${FAKE.artifacts.image}"]`);
    await expectDrawn(palette, `${FAKE.unverified}'s Output tab draws the image it named inline (${FAKE.artifacts.image})`);
    // `has` is queried inside each link, so from the page: `palette` starts at the inspector, which no link is around.
    const full = output.locator('a[target="_blank"]', { has: page.locator(`img[alt="${FAKE.artifacts.image}"]`) });
    await expectCount(full, 1, `${FAKE.artifacts.image} is inside a link that opens it in a new tab`);
    await expectVisible(output.locator('a[target="_blank"]', { hasText: FAKE.artifacts.text }), `the text file it named is a link (${FAKE.artifacts.text})`);
    await expectVisible(output.getByText(FAKE.artifacts.path, { exact: true }), `a path on its branch is shown as it gave it (${FAKE.artifacts.path})`);
    await expectDrawn(
      page.locator(`article > section [aria-label="Artifacts"] img[alt="${FAKE.artifacts.image}"]`),
      `${FAKE.unverified}'s section on the run's page draws the image too`,
    );
    // As the api serves it, through the proxy the page reads it by: a PNG, never cached.
    const served = await page.request.get(new URL((await full.getAttribute('href')) ?? '', page.url()).href);
    const headers = served.headers();
    if (served.status() !== 200 || headers['content-type'] !== 'image/png' || headers['cache-control'] !== 'no-store') {
      throw new Refused(`the api serves ${FAKE.artifacts.image} as a PNG, never cached — it answered ${served.status()}, ${headers['content-type']}, cache-control ${headers['cache-control']}`);
    }
    // Opened full-size: a tab of its own, which draws it under the api's sandboxing policy.
    const [tab] = await Promise.all([page.context().waitForEvent('page'), full.click()]);
    try {
      await tab.waitForLoadState();
      await expectDrawn(tab.locator('img'), `${FAKE.artifacts.image} opens full-size in a tab of its own`);
    } finally {
      await tab.close();
    }
    await settled(page);
  },
} satisfies PageSpec;
