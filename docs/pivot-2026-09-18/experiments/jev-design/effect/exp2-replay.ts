/**
 * Hermetic: no key in the environment, and a global fetch that throws. Everything below is answered from judgments.jsonl.
 *   node exp2-replay.ts            (NO --env-file)
 */
import { Effect, Layer } from 'effect';
import fs from 'node:fs';
import { JudgeLog, replay, decideAll, decide, noul, verdictOf, type Verdict } from './judge.ts';
import { MODEL, LOG, HERE, chosen, findings, questionsFor, isPositive } from './data.ts';

if (process.env.TYPESAFE_API_KEY) throw new Error('this run must have no key');
let netCalls = 0;
globalThis.fetch = (() => { netCalls++; throw new Error('the network was reached from a replay'); }) as typeof fetch;

const layer = replay(MODEL).pipe(Layer.provide(JudgeLog.file(LOG)));
const T = { yes: 0.8, no: 0.3 };

const table = await Effect.runPromise(Effect.gen(function* () {
  const out: { brief: string; finding: string; p: number; verdict: Verdict; label: boolean }[] = [];
  for (const b of chosen) {
    const r = yield* decideAll(questionsFor(), T)({ request: b.brief });
    for (const [id, d] of Object.entries(r.decisions)) out.push({ brief: b.run, finding: id, p: d.p, verdict: d.verdict, label: isPositive(b.run, id) });
  }
  return out;
}).pipe(Effect.provide(layer)));

const cell = (v: Verdict, label: boolean) => table.filter((r) => r.verdict === v && r.label === label).length;
console.log(`pairs ${table.length}, labelled positive ${table.filter((r) => r.label).length}`);
console.log(`            taken up   not`);
for (const v of ['yes', 'unsure', 'no'] as const) console.log(`${v.padEnd(8)} ${String(cell(v, true)).padStart(10)} ${String(cell(v, false)).padStart(6)}`);
console.log('\nthe unsure branch, which is a person\'s:');
for (const r of table.filter((r) => r.verdict === 'unsure').sort((a, b) => b.p - a.p)) console.log(`  ${r.p.toFixed(2)} ${r.label ? 'POS' : 'neg'}  ${r.brief.slice(-9)} <- ${r.finding}`);

// Does a fourth asking land on the same side as the probe's three? (thresholds 0.8 and 0.3)
const probe = JSON.parse(fs.readFileSync(`${HERE}/../../jev/probe-result.json`, 'utf8')).pairs as Record<string, number[]>;
let flips = 0; const flipped: string[] = [];
for (const r of table) {
  const all = [...(probe[`${r.brief}|${r.finding}`] ?? []), r.p];
  const vs = new Set(all.map((p) => verdictOf(p, T)));
  if (vs.size > 1) { flips++; flipped.push(`${all.map((p) => p.toFixed(2)).join(' ')}  ${r.brief.slice(-9)} <- ${r.finding}`); }
}
console.log(`\nverdict changes across 4 askings (3 from the probe, 1 recorded here): ${flips} of ${table.length}`);
for (const f of flipped) console.log('  ' + f);

// Plain-code baseline: shared backticked symbols + file named. Three-way too: >=3 yes, 0 no, else unsure.
const syms = (t: string) => new Set([...t.matchAll(/`([^`\n]{2,60})`/g)].map((m) => m[1]!));
const F = new Map(findings.map((f) => [f.id, f]));
const base = (brief: string, id: string) => {
  const f = F.get(id)!; const s = syms(brief); let n = 0; for (const x of syms(f.what)) if (s.has(x)) n++;
  return n + (f.file && (brief.includes(f.file) || brief.includes(f.file.split('/').at(-1)!)) ? 1 : 0);
};
const B = new Map(chosen.map((b) => [b.run, b.brief]));
const bv = (n: number): Verdict => (n >= 3 ? 'yes' : n === 0 ? 'no' : 'unsure');
console.log('\nbaseline (shared backticked symbols + file named; >=3 yes, 0 no, else unsure)');
for (const v of ['yes', 'unsure', 'no'] as const) {
  const rows = table.filter((r) => bv(base(B.get(r.brief)!, r.finding)) === v);
  console.log(`${v.padEnd(8)} ${String(rows.filter((r) => r.label).length).padStart(10)} ${String(rows.filter((r) => !r.label).length).padStart(6)}`);
}

// A miss is loud.
const miss = await Effect.runPromise(Effect.result(decide(noul('Is `request` about the web app?', { true: 'yes', false: 'no' }), T)({ request: chosen[0]!.brief }).pipe(Effect.provide(layer))));
console.log(`\nan unrecorded question: ${miss._tag === 'Failure' ? `${miss.failure._tag} key=${(miss.failure as { key: string }).key}` : 'ANSWERED (wrong)'}`);
console.log(`network calls attempted: ${netCalls}; key in environment: ${process.env.TYPESAFE_API_KEY ? 'yes' : 'no'}`);
fs.writeFileSync(`${HERE}/exp2-table.json`, JSON.stringify(table, null, 1));
