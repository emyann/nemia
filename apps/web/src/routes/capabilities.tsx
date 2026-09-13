import type { ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { when } from '../components/Facts';
import { capabilitiesQuery, type Capabilities, type Described, type McpServer } from '../lib/api';

export const Route = createFileRoute('/capabilities')({
  loader: ({ context }) => context.queryClient.ensureQueryData(capabilitiesQuery),
  component: CapabilitiesPage,
  pendingComponent: () => (
    <p className="text-sm text-neutral-500">Reading the repository, and asking each MCP server it enables for its tools…</p>
  ),
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the capabilities: {error instanceof Error ? error.message : String(error)}. Is the api running
      (<code>npm run dev</code>)?
    </p>
  ),
});

/** What the repository offers a step, section by section, each thing with the file it was read from. */
function CapabilitiesPage() {
  const { data } = useSuspenseQuery(capabilitiesQuery);
  const { repo, skills, agents, mcp, denied, warnings } = data;

  return (
    <article className="space-y-8">
      <p className="text-sm text-neutral-500">
        What this repository offers a step, read from <code className="font-mono text-xs">{repo}</code>. What a step was
        actually given is on its run's page.
      </p>

      {warnings.map((warning) => (
        <p key={warning} className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {warning}
        </p>
      ))}

      <Section title="Skills" count={skills.length} empty={<>No skills: nothing matches <Path path=".claude/skills/*/SKILL.md" />.</>}>
        {skills.map((skill) => <DescribedRow key={skill.source} item={skill} />)}
      </Section>

      <Section title="Agents" count={agents.length} empty={<>No agents: nothing matches <Path path=".claude/agents/*.md" />.</>}>
        {agents.map((agent) => <DescribedRow key={agent.source} item={agent} />)}
      </Section>

      <Section title="MCP servers" count={mcp.length} empty={<>No MCP servers: <Path path=".mcp.json" /> declares none.</>}>
        {mcp.map((server) => <ServerRow key={server.name} server={server} />)}
      </Section>

      <Section
        title="Denied"
        count={denied.length}
        empty={<>Nothing denied: <Path path=".claude/settings.json" /> has no <code className="font-mono text-xs">permissions.deny</code>.</>}
      >
        {denied.map(({ rule, source }) => <DeniedRow key={rule} rule={rule} source={source} refuses={refusedBy(mcp, rule)} />)}
      </Section>
    </article>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        {title}
        <span
          data-count
          className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] leading-none tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {count}
        </span>
      </h2>
      {count > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {children}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">{empty}</p>
      )}
    </section>
  );
}

/** Where a thing was read from, relative to the repository. */
const Path = ({ path }: { path: string }) => <code className="font-mono text-[11px] text-neutral-500">{path}</code>;

function DescribedRow({ item }: { item: Described }) {
  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="font-medium">{item.name}</p>
        <Path path={item.source} />
      </div>
      {item.description ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{item.description}</p>
      ) : (
        <p className="text-sm italic text-neutral-400 dark:text-neutral-500">No description</p>
      )}
    </li>
  );
}

const CHIP = 'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap';

function ServerRow({ server }: { server: McpServer }) {
  const { name, enabled, tools, error, notAsked, checkedAt } = server;

  return (
    <li aria-label={`MCP server ${name}`} className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{name}</span>
        <span
          className={`${CHIP} ${enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}
          title={enabled ? 'Enabled by .claude/settings.json' : 'Not enabled by .claude/settings.json'}
        >
          {enabled ? 'enabled' : 'not enabled'}
        </span>
        {tools && <span className="text-xs text-neutral-500">{tools.length === 1 ? '1 tool' : `${tools.length} tools`}</span>}
        <span className="ml-auto">
          <Path path={server.source} />
        </span>
      </div>

      <p className="break-all font-mono text-xs text-neutral-700 dark:text-neutral-300">
        {server.command ? [server.command, ...server.args].join(' ') : server.url}
      </p>

      {notAsked && <p className="text-sm text-neutral-500">{notAsked}</p>}

      {error && (
        <pre className="whitespace-pre-wrap break-words rounded bg-red-50 p-2 font-mono text-[11px] leading-snug text-red-800 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </pre>
      )}

      {tools &&
        (tools.length > 0 ? (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {tools.map((tool) => (
              <li
                key={tool.name}
                data-denied={tool.denied ?? undefined}
                className="grid grid-cols-1 gap-x-4 py-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
              >
                <span className="flex min-w-0 items-center gap-2 font-mono text-xs" title={`mcp__${name}__${tool.name}`}>
                  <span className={tool.denied ? 'truncate line-through decoration-red-500' : 'truncate'}>{tool.name}</span>
                  {tool.denied && (
                    <span className={`${CHIP} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300`} title={`Denied by ${tool.denied} in .claude/settings.json`}>
                      denied
                    </span>
                  )}
                </span>
                <span className="truncate text-sm text-neutral-600 dark:text-neutral-400" title={tool.description ?? undefined}>
                  {tool.description?.split('\n')[0] ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">It lists no tools.</p>
        ))}

      {checkedAt && (
        <p className="text-xs text-neutral-500">
          Asked {when(checkedAt)}. The api asks each server once while it runs: restart it, or change the server's entry in{' '}
          <Path path=".mcp.json" />, to ask again.
        </p>
      )}
    </li>
  );
}

/** The tools of the listed servers that `rule` is the one to refuse, by server. */
const refusedBy = (mcp: Capabilities['mcp'], rule: string): string[] =>
  mcp.flatMap((server) => (server.tools ?? []).filter((tool) => tool.denied === rule).map((tool) => `${server.name} · ${tool.name}`));

function DeniedRow({ rule, source, refuses }: { rule: string; source: string; refuses: string[] }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-2">
      <span className="break-all font-mono text-xs">{rule}</span>
      {refuses.length > 0 && (
        <span className="text-xs text-neutral-500">
          refuses {refuses.length > 3 ? `${refuses.length} listed tools` : refuses.join(', ')}
        </span>
      )}
      <span className="ml-auto">
        <Path path={source} />
      </span>
    </li>
  );
}
