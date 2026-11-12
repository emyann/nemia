/**
 * The flags several commands take, built once: `--why` and `--by` (`saidFlags`, with their refusals), the `-l` selector of labels and the
 * label columns (`labelFlags`), and the refusal of a text flag's value left out (`leftOut`). Pure.
 */
import type { Args, Flag, Spec } from './command.ts';

/** `--why` or `--by`: the flag, the key it fills, what it takes as its refusals say it, and the longest it may be. */
export type Said = { readonly flag: '--why' | '--by'; readonly key: 'why' | 'by'; readonly takes: string; readonly cap: number };

/** Each of `said`'s refusals of a value left out, saying what it takes, ending on the command's forms. */
export const takesOf = (said: readonly Said[], shape: string): Readonly<Record<string, string>> =>
  Object.fromEntries(said.map(({ flag, takes }) => [flag, `${flag} takes ${takes}: ${shape}.`]));

/**
 * The refusal of `flag`'s value left out, in `refusals`, which holds one for each text flag of its command (`takesOf`): a flag it holds
 * none for is thrown, naming it.
 */
export const takesFor = (refusals: Readonly<Record<string, string>>, flag: string): string => {
  const takes = refusals[flag];
  if (takes === undefined) throw new Error(`${flag} has no refusal of its value left out: add it to its command's table of them`);
  return takes;
};

/** `--why` or `--by`'s value as one line: every run of whitespace, a newline included, one space. */
export const saidOf = (args: Args, key: 'why' | 'by'): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : undefined;
};

/**
 * Refused of `--why` or `--by`: a value starting `--`, which reads as the value left out (its refusal in `takes`), blank, or longer than
 * its cap.
 */
export function saidRefusal(args: Args, { flag, key, takes, cap }: Said, refusals: Readonly<Record<string, string>>): string | null {
  const value = args[key];
  if (typeof value !== 'string') return null;
  if (value.startsWith('--')) return takesFor(refusals, flag);
  const line = saidOf(args, key) ?? '';
  if (!line) return `${flag} takes ${takes}, and was given only blanks: give it words, or leave ${flag} out.`;
  if (line.length > cap) return `${flag} takes at most ${cap} characters, and was given ${line.length}: say it shorter.`;
  return null;
}

/** `--why` and `--by` as `command` takes them, for what it puts (`a hold`): each a text flag given once, refused in `refusals`' words. */
export const saidFlags = (
  said: readonly Said[],
  command: string,
  puts: string,
  refusals: Readonly<Record<string, string>>,
  shape: string,
): Flag[] =>
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
 */
export function leftOut(spec: Spec, args: Args): string | null {
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

/** `-l <selector>`, given again for another, of the command `command`: the runs whose labels one of them takes. */
export const selectorFlag = (command: string): Flag => ({
  flag: '-l',
  kind: 'text',
  key: 'selector',
  many: true,
  takes: `${command} -l takes a selector of the runs' labels: ${SELECTOR_FLAG_FORM}`,
});

/**
 * `-l <selector>`, `--show-labels` and `-L <key>` of the command `command`: the runs whose labels a selector takes, each given again for
 * another; each line with its whole map; and that label's value beside each line, given again for another.
 */
export const labelFlags = (command: string): Flag[] => [
  selectorFlag(command),
  { flag: '--show-labels', kind: 'switch', key: 'showLabels' },
  {
    flag: '-L',
    kind: 'text',
    key: 'labelColumns',
    many: true,
    takes: `${command} -L takes the label key to show beside each line, given again for another: ${command} -L team`,
  },
];
