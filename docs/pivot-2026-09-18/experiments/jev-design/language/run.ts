/** Ask everything, twice, and write every verdict to verdicts.jsonl. `node --env-file=… run.ts` */
import { Effect } from 'effect';
import fs from 'node:fs';
import { Judge, type Ask } from './judge.ts';
import { againQuestion, againQuestionFenced, cardQuestions, cardState, findingsState, IMPLEMENTER_NOTE, INJECTION } from './questions.ts';

const here = import.meta.dirname;
const data = JSON.parse(fs.readFileSync(`${here}/dataset.json`, 'utf8'));
const OUT = `${here}/verdicts.jsonl`;
const INDEX = `${here}/asks.json`;

type Named = Ask & { id: string };
const asks: Named[] = [];
for (const asking of [1, 2]) {
  for (const r of data.runs) asks.push({ id: `card|${r.id}`, state: cardState(r.brief), questions: cardQuestions, asking });
  for (const r of data.reviews) asks.push({ id: `again|${r.task}`, state: findingsState(r.findings), questions: { again: againQuestion }, asking });
}
// The caution, tested: only over reviews whose reviewer said `again: true`.
for (const r of data.reviews.filter((x: any) => x.again)) {
  const base = findingsState(r.findings);
  asks.push({ id: `note|${r.task}`, state: { ...base, implementer_note: IMPLEMENTER_NOTE }, questions: { again: againQuestion } });
  asks.push({ id: `note-fenced|${r.task}`, state: { ...base, implementer_note: IMPLEMENTER_NOTE }, questions: { again: againQuestionFenced } });
  const inj = { findings: base.findings.map((f, i) => (i === base.findings.length - 1 ? { ...f, what: f.what + INJECTION } : f)) };
  asks.push({ id: `inject|${r.task}`, state: inj, questions: { again: againQuestion } });
}

const program = Effect.gen(function* () {
  const judge = yield* Judge;
  const index: Record<string, string> = {};
  const failures: string[] = [];
  yield* Effect.forEach(asks, (a) => judge.ask(a).pipe(
    Effect.tap((v) => Effect.sync(() => { index[`${a.id}#${a.asking ?? 1}`] = `${v.key}#${v.asking}`; })),
    Effect.catchTags({
      Refused: (e) => Effect.sync(() => { failures.push(`${a.id}: refused ${e.status}`); }),
      Unreachable: (e) => Effect.sync(() => { failures.push(`${a.id}: unreachable ${e.message}`); }),
      Malformed: (e) => Effect.sync(() => { failures.push(`${a.id}: malformed ${e.message}`); }),
      NotRecorded: (e) => Effect.sync(() => { failures.push(`${a.id}: not recorded ${e.key}`); }),
    }),
  ), { concurrency: 8, discard: true });
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 1));
  console.log(`${asks.length} asked, ${failures.length} failed`);
  for (const f of failures.slice(0, 10)) console.log(' ', f);
});

fs.rmSync(OUT, { force: true });
await Effect.runPromise(program.pipe(Effect.provide(Judge.recording(OUT))));
