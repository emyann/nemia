/**
 * The tool rules a step may set: its `tools` list (`toolsOf`), its allow and deny rules (`rulesOf`, refusing a write named as
 * anything but `Edit`), and the rule offered for a call a fenced step was denied (`allowRuleOf`, `disallowedBy`).
 */
import { refuse } from '../step/step.ts';

export const TOOLS_EXAMPLE = '`tools: Read, Grep, Glob, Bash`';

/**
 * `tools:` as the list of names the harness is given, refused unless each entry is one name.
 *
 * Split on commas, as `after:` is — so a comma inside an entry, in a rule's parentheses or in quotes, would reach
 * the harness as the pieces of one; and a space inside one is a list written without its commas, or a rule where
 * a name goes. Refused on codex, which has no tool list: one shell in a sandbox, so a list there narrows nothing
 * the sandbox does not, and the engine leaves the sandbox as `sandbox:` named it whenever the list has Bash.
 */
export function toolsOf(step: string, tools: string | undefined, harness: string | undefined): string[] | undefined {
  if (tools === undefined) return undefined;
  const named = `${step}: \`tools: ${tools}\``;
  const written = `A step's tools are the harness's names for them, bare and comma-separated: ${TOOLS_EXAMPLE}.`;
  if (harness === 'codex') {
    refuse(
      `${named} is a tool list, and codex has none: one shell, fenced by its sandbox. The sandbox is \`sandbox:\` — \`read-only\` reads and runs commands and writes nothing, \`workspace-write\` writes in the workspace. Delete the line, and name the sandbox: \`sandbox: read-only\` for a step that must not write.`,
    );
  }
  if (/\([^)]*,|\[[^\]]*,|"[^"]*,|'[^']*,/.test(tools)) {
    const pieces = tools
      .split(',')
      .map((s) => `\`${s.trim()}\``)
      .join(', ');
    refuse(
      `${named} has a comma inside an entry, and the list is split on every comma, so the harness would be given ${pieces} as names. ${written}`,
    );
  }
  const names = tools
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) refuse(`${named} names no tool. ${written} Without the line, the step has the harness's own set.`);
  const spaced = names.find((n) => /\s/.test(n));
  if (spaced && !spaced.includes('(')) refuse(`${named} has a space inside \`${spaced}\`, which is not one name. ${written}`);
  const dressed = names.find((n) => /[\s()[\]"'`]/.test(n));
  if (dressed) {
    refuse(
      `${named} has \`${dressed}\`, which is not a tool name: ${
        dressed.includes('(')
          ? `it is a rule for what a tool may run, and \`tools:\` says which tools the session has — \`${dressed.slice(0, dressed.indexOf('('))}\`, whole`
          : 'a name is written bare, without quotes or brackets'
      }. ${written}`,
    );
  }
  return names;
}

export const DISALLOW_EXAMPLE = '`disallowedTools: Bash(npm run build), SendMessage`';
export const ALLOW_EXAMPLE = '`allowedTools: Edit(**), Bash(npm test)`';

/**
 * One permission rule as Claude Code writes one: a tool's name, and what it may not run in parentheses. The engine's
 * `file()` refuses an entry of any other shape; it is checked here as well, so a folder is refused before anything is spent.
 */
const RULE = /^[A-Za-z][^\s,()]*(?:\([^()]+\))?$/;

/** What each rule list is, in the words its refusals use: the two halves of Claude Code's permission rules. */
const RULE_LIST = {
  disallowedTools: {
    is: 'a deny list',
    example: DISALLOW_EXAMPLE,
    written: 'what the session may not have',
    may: 'may not run',
    absent: "the step is denied nothing beyond the checkout's settings",
    two: 'Two commands are two rules: `Bash(git push), Bash(git reset)`.',
  },
  allowedTools: {
    is: 'an allow list',
    example: ALLOW_EXAMPLE,
    written: 'what the session may do without being asked',
    may: 'may do',
    absent: 'the step may do only what its `permissionMode` allows by itself',
    two: 'Two tools are two rules: `Edit(**), Bash(npm test)`.',
  },
} as const;

/**
 * `disallowedTools:` and `allowedTools:` as the rules the harness is given to deny and to permit, refused unless each entry is one rule.
 * One function for both: the two keys are the same list in Claude Code's own grammar, and a rule the deny list refuses is
 * not a rule the allow list should take.
 *
 * Split on commas, as `tools:` is, so a comma inside a rule's parentheses would reach the harness as two pieces of it, and is
 * refused as `tools:` refuses one. Only the parentheses are looked in, not the quotes `tools:` looks in: a quote is legal inside a rule —
 * `Bash(git commit -m 'wip')`. A list written in brackets or quotes splits into entries that are not rules, and is refused for that.
 * Which harnesses take a rule list is the runtime's to say at `nemia start` (`configRefused` in start.verb.ts). A line under the key's
 * former name (`spelled`) is quoted as written, and said to be the key.
 */
export function rulesOf(
  step: string,
  key: 'disallowedTools' | 'allowedTools',
  written: string | undefined,
  spelled?: string,
): string[] | undefined {
  if (written === undefined) return undefined;
  const w = RULE_LIST[key];
  const named = `${step}: \`${spelled ?? key}: ${written}\`${spelled !== undefined && spelled !== key ? ` (\`${spelled}:\` is \`${key}:\`'s former name)` : ''}`;
  const shape = `Each entry is one rule, a tool or a tool and what it ${w.may}, comma-separated: ${w.example}.`;
  if (/\([^)]*,/.test(written)) {
    const pieces = written
      .split(',')
      .map((x) => `\`${x.trim()}\``)
      .join(', ');
    refuse(
      `${named} has a comma inside an entry, and the list is split on every comma, so the harness would be given ${pieces} as rules. ${shape} ${w.two}`,
    );
  }
  const rules = written
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!rules.length) refuse(`${named} names no rule. ${shape} Without the line, ${w.absent}.`);
  const odd = rules.find((r) => !RULE.test(r));
  if (odd) {
    refuse(
      `${named} has \`${odd}\`, which is not one rule: ${
        /[()]/.test(odd)
          ? 'a rule has one pair of parentheses, right after the name, closed'
          : /\s/.test(odd)
            ? 'a space outside the parentheses separates two rules, to the harness'
            : 'a rule is a bare name, without quotes or brackets'
      }. ${shape}`,
    );
  }
  const inert = rules.find((r) => FILE_TOOLS.some((tool) => r.startsWith(`${tool}(`)));
  if (inert) refuse(fileRuleRefusal(named, inert, key));
  return rules;
}

/**
 * The file-editing tools whose path rules Claude Code does not match: it checks a write against `Edit` rules alone, whatever
 * tool made it. `Edit` is not in the list — it is the one that works.
 */
const FILE_TOOLS = ['Write', 'NotebookEdit'] as const;

/**
 * A path rule on a file-editing tool that is not `Edit`, which Claude Code accepts, warns about on stderr and never matches.
 *
 * On Claude Code 2.1.278, a session in `dontAsk` given `Write(**)` to allow is denied its writes — `Permission to use Write has been
 * denied because Claude Code is running in don't ask mode` — while the harness says, on a stderr nobody reads, `Write(**) is not matched
 * by file permission checks — only Edit(path) rules are`. With `Edit(**)` it writes inside its folder and is denied outside it, which is
 * the fence.
 *
 * Refused on the deny list too, on the harness's own sentence: what it does not match is the *file permission check*, which is the one
 * check a deny rule on a write is read in. An inert allow denies a step its own work, which a person finds by the work not happening; an
 * inert deny is worse, since the step is fenced by nothing while its file reads as fenced. The fix is the same rule on `Edit`, which
 * covers the file-editing tools whichever list it is in.
 */
const fileRuleRefusal = (named: string, rule: string, key: 'disallowedTools' | 'allowedTools'): string =>
  `${named} has \`${rule}\`, and Claude Code matches a file write against \`Edit\` rules alone: it takes this rule, warns that it is not matched, and ${
    key === 'allowedTools'
      ? 'denies the write anyway — so the step would be fenced out of its own work with nothing said where the run can read it'
      : 'allows the write anyway — so the step would be fenced by nothing while its file reads as fenced'
  }. Write \`Edit${rule.slice(rule.indexOf('('))}\` instead: an \`Edit\` rule covers every file-editing tool, ${FILE_TOOLS.join(', ')} with it.`;

/** The file-editing tools whose calls a permission rule names by `Edit(…)`: Claude Code matches a file write against `Edit` rules alone. */
const EDITING_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

/** The tools whose calls a permission rule names by a path, as `denialOf` in agent-runtime names the call by the path it was given. */
const PATH_TOOLS = ['Read', ...EDITING_TOOLS];

/**
 * Where a denied call was made: the session's own directory (the step's workspace on the run record) and the run's id. A new run works
 * in directories named by its own id — `worktrees/<id>/<step>`, `runs/<id>/…` — so a path offered as denied would name this run's and
 * never match the next's.
 */
export type DeniedAt = { cwd?: string; runId?: string };

/** A call or a rule, `Tool` or `Tool(what)`, split. Pure. */
const callOf = (written: string): { tool: string; what?: string } => {
  const call = /^([^()]+)\((.*)\)$/s.exec(written);
  return call ? { tool: call[1], what: call[2] } : { tool: written };
};

/** A directory as a prefix: no trailing slash. */
const dirOf = (cwd: string): string => cwd.replace(/\/+$/, '');

/**
 * The rule that would allow a denied call, in `allowedTools:`'s words, from the call as the runtime words it (`denialText`: `Bash(pytest)`,
 * `Write(/abs/notes.md)`, `SendMessage`). Pure. Claude Code's rules, which `allowedTools:` is written in (`fileRuleRefusal`):
 *
 *   - a file-editing call is `Edit(…)`, whatever tool made it: Write, MultiEdit and NotebookEdit are matched against `Edit` rules alone,
 *     and `allowedTools:` refuses a path rule on any of them;
 *   - a path in the session's own directory is written from it (`Edit(notes.md)`), as a rule without a leading `/` is read: the next
 *     run's step works in a directory of its own, named by its own id, and an absolute path to this run's would never match it;
 *   - any other absolute path takes a second `/` (`Edit(//abs/notes.md)`): one `/` reads as a path from the settings' folder, not the
 *     root. A part of it that is this run's id is `*`, which matches the next run's: a path under `runs/<id>/artifacts` is offered with `*`
 *     for `<id>`;
 *   - a command is `Bash(<its first word>:*)`, since its first word is all the runtime keeps of it (`Bash(pytest)`), and a rule without
 *     `:*` allows that bare word and no command that goes on past it;
 *   - any other call is as it was denied: `Skill(look)`, `SendMessage`.
 *
 * What a person adds to a folder's `allowedTools:` for a new run; nothing here widens the run that was denied, whose `allowedTools:` is
 * frozen.
 */
export function allowRuleOf(denied: string, at: DeniedAt = {}): string {
  const { tool, what } = callOf(denied);
  if (what === undefined) return denied;
  if (tool === 'Bash') return `Bash(${what}:*)`;
  if (!PATH_TOOLS.includes(tool)) return denied;
  return `${EDITING_TOOLS.includes(tool) ? 'Edit' : tool}(${pathRuleOf(what, at)})`;
}

function pathRuleOf(path: string, { cwd, runId }: DeniedAt): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (cwd && path.startsWith(`${dirOf(cwd)}/`)) return path.slice(dirOf(cwd).length + 1);
  return `/${
    runId
      ? path
          .split('/')
          .map((part) => (part === runId ? '*' : part))
          .join('/')
      : path
  }`;
}

/**
 * The first of a step's `disallowedTools:` rules that may be what denied a call, or undefined. Pure. A deny beats every allow, so a call
 * one of them denied is denied again in a new run whatever its `allowedTools:` says, and is offered no allow rule (`deniedOffer`). *May*:
 * the runtime keeps a command's first word alone, so `Bash(npm)` denied may be `disallowedTools: Bash(npm run build)` at work, or
 * `npm test` that nothing allowed. A rule on the same tool — any file-editing tool for an `Edit` rule — matches a call when it names
 * nothing, or names that command's first word, or a path pattern the call's path is under (from the root for `//`, from the session's
 * directory for any other; `~` is nobody's here, and matches nothing), or exactly what the call names. An MCP tool's call is kept by its
 * name alone, so a rule on one of its parameters (`mcp__playwright__browser_navigate(url:*:8787*)`) may be what denied it.
 */
export function disallowedBy(denied: string, disallowedTools: readonly string[], at: DeniedAt = {}): string | undefined {
  const call = callOf(denied);
  return disallowedTools.find((written) => {
    const rule = callOf(written);
    if (rule.tool !== call.tool && !(rule.tool === 'Edit' && EDITING_TOOLS.includes(call.tool))) return false;
    if (rule.what === undefined) return true;
    if (call.what === undefined) return call.tool.startsWith('mcp__');
    if (call.tool === 'Bash') {
      const first = rule.what.replace(/:\*$/, '').trim().split(/\s+/)[0];
      return first === call.what || first === '*';
    }
    if (PATH_TOOLS.includes(call.tool)) return pathUnder(rule.what, call.what, at.cwd);
    return rule.what === call.what;
  });
}

/**
 * Whether a path is one a rule's path pattern names, or under one: `**` any depth, `*` and `?` within a part. A relative pattern with no
 * `/` in it names a file at any depth below the directory, as a gitignore line does. Pure.
 */
function pathUnder(pattern: string, path: string, cwd: string | undefined): boolean {
  const target = path.startsWith('/') ? path.replace(/^\/\//, '/') : cwd ? `${dirOf(cwd)}/${path.replace(/^\.\//, '')}` : undefined;
  if (target === undefined || pattern.startsWith('~')) return false;
  const relative = !pattern.startsWith('//');
  if (relative && !cwd) return false;
  const bare = relative ? pattern.replace(/^\.?\//, '') : pattern.slice(1);
  const glob = bare
    .split(/(\*\*|\*|\?)/)
    .map((part) => (part === '**' ? '.*' : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  const from = relative ? `${dirOf(cwd!).replace(/[.+^${}()|[\]\\*?]/g, '\\$&')}/${bare.includes('/') ? '' : '(?:.*/)?'}` : '';
  return new RegExp(`^${from}${glob}(?:/.*)?$`, 's').test(target);
}
