import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { headOf } from '@/lib/stepPart';
import type { RunDetail } from '@/lib/runView';
import { StepGlance } from './StepGlance';
import { CODES, NOW, PLAN, measured, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';

/** The card a diamond shows on hover or focus: a few live facts of its step, one story a kind of step. */
const meta: Meta<{ run: RunDetail }> = { title: 'Run/StepGlance', render: ({ run }) => glance(run) };
export default meta;

const RUNS = {
  work: runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)])),
  gate: runOf(measured(stepOf(CODES.gate, [tryOf(1, CODES.gate, true, PLAN)], true))),
  done: runOf(measured(stepOf(CODES.done, [tryOf(1, CODES.done, true, PLAN)]))),
  come: runOf(stepOf(CODES.come, [])),
  failed: runOf(stepOf(CODES.refused, [tryOf(1, CODES.refused, true, PLAN)])),
} as const;

/** The surface of the kit's rich tooltip, which the card is drawn on. */
const SURFACE: CSSProperties = {
  width: 'fit-content',
  padding: '12px 16px 8px',
  borderRadius: 12,
  background: 'var(--md-sys-color-surface-container)',
  border: '1px solid var(--md-sys-color-outline-variant)',
};

/** The glance of the step `design` of `run`, on the tooltip's surface, with the run's own answer read. */
const glance = (run: RunDetail) => (
  <div style={SURFACE}>
    <StepGlance head={headOf({ run, step: 'design', detail: run, now: NOW })} />
  </div>
);

/** What every glance holds: its four rows or fewer, under 200 pixels, and none of the static facts. */
const small = async (canvas: HTMLElement, kind: string) => {
  const card = canvas.querySelector<HTMLElement>('[data-step-glance]')!;
  await expect(card.getAttribute('data-step-kind')).toBe(kind);
  await expect(card.getBoundingClientRect().height, 'a few lines').toBeLessThan(200);
  await expect(card.querySelector('[data-step-facts]'), 'no static facts').toBeNull();
  await expect(card.querySelector('[data-glance="who"]') !== null && card.querySelector('[data-glance="state"]') !== null).toBe(true);
};

/** A step at work: its agent and model, its word and since, its try and what it has spent so far. */
export const AtWork: StoryObj<{ run: RunDetail }> = {
  args: { run: RUNS.work },
  play: ({ canvasElement }) => small(canvasElement, 'work'),
};

/** A step at its gate, waiting on a person. */
export const AtAGate: StoryObj<{ run: RunDetail }> = {
  args: { run: RUNS.gate },
  play: ({ canvasElement }) => small(canvasElement, 'gate'),
};

/** A step done: its spend of its cap. */
export const Done: StoryObj<{ run: RunDetail }> = {
  args: { run: RUNS.done },
  play: ({ canvasElement }) => small(canvasElement, 'done'),
};

/** A step to come: nothing said yet beyond its word. */
export const ToCome: StoryObj<{ run: RunDetail }> = {
  args: { run: RUNS.come },
  play: ({ canvasElement }) => small(canvasElement, 'come'),
};

/** A step that failed. */
export const Failed: StoryObj<{ run: RunDetail }> = {
  args: { run: RUNS.failed },
  play: ({ canvasElement }) => small(canvasElement, 'failed'),
};
