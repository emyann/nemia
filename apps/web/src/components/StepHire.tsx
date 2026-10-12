/**
 * Hiring into a step, in the factory a page is read in: the agent hired, with Fire; else why none can be hired, in the package's words;
 * else a picker of the agents beside the step's workflow, with Hire, and, on a workflow of yours, New agent, which comes back to hire.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fireAgent, hireAgent, stepQuery, type PagePlace, type WorkflowStepPage } from '../lib/api';
import { invalidateHires } from '../lib/agentWrites';
import { AgentLink, RouteLink } from './AgentParts';
import { YoursFolder } from './WorkflowParts';

const LINK =
  'rounded-sm underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/** What a person asks of a step's hire: an agent hired into it, or the one hired fired. */
type Ask = { kind: 'hire'; agent: string } | { kind: 'fire' };

/**
 * Hiring into the step `step` of `workflow`, read from `from`, in `place`: drawn once the step's read is there, and nothing before it,
 * nor with no factory picked, where a hire is no one's — the default factory's refusal is said only in it, picked. `where` is the step's
 * own page, which also says how a new agent is added to one of the repository's workflows, or a row of its workflow's page, which says
 * no more than its controls.
 */
export function StepHire({
  from,
  workflow,
  step,
  place,
  where,
}: {
  from: string;
  workflow: string;
  step: string;
  place: PagePlace;
  where: 'page' | 'row';
}) {
  const { data: page } = useQuery(stepQuery(from, workflow, step, place));
  if (!page || place.factory === undefined) return null;
  return <Hiring page={page} where={where} />;
}

/** The step's hire as `page` reads it, with the writes that change it, and a write's refusal in place. */
function Hiring({ page, where }: { page: WorkflowStepPage; where: 'page' | 'row' }) {
  const queryClient = useQueryClient();
  const { factory, hired, hiring } = page;
  const into = `${page.workflow}/${page.step}`;
  const write = useMutation({
    mutationFn: (ask: Ask): Promise<unknown> =>
      ask.kind === 'hire' ? hireAgent(factory ?? '', into, ask.agent) : fireAgent(factory ?? '', into),
    onSettled: () => invalidateHires(queryClient),
  });
  const send = (ask: Ask) => {
    write.reset();
    write.mutate(ask);
  };
  return (
    <div data-step-hire={page.step} className="space-y-1.5">
      {factory && hired ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-small">
          <span className="text-muted-foreground">
            {factory} hires <AgentLink from={page.from} name={hired} className="text-foreground" /> into this step.
          </span>
          <Button variant="outline" size="xs" data-fire={hired} isDisabled={write.isPending} onPress={() => send({ kind: 'fire' })}>
            Fire
          </Button>
        </p>
      ) : hiring.refused !== null ? (
        <p data-hire-refused className="text-body-small text-muted-foreground">
          {hiring.refused}
        </p>
      ) : (
        <Picker page={page} pending={write.isPending} onHire={(agent) => send({ kind: 'hire', agent })} />
      )}
      {hiring.refused === null && !hired && <NewAgent page={page} where={where} />}
      {write.error && (
        <p role="alert" data-hire-write-refused className="text-body-small text-failure">
          {write.variables?.kind === 'fire' ? 'Not fired' : 'Not hired'}: {write.error.message}
        </p>
      )}
    </div>
  );
}

/**
 * Whose a workflow that is not yours is, read in the page's factory: the factory's in a named one, where its folder may be the factory's
 * own, and this repository's with none.
 */
const whose = (page: Pick<WorkflowStepPage, 'factory'>): string => (page.factory === null ? "this repository's" : "the factory's");

/** The agents beside the step's workflow, to pick one from, and Hire; or that there is none to pick. */
function Picker({ page, pending, onHire }: { page: WorkflowStepPage; pending: boolean; onHire: (agent: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const { agents } = page.hiring;
  if (agents.length === 0)
    return (
      <p data-hire-none className="text-body-small text-muted-foreground">
        {page.from === 'yours' ? 'None of your agents reads' : `None of ${whose(page)} agents reads`}, so there is no agent to hire into
        this step in {page.factory}.
      </p>
    );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        placeholder="Pick an agent"
        value={picked}
        onChange={(key) => setPicked(key == null ? null : String(key))}
        isDisabled={pending}
        className="w-64 max-w-full space-y-1"
      >
        <Label className="text-body-small text-muted-foreground">Hire into this step in {page.factory}</Label>
        <SelectTrigger data-hire-picker className="w-full font-mono text-body-small">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.name} id={agent.name} textValue={agent.name} data-hire-agent={agent.name}>
              <span className="flex min-w-0 flex-col">
                <span className="font-mono text-body-small">{agent.name}</span>
                {agent.description && <span className="truncate text-body-small text-muted-foreground">{agent.description}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" data-hire isDisabled={pending || picked === null} onPress={() => picked !== null && onHire(picked)}>
        Hire
      </Button>
    </div>
  );
}

/**
 * Where a new agent for the step comes from: on a workflow of yours, New agent, which writes one and hires it here; on one of the
 * repository's, said on its page alone: through a card, or by copying the workflow into yours.
 */
function NewAgent({ page, where }: { page: WorkflowStepPage; where: 'page' | 'row' }) {
  if (page.from === 'yours')
    return (
      <RouteLink
        to="/agents/new"
        search={{ factory: page.factory ?? undefined, workflow: page.workflow, step: page.step }}
        data-new-agent
        className={`text-body-small text-muted-foreground ${LINK}`}
      >
        New agent, hired into this step
      </RouteLink>
    );
  if (where === 'row') return null;
  return (
    <p data-new-agent-repo className="text-body-small text-muted-foreground">
      A new agent for {whose(page)} workflow is added through a card on the{' '}
      <RouteLink to="/inbox" className={LINK}>
        Inbox
      </RouteLink>
      , or by copying the workflow's folder into <YoursFolder />, where New agent hires one into its steps.
    </p>
  );
}
