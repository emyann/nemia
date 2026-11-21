import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { Factory } from '@/lib/api/factories';
import { ACME_COMMANDS } from '../../../.storybook/fixtures/folders';
import { settled } from '../../../.storybook/play';
import { FactoryTrust } from './FactoryTrust';

/** The lines a person types for `acme`, as the api answers them. */
const { attach, rm, add, schedule, trust, volume, trigger } = ACME_COMMANDS;

/** A factory one of whose places a harness does not trust: its name, the place, and the lines it types. */
const UNTRUSTED: Pick<Factory, 'name' | 'untrusted' | 'commands'> = {
  name: 'acme',
  untrusted: [
    { place: '/home/you/code/acme', harness: 'the harness', withheld: "the folder's own settings, hooks and MCP servers", never: null },
  ],
  commands: { attach, rm, add, schedule, trust, volume, trigger, home: null },
};

/** What a story of the caution draws: the factory, and the presses where the page asks the trust itself. */
type Args = { onTrust?: () => void; onLater?: () => void; trusting?: boolean };

/** The caution on a factory whose place a harness does not trust: the place, what is withheld, and the line that trusts it. */
const meta: Meta<Args> = {
  title: 'Factory/Factory trust',
  args: { trusting: false },
  render: (args) => (
    <div style={{ width: 560 }}>
      <FactoryTrust factory={UNTRUSTED} {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** As Settings draws it: the caution and the line to type, no press. */
export const Caution: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-untrusted-place="/home/you/code/acme"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-trust-presses]')).toBeNull();
  },
};

/** As the volume step asks it: Trust and Not now under the caution, each told when pressed. */
export const Asked: Story = {
  args: { onTrust: fn(), onLater: fn() },
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Trust' }));
    await expect(args.onTrust).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Not now' }));
    await expect(args.onLater).toHaveBeenCalledOnce();
    await settled(canvasElement);
  },
};

/** The trust being given: both presses held. */
export const Trusting: Story = {
  args: { onTrust: fn(), onLater: fn(), trusting: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Not now' })).toBeDisabled();
  },
};
