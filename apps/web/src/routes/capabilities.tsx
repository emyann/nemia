import type { ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { CapabilitiesUnread } from 'objects';
import { when } from '../components/step/Facts';
import { FactoryPicker } from '../components/factory/FactoryPicker';
import { ServerState } from '../components/factory/FactoryServers';
import { AllowedReach, ASKS, CHIP, PLAIN, Reach, STRUCK } from '../components/step/Reach';
import {
  capabilitiesQuery,
  type Capabilities,
  type Described,
  type McpServer,
  type MeasuredTools,
  type ReadOnlyCommands,
  type StepReach,
} from '../lib/api/capabilities.ts';
import { pagePlaceOf } from '../lib/factories';
import { repoName } from '../lib/factory';
import { container, hairline } from '../lib/meaning';

export const Route = createFileRoute('/capabilities')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ factory: search.factory, repo: search.repo }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(capabilitiesQuery(pagePlaceOf(deps))),
  component: CapabilitiesPage,
  pendingComponent: () => (
    <p className="text-body-medium text-muted-foreground">Reading the repository, and asking each MCP server it enables for its tools…</p>
  ),
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the capabilities: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/**
 * What the repository of the address's place offers a step (`?factory=`, `?repo=`), section by section, each thing with the file it was
 * read from; where the api reads none, why and what to do (`Unread`), and no section.
 */
function CapabilitiesPage() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(capabilitiesQuery(pagePlaceOf(search)));
  const { repo, unread, skills, agents, mcp, denied, asked, warnings, measured, readOnly, steps } = data;
  if (unread !== undefined || repo === undefined) return <Unread unread={unread} search={search} />;

  return (
    <article className="space-y-8">
      <p className="text-body-medium text-muted-foreground">
        What this repository offers a step, read from <code className="font-mono text-body-small">{repo}</code>. What a step was actually
        given is on its run's page.
      </p>

      {warnings.map((warning) => (
        <p key={warning} className="rounded bg-surface-container-highest px-3 py-2 text-body-medium text-on-surface-variant">
          {warning}
        </p>
      ))}

      <Section
        title="Skills"
        count={skills.length}
        empty={
          <>
            No skills: nothing matches <Path path=".claude/skills/*/SKILL.md" />.
          </>
        }
      >
        {skills.map((skill) => (
          <DescribedRow key={skill.source} item={skill} />
        ))}
      </Section>

      <Section
        title="Agents"
        count={agents.length}
        empty={
          <>
            No agents: nothing matches <Path path=".claude/agents/*.md" />.
          </>
        }
      >
        {agents.map((agent) => (
          <DescribedRow key={agent.source} item={agent} />
        ))}
      </Section>

      <Section
        title="MCP servers"
        count={mcp.length}
        empty={
          <>
            No MCP servers: <Path path=".mcp.json" /> declares none.
          </>
        }
      >
        {mcp.map((server) => (
          <ServerRow key={server.name} server={server} />
        ))}
      </Section>

      <Section
        title="Denied"
        count={denied.length}
        empty={
          <>
            Nothing denied: <Path path=".claude/settings.json" /> has no <code className="font-mono text-body-small">permissions.deny</code>
            .
          </>
        }
      >
        {denied.map(({ rule, source }) => (
          <RuleRow key={rule} rule={rule} source={source} refuses={refusedBy(mcp, rule)} />
        ))}
      </Section>

      <Section
        title="Asks"
        count={asked.length}
        empty={
          <>
            Nothing asks by a rule: <Path path=".claude/settings.json" /> has no{' '}
            <code className="font-mono text-body-small">permissions.ask</code>.
          </>
        }
      >
        {asked.map(({ rule, source }) => (
          <RuleRow key={rule} rule={rule} source={source} />
        ))}
      </Section>

      <Section
        title="What each step gets"
        count={steps.length}
        empty={
          <>
            No steps: no workflow under <Path path="workflows/" />, or yours, reads as one.
          </>
        }
      >
        {steps.map((step) => (
          <StepRow key={`${step.from}:${step.workflow}/${step.step}`} step={step} measured={measured} readOnly={readOnly} />
        ))}
      </Section>
    </article>
  );
}

const LINK = 'underline underline-offset-2';

/**
 * Why the page reads no repository, and what to do, as the api says it (`CapabilitiesUnread`): for several factories, the factory picker
 * beside the sentence, a pick reading this page in the factory picked; for a factory on several repositories, each a link to this page on
 * it (`?repo=`); for no factory, the lines that file one. An answer with neither a repository nor a reason says only that it read none.
 */
function Unread({ unread, search }: { unread: CapabilitiesUnread | undefined; search: Record<string, unknown> }) {
  return (
    <article data-unread={unread?.reason ?? 'none'} className="flex flex-col gap-4">
      <p className="text-body-medium text-muted-foreground">{unread?.message ?? 'The api read no repository for this page.'}</p>
      {unread?.reason === 'several-factories' && <FactoryPicker path="/capabilities" search={search} picked={undefined} />}
      {unread?.reason === 'several-repositories' && unread.factory !== null && (
        <ul className="flex flex-col gap-1">
          {unread.repos.map((repo) => (
            <li key={repo} title={repo}>
              <Link
                to="/capabilities"
                search={{ factory: unread.factory ?? undefined, repo }}
                data-pick-repo={repo}
                className={`font-mono text-body-medium ${LINK}`}
              >
                {repoName(repo)}
              </Link>{' '}
              <span className="font-mono text-body-small text-muted-foreground">{repo}</span>
            </li>
          ))}
        </ul>
      )}
      {unread?.reason === 'no-factory' && (
        <ul className="flex flex-col gap-1">
          {unread.commands.map((line) => (
            <li key={line}>
              <code data-command className="font-mono text-body-small">
                {line}
              </code>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="flex items-center gap-2 text-title-small">
        {title}
        <span
          data-count
          className="rounded-full bg-muted px-2 py-0.5 font-mono text-body-small leading-none tabular-nums text-muted-foreground"
        >
          {count}
        </span>
      </h2>
      {count > 0 ? (
        <ul className="divide-y divide-outline-variant rounded-lg border border-outline-variant">{children}</ul>
      ) : (
        <p className="text-body-medium text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** Where a thing was read from, relative to the repository. */
const Path = ({ path }: { path: string }) => <code className="font-mono text-body-small text-muted-foreground">{path}</code>;

function DescribedRow({ item }: { item: Described }) {
  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="font-medium">{item.name}</p>
        <Path path={item.source} />
      </div>
      {item.description ? (
        <p className="text-body-medium text-muted-foreground">{item.description}</p>
      ) : (
        <p className="text-body-medium italic text-muted-foreground">No description</p>
      )}
    </li>
  );
}

/**
 * One MCP server of the checkout's `.mcp.json`. Where the **default factory** — the one every run and card that names none runs in —
 * records a server of the same name, the same state chip the factory's settings page draws is drawn here (`ServerState`); a server it
 * does not record has no sign-in of ours to show, and gets none.
 */
function ServerRow({ server }: { server: McpServer }) {
  const { name, enabled, tools, error, notAsked, checkedAt, factoryState } = server;

  return (
    <li aria-label={`MCP server ${name}`} className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{name}</span>
        {factoryState !== null && <ServerState state={factoryState} />}
        <span
          className={`${CHIP} ${enabled ? container.sage : hairline}`}
          title={enabled ? 'Enabled by .claude/settings.json' : 'Not enabled by .claude/settings.json'}
        >
          {enabled ? 'enabled' : 'not enabled'}
        </span>
        {tools && <span className="text-body-small text-muted-foreground">{tools.length === 1 ? '1 tool' : `${tools.length} tools`}</span>}
        <span className="ml-auto">
          <Path path={server.source} />
        </span>
      </div>

      <p className="break-all font-mono text-body-small text-foreground">
        {server.command ? [server.command, ...server.args].join(' ') : server.url}
      </p>

      {notAsked && <p className="text-body-medium text-muted-foreground">{notAsked}</p>}

      {error && (
        <pre className="whitespace-pre-wrap break-words rounded bg-failure-container p-2 font-mono text-body-small leading-snug text-on-failure-container">
          {error}
        </pre>
      )}

      {tools &&
        (tools.length > 0 ? (
          <ul className="divide-y divide-outline-variant">
            {tools.map((tool) => (
              <li
                key={tool.name}
                data-denied={tool.denied ?? undefined}
                className="grid grid-cols-1 gap-x-4 py-1 @md/page:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
              >
                <span className="flex min-w-0 items-center gap-2 font-mono text-body-small" title={`mcp__${name}__${tool.name}`}>
                  <span className={tool.denied ? 'truncate line-through decoration-outline' : 'truncate'}>{tool.name}</span>
                  {tool.denied && (
                    <span className={`${CHIP} ${container.grey}`} title={`Denied by ${tool.denied} in .claude/settings.json`}>
                      denied
                    </span>
                  )}
                </span>
                <span className="truncate text-body-medium text-muted-foreground" title={tool.description ?? undefined}>
                  {tool.description?.split('\n')[0] ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-medium text-muted-foreground">It lists no tools.</p>
        ))}

      {checkedAt && (
        <p className="text-body-small text-muted-foreground">
          Asked {when(checkedAt)}. The api asks each server once while it runs: restart it, or change the server's entry in{' '}
          <Path path=".mcp.json" />, to ask again.
        </p>
      )}
    </li>
  );
}

/** The servers a step's fence names, as its line reads: the names, or that it names none and so loads none. */
const serversNamed = (names: readonly string[]): string => names.join(', ') || 'none named: its sessions load no server';

/** The tools of the listed servers that `rule` is the one to refuse, by server. */
const refusedBy = (mcp: Capabilities['mcp'], rule: string): string[] =>
  mcp.flatMap((server) => (server.tools ?? []).filter((tool) => tool.denied === rule).map((tool) => `${server.name} · ${tool.name}`));

/** A rule of the settings — a deny, with the listed tools it refuses, or an ask rule — and where it was read. */
function RuleRow({ rule, source, refuses = [] }: { rule: string; source: string; refuses?: string[] }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-2">
      <span className="break-all font-mono text-body-small">{rule}</span>
      {refuses.length > 0 && (
        <span className="text-body-small text-muted-foreground">
          refuses {refuses.length > 3 ? `${refuses.length} listed tools` : refuses.join(', ')}
        </span>
      )}
      <span className="ml-auto">
        <Path path={source} />
      </span>
    </li>
  );
}

const OWN = "the harness's own";

/**
 * What one step of a workflow gets: the fence its file declares, its mode under its harness's own name (Codex's sandbox, Claude Code's
 * permission mode), then — on Claude Code, whose set was measured — the tools it has (what was only inferred, dashed), the skills it can
 * load, the tools of each server the checkout enables, the deny and ask rules that hold for it, and what it runs without asking: Claude
 * Code's read-only commands, and what the settings allow it. A server's tool is refused where a rule denies it, where the step runs in
 * `dontAsk` and no rule allows it, and where an ask rule makes it ask while something denies an ask without a prompt (`askDenier`:
 * `dontAsk`, or a job). A Codex step is its fence and nothing more: it reads no settings, and what a Codex session is given was not
 * measured.
 */
function StepRow({ step, measured, readOnly }: { step: StepReach; measured: MeasuredTools; readOnly: ReadOnlyCommands }) {
  const { fence, tools, skills, mcp, denied, asked, allowed } = step;
  const whyInferred = new Map(measured.inferred.map((t) => [t.name, t.why]));

  return (
    <li aria-label={`Step ${step.workflow} · ${step.step}`} data-step={`${step.workflow}/${step.step}`} className="space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {step.workflow} <span className="text-muted-foreground">·</span> {step.step}
        </span>
        <span className={`${CHIP} bg-muted text-muted-foreground`}>{step.harness}</span>
        {step.from === 'yours' && <span className={`${CHIP} ${container.grey}`}>yours</span>}
      </div>

      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-body-small">
        {(
          [
            ['tools', fence.tools ? fence.tools.join(', ') || 'none' : `${OWN} set`],
            ['disallowed tools', fence.disallowedTools.join(', ') || 'nothing'],
            ['allowed tools', fence.allowedTools.join(', ') || 'nothing'],
            step.harness === 'codex' ? ['sandbox', fence.sandbox ?? OWN] : ['permission mode', fence.permissionMode ?? OWN],
            ['effort', fence.effort ?? OWN],
            ['mcp', serversNamed(fence.mcp)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-mono">{value}</dd>
          </div>
        ))}
      </dl>

      {!step.claudeCode ? (
        <p data-not-claimed className="text-body-medium text-muted-foreground">
          Runs on {step.harness}, which has no tool list: its fence is its sandbox, the step's <span className="font-mono">sandbox:</span>.
          What a {step.harness} session is given was not measured, so no tool, skill or server is claimed for it. {allowed.why}
        </p>
      ) : (
        <>
          {tools && (
            <Reach label="Tools">
              <span className="flex flex-wrap gap-1">
                {tools.names.map((name) => {
                  const inferred = tools.inferred.includes(name);
                  return (
                    <span
                      key={name}
                      data-tool={name}
                      data-inferred={inferred || undefined}
                      title={inferred ? `Inferred, not measured. ${whyInferred.get(name) ?? ''}` : undefined}
                      className={`${CHIP} ${inferred ? 'border border-dashed border-outline text-muted-foreground' : PLAIN}`}
                    >
                      {name}
                    </span>
                  );
                })}
                {tools.removed.map((r) => (
                  <span
                    key={r.name}
                    data-removed={r.name}
                    title={`Denied by ${r.rule} (${r.source})${r.of ? `, one of ${r.of}` : ''}`}
                    className={`${CHIP} ${STRUCK}`}
                  >
                    {r.name}
                  </span>
                ))}
              </span>
              {tools.from === 'measured' && (
                <p data-measured={measured.measuredAt} className="text-body-small text-muted-foreground">
                  {measured.harness}'s own set. The solid ones as measured on {measured.measuredAt} with {measured.version} (
                  {measured.source}), which found it without {measured.lacks.join(' or ')}. The dashed ones are inferred, not measured: each
                  says why. Not asked again: a later version may give another.
                </p>
              )}
            </Reach>
          )}

          {skills && (
            <Reach label="Skills">
              {skills.why ? (
                <p className="text-body-small text-muted-foreground">{skills.why}</p>
              ) : skills.names.length ? (
                <span className="flex flex-wrap gap-1">
                  {skills.names.map((name) => (
                    <span key={name} data-skill={name} className={`${CHIP} ${PLAIN}`}>
                      {name}
                    </span>
                  ))}
                </span>
              ) : (
                <p className="text-body-small text-muted-foreground">The repository has no skill.</p>
              )}
            </Reach>
          )}

          {mcp && (
            <Reach label="MCP tools">
              {mcp.length ? (
                mcp.map((server) => (
                  <div key={server.server} data-server={server.server} className="space-y-1">
                    <p className="font-mono text-body-small">{server.server}</p>
                    {server.tools ? (
                      <span className="flex flex-wrap gap-1">
                        {server.tools.map((tool) => {
                          const refused =
                            tool.denied !== null ||
                            (allowed.dontAsk && !tool.allowed) ||
                            (allowed.askDenier !== null && tool.asks !== null);
                          return (
                            <span
                              key={tool.name}
                              data-mcp-tool={tool.name}
                              data-denied={tool.denied?.rule}
                              data-asks={tool.asks?.rule}
                              data-not-allowed={tool.denied === null && allowed.dontAsk && !tool.allowed ? true : undefined}
                              title={
                                tool.denied
                                  ? `Denied by ${tool.denied.rule} (${tool.denied.source})`
                                  : tool.asks
                                    ? `Asks by ${tool.asks.rule} (${tool.asks.source})${refused ? `, so ${allowed.askDenier} denies it without a prompt` : ''}`
                                    : refused
                                      ? 'No rule allows it, so dontAsk denies it without a prompt'
                                      : `mcp__${server.server}__${tool.name}`
                              }
                              className={`${CHIP} ${tool.denied ? STRUCK : refused ? ASKS : PLAIN}`}
                            >
                              {tool.name}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <p className="text-body-small text-muted-foreground">{server.why}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-body-small text-muted-foreground">No server is named for it: its sessions load none.</p>
              )}
            </Reach>
          )}

          <Reach label="Denied">
            {denied.length ? (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                {denied.map(({ rule, source }) => (
                  <span key={`${source}:${rule}`} className="font-mono text-body-small" title={source}>
                    {rule} <span className="text-muted-foreground">· {source}</span>
                  </span>
                ))}
              </span>
            ) : (
              <p className="text-body-small text-muted-foreground">Nothing: the settings deny nothing, and neither does the step.</p>
            )}
          </Reach>

          {asked.length > 0 && (
            <Reach label="Asks">
              <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                {asked.map(({ rule, source }) => (
                  <span key={rule} data-ask-rule={rule} className="font-mono text-body-small" title={source}>
                    {rule} <span className="text-muted-foreground">· {source}</span>
                  </span>
                ))}
              </span>
              <p className="text-body-small text-muted-foreground">
                What these match asks, whatever an allow or the harness&apos;s own leave says
                {allowed.askDenier ? `, and ${allowed.askDenier} denies it without a prompt` : ''}.
              </p>
            </Reach>
          )}

          <AllowedReach allowed={allowed} readOnly={step.readOnly} commands={readOnly} />
        </>
      )}
    </li>
  );
}
