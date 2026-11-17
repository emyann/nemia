import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { AmountField } from './AmountField';

/**
 * An amount typed in the kit's NumberField, a story a state: dollars, empty, a count, closed. Beside the field, what its form last
 * heard (`data-heard`), so a play proves the form hears each keystroke, before the field commits on blur or Enter.
 */
const meta: Meta<typeof AmountField> = {
  title: 'Run/AmountField',
  component: AmountField,
  args: { 'aria-label': 'The budget of implement, in dollars', value: 20, kind: 'dollars', className: 'w-36' },
  render: (args) => <Heard {...args} />,
};
export default meta;

type Story = StoryObj<typeof AmountField>;

/** The field, and what its form last heard of it. */
function Heard(args: Parameters<typeof AmountField>[0]) {
  const [heard, setHeard] = useState(args.value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <AmountField {...args} value={heard} onAmount={setHeard} />
      <span data-heard className="font-mono text-body-medium">
        {heard === null ? 'none' : String(heard)}
      </span>
    </div>
  );
}

/** Dollars as the board writes money; each keystroke is heard while the field still has the focus, cents and all. */
export const Dollars: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = page.getByRole('textbox', { name: 'The budget of implement, in dollars' });
    const heard = () => canvasElement.querySelector('[data-heard]')?.textContent;
    await expect(field).toHaveValue('$20.00');
    await userEvent.clear(field);
    await expect(heard()).toBe('none');
    await userEvent.type(field, '1');
    await expect(heard()).toBe('1');
    await userEvent.type(field, '2.');
    await expect(heard()).toBe('12');
    await userEvent.type(field, '5');
    await expect(heard()).toBe('12.5');
    await expect(field).toHaveFocus();
    await expect(field).toHaveValue('12.5');
    atRest();
    await expect(field).toHaveValue('$12.50');
    await expect(heard()).toBe('12.5');
  },
};

/** No amount: the field is empty, and its form hears none. */
export const Empty: Story = {
  args: { value: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox')).toHaveValue('');
    await expect(canvasElement.querySelector('[data-heard]')?.textContent).toBe('none');
  },
};

/** A count, whole: a step's rounds, its label floated, and a decimal point refused as it is typed. */
export const Count: Story = {
  args: { 'aria-label': undefined, label: 'rounds', kind: 'count', value: 3, className: undefined },
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'rounds' });
    await userEvent.type(field, '0');
    await expect(canvasElement.querySelector('[data-heard]')?.textContent).toBe('30');
    await userEvent.type(field, '.');
    await expect(field).toHaveValue('30');
    atRest();
  },
};

/** Closed, as a raise's box is while its check again is chosen. */
export const Closed: Story = {
  args: { isDisabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox')).toBeDisabled();
  },
};
