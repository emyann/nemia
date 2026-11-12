/**
 * The runner of `nemia start`: a run of a workflow named by its name (the Run's `create`), from a brief in words or a file's text read
 * here — a file that opens with a plan card's frontmatter giving its body and its `workflow:` — or of an inbox card named by its name (the
 * Card's `start`). What the api cannot read from where it runs is read here and sent as data: the brief's file, each `--input` file by
 * its name and its bytes, and `--repo` as `pathSent` sends a path. A plan folder and a workflow given as a path are refused, naming the
 * start by name; so is a brief whose workflow is not named. It prints the lines the api answers (`RunStarted.lines`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { type Args, type CardStart, DEFAULT_NAMESPACE, type RunStart, START_WORDS } from 'objects';
import { chosenOf } from '../../context.ts';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, pathSent, said, switchArg, textArg } from '../requests.ts';

/** The command, as its refusals name it. */
const COMMAND = START_WORDS.name;

/** A plan card's keys: what a file's frontmatter may say to `nemia start`. */
const CARD_KEYS = ['workflow', 'after'] as const;

/** A frontmatter key: a word of letters, digits, `_` and `-`. A sentence before a colon is none. */
const KEY_WORD = /^[A-Za-z][\w-]*$/;

/** A plan's card read off a file: its body, its `workflow:` where it names one, and the cards its `after:` waits on. */
export type PlanCard = { body: string; workflow?: string; after: string[] };

/**
 * The plan card `text`, the file `file` holds, opens with: its body and keys; null for a file with no frontmatter block of keys, whose
 * text is the whole brief. Refused, exit 2: a key a plan's card lacks, naming the inbox that reads it, and an `after:` with no `--after`.
 */
export function planCardOf(file: string, text: string, after: readonly string[]): PlanCard | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return null;
  const pairs = (m[1] ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
    .map((line) => {
      const at = line.indexOf(':');
      return { key: at > 0 ? line.slice(0, at).trim() : '', value: at > 0 ? line.slice(at + 1).trim() : '' };
    });
  if (!pairs.length || !pairs.every(({ key }) => KEY_WORD.test(key))) return null;
  const stray = pairs.find(({ key }) => !(CARD_KEYS as readonly string[]).includes(key));
  if (stray !== undefined)
    throw new Refused(
      `${file}: \`${stray.key}\` is not a key a plan's card has: nemia start reads a file that opens with a frontmatter block as a plan's card, whose keys are ${CARD_KEYS.join(' and ')}, and never takes the block into its brief. If they are an inbox card's keys, file it in the inbox: nemia inbox add ${file}, then nemia start the card by its name. Else delete the line, or the whole block to start the file as a brief.`,
    );
  const keyed = (key: string): string | undefined => pairs.find((p) => p.key === key)?.value;
  const waits = (keyed('after') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (waits.length && !after.length)
    throw new Refused(
      `${file}: \`after:\` waits on the runs of ${waits.join(', ')}, and nemia start was given no --after, so it would start at once. Give the id of each, from nemia ls: nemia start ${file} ${waits.map((a) => `--after <${a}'s run id>`).join(' ')}.`,
    );
  const workflow = keyed('workflow');
  return { body: (m[2] ?? '').trim(), ...(workflow ? { workflow } : {}), after: waits };
}

/** A file handed to the run's steps (`--input`), as the api takes it: its name, and its text where its bytes are UTF-8, else its bytes. */
export function inputOf(file: string): { name: string; text?: string; base64?: string } {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch (err) {
    throw new Refused(`nemia start cannot read --input ${path.resolve(file)}: ${(err as Error).message}. Name a file that is there.`);
  }
  const name = path.basename(file);
  try {
    return { name, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { name, base64: bytes.toString('base64') };
  }
}

/** `--model <step>=<model>`s as the api takes them, step by step; refused, exit 2, for one that is not a step and a model. */
export function modelsOf(typed: readonly string[]): Record<string, string> | undefined {
  if (!typed.length) return undefined;
  return Object.fromEntries(
    typed.map((value) => {
      const at = value.indexOf('=');
      const step = at > 0 ? value.slice(0, at).trim() : '';
      const model = at > 0 ? value.slice(at + 1).trim() : '';
      if (!step || !model)
        throw new Refused(
          `--model ${value} is not a step and a model: nemia start <brief> --model <step>=<model>, like --model implement=opus.`,
        );
      return [step, model];
    }),
  );
}

/** What a start sends beside its workflow and brief, of either door: the runs and cards it is handed, its labels, gates, models, inputs. */
function extrasOf(args: Args): Omit<RunStart, 'workflow' | 'brief' | 'from' | 'card'> {
  const after = listArg(args, 'after');
  const context = listArg(args, 'context');
  const cards = listArg(args, 'cards');
  const label = listArg(args, 'label');
  const gates = listArg(args, 'gates');
  const models = modelsOf(listArg(args, 'models'));
  const inputs = listArg(args, 'inputs').map(inputOf);
  return {
    ...(after.length ? { after: [...after] } : {}),
    ...(context.length ? { context: [...context] } : {}),
    ...(cards.length ? { cards: [...cards] } : {}),
    ...(label.length ? { label: [...label] } : {}),
    ...(gates.length ? { gates: [...gates] } : {}),
    ...(models !== undefined ? { models } : {}),
    ...(inputs.length ? { inputs } : {}),
    ...(switchArg(args, 'noWorktree') ? { noWorktree: true } : {}),
  };
}

/** A workflow named by its name; refused, exit 2, given as a path, naming the start by name. */
function byName(workflow: string, brief: string): string {
  if (/[\\/]/.test(workflow) || workflow.startsWith('.'))
    throw new Refused(
      `nemia start takes a workflow by its name, as its factory offers it (nemia workflows lists them), never a path: nemia start ${brief} --workflows <name>.`,
    );
  return workflow;
}

/** The inbox card `word` names, by its name with or without `.md`, and its namespace; none where the inbox has no such card. */
async function cardNamed(word: string): Promise<{ name: string; namespace: string } | undefined> {
  if (word === '' || /\s/.test(word) || /[\\/]/.test(word) || word.startsWith('.')) return undefined;
  const name = word.endsWith('.md') && word.length > 3 ? word.slice(0, -3) : word;
  try {
    const card = await asked(COMMAND, (c) => c.cards.getAll({ params: { name } }));
    return { name, namespace: card.metadata.namespace ?? DEFAULT_NAMESPACE };
  } catch (err) {
    if (err instanceof Refused && err.code === 2) return undefined;
    throw err;
  }
}

/** `--brief`'s words in place of a card's body: a file's text where it names one here, else the words. */
const insteadOf = (instead: string): string =>
  fs.statSync(instead, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(instead, 'utf8') : instead;

/**
 * The repository of the folder `nemia start` is typed in, where it is in one: the nearest folder up from here that holds a `.git` — a
 * folder of a checkout, a file of a worktree — as `git rev-parse --show-toplevel` finds it, read here with no process spawned.
 */
function repoHere(from: string = process.cwd()): string | undefined {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** The repository a start sends: `--repo` as `pathSent` sends it; with none, on this machine's daemon alone, the one it is typed in. */
function repoOf(args: Args): string | undefined {
  const typed = textArg(args, 'repo');
  if (typed !== undefined) return pathSent(typed);
  return chosenOf(process.env).kind === 'remote' || textArg(args, 'factory') !== undefined ? undefined : repoHere();
}

/** The lines a start prints: the api's, or, of an api that says none, the run started and what reads it. */
const startedLines = ({ id, lines }: { id: string; lines?: readonly string[] }): string[] =>
  lines?.length
    ? [...lines]
    : [`${id}  started on the daemon — nemia show ${id} reads it, and the daemon's next pass files its first step`];

/** `nemia start` of the inbox card `card`: its body, or `--brief` in its place, on its own workflow unless `--workflows` names one. */
async function cardStart(card: { name: string; namespace: string }, args: Args): Promise<number> {
  const workflows = textArg(args, 'workflows');
  const instead = textArg(args, 'instead');
  const repo = textArg(args, 'repo');
  const factory = textArg(args, 'factory');
  const namespace = card.namespace === DEFAULT_NAMESPACE && factory !== undefined ? factory : card.namespace;
  const payload: CardStart = {
    ...extrasOf(args),
    ...(workflows !== undefined ? { workflow: byName(workflows, card.name) } : {}),
    ...(instead !== undefined ? { brief: insteadOf(instead) } : {}),
    ...(repo !== undefined ? { repo: pathSent(repo) } : {}),
  };
  said(startedLines(await asked(COMMAND, (c) => c.cards.start({ params: { namespace, name: card.name }, payload }))));
  return 0;
}

/** `nemia start <brief.md|card|"text"> --workflows <name> [...]`: a run of the workflow, or of the inbox card, started on the daemon. */
export async function start(args: Args): Promise<number> {
  const arg = textArg(args, 'brief') ?? '';
  const at = fs.statSync(arg, { throwIfNoEntry: false });
  if (at?.isDirectory())
    throw new Refused(
      `nemia start ${arg} names a folder, and a plan folder is not started whole: file each card in the inbox (nemia inbox add <card>) and start it by its name, nemia start <card>.`,
    );
  const card = at === undefined ? await cardNamed(arg) : undefined;
  if (card !== undefined) return cardStart(card, args);
  if (textArg(args, 'instead') !== undefined)
    throw new Refused(
      `nemia start takes --brief only for a card of the inbox, in place of its body: nemia start <card> --brief "<brief>". Anywhere else the brief is its first argument: nemia start "<brief>".`,
    );
  const text = at?.isFile() ? fs.readFileSync(arg, 'utf8') : undefined;
  const plan = text === undefined ? null : planCardOf(arg, text, listArg(args, 'after'));
  const typed = textArg(args, 'workflows') ?? plan?.workflow;
  const shown = text === undefined ? '"<brief>"' : arg;
  if (typed === undefined)
    throw new Refused(
      `nemia start starts a workflow named by its name, and names none here: nemia start ${shown} --workflows <name> (nemia workflows lists them).`,
    );
  const workflow = byName(typed, shown);
  const brief = plan ? plan.body : (text?.trim() ?? arg);
  const factory = textArg(args, 'factory');
  const namespace = factory ?? DEFAULT_NAMESPACE;
  const repo = repoOf(args);
  const payload: RunStart = { ...extrasOf(args), workflow, brief };
  said(
    startedLines(await asked(COMMAND, (c) => c.runs.create({ params: { namespace }, query: repo !== undefined ? { repo } : {}, payload }))),
  );
  return 0;
}
