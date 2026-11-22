import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { StepArtifact } from '@/lib/api/tries';
import { FolderTree } from './FolderTree';

/** Where the api serves a file of the implement step's folder: its path under it encoded whole, as the listing's `url` says. */
const servedAt = (rel: string) => `/api/runs/r-k2rq/steps/implement/artifacts/${encodeURIComponent(rel)}`;

/** The picture the api answers for each picture of the folder: a bar on a dark ground, as a stand-in for a photo. */
const PICTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill-opacity="0.85"/><rect x="24" y="300" width="432" height="36" fill-opacity="0.3"/></svg>';

/** A file of the step's folder, served: at its top, or in a folder beneath it, by its path. */
const served = (rel: string, kind: 'image' | 'text' | 'other', size: number) => ({
  path: `/wf/runs/r-k2rq/artifacts/implement/${rel}`,
  relativePath: rel,
  name: rel,
  url: servedAt(rel),
  kind,
  size,
});

/** What an implement step leaves in its folder: its stories' pictures in one folder, the e2e's in another, two files at the top. */
const FOLDER: StepArtifact[] = [
  served('stories/after-run-folder-tree--folded-dark.png', 'image', 48_210),
  served('stories/before-run-folder-tree--folded-dark.png', 'image', 47_002),
  served('stories/stories.json', 'text', 912),
  served('e2e/folder-dark.png', 'image', 120_400),
  served('e2e/pages/run-light.png', 'image', 98_311),
  served('summary.md', 'text', 2_048),
  served('trace.zip', 'other', 3_400_000),
];

const pictures = [
  http.get(
    '/api/runs/r-k2rq/steps/implement/artifacts/:file',
    () => new HttpResponse(PICTURE, { headers: { 'content-type': 'image/svg+xml' } }),
  ),
];

/** A step's whole folder of files, by folder: each folder folds, a picture's row draws it small, a press on a file opens it. */
const meta: Meta<typeof FolderTree> = {
  tags: ['network'],
  title: 'Run/FolderTree',
  component: FolderTree,
  args: { files: FOLDER, step: 'implement' },
  parameters: { msw: pictures },
  render: (args) => (
    <div style={{ width: 560, padding: 16 }}>
      <FolderTree {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof FolderTree>;

/** As the page first draws it: every folder folded, with how many files it holds; the files at the top, each with its size. */
export const Folded: Story = {
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement);
    await expect(tree.getByRole('treegrid', { name: 'Files in its folder' })).toBeVisible();
    await expect(tree.getByRole('row', { name: 'stories' })).toHaveAttribute('aria-expanded', 'false');
    await expect(tree.getByText('3 files')).toBeVisible();
    await expect(tree.getByText('e2e/')).toBeVisible();
    await expect(tree.queryByText('stories.json'), 'a folded folder draws nothing it holds').toBeNull();
    await expect(tree.getByText('summary.md')).toBeVisible();
    await expect(tree.getByText('· 3.2 MB')).toBeVisible();
  },
};

/** A folder opened by a press on its row, and a folder inside another: a picture's row draws the picture, small. */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement);
    await userEvent.click(tree.getByRole('row', { name: 'e2e' }));
    await expect(tree.getByRole('row', { name: 'e2e' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(tree.getByRole('row', { name: 'pages' }));
    await expect(tree.getByText('run-light.png')).toBeVisible();
    const preview = canvasElement.querySelector<HTMLImageElement>('[data-opens-view="e2e/pages/run-light.png"] img[data-file-preview]');
    await expect(preview, "the picture's row previews it").not.toBeNull();
    if (preview === null) return;
    await waitFor(() => expect(preview.naturalWidth, 'the api served the picture, and it drew').toBeGreaterThan(0));
  },
};

/** A second press on an opened folder's row folds it again, and what it holds is drawn no more. */
export const FoldsAgain: Story = {
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement);
    await userEvent.click(tree.getByRole('row', { name: 'e2e' }));
    await expect(tree.getByText('folder-dark.png')).toBeVisible();
    await userEvent.click(tree.getByRole('row', { name: 'e2e' }));
    await expect(tree.getByRole('row', { name: 'e2e' })).toHaveAttribute('aria-expanded', 'false');
    await expect(tree.queryByText('folder-dark.png'), 'a second press folds it again').toBeNull();
  },
};

/** A press on a picture's row opens it in its step's viewer, by the address. */
export const OpensTheViewer: Story = {
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement);
    await userEvent.click(tree.getByRole('row', { name: 'e2e' }));
    await userEvent.click(tree.getByRole('row', { name: 'Open e2e/folder-dark.png' }));
    const ground = canvasElement.closest('[data-story-ground]') ?? canvasElement.querySelector('[data-story-ground]');
    await waitFor(() => expect(decodeURIComponent(ground?.getAttribute('data-at') ?? '')).toContain('view=implement/e2e/folder-dark.png'));
  },
};

/** An agent's try, which has no step's viewer: each served file is a link to the file itself, in a new tab. */
export const TryLinks: Story = {
  args: { step: null, label: 'Files it wrote', files: [served('notes.md', 'text', 120), served('drafts/one.md', 'text', 64)] },
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement);
    const note = tree.getByRole('row', { name: 'Open notes.md' });
    await expect(note).toHaveAttribute('data-href', servedAt('notes.md'));
  },
};

/** A file a prune removed is its name, muted, and when it went; one the api does not serve is its name alone. */
export const PrunedAndUnserved: Story = {
  args: {
    files: [
      {
        path: '/wf/runs/r-k2rq/artifacts/implement/shot.png',
        relativePath: 'shot.png',
        pruned: 'removed',
        prunedAt: '2026-11-12T09:30:00Z',
      },
      { path: 'RESPONSE.md', relativePath: 'RESPONSE.md' },
    ],
  },
  play: async ({ canvasElement }) => {
    const tree = within(canvasElement);
    await expect(tree.getByText(/by a prune of its files/)).toBeVisible();
    await expect(tree.getByText('RESPONSE.md')).toBeVisible();
  },
};

/** A folder that holds nothing says so. */
export const Empty: Story = {
  args: { files: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('the folder is empty')).toBeVisible();
  },
};
