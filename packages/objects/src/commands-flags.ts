/**
 * The flags several commands take, built once: `--why` and `--by` (`saidFlags`, with their refusals), the `-l` selector of labels and the
 * label columns (`labelFlags`), the refusal of a text flag's value left out (`leftOut`), and `--json` with the words of a read that
 * prints the api's answer (`ANSWER_JSON`, `answerSpec`). Pure.
 */
import type { Args, Flag, Positional, Spec } from './command.ts';

/** `--why`, `--by` or `--to`: the flag, the key it fills, what it takes as its refusals say it, and the longest it may be. */
export type Said = {
  readonly flag: '--why' | '--by' | '--to';
  readonly key: 'why' | 'by' | 'to';
  readonly takes: string;
  readonly cap: number;
};

/**
 * Each of `said`'s refusals of a value left out, saying what it takes, ending on the command's forms.
 * @param said Each text flag of the command and what it takes.
 * @param shape The command's forms, which end each refusal.
 */
export const takesOf = (said: readonly Said[], shape: string) =>
  Object.fromEntries(said.map(({ flag, takes }) => [flag, `${flag} takes ${takes}: ${shape}.`]));

/**
 * The refusal of `flag`'s value left out, in `refusals`, which holds one for each text flag of its command (`takesOf`): a flag it holds
 * none for is thrown, naming it.
 * @param refusals The command's refusals of a value left out, by flag (takesOf).
 * @param flag The flag whose refusal is asked, as spelled on the command line.
 */
export const takesFor = (refusals: Readonly<Record<string, string>>, flag: string) => {
  const takes = refusals[flag];
  if (takes === undefined) throw new Error(`${flag} has no refusal of its value left out: add it to its command's table of them`);
  return takes;
};

/**
 * `--why`, `--by` or `--to`'s value as one line: every run of whitespace, a newline included, one space.
 * @param args The command line's arguments, by key.
 * @param key Which of the three flags' values to read.
 */
export const saidOf = (args: Args, key: 'why' | 'by' | 'to') => {
  const value = args[key];
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : undefined;
};

/**
 * Refused of `--why` or `--by`: a value starting `--`, which reads as the value left out (its refusal in `takes`), blank, or longer than
 * its cap.
 * @param args The command line's arguments, by key.
 * @param refusals The command's refusals of a value left out, by flag (takesOf).
 */
export function saidRefusal(args: Args, { flag, key, takes, cap }: Said, refusals: Readonly<Record<string, string>>) {
  const value = args[key];
  if (typeof value !== 'string') return null;
  if (value.startsWith('--')) return takesFor(refusals, flag);
  const line = saidOf(args, key) ?? '';
  if (!line) return `${flag} takes ${takes}, and was given only blanks: give it words, or leave ${flag} out.`;
  if (line.length > cap) return `${flag} takes at most ${cap} characters, and was given ${line.length}: say it shorter.`;
  return null;
}

/**
 * `--why` and `--by` as `command` takes them, for what it puts (`a hold`): each a text flag given once, refused in `refusals`' words.
 * @param said Each text flag of the command, its key, and what it takes.
 * @param command The command line's name, as a refusal of a flag given twice says it (nemia hold).
 * @param puts What the command puts, as a refusal of a flag given twice says it (a hold).
 * @param refusals The command's refusals of a value left out, by flag (takesOf).
 * @param shape The command's forms, which end the refusal of a flag given twice.
 */
export const saidFlags = (
  said: readonly Said[],
  command: string,
  puts: string,
  refusals: Readonly<Record<string, string>>,
  shape: string,
) =>
  said.map(({ flag, key }) => ({
    flag,
    kind: 'text' as const,
    key,
    takes: refusals[flag],
    twice: `${command} takes ${flag} once: ${puts} says one ${key}. ${shape}.`,
  }));

/**
 * The refusal of a text flag's value left out on the command line — empty, or starting `--`, which reads as the value left out — in the
 * flag's own `takes`, or null.
 * @param spec The command's flags, each text one with what it takes.
 * @param args The command line's arguments, by key.
 */
export function leftOut(spec: Spec, args: Args) {
  for (const flag of spec.flags.filter((f) => f.kind === 'text' && f.key !== undefined)) {
    if (flag.key === undefined) continue;
    const value = args[flag.key];
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    if (values.some((v) => !v || v.startsWith('--'))) return flag.takes ?? null;
  }
  return null;
}

/**
 * The forms a label selector takes, as a flag's refusal of none says them. Which keys a line carries, and why a selector is no selector,
 * are the api's to say: it holds the grammar, and refuses one in the grammar's own words.
 */
export const SELECTOR_FLAG_FORM =
  '-l <key>=<value>, -l <key>!=<value>, -l "<key> in (<a>,<b>)", -l "<key> notin (<a>,<b>)" or -l <key> for a line that carries it; ' +
  'commas between clauses, which all must hold, and -l again for another selector, of which one must';

/**
 * `-l <selector>`, given again for another, of the command `command`: the runs whose labels one of them takes.
 * @param command The command line's name, as the flag's refusal says it.
 */
export const selectorFlag = (command: string) =>
  ({
    flag: '-l',
    kind: 'text',
    key: 'selector',
    many: true,
    takes: `${command} -l takes a selector of the runs' labels: ${SELECTOR_FLAG_FORM}`,
  }) satisfies Flag;

/**
 * `-l <selector>`, `--show-labels` and `-L <key>` of the command `command`: the runs whose labels a selector takes, each given again for
 * another; each line with its whole map; and that label's value beside each line, given again for another.
 * @param command The command line's name, as each flag's refusal says it.
 */
export const labelFlags = (command: string) =>
  [
    selectorFlag(command),
    { flag: '--show-labels', kind: 'switch', key: 'showLabels' },
    {
      flag: '-L',
      kind: 'text',
      key: 'labelColumns',
      many: true,
      takes: `${command} -L takes the label key to show beside each line, given again for another: ${command} -L team`,
    },
  ] satisfies Flag[];

/** `--json`: a read's answer printed as JSON rather than YAML, a printing of the client's alone. */
export const ANSWER_JSON = {
  flag: '--json',
  kind: 'switch',
  key: 'json',
  only: { side: 'cli', why: 'the api answers JSON whatever is asked: the client prints it as YAML, or as it is with --json' },
} as const satisfies Flag;

/**
 * The words of a read that prints the api's answer: its positionals, each required, and `--json`, with a refusal of anything else and of
 * a positional left out, each ending on its form.
 * @param command The command's name, as typed after `nemia`.
 * @param usage Its usage after the name, which ends each refusal.
 * @param positionals The keys of its positionals, in order, each required.
 * @param flags The flags it takes besides `--json`.
 */
export const answerSpec = (command: string, usage: string, positionals: readonly string[] = [], flags: readonly Flag[] = []) =>
  ({
    positionals: positionals.map((key) => ({ key, takes: 'required', kind: 'name' }) satisfies Positional),
    flags: [...flags, ANSWER_JSON],
    unknown: (arg) => `nemia ${command} does not take ${arg}: nemia ${command} ${usage}.`,
    ...(positionals.length > 0
      ? { missing: `nemia ${command} takes ${positionals.map((key) => `<${key}>`).join(', then ')}: nemia ${command} ${usage}.` }
      : {}),
  }) satisfies Spec;
