/**
 * `judge`: try the judge on a card by hand. Plain code, no Effect: it parses, calls the facade, prints.
 *
 *   judge status                                         ready, or off and why; exits 0 either way
 *   judge card <file> | --text "…" [--reask] [--record <dir>]
 *   judge runs [--store <dir>] [--record <dir>] [--since <date>] [--json <file>] [--yes] [--reask]
 *
 * Neither verb files anything, starts anything or shows anything to anyone, and nothing calls them. They exit 0 on any
 * verdict, and 2 on a refusal. `runs` scores the dispatches people have already made — a shadow that gates nothing,
 * beside a plain-code rival — and prints what it would send, and what that costs, before it sends it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Fetch } from '@typesafe-ai/sdk';
import { cardState, MODEL, QUESTIONS, report, type CardAnswers } from './card.ts';
import { available, judge, status } from './facade.ts';
import { keyOf, refuse } from './key.ts';
import { readFacts, reading } from './record.ts';
import { rival } from './rival.ts';
import { document, lines as scoreLines, type Cost, type Report, type Row } from './score.ts';
import { defaultStore, readRuns, sinceOf } from './runs.ts';

export type Io = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly out?: (line: string) => void;
  /** For tests: the facade's `fetch`, and its `retries`. */
  readonly fetch?: Fetch;
  readonly retries?: number;
};

const USAGE = [
  'judge status                                          whether the judge can ask here',
  'judge card <file> | --text "…" [--reask] [--record <dir>]',
  '                                                      ask what a card needs, and say which folder it maps to',
  'judge runs [--store <dir>] [--record <dir>] [--since <date>] [--json <file>] [--yes] [--reask]',
  '                                                      score the dispatches already made, against a plain-code rival',
].join('\n');

/** Where the command keeps its record unless told: `$WF_ROOT/judge`, or `~/.agent-workflows/judge`. */
export const defaultRecord = (env: Readonly<Record<string, string | undefined>>) =>
  path.join(env.WF_ROOT || path.join(os.homedir(), '.agent-workflows'), 'judge');

/**
 * What a pass would send, counted without asking anything: the questions with nothing on record, and — with `--reask` —
 * those whose last asking failed, and the card texts that would travel with them. The key is computed by the code that
 * would ask, so this is the arithmetic the ask does, the pass included: two runs whose brief strips to the same card
 * share a key, the first asking writes it and the second reads it back off the record, so a key counted once here is
 * asked once there however many runs carry it. `sending` holds only the briefs with a question left: a brief every one
 * of whose questions is answered — on record, or by an earlier brief in this same pass — is never sent again, and must
 * not be counted in what a person is asked to consent to. `repeated` counts the questions an earlier brief of this pass
 * already stands for: they are not asked, and they are not on record either, so the consent line says them apart.
 */
export type Asking = { readonly questions: number; readonly repeated: number; readonly sending: readonly string[] };

export const wouldAsk = (record: string, briefs: readonly string[], reask: boolean, now = Date.now()): Asking => {
  let questions = 0,
    repeated = 0;
  const sending: string[] = [];
  const counted = new Set<string>();
  for (const brief of briefs) {
    const state = cardState(brief);
    let n = 0;
    for (const question of Object.values(QUESTIONS)) {
      const key = keyOf(MODEL, question, state);
      // Counted already, by an earlier brief in this pass: that asking writes the record this one would read.
      if (counted.has(key)) {
        repeated++;
        continue;
      }
      const r = reading(key, readFacts(record, key), question, MODEL, now);
      if (r.status === 'none' || (reask && r.status === 'failed')) {
        counted.add(key);
        n++;
      }
    }
    questions += n;
    // What travels is the stripped card, not the brief: that is what `cardState` puts in the request.
    if (n > 0) sending.push(state.card as string);
  }
  return { questions, repeated, sending };
};

/**
 * A run's label, as a row carries it, beside the card that would travel: two runs whose brief strips to the same card
 * are one question to the judge, and the report says so. The brief itself is not a row's: what is scored is the two
 * properties.
 */
const pick = (run: { id: string; first: string; folder: Row['folder']; web: boolean; plan: boolean }, card: string) => ({
  id: run.id,
  first: run.first,
  folder: run.folder,
  web: run.web,
  plan: run.plan,
  card,
});

export async function main(argv: readonly string[], io: Io = {}): Promise<number> {
  const env = io.env ?? process.env;
  const out = io.out ?? ((line: string) => console.log(line));
  const [verb, ...rest] = argv;
  switch (verb) {
    case 'status':
      if (rest.length > 0) refuse(`judge status takes nothing; it was given ${rest.join(' ')}.`);
      out(status(env));
      return 0;
    case 'card': {
      let file: string | undefined,
        text: string | undefined,
        record: string | undefined,
        reask = false;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        const value = () => rest[++i] ?? refuse(`judge card: ${a} takes a value.\n${USAGE}`);
        if (a === '--text') text = value();
        else if (a === '--record') record = value();
        else if (a === '--reask') reask = true;
        else if (a.startsWith('-')) refuse(`judge card: unknown option ${a}.\n${USAGE}`);
        else if (file === undefined) file = a;
        else refuse(`judge card: one card at a time; ${file} and ${a} were given.`);
      }
      if ((file === undefined) === (text === undefined)) refuse(`judge card: give a card's file, or its --text, and not both.\n${USAGE}`);
      let source = 'text';
      if (file !== undefined) {
        source = file;
        try {
          text = fs.readFileSync(file, 'utf8');
        } catch (e) {
          refuse(`judge card: cannot read ${file}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}.`);
        }
      }
      const state = cardState(text!);
      const dir = path.resolve(record ?? defaultRecord(env));
      const j = judge({
        model: MODEL,
        record: dir,
        env,
        ...(io.fetch ? { fetch: io.fetch } : {}),
        ...(io.retries !== undefined ? { retries: io.retries } : {}),
      });
      const asked = await j.ask(state, QUESTIONS, reask ? { reask: 'failed' } : {});
      for (const line of report(source, state.card.length, dir, asked)) out(line);
      return 0;
    }
    case 'runs': {
      let store: string | undefined, record: string | undefined, since: string | undefined, json: string | undefined;
      let yes = false,
        reask = false;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        const value = () => rest[++i] ?? refuse(`judge runs: ${a} takes a value.\n${USAGE}`);
        if (a === '--store') store = value();
        else if (a === '--record') record = value();
        else if (a === '--since') since = value();
        else if (a === '--json') json = value();
        else if (a === '--yes') yes = true;
        else if (a === '--reask') reask = true;
        else refuse(`judge runs: ${a.startsWith('-') ? `unknown option ${a}` : `it takes no argument; it was given ${a}`}.\n${USAGE}`);
      }
      const root = path.resolve(store ?? defaultStore(env));
      const dir = path.resolve(record ?? defaultRecord(env));
      const { runs, skipped, read } = readRuns(root, since === undefined ? {} : { since: sinceOf(since) });
      const off = available(env) ? undefined : 'the judge is off: no TYPESAFE_API_KEY in the environment';

      // What it costs and what it sends, before anything is sent. `--yes` is needed only when a request would be made.
      const asking = off
        ? { questions: 0, repeated: 0, sending: [] }
        : wouldAsk(
            dir,
            runs.map((r) => r.brief),
            reask,
          );
      const characters = asking.sending.reduce((n, card) => n + card.length, 0);
      out(`judge runs: ${runs.length} runs in scope, ${skipped.length} skipped, of ${read} records in ${root}`);
      if (off) out(`  ${off}; nothing would be sent, and only the rival is scored.`);
      else if (asking.repeated === 0)
        out(`  ${asking.questions} of ${runs.length * 4} questions would be asked; the rest are on record in ${dir}`);
      // A brief dispatched twice is asked once: its second four questions are neither asked nor on record yet.
      else
        out(
          `  ${asking.questions} of ${runs.length * 4} questions would be asked; ${asking.repeated} more are the same questions of a brief already counted, ` +
            `and ${runs.length * 4 - asking.questions - asking.repeated} are on record in ${dir}`,
        );
      if (asking.questions > 0) {
        out(
          `  about ${characters} characters would go to TypeSafe — ${asking.sending.length} of the ${runs.length} briefs, ` +
            'stripped of their frontmatter, with the fixed description of the repository and nothing else',
        );
      } else if (!off) out('  nothing would be sent: every answer is already on record.');
      out("  TypeSafe's retention terms have not been read by this project: assume that what is sent may be kept.");
      if (asking.questions > 0 && !yes) {
        return refuse('judge runs: nothing was sent. Read what it costs above, then run it again with --yes.');
      }
      out('');

      const rows: Row[] = [];
      const cost = { requests: 0, questions: 0, inputTokens: 0, ms: 0 };
      if (!off) {
        const j = judge({
          model: MODEL,
          record: dir,
          env,
          ...(io.fetch ? { fetch: io.fetch } : {}),
          ...(io.retries !== undefined ? { retries: io.retries } : {}),
        });
        for (const run of runs) {
          const state = cardState(run.brief);
          const asked = await j.ask(state, QUESTIONS, reask ? { reask: 'failed' } : {});
          cost.requests += asked.requests;
          cost.questions += asked.sent;
          cost.inputTokens += asked.usage?.input_tokens ?? 0;
          cost.ms += asked.ms ?? 0;
          rows.push({ ...pick(run, state.card as string), rival: rival(run.brief), answers: asked.answers as CardAnswers });
        }
      } else {
        for (const run of runs) rows.push({ ...pick(run, cardState(run.brief).card as string), rival: rival(run.brief) });
      }

      const report: Report = {
        store: root,
        record: dir,
        model: MODEL,
        read,
        rows,
        skipped,
        ...(since !== undefined ? { since } : {}),
        ...(off !== undefined ? { off } : { asked: cost as Cost }),
      };
      for (const line of scoreLines(report)) out(line);
      if (json !== undefined) {
        try {
          fs.writeFileSync(json, JSON.stringify(document(report), null, 1) + '\n');
        } catch (e) {
          refuse(`judge runs: cannot write ${json}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}.`);
        }
        out(`wrote ${json}`);
      }
      return 0;
    }
    case undefined:
    case 'help':
    case '--help':
      out(USAGE);
      return verb === undefined ? 2 : 0;
    default:
      return refuse(`judge: no command ${verb}.\n${USAGE}`);
  }
}
