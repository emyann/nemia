/**
 * The run's ledger, on its page: every step in one part (`StepPart` at L), in the run's order, each at its anchor (`#step-<name>`), where
 * the asks at the top of the page, the graph's packets, the result and a step's Got point.
 */
import { useQuery } from '@tanstack/react-query';
import { agentsQuery } from '@/lib/api/agents';
import { stepAnchor } from '@/lib/asks';
import type { RunDetail } from '@/lib/runView';
import { StepPart } from '../step/part/StepPart';

/** Every step of the run `run`, a part each at L, the agents' roles read for their heads. */
export function Ledger({ run }: { run: RunDetail }) {
  const agents = useQuery(agentsQuery);
  return (
    <section aria-label="Every step" data-ledger={run.steps.length} className="space-y-4">
      <h2 className="text-label-large text-on-surface-variant">Every step</h2>
      {run.steps.map((step) => (
        <StepPart key={step.name} view={run} step={step.name} size="L" agents={agents.data} id={stepAnchor(step.name)} />
      ))}
    </section>
  );
}
