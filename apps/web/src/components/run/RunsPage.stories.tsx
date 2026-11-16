import { Component, Suspense, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { RunsFailed, RunsLoading, RunsPage } from './RunsPage';
import { noRuns, REFUSED_WORDS, refused, someRuns, WAITING_BRIEF } from '../../../.storybook/fixtures/runs';

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

/** A run waiting on a person, two in flight and three finished: each section holds its runs, its plate saying how many. */
export const SomeRuns: Story = {
  args: { at: {} },
  parameters: { msw: someRuns },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText(WAITING_BRIEF)).toBeVisible();
    await expect(canvasElement.querySelector('[data-runs-page="loaded"] [data-section="waiting"] [data-nothing]')).toBeNull();
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
