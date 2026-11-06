import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
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

/** A write to the api from the page, as the board makes one: its status. */
const send = (page: Page, method: 'PUT' | 'DELETE', at: string, body: unknown): Promise<number> =>
  page.evaluate(
    async ([how, to, sent]) =>
      (
        await fetch(to, {
          method: how,
          headers: { 'content-type': 'application/json' },
          ...(sent === undefined ? {} : { body: JSON.stringify(sent) }),
        })
      ).status,
    [method, at, body] as const,
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

/** Her rule over FACTORY's proposals, as she proposes it: approve the updates of hires she makes, never where they widen access. */
const PROPOSAL_RULE = {
  id: 'hires-e2e',
  answer: 'approve-proposal',
  factory: FACTORY,
  resources: ['hires'],
  resourceNames: [],
  verbs: ['update'],
  widens: false,
  proposedBy: ['nemia'],
};

/** Press `control` and refuse any answer but a 200 to the write of her rule by `method`. */
async function ruleWritten(page: Page, control: Locator, method: 'PUT' | 'DELETE', what: string): Promise<void> {
  const [answer] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === method && new URL(r.url()).pathname === `/api/policy/nemia/rules/${PROPOSAL_RULE.id}`,
      {
        timeout: WAIT_MS,
      },
    ),
    control.click(),
  ]);
  if (answer.status() !== 200) throw new Refused(`${what} — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
}

/**
 * Her policy on Nemia's settings: her proposed rule over FACTORY's proposals waits on a Confirm; confirmed, it is in force over proposals
 * with a Drop, and reads in force among what she proposed, once her delegation grants what it reaches; dropped, it is out of force again.
 * The folder of her rules is taken back.
 */
async function ruledOverProposals(page: Page): Promise<void> {
  const auto = path.join(store!, 'auto');
  fs.mkdirSync(auto, { recursive: true });
  fs.writeFileSync(
    path.join(auto, 'nemia.proposed.json'),
    JSON.stringify({ at: '2026-11-06T10:00:00.000Z', rules: [PROPOSAL_RULE], guidance: [], digest: 'none' }),
  );
  const delegation = `/api/namespaces/${FACTORY}/delegations/nemia`;
  try {
    const granted = await send(page, 'PUT', delegation, { rules: [{ resources: ['hires'], resourceNames: [], verbs: ['update'] }] });
    if (granted !== 200)
      throw new Refused(`the api writes her delegation, which a rule of hers needs to be confirmed — it answered ${granted}`);
    await goto(page, '/settings');
    const part = page.locator('[data-nemia-section] [data-auto-rules]');
    const proposedRule = part.locator(`[data-auto-proposed="true"] [data-auto-proposal-rule="${PROPOSAL_RULE.id}"]`);
    await expectVisible(proposedRule.locator('[data-auto-confirm]'), 'her proposed rule over proposals waits on your Confirm');
    await proposedRule.scrollIntoViewIfNeeded();
    await settled(page);
    await photograph(part, path.join(OUT, `proposal-rules-proposed-${await themeOf(page)}.png`));
    await ruleWritten(page, proposedRule.locator('[data-auto-confirm]'), 'PUT', 'her rule over proposals is confirmed');
    const inForce = part.locator(`[data-auto-proposal-rules] [data-auto-proposal-rule="${PROPOSAL_RULE.id}"]`);
    await expectVisible(inForce.locator('[data-auto-drop]'), 'confirmed, it is in force over proposals, with a Drop');
    await expectVisible(proposedRule.locator('[data-auto-confirmed]'), 'and reads in force among what she proposed');
    await inForce.scrollIntoViewIfNeeded();
    await settled(page);
    await photograph(part, path.join(OUT, `proposal-rules-in-force-${await themeOf(page)}.png`));
    await ruleWritten(page, inForce.locator('[data-auto-drop]'), 'DELETE', 'her rule over proposals is dropped');
    await expectCount(part.locator('[data-auto-proposal-rules]'), 0, 'dropped, no rule over proposals is in force');
  } finally {
    await send(page, 'DELETE', delegation, undefined);
    fs.rmSync(auto, { recursive: true, force: true });
  }
}

export default {
  /**
   * A factory's proposal on the board. In a factory the page writes, a proposal of Nemia's that widens access, which her message links: her
   * chat draws it under her words with its mark, and Approve applies it there, after which it offers nothing. The factory page lists it,
   * applied, and its link opens its page with the same part. On the factory's settings, the form writes a delegation, listed, then removed.
   * On Nemia's settings, her proposed rule over the factory's proposals is confirmed, read in force, then dropped. The page takes back the
   * factory, its folder of proposals and hires, and her chat, and her rules.
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
      await ruledOverProposals(page);
    } finally {
      back();
      await goto(page, '/runs');
      fs.rmSync(path.join(store!, 'factories', FACTORY), { recursive: true, force: true });
      fs.rmSync(factoryFile, { force: true });
    }
  },
} satisfies PageSpec;
