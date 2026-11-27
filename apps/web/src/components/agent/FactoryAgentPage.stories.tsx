import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { agentQuery } from '@/lib/api/agents';
import { keyFormQuery } from '@/lib/api/builder';
import { modelsQuery } from '@/lib/api/models';
import { finishedRunsQuery, openRunsQuery, type OpenRuns } from '@/lib/api/runs';
import { factorySkillsQuery } from '@/lib/api/skills';
import { agentMarksQuery } from '@/lib/api/stats';
import { stepQuery } from '@/lib/api/workflows';
import { FactoryAgentPage } from './FactoryAgentPage';
import {
  agora,
  AGORA,
  FACTORY,
  finished,
  four,
  idle,
  keyForm,
  marks,
  models,
  one,
  reviewStep,
  skillPlaces,
} from '../../../.storybook/fixtures/agora';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The page with its reads seeded, the runs not finished being what the story is about. */
function Seeded({ runs, width }: { runs: OpenRuns; width?: number }) {
  const place = { factory: FACTORY };
  const page = (
    <QueryClientProvider
      client={seeded([
        [agentQuery('factory', AGORA, place).queryKey, agora],
        [keyFormQuery.queryKey, keyForm],
        [modelsQuery.queryKey, models],
        [openRunsQuery(FACTORY).queryKey, runs],
        [finishedRunsQuery(FACTORY, []).queryKey, finished],
        [stepQuery('factory', 'build', 'review', place).queryKey, reviewStep('build')],
        [stepQuery('factory', 'quick', 'review', place).queryKey, reviewStep('quick')],
        [factorySkillsQuery(FACTORY).queryKey, skillPlaces],
        [agentMarksQuery(AGORA, FACTORY).queryKey, marks],
      ])}
    >
      <Suspense>
        <FactoryAgentPage name={AGORA} factory={FACTORY} />
      </Suspense>
    </QueryClientProvider>
  );
  return width === undefined ? (
    page
  ) : (
    <div className="@container/page" style={{ width }}>
      {page}
    </div>
  );
}

/**
 * A factory's agent, read only (B5): who it is in a ring that shows whether it is at work, its spec and permissions, the steps it is
 * hired into, its instructions with Show all, its history, and its skills and servers by where each comes from. Its reads are seeded.
 */
const meta: Meta<typeof Seeded> = {
  title: "Pages/Agent, a factory's",
  component: Seeded,
  args: { runs: idle },
};
export default meta;

type Story = StoryObj<typeof Seeded>;

/** Nothing at work: the ring is quiet and grey, the line says so with when its last session ended, and no Working section is drawn. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText(/Not working now\./)).toBeVisible();
    await expect(page.getByText(/Its last session ended 51 minutes ago\./)).toBeVisible();
    await expect(canvasElement.querySelector('[data-ring="rest"]')).not.toBeNull();
    await expect(canvasElement.querySelector('section[aria-label="Working"]')).toBeNull();
    const [left, right] = ['left', 'right'].map((side) => canvasElement.querySelector(`[data-column="${side}"]`)?.getBoundingClientRect());
    await expect(Math.abs((left?.top ?? 0) - (right?.top ?? 1))).toBeLessThan(2);
  },
};

/** One session at work: the working tag, what it is working on as a link, where its step is, and the ring lit. No Working section. */
export const WorkingOnce: Story = {
  args: { runs: one },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('working')).toBeVisible();
    await expect(page.getByRole('link', { name: /approve modal uses the step/ })).toHaveAttribute('href', '/runs/r-7k2m-quick');
    await expect(canvasElement.querySelector('[data-activity="one"]')?.textContent).toContain('quick › review · try 1 · for 2m');
    await expect(canvasElement.querySelector('[data-ring="alive"]')).not.toBeNull();
    await expect(canvasElement.querySelector('section[aria-label="Working"]')).toBeNull();
  },
};

/** Four sessions at once: the line counts them, and the Working section lists each, the longest first, with a round past the first. */
export const WorkingFour: Story = {
  args: { runs: four },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('4 sessions at once')).toBeVisible();
    const section = canvasElement.querySelector('section[aria-label="Working"]');
    await expect(section).not.toBeNull();
    const rows = [...(section?.querySelectorAll('[data-working-row]') ?? [])];
    await expect(rows.map((row) => row.getAttribute('data-working-row'))).toEqual([
      'r-3i4j-y5z6',
      'r-4e5f-p7q8',
      'r-1a2b-9c3d',
      'r-9g0h-w1x2',
    ]);
    await expect(rows[1]?.textContent).toContain('round 2');
    await expect(rows[0]?.textContent).not.toContain('round');
    await expect(rows[0]?.textContent).toContain('…y5z6');
    await expect(canvasElement.querySelector('[data-ring="alive"]')).not.toBeNull();
  },
};

/** Show all opens the instructions in a dialog: named for the agent, holding its file, the focus kept inside, closed by Escape. */
export const Instructions: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const show = await page.findByRole('button', { name: 'Show all' });
    await userEvent.click(show);
    const dialog = await within(document.body).findByRole('dialog', { name: "Agora's instructions" });
    await waitFor(() => expect(within(dialog).getByText(/agents\/agora\.md · \d+ words/)).toBeVisible());
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.tab();
    await userEvent.tab();
    await expect(dialog.contains(document.activeElement)).toBe(true);
    await expect(dialog.querySelectorAll('br')).toHaveLength(0);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(show));
  },
};

/** A narrow page (900 pixels): the columns stack, the left one above the right. */
export const Stacked: Story = {
  args: { runs: one, width: 900 },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Harness');
    const [left, right] = ['left', 'right'].map((side) => canvasElement.querySelector(`[data-column="${side}"]`)?.getBoundingClientRect());
    await expect(left?.bottom ?? Infinity).toBeLessThanOrEqual(right?.top ?? 0);
  },
};
