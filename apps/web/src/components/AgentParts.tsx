import { Blobatar } from '@blobatar/react';
import { useGaze } from '@blobatar/react/gaze';
import type { ReactNode } from 'react';
import { Link as AriaLink } from 'react-aria-components';
import type { AgentListing, AgentSkill, AgentUser, GivenSkill, SkillSource } from '../lib/api';
import { costWords, SOURCE_BADGES } from '../lib/skills';
import { cn } from '../lib/utils';
import { routeLink } from './routeLink';
import { container, hairline } from '../lib/meaning';

/** A link to a route, as React Aria draws one (`routeLink`): what the Agents pages link a node and an agent with. */
export const RouteLink = routeLink(AriaLink);

const LINK =
  'rounded-sm underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/** Where an agent is read from, as the Workflows page badges a workflow: yours, or this repository's. */
export function FromBadge({ from }: { from: AgentListing['from'] }) {
  return (
    <span
      data-from={from}
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] leading-none font-medium',
        from === 'yours' ? container.grey : 'bg-muted text-muted-foreground',
      )}
    >
      {from === 'yours' ? 'yours' : 'this repository'}
    </span>
  );
}

/** A node that names an agent, linked to its step's page: `workflow › step`. */
export function NodeLink({ user }: { user: AgentUser }) {
  return (
    <RouteLink
      to="/workflows/$from/$workflow/$step"
      params={{ from: user.from, workflow: user.workflow, step: user.step }}
      data-node={`${user.workflow}/${user.step}`}
      className={cn('font-mono text-xs text-foreground', LINK)}
    >
      {user.workflow} <span className="text-muted-foreground">›</span> {user.step}
    </RouteLink>
  );
}

/** The nodes that name an agent, each linked — or that none does. */
export function UsedBy({ listing, className }: { listing: Pick<AgentListing, 'usedBy'>; className?: string }) {
  return (
    <p data-used-by className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground', className)}>
      {listing.usedBy.length ? (
        <>
          <span>Attached to</span>
          {listing.usedBy.map((user, i) => (
            <span key={`${user.workflow}/${user.step}`}>
              <NodeLink user={user} />
              {i < listing.usedBy.length - 1 && ','}
            </span>
          ))}
        </>
      ) : (
        <span>No node names it yet.</span>
      )}
    </p>
  );
}

/**
 * What an agent says it can do: each A2A skill on its card, generated from the skills it gives, in their order — the name a caller would
 * read, what it is for, and the tags it carries. `compact`, as a character card shows them: the name on its line, what it is for cut to two
 * lines, and no tags; the whole of it is on the agent's page, a click away. `none` is what stands there when there is no card, its refusal
 * shown elsewhere; nothing is drawn at all where `none` is left out.
 */
export function Skills({
  skills,
  none,
  compact,
  className,
}: {
  skills: readonly AgentSkill[] | null | undefined;
  none?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (!skills?.length) return none ? <p className="text-xs text-muted-foreground">{none}</p> : null;
  return (
    <ul data-skills className={cn('space-y-1.5', className)}>
      {skills.map((skill) => (compact ? <CompactSkill key={skill.id} skill={skill} /> : <FullSkill key={skill.id} skill={skill} />))}
    </ul>
  );
}

/** One skill as an agent's page shows it: its name, what it is for, and its tags, on a line. */
function FullSkill({ skill }: { skill: AgentSkill }) {
  return (
    <li data-agent-skill={skill.id} className="text-xs leading-snug">
      <span className="font-medium text-foreground">{skill.name}</span> <span className="text-muted-foreground">{skill.description}</span>
      {skill.tags.length > 0 && (
        <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
          {skill.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

/** One skill as a character card shows it: its name, and what it is for cut to two lines. */
function CompactSkill({ skill }: { skill: AgentSkill }) {
  return (
    <li data-agent-skill={skill.id} className="text-sm leading-snug">
      <span className="block font-semibold text-foreground">{skill.name}</span>{' '}
      <span className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</span>
    </li>
  );
}

/** An agent's name as a person's: its file's name, first letter up and dashes as spaces — `iris` is Iris, `note-writer` Note writer. */
export const personOf = (name: string): string => {
  const spaced = name.replaceAll('-', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const FACE = 'shrink-0 rounded-full bg-muted';

const PLATE = 'shrink-0 dark:[&>path]:opacity-25';

type FaceProps = { name: string; size: number; follows?: boolean; plate?: boolean; className?: string };

/**
 * An agent's face: a Blobatar drawn from its name, so the same agent has the same face wherever it shows, and no two names share one by
 * design. Named as a person is, for a screen reader: by its label, so the name is no text of the line it stands in and no tooltip, or with
 * `follows` by its title. `size` in pixels. It is an inline drawing alive at all times — it breathes, bobs, blinks and glances with nothing
 * hovering it — and with `follows` its eyes also turn toward the pointer; still where the person asked for reduced motion, and with no eyes
 * following where there is no fine pointer. It stands on a grey round, or with `plate` on Blobatar's own backdrop, in its face's colours,
 * dimmed in the dark theme.
 */
export function AgentFace({ name, size, follows, plate, className }: FaceProps) {
  if (follows) return <FollowingFace name={name} size={size} plate={plate} className={className} />;
  return (
    <Blobatar
      animate="always"
      name={name}
      size={size}
      background={plate ? 'squircle' : false}
      role="img"
      aria-label={personOf(name)}
      aria-hidden={false}
      data-agent-face={name}
      className={cn(plate ? PLATE : FACE, className)}
    />
  );
}

/**
 * An agent's face, alive at all times, whose eyes follow the pointer: Blobatar's gaze driver on its drawing, three units of a hundred at
 * most.
 */
function FollowingFace({ name, size, plate, className }: Omit<FaceProps, 'follows'>) {
  const { ref } = useGaze({ travel: 3, lookAt: 'pointer' });
  return (
    <Blobatar
      ref={ref}
      animate="always"
      name={name}
      size={size}
      background={plate ? 'squircle' : false}
      title={personOf(name)}
      data-agent-face={name}
      className={cn(plate ? PLATE : FACE, className)}
    />
  );
}

/** A link to an agent's page, by name, its face beside it: what a node's form and a step's page link its agent with. */
export function AgentLink({ from, name, className }: { from: AgentListing['from']; name: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <AgentFace name={name} size={16} />
      <RouteLink
        to="/agents/$from/$agent"
        params={{ from, agent: name }}
        data-agent-link={name}
        className={cn('font-mono', LINK, className)}
      >
        {name}
      </RouteLink>
    </span>
  );
}

/**
 * A write of an agent refused: the package's words, and the nodes that still name it when that is why, each linked. `verb` is what did not
 * happen: a try refused is not started.
 */
export function AgentRefused({
  message,
  users,
  from,
  verb = 'Not written',
}: {
  message: string;
  users: readonly string[];
  from: AgentListing['from'];
  verb?: string;
}) {
  return (
    <div role="alert" data-agent-refused className="space-y-1.5 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-sm font-medium text-on-failure-container">{verb}:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
      {users.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-xs text-on-failure-container">
          <span>Open</span>
          {users.map((user) => {
            const [workflow = '', step = ''] = user.split('/');
            return <NodeLink key={user} user={{ from, workflow, step }} />;
          })}
        </p>
      )}
    </div>
  );
}

/** A write of a skill refused, in the package's words. */
export function SkillRefused({ message }: { message: string }) {
  return (
    <div role="alert" data-skill-refused className="space-y-1.5 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-sm font-medium text-on-failure-container">Not written:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}

/** A link to a skill's page, by its place and name: what an agent's skills and the Agents page's skills link a skill with. */
export function SkillLink({ from, name, className }: { from: SkillSource; name: string; className?: string }) {
  return (
    <RouteLink
      to="/agents/skills/$from/$skill"
      params={{ from, skill: name }}
      data-skill-link={name}
      className={cn('font-mono', LINK, className)}
    >
      {name}
    </RouteLink>
  );
}

/**
 * Where a skill an agent is given is found: your library, the repository, what Nemia ships — or nowhere, which the package refuses on
 * save.
 */
export function SkillSourceBadge({ from }: { from: SkillSource | null }) {
  return (
    <span
      data-skill-from={from ?? 'none'}
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-none font-medium',
        from === 'yours' && container.grey,
        from === 'repo' && 'bg-muted text-muted-foreground',
        from === 'shipped' && hairline,
        from === null && container.failure,
      )}
    >
      {from ? SOURCE_BADGES[from] : 'not found'}
    </span>
  );
}

/**
 * The skills an agent gives, one row each in its order: its name, linked to its page where it is found, where it is found, what it is for,
 * and what it costs a turn — or why no session can be given it, in the package's words. `action` draws what a row offers beside it (the
 * picker's Remove); read-only, nothing.
 */
export function GivenSkills({
  rows,
  action,
  none,
}: {
  rows: readonly GivenSkill[];
  action?: (row: GivenSkill) => ReactNode;
  none: ReactNode;
}) {
  if (!rows.length)
    return (
      <p data-given-none className="text-xs text-muted-foreground">
        {none}
      </p>
    );
  return (
    <ul data-given-skills className="divide-y divide-outline-variant rounded border border-outline-variant">
      {rows.map((row) => (
        <li key={row.name} data-given-skill={row.name} className="flex items-start gap-3 px-3 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {row.from ? (
                <SkillLink from={row.from} name={row.name} className="text-xs font-medium text-foreground" />
              ) : (
                <span className="font-mono text-xs font-medium text-foreground">{row.name}</span>
              )}
              <SkillSourceBadge from={row.from} />
            </p>
            {row.entry && <p className="text-xs text-muted-foreground">{row.entry.description}</p>}
            {row.error !== null && (
              <p data-given-error className="font-mono text-[11px] whitespace-pre-wrap break-words text-failure">
                {row.error}
              </p>
            )}
            {row.cost && (
              <p data-skill-cost className="text-[11px] text-muted-foreground">
                {costWords(row.cost)}
              </p>
            )}
          </div>
          {action?.(row)}
        </li>
      ))}
    </ul>
  );
}
