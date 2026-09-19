/** The records, the question the earlier probe asked (same wording, so its thresholds hold), and the labels. */
import fs from 'node:fs';
import { noul } from './judge.ts';

export const MODEL = 'jev-1.13.0';
export const HERE = import.meta.dirname;
export const LOG = `${HERE}/judgments.jsonl`;

type Finding = { id: string; run: string; at: string; file: string; what: string };
type Brief = { run: string; createdAt: string; brief: string };
const data = JSON.parse(fs.readFileSync(`${HERE}/../../jev/dataset.json`, 'utf8')) as { findings: Finding[]; briefs: Brief[] };
export const findings = data.findings;
export const briefs = data.briefs;

const LEFT = ['five-leftovers-from-the-revi-c0tl', 'six-findings-the-last-review-6no7', 'four-leftovers-in-agent-work-3uyy', 'four-leftovers-on-the-board-fmk9', 'two-findings-the-apps-lane-s-1qur'];
/** The same fifteen briefs the probe used: five leftovers briefs and the last ten others. */
export const chosen = [...briefs.filter((b) => LEFT.includes(b.run)), ...briefs.filter((b) => !LEFT.includes(b.run)).slice(-10)];

export const takesUp = (f: Finding) => noul(
  `Does \`request\` ask for the following problem to be fixed? Problem, in file ${f.file}: ${f.what}`,
  {
    true: 'The request asks, in its own words, for this specific problem to be fixed.',
    false: 'The request does not ask for this problem to be fixed: it is about other problems, it only touches the same files or names, or it mentions this problem and says to leave it alone.',
  },
);
export const questionsFor = (fs_: Finding[] = findings) => Object.fromEntries(fs_.map((f) => [f.id, takesUp(f)]));

/** labels.json: 20 made by the earlier evaluation before any answer was seen, 2 added by it after (checked against the brief). */
export const labels = JSON.parse(fs.readFileSync(`${HERE}/labels.json`, 'utf8')) as { before: [string, string][]; after: [string, string][] };
export const isPositive = (brief: string, finding: string) => [...labels.before, ...labels.after].some(([b, f]) => b === brief && f === finding);

/** A fetch that counts, and can be told to refuse the network outright. */
export const counting = (inner: typeof fetch = fetch) => {
  const seen = { calls: 0 };
  const f = (input: string, init?: RequestInit) => { seen.calls++; return inner(input, init); };
  return { fetch: f, seen };
};
