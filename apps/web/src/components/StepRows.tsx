import { RouteLink, AgentLink } from './AgentParts';
import { Markdown } from './Markdown';
import { StepHire } from './StepHire';
import { Skills } from './Told';
import type { ListedStep, PagePlace, WorkflowListing } from '../lib/api';

const LINK =
  'rounded-sm font-mono text-sm font-semibold underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/**
 * A workflow's steps, a row each in the order a run runs them: its name, linked to its page; its own words — a step with an agent its
 * policy, the note its file adds to its agent's instructions, and one without its whole body; its agent, linked to its page, or none; and
 * its skills — the agent's and those its line adds, or, with no agent, those its file names. Each step's page is read in `place`, the
 * factory the workflow's page was reached in; where `hiring`, that factory offers the workflow, and each row hires into its step there.
 */
export function StepRows({ workflow, place = {}, hiring = false }: { workflow: WorkflowListing; place?: PagePlace; hiring?: boolean }) {
  return (
    <ol aria-label={`Steps of ${workflow.name}`} className="divide-y divide-outline-variant rounded border border-outline-variant">
      {workflow.steps.map((step) => (
        <StepRow key={step.name} step={step} workflow={workflow} place={place} hiring={hiring} />
      ))}
    </ol>
  );
}

/** One step's row. */
function StepRow({ step, workflow, place, hiring }: { step: ListedStep; workflow: WorkflowListing; place: PagePlace; hiring: boolean }) {
  const agent = step.layers?.agent ?? step.spec.agent;
  const words = step.layers ? step.layers.policy : step.body;
  return (
    <li data-step-row={step.name} className="min-w-0 space-y-1.5 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <RouteLink
          to="/workflows/$from/$workflow/$step"
          params={{ from: workflow.from, workflow: workflow.name, step: step.name }}
          search={place}
          className={LINK}
        >
          {step.name}
        </RouteLink>
        <span className="text-xs text-muted-foreground">
          {agent ? (
            <>
              Its agent: <AgentLink from={workflow.from} name={agent} className="text-foreground" />
            </>
          ) : (
            'No agent: its own words are all it is told'
          )}
        </span>
      </div>
      {words.trim() ? (
        <Markdown level={4} className="text-sm">
          {words}
        </Markdown>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No words of its own{agent ? `: ${agent}'s instructions are all it is told` : ''}
        </p>
      )}
      {step.layers ? (
        <>
          <Skills word="Its agent's skills:" skills={step.layers.agentSkills} />
          <Skills word="Adds the skills:" skills={step.layers.addedSkills} />
        </>
      ) : (
        <Skills word="Its skills:" skills={step.spec.skills} />
      )}
      {hiring && <StepHire from={workflow.from} workflow={workflow.name} step={step.name} place={place} where="row" />}
    </li>
  );
}
