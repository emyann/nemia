import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { AgentFace, FromBadge, personOf, RouteLink, SkillLink, Skills, UsedBy } from '../components/AgentParts';
import { routeLink } from '../components/routeLink';
import { agentsQuery, skillsQuery, type AgentListing, type SkillPlace } from '../lib/api';
import { KEY_LABELS, ROLE_KEYS } from '../lib/agents';
import { PLACE_LABELS } from '../lib/skills';

export const Route = createFileRoute('/agents')({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(agentsQuery), context.queryClient.prefetchQuery(skillsQuery)]),
  component: AgentsPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the agents: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const RouterLinkButton = routeLink(LinkButton);
const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/**
 * The agents beside the workflows: yours, which the board writes, then this repository's, which it only reads. An agent is one kind of thing
 * a workflow's node may have attached — what that node's work is told first and runs with — and each lists the nodes that name it. Then the
 * skills an agent can be given, by place, each linked to its page.
 */
function AgentsPage() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const { data: skills } = useQuery(skillsQuery);
  const yours = agents.filter((a) => a.from === 'yours');
  const theirs = agents.filter((a) => a.from === 'repo');

  return (
    <article className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-neutral-500">
          An agent is a file in the {code('agents/')} folder beside the workflows: what a node that names it ({code('agent: <name>')}) is
          told first, and how its sessions run. Yours are under {code('~/.agent-workflows/workflows/agents/')} and are edited here; this
          repository's are under {code('workflows/agents/')}, read-only. An edit changes what a later {code('wf start')} freezes, never a
          run already started.
        </p>
        <div className="flex flex-wrap gap-2">
          <RouterLinkButton to="/agents/new" variant="outline">
            <Plus data-icon="inline-start" />
            New agent
          </RouterLinkButton>
          <RouterLinkButton to="/agents/skills/new" variant="outline">
            <Plus data-icon="inline-start" />
            New skill
          </RouterLinkButton>
        </div>
      </div>

      <Place title="Yours" agents={yours} empty={<>None yet. New agent makes one in {code('~/.agent-workflows/workflows/agents/')}.</>} />
      <Place title="This repository" agents={theirs} empty={<>None: the repository has no {code('workflows/agents/')}.</>} />
      {skills && <SkillPlaces places={skills} />}
    </article>
  );
}

function Place({ title, agents, empty }: { title: string; agents: AgentListing[]; empty: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {agents.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {agents.map((agent) => (
            <li key={`${agent.from}:${agent.name}`}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">{empty}</p>
      )}
    </section>
  );
}

/**
 * One agent: its name, linked to its page, what it is for, what it says it can do, the keys it sets on its nodes, what its sessions are told
 * beyond its instructions (the skills it gives and its system prompt), and the nodes that name it.
 */
function AgentCard({ agent }: { agent: AgentListing }) {
  const rows: [string, string][] = [
    ...ROLE_KEYS.filter((key) => agent.keys[key] !== undefined).map((key): [string, string] => [
      KEY_LABELS[key].toLowerCase(),
      agent.keys[key]!,
    ]),
    ...(agent.skills ? [['skills', agent.skills] as [string, string]] : []),
    ...(agent.systemPrompt ? [['system prompt', agent.systemPrompt] as [string, string]] : []),
  ];
  return (
    <section
      aria-label={`Agent ${agent.name}`}
      data-agent={agent.name}
      data-from={agent.from}
      className="h-full space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="flex items-center gap-3">
        <AgentFace name={agent.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold">
              <RouteLink
                to="/agents/$from/$agent"
                params={{ from: agent.from, agent: agent.name }}
                className="rounded-sm underline decoration-neutral-300 underline-offset-4 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring/50 dark:decoration-neutral-600"
              >
                {personOf(agent.name)}
              </RouteLink>
            </h3>
            <FromBadge from={agent.from} />
          </div>
          <p data-agent-role className="text-xs text-neutral-500">
            {agent.role ?? 'No role yet'} · <span className="font-mono">{agent.name}</span>
          </p>
        </div>
      </header>
      {agent.description && <p className="text-sm text-neutral-700 dark:text-neutral-300">{agent.description}</p>}
      {agent.error === null &&
        (agent.cardError !== null ? (
          <p data-card-error className="font-mono text-xs break-words text-red-700 dark:text-red-400">
            {agent.cardError}
          </p>
        ) : (
          <Skills skills={agent.card} />
        ))}
      {agent.error !== null ? (
        <p className="font-mono text-xs break-words text-red-700 dark:text-red-400">{agent.error}</p>
      ) : (
        rows.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-1.5">
                <dt className="text-neutral-500">{label}</dt>
                <dd className="font-mono text-neutral-800 dark:text-neutral-200">{value}</dd>
              </div>
            ))}
          </dl>
        )
      )}
      <UsedBy listing={agent} />
    </section>
  );
}

/**
 * The skills an agent can be given, one list a place in the order an agent of yours finds a name: your library, which the board writes, the
 * repository's and Nemia's, which it reads. Each is linked to its page, which says who gives it and what it costs a turn.
 */
function SkillPlaces({ places }: { places: readonly SkillPlace[] }) {
  return (
    <section aria-label="Skills" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Skills</h2>
        <p className="text-sm text-neutral-500">
          A skill is a folder with a {code('SKILL.md')}: instructions an agent gives its sessions, by name. Yours are under{' '}
          {code('~/.agent-workflows/workflows/skills/')} and are written here.
        </p>
      </div>
      {places.map((place) => (
        <section key={place.from} aria-label={`Skills: ${PLACE_LABELS[place.from]}`} data-skill-place={place.from} className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{PLACE_LABELS[place.from]}</h3>
          {place.skills.length ? (
            <ul className="grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
              {place.skills.map((skill) => (
                <li key={skill.name} data-skill-row={skill.name} className="min-w-0 text-xs leading-snug">
                  <SkillLink from={skill.from} name={skill.name} className="font-medium text-neutral-800 dark:text-neutral-200" />{' '}
                  {skill.error !== null ? (
                    <span className="text-red-700 dark:text-red-400">does not read</span>
                  ) : (
                    <span className="text-neutral-600 dark:text-neutral-400">{skill.entry?.description}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-500">{place.from === 'yours' ? <>None yet. New skill writes one.</> : 'None.'}</p>
          )}
        </section>
      ))}
    </section>
  );
}
