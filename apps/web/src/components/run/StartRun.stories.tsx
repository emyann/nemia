import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FILE_LIMIT } from 'objects';
import type { WorkflowListing } from '@/lib/api/workflows';
import { StartRun } from './StartRun';
import { noRuns } from '../../../.storybook/fixtures/runs';

/** A file named `name` of `size` bytes, as a browser hands one; its size set, so a story lists a large one without holding it. */
const fileOf = (name: string, size: number, type = 'image/png'): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/** A workflow whose every step works in a folder, so the form draws no runs to wait on. */
const NOTE: WorkflowListing = {
  name: 'note',
  from: 'user',
  dir: '/home/me/teams/note',
  description: null,
  readme: null,
  steps: [],
  graph: { roots: [], edges: [] },
  schemas: [],
  folderTeam: true,
  version: '0',
  error: null,
  unfilled: null,
};

/**
 * The start of a run of a workflow: a brief, the files it is handed, the runs it reads as context, and Start, which a file past the
 * files api's limit keeps from starting. Its read of the runs is answered by MSW with none.
 */
const meta: Meta<typeof StartRun> = {
  title: 'Run/StartRun',
  component: StartRun,
  args: { workflow: NOTE },
  parameters: { msw: noRuns },
  render: (args) => (
    <div style={{ width: 640 }}>
      <StartRun {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof StartRun>;

/** What of the user a play function is handed the pick uses: typing and a file input's upload. */
type User = { type: (element: Element, text: string) => Promise<void>; upload: (element: HTMLElement, files: File[]) => Promise<void> };

/**
 * `files` handed to the form's file trigger as a person picks them, after a brief is typed.
 * @param canvas The story's canvas.
 * @param user The user the play function is handed.
 * @param files The files picked.
 */
const briefAndPick = async (canvas: HTMLElement, user: User, files: File[]) => {
  await user.type(within(canvas).getByRole('textbox'), 'Draw the tides.');
  await user.upload(canvas.querySelector<HTMLInputElement>('input[type="file"]')!, files);
};

/** A brief and a file within the limit: Start may be pressed. */
export const Ready: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await briefAndPick(canvasElement, userEvent, [fileOf('tides.png', 412_331)]);
    await expect(canvasElement.querySelector('[data-start-input="tides.png"]')).not.toBeNull();
    await expect(within(canvasElement).getByRole('button', { name: 'Start' })).toBeEnabled();
  },
};

/** A file past the files api's limit listed beside one within it: Start is refused before anything is sent. */
export const PastLimit: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await briefAndPick(canvasElement, userEvent, [
      fileOf('tides.png', 412_331),
      fileOf('screen-recording.mov', Number(FILE_LIMIT) + 1_048_576, 'video/quicktime'),
    ]);
    await expect(canvasElement.querySelector('[data-start-input="screen-recording.mov"]')).toHaveAttribute('data-past-limit', 'true');
    await expect(within(canvasElement).getByRole('button', { name: 'Start' })).toBeDisabled();
  },
};
