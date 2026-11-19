import { Suspense } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { HerSheetProvider, useHerSheet } from '@/components/frame/HerSheet';
import { factoryFiled, factoryNext, filedInHerChat, herFiling, volumeGiven } from '../../../.storybook/fixtures/readiness';
import { factoriesHeld, templatesServed } from '../../../.storybook/fixtures/templates';
import { FactoryStep } from './FactoryStep';

/** Says whether her sheet is open, beside the step, for a play to read: the story's own, no seam of `src`. */
function HerProbe() {
  const her = useHerSheet();
  return <output data-her-open={String(her.open)} hidden />;
}

/**
 * The welcome's factory step, its reads and writes answered by MSW from typed fixtures (`.storybook/fixtures/readiness.ts`,
 * `templates.ts`), under her sheet's state as the frame holds it, one story a state.
 */
const meta: Meta<typeof FactoryStep> = {
  title: 'Pages/Welcome factory',
  component: FactoryStep,
  args: {},
  parameters: { msw: [...factoryNext, ...templatesServed] },
  render: () => (
    <HerSheetProvider>
      <Suspense fallback={<p>Reading…</p>}>
        <FactoryStep />
      </Suspense>
      <HerProbe />
    </HerSheetProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The step in `canvas` once its reads are in. */
const loaded = async (canvas: HTMLElement) => {
  await waitFor(() => expect(canvas.querySelector('[data-factory-step]')).not.toBeNull(), { timeout: 5000 });
  return canvas.querySelector<HTMLElement>('[data-factory-step]')!;
};

/** A factory way pressed in `page`. */
const choose = async (page: HTMLElement, way: string, user: { click: (e: Element) => Promise<void> }) =>
  user.click(page.querySelector<HTMLElement>(`[data-factory-way="${way}"]`)!);

/** No factory yet: the three tiles, no panel, and the skip. */
export const Choose: Story = {
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await expect(page).toHaveAttribute('data-factory-step', 'choose');
    await expect(page.querySelectorAll('[data-factory-way]')).toHaveLength(3);
    await expect(page.querySelector('[data-factory-panel]')).toBeNull();
    await expect(within(page).getByRole('button', { name: 'Skip for now' })).toBeEnabled();
    await expect(within(page).queryByRole('link', { name: /Next|On to/ })).toBeNull();
  },
};

/** Talk to Nemia chosen and pressed: her sheet opens beside the step, which stays on its panel. */
export const NemiaChosen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await choose(page, 'nemia', userEvent);
    await expect(canvasElement.querySelector('[data-her-open]')).toHaveAttribute('data-her-open', 'false');
    await userEvent.click(within(page).getByRole('button', { name: 'Talk to Nemia' }));
    await expect(canvasElement.querySelector('[data-her-open]')).toHaveAttribute('data-her-open', 'true');
    await expect(page).toHaveAttribute('data-factory-step', 'nemia');
    await expect(within(page).getByRole('button', { name: 'Skip for now' })).toBeEnabled();
  },
};

/** From a template chosen: its form, sdlc offered. */
export const TemplateChosen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await choose(page, 'template', userEvent);
    await expect(page.querySelector('[data-factory-panel="template"] [data-template-offer="sdlc"]')).not.toBeNull();
    await expect(within(page).getByRole('button', { name: 'Skip for now' })).toBeEnabled();
  },
};

/** From scratch chosen: its form. */
export const ScratchChosen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await choose(page, 'scratch', userEvent);
    await expect(page.querySelector('[data-factory-panel="scratch"] [data-scratch-form]')).not.toBeNull();
  },
};

/** sdlc applied as my-app: the factory made, with no volume yet, and Next to the volume. */
export const MadeFromTemplate: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await choose(page, 'template', userEvent);
    await userEvent.type(within(page).getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(within(page).getByRole('button', { name: 'Make the factory' }));
    await waitFor(() => expect(page).toHaveAttribute('data-factory-step', 'made'), { timeout: 5000 });
    await expect(within(page).getByText('my-app is made.')).toBeVisible();
    await expect(page.querySelector('[data-factory-no-volume]')).not.toBeNull();
    await expect(page.querySelector('[data-factory-way]')).toBeNull();
    await expect(page.querySelector('[data-factory-guide]')).toBeNull();
    await expect(within(page).getByRole('link', { name: 'Next: a volume' })).toBeVisible();
    await expect(within(page).getByRole('button', { name: 'Skip for now' })).toBeEnabled();
  },
};

/** An empty factory filed as my-app: the factory made, and the guide under it. */
export const Guide: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await choose(page, 'scratch', userEvent);
    await userEvent.type(within(page).getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(within(page).getByRole('button', { name: 'Make an empty factory' }));
    await waitFor(() => expect(page).toHaveAttribute('data-factory-step', 'guide'), { timeout: 5000 });
    await expect(page.querySelector('[data-factory-made]')).not.toBeNull();
    await expect(page.querySelectorAll('[data-guide]')).toHaveLength(3);
    await expect(within(page).getByRole('button', { name: 'Skip for now' })).toBeEnabled();
  },
};

/** The store already holds a factory, filed by Nemia or at a terminal: the step opens on made, naming it, with no press. */
export const AlreadyFiled: Story = {
  parameters: { msw: [...factoryFiled, ...templatesServed, ...factoriesHeld(['shop'])] },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await expect(page).toHaveAttribute('data-factory-step', 'made');
    await waitFor(() => expect(page.querySelector('[data-factory-named]')).toHaveTextContent('Your factory: shop.'), { timeout: 5000 });
    await expect(page.querySelector('[data-factory-no-volume]')).not.toBeNull();
    await expect(within(page).getByRole('link', { name: 'Next: a volume' })).toBeVisible();
    await expect(within(page).getByRole('button', { name: 'Skip for now' })).toBeEnabled();
  },
};

/** The store's factories already have a volume: made names them, says no word of a missing volume, and Next names the first landing. */
export const VolumeGiven: Story = {
  parameters: { msw: [...volumeGiven, ...templatesServed, ...factoriesHeld(['shop', 'site'])] },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await expect(page).toHaveAttribute('data-factory-step', 'made');
    await waitFor(() => expect(page.querySelector('[data-factory-named]')).toHaveTextContent('Your factories: shop, site.'), {
      timeout: 5000,
    });
    await expect(page.querySelector('[data-factory-no-volume]')).toBeNull();
    await expect(within(page).getByRole('link', { name: 'Next: a first change merged' })).toBeVisible();
  },
};

/**
 * Talk to Nemia pressed, and she files the factory in her chat: the step, watching the store's milestones while that way is chosen,
 * moves on to made by itself, with no reload, naming the factory she made.
 */
export const FiledInHerChat: Story = {
  parameters: { msw: [...filedInHerChat, ...templatesServed, ...factoriesHeld(['her-app'])] },
  play: async ({ canvasElement, userEvent }) => {
    herFiling.filed = false;
    const page = await loaded(canvasElement);
    await choose(page, 'nemia', userEvent);
    await userEvent.click(within(page).getByRole('button', { name: 'Talk to Nemia' }));
    await expect(page).toHaveAttribute('data-factory-step', 'nemia');
    herFiling.filed = true;
    await waitFor(() => expect(page).toHaveAttribute('data-factory-step', 'made'), { timeout: 8000 });
    await waitFor(() => expect(page.querySelector('[data-factory-named]')).toHaveTextContent('Your factory: her-app.'), { timeout: 5000 });
    herFiling.filed = false;
  },
};
