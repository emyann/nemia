/**
 * A plan is a folder of cards. That is the whole format, one level up from a workflow.
 *
 * Each file is one card, and a card is one run: its frontmatter says which workflow runs it and which cards' runs must ship before
 * it starts, and its body is the run's brief — in prose, as a person describing the plan would say it.
 *
 *     ---
 *     workflow: dev
 *     after: b, c
 *     ---
 *     Put the flag on the settings page, now that it is parsed and stored.
 *
 * `nemia plan <folder>` starts every card, parents first (`planOrder`), each `--after` the runs its `after:` names. The waiting is the
 * tick's, and every card is still a decision at its own `nemia decide`. Nothing records the plan: the runs and their `after` are the plan.
 * A `README.md` beside the cards says what the plan is for, and is not a card.
 *
 * **The keys are a closed list**, as a step's are, and for the same reason: `afer: a` read as no `after` would start the card at once,
 * beside the run it was written to wait for. Refused by name, with the fix, before anything is started.
 *
 * Pure: handed the folder's files, never reading one (`readPlan` in plan.store.ts reads them).
 */
import { isReadme, splitFrontmatter, WorkflowError } from '../step/step.ts';

/** One entry of a plan folder: its name there — a folder inside it with a trailing `/` — and, for a `.md` file, its text. */
export type PlanFile = { file: string; text: string };

export type Card = {
  /** The card's name — its file's, minus `.md`. What another card's `after:` names. */
  name: string;
  /** Its file's name in the plan folder, as a refusal names it. */
  file: string;
  /** The workflow its run is started on, as written: a name under `<repo>/workflows/`, or a path relative to the plan folder. */
  workflow: string;
  /** The cards whose runs must ship before this one's roots are filed, as written. `[]` starts at once. */
  after: string[];
  /** Everything below the frontmatter: the run's brief. */
  body: string;
};

/** Every key a card may set. Anything else is refused by name: how a card's steps run is its workflow's to say. */
export const CARD_KEYS = ['workflow', 'after'] as const;
type CardKey = (typeof CARD_KEYS)[number];

function refuse(why: string): never {
  throw new WorkflowError(why);
}

/**
 * A plan folder's cards, sorted by name, from its files — or refused, naming the file and the fix: a file that is not markdown, a folder
 * with no card, a key a card does not have (or set twice, or to nothing), a card with no `workflow:` or an empty body, and an `after:`
 * naming a card twice. Edges are `planOrder`'s: an `after:` naming a card the folder does not have, or the card itself, and a cycle.
 * `where` is what a refusal calls the folder.
 *
 * Whether each card's workflow loads is not read here, since that is a folder on disk: `startPlan` in plan.verb.ts asks, card by card,
 * before the first run is started.
 */
export function parsePlan(files: readonly PlanFile[], where = 'the plan folder'): Card[] {
  const stray = files
    .map((f) => f.file)
    .filter((f) => !f.endsWith('.md') && !isReadme(f))
    .sort();
  if (stray.length) {
    const one = stray.length === 1;
    refuse(
      `${stray.join(', ')} in ${where}: ${one ? 'not a card' : 'not cards'}. A plan folder holds one markdown file per card, <card>.md, and a README.md that says what the plan is for. Move ${one ? 'it' : 'them'} out of the folder, or, for a card, name it <card>.md.`,
    );
  }
  const cardFiles = files.filter((f) => !isReadme(f.file)).sort((a, b) => a.file.localeCompare(b.file));
  if (!cardFiles.length) {
    const readme = files.find((f) => isReadme(f.file));
    refuse(
      `${where} has no cards in it${readme ? ` — ${readme.file} says what the plan is for, and is not a card` : ''}. A card is one markdown file, <card>.md: \`workflow:\` in its frontmatter, and its run's brief below. Write the first: a.md, say.`,
    );
  }
  const cards = cardFiles.map((f) => parseCard(f.file, f.text));
  planOrder(cards);
  return cards;
}

/** One card, from its file's text. */
function parseCard(file: string, text: string): Card {
  const { block, body } = splitFrontmatter(file, text);
  const keys = block === null ? {} : readCardKeys(file, block);
  if (keys.workflow === undefined) {
    refuse(
      `${file}: no \`workflow:\`, so nothing says what runs this card. Name it in the frontmatter: \`workflow: dev\`, a folder under the repository's workflows/, or a path to a workflow folder, relative to the plan folder.`,
    );
  }
  const brief = bodyOf(file, body);
  return { name: file.slice(0, -'.md'.length), file, workflow: keys.workflow, after: afterOf(file, keys.after), body: brief };
}

/** A card's body, its run's brief — refused when empty, since a card with nothing to ask is not a card. */
export function bodyOf(file: string, body: string): string {
  if (!body)
    refuse(
      `${file}: the body is empty. A card's body is its run's brief — what the run is asked to do — and a card with nothing to ask is not a card. Write it below the frontmatter.`,
    );
  return body;
}

/** A card's `after:`, as the cards it names — refused when it names none, or one twice. `[]` for a card with no `after:`. */
function afterOf(file: string, after: string | undefined): string[] {
  const names =
    after === undefined
      ? []
      : after
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  if (after !== undefined && !names.length) {
    refuse(
      `${file}: \`after: ${after}\` names no card. List the cards whose runs ship first, comma-separated — \`after: a, b\` — or delete the line, and the card starts at once.`,
    );
  }
  const twice = names.find((a, i) => names.indexOf(a) !== i);
  if (twice) refuse(`${file}: \`after: ${after}\` names ${twice} twice. A card waits on another once: name each card once.`);
  return names;
}

/** A card `nemia start` is given as its brief: its `workflow:` when it names one, the cards its `after:` names, and its body. */
export type StartCard = { file: string; workflow?: string; after: string[]; body: string };

/**
 * A file `nemia start` is given, read as a card when its frontmatter is a card's — every line of it `workflow:` or `after:`, or an inbox
 * card's `repo:`, so a card carried out of the inbox reads as a card and is refused by name — or null when it is not: no frontmatter, one
 * with any other key or a line that is not a key, one with nothing in it, or one that never closes. Null means the file's whole text is the
 * brief, so a brief that happens to start with `---` is not eaten. Pure.
 *
 * `nemia plan` prints `nemia start <card> --after …` for each card it did not start, and this is what makes that command start the card's body.
 * Read as a card, a file is held to what `nemia plan` holds a card to — a key set twice or to nothing, an empty body, an `after:` naming no
 * card or one twice — and refused, naming the file and the ids to give, when its `after:` names cards and `nemia start` was given no `--after`
 * (`after`): started so, it would not wait for the runs it was written to wait for. Which runs those are is `nemia start --after`'s to check,
 * as it does.
 */
export function cardToStart(file: string, text: string, after: readonly string[]): StartCard | null {
  let split: { block: string | null; body: string };
  try {
    split = splitFrontmatter(file, text);
  } catch {
    return null;
  }
  const lines = (split.block ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const isCardLine = (line: string) =>
    line.indexOf(':') > 0 && ([...CARD_KEYS, 'repo'] as string[]).includes(line.slice(0, line.indexOf(':')).trim());
  if (!lines.length || !lines.every(isCardLine)) return null;
  const keys = readCardKeys(file, split.block!);
  const body = bodyOf(file, split.body);
  const waits = afterOf(file, keys.after);
  if (waits.length && !after.length) {
    const named = waits.length === 1 ? waits[0] : `${waits.slice(0, -1).join(', ')} and ${waits.at(-1)}`;
    refuse(
      `${file}: \`after: ${keys.after}\` — this card waits on the ${waits.length === 1 ? 'run' : 'runs'} of ${named}, and nemia start was given no --after, so it would start at once, beside the work it was written to wait for. Give the id of each, from nemia ls: nemia start ${file} ${waits.map((a) => `--after <${a}'s run id>`).join(' ')}.`,
    );
  }
  return { file, ...(keys.workflow !== undefined ? { workflow: keys.workflow } : {}), after: waits, body };
}

/** A card's frontmatter as key → value: every line a key a card has, set once, to something. */
function readCardKeys(file: string, block: string): Partial<Record<CardKey, string>> {
  return frontmatterKeys(file, block, CARD_KEYS, (key) =>
    key === 'repo'
      ? `${file}: \`repo\` is not a key a plan's card has: a plan works on one repository, the one nemia plan <folder> --repo <r> is given, and a card started by hand works on nemia start's --repo. \`repo:\` is an inbox card's — delete the line, or file the idea in the inbox: nemia inbox add <file> --repo <r>.`
      : `${file}: \`${key}\` is not a key a card has. A card's keys are: ${CARD_KEYS.join(', ')} — what runs it, and what ships first; how its steps run is its workflow's to say. Correct the spelling or delete the line — a key nothing reads is a constraint nobody enforces.`,
  );
}

/**
 * A card's frontmatter as key → value, for the keys `keys` a card of its kind has — a plan's (`CARD_KEYS`) or the inbox's (`INBOX_KEYS` in
 * inbox.ts) — each set once, to something. Refused by name: a line that is not `key: value`, a key set twice or to nothing, and any key
 * not in `keys`, in the words `unknown` gives for it.
 */
export function frontmatterKeys<K extends string>(
  file: string,
  block: string,
  keys: readonly K[],
  unknown: (key: string) => string,
): Partial<Record<K, string>> {
  const read: Partial<Record<K, string>> = {};
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i <= 0)
      refuse(
        `${file}: \`${line}\` is not \`key: value\`. Each frontmatter line is a key, a colon and its value, and a list stays on one line: \`after: a, b\`.`,
      );
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!(keys as readonly string[]).includes(key)) refuse(unknown(key));
    if (Object.hasOwn(read, key)) {
      refuse(
        `${file}: \`${key}\` is set twice, and a card that says two things says nothing. Keep one line${key === 'after' ? ' and list every card on it: `after: a, b`' : ''}.`,
      );
    }
    if (!value)
      refuse(
        `${file}: \`${key}\` has no value. Delete the line rather than leaving it blank — an empty key is not the same as an absent one.`,
      );
    read[key as K] = value;
  }
  return read;
}

/**
 * The cards in the order `nemia plan` starts them: every card after each card its `after:` names, and among the cards that may go next, by
 * name. Refused when that order cannot be: an `after:` naming a card the plan does not have, or the card itself, and cards that wait on
 * each other, named round the cycle — none of them could ever start.
 */
export function planOrder(cards: readonly Card[]): Card[] {
  const names = new Set(cards.map((c) => c.name));
  for (const card of cards) {
    for (const a of card.after) {
      if (a === card.name)
        refuse(
          `${card.file}: \`after: ${card.after.join(', ')}\` names this card. A card waits on other cards' runs to ship: delete ${a} from the line.`,
        );
      if (!names.has(a)) {
        const bare =
          a.endsWith('.md') && names.has(a.slice(0, -'.md'.length))
            ? ` A card is named without its .md: \`${a.slice(0, -'.md'.length)}\`.`
            : '';
        refuse(
          `${card.file}: \`after: ${card.after.join(', ')}\` names ${a}, and the plan has no card ${a}.${bare} Its cards are: ${[...names].sort().join(', ')}. Correct the name, or delete it from the line.`,
        );
      }
    }
  }
  const order: Card[] = [];
  const placed = new Set<string>();
  const pending = [...cards].sort((a, b) => a.name.localeCompare(b.name));
  while (pending.length) {
    const next = pending.findIndex((c) => c.after.every((a) => placed.has(a)));
    if (next < 0) {
      const cycle = cycleIn(pending);
      refuse(
        `${cycle.map((c) => c.file).join(', ')} wait on each other — ${cycle.map((c, i) => `${c.name} after ${cycle[(i + 1) % cycle.length].name}`).join(', ')} — so none of them could ever start. Take one of those cards out of the other's \`after:\`.`,
      );
    }
    const [card] = pending.splice(next, 1);
    order.push(card);
    placed.add(card.name);
  }
  return order;
}

/**
 * A cycle among cards none of which can go next. Each waits on a card still among them — the plan has every card named, and none names
 * itself — so following the first such parent from any card comes back round.
 */
function cycleIn(pending: readonly Card[]): Card[] {
  const byName = new Map(pending.map((c) => [c.name, c]));
  const walked: Card[] = [];
  let at = pending[0];
  while (!walked.includes(at)) {
    walked.push(at);
    at = byName.get(at.after.find((a) => byName.has(a))!)!;
  }
  return walked.slice(walked.indexOf(at));
}

/** A card `nemia plan` started: the card, the id of its run, and the workflow folder that run froze. */
export type Planned = { card: Card; runId: string; workflowDir: string };

/**
 * What `nemia plan` prints, one line per card started, in the order it started them: the card, its run, its workflow as the card names it,
 * and what it waits on — each card by name, with the run `nemia ls` will name.
 */
export function planLines(started: readonly Planned[]): string[] {
  const idOf = new Map(started.map((p) => [p.card.name, p.runId]));
  const cardWidth = Math.max(...started.map((p) => p.card.name.length));
  const runWidth = Math.max(...started.map((p) => p.runId.length));
  const workflowWidth = Math.max(...started.map((p) => p.card.workflow.length));
  return started.map(({ card, runId }) => {
    const waits = card.after.length
      ? `waits on ${card.after.map((a) => `${a} (${idOf.get(a) ?? 'not started'})`).join(', ')}`
      : 'waits on nothing';
    return `${card.name.padEnd(cardWidth)}  ${runId.padEnd(runWidth)}  ${card.workflow.padEnd(workflowWidth)}  ${waits}`;
  });
}

/** A path as a shell reads it back whatever is in it: in single quotes, and a quote inside closed, escaped and opened again. */
const quoted = (p: string): string => `'${p.replace(/'/g, `'\\''`)}'`;

/**
 * Why `nemia plan` stopped part-way, and what to do: the card whose `nemia start` refused and its refusal, the runs already started — which
 * stand, and the tick files as their edges allow — and a `nemia start` for each card not started, parents first, with `--after` the runs its
 * parents have or will have, each path quoted for the shell. `folderOf` is the workflow folder each card's `workflow:` was found at; `dir`
 * is the plan folder. `nemia start` on a card file starts its body (`cardToStart`).
 */
export function planStopped(
  stopped: { card: Card; why: string; rest: readonly Card[] },
  started: readonly Planned[],
  opts: { dir: string; repo: string; folderOf: (card: Card) => string },
): string {
  const idOf = new Map(started.map((p) => [p.card.name, p.runId]));
  const ran = started.length
    ? `The runs it started stand, and the tick files each as its edges allow: ${started.map((p) => `${p.card.name} (${p.runId})`).join(', ')}. Cancel one with nemia cancel <runId>.`
    : 'It started no run.';
  const commands = [stopped.card, ...stopped.rest].map((card) => {
    const after = card.after.map((a) => ` --after ${idOf.get(a) ?? `<${a}'s run id>`}`).join('');
    return `  nemia start ${quoted(`${opts.dir.replace(/\/$/, '')}/${card.file}`)} --workflows ${quoted(opts.folderOf(card))} --repo ${quoted(opts.repo)}${after}`;
  });
  return [
    `nemia plan stopped at ${stopped.card.file}: ${stopped.why}`,
    ran,
    `Start the rest by hand, parents first, once what stopped ${stopped.card.file} is fixed — each --after the run of a card it waits on:`,
    ...commands,
  ].join('\n');
}
