import { Blobatar } from '@blobatar/react';
import { useGaze } from '@blobatar/react/gaze';
import type { Expression } from 'blobatar';
import type { ReactNode } from 'react';
import { sourceOf, type AgentSkill, type GivenSkill, type SkillSource } from '../../lib/api/library.ts';
import { type AgentFill, type AgentListing, type AgentUser } from '../../lib/api/agents.ts';
import { type PagePlace } from '../../lib/api/workflows.ts';
import { costWords, SOURCE_BADGES } from '../../lib/skills';
import { cn } from '../../lib/utils';
import { linkOptions } from '@tanstack/react-router';
import { routeLink } from '../nav/routeLink';
import { factoryLevel, Trail } from '../nav/Trail';
import { usePagePlace } from '../nav/useSeat';
import { definitionLink, workflowLink } from '../../lib/factoryAddress';
import { container, hairline } from '../../lib/meaning';
import { composeTailwindRenderProps, Link, type LinkProps } from '../ui/ds';

/**
 * A link to a route, as the kit draws one (`routeLink`), in the colour of the text around it: what the Agents pages link a node and an
 * agent with.
 */
export const RouteLink = routeLink(InheritedLink);

const LINK = 'underline decoration-outline hover:decoration-foreground';

/**
 * The kit's link in the colour of the text around it, and with no underline unless the caller's classes give one: the board's route
 * links are pills, rows and words alike, and each says its own underline, as the bare link they were drawn with did.
 */
function InheritedLink({ className, ...props }: LinkProps) {
  return <Link color="inherit" {...props} className={composeTailwindRenderProps(className, 'no-underline')} />;
}

/** The word for each origin an agent is read from. */
const AGENT_FROM: Readonly<Record<AgentListing['from'], string>> = {
  factory: "the factory's",
  repo: 'this repository',
  user: 'the user library',
  builtin: "Nemia's",
};

/** Where an agent is read from, as the Workflows page badges a workflow: yours, this repository's, the factory's or Nemia's. */
export function FromBadge({ from }: { from: AgentListing['from'] }) {
  return (
    <span
      data-from={from}
      className={cn(
        'rounded-full px-2 py-0.5 text-body-small leading-none font-medium',
        from === 'user' ? container.grey : 'bg-muted text-muted-foreground',
      )}
    >
      {AGENT_FROM[from]}
    </span>
  );
}

/**
 * A node that names an agent, or a step it fills, linked to its step's page: `workflow › step`; a repository's, a factory's own, and a
 * step of yours a factory hires it into, in the factory and repository the page is in, the default factory reading no repository.
 */
function NodeLink({ user }: { user: AgentUser | AgentFill }) {
  const here = usePagePlace();
  return (
    <RouteLink
      {...workflowLink(user.from === 'user' && !('hired' in user && user.hired) ? {} : here, user.from, user.workflow, user.step)}
      data-node={`${user.workflow}/${user.step}`}
      className={cn('font-mono text-body-small text-foreground', LINK)}
    >
      {user.workflow} <span className="text-muted-foreground">›</span> {user.step}
    </RouteLink>
  );
}

/**
 * Each node that names an agent, then each step it fills in the factory read that none of those is, hired there or named elsewhere: a step
 * by its workflow and its name, since a factory's tree is read as a repository's where a node names it.
 */
const nodesOf = ({ usedBy, fills }: Pick<AgentListing, 'usedBy' | 'fills'>) => {
  const keyOf = (node: AgentUser | AgentFill) => `${node.workflow}/${node.step}`;
  const drawn = new Set(usedBy.map(keyOf));
  const filled = fills.filter((fill, i) => !drawn.has(keyOf(fill)) && fills.findIndex((other) => keyOf(other) === keyOf(fill)) === i);
  return [...usedBy, ...filled];
};

/** The nodes that name an agent and the steps it fills in the factory read, each linked — or that none does. */
export function UsedBy({ listing, className }: { listing: Pick<AgentListing, 'usedBy' | 'fills'>; className?: string }) {
  const nodes = nodesOf(listing);
  return (
    <p data-used-by className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-small text-muted-foreground', className)}>
      {nodes.length ? (
        <>
          <span>Attached to</span>
          {nodes.map((user, i) => (
            <span key={`${user.from}/${user.workflow}/${user.step}`}>
              <NodeLink user={user} />
              {i < nodes.length - 1 && ','}
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
  if (!skills?.length) return none ? <p className="text-body-small text-muted-foreground">{none}</p> : null;
  return (
    <ul data-skills className={cn('space-y-1.5', className)}>
      {skills.map((skill) => (compact ? <CompactSkill key={skill.id} skill={skill} /> : <FullSkill key={skill.id} skill={skill} />))}
    </ul>
  );
}

/** One skill as an agent's page shows it: its name, what it is for, and its tags, on a line. */
function FullSkill({ skill }: { skill: AgentSkill }) {
  return (
    <li data-agent-skill={skill.id} className="text-body-small leading-snug">
      <span className="font-medium text-foreground">{skill.name}</span> <span className="text-muted-foreground">{skill.description}</span>
      {skill.tags.length > 0 && (
        <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
          {skill.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted px-1 py-px font-mono text-body-small text-muted-foreground">
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
    <li data-agent-skill={skill.id} className="text-body-medium leading-snug">
      <span className="block font-semibold text-foreground">{skill.name}</span>{' '}
      <span className="line-clamp-2 text-body-small text-muted-foreground">{skill.description}</span>
    </li>
  );
}

/**
 * An agent's name as a person's: its file's name, first letter up and dashes as spaces — `reviewer` is Reviewer, `note-writer` Note
 * writer.
 *
 * @param name the agent's file name, its words joined by dashes
 */
export const personOf = (name: string) => {
  const spaced = name.replaceAll('-', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const FACE = 'shrink-0 rounded-full bg-muted';

const PLATE = 'shrink-0 dark:[&>path]:opacity-25';

type FaceProps = { name: string; size: number; follows?: boolean; plate?: boolean; expression?: Expression; className?: string };

/**
 * An agent's face: a Blobatar drawn from its name, so the same agent has the same face wherever it shows, and no two names share one by
 * design. Named as a person is, for a screen reader: by its label, so the name is no text of the line it stands in and no tooltip, or with
 * `follows` by its title. `size` in pixels. It is an inline drawing alive at all times — it breathes, bobs, blinks and glances with nothing
 * hovering it — and with `follows` its eyes also turn toward the pointer; still where the person asked for reduced motion, and with no eyes
 * following where there is no fine pointer. It stands on a grey round, or with `plate` on Blobatar's own backdrop, in its face's colours,
 * dimmed in the dark theme. With `expression` it wears that pose of the library's, still breathing under it.
 */
export function AgentFace({ name, size, follows, plate, expression, className }: FaceProps) {
  if (follows) return <FollowingFace name={name} size={size} plate={plate} expression={expression} className={className} />;
  return (
    <Blobatar
      animate="always"
      name={name}
      size={size}
      expression={expression}
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
function FollowingFace({ name, size, plate, expression, className }: Omit<FaceProps, 'follows'>) {
  const { ref } = useGaze({ travel: 3, lookAt: 'pointer' });
  return (
    <Blobatar
      ref={ref}
      animate="always"
      name={name}
      size={size}
      expression={expression}
      background={plate ? 'squircle' : false}
      title={personOf(name)}
      data-agent-face={name}
      className={cn(plate ? PLATE : FACE, className)}
    />
  );
}

/**
 * A link to an agent's page, by name, its face beside it: what a node's form and a step's page link its agent with, in `place` where the
 * agent is a factory's own or a repository's (`definitionLink`), else the place the page is in.
 */
export function AgentLink({
  from,
  name,
  className,
  place,
}: {
  from: AgentListing['from'];
  name: string;
  className?: string;
  place?: PagePlace;
}) {
  const here = usePagePlace();
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <AgentFace name={name} size={16} />
      <RouteLink
        {...definitionLink('agent', from, name, place ?? here)}
        data-agent-link={name}
        className={cn('font-mono', LINK, className)}
      >
        {name}
      </RouteLink>
    </span>
  );
}

/** A factory that uses a library item, linked to its settings, where its adds are. */
function FactoryUserLink({ factory }: { factory: string }) {
  return (
    <RouteLink
      to="/factories/$factory/settings"
      params={{ factory }}
      data-factory-user={factory}
      className={cn('font-mono text-body-small text-foreground', LINK)}
    >
      {factory}
    </RouteLink>
  );
}

/**
 * A write of an agent refused: the package's words, and what still uses it when that is why, each linked — a node that names it, or a
 * factory that uses it from the library, at its settings, where its adds are taken off. `verb` is what did not
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
      <p className="text-body-medium font-medium text-on-failure-container">{verb}:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
      {users.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-body-small text-on-failure-container">
          <span>Open</span>
          {users.map((user) => {
            if (!user.includes('/')) return <FactoryUserLink key={user} factory={user} />;
            const [workflow = '', step = ''] = user.split('/');
            return <NodeLink key={user} user={{ from: sourceOf(from), workflow, step }} />;
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
      <p className="text-body-medium font-medium text-on-failure-container">Not written:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}

/**
 * A link to a skill's page, by its origin and name: what an agent's skills and the Agents page's skills link a skill with, in `place` where
 * the skill is a factory's own or a repository's (`definitionLink`), else the place the page is in.
 */
export function SkillLink({ from, name, className, place }: { from: SkillSource; name: string; className?: string; place?: PagePlace }) {
  const here = usePagePlace();
  return (
    <RouteLink {...definitionLink('skill', from, name, place ?? here)} data-skill-link={name} className={cn('font-mono', LINK, className)}>
      {name}
    </RouteLink>
  );
}

/**
 * Where a skill an agent is given is found: your library, the repository, Nemia's builtin ones — or nowhere, which the package refuses on
 * save. One with no page that the repository has all the same (`foundIn`, a skill named with its folder) is the repository's too,
 * marked `folder`.
 */
export function SkillSourceBadge({ from, foundIn = null }: { from: SkillSource | null; foundIn?: string | null }) {
  const folder = from === null && foundIn !== null;
  const lost = from === null && !folder;
  return (
    <span
      data-skill-from={folder ? 'folder' : (from ?? 'none')}
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-body-small leading-none font-medium',
        from === 'user' && container.grey,
        (from === 'repo' || folder) && 'bg-muted text-muted-foreground',
        from === 'builtin' && hairline,
        lost && container.failure,
      )}
    >
      {folder ? SOURCE_BADGES.repo : from ? SOURCE_BADGES[from] : 'not found'}
    </span>
  );
}

/**
 * The skills an agent gives, one row each in its order: its name, linked to its page where it has one and as its line writes it where
 * it has none, where it is found — for one named with its folder, the folder it is read from — what it is for, and what it costs a
 * turn — or why no session can be given it, in the package's words. `action` draws what a row offers beside it (the picker's Remove);
 * read-only, nothing.
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
      <p data-given-none className="text-body-small text-muted-foreground">
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
                <SkillLink from={row.from} name={row.name} className="text-body-small font-medium text-foreground" />
              ) : (
                <span className="font-mono text-body-small font-medium text-foreground">{row.name}</span>
              )}
              <SkillSourceBadge from={row.from} foundIn={row.foundIn} />
            </p>
            {row.from === null && row.foundIn !== null && (
              <p data-found-in className="text-body-small text-muted-foreground">
                Read from <code className="font-mono break-all">{row.foundIn}</code>
              </p>
            )}
            {row.entry && <p className="text-body-small text-muted-foreground">{row.entry.description}</p>}
            {row.error !== null && (
              <p data-given-error className="font-mono text-body-small whitespace-pre-wrap break-words text-failure">
                {row.error}
              </p>
            )}
            {row.cost && (
              <p data-skill-cost className="text-body-small text-muted-foreground">
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

/**
 * Where an agent's page or a skill's (`kind`) is, in `place`, the factory and the repository it is read in: its factory where it names
 * one, the list of its kind there (the factory's Agents or Skills, else the store's Agents, at its skills for a skill), and the page
 * itself, by its `name`: the definition's, or what a new one's page is called.
 */
export function DefinitionTrail({ kind, name, place }: { kind: 'agent' | 'skill'; name: string; place: PagePlace }) {
  const factory = place.factory;
  const list =
    factory === undefined
      ? { name: kind === 'agent' ? 'Agents' : 'Skills', to: linkOptions({ to: '/agents', ...(kind === 'skill' && { hash: 'skills' }) }) }
      : kind === 'agent'
        ? { name: 'Agents', to: linkOptions({ to: '/factories/$factory/agents', params: { factory } }) }
        : { name: 'Skills', to: linkOptions({ to: '/factories/$factory/skills', params: { factory } }) };
  return <Trail levels={[...factoryLevel(factory), list, { name }]} />;
}
