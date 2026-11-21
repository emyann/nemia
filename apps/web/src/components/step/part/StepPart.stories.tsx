import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import type { PartSize } from '@/lib/stepPart';
import type { RunDetail } from '@/lib/runView';
import { StepPart } from './StepPart';
import { CODES, NOW, PLAN, measured, runOf, spendingSoFar, stepOf, toldInLayers, tryOf } from '../../../../.storybook/fixtures/steps';
import { skippedHeadings } from '../../../../.storybook/play';

/**
 * A step's part at each of its three sizes — the graph's node (S), the preview card (M) and whole (L) — in each of the five places a
 * step stands: to come, at work, waiting on you, done, and tried again after its check failed it.
 */
const meta: Meta = { title: 'Run/StepPart' };
export default meta;

/** A client that asks the api nothing: a story draws what its run holds, and a read it would make waits. */
const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });

/** A check of the step's first try by `name`, its task and its verdict: passed, refused with exit 1, or not run. */
const named = (name: string, verdict: 'passed' | 'failed' | null) =>
  ({
    name,
    command: `npm run ${name}`,
    started: verdict === null ? null : '2026-10-12T17:02:00.000Z',
    ended: verdict === null ? null : '2026-10-12T17:04:00.000Z',
    taskId: `t-design-1-check-${name}`,
    verdict: verdict === null ? { result: 'unfinished', exit: null } : { result: verdict, exit: verdict === 'passed' ? 0 : 1 },
    refused: null,
  }) as const;

/** The step `step` judged by three named checks: lint passed, types refused, and tests, which waited on types, never run. */
const checkedBy = <S extends { tries: readonly object[] }>(step: S) => {
  const checks = [named('lint', 'passed'), named('types', 'failed'), named('tests', null)];
  return { ...step, check: checks[1], checks, tries: step.tries.map((t) => ({ ...t, check: checks[1], checks })) };
};

const RUNS = {
  toCome: runOf(stepOf(CODES.come, [])),
  atWork: runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)])),
  spendingSoFar: runOf(spendingSoFar(stepOf(CODES.work, [tryOf(1, CODES.refused, true, PLAN, false), tryOf(2, CODES.work, false, null)]))),
  waitsOnYou: runOf(measured(stepOf(CODES.gate, [tryOf(1, CODES.gate, true, PLAN)], true))),
  done: runOf(measured(stepOf(CODES.done, [tryOf(1, CODES.done, true, PLAN)]))),
  told: runOf(toldInLayers(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]))),
  tryAgain: runOf(
    stepOf(CODES.work, [tryOf(1, CODES.refused, true, { ...PLAN, summary: 'A first plan.' }, false), tryOf(2, CODES.work, false, null)]),
  ),
  checked: runOf(checkedBy(stepOf(CODES.refused, [tryOf(1, CODES.refused, true, PLAN)]))),
} as const;

const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 32 };
const WHOLE: CSSProperties = { maxWidth: 880 };

/** The step's part at each size: S and M side by side, L under them. */
function Sizes({ run }: { run: RunDetail }) {
  const at = (size: PartSize) => <StepPart view={run} step="design" size={size} now={NOW} />;
  return (
    <QueryClientProvider client={client}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={ROW}>
          {at('S')}
          {at('M')}
        </div>
        <div style={WHOLE}>{at('L')}</div>
      </div>
    </QueryClientProvider>
  );
}

/**
 * The step's card at M drawn in `canvas`, in its state: its card's kind, its frame in the step's hue, its five facts whole, a meter
 * only where a spend and its budget are measured, its label the card's small caps as its facts' labels, and its one action.
 */
async function cardAtM(canvas: HTMLElement, kind: string, hue: string, action: string) {
  const card = canvas.querySelector<HTMLElement>('[data-step-part="M"]')!;
  const frame = card.closest('[data-cut-frame]');
  await expect(frame?.getAttribute('data-cut-frame'), "its frame's hue").toBe(hue);
  await expect(card.querySelector('[data-step-card]')?.getAttribute('data-step-kind')).toBe(kind);
  await expect(card.querySelectorAll('[data-step-facts] dd').length, 'the five facts, whole').toBe(5);
  const meter = card.querySelector<HTMLElement>('[data-step-spend="meter"]');
  await expect(meter !== null, 'a meter where a spend and its budget are measured').toBe(kind === 'gate' || kind === 'done');
  if (meter) {
    const [spent, fact] = [within(meter).getByText('Spent', { exact: true }), card.querySelector('[data-step-facts] dt span')!].map(
      (label) => ({ case: getComputedStyle(label).textTransform, size: getComputedStyle(label).fontSize }),
    );
    await expect(spent, "the meter's label is the card's small caps, as its facts' labels").toEqual({ ...fact, case: 'uppercase' });
  }
  const named = (name: string) => name.toLowerCase().includes(action.toLowerCase());
  await expect(within(card).queryAllByRole('link', { name: named }).length, `one action, ${action}`).toBe(1);
  return card;
}

/** A step to come: when it starts, nothing said and nothing given yet. */
export const ToCome: StoryObj = {
  render: () => <Sizes run={RUNS.toCome} />,
  play: async ({ canvasElement }) => void (await cardAtM(canvasElement, 'come', 'none', 'Open the step')),
};

/** A step at work: its session running, nothing given yet, its spend not measured yet. */
export const AtWork: StoryObj = {
  render: () => <Sizes run={RUNS.atWork} />,
  play: async ({ canvasElement }) => {
    const card = await cardAtM(canvasElement, 'work', 'alive', 'Open the step');
    await expect(card.textContent).toMatch(/not measured yet/);
  },
};

/**
 * A step at work whose session said what it has spent so far, with no budget: the earlier try's cost and the live one, so far, in
 * words where it used to say not measured yet. Drawn from its args, the run.
 */
export const AtWorkSpending: StoryObj<{ run: RunDetail }> = {
  args: { run: RUNS.spendingSoFar },
  render: ({ run }) => <Sizes run={run} />,
  play: async ({ canvasElement }) => {
    const card = await cardAtM(canvasElement, 'work', 'alive', 'Open the step');
    await expect(card.querySelector('[data-step-spend="words"]')?.textContent).toMatch(/^Spent\s*\$32\.32 so far/);
    await expect(card.textContent).not.toMatch(/not measured yet/);
  },
};

/** A step at its gate: what it asks of you first, then what it said and gave. */
export const WaitsOnYou: StoryObj = {
  parameters: { a11y: { test: 'todo' } },
  render: () => <Sizes run={RUNS.waitsOnYou} />,
  play: async ({ canvasElement }) => void (await cardAtM(canvasElement, 'gate', 'yours', 'Read and approve')),
};

/** A step done: what it said, then each field it gave by its widget, its picture a thumbnail. */
export const Done: StoryObj = {
  parameters: { a11y: { test: 'todo' } },
  render: () => <Sizes run={RUNS.done} />,
  play: async ({ canvasElement }) => void (await cardAtM(canvasElement, 'done', 'none', 'Open the step')),
};

/** A step tried again after its check failed the first try: the picker of its tries, the second at work. */
export const TryAgain: StoryObj = { render: () => <Sizes run={RUNS.tryAgain} /> };

/**
 * A step judged by three named checks, its detail open: each check under its own name with its result, the one that refused beside the
 * one that passed and the one never run.
 */
export const Checked: StoryObj<{ step: string }> = {
  args: { step: 'design' },
  render: ({ step }) => (
    <QueryClientProvider client={client}>
      <div style={WHOLE}>
        <StepPart view={RUNS.checked} step={step} size="L" now={NOW} />
      </div>
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Detail/ }));
    for (const name of ['lint', 'types', 'tests'])
      await expect(within(canvasElement).getByRole('heading', { name: `Check ${name}` })).toBeTruthy();
  },
};

/**
 * A step's detail opened on what it was told: each layer an h4 under the part's h3s, the words of each at the level under it whatever
 * depth they write their headings at, and the run it waited on a block under the task's, so axe's `heading-order` holds the part.
 */
export const Told: StoryObj<{ step: string }> = {
  args: { step: 'design' },
  render: ({ step }) => (
    <QueryClientProvider client={client}>
      <div style={WHOLE}>
        <StepPart view={RUNS.told} step={step} size="L" now={NOW} />
      </div>
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    const user = userEvent.setup();
    await user.click(within(canvasElement).getByRole('button', { name: 'Detail' }));
    await user.click(await within(canvasElement).findByText('What it was told'));
    const fold = canvasElement.querySelector('[data-told]')!;
    await expect(fold.querySelector('[data-layer="policy"] h4')?.textContent, 'each layer an h4').toBe("5. The step's policy");
    await expect(fold.querySelector('[data-layer="policy"] [data-markdown] h5')?.textContent, 'its `###` one under').toBe(
      'true — on GitHub',
    );
    await expect(skippedHeadings(canvasElement), 'no level skipped').toEqual([]);
  },
};
