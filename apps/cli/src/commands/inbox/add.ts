/**
 * `nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>] [--label <key=value>]...`: an idea filed as a
 * card through the Card's `create`, in the namespace of `--factory` (`default` for none). A file is read here and its text sent (Q8); a
 * folder is refused, naming the command. `--workflow` is sent by its name, a path refused; `--repo` is a path the daemon keeps
 * (`pathSent`); `--label` each edit as typed.
 */
import fs from 'node:fs';
import { DEFAULT_NAMESPACE, INBOX_ADD_WORDS, type Args, type Card } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { textOf } from '../files.ts';
import { listArg, pathSent, said, textArg } from '../requests.ts';
import { fileOf, labelsText, repoFactory, workflowNamed } from './card-lines.ts';

const { name: COMMAND } = INBOX_ADD_WORDS;

/** The idea typed: a file's text, read here, where it names one; else the words. A folder is refused, naming the command. */
const ideaOf = (idea: string): string => {
  const at = fs.statSync(idea, { throwIfNoEntry: false });
  if (at?.isDirectory())
    throw new Refused(
      `${idea} is a directory, and nemia inbox add takes the idea as text or as one file: nemia inbox add "<idea>", or nemia inbox add ./idea.md.`,
    );
  return at ? textOf(idea, COMMAND) : idea;
};

/** A line per key the card was filed without, since the runs of its `from:` disagree on it: each run with its value, and how to set it. */
const leftOutLines = (card: Card): string[] =>
  (card.status.labelsLeftOut ?? []).map(
    ({ key, values }) =>
      `label ${key} not inherited: ${values.map((v) => `${v.run} has ${key}=${v.value}`).join(', ')} — set it with nemia label inbox ${card.metadata.name} ${key}=<value>`,
  );

/** What `nemia inbox add` prints of the card filed: a line of it, a line per label left out, and how to start it. */
export const filedLines = (card: Card): string[] => {
  const { name, labels } = card.metadata;
  const { spec } = card;
  const title = (spec.body ?? '').split('\n')[0] ?? '';
  return [
    `${name}  ${title.slice(0, 56)}${spec.workflow ? `  workflow: ${spec.workflow}` : ''}${repoFactory(card)}${labels && Object.keys(labels).length ? `  labels: ${labelsText(labels)}` : ''}`,
    ...leftOutLines(card),
    `filed: ${fileOf(card)} — start it with nemia start ${name}${spec.workflow ? '' : ' --workflows <w>'}`,
  ];
};

/** `nemia inbox add`'s runner, on the words parsed against its words. */
export async function inboxAdd(args: Args): Promise<number> {
  const body = ideaOf(textArg(args, 'idea') ?? '');
  const workflow = workflowNamed(textArg(args, 'workflow'), COMMAND, 'nemia inbox add "<idea>"');
  const repo = textArg(args, 'repo');
  const factory = textArg(args, 'factory');
  const label = listArg(args, 'label');
  const namespace = factory !== undefined && factory !== '' ? factory : DEFAULT_NAMESPACE;
  const payload = {
    body,
    ...(workflow === undefined ? {} : { workflow }),
    ...(repo === undefined ? {} : { repo: pathSent(repo) }),
    ...(label.length ? { label } : {}),
  };
  said(filedLines(await asked(COMMAND, (c) => c.cards.create({ params: { namespace }, payload }))));
  return 0;
}
