import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Run } from 'objects';
import { expect, screen, waitFor, within } from 'storybook/test';
import { runLinesQuery, runObjectQuery, stepToldQuery, stepTriesQuery } from '@/lib/api/run';
import { stepFileQuery } from '@/lib/api/steps';
import { barValue } from '@/lib/bar';
import { stepStamp } from '@/lib/lifecyclePath';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { linesOf, onTheFloor } from '../../../.storybook/fixtures/runs';
import { TextFile, ViewerSheet } from './ViewerSheet';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The run whose step's files the sheet shows: the first on the floor, its first step holding two files. */
const FLOOR_RUN = onTheFloor.items[0];

/** The step whose files are viewed. */
const STEP = FLOOR_RUN.status.steps[0];

/** Where the api serves a file of the step's folder. */
const servedAt = (rel: string) => `/api/runs/${FLOOR_RUN.metadata.name}/steps/${STEP.name}/files/${encodeURIComponent(rel)}`;

/** A text file of the step's folder, served. */
const served = (rel: string, size: number) => ({
  path: `/wf/runs/${FLOOR_RUN.metadata.name}/${STEP.name}/${rel}`,
  relativePath: rel,
  name: rel,
  url: servedAt(rel),
  kind: 'text',
  size,
});

/** The step's notes and its findings. */
const FILES = [served('notes.md', 812), served('findings.json', 214)];

/** The run, its step holding the two files. */
const RUN: Run = { ...FLOOR_RUN, status: { ...FLOOR_RUN.status, steps: [{ ...STEP, files: FILES }] } };

/** The notes, as the file holds them. */
const NOTES = '# Notes\n\nThe sheet draws with the kit: its **side sheet**, its title and its close.';

/** The sheet over a page's room, the run's reads and the notes seeded, open on `path` of the step. */
const meta: Meta<typeof ViewerSheet> = {
  title: 'Run/ViewerSheet',
  component: ViewerSheet,
  args: {},
  parameters: { at: `/?bar=${barValue({ kind: 'run', run: RUN.metadata.name })}&view=${STEP.name}/notes.md` },
  render: () => (
    <QueryClientProvider
      client={seeded([
        [runObjectQuery(RUN.metadata.name).queryKey, RUN],
        [runLinesQuery(RUN.metadata.name).queryKey, linesOf(RUN.metadata.name)],
        [stepTriesQuery(RUN.metadata.name, STEP.name, stepStamp(STEP)).queryKey, []],
        [stepToldQuery(RUN.metadata.name, STEP.name, stepStamp(STEP)).queryKey, null],
        [stepFileQuery(servedAt('notes.md')).queryKey, NOTES],
      ])}
    >
      <div style={{ height: 640 }}>
        <ViewerSheet />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof ViewerSheet>;

/** A markdown file, the first of two: the kit's modal side sheet titled by its path, Next to the other, and the notes drawn. */
export const Markdown: Story = {
  play: async () => {
    const sheet = await screen.findByRole('dialog', { name: 'notes.md' });
    await expect(sheet).toHaveAttribute('data-slot', 'side-sheet');
    await waitFor(() => expect(within(sheet).getByText(`${STEP.name} · 812 B · file 1 of 2`, { exact: false })).toBeVisible());
    await expect(sheet.querySelector('[data-viewer="markdown"]')).not.toBeNull();
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Close' })).toBeVisible());
  },
};

/** A path the step has no file at: said in place of the file. */
export const Missing: Story = {
  parameters: { at: `/?bar=${barValue({ kind: 'run', run: RUN.metadata.name })}&view=${STEP.name}/gone.txt` },
  play: async () => {
    const sheet = await screen.findByRole('dialog', { name: 'gone.txt' });
    await expect(sheet.querySelector('[data-viewer="missing"]')).not.toBeNull();
  },
};

/** The run still read: the sheet over the page, the shape of the file's lines while it waits. */
export const ReadingTheRun: Story = {
  parameters: { at: '/?bar=run:r-1&view=design/plan.md' },
  render: () => (
    <Unread>
      <p className="text-body-medium">The run's page, under the sheet.</p>
      <ViewerSheet />
    </Unread>
  ),
  play: saysReading('Reading the run…'),
};

/** The run read and the file opened, its text still read. */
export const ReadingTheFile: Story = {
  render: () => (
    <Unread>
      <div style={{ width: 640 }}>
        <TextFile
          viewer="markdown"
          file={{
            path: '/wf/runs/r-1/artifacts/design/plan.md',
            relativePath: 'plan.md',
            name: 'plan.md',
            url: '/api/runs/r-1/steps/design/artifacts/plan.md',
            kind: 'text',
            size: 2_048,
          }}
        />
      </div>
    </Unread>
  ),
  play: saysReading('Reading plan.md…'),
};
