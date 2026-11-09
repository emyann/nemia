import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StepCloseout } from '@/lib/api';
import { HandedOn } from './Closeout';

/**
 * What a step handed on, as a gate draws it: a v1 closeout the run did not accept, a v0 one whose body opens with its summary, and a
 * v1 one whose body does not.
 */
const meta: Meta = { title: 'Board/Closeout' };
export default meta;

/** A done v1 closeout with nothing but its words, which each story changes. */
const BASE: StepCloseout = {
  apiVersion: 'nemia/v1',
  outcome: 'done',
  summary: 'Capped the runs in flight, and wrote the rule down.',
  body: null,
  needs: null,
  artifacts: [],
  values: [],
  refused: [],
  output: {},
  missing: [],
  replies: null,
  schema: {},
  questions: [],
  raw: {},
};

/** The width a gate's column gives what was handed on. */
const COLUMN: CSSProperties = { width: 480 };

/** A done closeout that says what it needs: its needs drawn, and the run's refusal of them under its words. */
export const Refused: StoryObj = {
  render: () => (
    <div style={COLUMN}>
      <HandedOn
        closeout={{
          ...BASE,
          needs: 'A word from you on the cap before the next run.',
          refused: ['`needs` is said on a done closeout: a closeout that needs a person signs off blocked.'],
        }}
      />
    </div>
  ),
};

/** A v0 closeout, its whole text its body: the summary, its first line, is said once, as the body's heading. */
export const SaidOnce: StoryObj = {
  render: () => (
    <div style={COLUMN}>
      <HandedOn
        closeout={{
          ...BASE,
          apiVersion: null,
          summary: '## What I found',
          body: '## What I found\n\n- The cap is read on every pass\n- One finding left: the queue has no test',
        }}
      />
    </div>
  ),
};

/** A v1 closeout whose body goes on from its summary: both are drawn. */
export const Both: StoryObj = {
  render: () => (
    <div style={COLUMN}>
      <HandedOn closeout={{ ...BASE, body: 'The cap is read on **every pass**, and stored nowhere.' }} />
    </div>
  ),
};
