import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { skillsQuery } from '@/lib/api/skills';
import { AgentForm } from './AgentForm';
import { critic, scribe, skillPlaces } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** An agent's form, the skills it can be given seeded: an agent of yours to write, the repository's read-only, and a new one. */
const meta: Meta<typeof AgentForm> = {
  title: 'Store/AgentForm',
  component: AgentForm,
  args: { listing: scribe, keyForm: undefined, saving: false, refusal: null, onSave: fn() },
  render: (args) => (
    <QueryClientProvider client={seeded([[skillsQuery.queryKey, skillPlaces]])}>
      <AgentForm {...args} />
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof AgentForm>;

/** Yours: every field written, Skill left out of its tools and the note that puts it in, and For experts opening on the last choice. */
export const Yours: Story = {
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    await expect(form.getByRole('textbox', { name: 'Name' })).toHaveValue('scribe');
    await expect(form.getByRole('radio', { name: /^Works on code or files/ })).toBeChecked();
    await userEvent.click(form.getByRole('button', { name: 'For experts' }));
    await expect(form.getByRole('radio', { name: /^Only my instructions/ })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Add Skill to its tools' })).toBeVisible();
  },
};

/** The repository's: read, not written, its instructions drawn as markdown and no Save. */
export const Theirs: Story = {
  args: { listing: critic, readOnly: true },
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    await expect(form.getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly');
    await expect(form.queryByRole('button', { name: 'Save' })).toBeNull();
  },
};

/** A new agent: nothing written yet, Create agent waiting for a change. */
export const New: Story = { args: { listing: null } };

/**
 * Its harness's recorded list: the model is picked from the ids it lists, not typed, and an alias is not among them. Its options are read
 * once the popover has settled from its fade in, which starts at opacity 0.
 */
export const PicksItsModel: Story = {
  args: {
    listing: { ...scribe, keys: { ...scribe.keys, harness: 'local', model: 'old-model' } },
    models: {
      harnesses: [
        {
          harness: 'local',
          at: '2026-11-26T09:00:00.000Z',
          models: [
            { id: 'model-one', aliases: ['a'], name: 'Model one', keepsAuto: true, efforts: null },
            { id: 'model-two', aliases: ['b'], name: 'Model two', keepsAuto: true, efforts: null },
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    await expect(form.queryByRole('textbox', { name: 'Model' })).toBeNull();
    await userEvent.click(form.getByRole('button', { name: /old-model/ }));
    const opened = await within(document.body).findByRole('listbox');
    await waitFor(() => expect(opened.closest('[data-entering]')).toBeNull());
    const listbox = within(opened);
    await expect(listbox.getByRole('option', { name: 'model-one' })).toBeVisible();
    await expect(listbox.getByRole('option', { name: 'model-two' })).toBeVisible();
    await expect(listbox.queryByRole('option', { name: 'b' })).toBeNull();
  },
};
