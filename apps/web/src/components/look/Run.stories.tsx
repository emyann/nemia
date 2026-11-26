import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import type { Run as RunObject } from 'objects';
import { Column, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { runViewOf } from '@/lib/api/judged';
import type { WaitingRun } from '@/lib/api/runs';
import { titleOf } from '@/lib/factory';
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

/** A title short enough to read whole on the line's width. */
const SHORT = { ...RUN('1sw7'), brief: 'board: a short title' };

/** The event a story's play sends its window to move or take away what one `Moves` holds: its `detail` names which. */
const MOVE = 'story-move';

/**
 * What it holds, under the name `name`: once the window is sent `MOVE` for `name`, moved down the page by a spacer, as a row is when a
 * row comes in above it, or taken off the page where `gone`, as a row is when its run leaves the list.
 */
function Moves({ name, gone, children }: { name: string; gone?: boolean; children: ReactNode }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const move = (event: Event) => {
      if ((event as CustomEvent<string>).detail === name) setMoved(true);
    };
    window.addEventListener(MOVE, move);
    return () => window.removeEventListener(MOVE, move);
  }, [name]);
  if (moved && gone) return null;
  return (
    <>
      <div style={{ height: moved ? 48 : 0 }} />
      {children}
    </>
  );
}

/** Sends the window `MOVE` for the case `name`. */
const move = (name: string) => window.dispatchEvent(new CustomEvent(MOVE, { detail: name }));

/** The tooltip that describes `trigger`, once it has opened and its entry has ended, so its box stands where it rests. */
const tipOfTitle = (trigger: Element) =>
  waitFor(() => {
    const one = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    if (one?.getAttribute('role') !== 'tooltip') throw new Error('no tooltip describes the title');
    if (one.hasAttribute('data-entering')) throw new Error('the tooltip is still entering');
    return one;
  });

/**
 * Refuses a tooltip whose box does not touch `title`'s words: just over them, and across them.
 * @param tip The tooltip.
 * @param title The title link it describes.
 */
const beside = async (tip: Element, title: Element) => {
  const words = title.getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  await expect(box.bottom, 'the tooltip sits just over the title').toBeGreaterThan(words.top - 16);
  await expect(box.bottom).toBeLessThanOrEqual(words.top + 1);
  await expect(box.right, 'the tooltip overlaps the title’s words across').toBeGreaterThan(words.left);
  await expect(box.left).toBeLessThan(words.right);
};

/** The title link of the run drawn under the heading `name`. */
const titleIn = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[data-tip-case="${name}"] [data-run-says~="title"] a`)!;

/**
 * The tooltips drawn anywhere on the page since `watching` was called, each by its box as it was drawn, and its end: every
 * `role="tooltip"` added to the document and still on it when the watcher reads it.
 */
const watching = () => {
  const drawn: DOMRect[] = [];
  const watcher = new MutationObserver((changes) => {
    const added = changes.flatMap((change) => [...change.addedNodes]).filter((node) => node instanceof Element);
    const tips = added.flatMap((node) => [node, ...node.querySelectorAll('*')]).filter((one) => one.getAttribute('role') === 'tooltip');
    drawn.push(...tips.filter((tip) => tip.isConnected).map((tip) => tip.getBoundingClientRect()));
  });
  watcher.observe(document.body, { childList: true, subtree: true });
  return { drawn, stop: () => watcher.disconnect() };
};

/**
 * A wait for React Aria to open the tooltip of `trigger`, as its delay ends: the trigger is described by one, however briefly, its
 * description seen set or seen taken away.
 */
const tried = (trigger: Element) =>
  new Promise<void>((done) => {
    const watcher = new MutationObserver((changes) => {
      if (!trigger.hasAttribute('aria-describedby') && changes.every((change) => change.oldValue === null)) return;
      watcher.disconnect();
      done();
    });
    watcher.observe(trigger, { attributes: true, attributeFilter: ['aria-describedby'], attributeOldValue: true });
  });

/** Whether a tooltip's box stands at the window's top-left corner, where React Aria draws one it could not place. */
const atCorner = (box: DOMRect) => box.left < 16 && box.top < 16;

/**
 * A run's title in the kit's tooltip only where it is cut, beside its words, and never at the window's corner: a title that reads whole
 * opens none; one cut to its line opens the whole title, its box touching the title's words; one unmounted while its delay runs draws
 * none, and one moved then opens beside its words where it went; one moved down the page while its tooltip is open closes it; and an
 * end on a short title stands at its row's end. The delays are played first, while React Aria's warm-up is cold. A press on a heading
 * first puts React Aria in the pointer's mode, as a person's pointer does: a hover alone does not.
 */
export const TitleTips: Story = {
  render: (args) => (
    <div style={BOARD}>
      <Headed name="whole" width={420}>
        <span data-tip-case="whole">
          <Run {...args} run={SHORT} size="sm" />
        </span>
      </Headed>
      <Headed name="cut" width={320}>
        <span data-tip-case="cut">
          <Run {...args} size="sm" />
        </span>
      </Headed>
      <Headed name="unmounted in its delay" width={320}>
        <span data-tip-case="unmounted">
          <Moves name="unmounted" gone>
            <Run {...args} size="sm" />
          </Moves>
        </span>
      </Headed>
      <Headed name="moved in its delay" width={320}>
        <span data-tip-case="delayed">
          <Moves name="delayed">
            <Run {...args} size="sm" />
          </Moves>
        </span>
      </Headed>
      <Headed name="moved while open" width={320}>
        <span data-tip-case="moved">
          <Moves name="moved">
            <Run {...args} size="sm" />
          </Moves>
        </span>
      </Headed>
      <Headed name="an end on a short title" width={460}>
        <span data-tip-case="end">
          <Run {...args} run={SHORT} size="lg" titleEnd={<span data-title-end>›</span>} />
        </span>
      </Headed>
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByText('whole'));
    const tips = watching();
    await userEvent.hover(titleIn(canvasElement, 'unmounted'));
    move('unmounted');
    const delayed = titleIn(canvasElement, 'delayed');
    await userEvent.hover(delayed);
    move('delayed');
    await beside(await tipOfTitle(delayed), delayed);
    await expect(tips.drawn, 'the unmounted title drew no tooltip, the moved one its own').toHaveLength(1);
    await expect(tips.drawn.filter(atCorner), 'no tooltip at the window’s corner').toHaveLength(0);
    await userEvent.unhover(delayed);
    tips.drawn.length = 0;

    const whole = titleIn(canvasElement, 'whole');
    const wholeTried = tried(whole);
    await userEvent.hover(whole);
    await wholeTried;
    await waitFor(() => expect(whole, 'a title that reads whole is described by nothing').not.toHaveAttribute('aria-describedby'));
    await expect(tips.drawn, 'a title that reads whole opens no tooltip').toHaveLength(0);
    await userEvent.unhover(whole);

    const cut = titleIn(canvasElement, 'cut');
    await userEvent.hover(cut);
    const tip = await tipOfTitle(cut);
    await expect(tip, 'the whole title').toHaveTextContent(titleOf(RUN('1sw7')));
    await beside(tip, cut);
    await userEvent.unhover(cut);

    const moved = titleIn(canvasElement, 'moved');
    await userEvent.hover(moved);
    await waitFor(() => expect(moved).toHaveAttribute('aria-describedby'));
    move('moved');
    await waitFor(() => expect(document.querySelectorAll('[role="tooltip"]'), 'the moved title’s tooltip closes').toHaveLength(0));
    await expect(tips.drawn.filter(atCorner), 'no tooltip at the window’s corner').toHaveLength(0);
    tips.stop();
    await userEvent.unhover(moved);

    const end = canvasElement.querySelector('[data-tip-case="end"] [data-title-end]')!.getBoundingClientRect();
    const row = canvasElement.querySelector('[data-tip-case="end"] [data-run-says~="title"]')!.getBoundingClientRect();
    await expect(Math.abs(end.right - row.right), 'the title’s end stands at its row’s end').toBeLessThanOrEqual(1);
  },
};
