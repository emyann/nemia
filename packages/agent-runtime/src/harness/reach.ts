/**
 * What a harness's fence words reach: how wide each permission mode or sandbox is, which one a task naming none runs in, which one a
 * session held to its directory runs in, which ones a background session runs in without stopping to ask a person, and which ones
 * Claude Code drops on a model, and which characters its permission rules cannot carry in a path. Pure, reading the harnesses'
 * vocabularies alone, so a caller that only judges words asks without loading a runner.
 */
import {
  CLAUDE_AUTO_DROPPED,
  CLAUDE_DEFAULT_MODE,
  CLAUDE_HELD_MODE,
  CLAUDE_GRANTED,
  CLAUDE_MODE_RANK,
  CLAUDE_REFUSING_MODES,
  CLAUDE_UNASKING_MODES,
  CLAUDE_UNFENCED,
  CLAUDE_UNRULED,
} from './claude/vocabulary.ts';
import { CODEX_DEFAULT_SANDBOX, CODEX_SANDBOXES } from './codex/vocabulary.ts';

/**
 * A harness's fence, as the words that set it: `by` is what fences a session, a permission mode or a sandbox; `rank` how wide each word
 * is, wider higher and equal as wide; `given` the word a task naming none runs in; `writes` the lowest rank that writes in the session's
 * directory unasked; `held` the word a session held to its directory runs in, where the harness has one; `unasking` the words a
 * background session runs in without stopping to ask a person, `held` first; `dropped` the words the harness runs as another on the
 * model asked about; `refusing` the words a session refuses in what no allow rule reaches, rather than asking about it, so that a tool
 * the session is given and neither a rule nor the word itself grants can never be called; `unfenced` the tools it calls inside its own
 * directory with no rule naming them, whatever the word; and `granted` the tools one word alone runs with no rule, by that word, a word
 * granting none being absent. The last three are empty for a harness whose fence takes no allow rule.
 */
export type FenceReach = {
  by: 'mode' | 'sandbox';
  rank: Readonly<Record<string, number>>;
  given: string;
  writes: number;
  held?: string;
  unasking: readonly string[];
  dropped: readonly string[];
  refusing: readonly string[];
  unfenced: readonly string[];
  granted: Readonly<Record<string, readonly string[]>>;
};

/** Whether Claude Code drops `auto` on `model`: one of `CLAUDE_AUTO_DROPPED`, as named or with a `-` suffix. */
const dropsAuto = (model: string | undefined): boolean =>
  model !== undefined && CLAUDE_AUTO_DROPPED.some((m) => model === m || model.startsWith(`${m}-`));

/** Claude Code's fence on `model`, run as a job or a background session alike. */
const claudeReach = (model: string | undefined): FenceReach => ({
  by: 'mode',
  rank: CLAUDE_MODE_RANK,
  given: CLAUDE_DEFAULT_MODE,
  writes: CLAUDE_MODE_RANK.acceptEdits,
  held: CLAUDE_HELD_MODE,
  unasking: CLAUDE_UNASKING_MODES,
  dropped: dropsAuto(model) ? ['auto'] : [],
  refusing: CLAUDE_REFUSING_MODES,
  unfenced: CLAUDE_UNFENCED,
  granted: CLAUDE_GRANTED,
});

/**
 * Codex's fence: its sandboxes, narrowest first, none of which it drops or stops to ask in. Its sandbox takes no allow rule, so no
 * sandbox refuses what a rule would have reached, and no tool is unruled or granted.
 */
const codexReach = (): FenceReach => ({
  by: 'sandbox',
  rank: Object.fromEntries(CODEX_SANDBOXES.map((sandbox, i) => [sandbox, i])),
  given: CODEX_DEFAULT_SANDBOX,
  writes: CODEX_SANDBOXES.indexOf('workspace-write'),
  unasking: [],
  dropped: [],
  refusing: [],
  unfenced: [],
  granted: {},
});

/**
 * What harness `harness`'s fence words reach on `model` (`FenceReach`), or `undefined` for a harness fenced by neither a mode nor a
 * sandbox: a command, an A2A agent, or a name the runtime does not know.
 */
export const fenceReach = (harness: string, model?: string): FenceReach | undefined => {
  if (harness === 'claude' || harness === 'claude-detached') return claudeReach(model);
  if (harness === 'codex') return codexReach();
  return undefined;
};

/**
 * The first character of `path` that a permission rule of harness `harness` cannot carry (`CLAUDE_UNRULED` on Claude Code), so that a
 * rule naming the path would end, or name another folder, or widen to one beside it; `undefined` for a path every rule carries, and on a
 * harness whose fence takes no rule naming a path: Codex, a command, an A2A agent, or a name the runtime does not know.
 */
export const unruledIn = (harness: string, path: string): string | undefined =>
  harness === 'claude' || harness === 'claude-detached' ? CLAUDE_UNRULED.exec(path)?.[0] : undefined;
