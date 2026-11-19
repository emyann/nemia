import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Run as RunObject } from 'objects';
import { Column, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { runViewOf } from '@/lib/api/judged';
import type { WaitingRun } from '@/lib/api/runs';
import { nowMark } from '@/lib/stepMark';
import { READS, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { Run } from './Run';

/** The instant the stories' answer was read at. */
const AS_OF = new Date('2026-11-15T18:00:00.000Z');

/** `run` as the list carries one: no clock to break down, its present wait on a person dated where it has one. */
const listed = (run: RunObject) => ({
  ...runViewOf(run),
  wallMs: 0,
  finishedAt: run.status.finishedAt ?? null,
  clock: null,
  stepCosts: null,
  waitingSince: run.status.waitingSince ?? null,
});

/** Every run of the targets, as the surface has them: what a run's words name, and who waits on it, are read from these. */
const AMONG = Object.values(TARGET_RUNS).map(listed);

/** A target run by its id's last four characters. */
const RUN = (four: keyof typeof TARGET_RUNS) => listed(TARGET_RUNS[four]);

/** The six states the targets draw, each by its heading and its run. */
const STATES: Array<[string, keyof typeof TARGET_RUNS]> = [
  ['At work', '1sw7'],
  ['Waits on you · answers', '72wy'],
  ['Waits on you · decides', 'vqvd'],
  ['Waits on a run', '649a'],
  ['Held by you', 'c7un'],
  ['Finished', 'x57v'],
];

/** The three panels the targets draw, each by its heading and its run, read alone. */
const PANELS: Array<[string, keyof typeof READS]> = [
  ['At work', '1sw7'],
  ['Waits on you · answers', '72wy'],
  ['Waits on you · decides', 'vqvd'],
];

const COLUMN: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const BOARD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32, padding: 32 };
const WRAP: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' };

/** A run drawn under its heading. */
function Headed({ name, width, children }: { name: string; width?: number; children: ReactNode }) {
  return (
    <div style={{ ...COLUMN, width }}>
      <span className="text-label-small text-on-surface-variant uppercase">{name}</span>
      {children}
    </div>
  );
}

/** The run at md as a row: the runs table's, which gives it its columns. */
function InTable({ run }: { run: WaitingRun }) {
  return (
    <Table aria-label="Runs in flight" density="dense" style={{ minWidth: 880, tableLayout: 'fixed' }}>
      <TableHeader>
        <Column id="run" isRowHeader>
          Run
        </Column>
        <Column id="now" style={{ width: 360 }}>
          Now
        </Column>
        <Column id="clock" align="end" style={{ width: 144 }}>
          Clock
        </Column>
        <Column id="cost" align="end" style={{ width: 96 }}>
          Cost
        </Column>
      </TableHeader>
      <TableBody>
        <Run run={run} size="md" layout="row" asOf={AS_OF} among={AMONG} />
      </TableBody>
    </Table>
  );
}

/** One run at every size, xs to xl: each says all the one under it does, and more. */
const meta: Meta<typeof Run> = {
  title: 'Look/Run',
  component: Run,
  args: { run: RUN('1sw7'), asOf: AS_OF, among: AMONG },
};
export default meta;

type Story = StoryObj<typeof Run>;

/** 1sw7, at work, at every size: the mark in a sentence, the line, the row, the card, the waiting card's size, and the panel. */
export const Ladder: Story = {
  render: (args) => (
    <div style={BOARD}>
      <Headed name="xs · mark">
        <span>
          The checkout is held by <Run {...args} size="xs" /> until it lands.
        </span>
      </Headed>
      <Headed name="sm · line" width={420}>
        <Run {...args} size="sm" />
      </Headed>
      <Headed name="md · row">
        <InTable run={args.run as WaitingRun} />
      </Headed>
      <div style={WRAP}>
        <Headed name="md · card" width={300}>
          <Run {...args} size="md" layout="card" />
        </Headed>
        <Headed name="lg · card" width={460}>
          <Run {...args} size="lg" />
        </Headed>
        <Headed name="xl · panel" width={480}>
          <Run {...args} size="xl" read={READS['1sw7']} />
        </Headed>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const id = TARGET_RUNS['1sw7'].metadata.name;
    const mark = canvasElement.querySelector(`[data-run-says="state id"] a`);
    await expect(mark, 'the mark is a link to its run').toHaveAttribute('href', `/runs/${id}`);
    const lg = canvasElement.querySelector('[data-size="lg"]') as HTMLElement;
    await expect(within(lg).getByRole('link', { name: 'Open the run' })).toHaveAttribute('href', `/runs/${id}`);
  },
};

/** Six states at xs, sm, md as a card and lg, and the three panels. */
export const EveryState: Story = {
  render: (args) => (
    <div style={BOARD}>
      <div style={WRAP}>
        {STATES.map(([name, four]) => (
          <Headed key={four} name={name}>
            <Run {...args} run={RUN(four)} size="xs" />
          </Headed>
        ))}
      </div>
      <div style={WRAP}>
        {STATES.map(([name, four]) => (
          <Headed key={four} name={name} width={420}>
            <Run {...args} run={RUN(four)} size="sm" />
          </Headed>
        ))}
      </div>
      <div style={WRAP}>
        {STATES.map(([name, four]) => (
          <Headed key={four} name={name} width={280}>
            <Run {...args} run={RUN(four)} size="md" layout="card" />
          </Headed>
        ))}
      </div>
      <div style={WRAP}>
        {STATES.map(([name, four]) => (
          <Headed key={four} name={name} width={440}>
            <Run {...args} run={RUN(four)} size="lg" />
          </Headed>
        ))}
      </div>
      <div style={WRAP}>
        {PANELS.map(([name, four]) => (
          <Headed key={four} name={name} width={460}>
            <Run {...args} run={RUN(four)} size="xl" read={READS[four]} />
          </Headed>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const named = [...canvasElement.querySelectorAll('[data-now-words] [data-run-mark]')];
    await expect(named.length, 'the runs the words name are marks').toBeGreaterThan(0);
    for (const one of named) {
      const id = one.getAttribute('data-run-mark');
      const run = AMONG.find((other) => other.id === id);
      const drawn = one.querySelector('[data-mark]')?.getAttribute('data-mark');
      await expect(drawn, `${id} is drawn by the mark of its step now`).toBe(run ? nowMark(run) : 'rest');
    }
  },
};

/** The panel at work, waiting for answers, and waiting for a decision. */
export const Panels: Story = {
  render: (args) => (
    <div style={{ ...WRAP, padding: 32 }}>
      {PANELS.map(([name, four]) => (
        <Headed key={four} name={name} width={480}>
          <Run {...args} run={RUN(four)} size="xl" read={READS[four]} />
        </Headed>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [atWork] = [...canvasElement.querySelectorAll('[data-size="xl"]')] as HTMLElement[];
    const names = [...atWork.querySelectorAll('[data-named]')].map((one) => one.getAttribute('data-named'));
    await expect(names, 'each step named under the graph').toEqual(['design', 'implement', 'review', 'land']);
    const waiters = [...atWork.querySelectorAll('[data-runs="Waited on by"] [data-run-mark]')].map((one) =>
      one.getAttribute('data-run-mark'),
    );
    await expect(waiters).toEqual([TARGET_RUNS.c7un.metadata.name]);
    await expect(within(atWork).getByText('npx tsrs --noEmit -p apps/cli')).toBeVisible();
  },
};
