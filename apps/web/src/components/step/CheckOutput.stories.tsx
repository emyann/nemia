import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { CheckOutput as Printed } from 'objects';
import { CheckOutput } from './CheckOutput';

const OUTPUT = '/api/runs/:runId/steps/:step/tries/:try/check/output';

/** A check's stdout of 450 lines, a test a line, three of them failing; and its stderr of one line. */
const STDOUT = Array.from({ length: 450 }, (_, i) =>
  [117, 302, 449].includes(i + 1) ? `FAIL ${i + 1} - parses a trailing comma` : `ok ${i + 1} - builds part ${i + 1}`,
);
const STDERR = ['npm error Test failed.'];

/** What the api answers for `url`, cut of `streams` as the orchestrator cuts it, the check `running`, its stdout kept or not. */
const answered = (url: URL, over: Partial<Printed> = {}) => {
  const q = url.searchParams;
  const stream = q.get('stream') === 'stderr' ? 'stderr' : 'stdout';
  const all = (stream === 'stderr' ? STDERR : STDOUT).map((text, i) => ({ n: i + 1, text }));
  const match = q.get('match');
  const held = match ? all.filter((l) => l.text.toLowerCase().includes(match.toLowerCase())) : all;
  const last = q.get('last');
  const from = Number(q.get('from') ?? '1');
  const limit = Number(q.get('limit') ?? '200');
  const start = last
    ? Math.max(0, held.length - Number(last))
    : Math.max(
        0,
        held.findIndex((l) => l.n >= from),
      );
  const end = last ? held.length : Math.min(held.length, start + limit);
  const next = held[end]?.n;
  const answer: Printed = {
    try: 2,
    taskId: 'r-1-implement-try2-check',
    stream,
    running: false,
    partial: false,
    lines: held.slice(start, end),
    total: all.length,
    ...(match ? { matched: held.length } : {}),
    ...(next === undefined ? {} : { next }),
    ...over,
  };
  return HttpResponse.json(answer);
};

/**
 * The reader of what a try's check printed, one story a state: its stdout's last lines, with earlier ones to read; a search that keeps the
 * failing lines under their numbers; its stderr; a check still running; a stdout the runtime did not keep; a check not filed yet.
 */
const meta: Meta<typeof CheckOutput> = {
  title: 'Run/CheckOutput',
  component: CheckOutput,
  args: { read: { runId: 'r-1', step: 'implement', try: 2 } },
  parameters: { msw: [http.get(OUTPUT, ({ request }) => answered(new URL(request.url)))] },
};
export default meta;

type Story = StoryObj<typeof CheckOutput>;

/** The last 200 lines of its stdout, each after its number, and a press to read the lines before them. */
export const TheEnd: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector('[data-line="450"]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-line="250"]')).toBeNull();
    await expect(page.getByRole('button', { name: 'Earlier lines' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Later lines' })).toBeDisabled();
  },
};

/** Earlier lines pressed: the 200 before the end, and a press to read on toward it. */
export const Earlier: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector('[data-line="450"]')).not.toBeNull());
    await userEvent.click(page.getByRole('button', { name: 'Earlier lines' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-line="51"]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-line="250"]')).not.toBeNull();
    await expect(page.getByRole('button', { name: 'Later lines' })).toBeEnabled();
  },
};

/** A search for fail: the three failing lines alone, each under its number in the stream. */
export const Searched: Story = {
  play: async ({ canvasElement }) => {
    const search = within(canvasElement).getByRole('searchbox', { name: 'Search its lines' });
    await userEvent.type(search, 'fail{Enter}');
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-line]').length).toBe(3));
    for (const n of [117, 302, 449]) await expect(canvasElement.querySelector(`[data-line="${n}"]`)).not.toBeNull();
    await expect(canvasElement.querySelector('[data-check-output-said]')).toHaveTextContent('3 of its 450');
  },
};

/** Its stderr, chosen: its one line. */
export const Stderr: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('radio', { name: 'stderr' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-stream="stderr"] [data-line="1"]')).not.toBeNull());
    await expect(canvasElement.querySelectorAll('[data-line]').length).toBe(1);
  },
};

/** A check still running: what it printed so far, and that it is read again as it prints. */
export const Running: Story = {
  parameters: { msw: [http.get(OUTPUT, ({ request }) => answered(new URL(request.url), { running: true }))] },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-check-output-said]')).toHaveTextContent('still runs'));
  },
};

/** A stdout the runtime did not keep: the end of its log, said so. */
export const Partial: Story = {
  parameters: {
    msw: [
      http.get(OUTPUT, () =>
        HttpResponse.json({
          try: 2,
          taskId: 'r-1-implement-try2-check',
          stream: 'stdout',
          running: false,
          partial: true,
          lines: [
            { n: 1, text: '…npm test' },
            { n: 2, text: 'FAIL 449 - parses a trailing comma' },
          ],
          total: 2,
        } satisfies Printed),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-check-output-said]')).toHaveTextContent('end of its log'));
  },
};

/** A try whose check is not filed yet: nothing printed, said so. */
export const NoneFiled: Story = {
  parameters: {
    msw: [
      http.get(OUTPUT, () =>
        HttpResponse.json({
          try: 2,
          taskId: null,
          stream: 'stdout',
          running: false,
          partial: false,
          lines: [],
          total: 0,
        } satisfies Printed),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-check-output-said]')).toHaveTextContent('No check filed'));
    await expect(canvasElement.querySelector('[data-line]')).toBeNull();
  },
};
