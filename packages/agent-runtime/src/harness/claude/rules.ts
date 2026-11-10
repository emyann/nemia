/**
 * Claude Code's permission rules as it matches them, and the tool sets measured on it: what a caller showing what a session of it may
 * reach reads, through `CLAUDE_DECLARATION.rules`, rather than matching rules a second time.
 *
 * Rules are matched as Claude Code's permissions docs say it matches them (code.claude.com/docs/en/permissions): deny, then ask, then
 * allow, whatever their specificity, so a deny takes back every allow whose calls it matches, and an ask rule every allow it matches; in
 * a Bash rule `*` is any text, spaces included, and `:*` at the end is a trailing ` *`, which also matches the bare command; a rule
 * naming a tool whole — `Bash`, or `Bash(*)` — as a deny, removes the tool. The tool sets are data of the day and the version they were
 * measured on, each held to its shape by `dated` as the module loads.
 *
 * Pure, importing nothing, so `agent-runtime/vocabulary` carries it (`test/vocabulary-door.test.ts`).
 */

/**
 * A permission rule as Claude Code reads one: the tool, and what its parentheses scope — null for a rule naming the tool whole, as `Bash`
 * and `Bash(*)` both do. Null for a rule that names no built-in tool so, an MCP server's (`mcp__<server>__<tool>`) among them.
 */
function ruleOf(rule: string): { tool: string; scope: string | null } | null {
  const [, tool, scope] = /^([A-Za-z][A-Za-z0-9]*)(?:\(([\s\S]*)\))?$/.exec(rule) ?? [];
  if (tool === undefined) return null;
  return { tool, scope: scope === undefined || scope === '*' ? null : scope };
}

/** A Bash rule's scope in one spelling: `:*` at its end is a trailing ` *`. Anywhere else a colon is a colon. */
const bashPattern = (scope: string): string => (scope.endsWith(':*') ? `${scope.slice(0, -2)} *` : scope);

/** The bare command a pattern whose only wildcard is a trailing ` *` matches too — `git log` for `git log *` — or null. */
const bareOf = (pattern: string): string | null =>
  pattern.endsWith(' *') && pattern.indexOf('*') === pattern.length - 1 ? pattern.slice(0, -2) : null;

/**
 * Whether a Bash pattern matches a command, as Claude Code matches one: `*` any text, spaces included; with no `*`, that command exactly.
 */
function bashMatches(pattern: string, command: string): boolean {
  const glob = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]*')}$`,
  );
  return glob.test(command) || bareOf(pattern) === command;
}

/**
 * Whether the Bash rule scoped `outer` matches every command the rule scoped `inner` matches, each as its rule writes it (`git:*`,
 * `git diff:*`, `npm run build`). Read off `inner`'s text with each `*` of it taken as written: `outer`'s own characters are never a `*`,
 * so where `outer` matches that text, each `*` of `inner` falls inside a wildcard of `outer`, which matches whatever it stands for. And the
 * bare command a trailing ` *` of `inner` matches, `outer` must match too.
 * Exported only for the tests that import it.
 */
export function bashCovers(outer: string, inner: string): boolean {
  const [o, i] = [bashPattern(outer), bashPattern(inner)];
  const bare = bareOf(i);
  return bashMatches(o, i) && (bare === null || bashMatches(o, bare));
}

/**
 * A rule naming an MCP server's tools: the server, and one tool — null for every tool of it, as `mcp__<server>` and `mcp__<server>__*` both
 * are.
 */
function mcpRuleOf(rule: string): { server: string; tool: string | null } | null {
  const [, server, tool] = /^mcp__(.+?)(?:__(.+))?$/.exec(rule) ?? [];
  return server === undefined ? null : { server, tool: tool === undefined || tool === '*' ? null : tool };
}

/**
 * The rule in `deny` that refuses the tool `mcp__<server>__<tool>`, if one does: one naming the tool, the whole
 * server (`mcp__<server>`), or every tool of it (`mcp__<server>__*`). A rule naming a prefix of either refuses nothing.
 * Exported only for the tests that import it.
 */
export function denyingRule(deny: readonly string[], server: string, tool: string): string | null {
  const prefix = `mcp__${server}`;
  return deny.find((rule) => rule === `${prefix}__${tool}` || rule === prefix || rule === `${prefix}__*`) ?? null;
}

/**
 * The deny rule of `over` that takes an allow rule back whole, or undefined — and, given the ask rules, the ask rule that does, since ask
 * too comes before allow. Deny comes before allow whatever either's specificity, so a deny takes back the allow when it matches every
 * call the allow does: one of the same words; one naming the allow's tool whole; a Bash deny that covers the allow's commands
 * (`bashCovers`); a deny of the whole of an MCP server, over an allow of one of its tools or of all of them — a server's tool read as
 * `denyingRule` reads it, so a tool's row and the allow rules say the same.
 * Exported only for the tests that import it.
 */
export function takenBackBy<R extends { readonly rule: string }>(allow: string, over: readonly R[]): R | undefined {
  const server = mcpRuleOf(allow);
  const a = ruleOf(allow);
  return over.find((d) => {
    if (d.rule === allow) return true;
    if (server) {
      if (server.tool !== null) return denyingRule([d.rule], server.server, server.tool) !== null;
      const x = mcpRuleOf(d.rule);
      return x !== null && x.server === server.server && x.tool === null;
    }
    const r = ruleOf(d.rule);
    if (!a || !r || r.tool !== a.tool) return false;
    return r.scope === null || (a.tool === 'Bash' && a.scope !== null && bashCovers(r.scope, a.scope));
  });
}

/**
 * The deny rules of `over` narrower than an allow that stands, which still refuse some of what it allows — or, given the ask rules, those
 * that still make some of it ask: a Bash deny among a Bash allow's commands (`bashCovers`), and a deny of one tool of a server an allow
 * names whole.
 * Exported only for the tests that import it.
 */
export function narrowerRules(allow: string, over: readonly { readonly rule: string }[]): string[] {
  const server = mcpRuleOf(allow);
  const a = ruleOf(allow);
  return over
    .filter((d) => {
      if (server) {
        const x = mcpRuleOf(d.rule);
        return server.tool === null && x !== null && x.server === server.server && x.tool !== null;
      }
      const x = ruleOf(d.rule);
      return a?.tool === 'Bash' && x?.tool === 'Bash' && x.scope !== null && (a.scope === null || bashCovers(a.scope, x.scope));
    })
    .map((d) => d.rule);
}

/**
 * The modes a job was measured in on Claude Code 2.1.280, each denying what would ask and carrying on (docs/open-issues.md, "Claude
 * Code as a job") — none given being the engine's `auto`. `bypassPermissions` was not measured, so nothing is claimed of a job in it.
 */
const JOB_MEASURED: ReadonlySet<string | null> = new Set([null, 'auto', 'dontAsk', 'default', 'acceptEdits']);

/**
 * Whether a job of Claude Code — every session of it run on the Agent SDK, which answers a call that would ask by denying it, as no
 * person is there — was measured denying what asks in `permissionMode` (`JOB_MEASURED`), none given being null.
 * Exported only for the tests that import it.
 */
export const jobDeniesAsksIn = (permissionMode: string | null): boolean => JOB_MEASURED.has(permissionMode);

/**
 * What a measurement carries so that it is never read as current: the harness it was taken on, that harness's version, the day, and where
 * it is recorded.
 */
export type Dated = { harness: string; version: string; measuredAt: string; source: string };

/**
 * `measurement`, refused unless it says what it was taken on and when: a harness named, a version numbered as Claude Code numbers its own
 * (`2.1.272`), a day that is on the calendar, written `YYYY-MM-DD` — not the 30th of February — and where it is recorded. A list without
 * them reads as a claim about today, which nothing here can check: a reader says which day and which version, and those are all that
 * hold it to what was measured.
 * Exported only for the tests that import it.
 */
export function dated<T extends Dated>(name: string, measurement: T): T {
  const { harness, version, measuredAt, source } = measurement as Partial<Dated>;
  const said = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
  const at = said(measuredAt) && /^\d{4}-\d{2}-\d{2}$/.test(measuredAt) ? new Date(`${measuredAt}T00:00:00Z`) : null;
  const day = at !== null && !Number.isNaN(at.getTime()) && at.toISOString().startsWith(measuredAt as string);
  const wrong = [
    ...(said(harness) ? [] : ['no `harness`']),
    ...(said(version) && /^\d+\.\d+\.\d+$/.test(version)
      ? []
      : [`no \`version\` numbered as 2.1.272 (${JSON.stringify(version ?? null)})`]),
    ...(day ? [] : [`no \`measuredAt\` day written as 2026-09-15 (${JSON.stringify(measuredAt ?? null)})`]),
    ...(said(source) ? [] : ['no `source`']),
  ];
  if (wrong.length === 0) return measurement;
  throw Object.assign(
    new Error(
      `${name} has ${wrong.join(', ')}. A measurement is data of one day and one version: give it the day it was taken, the version it was taken on, and where that is recorded.`,
    ),
    { exitCode: 2 },
  );
}

/**
 * The read-only commands as `dated` holds a measurement, and more: `measured` and `documented` each a list of commands, one word each, with
 * none listed twice and none both measured and documented, and `docs` saying when the docs were read.
 * Exported only for the tests that import it.
 */
export function readOnlyCommands<T extends Dated & { measured: readonly string[]; documented: readonly string[]; docs: string }>(
  name: string,
  commands: T,
): T {
  dated(name, commands);
  const listed = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.every((c) => typeof c === 'string' && /^[a-z][\w-]*$/.test(c));
  const { measured, documented, docs } = commands as Partial<T>;
  const all = [...(listed(measured) ? measured : []), ...(listed(documented) ? documented : [])];
  const twice = [...new Set(all.filter((c, i) => all.indexOf(c) !== i))];
  const wrong = [
    ...(listed(measured) && measured.length > 0 ? [] : ['no `measured` list of commands, one word each']),
    ...(listed(documented) ? [] : ['no `documented` list of commands, one word each']),
    ...(twice.length === 0 ? [] : [`${twice.join(', ')} listed twice`]),
    ...(typeof docs === 'string' && /read \d{4}-\d{2}-\d{2}$/.test(docs)
      ? []
      : ['no `docs` ending in the day they were read ("read 2026-09-16")']),
  ];
  if (wrong.length === 0) return commands;
  throw Object.assign(new Error(`${name} has ${wrong.join(', ')}. Fix the list where it is declared.`), { exitCode: 2 });
}

/**
 * Why a tool the fenced reviewer had is taken to be in the unfenced set: `tools:` narrows the harness's own set, and adds nothing to it.
 */
const ON_THE_FENCED =
  "Not named by the unfenced measurement. The fenced reviewer had it the same day, and `tools:` only narrows the harness's own set.";
/** Why Edit and Write are taken to be in it: nothing measured names them. */
const EDITS_WITH = 'Not named by any measurement. A session given no `tools:` changes files with it.';

/**
 * What a Claude Code session given no `tools:` has: the harness's own set, as measured — `claude -p` spawned with the engine's flags, on
 * the day and the version it names (`measuredAt`, `version`), recorded where `source` says. Data with its date and version, and nothing
 * here asks the harness again: a later Claude Code may give another set, so a reader says when and on which version this was measured,
 * and never that it is current.
 *
 * `tools` are the built-in tools that measurement names, as it writes them (`Cron*` and `Task*` a family each), and nothing else: its
 * test refuses a name the ledger's bullet does not write as a tool of its own. `inferred` are tools such a session is taken to have that
 * no unfenced measurement names, each with why, which a reader marks as inferred and never as measured. `lacks` are the ones the
 * measurement found absent. MCP tools are in neither: a session's servers reach it whatever its `tools:`, and each lists its own.
 * Exported only for the tests that import it.
 */
export const MEASURED_TOOLS = dated('MEASURED_TOOLS', {
  harness: 'Claude Code',
  version: '2.1.270',
  measuredAt: '2026-09-14',
  source: 'docs/plan-hold-the-bar.md §4b, "what a worker gets, measured"',
  tools: [
    'Agent',
    'Cron*',
    'Monitor',
    'NotebookEdit',
    'RemoteTrigger',
    'ScheduleWakeup',
    'SendMessage',
    'Task*',
    'WebFetch',
    'WebSearch',
    'Workflow',
  ],
  inferred: [
    { name: 'Bash', why: ON_THE_FENCED },
    { name: 'Glob', why: ON_THE_FENCED },
    { name: 'Grep', why: ON_THE_FENCED },
    { name: 'Read', why: ON_THE_FENCED },
    { name: 'Skill', why: ON_THE_FENCED },
    { name: 'Edit', why: EDITS_WITH },
    { name: 'Write', why: EDITS_WITH },
  ],
  lacks: ['Artifact', 'AskUserQuestion'],
} as const);

/**
 * The Bash commands Claude Code runs without a prompt in every mode, `dontAsk` among them, with no rule allowing them — unless a deny names
 * them, or an ask rule does, which makes one ask, and in `dontAsk` denied. Data with its date and version, as `MEASURED_TOOLS` is: nothing
 * here asks the harness again, and a reader never says it is current.
 *
 * `measured` are what a session in `dontAsk` ran, under the repository's settings of the day `measuredAt` names, which allowed none of
 * them, recorded where `source` says: `cat`, `ls` and `grep` alone and `head` and `tail` in a pipe, while `node -e` was denied. That is
 * what was measured, and it stays so whatever the settings allow: a rule allowing `ls` proves nothing of that day's run, and takes nothing
 * from it. So nothing checks the list against the settings; `readOnlyCommands` holds its shape and its date. `documented` are the rest of
 * what Claude Code's docs name, which say the set includes them, not that it is all of it; `git` is its read-only forms, which they do
 * not list.
 * Exported only for the tests that import it.
 */
export const READ_ONLY_COMMANDS = readOnlyCommands('READ_ONLY_COMMANDS', {
  harness: 'Claude Code',
  version: '2.1.272',
  measuredAt: '2026-09-15',
  source: "B9's last review (docs/plan-hold-the-bar.md §6 item 30)",
  measured: ['cat', 'grep', 'head', 'ls', 'tail'],
  documented: ['cd', 'diff', 'du', 'echo', 'find', 'git', 'pwd', 'stat', 'wc', 'which'],
  docs: 'code.claude.com/docs/en/permissions, "Read-only commands", read 2026-09-16',
} as const);

/**
 * Claude Code's permission matching and measured tool sets, as its declaration carries them (`HarnessDeclaration.rules`): a caller reads
 * them off the declaration of the harness it shows, and a harness with none has no rules of Claude Code's.
 */
export const CLAUDE_RULES = {
  ruleOf,
  bashCovers,
  denyingRule,
  takenBackBy,
  narrowerRules,
  jobDeniesAsksIn,
  measuredTools: MEASURED_TOOLS,
  readOnlyCommands: READ_ONLY_COMMANDS,
} as const;

/** What `CLAUDE_RULES` is: the type of a declaration's `rules`. */
export type ClaudeRules = typeof CLAUDE_RULES;
