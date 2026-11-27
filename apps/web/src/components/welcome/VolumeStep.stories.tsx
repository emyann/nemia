import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { ACME, sent, volumeStore } from '../../../.storybook/fixtures/folders';
import { VolumeStep } from './VolumeStep';
import { readingColumn } from '../../../.storybook/reading';

/** What a story of the step draws: the factory the path names (none at the welcome), and whether it was opened from Settings. */
type Args = { factory?: string; again: boolean };

/**
 * The welcome's volume step, "Where is the work?", its reads and writes answered by MSW from typed fixtures
 * (`.storybook/fixtures/folders.ts`), each story over a store of its own, one story a state.
 */
const meta: Meta<Args> = {
  tags: ['network'],
  title: 'Pages/Welcome volume',
  decorators: [readingColumn],
  args: { again: false },
  parameters: { msw: volumeStore() },
  render: (args) => <VolumeStep {...args} />,
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The step in `canvas` once its reads are in, on `screen` where named. */
const loaded = async (canvas: HTMLElement, screen?: string) => {
  await waitFor(
    async () => {
      const page = canvas.querySelector<HTMLElement>('[data-volume-step]');
      await expect(page).not.toBeNull();
      if (screen !== undefined) await expect(page).toHaveAttribute('data-volume-step', screen);
    },
    { timeout: 5000 },
  );
  return canvas.querySelector<HTMLElement>('[data-volume-step]')!;
};

/** What a play presses and types with. */
type User = {
  click: (e: Element) => Promise<void>;
  type: (e: Element, text: string) => Promise<void>;
  keyboard: (text: string) => Promise<void>;
};

/** The way `way` pressed in `page`. */
const choose = async (page: HTMLElement, way: string, user: User) =>
  user.click(page.querySelector<HTMLElement>(`[data-volume-way="${way}"]`)!);

/** The folder `path` typed in the folder way's field and used. */
const useFolder = async (page: HTMLElement, path: string, user: User) => {
  await choose(page, 'folder', user);
  await user.type(within(page).getByRole('combobox', { name: /Folder/ }), path);
  await user.keyboard('{Escape}');
  await user.click(within(page).getByRole('button', { name: 'Use this folder' }));
};

/** The welcome, a factory with no volume: the three tiles, no panel, and the skip. */
export const Choose: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement }) => {
    const page = await loaded(canvasElement, 'choose');
    await expect(page.querySelectorAll('[data-volume-way]')).toHaveLength(3);
    await expect(page.querySelector('[data-volume-panel]')).toBeNull();
    await expect(within(page).getByRole('link', { name: 'Skip, set it later' })).toBeEnabled();
  },
};

/** Skip, set it later: the step leaves for the board. */
export const Skipped: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await userEvent.click(within(page).getByRole('link', { name: 'Skip, set it later' }));
    const ground = canvasElement.querySelector('[data-story-ground]');
    await waitFor(() => expect(ground?.getAttribute('data-at')).toBe('/'));
  },
};

/** A folder on this machine: typing the folder's path, the api's folders under it are offered; Escape closes the list. */
export const FolderNamed: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await choose(page, 'folder', userEvent);
    await userEvent.type(within(page).getByRole('combobox', { name: /Folder/ }), '/home/you/code/');
    await waitFor(
      async () => {
        const listbox = within(document.body).getByRole('listbox');
        await expect(
          within(listbox)
            .getAllByRole('option')
            .map((o) => o.textContent),
        ).toEqual(['acme', 'nemia', 'notes']);
      },
      { timeout: 5000 },
    );
    await userEvent.keyboard('{Escape}');
  },
};

/** A folder that is no repository: the step offers git init, and adds nothing yet. */
export const NotARepository: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await useFolder(page, '/home/you/code/notes', userEvent);
    await loaded(canvasElement, 'init');
    await expect(page.querySelector('[data-init-offer="offered"]')).not.toBeNull();
  },
};

/** No to git init: the step stays on the folder, says why, and adds nothing. */
export const Declined: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const before = sent.length;
    const page = await loaded(canvasElement, 'choose');
    await useFolder(page, '/home/you/code/notes', userEvent);
    await loaded(canvasElement, 'init');
    await userEvent.click(within(page).getByRole('button', { name: 'No' }));
    await loaded(canvasElement, 'declined');
    await expect(page.querySelector('[data-init-declined]')).not.toBeNull();
    await expect(sent.slice(before)).toEqual([]);
  },
};

/** Yes to git init: the folder is made a repository, added writable and untrusted, and its trust is asked. */
export const MadeARepository: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const before = sent.length;
    const page = await loaded(canvasElement, 'choose');
    await useFolder(page, '/home/you/code/notes', userEvent);
    await loaded(canvasElement, 'init');
    await userEvent.click(within(page).getByRole('button', { name: 'Yes, make it one' }));
    await loaded(canvasElement, 'trust');
    await expect(sent.slice(before).map((s) => s.route)).toEqual(['POST /api/folders/repository', `POST /api/factories/${ACME}/volumes`]);
    await expect(sent[sent.length - 1]?.body).toEqual({ volume: '/home/you/code/notes:rw', noTrust: true });
  },
};

/** A repository's folder used: its trust is asked; Trust gives it, and the work is in place, with Next to the first card. */
export const Trusted: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await useFolder(page, '/home/you/code/acme', userEvent);
    await loaded(canvasElement, 'trust');
    await userEvent.click(within(page).getByRole('button', { name: 'Trust' }));
    await loaded(canvasElement, 'done');
    await expect(sent[sent.length - 1]?.route).toBe(`POST /api/factories/${ACME}/trust`);
    await expect(within(page).getByRole('link', { name: 'Next: a first run that succeeded' })).toBeVisible();
  },
};

/** Not now: the volume stays untrusted, and the step says the factory waits on it. */
export const Waiting: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await useFolder(page, '/home/you/code/acme', userEvent);
    await loaded(canvasElement, 'trust');
    await userEvent.click(within(page).getByRole('button', { name: 'Not now' }));
    await loaded(canvasElement, 'waiting');
    await expect(page.querySelector('[data-volume-waiting]')).not.toBeNull();
  },
};

/** A machine whose harness keeps no trust: the volume added is the work in place at once. */
export const NoTrustKept: Story = {
  parameters: { msw: volumeStore({ keepsTrust: false }) },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await useFolder(page, '/home/you/code/acme', userEvent);
    await loaded(canvasElement, 'done');
  },
};

/** A repository by its address: this factory's missing need first, with its fix, then the address and Clone. */
export const Address: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await choose(page, 'address', userEvent);
    await waitFor(() => expect(page.querySelector('[data-address-need="gh-sign-in"]')).not.toBeNull(), { timeout: 5000 });
    await expect(within(page).getByRole('button', { name: 'Clone it' })).toBeDisabled();
  },
};

/** The address cloned: added writable, and its trust asked. */
export const Cloned: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await choose(page, 'address', userEvent);
    await userEvent.type(within(page).getByRole('textbox', { name: /Address/ }), 'git@github.com:you/acme.git');
    await userEvent.click(within(page).getByRole('button', { name: 'Clone it' }));
    await loaded(canvasElement, 'trust');
    await expect(sent[sent.length - 1]?.body).toEqual({ volume: 'git@github.com:you/acme.git:rw', noTrust: true });
  },
};

/** A new repository: a name, made in the store, added writable, and its trust asked. */
export const NewMade: Story = {
  parameters: { msw: volumeStore() },
  play: async ({ canvasElement, userEvent }) => {
    const before = sent.length;
    const page = await loaded(canvasElement, 'choose');
    await choose(page, 'new', userEvent);
    await userEvent.type(within(page).getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(within(page).getByRole('button', { name: 'Make it' }));
    await loaded(canvasElement, 'trust');
    await expect(sent.slice(before).map((s) => s.route)).toEqual(['POST /api/repositories', `POST /api/factories/${ACME}/volumes`]);
  },
};

/** At the welcome, a factory given its trusted writable volume at a terminal: the step is done. */
export const HeldAtTheWelcome: Story = {
  parameters: { msw: volumeStore({ held: true }) },
  play: async ({ canvasElement }) => {
    await loaded(canvasElement, 'done');
  },
};

/** Opened again from Settings, the factory holding its work: a way's panel offers read-only first. */
export const AgainFromSettings: Story = {
  args: { factory: ACME, again: true },
  parameters: { msw: volumeStore({ held: true }) },
  play: async ({ canvasElement, userEvent }) => {
    const page = await loaded(canvasElement, 'choose');
    await choose(page, 'folder', userEvent);
    await expect(page.querySelector('[data-volume-mode="ro"]')).toHaveAttribute('data-selected', 'true');
    await expect(within(page).getByRole('link', { name: 'Skip, set it later' })).toBeEnabled();
  },
};
