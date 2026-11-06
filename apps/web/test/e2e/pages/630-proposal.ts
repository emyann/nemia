import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page writes, on the checkout, offering WORKFLOWS' workflow of yours. */
const FACTORY = 'proposing-e2e';

/** The hire the proposal changes: the seeded agent hired into `plan` of the workflow of yours. */
const HIRE = `${WORKFLOWS.yours.name}.plan`;

/** Her message, linking the proposal by its board page, as `nemia.md` teaches her. */
const said = (name: string): string =>
  `I proposed [${name}](/factories/${FACTORY}/proposals/${name}): it hires ${AGENTS.seeded.name} into plan, and it widens access.`;

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** A POST to the api from the page, as the board makes one: no session token, so the person's. Its status and answer. */
const post = (page: Page, at: string, body: unknown): Promise<{ status: number; answer: unknown }> =>
  page.evaluate(
    async ([to, sent]) => {
      const res = await fetch(to, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sent) });
      return { status: res.status, answer: (await res.json()) as unknown };
    },
    [at, body] as const,
  );

/**
 * The proposal made through the api's door, an update of the hire at the version it reads, then its file made Nemia's and widening, as her
 * session would have made it: the door's own decode reads it back. Its name.
 */
async function proposed(page: Page): Promise<string> {
  const hire = await page.evaluate(
    async (to) => (await (await fetch(to)).json()) as { metadata: { resourceVersion: string } },
    `/api/namespaces/${FACTORY}/hires/${HIRE}`,
  );
  const made = await post(page, `/api/namespaces/${FACTORY}/proposals`, {
    objects: [
      {
        kind: 'Hire',
        verb: 'update',
        metadata: { name: HIRE, namespace: FACTORY, resourceVersion: hire.metadata.resourceVersion },
        spec: { workflow: WORKFLOWS.yours.name, step: 'plan', agent: AGENTS.seeded.name },
      },
    ],
    why: 'the plan needs its notes written',
  });
  if (made.status !== 201) throw new Refused(`the api makes the proposal — it answered ${made.status}: ${JSON.stringify(made.answer)}`);
  const name = (made.answer as { metadata: { name: string } }).metadata.name;
  const file = path.join(store!, 'factories', FACTORY, 'proposals', `${name}.json`);
  const proposal = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    status: { proposedBy: object; widens: boolean; changes: { access: string }[] };
  };
  proposal.status.proposedBy = { agent: 'nemia' };
  proposal.status.widens = true;
  proposal.status.changes = proposal.status.changes.map((c) => ({ ...c, access: 'widens' }));
  fs.writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`);
  return name;
}

/** Her message draws the proposal under her words, widening; a click on Approve applies it, and no button remains. */
async function approvedInChat(page: Page, name: string): Promise<void> {
  const panel = await openChat(page);
  const part = panel.locator(`[data-chat-proposal="${name}"]`);
  await expectVisible(part.locator(`[data-proposal="${name}"][data-proposal-phase="waiting"]`), 'her message draws the proposal, waiting');
  await expectVisible(part.locator('[data-proposal-widens]'), 'with its Widens access mark');
  await part.scrollIntoViewIfNeeded();
  await settled(page);
  await photograph(panel, path.join(OUT, `proposal-chat-waiting-${await themeOf(page)}.png`));
  await part.locator('[data-proposal-approve]').click();
  await expectVisible(part.locator(`[data-proposal-phase="applied"]`).filter({ hasText: 'applied' }), 'approved, it reads applied');
  await expectCount(part.locator('[data-proposal-approve], [data-proposal-decline]'), 0, 'and offers no judgement the api would refuse');
  await settled(page);
  await photograph(panel, path.join(OUT, `proposal-chat-applied-${await themeOf(page)}.png`));
}

/** The floor lists the proposal, applied, and its link opens the proposal page with the same part. */
async function listedOnFloor(page: Page, name: string): Promise<void> {
  await goto(page, `/factories/${FACTORY}`);
  const row = page.locator(`[data-factory-proposal="${name}"][data-proposal-phase="applied"]`);
  await expectVisible(row, 'the factory page lists the proposal, applied');
  await photograph(page, path.join(OUT, `proposal-floor-${await themeOf(page)}.png`));
  await row.getByRole('link', { name }).click();
  await page.waitForURL((url) => url.pathname === `/factories/${FACTORY}/proposals/${name}`, { timeout: WAIT_MS });
  await expectVisible(page.locator(`[data-proposal-page] [data-proposal="${name}"][data-proposal-phase="applied"]`), 'its page draws it');
  await settled(page);
  await photograph(page, path.join(OUT, `proposal-page-${await themeOf(page)}.png`));
}

/** On the settings, the form writes a delegation of the seeded agent over hires' updates; it is listed, then removed. */
async function delegated(page: Page): Promise<void> {
  await goto(page, `/factories/${FACTORY}/settings`);
  const form = page.locator('[data-delegation-form]');
  await form.locator('[data-delegation-agent]').fill(AGENTS.seeded.name);
  await form.locator('[data-delegation-resource="hires"]').click();
  await form.locator('[data-delegation-verb="update"]').click();
  await form.locator('[data-delegation-save]').click();
  const row = page.locator(`[data-delegation="${AGENTS.seeded.name}"]`);
  await expectVisible(row.filter({ hasText: 'update hires, any name' }), 'the delegation written is listed with its grant');
  await row.scrollIntoViewIfNeeded();
  await settled(page);
  await photograph(page.locator('[data-factory-delegations]'), path.join(OUT, `proposal-delegations-${await themeOf(page)}.png`));
  await row.locator('[data-delegation-remove]').click();
  await expectCount(page.locator('[data-delegation]'), 0, 'Remove takes it out');
}

export default {
  /**
   * A factory's proposal on the board. In a factory the page writes, a proposal of Nemia's that widens access, which her message links:
   * her chat draws it under her words with its mark, and Approve applies it there, after which it offers nothing. The factory page lists
   * it, applied, and its link opens its page with the same part. On the factory's settings, the form writes a delegation, listed, then
   * removed. The page takes back the factory, its folder of proposals and hires, and her chat.
   */
  name: 'proposal',
  route: '/runs',
  expect: async (page) => {
    const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
    fs.writeFileSync(factoryFile, JSON.stringify({ repos: [path.join(store!, 'checkout')], workflows: [WORKFLOWS.yours.name] }, null, 2));
    let back = (): void => undefined;
    try {
      const name = await proposed(page);
      back = herChat({ session: 'up', said: [{ text: said(name) }] });
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await approvedInChat(page, name);
      await listedOnFloor(page, name);
      await delegated(page);
    } finally {
      back();
      await goto(page, '/runs');
      fs.rmSync(path.join(store!, 'factories', FACTORY), { recursive: true, force: true });
      fs.rmSync(factoryFile, { force: true });
    }
  },
} satisfies PageSpec;
