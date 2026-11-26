import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Program } from 'objects';
import { factoryProgramsQuery } from '@/lib/api/factories';
import { FactoryPrograms } from './FactoryPrograms';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';

/** A program of the factory named `name`, writing `writes`, its status as given. */
const program = (name: string, writes: string[], status: Program['status']) =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Program',
    metadata: { name, namespace: FACTORY, creationTimestamp: '2026-11-19T00:00:00.000Z', resourceVersion: 'v1' },
    spec: { run: 'node $WF_CARRIED_FILES/writer.ts', writes },
    status,
  }) satisfies Program;

/** `children` over a query client that holds `items` as the factory's programs, asking the network nothing. */
function Served({ items, children }: { items: readonly Program[]; children: ReactNode }) {
  const [client] = useState(() => seeded([[factoryProgramsQuery(FACTORY).queryKey, items]]));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A factory's programs on its settings page, a story a state: one running, one down with what to type, and a factory with none. */
const meta: Meta<typeof FactoryPrograms> = {
  title: 'Factory/FactoryPrograms',
  component: FactoryPrograms,
  args: { name: FACTORY },
};
export default meta;

type Story = StoryObj<typeof meta>;

/** `items` served as the factory's programs, in the settings page's width. */
const served = (items: readonly Program[]) =>
  function ServedPrograms(args: Parameters<typeof FactoryPrograms>[0]) {
    return (
      <Served items={items}>
        <div style={{ width: 640 }}>
          <FactoryPrograms {...args} />
        </div>
      </Served>
    );
  } satisfies Story['render'];

/** A program that runs, started again once, beside one the runtime settled, which says what to type. */
export const RunningAndDown: Story = {
  render: served([
    program('ci-writer', ['ci'], { phase: 'Running', restarts: 1, since: '2026-11-26T12:00:00.000Z' }),
    program('deploy-writer', ['deployed'], {
      phase: 'Down',
      restarts: 0,
      since: '2026-11-26T12:30:00.000Z',
      message:
        'The program task program-mill-deploy-writer is down and the runtime will not restart it: change its `run:` and apply the template again.',
    }),
  ]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-factory-program="ci-writer"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-factory-program="deploy-writer"] [data-program-fix]')).not.toBeNull();
  },
};

/** No program: nothing is drawn. */
export const None: Story = {
  render: served([]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-factory-programs]')).toBeNull();
  },
};
