/**
 * The frame's floating bar for a state of one of the code's state machines: what its box on the Machines page draws, and what the routes
 * out of it draw, in a bar beside it — its kind, the edges that keep it in its state, and each route out with its edges and its verbs —
 * read from the graph the api serves. A state has no page of its own, so the bar has no Open (`barOpens`).
 */
import { useQuery } from '@tanstack/react-query';
import { machineQuery, type MachineGraph } from '@/lib/api';
import { stateFacts, type StateFacts } from '@/lib/machine';
import { FloatingBar } from './FloatingBar';
import { ByActionList, kindOf } from './MachineNode';

/** What a state's kind means, said after its kind. */
const kindMeaning = ({ initial, final }: Pick<StateFacts, 'initial' | 'final'>): string =>
  initial ? 'the machine starts here' : final ? 'the machine can end here' : 'the machine passes through here';

/**
 * The bar for the state `state` of the machine `machine`, titled by the state's name, saying whose state it is under the title. While the
 * graph is read it says so; a read that failed, and a state the graph names none by, are each said in the bar, which stays open until a
 * person closes it.
 */
export function StateBar({ machine, state }: { machine: string; state: string }) {
  const graph = useQuery(machineQuery(machine));
  return (
    <FloatingBar
      title={<span className="break-all">{state}</span>}
      description={
        <span className="break-all">
          a state of <span className="font-mono">{graph.data?.title ?? machine}</span>
        </span>
      }
    >
      <div data-state-bar={`${machine}/${state}`} className="space-y-5">
        {graph.data ? (
          <StateBody graph={graph.data} state={state} />
        ) : graph.error ? (
          <p className="text-sm text-failure">
            Could not read the machine {machine}: {graph.error.message}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Reading the machine…</p>
        )}
      </div>
    </FloatingBar>
  );
}

/**
 * What the bar holds for the state `state` of `graph`, as the drawing has it (`stateFacts`): its kind (`data-state-kind`); the edges back
 * to it by action, or that none keeps it there; and each route out of it (`data-route-out`), the state it leads to, its edges by action
 * and each verb a person takes along it (`data-route-verb`), or that none leaves it. Where the graph has no such state, it says so.
 */
export function StateBody({ graph, state }: { graph: MachineGraph; state: string }) {
  const facts = stateFacts(graph, state);
  if (!facts)
    return (
      <p className="text-sm text-yours">
        {graph.title} has no state named {state}.
      </p>
    );
  return (
    <>
      <section aria-label="Kind" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Kind</h3>
        <p data-state-kind={kindOf(facts)}>
          <span className="font-mono">{kindOf(facts)}</span>: {kindMeaning(facts)}
        </p>
      </section>
      <section aria-label="Stays on" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Stays on</h3>
        {facts.stays.length ? (
          <div className="overflow-x-auto rounded border">
            <ByActionList list={facts.stays} />
          </div>
        ) : (
          <p data-stays-none>no edge keeps it here</p>
        )}
      </section>
      <section aria-label="Routes out" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Routes out</h3>
        {facts.routes.length ? (
          <ul className="space-y-2">
            {facts.routes.map((route) => (
              <li key={route.to} data-route-out={route.to} className="overflow-x-auto rounded border">
                <p className="px-2.5 pt-1.5 font-mono text-sm font-semibold">→ {route.to}</p>
                <ByActionList list={route.edges}>
                  {route.verbs.map((verb) => (
                    <div key={verb} data-route-verb={verb} className="text-muted-foreground italic">
                      {verb}
                    </div>
                  ))}
                </ByActionList>
              </li>
            ))}
          </ul>
        ) : (
          <p data-routes-none>none: it ends here</p>
        )}
      </section>
    </>
  );
}
