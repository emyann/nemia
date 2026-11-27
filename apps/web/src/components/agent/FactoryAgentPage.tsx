import type { ReactNode } from 'react';
import { useQueries, useQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { Body, Label, Skeleton, Tag, Title } from '@/components/ui/ds';
import { CopyId, CutFrame, CutTag, Reading, SectionHead, Sticker } from '@/components/look';
import { ReadTrouble } from '@/components/frame/ReadTrouble';
import { agentQuery, readAgent } from '@/lib/api/agents';
import { keyFormQuery } from '@/lib/api/builder';
import { modelsQuery } from '@/lib/api/models';
import { judged } from '@/lib/api/judged';
import { factorySkillsQuery } from '@/lib/api/skills';
import { agentMarksQuery } from '@/lib/api/stats';
import { finishedRunsQuery, openRunsQuery } from '@/lib/api/runs';
import { stepQuery } from '@/lib/api/workflows';
import { personOf } from '@/lib/agentName';
import {
  editedDayOf,
  historyOf,
  lastEndedOf,
  permissionsOf,
  plateOf,
  serverGroupsOf,
  skillGroupsOf,
  type Mark,
  type PlateRow,
  type StepGives,
  type TileGroup,
} from '@/lib/agentPage';
import { agoWords } from '@/lib/runWords';
import { skillList } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import type { Activity } from '@/lib/atWork';
import { ActivityLine, useAgentActivity, WorkingSection } from './AgentActivity';
import { AgentInstructions } from './AgentInstructions';
import { AgentFace, NodeLink, nodesOf } from './AgentParts';
import { readGone } from '@/lib/api/gone';
import { Hovered } from './Hovered';

/**
 * What a factory agent's page loads before it draws: the agent read in its factory, the form's keys, the models and the factory's runs
 * not finished, which say what it is working on.
 * @param client The board's query client.
 * @param name The agent's name.
 * @param factory The factory the agent is read in.
 */
export const loadFactoryAgent = (client: QueryClient, name: string, factory: string) =>
  Promise.all([
    client.ensureQueryData(agentQuery('factory', name, { factory })),
    client.prefetchQuery(keyFormQuery),
    client.prefetchQuery(modelsQuery),
    client.prefetchQuery(openRunsQuery(factory)),
  ]);

/** The room a column of tiles gives each tile. */
const TILES = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]';

/** A part of the page still being read, in the shape of what is coming. */
const Waiting = ({ label }: { label: string }) => (
  <Reading label={label} className="space-y-2">
    <Skeleton className="h-16 w-full" />
  </Reading>
);

/** The agent's ring: a pixel of the quiet outline at rest, two of the meaning of a session at work while one is. */
function Ring({ name, working }: { name: string; working: boolean }) {
  return (
    <div
      data-ring={working ? 'alive' : 'rest'}
      className={cn(
        'grid size-32 shrink-0 place-items-center rounded-full border border-solid',
        working ? 'border-2 border-alive' : 'border-outline-variant',
      )}
    >
      <AgentFace name={name} size={100} />
    </div>
  );
}

/** One row of the spec plate: its label, its value with its note under it, and for the effort its pips. */
function Row({ row }: { row: PlateRow }) {
  return (
    <div data-plate-row={row.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-2.5">
      <Label size="medium" component="dt" className="uppercase opacity-70">
        {row.label}
      </Label>
      <dd className="m-0 min-w-0">
        <div className="flex items-center gap-2">
          <Body size="large" component="span" className="font-medium break-words">
            {row.value}
          </Body>
          {row.pips && (
            <span aria-hidden="true" data-pips={row.pips.filled} className="inline-flex gap-1">
              {Array.from({ length: row.pips.total }, (_, i) => (
                <span
                  key={i}
                  className={cn('size-2 border border-inverse-on-surface', i < (row.pips?.filled ?? 0) && 'bg-inverse-on-surface')}
                />
              ))}
            </span>
          )}
        </div>
        {row.note && (
          <Body size="medium" component="div" className={cn('opacity-70', row.label === 'Model' && 'font-mono')}>
            {row.note}
          </Body>
        )}
      </dd>
    </div>
  );
}

/** A group of tiles under its caption, each tile a cut frame drawn by `tile`. */
function Groups<T extends { name: string }>({ groups, tile }: { groups: readonly TileGroup<T>[]; tile: (one: T) => ReactNode }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.title} data-tile-group={group.title} className="space-y-2">
          <Label size="large" component="h3" className="uppercase text-on-surface-variant">
            {group.title}
          </Label>
          <div className={TILES}>
            {group.tiles.map((one) => (
              <CutFrame key={one.name} size={10}>
                <div className="space-y-1 p-3">{tile(one)}</div>
              </CutFrame>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Listing = Awaited<ReturnType<typeof readAgent>>;

/**
 * What the page reads beyond the agent: the page of each step it fills, the factory's skills, the stats' change marks, and, for the line
 * that says when its last session ended, the factory's runs.
 * @param agent The agent, as the page read it.
 * @param factory The factory it is read in.
 * @param idle Whether it is at work nowhere, which is when the finished runs are read.
 */
function useAgentReads(agent: Listing, factory: string, idle: boolean) {
  const pages = useQueries({
    queries: nodesOf(agent).map((node) => ({
      ...stepQuery('factory', node.workflow, node.step, { factory }),
      retry: (tries: number, error: unknown) => !readGone(error) && tries < 3,
    })),
  });
  const skills = useQuery(factorySkillsQuery(factory));
  const marks = useQuery(agentMarksQuery(agent.name, factory));
  const open = useQuery(openRunsQuery(factory));
  const finished = useQuery({ ...finishedRunsQuery(factory, []), enabled: idle });
  const runs = [...(open.data ? [...open.data.waiting, ...open.data.inFlight].filter(judged) : []), ...(finished.data?.runs ?? [])];
  const gives = pages.flatMap((page) =>
    page.data
      ? [
          {
            step: page.data.step,
            added: page.data.layers.addedSkills,
            skillsFrom: page.data.skillsFrom,
            mcp: skillList(page.data.keys.find((key) => key.key === 'mcp')?.value ?? ''),
          } satisfies StepGives,
        ]
      : [],
  );
  return {
    gives,
    skills,
    stepsRead: pages.every((page) => !page.isPending),
    stepsFailed: pages.find((page) => page.error && !readGone(page.error))?.error,
    marks: marks.data ?? [],
    ended: lastEndedOf(runs, agent.name),
  };
}

/** Who the agent is: its ring, its role with the tag that says it is read only, its description, what it is doing and where its file is. */
function Who({
  agent,
  factory,
  activity,
  endedAgo,
  edited,
}: {
  agent: Listing;
  factory: string;
  activity: Activity;
  endedAgo: string | null;
  edited: string | null;
}) {
  const { name } = agent;
  return (
    <header className="flex flex-wrap items-center gap-6">
      <Ring name={name} working={activity.kind !== 'none'} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Title size="medium" component="p" data-agent-role className="m-0">
            {agent.role ?? 'No role yet'}
          </Title>
          <Hovered said={`${personOf(name)} belongs to factory ${factory}, so it can't be edited here.`}>
            <span data-read-only data-way="factory" className="inline-flex">
              <CutTag edge>
                <Tag variant="outlined" color="neutral">
                  Read only
                </Tag>
              </CutTag>
            </span>
          </Hovered>
        </div>
        {agent.description && (
          <Body size="large" component="p" className="m-0">
            {agent.description}
          </Body>
        )}
        <ActivityLine activity={activity} endedAgo={endedAgo} />
        <Body size="medium" component="div" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            File <CopyId id={`agents/${name}.md`} of="file" />
          </span>
          {agent.keys.output && <span>Reports in {agent.keys.output}</span>}
          {edited && <span>Edited {edited}</span>}
        </Body>
      </div>
    </header>
  );
}

/** Its spec on the plate, and under it the three counts of what it may use, each said on hover. */
function Spec({ agent }: { agent: Listing }) {
  const { data: keyForm } = useQuery(keyFormQuery);
  const { data: models } = useQuery(modelsQuery);
  return (
    <section aria-label="Spec" className="space-y-4">
      <CutFrame size={16} ground="bg-inverse-surface" className="text-inverse-on-surface">
        <dl data-plate className="m-0 divide-y divide-inverse-on-surface/15 px-4 py-1">
          {plateOf(agent.keys, keyForm, models).map((row) => (
            <Row key={row.label} row={row} />
          ))}
        </dl>
      </CutFrame>
      <div data-permissions className="space-y-2">
        <Label size="large" component="h3" className="uppercase text-on-surface-variant">
          Permissions
        </Label>
        <div className="flex flex-wrap gap-3">
          {permissionsOf(agent.keys).map((one) => (
            <Hovered key={one.label} said={one.said}>
              <Sticker hue="ink" label={one.label}>
                {one.count}
              </Sticker>
            </Hovered>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The steps it is hired into, each a link to its page, and the factory they are in. */
function Steps({ agent, factory }: { agent: Listing; factory: string }) {
  const nodes = nodesOf(agent);
  const where = nodes.length === 1 ? 'In' : nodes.length === 2 ? 'Both in' : 'All in';
  return (
    <section aria-label="Steps" className="space-y-3">
      <SectionHead count={nodes.length} word="Steps" tone="rest" />
      <Body size="medium" data-used-by className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {nodes.length === 0 ? (
          <span className="text-on-surface-variant">No step names it yet.</span>
        ) : (
          <>
            {nodes.map((node) => (
              <NodeLink key={`${node.workflow}/${node.step}`} user={node} />
            ))}
            <span className="text-on-surface-variant">
              {where} factory {factory}.
            </span>
          </>
        )}
      </Body>
    </section>
  );
}

/** What changed in the agent, its steps and its skills, a sentence a day, the newest first; nothing is drawn while there is none. */
function History({ marks }: { marks: readonly Mark[] }) {
  const history = historyOf(marks);
  if (history.length === 0) return null;
  return (
    <section aria-label="History" className="space-y-3">
      <SectionHead count={history.length} word="History" tone="rest" />
      <ul data-history className="m-0 list-none space-y-1.5 p-0">
        {history.map((one) => (
          <Body key={one.key} size="medium" component="li">
            <span className="font-mono text-on-surface-variant">{one.day}</span> · {one.sentence}
          </Body>
        ))}
      </ul>
    </section>
  );
}

/** The skills it is given, by where each comes from, in a tile with what it is for. */
function Skills({ agent, reads }: { agent: Listing; reads: ReturnType<typeof useAgentReads> }) {
  const { gives, skills, stepsRead, stepsFailed } = reads;
  const groups = skills.data ? skillGroupsOf(agent.given, gives, skills.data) : [];
  return (
    <section aria-label="Skills" className="space-y-3">
      <SectionHead count={groups.reduce((n, group) => n + group.tiles.length, 0)} word="Skills" tone="rest" />
      {!stepsRead || skills.isPending ? (
        <Waiting label="Reading its skills…" />
      ) : stepsFailed || skills.error ? (
        <ReadTrouble what="its skills" error={stepsFailed ?? skills.error} size="small" />
      ) : (
        <Groups
          groups={groups}
          tile={(one) => (
            <>
              <Body size="medium" component="p" className="m-0 font-mono font-medium break-all" data-skill-tile={one.name}>
                {one.name}
              </Body>
              {one.description && (
                <Body size="medium" component="p" className="m-0 text-on-surface-variant">
                  {one.description}
                </Body>
              )}
              <Body size="medium" component="p" className="m-0 text-on-surface-variant" title={one.foundIn ?? undefined}>
                {one.where}
              </Body>
            </>
          )}
        />
      )}
    </section>
  );
}

/**
 * A factory's agent, as its board draws it (B5): who it is, with its face in a ring that shows whether it is at work, its role, its
 * description and what it is working on; then two columns that stack on a narrow page. The left holds its spec, its permissions, the
 * steps it is hired into, its instructions and its history; the right, what it is working on where there are several sessions, its skills
 * and its MCP servers, each by where it comes from. Nothing here is written: the factory owns the agent.
 * @param props.name The agent's name.
 * @param props.factory The factory the agent is read in.
 */
export function FactoryAgentPage({ name, factory }: { name: string; factory: string }) {
  const { data: agent } = useSuspenseQuery(agentQuery('factory', name, { factory }));
  const now = useNow(30_000);
  const activity = useAgentActivity(name, factory);
  const reads = useAgentReads(agent, factory, activity.kind === 'none');
  const endedAgo = reads.ended === null ? null : agoWords(new Date(reads.ended), new Date(now));
  return (
    <article className="space-y-8">
      <Who agent={agent} factory={factory} activity={activity} endedAgo={endedAgo} edited={editedDayOf(reads.marks)} />
      {agent.error !== null && (
        <Body size="medium" data-agent-error className="font-mono whitespace-pre-wrap text-failure">
          {agent.error}
        </Body>
      )}
      <div className="grid gap-8 @5xl/page:grid-cols-[340px_minmax(0,1fr)]">
        <div data-column="left" className="min-w-0 space-y-8">
          <Spec agent={agent} />
          <Steps agent={agent} factory={factory} />
          <AgentInstructions name={name} file={`agents/${name}.md`} body={agent.body} />
          <History marks={reads.marks} />
        </div>
        <div data-column="right" className="min-w-0 space-y-8">
          <WorkingSection activity={activity} />
          <Skills agent={agent} reads={reads} />
          <ServersSection mcp={agent.mcp} gives={reads.gives} read={reads.stepsRead} />
        </div>
      </div>
    </article>
  );
}

/** The MCP servers section: those its file names and those its steps add, each by where it comes from; none drawn where there are none. */
function ServersSection({ mcp, gives, read }: { mcp: string | null; gives: readonly StepGives[]; read: boolean }) {
  const groups = serverGroupsOf(mcp, gives);
  if (read && groups.length === 0) return null;
  return (
    <section aria-label="MCP servers" className="space-y-3">
      <SectionHead count={groups.reduce((n, group) => n + group.tiles.length, 0)} word="MCP servers" tone="rest" />
      {read ? (
        <Groups
          groups={groups}
          tile={(one) => (
            <Body size="medium" component="p" className="m-0 font-mono font-medium break-all" data-server-tile={one.name}>
              {one.name}
            </Body>
          )}
        />
      ) : (
        <Waiting label="Reading its servers…" />
      )}
    </section>
  );
}
