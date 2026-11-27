import { useQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AgentCard } from './AgentCard';
import { SkillLink } from './AgentParts';
import { personOf } from '@/lib/agentName';
import { ListFilter, NothingMatches } from '../filter/ListFilter';
import { Button } from '@/components/ui/ds';
import { agentsQuery, factoryAgentsQuery, type LibraryAgent } from '@/lib/api/agents';
import { skillsQuery, type SkillPlace } from '@/lib/api/skills';
import { storeQuery } from '@/lib/api/store';
import { matches, useFilterText } from '@/lib/listFilter';
import { PLACE_LABELS } from '@/lib/skills';
import type { PagePlace } from '@/lib/api/workflows';

/**
 * What the Agents page loads before it draws: your agents and your folders, and the skills, which it draws once they come.
 * @param client The board's query client.
 */
export const loadAgents = (client: QueryClient) =>
  Promise.all([client.ensureQueryData(agentsQuery), client.ensureQueryData(storeQuery), client.prefetchQuery(skillsQuery)]);

/**
 * What a factory's Agents page loads before it draws: the factory's own agents, then all the Agents page loads.
 * @param client The board's query client.
 * @param factory The factory's name.
 */
export const loadFactoryAgents = (client: QueryClient, factory: string) =>
  Promise.all([client.ensureQueryData(factoryAgentsQuery(factory)), loadAgents(client)]);

/**
 * A factory's Agents page: the Agents page with the factory's own agents listed first, under the factory's name.
 */
export function FactoryAgentsPage({ factory, query, onQuery }: { factory: string; query: string; onQuery: (query: string) => void }) {
  const { data: agents } = useSuspenseQuery(factoryAgentsQuery(factory));
  return <AgentsPage query={query} onQuery={onQuery} own={{ factory, agents }} />;
}

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;

/**
 * Your agents, beside the workflows, which the board writes: the default factory works on no repository, so a repository's agents are
 * read on their own pages in the factory that works on it, never listed here. An agent is one kind of thing a workflow's node may have
 * attached — what that node's work is told first and runs with — and each lists the nodes that name it. Then the skills an agent can be
 * given, by place, each linked to its page. Your folders are the api's (`storeQuery`). Both lists are filtered by the address's `query`
 * (`?q=`) as a person types, each keystroke handed to `onQuery`: while it holds a text, a list it keeps nothing of is not drawn, and
 * where it keeps nothing of any, once the skills are read, the page says nothing matches. On a factory's page, `own` holds the factory's
 * own agents, listed first under its name and filtered the same way.
 */
export function AgentsPage({
  query,
  onQuery,
  own,
}: {
  query: string;
  onQuery: (query: string) => void;
  own?: { factory: string; agents: readonly LibraryAgent[] };
}) {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const { data: store } = useSuspenseQuery(storeQuery);
  const { data: skills } = useQuery(skillsQuery);
  const [text, setText] = useFilterText(query, onQuery);
  const filtering = text.trim() !== '';
  const kept = (a: LibraryAgent) => matches(text, a.name, a.description) || matches(text, personOf(a.name));
  const yours = agents.filter((a) => a.from === 'user').filter(kept);
  const factoryOwn = own?.agents.filter(kept) ?? [];
  const places = skills?.map((place) => ({
    ...place,
    skills: place.skills.filter((one) => matches(text, one.name, one.entry?.description)),
  }));
  const keptPlaces = filtering ? places?.filter((place) => place.skills.length > 0) : places;

  return (
    <article className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
          An agent is a file in the {code('agents/')} folder beside the workflows: what a node that names it ({code('agent: <name>')}) is
          told first, and how its sessions run. Yours are under {code(`${store.agents}/`)} and are edited here; a repository's, under its{' '}
          {code('workflows/agents/')}, are read in the factory that works on it. An edit changes what a run started later freezes, never a
          run already started.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button href="/agents/new" variant="outlined" icon={Plus}>
            New agent
          </Button>
          <Button href="/agents/skills/new" variant="outlined" icon={Plus}>
            New skill
          </Button>
        </div>
      </div>

      <ListFilter label="Filter agents and skills" text={text} onText={setText} />
      {filtering && factoryOwn.length === 0 && yours.length === 0 && keptPlaces?.length === 0 && (
        <NothingMatches text={text} onClear={() => setText('')} />
      )}
      {own && (!filtering || factoryOwn.length > 0) && (
        <Place
          title={own.factory}
          agents={factoryOwn}
          place={{ factory: own.factory }}
          empty={
            <>
              {own.factory} has no agent of its own. A factory's agents come from its template, or from the {code('agents/')} folder of its
              tree.
            </>
          }
        />
      )}
      {(!filtering || yours.length > 0) && (
        <Place title="Yours" agents={yours} empty={<>None yet. New agent makes one in {code(`${store.agents}/`)}.</>} />
      )}
      {keptPlaces && keptPlaces.length > 0 && <SkillPlaces places={keptPlaces} library={store.skills} />}
    </article>
  );
}

/** One place's agents, a card each with the factories it fills a step in, linked in `place`; `empty` where it has none. */
function Place({
  title,
  agents,
  empty,
  place,
}: {
  title: string;
  agents: readonly LibraryAgent[];
  empty: React.ReactNode;
  place?: PagePlace;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-title-small">{title}</h2>
      {agents.length ? (
        <ul className="grid gap-4 @md/page:grid-cols-2 @5xl/page:grid-cols-3">
          {agents.map((agent) => (
            <li key={`${agent.from}:${agent.name}`}>
              <AgentCard agent={agent} {...(place && { place })} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-medium text-on-surface-variant">{empty}</p>
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
    <section id="skills" aria-label="Skills" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-title-small">Skills</h2>
        <p className="text-body-medium text-on-surface-variant">
          A skill is a folder with a {code('SKILL.md')}: instructions an agent gives its sessions, by name. Yours are under{' '}
          {code(`${library}/`)} and are written here.
        </p>
      </div>
      {places.map((place) => (
        <section key={place.from} aria-label={`Skills: ${PLACE_LABELS[place.from]}`} data-skill-place={place.from} className="space-y-2">
          <h3 className="text-label-medium text-on-surface-variant uppercase">{PLACE_LABELS[place.from]}</h3>
          {place.skills.length ? (
            <ul className="grid gap-x-6 gap-y-1.5 @3xl/page:grid-cols-2">
              {place.skills.map((skill) => (
                <li key={skill.name} data-skill-row={skill.name} className="min-w-0 text-body-small leading-snug">
                  <SkillLink from={skill.from} name={skill.name} className="font-medium text-on-surface" />{' '}
                  {skill.error !== null ? (
                    <span className="text-failure">does not read</span>
                  ) : (
                    <span className="text-on-surface-variant">{skill.entry?.description}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-small text-on-surface-variant">
              {place.from === 'user' ? <>None yet. New skill writes one.</> : 'None.'}
            </p>
          )}
        </section>
      ))}
    </section>
  );
}
