import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Run as RunObject } from 'objects';
import { Column, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { runViewOf } from '@/lib/api/judged';
import type { WaitingRun } from '@/lib/api/runs';
import { nowMark } from '@/lib/stepMark';
import { NOW_WORDS } from '@/lib/words';
import { READS, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { rowOpens } from '../../../.storybook/play';
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
  ['Held', 'c7un'],
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

/** The runs at md as rows: the runs table's, which gives them its columns. */
function InTable({ run, runs = [run] }: { run: WaitingRun; runs?: WaitingRun[] }) {
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
        {runs.map((one) => (
          <Run key={one.id} run={one} size="md" layout="row" asOf={AS_OF} among={AMONG} />
        ))}
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

/**
 * 1sw7, at work, at every size: the mark in a sentence, the line, the row, the card, the waiting card's size, and the panel. The row
 * answers the pointer and opens the run on Enter.
 */
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
  play: async ({ canvasElement, userEvent }) => {
    const id = TARGET_RUNS['1sw7'].metadata.name;
    const mark = canvasElement.querySelector(`[data-run-says="state id"] a`);
    await expect(mark, 'the mark is a link to its run').toHaveAttribute('href', `/runs/${id}`);
    const lg = canvasElement.querySelector('[data-size="lg"]') as HTMLElement;
    await expect(within(lg).getByRole('link', { name: 'Open the run' })).toHaveAttribute('href', `/runs/${id}`);
    await rowOpens(userEvent, canvasElement.querySelector<HTMLElement>(`tr[data-run="${id}"]`)!, `/runs/${id}`);
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

/** The held run of the targets, as another run held as `holding` says, its id ending in `four`. */
const heldAs = (four: string, holding: Partial<NonNullable<RunObject['status']['holding']>>) => {
  const held = TARGET_RUNS.c7un;
  const { at, runs, word, advice, waitingOnYou } = held.status.holding!;
  return listed({
    ...held,
    metadata: { ...held.metadata, name: held.metadata.name.replace(/c7un$/, four) },
    status: { ...held.status, holding: { at, runs, word, advice, waitingOnYou, ...holding } },
  });
};

/** A reason near the 200 characters a hold's why may hold. */
const LONG_WHY =
  'Waits for 1sw7 to land first: its board change reads the hold’s new fields, which only that run serves; resuming before it lands would build against a schema the api does not answer yet.';

/**
 * An unheld row that waits on a run, then the held rows: why and who said, a long why by an agent, none said, and one that waits on
 * you.
 */
const HELD_ROWS = [
  RUN('649a'),
  RUN('c7un'),
  heldAs('q8mw', {
    why: LONG_WHY,
    by: 'operator',
    actor: { kind: 'agent', agent: 'operator', token: 'ops' },
  }),
  heldAs('n0ne', {}),
  heldAs('z2pn', {
    runs: [{ run: TARGET_RUNS['1sw7'].metadata.name, missing: false, cancelledAt: '2026-11-15T17:00:00.000Z', gone: [], landed: false }],
    waitingOnYou: true,
    why: 'rebase after the release is cut',
    by: 'operator',
    actor: { kind: 'agent', agent: 'operator', token: 'ops' },
  }),
];

/**
 * Held runs as rows of the runs table, under one that only waits on a run: each held row's hold line says why, or that no reason was
 * given, and who holds it; a hold that waits on you is yellow and names the run that never lands, never the reader as its holder.
 */
export const HeldRows: Story = {
  render: () => (
    <div style={BOARD}>
      <InTable run={HELD_ROWS[0]} runs={HELD_ROWS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const row = (one: WaitingRun) => canvasElement.querySelector<HTMLElement>(`tr[data-run="${one.id}"]`)!;
    const [waits, said, long, none, yours] = HELD_ROWS.map(row);
    await expect(waits.querySelector('[data-hold]'), 'a run that only waits on a run has no hold line').toBeNull();
    for (const held of [said, long, none, yours])
      await expect(held.querySelectorAll('[data-hold]').length, 'a held row has one hold line').toBe(1);
    await expect(said.querySelector('[data-hold-why]')).toHaveTextContent('merge conflicts with 1sw7’s schema change');
    await expect(said.querySelector('[data-hold-by]')).toHaveTextContent('by ann');
    await expect(said.querySelector('[data-hold-by] [data-actor="person"]')).not.toBeNull();
    await expect(long.querySelector('[data-hold-why]'), 'the whole why on hover').toHaveAttribute('title', LONG_WHY);
    await expect(long.querySelector('[data-hold-by] [data-actor="agent"]')).not.toBeNull();
    await expect(none.querySelector('[data-hold-why]')).toHaveTextContent(NOW_WORDS.noWhy);
    await expect(none.querySelector('[data-hold-by]'), 'a hold that says nobody names nobody').toBeNull();
    await expect(yours.querySelector('[data-now]')).toHaveAttribute('data-now', 'yours');
    const words = yours.querySelector('[data-now-words]');
    await expect(words).toHaveTextContent(NOW_WORDS.calledOff);
    await expect(words).not.toHaveTextContent(/held by you/i);
    await expect(said.querySelector('[data-now]')).not.toHaveAttribute('data-now', 'yours');
  },
};

/** Who has a run in hand, as the api serves it: the operator, at a gate, back to the person in an hour. */
const ASSIGNEE: NonNullable<RunObject['status']['assignee']> = {
  at: '2026-11-15T17:30:00.000Z',
  forMs: 3_600_000,
  comesBackAt: '2026-11-15T18:30:00.000Z',
  word: 'operator has it in hand — back to you at 2026-11-15T18:30:00.000Z if unanswered',
  name: 'operator',
  why: 'reading the plan first',
  actor: { kind: 'agent', agent: 'operator', token: 'ops' },
};

/** A run of the targets someone has in hand, its id ending in `four`: listed in flight, its ask still asked. */
const assignedAs = (four: string, from: keyof typeof TARGET_RUNS) => {
  const run = TARGET_RUNS[from];
  return listed({
    ...run,
    metadata: { ...run.metadata, name: run.metadata.name.replace(/.{4}$/, four) },
    status: { ...run.status, state: 'inFlight', assignee: ASSIGNEE },
  });
};

/** A run that asks at a gate, the same run in the operator's hand, and a held run in their hand too. */
const ASSIGNED_ROWS = [RUN('72wy'), assignedAs('a5sg', '72wy'), assignedAs('h4sg', 'c7un')];

/**
 * Runs someone has in hand as rows of the runs table, under one that waits on you: an assigned row's chip is outlined, never yellow, its
 * words name who has it, and its assignee line says who and when it comes back; a held run in someone's hand draws both lines, the hold's
 * first.
 */
export const AssignedRows: Story = {
  render: () => (
    <div style={BOARD}>
      <InTable run={ASSIGNED_ROWS[0]} runs={ASSIGNED_ROWS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const row = (one: WaitingRun) => canvasElement.querySelector<HTMLElement>(`tr[data-run="${one.id}"]`)!;
    const [yours, assigned, both] = ASSIGNED_ROWS.map(row);
    await expect(yours.querySelector('[data-now]')).toHaveAttribute('data-now', 'yours');
    await expect(yours.querySelector('[data-assignee]'), 'a run nobody has in hand has no assignee line').toBeNull();
    await expect(assigned.querySelector('[data-now]')).toHaveAttribute('data-now', 'waits');
    await expect(assigned.querySelector('[data-now-words]')).toHaveTextContent(NOW_WORDS.inHand('operator'));
    await expect(assigned.querySelector('[data-assignee-who]')).toHaveTextContent(NOW_WORDS.hasIt('operator'));
    const lines = [...both.querySelectorAll('[data-hold], [data-assignee]')].map((line) => line.hasAttribute('data-hold'));
    await expect(lines, 'the hold line, then the assignee line').toEqual([true, false]);
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
