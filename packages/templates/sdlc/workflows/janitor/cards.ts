/**
 * `node cards.ts <closeout.json> --labels "<rules>"` — the janitor's cards filed in the inbox, each through `nemia inbox add` with its
 * labels, never one already there.
 *
 * Takes the path of Argus's closeout, flat (`WF_CLOSEOUT`): its `period` and `against`, each a `from` and a `to` day, and its `cards`,
 * each a `title`, a `kind`, a `correction`, its `evidence`, the `agent` it is about, the `factory` and `workflow` it is started with
 * (the repository is the factory's, wired to the workflow), and its `labels`, each `<key>=<value>`. And the factory's label rules,
 * `--labels`, which its pull request is labelled by: apart by spaces, each `<key>=<value>:<label>`, empty where the factory names none.
 * It checks the whole closeout first, each card's labels included, then reads the first line of every card in
 * `${WF_ROOT:-~/.agent-workflows}/inbox`, and files each card whose title none has, compared without case or spacing, with `nemia inbox
 * add` run in `WF_WORKSPACE`. It starts, queues and drops nothing, and never writes in the inbox itself.
 *
 * Where there are rules, a card of the run's own factory (the namespace `nemia get runs/<WF_RUN> -o json` serves the run in) is filed
 * with its labels, one `--label` each, which at least one rule reads, so the run it starts can open its pull request. A card where the
 * factory names no rules, or of another factory, whose rules are not these, is filed with no labels, and its line says why.
 *
 * Prints a line per card, filed or already there, and exits 0. Exits 1, naming the fix on stderr and filing nothing, when no closeout
 * reached it, `--labels` is not given or holds a rule that is not `<key>=<value>:<label>`, a card is not text where text is due, names no
 * factory or workflow, two cards share a title, a card of the run's factory has a label not spelled `<key>=<value>`, a key twice, or,
 * where there are rules, labels no rule reads, the run's factory is not known, or `against` is not as long as `period` or does not end
 * the day before it starts; and, having filed the cards before it, when `nemia inbox add` fails.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** One card as the closeout declares it. */
type Card = Record<(typeof FIELDS)[number], string> & { labels: string[] };

/** A label rule of the factory's: a run whose label `key` is `value` gives its pull request the label `label`. */
export type LabelRule = { key: string; value: string; label: string };

/** The factory's rules, read, or the first that is not `<key>=<value>:<label>`. */
export type Rules = { kind: 'rules'; rules: LabelRule[] } | { kind: 'refused'; rule: string };

/**
 * Why `labelsChecked` will not file a card's labels: one not spelled `<key>=<value>`, a key given twice, or labels no rule reads.
 */
export type LabelRefusal = 'form' | 'twice' | 'unmatched';

/** A card's labels by key, or why not, with the label refused by its index (-1 where it is the labels together). */
export type Labelled = { kind: 'labelled'; labels: Record<string, string> } | { kind: 'refused'; reason: LabelRefusal; label: number };

/** A rule as written: a key with no `=`, a value with no `:`, and the label, each non-empty and with no whitespace. */
const RULE = /^([^=\s]+)=([^:\s]+):(\S+)$/;

/** A key or a value of a label, as the store holds one: a name segment of 63 characters at most, alphanumeric at each end. */
const SEGMENT = /^[A-Za-z0-9](?:[-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/;

/**
 * The factory's label rules, read from `given` as the pull request's script reads them; none where it is empty.
 *
 * @param given The rules as the check line hands them, apart by whitespace, each `<key>=<value>:<label>`.
 */
export function labelRules(given: string): Rules {
  const rules: LabelRule[] = [];
  for (const rule of given.split(/\s+/).filter(Boolean)) {
    const named = RULE.exec(rule);
    if (!named) return { kind: 'refused', rule };
    rules.push({ key: named[1]!, value: named[2]!, label: named[3]! });
  }
  return { kind: 'rules', rules };
}

/**
 * A card's labels checked against the factory's rules: each spelled `<key>=<value>`, no key twice, and, where there are rules, at least
 * one rule reading them, as the pull request's script asks of the run the card starts.
 *
 * @param labels The card's labels, each `<key>=<value>`.
 * @param rules The factory's label rules; none asks no match.
 */
export function labelsChecked(labels: readonly string[], rules: readonly LabelRule[]): Labelled {
  const byKey: Record<string, string> = {};
  for (const [i, label] of labels.entries()) {
    const at = label.indexOf('=');
    const key = label.slice(0, at);
    const value = label.slice(at + 1);
    if (at < 0 || !SEGMENT.test(key) || !SEGMENT.test(value)) return { kind: 'refused', reason: 'form', label: i };
    if (Object.hasOwn(byKey, key)) return { kind: 'refused', reason: 'twice', label: i };
    byKey[key] = value;
  }
  if (rules.length && !rules.some((r) => byKey[r.key] === r.value)) return { kind: 'refused', reason: 'unmatched', label: -1 };
  return { kind: 'labelled', labels: byKey };
}

/** Two days, the first and the last, `YYYY-MM-DD` in UTC. */
type Period = { from: string; to: string };

/** A reason the closeout is refused: said on stderr, exit 1. */
class Refusal extends Error {}

const FIELDS = ['title', 'kind', 'correction', 'evidence', 'agent', 'factory', 'workflow'] as const;

const KINDS = ['fence', 'body', 'skill', 'on-purpose'];

const WHY_NOT: Record<LabelRefusal, string> = {
  form: 'it is not <key>=<value>, each a name of letters, digits, -, _ and . up to 63 characters: spell it so',
  twice: 'its key is given twice: give each key one value',
  unmatched: 'no rule of the factory reads them: give the labels at least one rule reads',
};

const DAY_MS = 86_400_000;

/** A title as two cards are compared on: no heading mark, no case, its spacing one space. */
const normal = (title: string): string =>
  title
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** The closeout at `file`, parsed; refuses a missing argument, a file that does not read, or one that is not a JSON object. */
function readCloseout(file: string | undefined): Record<string, unknown> {
  if (!file) throw new Refusal('no closeout reached the check: WF_CLOSEOUT is empty, so there are no cards to file');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Refusal(`no closeout reached the check: ${file} does not read as JSON (${(err as Error).message})`, { cause: err });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Refusal(`no closeout reached the check: ${file} is not an object`);
  return parsed as Record<string, unknown>;
}

/** The day `day` names, as milliseconds since the epoch; refuses one that is not a `YYYY-MM-DD` day. */
function dayOf(day: unknown, what: string): number {
  const ms = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : NaN;
  if (Number.isNaN(ms)) throw new Refusal(`${what} is ${JSON.stringify(day)}, not a day: say it YYYY-MM-DD, in UTC`);
  return ms;
}

/** The closeout's `key`, checked as a period whose last day is not before its first: its days, in milliseconds. */
function periodOf(closeout: Record<string, unknown>, key: string): Period & { start: number; end: number; days: number } {
  const p = (closeout[key] ?? {}) as Period;
  const start = dayOf(p.from, `${key}.from`);
  const end = dayOf(p.to, `${key}.to`);
  if (end < start) throw new Refusal(`the ${key} ends before it starts: ${p.to} is before ${p.from}`);
  return { from: p.from, to: p.to, start, end, days: (end - start) / DAY_MS + 1 };
}

/** Refuses an `against` that is not as long as `period`, or does not end the day before it starts. */
function checkPeriods(closeout: Record<string, unknown>): { period: Period; against: Period } {
  const period = periodOf(closeout, 'period');
  const against = periodOf(closeout, 'against');
  if (against.days !== period.days)
    throw new Refusal(
      `against, ${against.from} to ${against.to}, is ${against.days} days, and the period ${period.days}: compare as many days as are read`,
    );
  const before = new Date(period.start - DAY_MS).toISOString().slice(0, 10);
  if (against.end !== period.start - DAY_MS)
    throw new Refusal(`against ends ${against.to}, not ${before}, the day before the period starts: compare the days just before it`);
  return { period, against };
}

/**
 * Card `i` of the list, checked field by field; refuses a field that is not text, a title of more than one line, a kind not known, no
 * factory or workflow.
 */
function cardOf(value: unknown, i: number): Card {
  const c = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const wrong: string[] = FIELDS.filter((k) => typeof c[k] !== 'string');
  if (!Array.isArray(c.labels) || c.labels.some((l) => typeof l !== 'string')) wrong.push('labels');
  if (wrong.length) throw new Refusal(`card #${i + 1}: ${wrong.join(', ')} must be text (labels a list of it)`);
  const card = c as Card;
  if (!card.title.trim() || /[\r\n]/.test(card.title.trim()))
    throw new Refusal(`card #${i + 1}: its title is one line, what to correct, and this one is empty or more than one`);
  if (!KINDS.includes(card.kind))
    throw new Refusal(`card #${i + 1}: its kind is ${JSON.stringify(card.kind)}, not one of ${KINDS.join(', ')}`);
  for (const key of ['factory', 'workflow'] as const)
    if (!card[key].trim())
      throw new Refusal(
        `card #${i + 1}, "${card.title.trim()}" names no ${key}, so it is not ready to start: give the ${key} it starts with`,
      );
  return card;
}

/** The closeout's cards, checked whole; refuses a closeout with no list, and two cards with the same title. */
function cardsOf(closeout: Record<string, unknown>): Card[] {
  if (!Array.isArray(closeout.cards))
    throw new Refusal('the closeout names no `cards` list: sign off with one, empty when nothing is to correct');
  const cards = closeout.cards.map(cardOf);
  const seen = new Set<string>();
  for (const card of cards) {
    const title = normal(card.title);
    if (seen.has(title)) throw new Refusal(`two cards are titled "${title}": file one card per correction`);
    seen.add(title);
  }
  return cards;
}

/** The first line of a card's body, past its frontmatter: what `nemia inbox` lists as its title. */
function firstLine(text: string): string {
  const body = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^---\n[\s\S]*?\n---(\n|$)/, '');
  return body.split('\n').find((line) => line.trim()) ?? '';
}

/** The titles of the cards in the inbox, compared as `normal` makes them. */
function inboxTitles(): Set<string> {
  const root = process.env.WF_ROOT || path.join(os.homedir(), '.agent-workflows');
  const dir = path.join(root, 'inbox');
  if (!fs.existsSync(dir)) return new Set();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
  return new Set(files.map((f) => normal(firstLine(fs.readFileSync(path.join(dir, f), 'utf8')))));
}

/** The card's text as `nemia inbox add` files it: its title first, then the correction, the evidence and who filed it. */
const textOf = (card: Card, { period, against }: { period: Period; against: Period }): string =>
  [
    card.title.trim(),
    '',
    `Correction (${card.kind})${card.agent.trim() ? `, for ${card.agent.trim()}` : ''}: ${card.correction.trim()}`,
    '',
    `Evidence, ${period.from} to ${period.to} against ${against.from} to ${against.to}: ${card.evidence.trim()}`,
    '',
    `Filed by Argus in run ${process.env.WF_RUN || '(no run)'}.`,
    '',
  ].join('\n');

/** The rules `--labels` hands the script, read; refuses arguments past the closeout that are not `--labels "<rules>"`, or a bad rule. */
function rulesOf(args: readonly string[]): LabelRule[] {
  if (args.length !== 2 || args[0] !== '--labels')
    throw new Refusal(
      'the check gives cards.ts the factory\'s label rules, `--labels "<rules>"`, after the closeout and nothing else: ' +
        "give them as the janitor's check line does, empty where the factory names none",
    );
  const read = labelRules(args[1]!);
  if (read.kind === 'refused')
    throw new Refusal(
      `\`${read.rule}\` is no label rule, which is each \`<key>=<value>:<label>\`, the rules apart by spaces: ` +
        "correct the factory's pullRequestLabels parameter",
    );
  return read.rules;
}

/**
 * The factory this run is in: its namespace, as `nemia get runs/<WF_RUN>` serves the run. Refuses where `WF_RUN` is unset or the run
 * does not read: the rules are this factory's, so a card is held to them only where it is filed for it.
 */
function runFactory(): string {
  const run = process.env.WF_RUN;
  if (!run) throw new Refusal('WF_RUN is not set, so the factory whose label rules these are is not known: run this check in a run');
  const ran = spawnSync('nemia', ['get', `runs/${run}`, '-o', 'json'], {
    cwd: process.env.WF_WORKSPACE || process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  let namespace: unknown;
  try {
    namespace = (JSON.parse(ran.stdout) as { metadata?: { namespace?: unknown } }).metadata?.namespace;
  } catch {
    namespace = undefined;
  }
  if (ran.status !== 0 || typeof namespace !== 'string' || !namespace)
    throw new Refusal(
      `nemia get runs/${run} -o json served no namespace (${ran.error?.message ?? `exit ${ran.status}`}: ${(ran.stderr ?? '').trim()}), ` +
        `so the factory whose label rules these are is not known: check nemia get runs/${run} -o yaml`,
    );
  return namespace;
}

/**
 * The labels each card is filed with, checked whole before any is filed: a card's own, held to the rules, where there are rules and it
 * is filed for this run's factory; none otherwise, with the reason said where it gave some.
 */
function labelsOf(cards: readonly Card[], rules: readonly LabelRule[]): { labels: string[]; dropped: string | null }[] {
  const ours = rules.length ? runFactory() : null;
  return cards.map((card, i) => {
    if (!rules.length) return { labels: [], dropped: 'the factory names no label rules' };
    if (card.factory.trim() !== ours)
      return { labels: [], dropped: `its factory, ${card.factory.trim()}, is not ${ours}, whose rules these are` };
    const checked = labelsChecked(card.labels, rules);
    if (checked.kind === 'refused')
      throw new Refusal(
        `card #${i + 1}, "${card.title.trim()}": ${checked.label < 0 ? 'its labels' : `its label ${JSON.stringify(card.labels[checked.label])}`}: ${WHY_NOT[checked.reason]} ` +
          `(the rules: ${rules.map((r) => `${r.key}=${r.value}:${r.label}`).join(' ')})`,
      );
    return { labels: Object.entries(checked.labels).map(([k, v]) => `${k}=${v}`), dropped: null };
  });
}

/** Files `card` with `labels` through `nemia inbox add`, from a file in `dir`; refuses, naming the card, when the command fails. */
function file(card: Card, labels: readonly string[], text: string, dir: string, i: number): void {
  const at = path.join(dir, `card-${i + 1}.md`);
  fs.writeFileSync(at, text);
  const args = ['inbox', 'add', at, '--workflow', card.workflow.trim(), '--factory', card.factory.trim()];
  const ran = spawnSync('nemia', [...args, ...labels.flatMap((l) => ['--label', l])], {
    cwd: process.env.WF_WORKSPACE || process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (ran.status !== 0)
    throw new Refusal(
      `card #${i + 1}, "${card.title.trim()}": nemia inbox add failed (${ran.error?.message ?? `exit ${ran.status}`}): ` +
        `${(ran.stderr ?? '').trim()}; ` +
        'the cards before it are filed, and the check run again files the rest',
    );
  console.log(`nemia janitor: filed ${ran.stdout.split('\n')[0].trim()}`);
}

/** Checks the closeout, then files each card the inbox has no title of. */
function main(): void {
  const closeout = readCloseout(process.argv[2]);
  const rules = rulesOf(process.argv.slice(3));
  const periods = checkPeriods(closeout);
  const cards = cardsOf(closeout);
  if (!cards.length) return console.log('nemia janitor: Argus proposed no correction, so no card is filed');
  const labelled = labelsOf(cards, rules);
  const there = inboxTitles();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-janitor-'));
  try {
    cards.forEach((card, i) => {
      if (there.has(normal(card.title))) return console.log(`nemia janitor: already in the inbox: ${card.title.trim()}`);
      const { labels, dropped } = labelled[i]!;
      file(card, labels, textOf(card, periods), dir, i);
      if (dropped && (card.labels.length || rules.length))
        console.log(`nemia janitor: "${card.title.trim()}" is filed with no labels: ${dropped}`);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    console.error(`nemia janitor: ${err.message}`);
    process.exitCode = 1;
  }
}
