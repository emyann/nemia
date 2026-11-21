import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { Template } from 'objects';
import { SDLC } from '../../../.storybook/fixtures/templates';
import { parameterReadsOf, startWordOf } from '@/lib/templateParameters';
import { TemplateParameters } from './TemplateParameters';

/** What a story of the fields draws: the template, each field's value by name, where a change goes, and whether they take input. */
type Args = {
  template: Template;
  values: Readonly<Record<string, string>>;
  onChange: (name: string, value: string) => void;
  isDisabled: boolean;
};

/** sdlc's fixture parameters, each at the value its field starts at. */
const STARTED = Object.fromEntries(parameterReadsOf(SDLC.spec.parameters).map((read) => [read.name, startWordOf(read)]));

/**
 * A template's parameters as the welcome draws them: the asked ones open, the rest under More parameters, the one a volume sets
 * nowhere. The values are the form's: here they are given, and each change is told to `onChange`.
 */
const meta: Meta<Args> = {
  title: 'Pages/Template parameters',
  args: { template: SDLC, values: STARTED, onChange: fn(), isDisabled: false },
  render: (args) => (
    <div style={{ width: 560 }}>
      <TemplateParameters {...args} reads={parameterReadsOf(args.template.spec.parameters)} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** At their defaults: the asked label open and empty, the rest folded, and a key typed told by the parameter's name. */
export const Defaults: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const fields = within(canvasElement);
    await expect(canvasElement.querySelector('[data-template-param="github"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-template-param="ciCheck"]')).toBeNull();
    await userEvent.type(fields.getByRole('textbox', { name: 'frontDoorLabel' }), 'r');
    await expect(args.onChange).toHaveBeenLastCalledWith('frontDoorLabel', 'r');
  },
};

/** More parameters opened: the folded fields at their defaults, a switch turned off told as `false`. */
export const MoreOpen: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const fields = within(canvasElement);
    await userEvent.click(fields.getByRole('button', { name: 'More parameters' }));
    await expect(fields.getByRole('textbox', { name: 'ciCheck' })).toHaveValue('ci');
    await userEvent.click(fields.getByRole('switch', { name: /landingWaitsOnCi/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith('landingWaitsOnCi', 'false');
  },
};

/** While the apply is out: every field takes no input. */
export const Disabled: Story = {
  args: { isDisabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'frontDoorLabel' })).toBeDisabled();
  },
};
