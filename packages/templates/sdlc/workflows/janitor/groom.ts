/**
 * `node groom.ts <closeout.json>` — the janitor's verdicts on the inbox's cards, checked and turned into a report a person acts on by
 * typing one command per card; it changes no card.
 *
 * Takes the path of Argus's closeout, flat (`WF_CLOSEOUT`): its `period` (`to`, the last day read) and its `verdicts`, one per card in
 * play, each a `card` by its name, a `verdict` (`done`, `replaced`, `stale` or `standing`), its `why`, the `commit` that landed a done
 * card's work, what replaced a replaced one (`by`), and a stale one's `facts`, each what the card says (`was`), what is true now (`now`)
 * and why. It reads the cards with `nemia get cards -A -o json`, run in `WF_WORKSPACE`, and checks the whole closeout before it writes
 * anything. Then, under `WF_ARTIFACTS`, it writes `groom/<card>.json` for each stale card, the card as `nemia get cards/<card> -o json`
 * served it with each fact's `was` replaced by its `now` in its body and its `status` dropped, and `groom.md`, every verdict with the
 * command that acts on it: `nemia inbox rm <card>` for a done or replaced card, `nemia apply -f <file>` for a stale one, which the api
 * refuses where the card was written since it was read. It prints a line per done, replaced or stale card, the count of standing ones,
 * and the path of `groom.md`, and exits 0. A verdict on a card no longer in play, or gone, is skipped with a line: a person may have
 * removed it while Argus read. Run again on the same closeout and the same inbox, it writes the same files.
 *
 * Exits 1, naming the fix on stderr and writing nothing, when no closeout reached it, it holds no `verdicts` list, a verdict's word is
 * not one of the four, a card has two verdicts, a done card's commit is not on the base (`WF_BASE_REF`, which must be set, `git
 * merge-base --is-ancestor`), a replaced card says nothing replaced it, a stale card has no facts or one `amendment` cannot place, or a
 * card in play filed before the period's last day has no verdict; and when `WF_ARTIFACTS` is unset or `nemia` fails. Whether the
 * factory lands on GitHub or in the checkout, it reads and writes the same: the base is the branch the run's work lands on.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** What a card's body says, what is true now, and why. */
export type Fact = { was: string; now: string; why: string };

/** Why `amendment` will not place a fact: none given, an empty `was`, `was` the same as `now`, `was` not in the body, or more than once. */
export type AmendmentRefusal = 'no-facts' | 'empty' | 'unchanged' | 'missing' | 'twice';

/** A body amended, or the first fact it could not place, by its index (-1 where there are none). */
export type Amendment = { kind: 'amended'; body: string } | { kind: 'refused'; reason: AmendmentRefusal; fact: number };

/**
 * `body` with each fact's `was` replaced by its `now`, in order, each found exactly once in the body as the facts before it left it;
 * refused at the first fact that is empty, unchanged, missing or found twice, so no amendment is a guess.
 */
export function amendment(body: string, facts: readonly Fact[]): Amendment {
  if (facts.length === 0) return { kind: 'refused', reason: 'no-facts', fact: -1 };
  let now = body;
  for (const [i, fact] of facts.entries()) {
    if (fact.was === '') return { kind: 'refused', reason: 'empty', fact: i };
    if (fact.was === fact.now) return { kind: 'refused', reason: 'unchanged', fact: i };
    const at = now.indexOf(fact.was);
    if (at < 0) return { kind: 'refused', reason: 'missing', fact: i };
    if (now.indexOf(fact.was, at + 1) >= 0) return { kind: 'refused', reason: 'twice', fact: i };
    now = now.slice(0, at) + fact.now + now.slice(at + fact.was.length);
  }
  return { kind: 'amended', body: now };
}

/** A verdict's word. */
const VERDICTS = ['done', 'replaced', 'stale', 'standing'] as const;

type Verdict = { card: string; verdict: (typeof VERDICTS)[number]; why: string; commit: string; by: string; facts: Fact[] };

/** A card as `nemia get` serves it, the fields read here. */
type Served = {
  metadata: { name: string; creationTimestamp: string } & Record<string, unknown>;
  spec: { body?: string } & Record<string, unknown>;
  status?: { inPlay?: boolean; title?: string };
} & Record<string, unknown>;

/** A reason the closeout is refused: said on stderr, exit 1. */
class Refusal extends Error {}

const WHY_NOT: Record<AmendmentRefusal, string> = {
  'no-facts': 'it has no facts: say each fact that moved, or call the card standing',
  empty: 'its `was` is empty: quote what the card says',
  unchanged: 'its `was` and `now` are the same: drop the fact',
  missing: 'its `was` is not in the card: quote the card exactly, as it reads now',
  twice: 'its `was` is in the card more than once: quote enough around it that it is found once',
};

/** The closeout at `file`, parsed; refuses a missing argument, a file that does not read, or one that is not a JSON object. */
function readCloseout(file: string | undefined): Record<string, unknown> {
  if (!file) throw new Refusal('no closeout reached the check: WF_CLOSEOUT is empty, so there are no verdicts to read');
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

/** The period's last day, `YYYY-MM-DD`; refuses one that is not a day. */
function lastDay(closeout: Record<string, unknown>): string {
  const to = (closeout.period as { to?: unknown } | undefined)?.to;
  if (typeof to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw new Refusal(`period.to is ${JSON.stringify(to)}, not a day: say it YYYY-MM-DD, in UTC`);
  return to;
}

/**
 * Verdict `i`, checked field by field; refuses a field of the wrong type, a word not known, a replaced with no `by`, a done with no
 * commit. A stale card's facts are `amendment`'s to refuse, once the card is read.
 */
function verdictOf(value: unknown, i: number): Verdict {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const wrong = ['card', 'verdict', 'why', 'commit', 'by'].filter((k) => typeof v[k] !== 'string');
  const facts = Array.isArray(v.facts) ? v.facts : null;
  if (!facts || facts.some((f) => !f || typeof f !== 'object' || ['was', 'now', 'why'].some((k) => typeof f[k] !== 'string')))
    wrong.push('facts');
  if (wrong.length) throw new Refusal(`verdict #${i + 1}: ${wrong.join(', ')} must be text (facts a list of was, now and why)`);
  const verdict = { ...v, card: (v.card as string).trim() } as Verdict;
  const on = `verdict #${i + 1}, on ${JSON.stringify(verdict.card)}`;
  if (!verdict.card) throw new Refusal(`verdict #${i + 1} names no card: give the card's name, as nemia inbox lists it`);
  if (!VERDICTS.includes(verdict.verdict))
    throw new Refusal(`${on}: its verdict is ${JSON.stringify(verdict.verdict)}, not one of ${VERDICTS.join(', ')}`);
  if (verdict.verdict === 'replaced' && !verdict.by.trim())
    throw new Refusal(`${on}: a replaced card says what replaced it, in \`by\`: the decision or the card`);
  if (verdict.verdict === 'done' && !/^[0-9a-f]{7,40}$/i.test(verdict.commit.trim()))
    throw new Refusal(`${on}: a done card names the commit that landed its work, by its hash, in \`commit\``);
  return verdict;
}

/** The closeout's verdicts, checked whole; refuses a closeout with no list, and two verdicts on one card. */
function verdictsOf(closeout: Record<string, unknown>): Verdict[] {
  if (!Array.isArray(closeout.verdicts))
    throw new Refusal('the closeout names no `verdicts` list: sign off with one verdict per card in play, empty when none is');
  const verdicts = closeout.verdicts.map(verdictOf);
  const seen = new Set<string>();
  for (const v of verdicts) {
    if (seen.has(v.card)) throw new Refusal(`two verdicts are on the card ${v.card}: give each card one`);
    seen.add(v.card);
  }
  return verdicts;
}

/** Where `nemia` and `git` run: the run's workspace. */
const workspace = (): string => process.env.WF_WORKSPACE || process.cwd();

/** `nemia <args>`, its stdout parsed as JSON; refuses, naming the command, when it fails. */
function nemia(args: readonly string[]): unknown {
  const ran = spawnSync('nemia', args, { cwd: workspace(), encoding: 'utf8', timeout: 60_000 });
  if (ran.status !== 0)
    throw new Refusal(
      `nemia ${args.join(' ')} failed (${ran.error?.message ?? `exit ${ran.status}`}): ${(ran.stderr ?? '').trim()}; run the check again once it answers`,
    );
  const out = (ran.stdout ?? '').trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch (err) {
    throw new Refusal(`nemia ${args.join(' ')} did not print JSON (${(err as Error).message}): run the check again once it does`, {
      cause: err,
    });
  }
}

/** Every card the api serves, across every factory, by name. */
function cards(): Map<string, Served> {
  const page = nemia(['get', 'cards', '-A', '-o', 'json']) as { items?: Served[] } | null;
  return new Map((page?.items ?? []).map((card) => [card.metadata.name, card]));
}

/** Refuses a done card whose commit is not on the base, or a base that is not named. */
function checkLanded(verdicts: readonly Verdict[]): void {
  const done = verdicts.filter((v) => v.verdict === 'done');
  if (!done.length) return;
  const base = process.env.WF_BASE_REF;
  if (!base)
    throw new Refusal(
      'WF_BASE_REF is not set, so no done card can be checked as landed: run this check in a run, which sets it to the base',
    );
  for (const v of done) {
    const ran = spawnSync('git', ['merge-base', '--is-ancestor', v.commit.trim(), base], {
      cwd: workspace(),
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (ran.status !== 0)
      throw new Refusal(
        `the card ${v.card} is said done by ${v.commit.trim()}, which is not on the base ${base}: name the commit on the base that landed it, or give another verdict`,
      );
  }
}

/** The stale card `v`, amended, as `nemia apply -f` reads it: refuses a fact `amendment` cannot place. */
function amended(v: Verdict): Record<string, unknown> {
  const served = nemia(['get', `cards/${v.card}`, '-o', 'json']) as Served;
  const result = amendment(served.spec.body ?? '', v.facts);
  if (result.kind === 'refused')
    throw new Refusal(`the card ${v.card} is stale, and its fact #${result.fact + 1} cannot be placed: ${WHY_NOT[result.reason]}`);
  const { status: _status, ...object } = served;
  return { ...object, spec: { ...served.spec, body: result.body } };
}

/** The report's section on `v`, with the command that acts on it where one does. */
function section(v: Verdict, card: Served, command: string | null): string {
  const lines = [`## ${v.card}: ${v.verdict}`, '', `${card.status?.title ?? '(no title)'}`, '', v.why.trim()];
  if (v.verdict === 'done') lines.push('', `Landed by ${v.commit.trim()}.`);
  if (v.verdict === 'replaced') lines.push('', `Replaced by ${v.by.trim()}.`);
  for (const f of v.verdict === 'stale' ? v.facts : [])
    lines.push('', `- It says: ${f.was}`, `  Now: ${f.now}`, `  Why: ${f.why}`);
  if (command) lines.push('', '```', command, '```');
  return lines.join('\n');
}

/** Checks the closeout whole, then writes the amended cards and the report, and prints what to type. */
function main(): void {
  const closeout = readCloseout(process.argv[2]);
  const to = lastDay(closeout);
  const verdicts = verdictsOf(closeout);
  const artifacts = process.env.WF_ARTIFACTS;
  if (!artifacts) throw new Refusal('WF_ARTIFACTS is not set, so there is nowhere to write the report: run this check in a run');
  checkLanded(verdicts);
  const served = cards();
  const inPlay = (name: string) => served.get(name)?.status?.inPlay === true;
  const judged = new Set(verdicts.map((v) => v.card));
  const unjudged = [...served.values()]
    .filter((c) => c.status?.inPlay === true && !judged.has(c.metadata.name) && c.metadata.creationTimestamp.slice(0, 10) < to)
    .map((c) => c.metadata.name)
    .sort();
  if (unjudged.length)
    throw new Refusal(`no verdict on ${unjudged.join(', ')}, in play before ${to}: give every card in play a verdict, standing where none moved`);
  const acted = verdicts.filter((v) => inPlay(v.card));
  const dir = path.resolve(artifacts, 'groom');
  const amendments = new Map(acted.filter((v) => v.verdict === 'stale').map((v) => [v.card, amended(v)]));

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const sections: string[] = [];
  for (const v of acted) {
    let command: string | null = null;
    if (v.verdict === 'done' || v.verdict === 'replaced') command = `nemia inbox rm ${v.card}`;
    if (v.verdict === 'stale') {
      const file = path.join(dir, `${v.card}.json`);
      fs.writeFileSync(file, `${JSON.stringify(amendments.get(v.card), null, 2)}\n`);
      command = `nemia apply -f ${file}`;
    }
    sections.push(section(v, served.get(v.card) as Served, command));
    if (command) console.log(`nemia groom: ${v.card} is ${v.verdict}: ${command}`);
  }
  for (const v of verdicts.filter((v) => !inPlay(v.card)))
    console.log(`nemia groom: ${v.card} is no longer in play, so its verdict is skipped`);
  const standing = acted.filter((v) => v.verdict === 'standing').length;
  const report = path.resolve(artifacts, 'groom.md');
  fs.writeFileSync(
    report,
    [
      `# The inbox groomed, to ${to}`,
      '',
      'Each card in play, with the command that acts on its verdict. Nothing here is done until a person types it.',
      '',
      ...sections.flatMap((s) => [s, '']),
    ].join('\n'),
  );
  console.log(`nemia groom: ${standing} card${standing === 1 ? '' : 's'} standing; the report is ${report}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    console.error(`nemia groom: ${err.message}`);
    process.exitCode = 1;
  }
}
