import { useRef } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { MachineCanvas } from '../components/MachineCanvas';
import { machineQuery, machinesQuery, type MachineListing } from '../lib/api';
import { machineState } from '../lib/bar';
import { useBarOver } from '../lib/useBarOver';
import { useCanvasPress } from '../lib/useCanvasPress';

export const Route = createFileRoute('/machines')({
  loader: async ({ context }) => {
    const { machines } = await context.queryClient.ensureQueryData(machinesQuery);
    await Promise.all(machines.map(({ name }) => context.queryClient.ensureQueryData(machineQuery(name))));
  },
  component: MachinesPage,
  staticData: { fullBleed: true },
  pendingComponent: () => <p className="px-6 py-6 text-body-medium text-muted-foreground">Reading the state machines off their code…</p>,
  errorComponent: ({ error }) => (
    <p className="px-6 py-6 text-body-medium text-failure">
      Could not load the state machines: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/** Every state machine of the code, each drawn from the graph the api reads off it, with how to read the drawing. */
function MachinesPage() {
  const { data } = useSuspenseQuery(machinesQuery);
  return (
    <article className="space-y-8 px-6 py-6">
      <div className="max-w-4xl space-y-2 text-body-medium text-muted-foreground">
        <p>
          Each state machine as its code has it, drawn from the code and never by hand. A box is a state; an arrow joins two states, and
          lists the events that take it, each with its guard in brackets, and under them{' '}
          <span className="font-mono text-body-small">→</span> the action they take. What a box lists under its name are the events it stays
          in its state on.
        </p>
        <p>A click on a state shows it in the bar: its kind, what keeps it there, and each route out of it.</p>
      </div>
      {data.machines.map((machine) => (
        <Machine key={machine.name} listing={machine} />
      ))}
    </article>
  );
}

/**
 * One machine: its title, the file it is drawn from, and its drawing. A click, a tap or Enter on a state shows it in the frame's bar,
 * ringed; the same state again or the empty canvas closes it, and another switches it. A state has no page, so a double click does only
 * what its first click did (`useCanvasPress`). The drawing is narrowed by what the bar covers of it (`useBarOver`), so the state shown
 * stays clear of the bar.
 */
function Machine({ listing }: { listing: MachineListing }) {
  const { data } = useSuspenseQuery(machineQuery(listing.name));
  const { shown, ...press } = useCanvasPress((state) => ({ kind: 'state', machine: listing.name, state }));
  const whole = useRef<HTMLDivElement>(null);
  const over = useBarOver(whole);
  return (
    <section aria-label={listing.title} className="space-y-3">
      <h2 className="text-title-small">
        {listing.title}{' '}
        <span className="font-normal text-muted-foreground">
          — drawn from <code className="font-mono text-body-small">{listing.source}</code>
        </span>
      </h2>
      <p className="text-body-small text-muted-foreground">
        {data.states.length} states, {data.edges.length} edges; it starts in <span className="font-mono">{data.initial}</span> and ends in{' '}
        {data.final.map((state, i) => (
          <span key={state}>
            {i > 0 && (i === data.final.length - 1 ? ' or ' : ', ')}
            <span className="font-mono">{state}</span>
          </span>
        ))}
        .
      </p>
      <div ref={whole}>
        <div style={{ marginRight: over }}>
          <MachineCanvas machine={data} press={press} inspected={machineState(shown, listing.name)} />
        </div>
      </div>
    </section>
  );
}
