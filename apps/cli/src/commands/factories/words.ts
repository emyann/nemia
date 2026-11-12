/**
 * The runners of what a factory says in words: its rules (`nemia factory rules`), where its instruction is kept (`nemia factory
 * instruction`) and the text the store keeps for it (`nemia factory instruct`). A `--file` is read here, `-` from stdin, and its text sent:
 * the api is never sent a path of this machine. `--path` names a file in the factory's first folder, which the daemon reads, sent as typed.
 * Each prints, word for word as the old path did, what the api answers.
 */
import fs from 'node:fs';
import type { Args, FactoryInstruction, FactoryRules } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { textOf as fileText } from '../files.ts';
import { said, switchArg, textArg } from '../requests.ts';
import { textOf } from './lines.ts';

/** The words `--file` names for `command`: the file's text, or stdin's for `-`; refused, naming it, where it cannot be read. */
export function wordsOf(file: string, command: string): string {
  if (file !== '-') return fileText(file, command);
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    throw new Refused(
      `nemia ${command} cannot read stdin: ${err instanceof Error ? err.message : String(err)}. Name a file that is there.`,
    );
  }
}

/** What a run already started does with the rules, said after a write. */
const KEPT = 'a run already started keeps the rules it was started with';

/** What `nemia factory rules` prints of what it read, wrote (`wrote`) or removed. */
export function rulesLines(data: FactoryRules, wrote: boolean): string[] {
  const { name } = data;
  if (data.removed !== undefined)
    return [data.removed ? `${name}: rules removed, ${data.file} — ${KEPT}` : `${name} has no rules to remove`];
  if (wrote) return [`${name}: rules written to ${data.file}, told to every agent hired into it in every run started from now — ${KEPT}`];
  if (data.error !== null) return [`${name}: rules kept in ${data.file}`, `they cannot be told: ${data.error}`];
  if (data.words === null)
    return [`${name} has no rules. Write them with nemia factory rules ${name} --file <path>, or --file - for stdin.`];
  return [`${name}: rules kept in ${data.file}`, '', data.words];
}

/** `nemia factory rules`: a factory's rules, read bare, written from `--file`, removed with `--clear`. */
export async function factoryRules(args: Args): Promise<number> {
  const name = textOf(args, 'factory');
  const file = textArg(args, 'file');
  const words = file === undefined ? undefined : wordsOf(file, 'factory rules');
  const data = await asked('factory rules', (c) =>
    switchArg(args, 'clear')
      ? c.factories.deleteRules({ params: { name } })
      : words !== undefined
        ? c.factories.putRules({ params: { name }, payload: { words } })
        : c.factories.rules({ params: { name } }),
  );
  said(rulesLines(data, words !== undefined));
  return 0;
}

/** Where a factory's instruction is kept, as its lines say it. */
const keptLine = (data: FactoryInstruction): string =>
  data.store ? `kept in the store: ${data.file}` : `read from ${data.file}, in the factory's first folder`;

/** What `nemia factory instruction` prints of a read: where it is kept, then the words, or why there are none. */
export function instructionLines(data: FactoryInstruction): string[] {
  const where = `${data.name}: ${keptLine(data)}`;
  if (data.error !== null) return [where, `it does not read: ${data.error}`];
  if (data.words === null)
    return [
      where,
      data.store
        ? `no instruction there yet: write one with nemia factory instruct ${data.name} --file <path>`
        : 'no file there yet: write it in the folder, or keep the instruction in the store',
    ];
  return [where, '', data.words];
}

/** `nemia factory instruction`: where a factory's instruction is kept, read bare, or set with `--path`, `--store` or `--clear`. */
export async function factoryInstruction(args: Args): Promise<number> {
  const name = textOf(args, 'factory');
  const at = textArg(args, 'path');
  const placed = switchArg(args, 'clear') || switchArg(args, 'store') || at !== undefined;
  const data = await asked('factory instruction', (c) =>
    switchArg(args, 'clear')
      ? c.factories.deleteInstruction({ params: { name } })
      : switchArg(args, 'store')
        ? c.factories.putInstruction({ params: { name }, payload: { store: true } })
        : at !== undefined
          ? c.factories.putInstruction({ params: { name }, payload: { path: at } })
          : c.factories.instruction({ params: { name } }),
  );
  said(placed ? [`${data.name}: instruction ${keptLine(data)}`] : instructionLines(data));
  return 0;
}

/** `nemia factory instruct`: the instruction the store keeps for a factory, written from `--file` or removed with `--clear`. */
export async function factoryInstruct(args: Args): Promise<number> {
  const name = textOf(args, 'factory');
  const file = textArg(args, 'file');
  const words = file === undefined ? undefined : wordsOf(file, 'factory instruct');
  const data = await asked('factory instruct', (c) =>
    words === undefined
      ? c.factories.deleteInstructionWords({ params: { name } })
      : c.factories.putInstructionWords({ params: { name }, payload: { words } }),
  );
  if (data.removed !== undefined)
    said([data.removed ? `${data.name}: instruction removed, ${data.file}` : `${data.name} has no instruction in the store to remove`]);
  else said([`${data.name}: instruction written to ${data.file}`]);
  return 0;
}
