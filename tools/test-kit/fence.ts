/**
 * What a permission rule of Claude Code's reaches, as measured: a matcher of the rule shapes fences are written in (`reaches`), the parts
 * of a shell command each rule is matched against (`partsOfCall`, `deniedPartsOfCall`), Claude Code's own check of a path outside the
 * working tree (`readsOutside`), and what a fence runs of a list of calls (`runsUnder`). The orchestrator's fence tests and the
 * templates' read it here, so a rule is proved to reach the same calls wherever it is written.
 *
 * It throws on a shape it does not model, so a rule it cannot read fails the test that reads it rather than passing it.
 */

/**
 * A call a session makes: a shell command, or a tool by its name, an edit or a write with the absolute path it writes when one is said, a
 * browser tool with the address it opens or the file it is told to write when one is given, a fetch with the host it reads.
 */
export type Call =
  | { tool: 'Bash'; command: string; path?: undefined; url?: undefined; filename?: undefined; domain?: undefined }
  | { tool: string; command?: undefined; path?: string; url?: string; filename?: string; domain?: string };

/** The parameters of an MCP tool a rule may name here, each read off the call as it wrote it. */
export const MCP_PARAMS = ['url', 'filename'] as const;

/** Every parameter a rule may name here: an MCP tool's, and the host `WebFetch` reads. */
export const PARAMS = [...MCP_PARAMS, 'domain'] as const;

/** The home folder `~` is in an edit rule, for the paths the calls below write. */
export const HOME = '/home/u';

/** The folder a planted session works in, where an edit rule's path from the working folder starts. */
export const WORK = '/work/checkout';

/** A call as a rule would name it, for a message. */
export const shown = (call: Call): string => {
  if (call.command !== undefined) return `Bash(${call.command})`;
  const param = PARAMS.find((name) => call[name] !== undefined);
  return param === undefined ? call.tool : `${call.tool}(${param}:${call[param]})`;
};

/**
 * Whether a permission rule reaches a call: a bare tool name is that tool, `mcp__<server>` or `mcp__<server>__*` every tool of the
 * server, `Bash(x)` the command `x` exactly, and `Bash(x:*)` or `Bash(x *)` the command `x` or `x` followed by a space and more; a `*`
 * inside a Bash rule is any run of characters, none included (`globbed`). Any other `Tool(x)` reaches some call of that tool, so it is
 * read as reaching every one, unless the call says the path it writes: then `Edit(//<glob>)` and `Edit(~/<glob>)` reach it when the glob
 * covers it (`covers`). Claude Code matches a write against `Edit` rules, so an `Edit` rule reaches `Write` too. A rule on an MCP tool's
 * parameter, `mcp__<server>__<tool>(url:<glob>)` or `(filename:<glob>)`, reaches a call of that tool whose parameter the glob covers
 * whole, each `*` any run of characters, compared as the call wrote it, and no call that gives none: so Claude Code was measured to
 * read one in a deny list, and an allow list is read through `granting`, which refuses one. A rule on `WebFetch`'s host,
 * `WebFetch(domain:<host>)`, reaches a fetch of exactly that host and no other, and no fetch that says none; a bare `WebFetch` reaches
 * every one. Throws on a `*` in a tool's name and on any other parameter, which this matcher does not model.
 */
export function reaches(rule: string, call: Call): boolean {
  const bash = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  return bash === undefined ? toolReaches(rule, call) : bashReaches(bash, call);
}

/** Whether the words `bash` of a `Bash(…)` rule reach a call: the command exactly, or as a prefix or a pattern (`reaches`). */
function bashReaches(bash: string, call: Call): boolean {
  if (call.command === undefined) return false;
  const prefix = /^(.*?)(?::\*| \*)$/s.exec(bash)?.[1];
  const exact = prefix ?? bash;
  if (exact.includes('*')) return globbed(exact, prefix !== undefined).test(call.command);
  return prefix === undefined ? call.command === bash : call.command === prefix || call.command.startsWith(`${prefix} `);
}

/** Whether a rule on a tool other than Bash reaches a call (`reaches`). */
function toolReaches(rule: string, call: Call): boolean {
  const tool = rule.includes('(') ? rule.slice(0, rule.indexOf('(')) : undefined;
  if (tool?.startsWith('mcp__')) return paramReaches(rule, tool, call);
  if (tool === 'WebFetch') return hostReaches(rule, call);
  const pathed = call.path !== undefined && tool !== undefined;
  if (pathed && (tool === call.tool || (call.tool === 'Write' && tool === 'Edit')))
    return covers(rule.slice(tool.length + 1, -1), call.path!);
  if (call.tool === 'Write' && (rule === 'Edit' || tool === 'Edit')) return true;
  if (tool !== undefined) return tool === call.tool && call.command === undefined;
  return nameReaches(rule, call);
}

/** Whether a rule on the MCP tool `tool`'s parameter, `url:` or `filename:`, reaches a call; throws on any other. */
function paramReaches(rule: string, tool: string, call: Call): boolean {
  const said = rule.slice(tool.length + 1, -1);
  const param = MCP_PARAMS.find((name) => said.startsWith(`${name}:`));
  if (param === undefined || tool.includes('*'))
    throw new Error(`${rule}: a parameter rule on an MCP tool is modelled for \`url:\` and \`filename:\` alone; say how it reads, here`);
  const given = call[param];
  return tool === call.tool && given !== undefined && globbed(said.slice(param.length + 1), false).test(given);
}

/** Whether a rule on `WebFetch`'s host reaches a call: a fetch of exactly that host; throws on any other parameter. */
function hostReaches(rule: string, call: Call): boolean {
  const said = rule.slice('WebFetch('.length, -1);
  if (!said.startsWith('domain:')) throw new Error(`${rule}: a rule on WebFetch is modelled for \`domain:\` alone; say how it reads, here`);
  return call.tool === 'WebFetch' && call.domain === said.slice('domain:'.length);
}

/** Whether a bare tool name, or an MCP server's, reaches a call; throws on a wildcard in a name. */
function nameReaches(rule: string, call: Call): boolean {
  const server = rule.startsWith('mcp__') ? rule.replace(/__\*$/, '') : undefined;
  if (server !== undefined && !server.includes('*') && server.split('__').length === 2)
    return rule === call.tool || call.tool.startsWith(`${server}__`);
  if (rule.includes('*')) throw new Error(`${rule}: a wildcard in a tool name is not modelled; say how it reads, here`);
  return rule === call.tool;
}

/**
 * The words of a Bash rule with a `*` inside them, as a pattern of the whole command: each `*` any run of characters, none included;
 * `open`, where the rule ends in `:*` or ` *`, the words alone or followed by a space and more.
 */
const globbed = (words: string, open: boolean): RegExp =>
  new RegExp(
    `^${words
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]*')}${open ? '(?: [\\s\\S]*)?' : ''}$`,
  );

/**
 * Whether the path of a file rule covers the absolute path `file`: `//<glob>` from the root, `~/<glob>` from `HOME`; in the glob `**\/`
 * is any run of folders, none included, `**` any run of characters, and `*` any run within a folder's name. A path with no leading `/`,
 * `.` or `~` that holds a `/` before its last name is anchored at the session's working folder, `WORK`, as gitignore anchors a pattern
 * with a slash inside it. Throws on a path from the project (`/x`), on a bare name, which gitignore matches at any depth, and on
 * `<name>/**`, whose depth Claude Code reads differently by rule type: this matcher does not model them.
 */
export function covers(rulePath: string, file: string): boolean {
  const fromWork = !/^[/.~]/.test(rulePath) && /\/[^/]+$/.test(rulePath) && !/^[^/]+\/\*\*$/.test(rulePath);
  const from = rulePath.startsWith('//')
    ? rulePath.slice(1)
    : rulePath.startsWith('~/')
      ? `${HOME}${rulePath.slice(1)}`
      : fromWork
        ? `${WORK}/${rulePath}`
        : undefined;
  if (from === undefined)
    throw new Error(`${rulePath}: a path from the project or the working folder is not modelled; say how it reads, here`);
  const pattern = from
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) =>
      part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${pattern}$`).test(file);
}

/**
 * The rules of an allow list as this matcher may read them: all of them. Throws on a rule on an MCP tool's parameter, which Claude Code
 * was measured to read in a deny list alone: what such a rule allows is not modelled, and a guess would make a fence pass for nothing.
 */
export function granting(rules: readonly string[]): readonly string[] {
  const odd = rules.find((rule) => /^mcp__[^(]*\(/.test(rule));
  if (odd !== undefined)
    throw new Error(`${odd}: a parameter rule on an MCP tool in an allow list is not modelled; say how it reads, here`);
  return rules;
}

/** A wrapper Claude Code strips before it matches a part: a leading assignment, `timeout` with its duration, `nohup`. */
const WRAPPER = /^(?:[A-Za-z_]\w*=\S*|timeout \d+(?:\.\d+)?[smhd]?|nohup)\s+/;

/** A part with every leading wrapper stripped (`WRAPPER`). */
export function unwrapped(part: string): string {
  let rest = part.trim();
  let wrapper = WRAPPER.exec(rest);
  while (wrapper) {
    rest = rest.slice(wrapper[0].length).trimStart();
    wrapper = WRAPPER.exec(rest);
  }
  return rest;
}

/**
 * The parts of a shell command as typed: split on `&&`, `||`, `;`, `|&`, `|`, `&` and a newline outside quotes, each trimmed. Throws on
 * a substitution, a redirection, an escape, an unclosed quote or a separator inside quotes, which this matcher does not model.
 */
export function typedPartsOf(command: string): string[] {
  if (/\$\(|[`<>\\]/.test(command))
    throw new Error(`${command}: a substitution, redirection or escape is not modelled; say how it reads, here`);
  const tokens = [...command.matchAll(/'[^']*'|"[^"]*"|&&|\|\||\|&|[;|&\n]|[^'"&|;\n]+/g)].map((token) => token[0]);
  const quoted = tokens.filter((token) => /^['"]/.test(token));
  if (tokens.join('') !== command || quoted.some((token) => /[;&|\n]/.test(token)))
    throw new Error(`${command}: an unclosed quote or a separator inside quotes is not modelled; say how it reads, here`);
  const parts = [''];
  for (const token of tokens)
    if (/^(?:&&|\|\||\|&|[;|&\n])$/.test(token)) parts.push('');
    else parts[parts.length - 1] += token;
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The parts of a shell command Claude Code matches an allow against: each part as typed (`typedPartsOf`), `unwrapped`. */
export const partsOf = (command: string): string[] => typedPartsOf(command).map(unwrapped).filter(Boolean);

/** A call as the parts Claude Code matches an allow against: each part of a shell command (`partsOf`), or the tool call itself. */
export const partsOfCall = (call: Call): Call[] =>
  call.command === undefined ? [call] : partsOf(call.command).map((command) => ({ tool: 'Bash', command }) as const);

/**
 * A call as the parts Claude Code matches a deny against: each part of a shell command unwrapped, and as typed too, its leading
 * assignment and wrappers kept, so a deny of what an assignment says reaches it; or the tool call itself.
 */
export const deniedPartsOfCall = (call: Call): Call[] =>
  call.command === undefined
    ? [call]
    : [...new Set([...partsOf(call.command), ...typedPartsOf(call.command)])].map((command) => ({ tool: 'Bash', command }) as const);

/**
 * The verbs whose paths Claude Code keeps inside the session's working folders by its own check, before any rule: measured on 2.1.308
 * a dontAsk session allowed `Bash(cat:*)`, `Bash(head:*)`, `Bash(tail:*)`, `Bash(wc:*)`, `Bash(cut:*)` and `Bash(ls:*)`
 * ran each on a file of its folder and was refused each on `/etc/hostname`, `..`, `../<file>`, `~/<file>`, `$HOME/<file>`, after
 * `--`, behind `<`, and on a link in its folder to `/etc/hostname`; and refused `cat <file> > <file>`. It ran `wc --files0-from=<list>`,
 * whose list named `/etc/hostname`, and read it; with `Bash(wc *--f*)` denied, it refused that, `wc --f=<list>` and
 * `wc -l --files0=<list>`, and still ran `wc -l <file>`, `cat <file> | wc -l` and `head -1 <file> && ls`. It resolves a path: `ls
 * ./../<its folder>` ran.
 */
export const CLAUDE_KEEPS_INSIDE = ['cat', 'head', 'tail', 'wc', 'cut', 'ls'];

/**
 * Whether Claude Code's own check refuses a part as reading outside the working tree (`CLAUDE_KEEPS_INSIDE`): a word after the verb
 * that opens `/`, `~` or `$`, or that climbs with `..`. A link is not modelled here, having no file system: measured, it is refused.
 * A `..` that climbs back inside is refused here and run by Claude Code, a read inside either way.
 */
export function readsOutside(part: Call): boolean {
  const [verb = '', ...words] = (part.command ?? '').split(/\s+/);
  return CLAUDE_KEEPS_INSIDE.includes(verb) && words.some((word) => /^[/~$]/.test(word) || /(?:^|\/)\.\.(?:\/|$)/.test(word));
}

/** A shell command as the call a session makes of it. */
export const bash = (command: string): Call => ({ tool: 'Bash', command });

/** A fence as Claude Code reads it: its allows, those of the settings and of a loaded skill among them, and its denies. */
export type Fence = { allow: readonly string[]; deny: readonly string[] };

/**
 * What of `calls` a dontAsk session under `fence` runs, each as a rule would name it (`shown`): each whose every part an allow reaches
 * and no deny does, nor Claude Code's own check of a path outside the working tree (`readsOutside`), unless `inside` is false, which
 * reads the rules alone. A mode that asks for nothing an allow reaches (`auto`) is `dontAsk: false`: a call no deny reaches runs.
 */
export function runsUnder(
  fence: Fence,
  calls: readonly Call[],
  { dontAsk = true, inside = true }: { dontAsk?: boolean; inside?: boolean } = {},
): string[] {
  const allows = granting(fence.allow);
  return calls
    .filter(
      (call) =>
        (!dontAsk || partsOfCall(call).every((part) => allows.some((rule) => reaches(rule, part)) && !(inside && readsOutside(part)))) &&
        !deniedPartsOfCall(call).some((part) => fence.deny.some((rule) => reaches(rule, part))),
    )
    .map(shown);
}
