import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Version } from '@/lib/api/version';
import { versionQuery } from '@/lib/api/version';
import { NewerRelease } from './NewerRelease';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The api's version, `latest` the newest release the daemon read, newer than the one it runs or not. */
const version = (latest: string, newer: boolean) =>
  ({
    version: '1.35.0',
    release: { kind: 'install', root: '/opt/nemia', tag: 'v1.35.0' },
    latest: { version: latest, newer },
  }) satisfies Version;

/** The line over every page that a newer release of Nemia is out, a link to Settings. */
const meta: Meta<{ latest: string; newer: boolean }> = {
  title: 'Frame/NewerRelease',
  args: { latest: '1.36.0', newer: true },
  render: ({ latest, newer }) => (
    <QueryClientProvider client={seeded([[versionQuery.queryKey, version(latest, newer)]])}>
      <div style={{ width: 640 }}>
        <NewerRelease />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

/** A newer release is out: the line, and its link to Settings. */
export const Newer: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-newer-release="1.36.0"] a[href="/settings"]')).not.toBeNull();
  },
};
