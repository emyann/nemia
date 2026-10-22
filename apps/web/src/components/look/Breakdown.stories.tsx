import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from 'react-aria-components';
import type { Breakdown } from '@/lib/breakdown';
import { focusRing } from '@/components/ui/ds/utils';
import { BreakdownPreview, BreakdownRows } from './Breakdown';

/**
 * A breakdown over a trigger of the caller's own: the rows alone, and the preview a resting pointer or the keyboard opens, with and
 * without its last line for the rest, and over a head of a length a column would never hold.
 */
const meta: Meta = { title: 'Look/Breakdown' };
export default meta;

/** Where a run's wall time went, as the runs tables' Clock cell breaks it down. */
const CLOCK: Breakdown = {
  head: '42m',
  rows: [
    { what: 'Sessions at work', amount: 2_280_000, said: '38m', none: false },
    { what: 'Checks running', amount: 240_000, said: '4m', none: false },
    { what: 'Waiting on you', amount: 3_060_000, said: '51m', none: false },
    { what: 'Queued for a slot', amount: 0, said: 'none', none: true },
    { what: 'Everything else', amount: 120_000, said: '2m', none: false },
  ],
  foot: 'Wall time 1h 35m, from 11 Oct 1:11 PM.',
};

/** The same clock whose four parts cover the whole wall: no last line for the rest, and no foot to rule off. */
const WHOLE: Breakdown = { head: '42m', rows: CLOCK.rows.slice(0, 4), foot: '' };

/** The cell's own trigger: a button that carries the words and takes the focus. */
const trigger = (words: string) => (
  <Button className={`cursor-default rounded-[4px] font-mono text-body-small ${focusRing()}`}>{words}</Button>
);

/** The preview over a button, as a table's Clock cell draws it: the head, the rows, and the wall time under a rule. */
export const OverAButton: StoryObj = { render: () => <BreakdownPreview breakdown={CLOCK}>{trigger('42m')}</BreakdownPreview> };

/** A breakdown whose parts leave nothing over: no `Everything else` row, and no closing note. */
export const WithoutTheRest: StoryObj = { render: () => <BreakdownPreview breakdown={WHOLE}>{trigger('42m')}</BreakdownPreview> };

/** A head as long as a sentence: the tooltip wraps it and the rows stay in their two columns. */
export const ALongHead: StoryObj = {
  render: () => (
    <BreakdownPreview breakdown={{ ...CLOCK, head: 'Two days and four hours at work, over nine tries of four steps' }}>
      {trigger('2d 4h')}
    </BreakdownPreview>
  ),
};

/** The rows alone, drawn where something else already says the head: what the preview holds, with no trigger over it. */
export const RowsAlone: StoryObj = {
  render: () => (
    <div style={{ width: 300 }}>
      <BreakdownRows breakdown={CLOCK} />
    </div>
  ),
};
