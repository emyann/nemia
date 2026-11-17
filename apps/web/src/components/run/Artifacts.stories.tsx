import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { StepArtifact } from '@/lib/api/tries';
import { Artifacts } from './Artifacts';

/** Where the api serves a file of the implement step's files directory: its path under it encoded whole, as the closeout's `url` says. */
const servedAt = (rel: string) => `/api/runs/r-k2rq/steps/implement/artifacts/${encodeURIComponent(rel)}`;

/** The picture the api answers for the nested file: a bar on a dark ground, in the default paint alone, as a stand-in for a photo. */
const PICTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill-opacity="0.85"/><rect x="24" y="300" width="432" height="36" fill-opacity="0.3"/></svg>';

/** A file of the step's files directory, served: at its top, or in a folder beneath it, by its path. */
const served = (rel: string, kind: 'image' | 'text' | 'other', size: number): StepArtifact => ({
  path: `/wf/runs/r-k2rq/artifacts/implement/${rel}`,
  relativePath: rel,
  name: rel,
  url: servedAt(rel),
  kind,
  size,
});

/** The files of a step: what its closeout named or its folder holds, each a picture, a chip or a path. */
const meta: Meta<typeof Artifacts> = {
  title: 'Run/Artifacts',
  component: Artifacts,
  args: { artifacts: [], step: null },
  render: (args) => (
    <div style={{ width: 640, padding: 16 }}>
      <Artifacts {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof Artifacts>;

/**
 * A picture the e2e wrote in a folder of the step's files directory, `e2e/`, beside a file at its top: each served, the picture shown and
 * captioned by its path, opened by its url, as one at the top is.
 */
export const NestedPicture: Story = {
  args: {
    artifacts: [
      served('e2e/bar-sheet-narrow-dark.png', 'image', 2140),
      served('stories.json', 'text', 512),
      { path: 'RESPONSE.md', relativePath: 'RESPONSE.md' },
    ],
  },
  parameters: {
    msw: [
      http.get('/api/runs/r-k2rq/steps/implement/artifacts/:file', ({ params }) =>
        decodeURIComponent(String(params.file)) === 'e2e/bar-sheet-narrow-dark.png'
          ? new HttpResponse(PICTURE, { headers: { 'content-type': 'image/svg+xml' } })
          : new HttpResponse(null, { status: 404 }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const files = within(canvasElement);
    const picture = canvasElement.querySelector<HTMLImageElement>('[data-artifact="image"] img');
    await expect(picture, 'the nested picture is drawn as a thumbnail').not.toBeNull();
    if (picture === null) return;
    await expect(picture).toHaveAttribute('src', servedAt('e2e/bar-sheet-narrow-dark.png'));
    await waitFor(() => expect(picture.naturalWidth, 'the api served the nested picture, and it drew').toBeGreaterThan(0));
    await expect(files.getByText('e2e/bar-sheet-narrow-dark.png'), 'captioned by its path').toBeVisible();
    await expect(files.getByRole('link', { name: /e2e\/bar-sheet-narrow-dark\.png/ })).toHaveAttribute(
      'href',
      servedAt('e2e/bar-sheet-narrow-dark.png'),
    );
    await expect(files.getByRole('link', { name: /stories\.json/ })).toHaveAttribute('href', servedAt('stories.json'));
    await expect(files.getByText('RESPONSE.md')).toBeVisible();
  },
};

/**
 * The files that are no picture, of a step named, each the kit's assist chip: a link to its viewer's sheet by the address, its size
 * where it is no text, and a name longer than the room cut, whole in its title. A press opens the sheet over the page, the router's move.
 */
export const OpensTheViewer: Story = {
  args: {
    step: 'implement',
    artifacts: [
      served('stories.json', 'text', 512),
      served('trace.zip', 'other', 2_400_000),
      served('e2e/stories/a-closeout-that-names-a-file-whose-path-is-longer-than-its-row.log', 'text', 9000),
    ],
  },
  render: (args) => (
    <div style={{ width: 360, padding: 16 }}>
      <Artifacts {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const files = within(canvasElement);
    const chip = files.getByRole('link', { name: /stories\.json/ });
    await expect(chip).toHaveAttribute('data-slot', 'chip');
    await expect(chip).toHaveAttribute('href', '/?view=implement%2Fstories.json');
    await expect(files.getByRole('link', { name: /trace\.zip · 2\.3 MB/ }), 'a file that is no text says its size').toBeVisible();
    const long = files.getByRole('link', { name: /longer-than-its-row/ });
    await expect(long.getBoundingClientRect().width, 'a long name is cut to the room it has').toBeLessThanOrEqual(328);
    await userEvent.click(chip);
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at')).toBe('/?view=implement%2Fstories.json'),
    );
  },
};
