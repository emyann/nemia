import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { FILE_LIMIT } from 'objects';
import { StartInputs } from './StartInputs';

/** A file named `name` of `size` bytes, as a browser hands one; its size set, so a story lists a large one without holding it. */
const fileOf = (name: string, size: number, type = 'image/png') => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/** The files a start hands its run: dropped or picked, each listed by name and size, the files api's limit said before any is sent. */
const meta: Meta<typeof StartInputs> = {
  title: 'Run/StartInputs',
  component: StartInputs,
  args: {
    files: [fileOf('runs-page-dark.png', 412_331), fileOf('target-run-runsnow--waiting-light.png', 1_802_240)],
    onChange: fn(),
  },
  render: (args) => (
    <div style={{ width: 560, padding: 16 }}>
      <StartInputs {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof StartInputs>;

/** Two files listed, each with its size; removing one tells the form the other alone. */
export const Listed: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const zone = within(canvasElement);
    await expect(zone.getByText(/Each file up to 64 MiB, kept a day/)).toBeVisible();
    await expect(zone.getByText('402.67 KiB')).toBeVisible();
    await userEvent.click(zone.getByRole('button', { name: 'Remove runs-page-dark.png' }));
    await expect(args.onChange).toHaveBeenCalledWith([args.files[1]]);
  },
};

/** A file past the files api's limit, marked in failure's ink with its size beside the cap, before anything is sent. */
export const PastLimit: Story = {
  args: { files: [fileOf('screen-recording.mov', Number(FILE_LIMIT) + 1_048_576, 'video/quicktime')] },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-start-input="screen-recording.mov"]');
    await expect(row).toHaveAttribute('data-past-limit', 'true');
    await expect(within(canvasElement).getByText('65 MiB, past the 64 MiB a file may be')).toBeVisible();
  },
};

/** The start uploading three files, one after another: the first sent, the second on its way, the third waiting; nothing removable. */
export const Uploading: Story = {
  args: {
    files: [fileOf('a.png', 2048), fileOf('b.png', 3_145_728), fileOf('notes.md', 812, 'text/markdown')],
    sent: 1,
    uploading: true,
    isDisabled: true,
  },
  play: async ({ canvasElement }) => {
    const marks = [...canvasElement.querySelectorAll('[data-start-input]')].map((row) => row.getAttribute('data-upload'));
    await expect(marks).toEqual(['sent', 'uploading', 'waiting']);
    await expect(within(canvasElement).getByRole('button', { name: 'Remove a.png' })).toBeDisabled();
  },
};
