/**
 * The runner of `nemia start`: a run of a workflow named by its name (the Run's `create`), from a brief in words or a file's text read
 * here — a file that opens with a plan card's frontmatter giving its body and its `workflow:` — or of an inbox card named by its name (the
 * Card's `start`). What the api cannot read from where it runs is read here and sent as data: the brief's file, each `--input` file
 * uploaded first, its own request, and named by its id (`inputsOf`, `uploaded`), and `--repo` as `pathSent` sends a path — else, under
 * this machine's context and with no `--factory`, the repository the start is typed in, or the folder where it is in none
 * (`repoQueryOf`) — which only finds the factory of a brief's start (its run works on the repository the factory's wiring names) and is
 * refused on a card's, whose factory places its run. A plan folder
 * and a workflow given as a path are refused, naming the start by name; so is a brief whose workflow is not named. It prints what the api
 * answers of the run, worded here (`startedLines`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ByteSize } from 'effect';
import { type Args, type CardStart, DEFAULT_NAMESPACE, FILE_LIMIT, type RunStart, START_WORDS, uploadBoundMs } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, repoQueryOf, said, switchArg, textArg } from '../requests.ts';
import { startedLines } from './started.ts';

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
 * @param file The file's path as typed, said in a refusal.
 * @param text The file's text.
 * @param after The run ids `--after` gives; an `after:` with none is refused.
 */
export function planCardOf(file: string, text: string, after: readonly string[]) {
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
  const keyed = (key: string) => pairs.find((p) => p.key === key)?.value;
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

/** A file `--input` names, read here: the path typed, its own name, and its size in bytes. */
export type InputFile = { readonly file: string; readonly name: string; readonly size: number };

/** The media type a file is uploaded with, by its extension, as a browser says it; else none, which the api keeps as octet-stream. */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

/** A size as a refusal says it: its unit and its bytes. */
const sizeSaid = (bytes: number) => `${ByteSize.format(ByteSize.bytes(bytes))} (${bytes} bytes)`;

/**
 * The files `--input` names, each read here, before anything is sent: refused, exit 2, for one that is not there or no file, and for one
 * past what a file may be (`FILE_LIMIT`), naming each such file's size, the total of them all, and the cap, so the person sees what to
 * shrink or leave out before a byte is sent.
 * @param files The paths of the files to hand, as `--input` typed them.
 */
export function inputsOf(files: readonly string[]) {
  const inputs = files.map((file) => {
    const at = fs.statSync(file, { throwIfNoEntry: false });
    if (!at?.isFile())
      throw new Refused(
        `nemia start cannot read --input ${path.resolve(file)}: it is ${at ? 'no file' : 'not there'}. Name a file that is there.`,
      );
    return { file, name: path.basename(file), size: at.size };
  });
  const past = inputs.filter((input) => input.size > Number(FILE_LIMIT));
  if (past.length)
    throw new Refused(
      `nemia start hands a run files of ${sizeSaid(Number(FILE_LIMIT))} at most each, and ${past.map((p) => `--input ${p.file} is ${sizeSaid(p.size)}`).join(', ')}; the ${inputs.length} file${inputs.length === 1 ? '' : 's'} given are ${sizeSaid(inputs.reduce((sum, i) => sum + i.size, 0))} in all. Hand ${past.length === 1 ? 'it' : 'each'} smaller, or leave ${past.length === 1 ? 'it' : 'them'} out. Nothing was sent.`,
    );
  return inputs;
}

/**
 * Each of `inputs` uploaded to `namespace`'s files (`POST /api/namespaces/<namespace>/files`), one request a file, read from disk as it is
 * sent, never held whole: the inputs a start names, each by its name and the id it was answered.
 * @param namespace The namespace the start is sent to, whose files it names.
 * @param inputs The files `inputsOf` read.
 */
async function uploaded(namespace: string, inputs: readonly InputFile[]) {
  const sent: { name: string; file: string }[] = [];
  for (const input of inputs) {
    const form = new FormData();
    const type = MEDIA_TYPES[path.extname(input.name).toLowerCase()] ?? '';
    form.append('file', await fs.openAsBlob(input.file, { type }), input.name);
    const file = await asked(
      COMMAND,
      (c) => c.files.upload({ params: { namespace }, payload: form }),
      process.env,
      uploadBoundMs(input.size),
    );
    sent.push({ name: input.name, file: file.id });
  }
  return sent;
}

/**
 * `--model <step>=<model>`s as the api takes them, step by step; refused, exit 2, for one that is not a step and a model.
 * @param typed Each `--model` as typed, `<step>=<model>`; none gives undefined.
 */
export function modelsOf(typed: readonly string[]) {
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

/**
 * What a start sends beside its workflow and brief, of either door: the runs and cards it is handed, its labels, gates, models, and its
 * inputs, each file uploaded first to `namespace`'s files (`uploaded`), once every other word has read, and named by its id.
 */
async function extrasOf(args: Args, namespace: string) {
  const after = listArg(args, 'after');
  const context = listArg(args, 'context');
  const cards = listArg(args, 'cards');
  const label = listArg(args, 'label');
  const gates = listArg(args, 'gates');
  const models = modelsOf(listArg(args, 'models'));
  const files = inputsOf(listArg(args, 'inputs'));
  const inputs = files.length ? await uploaded(namespace, files) : [];
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
function byName(workflow: string, brief: string) {
  if (/[\\/]/.test(workflow) || workflow.startsWith('.'))
    throw new Refused(
      `nemia start takes a workflow by its name, as its factory offers it (nemia workflows lists them), never a path: nemia start ${brief} --workflows <name>.`,
    );
  return workflow;
}

/** The inbox card `word` names, by its name with or without `.md`, and its namespace; none where the inbox has no such card. */
async function cardNamed(word: string) {
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
const insteadOf = (instead: string) =>
  fs.statSync(instead, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(instead, 'utf8') : instead;

/** `nemia start` of the inbox card `card`: its body, or `--brief` in its place, on its own workflow unless `--workflows` names one. */
async function cardStart(card: { name: string; namespace: string }, args: Args) {
  const workflows = textArg(args, 'workflows');
  const instead = textArg(args, 'instead');
  if (textArg(args, 'repo') !== undefined)
    throw new Refused(
      `nemia start ${card.name} does not take --repo: a card's run works on the repository its factory names for its workflow, never one its start names. Start it without --repo, and name the repository on the factory: nemia factory attach <factory> <workflow> --repo <name>. Nothing was started.`,
    );
  const factory = textArg(args, 'factory');
  const namespace = card.namespace === DEFAULT_NAMESPACE && factory !== undefined ? factory : card.namespace;
  const extras = await extrasOf(args, namespace);
  const payload: CardStart = {
    ...extras,
    ...(workflows !== undefined ? { workflow: byName(workflows, card.name) } : {}),
    ...(instead !== undefined ? { brief: insteadOf(instead) } : {}),
  };
  said(startedLines(await asked(COMMAND, (c) => c.cards.start({ params: { namespace, name: card.name }, payload }))));
  return 0;
}

/**
 * `nemia start <brief.md|card|"text"> --workflows <name> [...]`: a run of the workflow, or of the inbox card, started on the daemon.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function start(args: Args) {
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
  const query = repoQueryOf(textArg(args, 'repo'), factory);
  const payload: RunStart = { ...(await extrasOf(args, namespace)), workflow, brief };
  said(startedLines(await asked(COMMAND, (c) => c.runs.create({ params: { namespace }, query, payload }))));
  return 0;
}
