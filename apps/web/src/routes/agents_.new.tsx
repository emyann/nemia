import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AgentForm } from '../components/AgentForm';
import { AgentRefused, RouteLink } from '../components/AgentParts';
import { AgentRefusal, createAgent, hireAgent, keyFormQuery, storeQuery, type AgentDraft } from '../lib/api';
import { invalidateAgents, invalidateHires } from '../lib/agentWrites';
import { hireOnCreate, hirePlaceOf, type HirePlace } from '../lib/factories';

/**
 * The New agent page, at /agents/new: `agents_` draws it on its own, not inside the Agents page, which has no outlet for it. `?factory=`,
 * `?workflow=` and `?step=` name a step of one of your workflows to hire the agent into once it is written.
 */
export const Route = createFileRoute('/agents_/new')({
  validateSearch: hirePlaceOf,
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(storeQuery), context.queryClient.prefetchQuery(keyFormQuery)]),
  component: NewAgentPage,
});

/**
 * A new agent of yours: the form, empty, and a Create that writes `agents/<name>.md` and opens its page; or, come from a step to hire
 * into, hires it there and goes back to the step's page in the factory. A hire refused leaves the person here, the agent written, the
 * refusal said, with the way to the step.
 */
function NewAgentPage() {
  const { data: keyForm } = useQuery(keyFormQuery);
  const { data: store } = useSuspenseQuery(storeQuery);
  const { factory: hiring, workflow: into, step: intoStep } = Route.useSearch();
  const hireInto = hiring && into && intoStep ? { factory: hiring, workflow: into, step: intoStep } : null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [unhired, setUnhired] = useState<{ agent: string; why: string } | null>(null);
  const create = useMutation({
    mutationFn: (draft: AgentDraft) => createAgent(draft),
    onSuccess: async (saved) => {
      await invalidateAgents(queryClient);
      if (!hireInto) return navigate({ to: '/agents/$from/$agent', params: { from: 'yours', agent: saved.agent.name } });
      const { factory, workflow, step } = hireInto;
      const made = await hireOnCreate(hireInto, saved.agent.name, hireAgent);
      await invalidateHires(queryClient);
      if (!made.hired) return setUnhired({ agent: saved.agent.name, why: made.why });
      return navigate({ to: '/workflows/$from/$workflow/$step', params: { from: 'yours', workflow, step }, search: { factory } });
    },
  });
  const refused = create.error instanceof AgentRefusal ? create.error : null;

  return (
    <article className="space-y-6">
      <BackToAgents />
      <header className="space-y-1">
        <h1 className="text-base font-semibold">New agent</h1>
        <p className="text-sm text-muted-foreground">
          Written to <code className="font-mono text-xs">{store.agents}/&lt;name&gt;.md</code>, beside your workflows. A node of one of them
          takes it with <code className="font-mono text-xs">agent: &lt;name&gt;</code>.
        </p>
        {hireInto && <HiredInto place={hireInto} />}
      </header>
      {hireInto && unhired && <Unhired place={hireInto} {...unhired} />}
      <AgentForm
        listing={null}
        keyForm={keyForm}
        saving={create.isPending}
        refusal={create.error && <AgentRefused message={create.error.message} users={refused?.users ?? []} from="yours" />}
        onSave={(draft) => create.mutate(draft)}
      />
    </article>
  );
}

/** The step the agent will be hired into once written, linked to its page in the factory. */
function HiredInto({ place: { factory, workflow, step } }: { place: HirePlace }) {
  return (
    <p data-hire-into={`${workflow}/${step}`} className="text-sm text-muted-foreground">
      Once created, {factory} hires it into{' '}
      <RouteLink
        to="/workflows/$from/$workflow/$step"
        params={{ from: 'yours', workflow, step }}
        search={{ factory }}
        className="font-mono text-xs text-foreground underline underline-offset-2"
      >
        {workflow}/{step}
      </RouteLink>
      , and you are taken back there.
    </p>
  );
}

/** Brings the notice that the hire was refused into the window: it says so above the form, and Create is pressed at the form's foot. */
const intoView = (notice: HTMLDivElement | null): void => notice?.scrollIntoView({ block: 'nearest' });

/** The agent written but not hired: the hire's refusal, in the package's words, and the way to the step and to the agent. */
function Unhired({ place: { factory, workflow, step }, agent, why }: { place: HirePlace; agent: string; why: string }) {
  return (
    <div
      ref={intoView}
      role="alert"
      data-hire-unhired
      className="space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40"
    >
      <p className="font-medium text-amber-900 dark:text-amber-200">
        {agent} is created, but not hired into {workflow}/{step}:
      </p>
      <p className="text-xs whitespace-pre-wrap text-amber-900 dark:text-amber-200">{why}</p>
      <p className="text-xs text-amber-900 dark:text-amber-200">
        <RouteLink
          to="/workflows/$from/$workflow/$step"
          params={{ from: 'yours', workflow, step }}
          search={{ factory }}
          className="underline underline-offset-2"
        >
          Back to the step
        </RouteLink>{' '}
        or{' '}
        <RouteLink to="/agents/$from/$agent" params={{ from: 'yours', agent }} className="underline underline-offset-2">
          open {agent}
        </RouteLink>
        .
      </p>
    </div>
  );
}

export function BackToAgents() {
  return (
    <RouteLink
      to="/agents"
      className="rounded-sm text-sm text-muted-foreground outline-none hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:text-neutral-100"
    >
      ← Agents
    </RouteLink>
  );
}
