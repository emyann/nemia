import { linkOptions } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DefinitionTrail } from '../agent/AgentParts';
import { CardTrail } from '../inbox/CardPage';
import { RunTrail } from '../run/RunPage';
import { WorkflowTrail } from '../workflow/WorkflowPage';
import { factoryLevel, Trail } from './Trail';
import { FACTORY } from '../../../.storybook/fixtures/proposals';

/** The run every run's story is of, by its id and what it is called. */
const RUN = { id: 'r-k3p9q', title: 'board: a deep page says where it is' };

/** Where the story's router stands, as the decorator writes it. */
const standing = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at');

/**
 * Asserts the trail's levels, in order, by their names, the last the page itself: said current, and no link to follow.
 * @param canvasElement The story's canvas.
 * @param names The levels' names, the page's own last.
 */
async function expectLevels(canvasElement: HTMLElement, names: readonly string[]): Promise<void> {
  const trail = within(canvasElement).getByRole('navigation', { name: 'Where you are' });
  await waitFor(() =>
    expect(
      within(trail)
        .getAllByRole('listitem')
        .map((level) => level.textContent),
    ).toEqual(names),
  );
  const links = within(trail).getAllByRole('link');
  await expect(links.at(-1)).toHaveAttribute('aria-current', 'page');
  await expect(links.at(-1)).toHaveAttribute('aria-disabled', 'true');
}

/**
 * Presses the level named `name` and waits for the router to stand at `at`.
 * @param canvasElement The story's canvas.
 * @param name The level's name.
 * @param at The address it leads to.
 */
async function climbTo(canvasElement: HTMLElement, name: string, at: string): Promise<void> {
  await userEvent.click(within(canvasElement).getByRole('link', { name }));
  await waitFor(() => expect(standing(canvasElement)).toBe(at));
}

/**
 * Where a deep page is, in its head: the kit's `Breadcrumbs`, from the factory down to the page itself. One story a page's shape, each
 * drawn by the trail that page draws, under the address that page has where the trail reads its seat; each level leads up to its page.
 */
const meta: Meta<typeof Trail> = {
  title: 'Frame/Trail',
  component: Trail,
  args: { levels: [...factoryLevel(FACTORY), { name: 'Settings' }] },
};
export default meta;

type Story = StoryObj<typeof Trail>;

/** A factory's settings: the factory, then Settings; the factory leads to its floor. */
export const Settings: Story = {
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Settings']);
    await climbTo(canvasElement, FACTORY, `/factories/${FACTORY}`);
  },
};

/** A factory's proposal: the factory, its proposals, the proposal. */
export const Proposal: Story = {
  args: {
    levels: [
      ...factoryLevel(FACTORY),
      { name: 'Proposals', to: linkOptions({ to: '/factories/$factory/proposals', params: { factory: FACTORY } }) },
      { name: 'nemia-w1d3n' },
    ],
  },
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Proposals', 'nemia-w1d3n']);
    await climbTo(canvasElement, 'Proposals', `/factories/${FACTORY}/proposals`);
  },
};

/** A run of a factory: the factory, its runs, the run by what it is called. */
export const Run: Story = {
  parameters: { at: `/factories/${FACTORY}/runs/${RUN.id}` },
  render: () => <RunTrail runId={RUN.id} name={RUN.title} />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Runs', RUN.title]);
    await climbTo(canvasElement, 'Runs', `/factories/${FACTORY}/runs`);
  },
};

/** A run at the store's level, the default factory's: no factory, the runs, the run. */
export const RunAtTheStore: Story = {
  parameters: { at: `/runs/${RUN.id}` },
  render: () => <RunTrail runId={RUN.id} name={RUN.title} />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, ['Runs', RUN.title]);
    await climbTo(canvasElement, 'Runs', '/runs');
  },
};

/** A run gone, or one not read yet: it is named by its id. */
export const RunByItsId: Story = {
  parameters: { at: `/factories/${FACTORY}/runs/${RUN.id}` },
  render: () => <RunTrail runId={RUN.id} />,
  play: async ({ canvasElement }) => expectLevels(canvasElement, [FACTORY, 'Runs', RUN.id]),
};

/** A run's step: the factory, its runs, the run, which leads to its page, and the step. */
export const RunStep: Story = {
  parameters: { at: `/factories/${FACTORY}/runs/${RUN.id}/steps/implement` },
  render: () => <RunTrail runId={RUN.id} name={RUN.title} step="implement" />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Runs', RUN.title, 'implement']);
    await climbTo(canvasElement, RUN.title, `/factories/${FACTORY}/runs/${RUN.id}`);
  },
};

/** A workflow read in a factory, on a repository: the factory, its workflows on that repository, the workflow. */
export const Workflow: Story = {
  render: () => <WorkflowTrail from="repo" workflow="build" place={{ factory: FACTORY, repo: '/src/nemia' }} />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Workflows', 'build']);
    await climbTo(canvasElement, 'Workflows', `/factories/${FACTORY}/workflows?repo=%2Fsrc%2Fnemia`);
  },
};

/** A workflow's step: the factory, its workflows, the workflow, which leads to its page, and the step. */
export const WorkflowStep: Story = {
  render: () => <WorkflowTrail from="repo" workflow="build" step="review" place={{ factory: FACTORY }} />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Workflows', 'build', 'review']);
    await climbTo(canvasElement, 'build', `/factories/${FACTORY}/workflows/repo/build`);
  },
};

/** A card of a factory's inbox: the factory, its inbox, the card. */
export const Card: Story = {
  parameters: { at: `/factories/${FACTORY}/inbox/board-trail` },
  render: () => <CardTrail name="board-trail" />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Inbox', 'board-trail']);
    await climbTo(canvasElement, 'Inbox', `/factories/${FACTORY}/inbox`);
  },
};

/** An agent read in a factory: the factory, its agents, the agent. */
export const Agent: Story = {
  render: () => <DefinitionTrail kind="agent" name="reviewer" place={{ factory: FACTORY }} />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, [FACTORY, 'Agents', 'reviewer']);
    await climbTo(canvasElement, 'Agents', `/factories/${FACTORY}/agents`);
  },
};

/** A skill of yours, at the store's level: the skills, at their section of the Agents page, then the skill. */
export const SkillAtTheStore: Story = {
  render: () => <DefinitionTrail kind="skill" name="git" place={{}} />,
  play: async ({ canvasElement }) => {
    await expectLevels(canvasElement, ['Skills', 'git']);
    await climbTo(canvasElement, 'Skills', '/agents#skills');
  },
};
