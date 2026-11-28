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
  reviewer,
  AGENT,
  APP_FOLDER,
  FACTORY,
  finished,
  four,
  idle,
  keyForm,
  marks,
  models,
  one,
  ROOT_FOLDER,
  reviewStep,
  skillPlaces,
} from '../../../.storybook/fixtures/reviewer';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The page with its reads seeded, the runs not finished being what the story is about. */
function Seeded({ runs, width }: { runs: OpenRuns; width?: number }) {
  const place = { factory: FACTORY };
  const page = (
    <QueryClientProvider
      client={seeded([
        [agentQuery('factory', AGENT, place).queryKey, reviewer],
        [keyFormQuery.queryKey, keyForm],
        [modelsQuery.queryKey, models],
        [openRunsQuery(FACTORY).queryKey, runs],
        [finishedRunsQuery(FACTORY, [], 'workflow in (build,quick)').queryKey, finished],
        [stepQuery('factory', 'build', 'review', place).queryKey, reviewStep('build')],
        [stepQuery('factory', 'quick', 'review', place).queryKey, reviewStep('quick')],
        [factorySkillsQuery(FACTORY).queryKey, skillPlaces],
        [agentMarksQuery(AGENT, FACTORY).queryKey, marks],
      ])}
    >
      <Suspense>
        <FactoryAgentPage name={AGENT} factory={FACTORY} />
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
 * A factory's agent, read only (B5): who it is in a ring that shows whether it is at work, its spec and permissions on the plate, the
 * steps it is hired into, its instructions with Show all, its history, and its skills and servers in tiles of one height, each saying
 * where it comes from. The reviewer of a factory, its reads seeded.
 */
const meta: Meta<typeof Seeded> = {
  title: 'Pages/Factory agent',
  component: Seeded,
  args: { runs: idle },
};
export default meta;

type Story = StoryObj<typeof Seeded>;

/**
 * Nothing at work: the ring is quiet and grey, the line says so with when its last session ended, and no Working section is drawn. The
 * plate's head names its file over a rule, each value in the plate's numerals, the model with its version; the tiles are one height
 * whatever their words, the board's skills named by their own name and the folder they are in.
 */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(page.getByText(/Not working now\./)).toBeVisible());
    await expect(page.getByText(/Its last session ended 51 minutes ago\./)).toBeVisible();
    await expect(canvasElement.querySelector('[data-ring="rest"]')).not.toBeNull();
    await expect(canvasElement.querySelector('section[aria-label="Working"]')).toBeNull();
    const [left, right] = ['left', 'right'].map((side) => canvasElement.querySelector(`[data-column="${side}"]`)?.getBoundingClientRect());
    await expect(Math.abs((left?.top ?? 0) - (right?.top ?? 1))).toBeLessThan(2);
    await expect(canvasElement.querySelector('[data-edited]')?.textContent).toBe('Edited 26 Nov');
    await waitFor(() => expect(canvasElement.querySelector('[data-plate-head]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-plate-head]')?.textContent).toBe(`Specagents/${AGENT}.md`);
    await expect(page.getByText('Opus 5.5')).toBeVisible();
    await expect(page.getByText('How hard it thinks per turn')).toHaveAttribute('title', 'How hard it thinks per turn');
    await expect(canvasElement.querySelector('[data-plate-row="Effort"] [data-pips]')?.getAttribute('data-pips')).toBe('3');
    const harnessNote = keyForm.harnesses.find((h) => h.harness === keyForm.defaultHarness)?.note ?? '';
    await expect(canvasElement.querySelector('[data-plate-row="Harness"] [data-plate-note]')?.textContent).toBe(harnessNote);
    await expect(harnessNote).not.toBe('');
    await expect(page.getByText('Acts without asking first')).toBeVisible();
    const modePips = canvasElement.querySelector('[data-plate-row="Mode"] [data-pips]');
    await expect([modePips?.getAttribute('data-pips'), modePips?.children.length]).toEqual(['2', 6]);
    await waitFor(() => expect(canvasElement.querySelector('[data-skill-tile="ds-build"]')).not.toBeNull());
    const frameOf = (name: string) => canvasElement.querySelector(`[data-skill-tile="${name}"]`)?.closest('[data-cut-frame]');
    const heights = ['review-a-change', 'react-aria', 'ds-build'].map((name) => frameOf(name)?.getBoundingClientRect().height);
    await expect(heights[0]).toBeGreaterThan(0);
    await expect(new Set(heights).size).toBe(1);
    await expect(frameOf('git')?.textContent).toContain('Built into Nemia');
    await expect(frameOf('ds-build')?.textContent).toContain(`From the repository, ${APP_FOLDER}`);
    await expect(frameOf('shadcn')?.textContent).toContain(`From the repository, ${ROOT_FOLDER}`);
    await expect(frameOf('review-a-change')?.textContent).toContain(`Factory ${FACTORY}`);
    await expect(canvasElement.querySelector('[data-server-tile="playwright"]')?.textContent).toContain('From its review step');
  },
};

/**
 * One session at work: the working tag, what it is working on as a link, where its step is, and the ring lit. No Working section. The
 * steps are a row each, and the history shows its newest six, then Show all.
 */
export const WorkingOnce: Story = {
  args: { runs: one },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(page.getByText('working')).toBeVisible());
    await expect(page.getByRole('link', { name: /Two tests that fail/ })).toHaveAttribute(
      'href',
      '/runs/board-two-tests-that-fail-ma-1xu6',
    );
    await expect(canvasElement.querySelector('[data-activity="one"]')?.textContent).toContain('quick › review · try 1 · for 2m');
    await expect(canvasElement.querySelector('[data-ring="alive"]')).not.toBeNull();
    await expect(canvasElement.querySelector('section[aria-label="Working"]')).toBeNull();
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-history-row]')).toHaveLength(6));
    const rows = [...canvasElement.querySelectorAll('[data-step-row]')];
    await expect(rows.map((row) => row.textContent)).toEqual(['build › review', 'quick › review']);
    await expect(rows[0]?.getBoundingClientRect().bottom ?? 0).toBeLessThanOrEqual(rows[1]?.getBoundingClientRect().top ?? 0);
    await expect(page.getByRole('button', { name: 'Show all 25' })).toBeVisible();
  },
};

/** The whole history: Show all lists the rows past the newest six in place, and goes. */
export const HistoryAll: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Show all 25' }));
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-history-row]')).toHaveLength(25));
    await expect(page.queryByRole('button', { name: /Show all \d+/ })).toBeNull();
  },
};

/** Four sessions at once: the line counts them, and the Working section lists each, the longest first, with a round past the first. */
export const WorkingFour: Story = {
  args: { runs: four },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(page.getByText('4 sessions at once')).toBeVisible());
    const section = canvasElement.querySelector('section[aria-label="Working"]');
    await expect(section).not.toBeNull();
    const rows = [...(section?.querySelectorAll('[data-working-row]') ?? [])];
    await expect(rows.map((row) => row.getAttribute('data-working-row'))).toEqual([
      'run-core-a-card-is-parsed-on-dlkf',
      'runtime-a-long-session-keeps-yrfr',
      'board-a-factory-s-agents-pag-izma',
      'board-two-tests-that-fail-ma-1xu6',
    ]);
    await expect(rows[1]?.textContent).toContain('round 2');
    await expect(rows[0]?.textContent).not.toContain('round');
    await expect(rows[0]?.textContent).toContain('…dlkf');
    await expect(canvasElement.querySelector('[data-ring="alive"]')).not.toBeNull();
  },
};

/** Show all opens the instructions in a dialog: named for the agent, holding its file, the focus kept inside, closed by Escape. */
export const Instructions: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const show = await page.findByRole('button', { name: 'Show all' });
    await userEvent.click(show);
    const dialog = await within(document.body).findByRole('dialog', { name: "Reviewer's instructions" });
    await waitFor(() => expect(within(dialog).getByText(/agents\/reviewer\.md · \d+ words/)).toBeVisible());
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
