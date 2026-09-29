/**
 * The readers of a step's keys, one each: a value as written in the frontmatter in, the value the step carries out, or a
 * `WorkflowError` that names the fix (`harnessOf`, `wordOf`, `contextOf`, `budgetOf`, `workspaceOf`, `denialsOf`, `slotOf`,
 * `outputOf`, …); and what a step and an agent are both judged by: a model that cannot run `auto` (`keepsAuto`), and skills or a system
 * prompt a step's sessions cannot reach (`composedRefusal`). The tool rules are `tools.ts`'s.
 */
import path from 'node:path';
import { CLOSEOUT_FIELDS, COUNTS, isObject, type OutputSchema, refuse, type StepOutput, type Workflow } from '../step/step.ts';
import {
  CLAUDE_MODES,
  CONTEXT_WINDOWS,
  DEFAULT_HARNESS,
  EFFORTS,
  HARNESSES,
  isRemoteHarness,
  PERMISSION_MODES,
  REMOTE_NAME,
  remoteNameOf,
  SANDBOXES,
} from '../harness/harness.ts';
import { looseAt } from '../closeout/closeout.ts';
import type { SystemPrompt } from '../agents/agents.ts';

export function harnessOf(step: string, harness: string | undefined): string | undefined {
  if (harness === undefined || HARNESSES.includes(harness)) return harness;
  if (isRemoteHarness(harness)) {
    const name = remoteNameOf(harness)!;
    if (REMOTE_NAME.test(name)) return harness;
    refuse(
      `${step}: \`harness: ${harness}\` names a remote A2A agent, and \`${name}\` is not a name one is declared under: lowercase words joined by dashes, as \`a2a-agents.json\` in the store declares them — \`harness: a2a:reviewer\`.`,
    );
  }
  if (harness === 'check') {
    refuse(
      `${step}: \`harness: check\` is the run's own harness — it executes a step's \`check:\` command, and no step runs on it. Put the command in \`check:\` and run the step on one of: ${HARNESSES.join(', ')}.`,
    );
  }
  return refuse(
    `${step}: \`harness: ${harness}\` is not a harness a step can run on. The harnesses are: ${HARNESSES.join(', ')}, and \`a2a:<name>\` for a remote A2A agent the store's \`a2a-agents.json\` declares. Without the line, the step runs on ${DEFAULT_HARNESS}.`,
  );
}

const VOCABULARY = {
  permissionMode: { lists: PERMISSION_MODES, noun: 'a mode' },
  sandbox: { lists: SANDBOXES, noun: 'a sandbox' },
  effort: { lists: EFFORTS, noun: 'an effort' },
} as const;

/** The two fences, each one harness's: what a step on the other harness is told to write instead. */
const FENCE_ELSEWHERE = {
  permissionMode: (word: string) =>
    `\`permissionMode:\` is Claude Code's permission mode, and codex has none: its fence is its sandbox, \`sandbox:\` — ${SANDBOXES.codex.join(', ')}. ${word === 'bypassPermissions' ? 'Write `sandbox: danger-full-access` instead, the sandbox that fences nothing' : 'Write `sandbox:` instead, naming one of them: `sandbox: read-only` for a step that must not write'}`,
  sandbox: () =>
    `\`sandbox:\` is Codex's sandbox, and Claude Code has none: its fence is its permission mode, \`permissionMode:\` — ${CLAUDE_MODES.join(', ')} — with \`tools:\`, \`disallowedTools:\` and \`allowedTools:\`. Write \`permissionMode:\` instead, or run the step on codex`,
} as const;

/**
 * A permission mode, a sandbox or an effort is the harness's vocabulary, so it is checked against the harness the step runs on. A harness with
 * no list for the key has no such knob: a sandbox on Claude Code, a permission mode on Codex, each refused in words naming the other key. A
 * word of the other fence — a sandbox written as a mode, or the other way round — is named as such in the refusal.
 */
export function wordOf(
  step: string,
  key: keyof typeof VOCABULARY,
  word: string | undefined,
  harness: string | undefined,
): string | undefined {
  const { lists, noun } = VOCABULARY[key];
  const on = harness ?? DEFAULT_HARNESS;
  const words = lists[on];
  if (word === undefined || words?.includes(word)) return word;
  const where = harness ? '' : ` (there is no \`harness:\` line, so the step runs on ${on})`;
  if (!words)
    return refuse(
      `${step}: \`${key}: ${word}\` is not a key ${on} takes${where}. ${FENCE_ELSEWHERE[key as keyof typeof FENCE_ELSEWHERE](word)}.`,
    );
  if (key === 'sandbox' && word === 'bypassPermissions') {
    return refuse(
      `${step}: \`sandbox: bypassPermissions\` is Claude Code's word for its widest mode. Codex's own name for the sandbox that fences nothing is \`danger-full-access\`: write \`sandbox: danger-full-access\`. On ${on} it is one of: ${words.join(', ')}.`,
    );
  }
  const owner = HARNESSES.find((h) => lists[h]?.includes(word));
  const other = key === 'permissionMode' ? 'sandbox' : key === 'sandbox' ? 'permissionMode' : undefined;
  const across = other && HARNESSES.find((h) => VOCABULARY[other].lists[h]?.includes(word));
  return refuse(
    `${step}: \`${key}: ${word}\` is not ${noun} ${on} has${where}.` +
      ` On ${on} it is one of: ${words.join(', ')}.` +
      (owner ? ` \`${word}\` is ${owner}'s word, and this step does not run on ${owner}.` : '') +
      (across
        ? ` \`${word}\` is ${VOCABULARY[other].noun} ${across} has, written \`${other}: ${word}\` on a step that runs on ${across}.`
        : '') +
      ' Without the line, the harness uses its own default.',
  );
}

/**
 * `remote:` as written: `true` or `false`, or refused. Anything else — `yes`, `on` — is a word the run would have to interpret, and reading it
 * either way is wrong: as true it lets a session be driven from a phone nobody meant to reach it, as false it drops a setting without a word.
 * Which harnesses bridge a session is the engine's to say, so `remote: true` on another is refused at `wf start` (`remoteRefusal` in start.ts).
 */
export function remoteOf(step: string, remote: string | undefined): boolean | undefined {
  if (remote === undefined) return undefined;
  if (remote === 'true') return true;
  if (remote === 'false') return false;
  return refuse(
    `${step}: \`remote: ${remote}\` is not \`true\` or \`false\`. \`remote: true\` bridges every session of the step to claude.ai, where anyone signed in to the account can drive it from a browser or a phone; \`remote: false\`, or no line, does not. Write one of the two, or delete the line.`,
  );
}

/**
 * `background:` as written: `true` or `false`, or refused, for `remote:`'s reasons — and `true` refused on a harness other than `claude`,
 * as the engine refuses `config.background` there (agent-runtime's `file()`), here so a folder is refused at `wf start` and not on its first
 * pass. `codex exec` and `claude-detached`'s `claude -p` each run one way.
 */
export function backgroundOf(step: string, background: string | undefined, harness: string | undefined): boolean | undefined {
  if (background === undefined) return undefined;
  if (background !== 'true' && background !== 'false') {
    refuse(
      `${step}: \`background: ${background}\` is not \`true\` or \`false\`. \`background: true\` runs every session of the step as a Claude Code background session (\`claude --bg\`); \`background: false\`, or no line, runs it as a job (\`claude -p\`). Write one of the two, or delete the line.`,
    );
  }
  if (background === 'true' && (harness ?? DEFAULT_HARNESS) !== 'claude') {
    refuse(
      `${step}: \`background: true\` asks for a Claude Code background session (\`claude --bg\`), and the \`${harness}\` harness has no such mode: ${harness === 'codex' ? '`codex exec` runs a prompt and exits' : '`claude-detached` runs `claude -p` and nothing else'}. Run the step on claude — delete \`harness: ${harness}\` — or delete \`background: true\`.`,
    );
  }
  return background === 'true';
}

/**
 * A count (`COUNTS`) as written, refused unless a whole number of at least its least, in digits. A `deadlineSeconds:` written with a unit —
 * `5m` — would read as NaN and stop the step on its first tick: its refusal does the arithmetic, `deadlineSeconds: 300`.
 */
export function countOf(step: string, key: keyof typeof COUNTS, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const { least, counts, example } = COUNTS[key];
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (Number.isSafeInteger(n) && n >= least) return n;
  const unit = key === 'deadlineSeconds' ? /^(\d+)\s*([smh])$/.exec(value) : null;
  const instead = unit
    ? `\`${key}: ${Math.max(least, Number(unit[1]) * { s: 1, m: 60, h: 3600 }[unit[2] as 's' | 'm' | 'h'])}\``
    : `for example \`${key}: ${example}\``;
  return refuse(
    `${step}: \`${key}: ${value}\` is not a count. \`${key}\` is ${counts}: a whole number ${least ? 'above zero' : 'of zero or more'}, in digits${unit ? ' with no unit' : ''} — ${instead}.`,
  );
}

const CONTEXT_EXAMPLE = '`context: 200k`, or `context: 150000`';

/**
 * Tokens as a person writes them — `200k`, `150000`, `1M` — or undefined for anything else: digits, and thousands (`k`) or millions (`m`)
 * after them, either case. What `context:` takes.
 */
export function tokensOf(written: string): number | undefined {
  const m = /^(\d+)([km])?$/i.exec(written.trim());
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** A context window as `renderStep` writes it, whatever the file said: thousands with `k` when it is a whole number of them, digits otherwise. */
export const contextText = (tokens: number): string =>
  Number.isSafeInteger(tokens) && tokens > 0 && tokens % 1_000 === 0 ? `${tokens / 1_000}k` : String(tokens);

/**
 * `context:` as tokens, refused unless a number of them (`tokensOf`) in the range the step's harness takes (`CONTEXT_WINDOWS`), and on a
 * harness with no such knob. A bare `200` is what Claude Code's own flag reads as thousands, and a person may mean that: the refusal says
 * so, rather than read it either way.
 */
export function contextOf(step: string, context: string | undefined, harness: string | undefined): number | undefined {
  if (context === undefined) return undefined;
  const named = `${step}: \`context: ${context}\``;
  const on = harness ?? DEFAULT_HARNESS;
  const range = CONTEXT_WINDOWS[on];
  if (!range) {
    const windowed = HARNESSES.filter((h) => CONTEXT_WINDOWS[h]);
    return refuse(
      `${named} sets the session's context window, and ${on} has no such knob: \`codex exec\` runs on its model's own window, whatever the step says. Delete the line, or run the step on ${windowed.join(' or ')}.`,
    );
  }
  const tokens = tokensOf(context);
  if (tokens === undefined) {
    return refuse(
      `${named} is not a number of tokens. \`context\` is the session's context window, in tokens: digits, or thousands with \`k\` — for example ${CONTEXT_EXAMPLE}.`,
    );
  }
  if (tokens < range.least || tokens > range.most) {
    const thousands = tokens * 1_000 >= range.least && tokens * 1_000 <= range.most && /^\d+$/.test(context.trim());
    return refuse(
      `${named} is ${tokens} tokens, and ${on} takes a window from ${contextText(range.least)} to ${contextText(range.most)} tokens${harness ? '' : ` (there is no \`harness:\` line, so the step runs on ${on})`}.` +
        (thousands
          ? ` For ${tokens} thousand, write \`context: ${tokens}k\`.`
          : ` Give one in that range — ${CONTEXT_EXAMPLE} — or delete the line for the model's whole window.`),
    );
  }
  return tokens;
}

/**
 * The context window a step's sessions run on: its own, or — for a step that continues another's session (`resume:`) — the window that
 * session was started with, since Claude Code's resumed copy keeps only the flags it is given, and one given another window would compact
 * where the session it continues did not. `validate` refuses a `resume:` step whose own `context:` differs; one without the line inherits.
 */
export function sessionContext(
  step: Pick<Workflow, 'name' | 'resume' | 'context'>,
  steps: readonly Pick<Workflow, 'name' | 'resume' | 'context'>[],
): number | undefined {
  const seen = new Set<string>();
  let at: Pick<Workflow, 'name' | 'resume' | 'context'> | undefined = step;
  while (at?.resume && !seen.has(at.name)) {
    seen.add(at.name);
    const next: Pick<Workflow, 'name' | 'resume' | 'context'> | undefined = steps.find((s) => s.name === at!.resume);
    if (!next) break;
    at = next;
  }
  return at?.context;
}

export const BUDGET_EXAMPLE = '`budget: 5`, or `budget: 2.50`';

/**
 * Dollars as a person writes them — `5`, `2.50` — or undefined for anything else: digits, and a point with digits after it, above
 * zero. What `budget:` takes, and `wf retry --budget` and `wf round --budget` too.
 */
export function dollarsOf(written: string): number | undefined {
  const value = written.trim();
  const n = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The reason `codex exec` keeps no budget, in the engine's words (agent-runtime's `codex.refuses`), which `test/vocabulary.test.ts`
 * holds this copy to: a cap there is one nothing reads.
 */
const CODEX_KEEPS_NO_CAP = 'is a spend cap in dollars, and `codex exec` has none: it takes no such flag, and reports no cost to cap';

/**
 * Why a `claude --bg` session keeps no budget, in the engine's words (agent-runtime's `claudeCodeRefuses`), which `test/vocabulary.test.ts`
 * holds this copy to.
 */
const BACKGROUND_KEEPS_NO_CAP =
  'a `claude --bg` session does not keep one: Claude Code takes `--max-budget-usd` only with `--print`, and a background session spends past a cap it is given';

/**
 * `budget:` as dollars, refused unless an amount above zero (`dollarsOf`), on codex, and beside `background: true`, as the engine refuses a
 * `budgetUsd` there — here, so a folder is refused at `wf start` and not on its first pass. `$5` and `5 USD` are what the author meant, so
 * the refusal writes the amount back without its unit, as `deadlineSeconds: 5m`'s does the arithmetic.
 */
export function budgetOf(
  step: string,
  budget: string | undefined,
  harness: string | undefined,
  background: boolean | undefined,
): number | undefined {
  if (budget === undefined) return undefined;
  const named = `${step}: \`budget: ${budget}\``;
  if (harness === 'codex') {
    refuse(
      `${named} ${CODEX_KEEPS_NO_CAP}. Delete the line, or run the step on claude or claude-detached, whose \`claude -p\` ends a session once the step's tries together have cost the budget.`,
    );
  }
  if (background) {
    refuse(
      `${named} is a spend cap, and \`background: true\` runs the step as a background session: ${BACKGROUND_KEEPS_NO_CAP}. Delete \`background: true\` to run the step as a job (\`claude -p\`), which ends its session at the cap, or delete the budget line.`,
    );
  }
  const amount = dollarsOf(budget);
  if (amount !== undefined) return amount;
  const bare = budget.replace(/^\$\s*/, '').replace(/\s*(?:usd|dollars?)$/i, '');
  const unit = dollarsOf(bare) !== undefined;
  return refuse(
    `${named} is not an amount. \`budget\` is the most the step's tries may cost together, in dollars: a number above zero, in digits${unit ? ` with no unit — \`budget: ${bare}\`` : ` — for example ${BUDGET_EXAMPLE}`}.`,
  );
}

/**
 * `gate:` as written: `true`, or refused. `false` is what a step without the line already is, and anything else — `yes`, a step's name — is
 * a word the run would have to interpret. A gate at a step the folder does not gate is said at start: `wf start --gate <step>`.
 */
export function gateOf(step: string, gate: string | undefined): true | undefined {
  if (gate === undefined) return undefined;
  if (gate === 'true') return true;
  if (gate === 'false') {
    refuse(
      `${step}: \`gate: false\` is what a step without the line already is. Delete the line: a step has no gate unless it says \`gate: true\`, or a run is started with --gate ${step}.`,
    );
  }
  return refuse(
    `${step}: \`gate: ${gate}\` is not \`true\`. \`gate: true\` holds the step's closeout for a person — wf approve — before anything after it is filed; without the line the step has no gate. To gate one run of the workflow and not every run, delete the line and start it with --gate ${step}.`,
  );
}

/**
 * The words `workspace:` takes. `main`: a step of a git run works in the repository's checkout rather than where the workflow's shape puts
 * it. `folder`: the run is not a git run at all, and the step works in a folder the run makes — a kind a workspace can be beside git's,
 * which is what a step without the line is.
 */
export const WORKSPACES: readonly string[] = ['main', 'folder'];

/**
 * `workspace:` as written: `main`, `folder`, or refused. A step without the line works where the shape of the workflow puts it
 * (`workspacePlan`) — a worktree of its own, or the one it inherits — and `workspace: worktree` is that said twice, while any other word is
 * a directory the run would have to invent. `main` takes a `check:` only beside `gate: true` — the run executes it on the merge the step
 * stages, and commits or aborts that merge onto the base branch on its word (`landingDue`); and not on codex, which cannot be denied the commit (`filedDenies`) — and never a `retries:`, since a try of an ending is a person's to ask for. `folder` takes a check and a `resume:` as a worktree does: its folder is the run's, and the session's.
 */
export function workspaceOf(
  step: string,
  workspace: string | undefined,
  check: string | undefined,
  resume: string | undefined,
  gate: string | undefined,
  retries: string | undefined,
  harness: string | undefined,
): 'main' | 'folder' | undefined {
  if (workspace === undefined) return undefined;
  if (workspace === 'folder') return 'folder';
  if (workspace === 'worktree') {
    refuse(
      `${step}: \`workspace: worktree\` is what a step without the line already is: the shape of the workflow says which worktree — its own, or the one it continues. Delete the line, or write \`workspace: main\` to run the step in the repository's own checkout.`,
    );
  }
  if (workspace !== 'main') {
    refuse(
      `${step}: \`workspace: ${workspace}\` is not \`main\` or \`folder\`. \`workspace: main\` runs the step in the repository's own checkout, where a person's own work is, rather than in a worktree of the run's: what the last step of a workflow does when it merges. \`workspace: folder\` runs it in a folder the run makes, in a run that needs no git repository. Without the line, the step works where the workflow's shape puts it.`,
    );
  }
  if (check !== undefined && gate?.trim() !== 'true') {
    refuse(
      `${step}: \`workspace: main\` runs the step in the repository's own checkout, and \`check: ${check}\` is a command the run executes there on the merge the step leaves staged, committing it onto the base branch when it passes — which only a person's approval may start, and this step has no \`gate: true\`. Add \`gate: true\`, or delete the \`check:\` line.`,
    );
  }
  if (check !== undefined && harness === 'codex') {
    refuse(
      `${step}: \`workspace: main\` with \`check: ${check}\` has the run commit the merge the step stages once the check passes, and keeps the session from committing it first by denying \`git commit\` — which codex cannot be denied: one shell, fenced by its sandbox, and a sandbox that lets it stage a merge lets it commit one. Run the ending on claude — delete \`harness: codex\` — or delete the \`check:\` line.`,
    );
  }
  if (retries !== undefined) {
    refuse(
      `${step}: \`workspace: main\` runs the step in the repository's own checkout, and \`retries: ${retries}\` would have the run do it again there on its own, on a refusal nobody read. A step that ends a run is tried again on a person's word: wf retry <run> ${step}. Delete the \`retries:\` line.`,
    );
  }
  if (resume !== undefined) {
    refuse(
      `${step}: \`workspace: main\` runs the step in the repository's own checkout, and \`resume: ${resume}\` continues ${resume}'s session, which ran in the worktree ${resume} worked in — the same conversation, in another directory, told none of what this step needs. A step that ends a run starts cold, where the base branch is, and is told which branch to act on. Delete one of the two lines.`,
    );
  }
  return 'main';
}

/** The words `denials:` takes. One: a denied try fails its step's hand-off; without the line, denials are said and decide nothing. */
export const DENIALS: readonly string[] = ['fail'];

/**
 * `denials:` as written: `fail`, or refused — and refused where the run would never read a denial, rather than accepted and never met: on
 * codex, whose `codex exec` records none, and beside `background: true`, whose `claude --bg` session records none (agent-runtime's open
 * issue 28). Only a job, `claude -p` on `claude` or `claude-detached`, says what it was denied.
 */
export function denialsOf(
  step: string,
  denials: string | undefined,
  harness: string | undefined,
  background: boolean | undefined,
): 'fail' | undefined {
  if (denials === undefined) return undefined;
  if (denials !== 'fail') {
    refuse(
      `${step}: \`denials: ${denials}\` is not \`fail\`. \`denials: fail\` stops the step when the harness denied its try a call — it reads \`denied\` and waits on a person — rather than passing it on; without the line, what was denied is said beside the step and decides nothing. Write \`denials: fail\`, or delete the line.`,
    );
  }
  if ((harness ?? DEFAULT_HARNESS) === 'codex') {
    refuse(
      `${step}: \`denials: fail\` stops the step on a call the harness denied, and \`codex exec\` records none: its fence is the sandbox, and a call it refuses is said nowhere the run reads — so the line would never stop anything. Run the step on claude — delete \`harness: codex\` — or delete \`denials: fail\`.`,
    );
  }
  if (background) {
    refuse(
      `${step}: \`denials: fail\` stops the step on a call the harness denied, and \`background: true\` runs it as a Claude Code background session (\`claude --bg\`), whose denials are not read (agent-runtime's open issue 28) — so the line would never stop anything. Delete \`background: true\` to run the step as a job (\`claude -p\`), which records each call it was denied, or delete \`denials: fail\`.`,
    );
  }
  return 'fail';
}

/** The words `slot:` takes. One: a run is counted against the cap on runs in flight, or it is one that watches the counted ones. */
export const SLOTS: readonly string[] = ['none'];

/**
 * `slot:` as written: `none`, or refused. There is one thing to say — that this run is not counted against the cap on runs in flight —
 * and a step without the line is counted, as every step of every run is. `false`, `0` and `off` are words the run would have to
 * interpret into that.
 */
export function slotOf(step: string, slot: string | undefined): 'none' | undefined {
  if (slot === undefined) return undefined;
  if (slot === 'none') return 'none';
  return refuse(
    `${step}: \`slot: ${slot}\` is not \`none\`. \`slot: none\` keeps this step's run out of the cap on runs in flight (WF_MAX_RUNS), for a workflow of one step that watches the other runs rather than doing a run's work. Without the line, the run waits for a slot and holds one, like every other run.`,
  );
}

/**
 * `check:` as written, refused when it is `none`, `""` or `''`: each reads as no check to a person and as a command to the shell, which
 * cannot find it and exits 127 on every try.
 */
export function checkOf(step: string, check: string | undefined): string | undefined {
  if (check !== undefined && ['none', '""', "''"].includes(check)) {
    refuse(
      `${step}: \`check: ${check}\` would run \`${check}\` as a shell command, which exits 127 and fails the step every time. Delete the line — a step without \`check:\` runs no check.`,
    );
  }
  return check;
}

/**
 * The schema an `output:` names, read and refused unless the run can use it.
 *
 * Strict, because the schema is merged into the closeout the step is filed with and Codex refuses a
 * structured output that is not: every object in it lists every property in `required` and sets
 * `additionalProperties: false`. Refused here rather than by the harness at spawn, which is after a
 * run has started and a step has been filed on it.
 *
 * `step` is a step's name, `review`, or an agent's file, `agents/reviewer.md`. A file outside the folder is refused before it is read: a
 * folder is what a run freezes and the builder writes back, and a schema outside it is part of the step that neither carries; read
 * through the api, it would also answer a refusal with the start of whatever it holds.
 */
export function outputOf(
  step: string,
  file: string | undefined,
  read: ((file: string) => string | undefined) | undefined,
): StepOutput | undefined {
  if (file === undefined) return undefined;
  const named = `${step}: \`output: ${file}\``;
  const beside = step.endsWith('.md') ? step : `${step}.md`;
  if (path.isAbsolute(file) || path.normalize(file).split(/[\\/]/)[0] === '..') {
    refuse(
      `${named} names a file outside the workflow folder. A schema is part of what the step is judged by, and lives in the folder with it: write it beside ${beside} and name it from there — \`output: ${path.basename(beside, '.md')}.schema.json\` — or delete the line, and the step declares no output.`,
    );
  }
  if (!read)
    refuse(
      `${named} names a file beside the step, and this step was read without its folder. Load it with \`loadWorkflows(<folder>)\`, which reads the file.`,
    );
  const text = read(file);
  if (text === undefined) {
    refuse(
      `${named} is not there. It is a JSON Schema file, relative to the workflow folder — write it beside ${beside}, correct the path, or delete the line and the step declares no output.`,
    );
  }
  let schema: unknown;
  try {
    schema = JSON.parse(text);
  } catch (e) {
    refuse(
      `${named} is not JSON (${(e as Error).message}). It is a JSON Schema: an object with \`"type": "object"\` and the fields the step declares under \`properties\`.`,
    );
  }
  if (!isObject(schema) || schema.type !== 'object' || !isObject(schema.properties) || !Object.keys(schema.properties).length) {
    refuse(
      `${named} is not a schema of fields. Give it \`"type": "object"\` and at least one field under \`properties\` — or delete the line, and the step declares no output.`,
    );
  }
  const extra = Object.keys(schema).filter(
    (k) => !['type', 'properties', 'required', 'additionalProperties', 'title', 'description', '$schema'].includes(k),
  );
  if (extra.length) {
    refuse(
      `${named} sets ${extra.map((k) => `\`${k}\``).join(', ')} beside its fields, and only its \`properties\` are merged into the closeout — the rest would be dropped on the way to the harness. Inline what the fields refer to, and delete the key.`,
    );
  }
  const taken = Object.keys(schema.properties).filter((k) => (CLOSEOUT_FIELDS as readonly string[]).includes(k));
  if (taken.length) {
    refuse(
      `${named} declares ${taken.map((k) => `\`${k}\``).join(', ')}, which every closeout already has. ${CLOSEOUT_FIELDS.map((k) => `\`${k}\``).join(', ')} are the run's, and \`summary\` goes to the person who decides, never to a step. Rename the field.`,
    );
  }
  const loose = looseAt(schema, '');
  if (loose && 'ref' in loose) {
    refuse(
      `${named} uses \`${loose.ref}\` at ${loose.at || 'the top'}. The run checks a schema is strict by reading it, and does not follow references — an object it did not read would reach the harness unchecked. Inline what it points at, and delete \`${loose.ref}\`.`,
    );
  }
  if (loose) {
    refuse(
      `${named} is not strict at ${loose.at || 'the top'}: ${loose.why}. Codex refuses a structured output whose objects do not list every property in \`required\` and set \`"additionalProperties": false\`. A field that may be absent is required and nullable instead — \`"type": ["string", "null"]\`.`,
    );
  }
  return { file, schema: schema as OutputSchema };
}

/**
 * The models Claude Code runs in `default` when asked for `auto` (Claude Code 2.1.282): the
 * session starts in `auto`, says `default` from its first turn, and a job denies every call `default` would ask about. Each name as written
 * on a step, or with a date after it (`claude-haiku-4-5-20251001`). A model not listed is let through: the list is what is known to fail.
 */
export const AUTO_UNSUPPORTED: readonly string[] = ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5'];

/** Whether Claude Code keeps `auto` on `model`: false for one known to drop it (`AUTO_UNSUPPORTED`), true for its default and any other. */
export const keepsAuto = (model: string | undefined): boolean =>
  model === undefined || !AUTO_UNSUPPORTED.some((m) => model === m || model.startsWith(`${m}-`));

/** The permission mode a Claude Code step is filed with when it names none: the runtime's own (`--permission-mode auto`). */
export const DEFAULT_PERMISSION_MODE = 'auto';

/**
 * Why an agent's skills or system prompt cannot reach the sessions of a step that runs as `step` does — its harness, tools and deny list —
 * or `undefined`. `named` says whose: the agent's file, or a step that names it. Asked of the agent as its file sets them (`parseAgent`), and
 * again of each step that names it once its own keys are merged (`parseWorkflow`), since a step's `tools:`, `disallowedTools:` or `harness:`
 * can take away what the agent's allowed. On a step that continues a session (`resume:`), skills and a system prompt other than `default`
 * are refused: a session continued keeps the system prompt it was started with, and the plugins with it.
 */
export function composedRefusal(
  named: string,
  skills: readonly string[] | undefined,
  systemPrompt: SystemPrompt | undefined,
  step: Pick<Workflow, 'harness' | 'tools' | 'disallowedTools' | 'resume'>,
): string | undefined {
  const listed = skills?.length ? `\`skills: ${skills.join(', ')}\`` : undefined;
  if (step.resume && (listed || (systemPrompt ?? 'default') !== 'default')) {
    return `${named}: ${listed ?? `\`systemPrompt: ${systemPrompt}\``} shapes the system prompt of a session the step starts, and \`resume: ${step.resume}\` continues ${step.resume}'s, which keeps the system prompt it was started with: it would reach nothing. Name an agent without it, or delete \`resume:\`.`;
  }
  if (isRemoteHarness(step.harness)) {
    if (listed)
      return `${named}: ${listed} gives Claude Code skills from a plugin directory of the step's own, and \`harness: ${step.harness}\` is a remote A2A agent, which has the skills its operator gave it — its card says which — and loads none of ours. Delete the line, or run the step on claude.`;
    if (systemPrompt !== undefined)
      return `${named}: \`systemPrompt: ${systemPrompt}\` shapes Claude Code's system prompt, and \`harness: ${step.harness}\` is a remote A2A agent, which keeps its own: the agent's instructions are sent in the brief. Delete the line, or run the step on claude.`;
    return undefined;
  }
  if (step.harness === 'codex') {
    if (listed)
      return `${named}: ${listed} gives Claude Code skills from a plugin directory of the step's own, and codex loads none: it is handed its instructions in the brief. Run it on claude, or delete the line.`;
    if (systemPrompt !== undefined && systemPrompt !== 'default')
      return `${named}: \`systemPrompt: ${systemPrompt}\` shapes Claude Code's system prompt, and codex is handed its instructions in the brief, beside its own. Run it on claude, or delete the line.`;
    return undefined;
  }
  if (!listed) return undefined;
  const why =
    'the tool a session loads a skill with: Claude Code gives a session only what its tools allow, and a skill it cannot load is a name in its prompt and nothing more';
  if (step.tools !== undefined && !step.tools.includes('Skill')) {
    return `${named}: ${listed} gives the agent skills, and \`tools: ${step.tools.join(', ')}\` has no \`Skill\`, ${why}. Add \`Skill\` to \`tools:\`, or delete \`skills:\`.`;
  }
  if (step.disallowedTools?.includes('Skill')) {
    return `${named}: ${listed} gives the agent skills, and \`disallowedTools: ${step.disallowedTools.join(', ')}\` denies \`Skill\`, ${why}. Take \`Skill\` off the deny list, or delete \`skills:\`.`;
  }
  return undefined;
}
