/**
 * `nemia inbox add "<idea>"|<file> [--workflow <name>] [--factory <name>] [--label <key=value>]...`: an idea filed as a card through the
 * Card's `create`, in the namespace of `--factory`, else of the factory the idea's own `factory:` line names, else `default`
 * (`filedNamespace`). A file is read here and its text sent (Q8); a folder is refused, naming the command. `--workflow` is sent by its
 * name, a path refused; `--label` each edit as typed. A card names no repository: its words refuse `--repo`, the factory's wiring placing
 * its run. Each `--file`, and each file beside an idea file that its text names as a markdown image's or link's target outside code
 * (`besideIdea`), is uploaded first to the namespace's files and carried by the card by its id, and a line says each file it carries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { filedNamespace, INBOX_ADD_WORDS, type Args, type Card } from 'objects';
import { asked } from '../../objects.ts';
import { listArg, said, textArg } from '../requests.ts';
import { inputsOf, uploaded } from '../runs/start.ts';
import { cardFileLines } from './attach.ts';
import { factoryLine, fileOf, labelsText, textOrFile, workflowNamed } from './card-lines.ts';

const { name: COMMAND } = INBOX_ADD_WORDS;

/** A line per key the card was filed without, since the runs of its `from:` disagree on it: each run with its value, and how to set it. */
const leftOutLines = (card: Card) =>
  (card.status.labelsLeftOut ?? []).map(
    ({ key, values }) =>
      `label ${key} not inherited: ${values.map((v) => `${v.run} has ${key}=${v.value}`).join(', ')} — set it with nemia label inbox ${card.metadata.name} ${key}=<value>`,
  );

/**
 * What `nemia inbox add` prints of the card filed: a line of it, a line per label left out, and how to start it.
 * @param card The card the api filed.
 */
export const filedLines = (card: Card) => {
  const { name, labels } = card.metadata;
  const { spec } = card;
  const title = (spec.body ?? '').split('\n')[0] ?? '';
  return [
    `${name}  ${title.slice(0, 56)}${spec.workflow ? `  workflow: ${spec.workflow}` : ''}${factoryLine(card)}${labels && Object.keys(labels).length ? `  labels: ${labelsText(labels)}` : ''}`,
    ...leftOutLines(card),
    `filed: ${fileOf(card)} — start it with nemia start ${name}${spec.workflow ? '' : ' --workflows <w>'}`,
  ];
};

/** A markdown image's or link's target, up to its closing parenthesis or a title after a space: `](<target>`. */
const TARGET = /\]\(\s*<?([^)\s>]+)>?/g;

/** A fenced code block, from its fence of three backticks or tildes to the line that closes it, or to the end where none does. */
const FENCED = /^ {0,3}((`|~)\2{2,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[ \t]*$|(?![\s\S]))/gm;

/** An inline code span: a run of backticks, what it quotes, and a run of as many. */
const SPAN = /(?<!`)(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g;

/**
 * The files of the idea file `idea` that its text names as a markdown image's or link's target outside code, each a file there, in the
 * order the text names them, once — a link quoted in a code span or a fenced code block, an example of one, names none: `taken`, each
 * beside it (`name` or `./name`), which the card carries; `notTaken`, each in a folder below or beside it (`img/shot.png`), which it does
 * not, as the text names it and as `--file` takes it.
 * @param idea The idea as typed: a file's path, or words, which name none.
 * @param body The idea's text.
 */
export function besideIdea(idea: string, body: string) {
  const taken = new Set<string>();
  const notTaken = new Map<string, string>();
  if (!fs.statSync(idea, { throwIfNoEntry: false })?.isFile()) return { taken: [...taken], notTaken: [...notTaken] };
  const dir = path.dirname(idea);
  for (const match of body.replace(FENCED, ' ').replace(SPAN, ' ').matchAll(TARGET)) {
    const target = (match[1] ?? '').replace(/^\.\//, '');
    if (target === '' || target.includes(':') || path.isAbsolute(target)) continue;
    const at = path.join(dir, target);
    if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) continue;
    if (target.includes('/')) notTaken.set(target, at);
    else taken.add(at);
  }
  return { taken: [...taken], notTaken: [...notTaken] };
}

/**
 * A line for each file the idea's text names in a folder, which the card does not carry: the `--file` that would.
 * @param notTaken Each such file, as the text names it and as `--file` takes it.
 */
const notTakenLines = (notTaken: readonly (readonly [string, string])[]) =>
  notTaken.map(
    ([named, at]) =>
      `not carried: ${named} is in a folder, and a card carries only the files beside its idea file — add it with --file ${at}, or nemia inbox attach <card> ${at}`,
  );

/**
 * `nemia inbox add`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxAdd(args: Args) {
  const idea = textArg(args, 'idea') ?? '';
  const body = textOrFile(idea, COMMAND, 'nemia inbox add "<idea>", or nemia inbox add ./idea.md');
  const workflow = workflowNamed(textArg(args, 'workflow'), COMMAND, 'nemia inbox add "<idea>"');
  const label = listArg(args, 'label');
  const namespace = filedNamespace(body, textArg(args, 'factory'));
  const typed = listArg(args, 'file');
  const named = besideIdea(idea, body);
  const typedHere = (f: string) => typed.some((t) => path.resolve(t) === path.resolve(f));
  const beside = named.taken.filter((f) => !typedHere(f));
  const given = inputsOf([...typed, ...beside], 'nemia inbox add', '--file');
  const files = given.length ? await uploaded(namespace, given, COMMAND) : [];
  const payload = {
    body,
    ...(workflow === undefined ? {} : { workflow }),
    ...(label.length ? { label } : {}),
    ...(files.length ? { files } : {}),
  };
  const card = await asked(COMMAND, (c) => c.cards.create({ params: { namespace }, payload }));
  said(filedLines(card));
  if (card.status.files?.length) said(cardFileLines(card));
  said(notTakenLines(named.notTaken.filter(([, at]) => !typedHere(at))));
  return 0;
}
