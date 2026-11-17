import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, waitFor, within } from 'storybook/test';
import { FILE_LIMIT, type FileObject, type RunStart } from 'objects';
import type { WorkflowListing } from '@/lib/api/workflows';
import { StartRun } from './StartRun';
import { noRuns } from '../../../.storybook/fixtures/runs';
import { saysReading, Unread } from '../../../.storybook/unread';

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

/** What the api was sent while a story ran: how many files were uploaded, and the file ids each start named. */
const SENT = { uploads: 0, starts: [] as string[][] };

/** The id the api answers the `n`th upload with, as a file id is: `file_` and 32 hex characters. */
const idOf = (n: number): string => `file_${String(n).padStart(32, '0')}`;

/**
 * The api of a start whose file the api no longer keeps: each upload kept under an id of its own, the first start refused 422 naming the
 * id it was sent, as the api refuses a file kept no more, and any later start refused 409, naming none.
 */
const keepsNoMore = [
  ...noRuns,
  http.post('/api/namespaces/default/files', () => {
    SENT.uploads += 1;
    const kept: FileObject = {
      id: idOf(SENT.uploads),
      name: 'tides.png',
      mediaType: 'image/png',
      size: 1,
      createdAt: '2026-11-16T10:00:00.000Z',
    };
    return HttpResponse.json(kept, { status: 201 });
  }),
  http.post('/api/namespaces/default/runs', async ({ request }) => {
    const ids = ((await request.json()) as RunStart).inputs?.flatMap((input) => (input.file === undefined ? [] : [input.file])) ?? [];
    SENT.starts.push(ids);
    return SENT.starts.length === 1
      ? HttpResponse.json({ error: `the input tides.png names the file ${ids[0]}, and default keeps no file by that id` }, { status: 422 })
      : HttpResponse.json({ error: 'refused again, naming no file' }, { status: 409 });
  }),
];

/**
 * A start refused 422 for a file the api keeps no more: the form forgets that file's id, so pressing Start again uploads it again and
 * names it by its fresh id.
 */
export const UploadsAgain: Story = {
  parameters: { msw: keepsNoMore },
  play: async ({ canvasElement, userEvent }) => {
    SENT.uploads = 0;
    SENT.starts = [];
    await briefAndPick(canvasElement, userEvent, [fileOf('tides.png', 412_331)]);
    const start = within(canvasElement).getByRole('button', { name: 'Start' });
    await userEvent.click(start);
    await waitFor(() => expect(canvasElement.querySelector('[data-refused]')).not.toBeNull());
    await userEvent.click(start);
    await waitFor(() => expect(SENT.starts).toHaveLength(2));
    await expect(SENT.uploads).toBe(2);
    await expect(SENT.starts).toEqual([[idOf(1)], [idOf(2)]]);
  },
};

/** A workflow that works in a repository, so the form draws the runs it may wait on. */
const BUILD: WorkflowListing = { ...NOTE, name: 'build', from: 'repo', dir: '/code/app/flow', folderTeam: false };

/** The runs it may wait on still read: the shape of their list. */
export const ReadingTheRuns: Story = {
  args: { workflow: BUILD, repo: '/code/app' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <StartRun {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the runs…'),
};
