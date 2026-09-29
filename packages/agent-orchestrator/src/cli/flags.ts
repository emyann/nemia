/**
 * The flag reader every verb's parser calls, and what the families share beneath the verbs: a usage refusal, a person's yes, an amount.
 */
import readline from 'node:readline/promises';
import { Invalid } from '../runner.ts';
import { dollarsOf } from '../workflow.ts';

export const usage = (message: string): never => {
  throw new Invalid({ message });
};

/**
 * How a verb reads its flags: the value flags it takes and what each takes, as its refusal says it; its switches; the value flags it takes
 * more than once; flags it refuses with a reason of their own; and the refusals of an argument it does not take and of a flag given twice.
 */
type FlagRules = {
  takes: Readonly<Record<string, string>>;
  switches?: readonly string[];
  repeats?: readonly string[];
  refuses?: Readonly<Record<string, string>>;
  unknown: (arg: string) => string;
  twice: (flag: string) => string;
};

/**
 * A verb's flags after its one positional argument — `wf start`'s and `wf plan`'s — each value flag also as `--flag=<value>`. Anything else is
 * refused before anything is read: a flag the verb does not take, a misspelt one, a value flag with no value or given twice, and a second
 * positional: dropped instead, a misspelt `--after` would start a run that waits on nothing, filed on the next pass.
 */
export function readFlags(argv: string[], rules: FlagRules): { values: Record<string, string[]>; switches: string[] } {
  const values: Record<string, string[]> = {};
  const switches: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (rules.switches?.includes(arg)) {
      switches.push(arg);
      continue;
    }
    const joined = arg.startsWith('--') && arg.includes('=');
    const name = joined ? arg.slice(0, arg.indexOf('=')) : arg;
    if (rules.refuses && Object.hasOwn(rules.refuses, name)) usage(rules.refuses[name]);
    if (!Object.hasOwn(rules.takes, name)) usage(rules.unknown(arg));
    const value = joined ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
    if (!value || (!joined && value.startsWith('--'))) usage(`${name} takes ${rules.takes[name]}`);
    if (values[name] && !rules.repeats?.includes(name)) usage(rules.twice(name));
    (values[name] ??= []).push(value);
  }
  return { values, switches };
}

/** A person's yes, asked on the terminal: false with no terminal to ask on, and for anything but y or yes. */
export async function confirmed(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

/** A `--budget`'s value as dollars (`dollarsOf`), or refused, saying what it takes: an amount above zero, in digits. */
export function amountOf(text: string | undefined, takes: string, form: string): number {
  const amount = text === undefined ? undefined : dollarsOf(text);
  if (amount === undefined)
    usage(
      `--budget takes ${takes} — an amount above zero, in digits, like 5 or 2.50${text === undefined ? '' : `, and ${text} is not one`}: ${form}`,
    );
  return amount!;
}
