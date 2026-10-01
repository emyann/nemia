/**
 * The state machines the board draws, each read off its code when it is asked for: today the runtime's task lifecycle. A machine joins
 * by one entry in `MACHINES`.
 */
import { Hono } from 'hono';
import { lifecycleGraph, type LifecycleGraph } from 'agent-orchestrator';

/** A machine as the list names it: the name its routes take, what a person calls it, and the file its graph is read from. */
export type MachineListing = { name: string; title: string; source: string };

/**
 * A machine's graph: its listing, its first state, every state, the final ones, every edge (from, event, guard, to, action), and every
 * verb written from outside it (verb, entry, by, from, to, guard).
 */
export type MachineGraph = MachineListing & LifecycleGraph;

/** Each machine by its name, with the function that reads its graph off its code on each request. */
const MACHINES: Record<string, MachineListing & { graph: () => LifecycleGraph }> = {
  lifecycle: {
    name: 'lifecycle',
    title: "A task's lifecycle",
    source: 'packages/agent-runtime/src/core/lifecycle.ts',
    graph: lifecycleGraph,
  },
};

/**
 * - `GET /api/machines` — `{ machines }`, each machine's name, title and source file, in the order they are kept.
 * - `GET /api/machines/:name` — one machine's `MachineGraph`, read off its code on each request; 404 for a name there is no machine
 *   under, naming the machines there are.
 */
export const machines = new Hono()
  .get('/api/machines', (c) => c.json({ machines: Object.values(MACHINES).map(({ name, title, source }) => ({ name, title, source })) }))
  .get('/api/machines/:name', (c) => {
    const name = c.req.param('name');
    const machine = Object.hasOwn(MACHINES, name) ? MACHINES[name] : undefined;
    if (!machine)
      return c.json(
        { error: `no machine is named ${name}: the machines are ${Object.keys(MACHINES).join(', ')} (GET /api/machines)` },
        404,
      );
    const { graph, ...listing } = machine;
    return c.json({ ...listing, ...graph() } satisfies MachineGraph);
  });
