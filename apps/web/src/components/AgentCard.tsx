import type { AgentListing, AgentRoleKey } from '../lib/api';
import { AgentFace, FromBadge, personOf, RouteLink, Skills, UsedBy } from './AgentParts';
import { FactoryTags } from './FactoryTag';

/** The keys a character card shows, as its stats: what its sessions think with, how hard, and where they run. */
const STATS: readonly AgentRoleKey[] = ['model', 'effort', 'harness'];

/**
 * One agent as a character card: its face large on its own plate, its name as a person's with the job it holds, what it is for, what it
 * can do, its model, effort and harness where it sets them, the factories it fills a step in, each linked to its floor — nothing for none,
 * or where the listing does not say — and the nodes that name it. The whole card opens the agent's page, where every other key, the skills
 * it gives and what becomes of Claude Code's own prompt are; its name is the link there, stretched over the card, and the factories' and
 * the nodes' links sit above it.
 */
export function AgentCard({ agent }: { agent: AgentListing & { factories?: readonly string[] } }) {
  return (
    <section
      aria-label={`Agent ${agent.name}`}
      data-agent={agent.name}
      data-from={agent.from}
      data-agent-card
      className="relative flex h-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10 transition-shadow hover:shadow-md hover:ring-foreground/20"
    >
      <div className="flex justify-center bg-neutral-100/70 pt-6 pb-4 dark:bg-white/5">
        <AgentFace name={agent.name} size={112} follows plate className="drop-shadow-sm" />
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
        <header className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-lg leading-tight font-semibold">
            <RouteLink
              to="/agents/$from/$agent"
              params={{ from: agent.from, agent: agent.name }}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
            >
              {personOf(agent.name)}
            </RouteLink>
          </h3>
          <p data-agent-role className="text-xs text-muted-foreground">
            {agent.role ?? 'No role yet'} · <span className="font-mono">{agent.name}</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <FromBadge from={agent.from} />
            <FactoryTags names={agent.factories ?? []} linked className="relative z-10" />
          </div>
        </header>
        {agent.description && <p className="text-center text-sm text-foreground">{agent.description}</p>}
        {agent.error === null &&
          (agent.cardError !== null ? (
            <p data-card-error className="font-mono text-xs break-words text-red-700 dark:text-red-400">
              {agent.cardError}
            </p>
          ) : (
            <Skills skills={agent.card} compact className="space-y-2" />
          ))}
        {agent.error !== null ? (
          <p className="font-mono text-xs break-words text-red-700 dark:text-red-400">{agent.error}</p>
        ) : (
          <Stats keys={agent.keys} />
        )}
        <UsedBy listing={agent} className="relative z-10 mt-auto border-t border-neutral-200 pt-3 dark:border-neutral-800" />
      </div>
    </section>
  );
}

/** A card's stats: the model, effort and harness its agent sets, each named, in that order; nothing where it sets none of them. */
function Stats({ keys }: { keys: AgentListing['keys'] }) {
  const set = STATS.filter((key) => keys[key] !== undefined);
  if (!set.length) return null;
  return (
    <dl data-agent-stats className="flex flex-wrap gap-1.5 text-[11px] leading-none">
      {set.map((key) => (
        <div key={key} className="flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-1 dark:bg-neutral-800">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="font-mono font-medium text-foreground">{keys[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
