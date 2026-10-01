/**
 * `node cards.ts <closeout.json>` — the janitor's cards filed in the inbox, each through `wf inbox add`, never one already there.
 *
 * Takes the path of Argus's closeout, flat (`WF_CLOSEOUT`): its `period` and `against`, each a `from` and a `to` day, and its `cards`,
 * each a `title`, a `kind`, a `correction`, its `evidence`, the `agent` it is about, and the `factory`, `workflow` and `repo` it is started
 * with. It checks the whole closeout first, then reads the first line of every card in `${WF_ROOT:-~/.agent-workflows}/inbox`, and files
 * each card whose title none has, compared without case or spacing, with `npx --no wf inbox add` run in `WF_WORKSPACE`. It starts,
 * queues and drops nothing, and never writes in the inbox itself.
 *
 * Prints a line per card, filed or already there, and exits 0. Exits 1, naming the fix on stderr and filing nothing, when no closeout
 * reached it, a card is not text where text is due, names no factory, workflow or repository or a relative one, two cards share a
 * title, or `against` is not as long as `period` or does not end the day before it starts; and, having filed the cards before it, when
 * `wf inbox add` fails.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** One card as the closeout declares it. */
type Card = Record<(typeof FIELDS)[number], string>;

/** Two days, the first and the last, `YYYY-MM-DD` in UTC. */
type Period = { from: string; to: string };

/** A reason the closeout is refused: said on stderr, exit 1. */
class Refusal extends Error {}

const FIELDS = ['title', 'kind', 'correction', 'evidence', 'agent', 'factory', 'workflow', 'repo'] as const;

const KINDS = ['fence', 'body', 'skill', 'on-purpose'];

const DAY_MS = 86_400_000;

/** A title as two cards are compared on: no heading mark, no case, its spacing one space. */
const normal = (title: string): string => title.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();

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
 * factory, workflow or repository, and a repository that is not an absolute path.
 */
function cardOf(value: unknown, i: number): Card {
  const c = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const wrong = FIELDS.filter((k) => typeof c[k] !== 'string');
  if (wrong.length) throw new Refusal(`card #${i + 1}: ${wrong.join(', ')} must be text`);
  const card = c as Card;
  if (!card.title.trim() || /[\r\n]/.test(card.title.trim()))
    throw new Refusal(`card #${i + 1}: its title is one line, what to correct, and this one is empty or more than one`);
  if (!KINDS.includes(card.kind))
    throw new Refusal(`card #${i + 1}: its kind is ${JSON.stringify(card.kind)}, not one of ${KINDS.join(', ')}`);
  for (const key of ['factory', 'workflow', 'repo'] as const)
    if (!card[key].trim())
      throw new Refusal(
        `card #${i + 1}, "${card.title.trim()}" names no ${key}, so it is not ready to start: give the ${key} it starts with`,
      );
  if (!path.isAbsolute(card.repo.trim()))
    throw new Refusal(
      `card #${i + 1}, "${card.title.trim()}": its repo ${JSON.stringify(card.repo)} is not an absolute path; ` +
        'name the repository from the root',
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

/** The first line of a card's body, past its frontmatter: what `wf inbox` lists as its title. */
function firstLine(text: string): string {
  const body = text
    .replace(/^﻿/, '')
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

/** The card's text as `wf inbox add` files it: its title first, then the correction, the evidence and who filed it. */
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

/** Files `card` through `wf inbox add`, from a file in `dir`; refuses, naming the card, when the command fails. */
function file(card: Card, text: string, dir: string, i: number): void {
  const at = path.join(dir, `card-${i + 1}.md`);
  fs.writeFileSync(at, text);
  const args = ['--no', 'wf', 'inbox', 'add', at, '--workflow', card.workflow.trim(), '--repo', card.repo.trim()];
  const ran = spawnSync('npx', [...args, '--factory', card.factory.trim()], {
    cwd: process.env.WF_WORKSPACE || process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (ran.status !== 0)
    throw new Refusal(
      `card #${i + 1}, "${card.title.trim()}": wf inbox add failed (${ran.error?.message ?? `exit ${ran.status}`}): ` +
        `${(ran.stderr ?? '').trim()}; ` +
        'the cards before it are filed, and the check run again files the rest',
    );
  console.log(`wf janitor: filed ${ran.stdout.split('\n')[0].trim()}`);
}

/** Checks the closeout, then files each card the inbox has no title of. */
function main(): void {
  const closeout = readCloseout(process.argv[2]);
  const periods = checkPeriods(closeout);
  const cards = cardsOf(closeout);
  if (!cards.length) return console.log('wf janitor: Argus proposed no correction, so no card is filed');
  const there = inboxTitles();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-janitor-'));
  try {
    cards.forEach((card, i) => {
      if (there.has(normal(card.title))) return console.log(`wf janitor: already in the inbox: ${card.title.trim()}`);
      file(card, textOf(card, periods), dir, i);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  if (!(err instanceof Refusal)) throw err;
  console.error(`wf janitor: ${err.message}`);
  process.exitCode = 1;
}
