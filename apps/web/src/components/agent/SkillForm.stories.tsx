import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SkillForm } from './SkillForm';
import { skillDetail } from '../../../.storybook/fixtures/agents';

/** A skill's form: one of yours to write, the same read-only, and a new one. */
const meta: Meta<typeof SkillForm> = {
  title: 'Store/SkillForm',
  component: SkillForm,
  args: { detail: skillDetail, saving: false, refusal: null, onSave: fn() },
};
export default meta;

type Story = StoryObj<typeof SkillForm>;

/** Yours: a change offers Save and Discard changes. */
export const Yours: Story = {
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(form.getByRole('textbox', { name: 'Description' }), ' Always.');
    await expect(form.getByRole('button', { name: 'Save' })).toBeEnabled();
    await expect(form.getByRole('button', { name: 'Discard changes' })).toBeVisible();
  },
};

/** Read-only: no Save. */
export const ReadOnly: Story = { args: { readOnly: true } };

/** A new skill. */
export const New: Story = { args: { detail: null } };
