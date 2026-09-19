/** Site 2: from a review finding ALONE, will the implementer contest it ("won't fix") or just fix it? Ground truth: the recorded reply. */
import { Effect } from 'effect';
import fs from 'node:fs';
import { Judge, JudgeRecording, JudgeReplay, type Question } from './judge.ts';
const mode = process.argv[2] ?? 'replay';
const RECORD = new URL('./judgments-rounds.jsonl', import.meta.url).pathname;
const reps = JSON.parse(fs.readFileSync(new URL('./replies.json', import.meta.url), 'utf8')) as { task: string; finding: string; answer: string }[];
const questions: Record<string, Question> = {
  contests_design: { type: 'noul', instructions: 'Does the review finding in `finding` question a deliberate design decision of the author — something the author probably chose on purpose and could reasonably defend — rather than report a plain defect?',
    criteria: { true: 'The finding disputes a choice (scope, approach, wording, a trade-off) that the author may have made on purpose.', false: 'The finding reports a defect, omission or inconsistency whose fix is clear from the finding itself.' } },
  fix_is_clear: { type: 'noul', instructions: 'Could a competent engineer who did not write the code fix what `finding` reports, using only the finding and the code it points to, without needing to know why the author wrote it that way?' },
  out_of_scope: { type: 'noul', instructions: 'Does the finding in `finding` ask for work that goes beyond what the change under review set out to do?' },
};
const program = Effect.gen(function* () {
  const judge = yield* Judge;
  return yield* Effect.forEach(reps, (r, i) => Effect.forEach([1, 2], (asking) =>
    judge.ask({ state: { finding: r.finding }, questions, asking }).pipe(Effect.map((j) => ({ tokens: j.usage.input_tokens, a: Object.fromEntries(Object.entries(j.answers).map(([k, v]) => [k, (v as { noul: number }).noul])) })))
  ).pipe(Effect.map((two) => ({ i, task: r.task, answer: r.answer, two }))), { concurrency: 6 });
});
const out = await Effect.runPromise(program.pipe(Effect.provide(mode === 'record' ? JudgeRecording(RECORD) : JudgeReplay(RECORD))));
fs.writeFileSync(new URL('./results-rounds.json', import.meta.url), JSON.stringify(out));
const tokens = out.reduce((n, o) => n + o.two.reduce((m, t) => m + t.tokens, 0), 0);
console.log(JSON.stringify({ requests: out.length * 2, inputTokens: tokens, usd: +(tokens * 0.042e-6).toFixed(4) }));
