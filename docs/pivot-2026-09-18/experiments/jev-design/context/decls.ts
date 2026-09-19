/** Inside a 2,000–4,000-line file: from the BRIEF ALONE, which top-level declarations will the change touch? Truth: the branch's diff hunks. */
import { Effect } from 'effect';
import fs from 'node:fs';
import { Judge, JudgeRecording, JudgeReplay, type Question } from './judge.ts';
const mode = process.argv[2] ?? 'replay';
const RECORD = new URL('./judgments-decls.jsonl', import.meta.url).pathname;
const data = JSON.parse(fs.readFileSync(new URL('./decls_dataset.json', import.meta.url), 'utf8')) as { id: string; file: string; brief: string; decls: { name: string; doc: string }[] }[];
const qs = (o: (typeof data)[number]): Record<string, Question> => Object.fromEntries(o.decls.map((d) => [d.name, {
  type: 'noul',
  instructions: `To carry out the task in \`brief\`, will the declaration \`${d.name}\` in ${o.file} have to be edited, or new code added right beside it?${d.doc ? ` Its doc comment begins: ${d.doc.slice(0, 180)}` : ''}`,
} satisfies Question]));
const program = Effect.gen(function* () {
  const judge = yield* Judge;
  return yield* Effect.forEach(data, (o) => Effect.forEach([1, 2], (asking) =>
    judge.ask({ state: { brief: o.brief }, questions: qs(o), asking }).pipe(
      Effect.map((j) => ({ ok: true as const, ms: j.ms, tokens: j.usage.input_tokens, a: Object.fromEntries(Object.entries(j.answers).map(([k, v]) => [k, (v as { noul: number }).noul])) })),
      Effect.catch((e) => Effect.succeed({ ok: false as const, error: e._tag, ms: 0, tokens: 0, a: {} as Record<string, number> })))
  ).pipe(Effect.map((two) => ({ id: o.id, file: o.file, two }))), { concurrency: 4 });
});
const out = await Effect.runPromise(program.pipe(Effect.provide(mode === 'record' ? JudgeRecording(RECORD) : JudgeReplay(RECORD))));
fs.writeFileSync(new URL('./results-decls.json', import.meta.url), JSON.stringify(out));
const all = out.flatMap((o) => o.two); const tokens = all.reduce((n, t) => n + t.tokens, 0);
console.log(JSON.stringify({ requests: all.length, failed: all.filter((x) => !x.ok).length, inputTokens: tokens, usd: +(tokens * 0.042e-6).toFixed(4) }));
