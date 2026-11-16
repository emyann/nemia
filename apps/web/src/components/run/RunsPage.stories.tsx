import { Component, Suspense, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { RunsFailed, RunsLoading, RunsPage } from './RunsPage';
import { everyState, noRuns, nothingWaits, oneWaits, REFUSED_WORDS, refused, TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/** What holds the page as its route does: the loading page while its reads are out, the failed page when one is refused. */
class Routed extends Component<{ children: ReactNode }, { error: unknown }> {
  override state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  override render(): ReactNode {
    if (this.state.error !== null) return <RunsFailed error={this.state.error} />;
    return <Suspense fallback={<RunsLoading />}>{this.props.children}</Suspense>;
  }
}

/**
 * The runs page's body, its two reads answered by MSW from typed fixtures (`.storybook/fixtures/runs.ts`): the pattern a page's stories
 * copy. Its args are what the page reads of its address and what it calls when a label is chosen.
 */
const meta: Meta<typeof RunsPage> = {
  title: 'Pages/Runs',
  component: RunsPage,
  args: { at: {}, onLabel: fn() },
  render: (args) => (
    <Routed>
      <RunsPage {...args} />
    </Routed>
  ),
};
export default meta;

type Story = StoryObj<typeof RunsPage>;

/** The page drawn in `canvas` once its reads are in. */
const loaded = async (canvas: HTMLElement): Promise<HTMLElement> => {
  await waitFor(() => expect(canvas.querySelector('[data-runs-page="loaded"]')).not.toBeNull(), { timeout: 5000 });
  return canvas.querySelector<HTMLElement>('[data-runs-page="loaded"]')!;
};

/** Each section's count chip: its count and its tone. */
const chipsOf = (page: HTMLElement) =>
  Object.fromEntries(
    [...page.querySelectorAll('[data-section]')].map((section) => {
      const chip = section.querySelector('[data-count-chip]')!;
      return [section.getAttribute('data-section'), `${chip.getAttribute('data-count-chip')} ${chip.getAttribute('data-count-tone')}`];
    }),
  );

/** The tone of each row's chip in the section `name`, by the run's id's last four characters. */
const tonesOf = (page: HTMLElement, name: string) =>
  Object.fromEntries(
    [...page.querySelectorAll(`[data-section="${name}"] [data-run]`)].map((run) => [
      run.getAttribute('data-run')!.slice(-4),
      run.querySelector('[data-now-word]')?.getAttribute('data-tone'),
    ]),
  );

/** The headings of the table named `label`. */
const headsOf = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll(`[aria-label="${label}"] [role="columnheader"]`)].map((head) => head.textContent?.trim().toUpperCase());

/**
 * Nothing waits on you: the waiting part one line, its chip quiet; three runs in flight, lgll being checked and two waiting on the
 * checkout it holds; and a page of the finished runs, each table by its columns.
 */
export const NothingWaits: Story = {
  args: { at: {} },
  parameters: { msw: nothingWaits },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await expect(chipsOf(page)).toEqual({ waiting: '0 quiet', 'in-flight': '3 alive', finished: '123 rest' });
    const waiting = within(page.querySelector<HTMLElement>('[data-section="waiting"]')!);
    await expect(waiting.getByText('Nothing waits on you.')).toBeVisible();
    await expect(waiting.getByRole('button', { name: 'Waiting in every factory ›' })).toHaveAttribute('aria-expanded', 'false');
    await expect(tonesOf(page, 'in-flight')).toEqual({ lgll: 'alive', '649a': 'waits', '5zt1': 'waits' });
    await expect(headsOf(page, 'Runs in flight')).toEqual(['RUN', 'NOW', 'CLOCK', 'COST']);
    await expect(headsOf(page, 'Finished runs')).toEqual(['RUN', 'FINISHED', 'CLOCK', 'COST', 'OUTCOME']);
    const lgll = page.querySelector<HTMLElement>(`[data-run="${TARGET_RUNS.lgll.metadata.name}"]`)!;
    await expect(within(lgll).getByRole('link', { name: 'area=api' })).toHaveTextContent('api');
    await expect(within(lgll).getByText('quick')).toBeVisible();
  },
};

/** One run waits on you, its land failed its check: its card, with one button, which opens the run; the rest as when nothing waits. */
export const OneWaitsOnYou: Story = {
  args: { at: {} },
  parameters: { msw: oneWaits },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await expect(await within(page).findByText(TARGET_RUNS.vqvd.spec.brief)).toBeVisible();
    await expect(page.querySelector('[data-section="waiting"] [data-nothing]')).toBeNull();
    await expect(chipsOf(page)).toEqual({ waiting: '1 yours', 'in-flight': '3 alive', finished: '123 rest' });
    const card = page.querySelector<HTMLElement>('[data-section="waiting"] article[data-run]')!;
    await expect(card.querySelector('[data-now-word]')?.getAttribute('data-tone')).toBe('yours');
    const [open] = [...card.querySelectorAll('[data-cut-button]')];
    await expect(card.querySelectorAll('[data-cut-button]').length).toBe(1);
    await expect(open).toHaveTextContent('Open the run');
    await expect(open?.closest('a') ?? open).toHaveAttribute('href', `/runs/${TARGET_RUNS.vqvd.metadata.name}`);
  },
};

/**
 * A row in each state in flight — at work, at work past its step's cap, being checked, waiting on a run, waiting for a run slot, held
 * — and a card of each kind of wait on you: one that asks questions, one whose check failed.
 */
export const EveryState: Story = {
  args: { at: {} },
  parameters: { msw: everyState },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await expect(tonesOf(page, 'in-flight')).toEqual({
      '1sw7': 'alive',
      wov8: 'alive',
      lgll: 'alive',
      '649a': 'waits',
      k2rq: 'waits',
      c7un: 'waits',
    });
    await expect(tonesOf(page, 'waiting')).toEqual({ '72wy': 'yours', vqvd: 'yours' });
    const row = (end: keyof typeof TARGET_RUNS) =>
      within(page.querySelector<HTMLElement>(`[data-section="in-flight"] [data-run="${TARGET_RUNS[end].metadata.name}"]`)!);
    await expect(row('wov8').getByText('over its $6')).toBeVisible();
    await expect(row('1sw7').getByRole('img', { name: 'round 2 of 3' })).toBeVisible();
    await expect(row('1sw7').getByRole('img', { name: 'a run waits on it' })).toHaveTextContent('1');
    await expect(row('lgll').getByRole('img', { name: 'a run waits on it' })).toHaveTextContent('1');
    await expect(row('649a').getByRole('link', { name: 'lgll' })).toBeVisible();
    for (const card of page.querySelectorAll('[data-section="waiting"] article[data-run]'))
      await expect(card.querySelectorAll('[data-cut-button]').length).toBe(1);
  },
};

/** No run at all: each section says it holds nothing. */
export const NoRuns: Story = {
  args: { at: {} },
  parameters: { msw: noRuns },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('Nothing waits on you.')).toBeVisible();
    await expect(page.getByText('Nothing is in flight.')).toBeVisible();
    await expect(page.getByText('No run has finished yet.')).toBeVisible();
  },
};

/** The api refuses the page's reads: the page says it could not load them, with the api's words as they came. */
export const ReadRefused: Story = {
  args: { at: {} },
  parameters: { msw: refused },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('alert')).toBeVisible();
    await expect(page.getByText(REFUSED_WORDS)).toBeVisible();
  },
};
