/**
 * The former names of commands and of their flags, and the read of a command line that still says one (`renamedIn`): the client runs the
 * line as the name it became, and admission reads it as that name too, so an old spelling reaches no rule the new one would not. And the
 * commands retired with nothing to run in their place (`RETIRED_COMMANDS`), which the client refuses naming what to type instead
 * (`retiredIn`). Pure.
 */
import { CLI } from './command.ts';

/** What a former name became (`RENAMED`): the name it is now, and the flag that says an absorbed verb, where it says one. */
export type Renamed = { readonly to: string; readonly flag?: string };

/**
 * Each command renamed, by its former name of one word or two: `nemia auto …` is `nemia policy …`, and a verb another absorbed is that verb
 * with the flag that says it — `nemia round` is `nemia retry --round`, `nemia merge` is `nemia refresh --base`, `nemia accept` is `nemia
 * approve` (decision 7). Decision 8 gives a list, a read of one thing and a removal one spelling each, the rows of two words below: a
 * removal is `rm`, a one-off of an agent `agents run` (kubectl's run), a template's judgement `template lint` (so a check stays a step's),
 * an upgrade's preview `factory diff`, and a folder of cards `start <folder>`. A command line that opens with a former name
 * is still run, as the name it became, and admission reads it as that name too, so the old spelling reaches no rule the new one would not;
 * and no entry of the orchestrator's table is named by a former name (`commandBreaks`), which no line would ever reach.
 */
export const RENAMED: ReadonlyMap<string, Renamed> = new Map([
  ['auto', { to: 'policy' }],
  ['round', { to: 'retry', flag: '--round' }],
  ['merge', { to: 'refresh', flag: '--base' }],
  ['accept', { to: 'approve' }],
  ['plan', { to: 'start' }],
  ['agents remove', { to: 'agents rm' }],
  ['agents try', { to: 'agents run' }],
  ['workflows remove', { to: 'workflows rm' }],
  ['policy drop', { to: 'policy rm' }],
  ['template check', { to: 'template lint' }],
  ['factory plan', { to: 'factory diff' }],
]);

/** What an agent types in place of a list of names it may speak under: a token of its own, which says who it is. */
const AGENT_TOKEN = `an agent speaks with a token of its own, which says who it is: the person mints one with \`${CLI} token add <name> --agent <agent>\` and hands it to the agent`;

/**
 * Each command retired with no command in its place, by its name of one word or two, and the words that say what to type instead: the
 * chat's list of the names an agent may speak under (`chat speakers`, `chat allow`, `chat disallow`), retired for an agent's own token.
 */
export const RETIRED_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['chat speakers', `${CLI} chat speakers is retired: no list of names is kept, ${AGENT_TOKEN}; \`${CLI} token ls\` lists the tokens.`],
  ['chat allow', `${CLI} chat allow is retired: ${AGENT_TOKEN}.`],
  ['chat disallow', `${CLI} chat disallow is retired: ${AGENT_TOKEN}, and \`${CLI} token rm <name>\` retires it.`],
]);

/**
 * The refusal of a command line, its words after the program, that opens with a retired command (`RETIRED_COMMANDS`, the longest that
 * matches): the words that say what to type instead, or undefined where it opens with none.
 */
export function retiredIn(words: readonly string[]): string | undefined {
  for (const size of [2, 1]) {
    const said = words.length >= size ? RETIRED_COMMANDS.get(words.slice(0, size).join(' ')) : undefined;
    if (said !== undefined) return said;
  }
  return undefined;
}

/** Each flag renamed, by the command that takes it and its former spelling: `nemia retry --nudge` is `nemia retry --continue`. */
export const RENAMED_FLAGS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([['retry', new Map([['--nudge', '--continue']])]]);

/** `rest`, the words after a command's name, with `flag` before the first flag among them, or after them where none is. */
const withFlag = (rest: readonly string[], flag: string | undefined): string[] => {
  if (flag === undefined) return [...rest];
  const at = rest.findIndex((w) => w.startsWith('-'));
  return at === -1 ? [...rest, flag] : [...rest.slice(0, at), flag, ...rest.slice(at)];
};

/** The former name `words` open with, the longest first, and how many words it is; none where they open with no former name. */
function formerAt(words: readonly string[], used: ReadonlySet<string>): { key: string; size: number; now: Renamed } | undefined {
  for (const size of [2, 1]) {
    const key = words.slice(0, size).join(' ');
    const now = RENAMED.get(key);
    if (words.length >= size && !used.has(key) && now) return { key, size, now };
  }
  return undefined;
}

/**
 * `words`, a command line's words after the program, its name put to the name it became where it opens with a former one (`RENAMED`, the
 * longest that matches, then again on what it became, each former name once, so `auto drop` is put to `policy …` and then to `policy rm`),
 * the flag that says an absorbed verb added before its other flags, and each former flag of the command put to its new spelling
 * (`RENAMED_FLAGS`); with the hint naming what was typed and what to type now, or `words` as given and no hint.
 */
export function renamedIn(words: readonly string[]): { words: string[]; hint?: string } {
  let named = [...words];
  let name = 0;
  let typed = 0;
  const added: string[] = [];
  const used = new Set<string>();
  for (let at = formerAt(named, used); at !== undefined; at = formerAt(named, used)) {
    const now = at.now;
    used.add(at.key);
    typed += Math.max(0, at.size - name);
    const to = now.to.split(' ');
    named = [...to, ...withFlag(named.slice(at.size), now.flag)];
    name = to.length;
    if (now.flag !== undefined) added.push(now.flag);
  }
  const flags = RENAMED_FLAGS.get(named.slice(0, name || 1).join(' '));
  const former = flags === undefined ? [] : named.slice(name || 1).filter((w) => flags.has(w));
  if (!used.size && !former.length) return { words: [...words] };
  const rewritten = flags === undefined ? named : [...named.slice(0, name || 1), ...named.slice(name || 1).map((w) => flags.get(w) ?? w)];
  const was = [...(used.size ? [[CLI, ...words.slice(0, typed)].join(' ')] : []), ...former];
  const is = [...(used.size ? [[CLI, ...named.slice(0, name), ...added].join(' ')] : []), ...former.flatMap((f) => flags?.get(f) ?? [])];
  return {
    words: rewritten,
    hint: `${was.join(' and ')} ${was.length > 1 ? 'are' : 'is'} now ${is.join(' and ')}: type \`${[CLI, ...rewritten].join(' ')}\`; the former spelling is still read until a later release removes it.`,
  };
}
