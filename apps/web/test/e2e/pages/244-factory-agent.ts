import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { attachedFiles, attachedRun, lines, worked, write } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, dropStoredFactory, dropStoredRun, store, storeFactory, storeRecord } from '../world.ts';

/** The factory the page files, with its agent and its workflow in its own tree, on a repository that is not the checkout. */
const FACTORY = 'sentinel-works';
/** The agent only the factory's tree has, and the step of its workflow that names it. */
const AGENT = { name: 'sentinel', role: 'Gate keeper', body: 'You watch the gate.\nYou let nothing past it that was not checked.' };
/** The workflow of the tree, and its one step. */
const WORKFLOW = { name: 'watch', step: 'guard' };
/** The run of the factory whose step is at work by the agent. */
const RUN = { id: 'watch-the-gate-e2e44', title: 'Watch the gate', sessionId: '4b1d7e2c-5a90-4f3e-8c21-6d7a9e0b1f23' };

/**
 * Writes the factory's file and its tree, and a run of the workflow in it whose step is at work by the agent: the record, the journal of
 * its one task, spawned and never ended, and its session as an attached one at work. Answers what takes them back.
 */
function written() {
  const folder = path.join(store!, 'factories', FACTORY);
  const flow = path.join(folder, 'tree', 'workflows');
  const text = `---\nagent: ${AGENT.name}\nplace: folder\n---\nGuard the gate.\n`;
  write(path.join(folder, 'tree', 'factory.json'), `${JSON.stringify({ workflows: [WORKFLOW.name] }, null, 2)}\n`);
  write(path.join(flow, WORKFLOW.name, `${WORKFLOW.step}.md`), text);
  write(
    path.join(flow, 'agents', `${AGENT.name}.md`),
    `---\nrole: ${AGENT.role}\ndescription: Use this when a gate needs watching.\nharness: claude\nmodel: sonnet\n---\n${AGENT.body}\n`,
  );
  storeFactory(
    FACTORY,
    `${JSON.stringify({ volumes: worked([path.join(store!, 'elsewhere')]), template: { source: '/drafts/team', version: '0.1.0', params: {} } }, null, 2)}\n`,
  );
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const task = `${RUN.id}-${WORKFLOW.step}`;
  const work = path.join(store!, 'runs', RUN.id, 'work');
  storeRecord(
    RUN.id,
    JSON.stringify(
      {
        id: RUN.id,
        place: { kind: 'folder' },
        workspace: work,
        brief: `${RUN.title}\n\nA run written by a page of npm run e2e, which takes it back.`,
        workflowDir: path.join(flow, WORKFLOW.name),
        workflow: [
          {
            name: WORKFLOW.step,
            after: [],
            body: 'Guard the gate.',
            harness: 'claude',
            workspace: 'folder',
            permissionMode: 'dontAsk',
            agent: { name: AGENT.name, keys: [], body: AGENT.body, given: {} },
          },
        ],
        factory: FACTORY,
        createdAt: ago(4),
        steps: { [WORKFLOW.step]: { taskId: task, workspace: path.join(work, WORKFLOW.step) } },
      },
      null,
      2,
    ),
  );
  const journal = path.join(store!, 'engine', 'tasks', `${task}.jsonl`);
  write(
    journal,
    lines([
      {
        kind: 'filed',
        at: ago(3),
        brief: 'Guard the gate.',
        cwd: path.join(work, WORKFLOW.step),
        maxAttempts: 1,
        harness: 'claude',
        permissionMode: 'dontAsk',
      },
      { kind: 'starting', at: ago(2.9), attempt: 1 },
      { kind: 'spawned', at: ago(2.9), attempt: 1 },
    ]),
  );
  const session = `ae/${task}/1`;
  write(attachedFiles(store!, session).run, attachedRun(session, RUN.sessionId, 'working', ago(2.9)));
  return (() => {
    fs.rmSync(attachedFiles(store!, session).run, { force: true });
    fs.rmSync(journal, { force: true });
    dropStoredRun(RUN.id);
    fs.rmSync(path.join(store!, 'runs', RUN.id), { recursive: true, force: true });
    dropStoredFactory(FACTORY);
    fs.rmSync(folder, { recursive: true, force: true });
  }) satisfies () => void;
}

/** Opens `to` in this tab and waits for its reads. */
const goto = async (page: Page, to: string) => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** What the page says, in a line: where its body did not draw, the words it shows in its place. */
const drawn = async (page: Page) =>
  (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  )
    .replace(/\s+/g, ' ')
    .slice(0, 300);

export default {
  /**
   * A factory's own agent, read in its factory, is drawn read only: the frame's head names the agent as a person is named, its ring is lit
   * while a session of it is at work, and the line under its description names the run it works on, linked, with no Working section for
   * one session. A "Read only" tag says the factory owns it, the step it is hired into is a link, and Show all opens its instructions
   * in a dialog named for it. Photographed in both themes.
   */
  name: 'factory-agent',
  route: `/factories/${FACTORY}`,
  expect: async (page) => {
    const takeBack = written();
    try {
      await goto(page, `/factories/${FACTORY}/agents/${AGENT.name}`);
      await expectVisible(page.getByRole('heading', { level: 1, name: 'Sentinel', exact: true }), "the frame's head names the agent");
      await expectVisible(page.locator('article'), 'the page draws its body').catch(async (refused: unknown) => {
        throw new Refused(`${refused instanceof Error ? refused.message : 'the page draws its body'}, and it says: "${await drawn(page)}"`);
      });
      await expectVisible(page.locator('[data-read-only][data-way="factory"]', { hasText: 'Read only' }), 'and it is said to be read only');
      await expectVisible(page.locator('[data-ring="alive"]'), 'its ring is lit while its session is at work');
      await expectVisible(page.getByRole('link', { name: RUN.title, exact: true }), 'and the run it works on is a link');
      await expectCount(page.locator('section[aria-label="Working"]'), 0, 'one session lists no Working section');
      await expectVisible(page.locator(`a[data-node="${WORKFLOW.name}/${WORKFLOW.step}"]`), 'the step it is hired into is a link');
      await page.getByRole('button', { name: 'Show all', exact: true }).click();
      await expectVisible(page.getByRole('dialog', { name: "Sentinel's instructions" }), 'Show all opens its instructions in a dialog');
      await page.keyboard.press('Escape');
      await expectCount(page.getByRole('dialog'), 0, 'which Escape closes');
      await settled(page);
      await photograph(page, path.join(OUT, `factory-agent-${await themeOf(page)}.png`));
    } finally {
      takeBack();
      await goto(page, `/factories/${FACTORY}`).catch(() => undefined);
    }
  },
} satisfies PageSpec;
