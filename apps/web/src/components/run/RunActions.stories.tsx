import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Run as RunObject } from 'objects';
import { Column, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { runViewOf, type RunView } from '@/lib/api/judged';
import type { ListedRun } from '@/lib/api/runs';
import { Run } from '@/components/look';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { menuKey } from '../../../.storybook/play';
import { LONG_PRESS_MS, RunActions } from './RunActions';

/** The instant the stories' answer was read at. */
const AS_OF = new Date('2026-11-15T18:00:00.000Z');

/** `run` as the list carries one. */
const listed = (run: RunObject): ListedRun => ({
  ...runViewOf(run),
  wallMs: 0,
  finishedAt: run.status.finishedAt ?? null,
  clock: null,
});

/** A run at work, which may be held. */
const AT_WORK = listed(TARGET_RUNS['1sw7']);

/** A run a person holds, whose hold may be lifted. */
const HELD = listed(TARGET_RUNS.c7un);

/** Every run the stories draw. */
const RUNS = [AT_WORK, HELD];

const BOARD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24, padding: 32, minHeight: 520 };

/** The run whose row holds `target`, and the row. */
const rowOf = (target: Element) => {
  const row = target.closest('[role="row"][data-run]');
  const run = row && RUNS.find((r) => r.id === row.getAttribute('data-run'));
  return row && run ? { run, at: row } : null;
};

/** The runs as rows of the runs table, around which the actions are asked for. */
function Rows({ runs }: { runs: readonly ListedRun[] }) {
  return (
    <RunActions runOf={rowOf} className="contents">
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
          {runs.map((run) => (
            <Run key={run.id} run={run} size="md" layout="row" asOf={AS_OF} among={runs} />
          ))}
        </TableBody>
      </Table>
    </RunActions>
  );
}

/** A run as the floor's card, whose actions are asked for on it. */
function Card({ run }: { run: RunView }) {
  return (
    <div style={{ width: 300 }}>
      <RunActions runOf={(target) => ({ run, at: target.closest('article[data-run]') ?? target })}>
        <Run run={run} size="md" layout="card" asOf={AS_OF} among={RUNS} />
      </RunActions>
    </div>
  );
}

/** The menu open on the page, and the names of its entries. */
async function entriesOf(): Promise<string[]> {
  const menu = await waitFor(() => within(document.body).getByRole('menu', { name: 'Actions on the run' }));
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
}

/** A run's actions, opened where it is listed by a right-click, a long press or the keyboard's menu key: the run page's own list. */
const meta: Meta<typeof Rows> = {
  title: 'Run/RunActions',
  component: Rows,
  args: { runs: RUNS },
};
export default meta;

/** Two rows of the runs table: the menu key on a focused row opens that run's actions, and Lift… asks as the run's page asks. */
export const OnARow: StoryObj<typeof meta> = {
  render: (args) => (
    <div style={BOARD}>
      <Rows {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rowAt = (run: RunView) => canvasElement.querySelector(`[role="row"][data-run="${run.id}"]`) as HTMLElement;
    await userEvent.tab();
    await menuKey(userEvent, rowAt(AT_WORK));
    await expect(await entriesOf(), 'the run at work offers its hold').toEqual(['Hold…']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());

    await menuKey(userEvent, rowAt(HELD));
    await expect(await entriesOf(), 'the held run offers the lift').toEqual(['Lift…']);
    await userEvent.keyboard('{Enter}');
    const asked = await waitFor(() => within(document.body).getByRole('dialog', { name: `Lift the hold on ${HELD.id}` }));
    await expect(within(asked).getByRole('button', { name: 'Lift' })).toBeVisible();
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};

/**
 * A floor's card: the menu key on its focused title opens its run's actions, a right-click on the card opens them too, and so does a
 * finger resting on it.
 */
export const OnACard: StoryObj<typeof meta> = {
  render: () => (
    <div style={{ ...BOARD, flexDirection: 'row' }}>
      <Card run={AT_WORK} />
      <Card run={HELD} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const card = (run: RunView) => canvasElement.querySelector(`article[data-run="${run.id}"]`) as HTMLElement;
    await userEvent.tab();
    await menuKey(userEvent, within(card(AT_WORK)).getAllByRole('link')[0]);
    await expect(await entriesOf(), 'the run at work offers its hold').toEqual(['Hold…']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());

    await userEvent.pointer({ keys: '[MouseRight]', target: card(HELD) });
    await expect(await entriesOf(), 'a right-click on the held card offers the lift').toEqual(['Lift…']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());

    await userEvent.pointer({ keys: '[TouchA>]', target: card(AT_WORK) });
    await new Promise((done) => setTimeout(done, LONG_PRESS_MS + 100));
    await userEvent.pointer({ keys: '[/TouchA]', target: card(AT_WORK) });
    await expect(await entriesOf(), 'a finger resting on the card opens its menu').toEqual(['Hold…']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull());
  },
};
