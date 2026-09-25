/**
 * A card's properties, and the shipped workflow folder they map to. Plain code, no Effect.
 *
 * The questions and the repository's description are dispatch2's words (`jev/dispatch2.mjs` of the pivot's experiments, kept
 * outside the repository since 2026-09-25), asked of eleven real cards on 2026-09-19. A question's words are the program: a
 * test pins their keys, so a change of wording fails it, and says the thresholds below were measured on the old words. They
 * were measured on nothing held out: this is for trying the dispatcher on real cards, and nothing calls it.
 */
import { noul, score } from '@typesafe-ai/sdk';
import { decide, why, type Judgment, type Verdict } from './decide.ts';
import type { Asked } from './judge.ts';
import { refuse } from './key.ts';

export const MODEL = 'jev-1.13.0';

/** What each part of the repository is: fixed text, so the state has one shape for every card. */
export const REPOSITORY = {
  'packages/agent-runtime': 'runs one agent session to completion, durably; no user interface',
  'packages/agent-orchestrator': 'sequences engine tasks into runs of steps; the wf command line; no user interface',
  'apps/api': 'a Node server that puts the workflows behind HTTP; the web app and its end-to-end test run against it',
  'apps/web': 'the React web app people look at: the Factory, a run\'s page, the inbox, the workflows and agents pages',
  'workflows/': 'folders of markdown that say which agents do a piece of work and in what order',
};

export const QUESTIONS = {
  web: noul('Would doing what `card` asks change the source of the web app (apps/web) or of the api it runs against (apps/api)? `repository` says what each part is.', { true: 'Something a person sees on the board, or the api behind it, has to change.', false: 'The work stays in the packages, the workflow folders, tests or documents; nothing the browser loads changes.' }),
  plan: noul('Should someone read the code and propose a plan before anyone changes anything, because `card` leaves real design decisions open or changes several parts of the system together?', { true: 'What to build, where, or how is not settled by the card\'s words, or the change spans several parts that must agree.', false: 'The card names a bounded change whose design is settled; an engineer could start directly.' }),
  clear: score('How well does `card` say what done looks like?', ['It does not say what is wanted', 'It names a goal and leaves what to build open', 'It says what to build but not how to check it', 'It says what to build and how to tell it is done']),
  size: score('How large is the work `card` asks for?', ['A line or two in one file', 'A small change in one part of the system, an hour or two', 'A feature in one part, or a change across two parts', 'A change across three or more parts of the system']),
};

export type CardAnswers = Asked<typeof QUESTIONS>['answers'];

/** P(yes) at or above 0.8 is yes, at or below 0.2 no; a clarity of 2.5 or more (of 3) is clear, 1.5 or less is not. */
export const THRESHOLDS = { web: { yes: 0.8, no: 0.2 }, plan: { yes: 0.8, no: 0.2 }, clear: { yes: 2.5, no: 1.5 } } as const;

const WHAT = {
  web: 'does it touch the web app or the api',
  plan: 'should someone plan first',
  clear: 'how clearly it says what done looks like',
  size: 'how large it is (printed, not used: no folder differs by size)',
} as const;

const UNSURE = { web: 'the web app', plan: 'planning first', clear: 'what done looks like' } as const;

/** The card's text as it is sent: its frontmatter — `workflow:`, `repo:`, paths on this machine — is never sent. */
export const cardText = (text: string): string => {
  const body = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '').trim();
  if (body === '') refuse('judge card: the card says nothing once its frontmatter is taken off; there is nothing to ask about.');
  return body;
};

export const cardState = (text: string) => ({ card: cardText(text), repository: REPOSITORY });

export type Dispatch = { readonly folder: string } | { readonly inbox: string };

/**
 * The shipped folder a pair of properties names. The four `dev*` folders are these two independent properties combined
 * (pivot §2.4, "ask for properties, not folders"), so one function names them, and `judge runs` reads a person's folder
 * back through the same shape.
 */
export const folderOf = (plan: boolean, web: boolean): string => `dev${plan ? '-planned' : ''}${web ? '-build' : ''}`;

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Pure: which shipped folder the properties map to, or why the card stays in the inbox. */
export const dispatch = (answers: CardAnswers): Dispatch => {
  const v = {
    web: decide(answers.web, THRESHOLDS.web),
    plan: decide(answers.plan, THRESHOLDS.plan),
    clear: decide(answers.clear, THRESHOLDS.clear),
  };
  if (v.clear === 'no') return { inbox: 'says too little about what done looks like' };
  const unsure = (Object.keys(v) as (keyof typeof v)[]).filter((k) => v[k] === 'unsure');
  if (unsure.length > 0) return { inbox: `unsure about ${list(unsure.map((k) => UNSURE[k]))}` };
  return { folder: folderOf(v.plan === 'yes', v.web === 'yes') };
};

const verdictOf = (id: keyof typeof QUESTIONS, j: Judgment): Verdict | '—' => (id === 'size' ? '—' : decide(j, THRESHOLDS[id]));

const shown = (j: Judgment) => {
  if (j.status === 'failed') return j.kind;
  return j.answer.type === 'noul' ? `P ${j.answer.noul.toFixed(2)}` : `score ${(j.answer as { score: number }).score.toFixed(2)} / 3`;
};

/** What `judge card` prints. */
export const report = (source: string, sent: number, record: string, asked: Asked<typeof QUESTIONS>): string[] => {
  const ids = Object.keys(QUESTIONS) as (keyof typeof QUESTIONS)[];
  // `sent` only when a request was made: with the judge off, or every answer on record, the card's text went nowhere.
  const lines = [`judge card: ${source} · ${sent} characters${asked.requests > 0 ? ' sent' : ', not sent'}, frontmatter stripped · ${MODEL}`];
  for (const id of ids) {
    const j = asked.answers[id];
    lines.push(`  ${id.padEnd(6)} ${shown(j).padEnd(16)} ${verdictOf(id, j).padEnd(7)} ${WHAT[id]}`);
  }
  const failed = ids.map((id) => asked.answers[id]).filter((j) => j.status === 'failed');
  for (const kind of new Set(failed.map((j) => (j.status === 'failed' ? j.kind : '')))) {
    const j = failed.find((f) => f.status === 'failed' && f.kind === kind)!;
    // A missing key is not on record: the judge is off, and the next run with a key asks as if for the first time.
    const next = kind === 'in-flight' ? '' : kind === 'no-key' ? ' — the judge is off; set the key and run again' : ' — once that is fixed, run again with --reask';
    lines.push(`  ${why(j)}${next}`);
  }
  const off = failed.some((j) => j.status === 'failed' && j.kind === 'no-key');
  lines.push(asked.requests > 0
    ? `1 request · ${asked.sent} questions · ${asked.usage ? `${asked.usage.input_tokens} input tokens` : 'no answer'} · ${asked.ms} ms`
    : asked.ms === undefined && !off ? 'all on record · 0 requests' : '0 requests');
  lines.push(`record: ${record}`);
  const d = dispatch(asked.answers);
  lines.push('folder' in d ? `→ ${d.folder}` : `→ stays in the inbox: ${d.inbox}`);
  return lines;
};
