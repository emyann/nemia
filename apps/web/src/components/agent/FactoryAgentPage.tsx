import { useState, type CSSProperties } from 'react';
import { NetworkIcon } from 'lucide-react';
import { useQueries, useQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { Body, Button, Label, Skeleton, Tag, Title } from '@/components/ui/ds';
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
  workflowsSelector,
  plateOf,
  serversOf,
  skillGroupsOf,
  type PlateRow,
  type StepGives,
} from '@/lib/agentPage';
import { agoWords } from '@/lib/runWords';
import { skillList } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import type { Activity } from '@/lib/atWork';
import { ActivityLine, useAgentActivity, WorkingSection } from './AgentActivity';
import { AgentInstructions } from './AgentInstructions';
import { AgentFace, nodesOf, RouteLink } from './AgentParts';
import { usePagePlace } from '../nav/useSeat';
import { workflowLink } from '@/lib/factoryAddress';
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

/** The grid of tiles: as many columns as fit, each 200 pixels at least, 8 apart. */
const TILES = 'grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]';

/** The one height of a tile, whatever its words: its name, three lines of what it is for and two of where it comes from. */
const TILE_HEIGHT = 'h-[150px]';

/** The label face's numeral, as wide as the board draws it. */
const WIDE: CSSProperties = { fontStretch: '125%' };

/** How many rows of its history the page shows before Show all. */
const NEWEST = 6;

/** A link drawn as the board underlines one. */
const LINK = 'text-on-surface underline decoration-outline underline-offset-[3px] hover:decoration-on-surface';

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

/** One row of the spec plate: its label and its value in the plate's numerals, and under them its pips, where it has them, and its note. */
function Row({ row }: { row: PlateRow }) {
  return (
    <div data-plate-row={row.label} className="flex flex-col gap-[3px] border-b border-current/35 pt-[7px] pb-2">
      <div className="flex items-baseline gap-2">
        <Label size="small" component="dt" className="w-[72px] shrink-0 uppercase">
          {row.label}
        </Label>
        <dd
          data-plate-value
          className="m-0 min-w-0 flex-1 truncate font-label text-[17px] leading-[22px] font-extrabold uppercase"
          style={WIDE}
        >
          {row.value}
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" data-pips={row.pips?.filled} className="flex w-[72px] shrink-0 gap-0.5">
          {row.pips &&
            Array.from({ length: row.pips.total }, (_, i) => (
              <span key={i} className={cn('h-[5px] flex-1', i < (row.pips?.filled ?? 0) ? 'bg-current' : 'bg-current/22')} />
            ))}
        </span>
        {row.note && (
          <Body size="small" component="span" data-plate-note className="min-w-0 flex-1 truncate" title={row.note}>
            {row.note}
          </Body>
        )}
      </div>
    </div>
  );
}

/** A group's caption: a small quiet label that counts its tiles. */
function GroupHead({ title }: { title: string }) {
  return (
    <Label size="small" component="h3" className="m-0 text-on-surface-variant uppercase">
      {title}
    </Label>
  );
}

/**
 * A tile in the grid: its name, what it is for cut to the lines it has room for, the whole of it said on hover, and where it comes from
 * at its foot; of one height where `even` (a skill's), as tall as its words where not (a server's, which says no more than its name).
 */
function Tile({
  name,
  what,
  where,
  icon,
  even = true,
  data,
}: {
  name: string;
  what: string | null;
  where: string;
  icon?: boolean;
  even?: boolean;
  data: Record<string, string>;
}) {
  return (
    <CutFrame size={10} fill className={cn('w-full', even && TILE_HEIGHT)}>
      <div {...data} className="flex h-full min-h-0 flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <span className="flex min-w-0 items-center gap-2">
          {icon && <NetworkIcon aria-hidden="true" className="size-[18px] shrink-0" />}
          <Body size="medium" component="span" className="truncate font-mono" title={name}>
            {name}
          </Body>
        </span>
        {(even || what !== null) && (
          <Body size="small" component="p" data-tile-what className="m-0 line-clamp-3 min-h-0" title={what ?? undefined}>
            {what}
          </Body>
        )}
        <Body size="small" component="p" data-tile-where className="m-0 mt-auto line-clamp-2 text-on-surface-variant">
          {where}
        </Body>
      </div>
    </CutFrame>
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
  const finished = useQuery({ ...finishedRunsQuery(factory, [], workflowsSelector(agent)), enabled: idle });
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
    marksPending: marks.isPending,
    marksFailed: marks.error,
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
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <Title size="large" component="p" data-agent-role className="m-0 font-sans font-semibold">
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
          <Body size="large" component="p" className="m-0 max-w-[72ch]">
            {agent.description}
          </Body>
        )}
        <ActivityLine activity={activity} endedAgo={endedAgo} />
        <Body
          size="small"
          component="div"
          data-agent-meta
          className="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-on-surface-variant"
        >
          <span className="inline-flex items-center gap-1.5">
            File <CopyId id={`agents/${name}.md`} of="file" />
          </span>
          {agent.keys.output && (
            <span>
              Reports in <span className="font-mono text-on-surface">{agent.keys.output}</span>
            </span>
          )}
          {edited && <span data-edited>Edited {edited}</span>}
        </Body>
      </div>
    </header>
  );
}

/** Its spec on the plate, under the plate's head that names its file, and at the plate's foot the three counts of what it may use. */
function Spec({ agent }: { agent: Listing }) {
  const { data: keyForm } = useQuery(keyFormQuery);
  const { data: models } = useQuery(modelsQuery);
  return (
    <section aria-label="Spec">
      <CutFrame size={16} ground="bg-inverse-surface" className="w-full text-inverse-on-surface">
        <div className="flex flex-col px-3.5 py-3">
          <div data-plate-head className="flex items-baseline justify-between gap-2 border-b-2 border-current pb-1.5">
            <Label size="medium" component="h2" className="m-0 uppercase">
              Spec
            </Label>
            <Body size="small" component="span" className="truncate font-mono">
              agents/{agent.name}.md
            </Body>
          </div>
          <dl data-plate className="m-0">
            {plateOf(agent.keys, keyForm, models).map((row) => (
              <Row key={row.label} row={row} />
            ))}
          </dl>
          <div data-permissions className="flex flex-col gap-2 pt-2.5 pb-0.5">
            <Label size="small" component="h3" className="m-0 uppercase">
              Permissions
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {permissionsOf(agent.keys).map((one) => (
                <Hovered key={one.label} said={one.said}>
                  <Sticker hue="ink" label={one.label}>
                    {one.count}
                  </Sticker>
                </Hovered>
              ))}
            </div>
          </div>
        </div>
      </CutFrame>
    </section>
  );
}

/** The steps it is hired into, a row each, its link over a divider, and the factory they are in under them. */
function Steps({ agent, factory }: { agent: Listing; factory: string }) {
  const here = usePagePlace();
  const nodes = nodesOf(agent);
  const where = nodes.length === 1 ? 'In' : nodes.length === 2 ? 'Both in' : 'All in';
  return (
    <section aria-label="Steps" className="flex flex-col gap-3">
      <SectionHead count={nodes.length} word="Steps" tone="rest" />
      {nodes.length === 0 ? (
        <Body size="small" className="text-on-surface-variant">
          No step names it yet.
        </Body>
      ) : (
        <>
          <ul data-used-by className="m-0 flex list-none flex-col p-0">
            {nodes.map((node) => (
              <li key={`${node.workflow}/${node.step}`} data-step-row className="border-b border-outline-variant py-2">
                <RouteLink
                  {...workflowLink(
                    node.from === 'user' && !('hired' in node && node.hired) ? {} : here,
                    node.from,
                    node.workflow,
                    node.step,
                  )}
                  data-node={`${node.workflow}/${node.step}`}
                  className={LINK}
                >
                  <Body size="medium" component="span">
                    {node.workflow} › {node.step}
                  </Body>
                </RouteLink>
              </li>
            ))}
          </ul>
          <Body size="small">
            {where} factory {factory}.
          </Body>
        </>
      )}
    </section>
  );
}

/** The history's head: a plain label, as the plate's are. */
const HistoryHead = () => (
  <Label size="medium" component="h2" className="m-0 uppercase">
    History
  </Label>
);

/**
 * What changed in the agent, its steps and its skills, a sentence a day, the newest first: the newest six, and Show all for the rest,
 * listed in place; nothing is drawn while there is none.
 */
function History({ reads }: { reads: ReturnType<typeof useAgentReads> }) {
  const [all, setAll] = useState(false);
  const history = historyOf(reads.marks);
  if (reads.marksPending)
    return (
      <section aria-label="History" className="flex flex-col gap-2.5">
        <HistoryHead />
        <Waiting label="Reading its history…" />
      </section>
    );
  if (reads.marksFailed)
    return (
      <section aria-label="History" className="flex flex-col gap-2.5">
        <HistoryHead />
        <ReadTrouble what="its history" error={reads.marksFailed} size="small" />
      </section>
    );
  if (history.length === 0) return null;
  const shown = all ? history : history.slice(0, NEWEST);
  return (
    <section aria-label="History" className="flex flex-col gap-2.5">
      <HistoryHead />
      <ul data-history className="m-0 flex list-none flex-col p-0">
        {shown.map((one) => (
          <li key={one.key} data-history-row className="flex gap-3 border-b border-outline-variant py-[7px]">
            <Body size="small" component="span" className="w-[52px] shrink-0 font-mono text-on-surface-variant">
              {one.day}
            </Body>
            <Body size="small" component="span">
              {one.sentence}
            </Body>
          </li>
        ))}
      </ul>
      {!all && history.length > NEWEST && (
        <div>
          <Button variant="outlined" size="small" onPress={() => setAll(true)}>
            Show all {history.length}
          </Button>
        </div>
      )}
    </section>
  );
}

/** The skills it is given, by where each comes from, each in a tile of one height with what it is for and where it comes from. */
function Skills({ agent, factory, reads }: { agent: Listing; factory: string; reads: ReturnType<typeof useAgentReads> }) {
  const { gives, skills, stepsRead, stepsFailed } = reads;
  const groups = skills.data ? skillGroupsOf(agent.given, gives, skills.data, factory) : [];
  return (
    <section aria-label="Skills" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SectionHead count={groups.reduce((n, group) => n + group.tiles.length, 0)} word="Skills" tone="rest" />
        <Body size="small" className="text-on-surface-variant">
          {personOf(agent.name)} loads a skill when its work needs it.
        </Body>
      </div>
      {!stepsRead || skills.isPending ? (
        <Waiting label="Reading its skills…" />
      ) : stepsFailed || skills.error ? (
        <ReadTrouble what="its skills" error={stepsFailed ?? skills.error} size="small" />
      ) : (
        groups.map((group) => (
          <div key={group.title} data-tile-group={group.title} className="flex flex-col gap-2">
            <GroupHead title={group.title} />
            <div className={TILES}>
              {group.tiles.map((one) => (
                <Tile key={one.name} name={one.name} what={one.description} where={one.where} data={{ 'data-skill-tile': one.name }} />
              ))}
            </div>
          </div>
        ))
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
      <div className="grid items-start gap-8 @5xl/page:grid-cols-[340px_minmax(0,1fr)]">
        <div data-column="left" className="flex min-w-0 flex-col gap-7">
          <Spec agent={agent} />
          <Steps agent={agent} factory={factory} />
          <AgentInstructions name={name} file={`agents/${name}.md`} body={agent.body} />
          <History reads={reads} />
        </div>
        <div data-column="right" className="flex min-w-0 flex-col gap-9">
          <WorkingSection activity={activity} />
          <Skills agent={agent} factory={factory} reads={reads} />
          <ServersSection mcp={agent.mcp} gives={reads.gives} read={reads.stepsRead} />
        </div>
      </div>
    </article>
  );
}

/** The MCP servers section: those its file names and its steps add, each a tile saying where it comes from; none drawn with none. */
function ServersSection({ mcp, gives, read }: { mcp: string | null; gives: readonly StepGives[]; read: boolean }) {
  const servers = serversOf(mcp, gives);
  if (read && servers.length === 0) return null;
  return (
    <section aria-label="MCP servers" className="flex flex-col gap-3.5">
      <SectionHead count={servers.length} word={servers.length === 1 ? 'MCP server' : 'MCP servers'} tone="rest" />
      {read ? (
        <div className={TILES}>
          {servers.map((one) => (
            <Tile key={one.name} name={one.name} what={null} where={one.where} icon even={false} data={{ 'data-server-tile': one.name }} />
          ))}
        </div>
      ) : (
        <Waiting label="Reading its servers…" />
      )}
    </section>
  );
}
