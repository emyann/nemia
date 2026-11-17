import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { API_VERSION, type Card } from 'objects';
import { SnackbarRegion } from '@/components/ui/ds';
import { factoriesQuery } from '../../lib/api/factories.ts';
import { FileCard } from './FileCard';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { snackbarShown } from '../../../.storybook/play';
import { saysReading, Unread } from '../../../.storybook/unread';

/**
 * The box that files a card: here while the factories it lists are read, the shape of its line under the list; and, filed, the
 * frame's snackbar that names the card and offers Open, to its page. Axe's
 * `label-content-name-mismatch` alone is off, for the Factory list: the ds kit's `Select` draws its value before its floating label and
 * is named by the label first, which axe reads as visible text left out of its name, an ask of the kit.
 */
const meta: Meta<typeof FileCard> = {
  title: 'Store/FileCard',
  component: FileCard,
  args: { shown: 'solo' },
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FileCard {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The factories still read. */
export const ReadingTheFactories: StoryObj<typeof meta> = {
  play: saysReading('Reading the factories…'),
};

/** The card the api answers a filing with: filed in `default`, not started. */
const FILED: Card = {
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: { name: 'write-the-release-notes', namespace: 'default', creationTimestamp: new Date(0).toISOString(), resourceVersion: '1' },
  spec: { body: 'Write the release notes' },
  status: { state: 'filed', runs: [], inPlay: true, title: 'Write the release notes', file: 'write-the-release-notes.md' },
};

/** Filed with no factory: the snackbar the frame hosts names the card, and its Open goes to the card's page. */
export const Filed: StoryObj<typeof meta> = {
  args: { shown: undefined },
  parameters: { msw: [http.post('/api/namespaces/:namespace/cards', () => HttpResponse.json(FILED, { status: 201 }))] },
  render: (args) => (
    <QueryClientProvider client={seeded([[factoriesQuery.queryKey, []]])}>
      <div style={{ width: 640, minHeight: 360 }}>
        <FileCard {...args} />
      </div>
      <SnackbarRegion />
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const box = within(canvasElement);
    await userEvent.type(box.getByRole('textbox', { name: 'An idea' }), 'Write the release notes');
    await userEvent.click(box.getByRole('button', { name: 'File' }));
    const said = await snackbarShown(canvasElement.ownerDocument.body);
    await expect(said).toHaveTextContent(FILED.metadata.name);
    await userEvent.click(within(said).getByRole('button', { name: 'Open' }));
    const ground = canvasElement.querySelector('[data-story-ground]');
    await waitFor(() => expect(ground?.getAttribute('data-at')).toBe(`/inbox/${FILED.metadata.name}`));
  },
};
