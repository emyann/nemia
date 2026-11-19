import type { Meta, StoryObj } from '@storybook/react-vite';
import { delay, http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FactoryVolumes } from './FactoryVolumes';
import { factoryView, FACTORY } from '../../../.storybook/fixtures/proposals';
import { volumes } from '../../../.storybook/fixtures/factories';

const VOLUMES = '/api/factories/:factory/volumes';
const VOLUME = '/api/namespaces/:namespace/volumes/:name';

/**
 * A factory's volumes on its settings page, one story a state: none, with the line that gives one; two, the writable one worked on,
 * each with its two switches; a switch turned on, and one refused; a volume given through the form, refused, and one being removed.
 */
const meta: Meta<typeof FactoryVolumes> = {
  title: 'Factory/FactoryVolumes',
  component: FactoryVolumes,
  args: { factory: factoryView(FACTORY) },
};
export default meta;

type Story = StoryObj<typeof FactoryVolumes>;

/** No volume: the kit's empty state, with the line that gives one, and the form, Add held until a path is typed. */
export const None: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(canvasElement.querySelector('[data-no-volumes] [data-slot="empty-state"]')).not.toBeNull();
    await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Worked on/ })).toBeChecked();
  },
};

/** The switch `key` of the volume at `path`, as drawn: its input, which says whether it is on. */
const switchOf = (canvasElement: HTMLElement, path: string, key: 'claudeMd' | 'skills') =>
  canvasElement.querySelector<HTMLInputElement>(`[data-factory-volume="${path}"] [data-volume-switch="${key}"] input`);

/** The switch `key` of the volume at `path`, by its label, which a press goes through. */
const labelOf = (canvasElement: HTMLElement, path: string, key: 'claudeMd' | 'skills') =>
  canvasElement.querySelector<HTMLElement>(`[data-factory-volume="${path}"] [data-volume-switch="${key}"]`);

/**
 * A read-only folder and a writable one, which is worked on; each with its Remove and its two switches, CLAUDE.md off and skills on, as
 * a volume that sets neither is.
 */
export const Two: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-factory-volume]').length).toBe(2);
    await expect(canvasElement.querySelector('[data-volume-role="worked-on"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('[data-volume-remove]').length).toBe(2);
    for (const path of ['/srv/notes', '/srv/scratch']) {
      await expect(switchOf(canvasElement, path, 'claudeMd')).not.toBeChecked();
      await expect(switchOf(canvasElement, path, 'skills')).toBeChecked();
    }
    await expect(canvasElement.querySelector('[data-volume-switch="claudeMd"]')).toHaveTextContent('CLAUDE.md files load');
    await expect(canvasElement.querySelector('[data-volume-switch="skills"]')).toHaveTextContent('.claude/skills are offered');
  },
};

/** CLAUDE.md turned on for one volume: the api is sent that switch alone, on the volume by its name, and nothing is refused. */
export const Switched: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  parameters: {
    msw: [
      http.patch(VOLUME, async ({ request, params }) => {
        await expect([params.namespace, params.name]).toEqual([FACTORY, 'notes']);
        await expect(await request.json()).toEqual({ claudeMd: true });
        return HttpResponse.json({
          apiVersion: 'nemia/v1',
          kind: 'Volume',
          metadata: { name: 'notes', namespace: FACTORY },
          spec: { path: '/srv/notes', readOnly: true, claudeMd: true },
          status: { present: true, runs: [] },
          written: { file: '/store/factories/mill.json' },
        });
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const notes = labelOf(canvasElement, '/srv/notes', 'claudeMd');
    if (notes === null) return expect(notes).not.toBeNull();
    await userEvent.click(notes);
    await waitFor(() => expect(switchOf(canvasElement, '/srv/scratch', 'claudeMd')).toBeEnabled());
    await expect(canvasElement.querySelector('[data-volume-refused]')).toBeNull();
  },
};

/** A switch the api refuses, the volume gone meanwhile: its words shown under the form, as an alert, nothing changed. */
export const SwitchRefused: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  parameters: {
    msw: [
      http.patch(VOLUME, () =>
        HttpResponse.json({ error: 'mill holds no volume named notes: its volumes are scratch (/srv/scratch).' }, { status: 404 }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const skills = labelOf(canvasElement, '/srv/notes', 'skills');
    if (skills === null) return expect(skills).not.toBeNull();
    await userEvent.click(skills);
    await waitFor(() => expect(canvasElement.querySelector('[data-volume-refused]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-volume-refused]')).toHaveTextContent('Not changed');
  },
};

/** A path typed, read only picked, and Add: the api is sent the path with its mark, and nothing is refused. */
export const Added: Story = {
  parameters: {
    msw: [
      http.post(VOLUMES, async ({ request }) => {
        const { volume } = (await request.json()) as { volume: string };
        await expect(volume).toBe('/srv/notes:ro');
        return HttpResponse.json({
          file: '/store/factories/mill.json',
          volume: { name: 'notes', path: '/srv/notes', readOnly: true },
          was: null,
          trusts: [],
        });
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(page.getByRole('textbox', { name: 'Path or git URL' }), '/srv/notes');
    await userEvent.click(page.getByText('Read only (:ro)'));
    await userEvent.click(page.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Add' })).toBeEnabled());
    await expect(canvasElement.querySelector('[data-volume-refused]')).toBeNull();
  },
};

/** A volume the api refuses: its words shown under the form, as an alert. */
export const Refused: Story = {
  parameters: {
    msw: [
      http.post(VOLUMES, () =>
        HttpResponse.json({ error: '/srv/scratch is in no git repository: give a repository, or mark it :ro.' }, { status: 422 }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(page.getByRole('textbox', { name: 'Path or git URL' }), '/srv/scratch');
    await userEvent.click(page.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-volume-refused]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-volume-refused]')).toHaveTextContent('in no git repository');
  },
};

/** Remove pressed on a volume, its removal still out: that row's Remove pending, every write held, its switches among them. */
export const Removing: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  parameters: { msw: [http.delete(VOLUMES, async () => delay('infinite'))] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Remove /srv/notes' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Remove /srv/scratch' })).toBeDisabled());
    await expect(switchOf(canvasElement, '/srv/scratch', 'skills')).toBeDisabled();
  },
};
