import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { filed, firstCardStore, STARTED_RUN } from '../../../.storybook/fixtures/firstCard';
import { FirstCard } from './FirstCard';

/**
 * The welcome's first card, "What first?", its reads and writes answered by MSW from typed fixtures (`.storybook/fixtures/firstCard.ts`),
 * each story over a store of its own, one story a state.
 */
const meta: Meta<typeof FirstCard> = {
  tags: ['network'],
  title: 'Pages/Welcome first card',
  args: {},
  parameters: { msw: firstCardStore() },
  render: () => <FirstCard />,
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The page in `canvas` once its cost line is read, as `kind` where named. */
const loaded = async (canvas: HTMLElement, kind?: string) => {
  await waitFor(
    async () => {
      const line = canvas.querySelector('[data-cost-line]');
      await expect(line).not.toBeNull();
      if (kind !== undefined) await expect(line).toHaveAttribute('data-cost-line', kind);
    },
    { timeout: 10_000 },
  );
  return canvas.querySelector<HTMLElement>('[data-first-card]')!;
};

/**
 * Quick offered, nothing measured yet: the cost line says the estimate. Picking a suggestion fills the card, and Start files it labelled
 * as the first card, in quick, then starts it gated at its landing and opens the run's page.
 */
export const Estimate: Story = {
  parameters: { msw: firstCardStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'estimate');
    await expect(page.querySelectorAll('[data-first-suggestion]')).toHaveLength(3);
    const start = within(page).getByRole('button', { name: /^Start/ });
    await expect(start).toBeDisabled();
    await userEvent.click(page.querySelector<HTMLElement>('[data-first-suggestion="Say what the repository is"]')!);
    await expect(within(page).getByRole('textbox', { name: 'Your card' })).toHaveValue(
      'Add one line at the top of the README saying what this repository is for. Change nothing else.',
    );
    filed.length = 0;
    await userEvent.click(start);
    const ground = canvasElement.querySelector('[data-story-ground]');
    await waitFor(() => expect(ground?.getAttribute('data-at')).toBe(`/runs/${STARTED_RUN}`));
    await expect(filed.map((w) => w.route)).toEqual(['POST cards', 'POST start']);
    await expect(filed[0]?.body).toMatchObject({ workflow: 'quick', label: ['onboarding=first-card'] });
    await expect(filed[1]?.body).toMatchObject({ workflow: 'quick', gates: ['land'] });
  },
};

/** Quick runs that landed on this store: the cost line says what one took and cost here. */
export const Measured: Story = {
  parameters: { msw: firstCardStore({ landedRuns: 4 }) },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement, 'measured');
    await expect(page.querySelector('[data-cost-line]')).toHaveTextContent('$3.20');
  },
};

/**
 * A factory with no quick: its own workflows are offered to choose from, and Start waits for one. The one picked is started gated at its
 * ending step, `land`, read off the factory's listing of it, so its run waits on the person as quick's does.
 */
export const NoQuick: Story = {
  parameters: { msw: firstCardStore({ workflows: ['build', 'janitor'] }) },
  play: async ({ canvasElement, userEvent }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-first-workflow]')).toHaveLength(2), { timeout: 5000 });
    await expect(canvasElement.querySelector('[data-cost-line]')).toBeNull();
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-first-workflow="build"]')!);
    const page = await loaded(canvasElement, 'estimate');
    await userEvent.click(page.querySelector<HTMLElement>('[data-first-suggestion="Say what the repository is"]')!);
    const start = within(page).getByRole('button', { name: /^Start/ });
    await waitFor(() => expect(start).toHaveAccessibleName('Start, gated before it lands'), { timeout: 5000 });
    filed.length = 0;
    await userEvent.click(start);
    await waitFor(() => expect(filed.map((w) => w.route)).toEqual(['POST cards', 'POST start']));
    await expect(filed[1]?.body).toMatchObject({ workflow: 'build', gates: ['land'] });
  },
};

/** A start the api refuses: its words are said, and the page stays. */
export const Refused: Story = {
  parameters: { msw: firstCardStore({ refuses: 'the factory acme wires quick to no repository: attach it first' }) },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await userEvent.click(page.querySelector<HTMLElement>('[data-first-suggestion="Fix a typo"]')!);
    await userEvent.click(within(page).getByRole('button', { name: /^Start/ }));
    await waitFor(() => expect(page.querySelector('[data-first-refused]')).toHaveTextContent('wires quick to no repository'));
  },
};
