import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { AgentCard } from '../components/agent/AgentCard';
import { SkillLink } from '../components/agent/AgentParts';
import { routeLink } from '../components/nav/routeLink';
import { agentsQuery, type LibraryAgent } from '../lib/api/agents.ts';
import { skillsQuery, type SkillPlace } from '../lib/api/skills.ts';
import { storeQuery } from '../lib/api/store.ts';
import { PLACE_LABELS } from '../lib/skills';

export const Route = createFileRoute('/agents')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agentsQuery),
      context.queryClient.ensureQueryData(storeQuery),
      context.queryClient.prefetchQuery(skillsQuery),
    ]),
  component: AgentsPage,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the agents: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const RouterLinkButton = routeLink(LinkButton);
const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;

/**
 * Your agents, beside the workflows, which the board writes: the default factory works on no repository, so a repository's agents are
 * read on their own pages in the factory that works on it, never listed here. An agent is one kind of thing a workflow's node may have
 * attached — what that node's work is told first and runs with — and each lists the nodes that name it. Then the skills an agent can be
 * given, by place, each linked to its page. Your folders are the api's (`storeQuery`).
 */
function AgentsPage() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const { data: store } = useSuspenseQuery(storeQuery);
  const { data: skills } = useQuery(skillsQuery);
  const yours = agents.filter((a) => a.from === 'yours');

  return (
    <article className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-body-medium text-muted-foreground">
          An agent is a file in the {code('agents/')} folder beside the workflows: what a node that names it ({code('agent: <name>')}) is
          told first, and how its sessions run. Yours are under {code(`${store.agents}/`)} and are edited here; a repository's, under its{' '}
          {code('workflows/agents/')}, are read in the factory that works on it. An edit changes what a run started later freezes, never a
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

      <Place title="Yours" agents={yours} empty={<>None yet. New agent makes one in {code(`${store.agents}/`)}.</>} />
      {skills && <SkillPlaces places={skills} library={store.skills} />}
    </article>
  );
}

/** One place's agents, a card each with the factories it fills a step in; `empty` where it has none. */
function Place({ title, agents, empty }: { title: string; agents: LibraryAgent[]; empty: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-title-small">{title}</h2>
      {agents.length ? (
        <ul className="grid gap-4 @md/page:grid-cols-2 @5xl/page:grid-cols-3">
          {agents.map((agent) => (
            <li key={`${agent.from}:${agent.name}`}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-medium text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/**
 * The skills an agent can be given, one list a place in the order an agent of yours finds a name: your library, which the board writes, the
 * repository's and Nemia's, which it reads; `library` is your library's folder. Each is linked to its page, which says who gives it and
 * what it costs a turn.
 */
function SkillPlaces({ places, library }: { places: readonly SkillPlace[]; library: string }) {
  return (
    <section aria-label="Skills" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-title-small">Skills</h2>
        <p className="text-body-medium text-muted-foreground">
          A skill is a folder with a {code('SKILL.md')}: instructions an agent gives its sessions, by name. Yours are under{' '}
          {code(`${library}/`)} and are written here.
        </p>
      </div>
      {places.map((place) => (
        <section key={place.from} aria-label={`Skills: ${PLACE_LABELS[place.from]}`} data-skill-place={place.from} className="space-y-2">
          <h3 className="text-label-medium text-muted-foreground uppercase">{PLACE_LABELS[place.from]}</h3>
          {place.skills.length ? (
            <ul className="grid gap-x-6 gap-y-1.5 @3xl/page:grid-cols-2">
              {place.skills.map((skill) => (
                <li key={skill.name} data-skill-row={skill.name} className="min-w-0 text-body-small leading-snug">
                  <SkillLink from={skill.from} name={skill.name} className="font-medium text-foreground" />{' '}
                  {skill.error !== null ? (
                    <span className="text-failure">does not read</span>
                  ) : (
                    <span className="text-muted-foreground">{skill.entry?.description}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-small text-muted-foreground">
              {place.from === 'yours' ? <>None yet. New skill writes one.</> : 'None.'}
            </p>
          )}
        </section>
      ))}
    </section>
  );
}
