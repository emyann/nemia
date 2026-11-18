import { Suspense } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { checkFailed, freshStore, harnessReady } from '../../../.storybook/fixtures/readiness';
import { atRest } from '../../../.storybook/play';
import { WELCOME_LINE, WelcomePage } from './WelcomePage';

/**
 * The welcome's body, its reads answered by MSW from typed fixtures (`.storybook/fixtures/readiness.ts`), one story a state: a fresh
 * store, a harness installing, a check failed, and ready.
 */
const meta: Meta<typeof WelcomePage> = {
  title: 'Pages/Welcome',
  component: WelcomePage,
  args: {},
  render: () => (
    <Suspense fallback={<p>Reading…</p>}>
      <WelcomePage />
    </Suspense>
  ),
};
export default meta;

type Story = StoryObj<typeof WelcomePage>;

/** The page in `canvas` once its read is in. */
const loaded = async (canvas: HTMLElement): Promise<HTMLElement> => {
  await waitFor(() => expect(canvas.querySelector('[data-welcome]')).not.toBeNull(), { timeout: 5000 });
  return canvas.querySelector<HTMLElement>('[data-welcome]')!;
};

/** A fresh store: its one harness, the one line, Activate, and the skip. */
export const Fresh: Story = {
  parameters: { msw: freshStore },
  play: async ({ canvasElement }) => {
    const page = within(await loaded(canvasElement));
    await expect(page.getByText(WELCOME_LINE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
  },
};

/** Activate pressed: the pinned copy installs, its output followed on the page. */
export const Installing: Story = {
  parameters: { msw: freshStore },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement);
    await userEvent.click(within(page).getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(page.querySelector('[data-harness-choice="installing"]')).not.toBeNull(), { timeout: 5000 });
    atRest();
  },
};

/** Installed and signed in, its version not the pin: both versions said, and the install offered again. */
export const CheckFailed: Story = {
  parameters: { msw: checkFailed },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await waitFor(() => expect(page.querySelector('[data-harness-check="version"][data-check-state="failed"]')).not.toBeNull());
    await expect(within(page).getByRole('button', { name: 'Start the fix' })).toBeEnabled();
    await expect(within(page).queryByRole('link', { name: /Next/ })).toBeNull();
  },
};

/** Both ticks passed: Next names the next milestone. */
export const Ready: Story = {
  parameters: { msw: harnessReady },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement);
    await waitFor(() => expect(within(page).getByRole('link', { name: 'Next: a factory' })).toBeVisible(), { timeout: 5000 });
  },
};
