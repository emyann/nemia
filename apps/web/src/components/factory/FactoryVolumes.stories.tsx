import type { Meta, StoryObj } from '@storybook/react-vite';
import { delay, http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FactoryVolumes } from './FactoryVolumes';
import { factoryView, FACTORY } from '../../../.storybook/fixtures/proposals';
import { volumes } from '../../../.storybook/fixtures/factories';
import { settled } from '../../../.storybook/play';

const VOLUMES = '/api/factories/:factory/volumes';

/**
 * A factory's volumes on its settings page, one story a state: none, with the line that gives one; two, the writable one worked on; a
 * volume given through the form, refused, and one being removed.
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

/** A read-only folder and a writable one, which is worked on; each with its Remove. */
export const Two: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-factory-volume]').length).toBe(2);
    await expect(canvasElement.querySelector('[data-volume-role="worked-on"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('[data-volume-remove]').length).toBe(2);
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
    await settled(canvasElement);
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
    await settled(canvasElement);
  },
};

/** Remove pressed on a volume, its removal still out: that row's Remove pending, every write held. */
export const Removing: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  parameters: { msw: [http.delete(VOLUMES, async () => delay('infinite'))] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Remove /srv/notes' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Remove /srv/scratch' })).toBeDisabled());
    await settled(canvasElement);
  },
};
