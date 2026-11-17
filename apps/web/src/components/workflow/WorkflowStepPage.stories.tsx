import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { WorkflowStepPage as StepRead } from 'objects';
import { storeQuery } from '@/lib/api/store';
import { stepQuery } from '@/lib/api/workflows';
import { WorkflowStepPage } from './WorkflowStepPage';
import { yourStore } from '../../../.storybook/fixtures/agents';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';

/** The step `review` of the workflow `build`, read in the stories' factory: the api's answer, as its read decodes it. */
const REVIEW: StepRead = {
  workflow: 'build',
  from: 'repo',
  dir: '/src/shop/flows/build',
  step: 'review',
  body: 'Read the change against its plan, and pass it or ask for another round.',
  source: '---\nagent: reviewer\n---\nRead the change against its plan, and pass it or ask for another round.\n',
  keys: [
    { key: 'agent', value: 'reviewer', meaning: 'what is attached to this node to do its work' },
    { key: 'after', value: 'implement', meaning: 'the steps that must finish first' },
  ],
  agentSkills: null,
  factory: FACTORY,
  layers: {
    agent: 'You review a change.',
    instructions: null,
    custom: null,
    factory: null,
    agentSkills: [],
    policy: 'Read the change against its plan.',
    addedSkills: [],
    fence: [],
    folderFiles: false,
    task: null,
    via: 'prompt',
  },
  hired: null,
  hiredIn: [],
  hiring: { refused: null, agents: [{ name: 'reviewer', description: 'Reads a change, and passes it or asks for another.' }] },
  skillsFrom: [],
  recentRuns: [],
};

/** Where the page is read: the stories' factory, on the repository it names. */
const PLACE = { factory: FACTORY };

/**
 * A workflow's step, read in a factory: its trail in its head (the factory, its workflows, the workflow and the step), its agent, what a
 * run of it will be told, and its file. Its reads are seeded under the keys the page asks them by (`stepQuery`, and `storeQuery` for
 * your workflows' folder), so it asks the network nothing.
 *
 * One of axe's rules is off, `label-content-name-mismatch`, for the hire's picker (`StepHire`): the ds kit's `Select` draws its
 * value before its floating label inside its trigger, while React Aria names the trigger label first, so a populated kit select fails it
 * wherever it is drawn, which is the kit's to mend, upstream. Every other rule holds the page.
 */
const meta: Meta<typeof WorkflowStepPage> = {
  title: 'Pages/WorkflowStepPage',
  component: WorkflowStepPage,
  args: { from: 'repo', workflow: 'build', step: 'review', place: PLACE },
  parameters: {
    a11y: {
      config: {
        rules: [{ id: 'label-content-name-mismatch', enabled: false }],
      },
    },
  },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [stepQuery('repo', 'build', 'review', PLACE).queryKey, REVIEW],
        [storeQuery.queryKey, yourStore],
      ])}
    >
      <WorkflowStepPage {...args} />
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof WorkflowStepPage>;

/** The step's page: its trail ends at the step, and its workflow's level leads up to the workflow's page. */
export const InAFactory: Story = {
  play: async ({ canvasElement }) => {
    const trail = await within(canvasElement).findByRole('navigation', { name: 'Where you are' });
    await waitFor(() =>
      expect(
        within(trail)
          .getAllByRole('listitem')
          .map((level) => level.textContent),
      ).toEqual([FACTORY, 'Workflows', 'build', 'review']),
    );
    await userEvent.click(within(trail).getByRole('link', { name: 'build' }));
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at')).toBe(
        `/factories/${FACTORY}/workflows/repo/build`,
      ),
    );
  },
};
