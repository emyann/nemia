import { useSuspenseQuery } from '@tanstack/react-query';
import { Skills } from '../agent/AgentParts';
import { WorkflowTrail } from './WorkflowPage';
import { StepHire } from '../step/StepHire';
import { RecentRuns, StepAgent, StepTold, StepWritten } from '../step/StepParts';
import { stepQuery, type PagePlace } from '@/lib/api/workflows';
import { fromWord } from '@/lib/factories';
import { container } from '@/lib/meaning';

/**
 * One step of a workflow, to read, in the factory picked: its agent, hired or named by its file (`StepAgent`), with what that agent says
 * it can do (`skills:`), a description of the work that fences nothing; hired and fired there (`StepHire`); what a run of it will be
 * told, read now, each layer beside where it is edited; its newest runs; then its file's own words and keys (`StepWritten`). It edits and
 * starts nothing: each layer's home and its workflow's page do; a hire and a fire are the factory's.
 */
export function WorkflowStepPage({ from, workflow, step, place }: { from: string; workflow: string; step: string; place: PagePlace }) {
  const { data: page } = useSuspenseQuery(stepQuery(from, workflow, step, place));

  return (
    <article className="space-y-6">
      <WorkflowTrail from={from} workflow={workflow} step={step} place={place} />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-body-large font-semibold">{page.step}</h1>
          <span className="text-body-small text-muted-foreground">
            a step of <span className="font-mono text-foreground">{page.workflow}</span>
          </span>
          <span
            data-from={page.from}
            className={`rounded-full px-2 py-0.5 text-body-small leading-none font-medium ${
              page.from === 'user' ? container.grey : 'bg-muted text-muted-foreground'
            }`}
          >
            {fromWord(page.from, place.factory)}
          </span>
        </div>
        <StepAgent page={page} place={place} />
        <Skills skills={page.agentSkills} className="pl-3" />
        <StepHire from={from} workflow={workflow} step={step} place={place} where="page" />
      </header>

      <StepTold page={page} place={place} />
      <RecentRuns page={page} />

      <StepWritten page={page} />
    </article>
  );
}
