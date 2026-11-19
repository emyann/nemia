import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { stepQuery, type WorkflowStepPage } from '@/lib/api/workflows';
import { StepHire } from './StepHire';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The factory the stories hire in. */
const FACTORY = 'acme';

/** Where the stories read the step: in the factory, by its path. */
const PLACE = { factory: FACTORY };

/** The step `review` of your workflow `release`, read in the factory, with `extra` over it: no agent hired, none to pick. */
const page = (extra: Partial<WorkflowStepPage> = {}) =>
  ({
    workflow: 'release',
    from: 'user',
    dir: '/store/workflows/release',
    step: 'review',
    body: 'Review the change.',
    source: '---\nworkspace: main\n---\nReview the change.\n',
    keys: [],
    agentSkills: [],
    factory: FACTORY,
    layers: {
      agent: null,
      instructions: null,
      custom: null,
      factory: null,
      agentSkills: [],
      policy: 'Review the change.',
      addedSkills: [],
      fence: [],
      folderFiles: true,
      task: null,
      via: 'brief',
    },
    hired: null,
    hiredIn: [],
    hiring: { refused: null, agents: [] },
    skillsFrom: [],
    recentRuns: [],
    ...extra,
  }) satisfies WorkflowStepPage;

/** Two agents beside the workflow, to pick one from. */
const PICKABLE: WorkflowStepPage['hiring'] = {
  refused: null,
  agents: [
    { name: 'reviewer', description: 'Reads a change and asks for another round or passes it.' },
    { name: 'shipper', description: null },
  ],
};

/** The hire of `read`'s step, drawn from a query client that holds `read` as the step's read. */
const drawn = (read: WorkflowStepPage, where: 'page' | 'row' = 'page') => (
  <QueryClientProvider client={seeded([[stepQuery(read.from, read.workflow, read.step, PLACE).queryKey, read]])}>
    <div style={{ width: 560 }}>
      <StepHire from={read.from} workflow={read.workflow} step={read.step} place={PLACE} where={where} />
    </div>
  </QueryClientProvider>
);

/**
 * Hiring into a step, one story a state: the picker of the agents beside it with Hire, and the picker opened; the agent hired, with Fire;
 * none to hire; and the package's refusal, said in place.
 *
 * Axe's `label-content-name-mismatch` alone is off, for the picker: the ds kit's `Select` draws its value before its floating label
 * inside its trigger, while React Aria names the trigger label first, so a kit select fails it wherever it is drawn. That is the kit's to
 * mend, upstream (as on `Frame/FactoryPane`); every other rule holds the hire.
 */
const meta: Meta<typeof StepHire> = {
  title: 'Run/StepHire',
  component: StepHire,
  args: { from: 'user', workflow: 'release', step: 'review', place: PLACE, where: 'page' },
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
};
export default meta;

type Story = StoryObj<typeof StepHire>;

/** No agent hired: the kit's Select of the agents beside it, and Hire, which waits for one picked; then New agent. */
export const Picks: Story = {
  args: { where: 'page' },
  render: (args) => drawn(page({ hiring: PICKABLE }), args.where),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hire-picker] [data-slot="select-trigger"]')).not.toBeNull();
    await expect(within(canvasElement).getByRole('button', { name: 'Hire' })).toBeDisabled();
  },
};

/** The picker opened: each agent by its name, its description under it. */
export const PickerOpen: Story = {
  args: { where: 'row' },
  render: (args) => drawn(page({ hiring: PICKABLE }), args.where),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('[data-hire-picker] [data-slot="select-trigger"]');
    await userEvent.click(trigger!);
    const options = await waitFor(() => within(canvasElement.ownerDocument.body).getAllByRole('option'));
    await expect(options.map((option) => option.dataset.hireAgent)).toEqual(['reviewer', 'shipper']);
  },
};

/** An agent hired: who, linked, and Fire. */
export const Hired: Story = {
  args: { where: 'page' },
  render: (args) => drawn(page({ hired: 'reviewer', hiring: PICKABLE }), args.where),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-fire="reviewer"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-hire-picker]')).toBeNull();
  },
};

/** No agent beside the workflow reads: none to hire, and New agent writes the first. */
export const NoneToHire: Story = {
  args: { where: 'page' },
  render: (args) => drawn(page(), args.where),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hire-none]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-new-agent]')).not.toBeNull();
  },
};

/** The package refuses a hire into the step: its words, in place, and no control. */
export const Refused: Story = {
  args: { where: 'page' },
  render: (args) =>
    drawn(
      page({ hiring: { refused: "The step's own file names its agent, `agent: shipper`, which fills it in every factory.", agents: [] } }),
      args.where,
    ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hire-refused]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-hire-picker], [data-fire], [data-new-agent]')).toBeNull();
  },
};
