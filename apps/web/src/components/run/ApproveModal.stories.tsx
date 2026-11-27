import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Run } from 'objects';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { agentsQuery } from '@/lib/api/agents';
import { runLinesQuery, runObjectQuery, stepToldQuery, stepTriesQuery } from '@/lib/api/run';
import { stepStamp } from '@/lib/lifecyclePath';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { linesOf, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { CODES, PLAN, tryOf } from '../../../.storybook/fixtures/steps';
import type { StepTry } from '@/lib/api/tries';
import type { WaitAction as Action } from '../../../contracts/wait-action.contract.ts';
import { WaitAction } from './ApproveModal';

/** A run of the targets whose first step waits at its approval's gate. */
const AT_ITS_GATE: Run = {
  ...TARGET_RUNS['1sw7'],
  status: {
    ...TARGET_RUNS['1sw7'].status,
    steps: TARGET_RUNS['1sw7'].status.steps.map((step, i) =>
      i === 0 ? { ...step, phase: 'waiting', reason: 'AwaitingApproval', message: 'awaiting approval' } : step,
    ),
  },
};

/** The step that waits. */
const GATED = AT_ITS_GATE.status.steps[0];

/** A run of the targets whose design signed off blocked, asking a question of its closeout. */
const ASKING = TARGET_RUNS['72wy'];

/** The question design's closeout asks. */
const QUESTION = 'Where do the stories live?';

/** Design's one try, signed off blocked on `QUESTION`. */
const BLOCKED_TRY: StepTry = {
  ...tryOf(1, CODES.done, true, {
    ...PLAN,
    outcome: 'blocked',
    summary: 'Where the stories live is not mine to choose.',
    needs: 'Say where the stories live.',
    questions: [
      {
        field: 'questions',
        questions: [
          {
            title: QUESTION,
            body: 'Either keeps the board building.',
            options: [
              { label: 'Beside each part', meaning: 'A story file next to the part it draws.' },
              { label: 'In one folder', meaning: 'Every story under one folder of the board.' },
            ],
            recommended: 'Beside each part',
            multiple: false,
          },
        ],
      },
    ],
  }),
  phase: 'waiting',
  reason: 'AwaitingAnswer',
  via: 'closeout',
  message: 'succeeded · BLOCKED',
  check: null,
};

/**
 * The button of `action` on a card of `run`, and the modal it opens, read from the run's answers, seeded: each step's tries none, but
 * `tries`, by step, where given.
 */
const pressed = (run: Run, action: Action, tries: Record<string, readonly StepTry[]> = {}) => (
  <QueryClientProvider
    client={seeded([
      [runObjectQuery(run.metadata.name).queryKey, run],
      [runLinesQuery(run.metadata.name).queryKey, linesOf(run.metadata.name)],
      ...run.status.steps.flatMap((s) => [
        [stepTriesQuery(run.metadata.name, s.name, stepStamp(s)).queryKey, tries[s.name] ?? []] as const,
        [stepToldQuery(run.metadata.name, s.name, stepStamp(s)).queryKey, null] as const,
      ]),
      [agentsQuery.queryKey, []],
    ])}
  >
    <div style={{ height: 720 }}>
      <WaitAction run={{ id: run.metadata.name }} action={action} />
    </div>
  </QueryClientProvider>
);

/**
 * A waiting card's Approve or Answer and the modal it opens: the step's part at M, read from the run's answers, seeded. The gate's own
 * Approve and Send back are the e2e page's, which answers them against the api.
 */
const meta: Meta<{ step: string }> = {
  title: 'Run/ApproveModal',
  tags: ['network', 'overlay'],
  args: { step: GATED.name },
  render: ({ step }) => pressed(AT_ITS_GATE, { verb: 'approve', step }),
};
export default meta;

/** The button alone, Approve on its face and named for the step that waits. */
export const Button: StoryObj<{ step: string }> = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: `Approve ${args.step}` });
    await expect(button).toBeVisible();
    await expect(button.textContent).toBe('Approve');
  },
};

/**
 * A press opens the modal over the page, named for the step: one cut frame, the step's, in its hue, the title and the Close button
 * inside it above the step's part, and no surface of the kit's dialog drawn around it.
 */
export const Open: StoryObj<{ step: string }> = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: `Approve ${args.step}` }));
    const dialog = await waitFor(() => within(document.body).getByRole('dialog', { name: `Approve ${args.step}` }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible());
    await waitFor(() => expect(dialog.querySelector('[data-step-part="M"]')).not.toBeNull());
    const frames = dialog.querySelectorAll('[data-cut-frame]');
    await expect(frames).toHaveLength(1);
    const frame = frames[0];
    await expect(frame.getAttribute('data-cut-frame')).toBe('yours');
    await expect(frame.contains(within(dialog).getByRole('heading', { name: `Approve ${args.step}` }))).toBe(true);
    await expect(frame.contains(within(dialog).getByRole('button', { name: 'Close' }))).toBe(true);
    await expect(frame.contains(dialog.querySelector('[data-step-part="M"]'))).toBe(true);
    const surface = getComputedStyle(dialog.querySelector('[data-slot="dialog-content"]') as Element);
    const seen = (colour: string) => !colour.endsWith(', 0)');
    await expect(seen(surface.backgroundColor)).toBe(false);
    await expect((surface.boxShadow.match(/rgba?\([^)]*\)/g) ?? []).filter(seen)).toEqual([]);
    await expect(surface.padding).toBe('0px');
    await expect(surface.borderRadius).toBe('0px');
  },
};

/**
 * Answer, at a step that signed off blocked: a press opens the modal named for the step, holding its part at M with the question its
 * closeout asks, its options to choose from, and the button that sends the answer.
 */
export const AnswerOpen: StoryObj<{ step: string }> = {
  args: { step: 'design' },
  render: ({ step }) => pressed(ASKING, { verb: 'answer', step }, { [step]: [BLOCKED_TRY] }),
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: `Answer ${args.step}` });
    await expect(button.textContent).toBe('Answer');
    await userEvent.click(button);
    const dialog = await waitFor(() => within(document.body).getByRole('dialog', { name: `Answer ${args.step}` }));
    await waitFor(() => expect(dialog.querySelector('[data-step-part="M"]')).not.toBeNull());
    const asks = await waitFor(() => within(dialog).getByRole('region', { name: `What ${args.step} asks of you` }));
    await waitFor(() => expect(within(asks).getByText(QUESTION)).toBeVisible());
    await expect(within(asks).getByRole('radio', { name: /Beside each part/ })).toBeInTheDocument();
    await expect(dialog.querySelector('[data-gate]'), 'and no gate: the step waits on an answer, not an approval').toBeNull();
  },
};
