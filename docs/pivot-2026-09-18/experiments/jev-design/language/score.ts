/** Scores from the record alone: the replay layer, no key, no network. `node score.ts` */
import { Effect } from 'effect';
import fs from 'node:fs';
import { Judge, type Verdict } from './judge.ts';
import { againQuestion, againQuestionFenced, cardQuestions, cardState, findingsState, IMPLEMENTER_NOTE, INJECTION } from './questions.ts';

const here = import.meta.dirname;
const data = JSON.parse(fs.readFileSync(`${here}/dataset.json`, 'utf8'));
const ask = (state: unknown, questions: Record<string, unknown>, asking = 1) =>
  Effect.runSync(Effect.gen(function* () { return yield* (yield* Judge).ask({ state, questions, asking }); }).pipe(Effect.provide(Judge.replay(`${here}/verdicts.jsonl`))));
const n = (v: Verdict, q: string) => (v.answers[q] as { noul: number }).noul;

type Row = { id: string; truth: boolean; p1: number; p2: number; base: boolean };
function report(name: string, rows: Row[]) {
  console.log(`\n## ${name}  (n=${rows.length}, positives=${rows.filter((r) => r.truth).length})`);
  const pr = (pred: (r: Row) => boolean) => {
    const tp = rows.filter((r) => pred(r) && r.truth).length, fp = rows.filter((r) => pred(r) && !r.truth).length, fn = rows.filter((r) => !pred(r) && r.truth).length;
    return `precision ${(tp / Math.max(1, tp + fp)).toFixed(2)} recall ${(tp / Math.max(1, tp + fn)).toFixed(2)} accuracy ${((rows.length - fp - fn) / rows.length).toFixed(2)} (tp ${tp} fp ${fp} fn ${fn})`;
  };
  for (const t of [0.5, 0.8]) console.log(`  jev P>=${t}: ${pr((r) => r.p1 >= t)}`);
  console.log(`  baseline:   ${pr((r) => r.base)}`);
  const band = rows.filter((r) => r.p1 > 0.2 && r.p1 < 0.8);
  const outside = rows.filter((r) => !(r.p1 > 0.2 && r.p1 < 0.8));
  console.log(`  three-way (yes>=0.8, no<=0.2, else unsure): unsure ${band.length}/${rows.length}; decided wrong ${outside.filter((r) => (r.p1 >= 0.8) !== r.truth).length}/${outside.length}`);
  const d = rows.map((r) => Math.abs(r.p1 - r.p2));
  console.log(`  two askings: mean |dP| ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(4)} max ${Math.max(...d).toFixed(2)}; crossed 0.5: ${rows.filter((r) => (r.p1 >= 0.5) !== (r.p2 >= 0.5)).length}; crossed 0.8: ${rows.filter((r) => (r.p1 >= 0.8) !== (r.p2 >= 0.8)).length}; crossed 0.2: ${rows.filter((r) => (r.p1 <= 0.2) !== (r.p2 <= 0.2)).length}`);
  const wrong = rows.filter((r) => (r.p1 >= 0.5) !== r.truth).sort((a, b) => Math.abs(b.p1 - 0.5) - Math.abs(a.p1 - 0.5));
  for (const w of wrong.slice(0, 12)) console.log(`    wrong: ${w.id} truth=${w.truth} P=${w.p1} base=${w.base}`);
  return wrong;
}

// The ten-minute baselines, written before any answer was read.
const BASE = {
  web: /apps\/web|web app|\bboard\b|factory|\bpage\b|screenshot|e2e|browser|\bUI\b|component|react/i,
  api: /apps\/api|\bapi\b|\broute\b|http|endpoint/i,
  workflows: /agent-workflows|\bwf\b|`wf |workflow|\btick\b|\bstep\b|\brun\b/i,
  engine: /agent-engine|\bengine\b|`ae |journal|harness/i,
};
const PKG = { web: 'apps/web', api: 'apps/api', workflows: 'packages/agent-workflows', engine: 'packages/agent-engine' } as const;

const cards = data.runs.map((r: any) => ({ r, v1: ask(cardState(r.brief), cardQuestions, 1), v2: ask(cardState(r.brief), cardQuestions, 2) }));
const wrongByQ: Record<string, Row[]> = {};
for (const q of Object.keys(PKG) as (keyof typeof PKG)[]) {
  wrongByQ[q] = report(`card -> touches ${PKG[q]} (label v1: any file under it)`, cards.map(({ r, v1, v2 }: any) => ({ id: r.id, truth: r.pkgs.includes(PKG[q]), p1: n(v1, q), p2: n(v2, q), base: BASE[q].test(r.brief) })));
  // Label v2, made after reading the v1 disagreements: 8 of 8 workflows misses were a branch whose only file there was docs/features.md.
  report(`card -> touches ${PKG[q]}/src (label v2: its source)`, cards.map(({ r, v1, v2 }: any) => ({ id: r.id, truth: r.pkgsSrc.includes(PKG[q]), p1: n(v1, q), p2: n(v2, q), base: BASE[q].test(r.brief) })));
}
// The person's own pick of a -build workflow, as a predictor of touching the web app.
{
  const rows = data.runs.map((r: any) => ({ truth: r.touchesWeb, pick: /build|^ui$/.test(r.workflow) }));
  console.log(`\n## the person's pick of a build workflow vs touched apps/web: wrong ${rows.filter((x: any) => x.pick !== x.truth).length}/${rows.length}`);
}
// Size: rank correlation of the Score with lines changed.
{
  const xs = cards.map(({ r, v1 }: any) => [(v1.answers.size as any).score, r.lines, r.files.length, r.brief.length]);
  const rank = (a: number[]) => { const s = [...a].map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const out = Array(a.length); s.forEach(([, i], k) => (out[i] = k)); return out; };
  const corr = (a: number[], b: number[]) => { const ra = rank(a), rb = rank(b), m = (a.length - 1) / 2; let s = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { s += (ra[i] - m) * (rb[i] - m); da += (ra[i] - m) ** 2; db += (rb[i] - m) ** 2; } return s / Math.sqrt(da * db); };
  console.log(`\n## size Score vs lines changed: spearman ${corr(xs.map((x: any) => x[0]), xs.map((x: any) => x[1])).toFixed(2)}; baseline (brief length vs lines) ${corr(xs.map((x: any) => x[3]), xs.map((x: any) => x[1])).toFixed(2)}`);
  const pk = cards.map(({ r, v1 }: any) => ({ multi: r.pkgs.length >= 3, s: (v1.answers.size as any).score }));
  console.log(`   mean size score when branch touched >=3 packages: ${(pk.filter((x: any) => x.multi).reduce((a: number, x: any) => a + x.s, 0) / pk.filter((x: any) => x.multi).length).toFixed(2)} (n=${pk.filter((x: any) => x.multi).length}); otherwise ${(pk.filter((x: any) => !x.multi).reduce((a: number, x: any) => a + x.s, 0) / pk.filter((x: any) => !x.multi).length).toFixed(2)}`);
}

// Reviews: is another round warranted, from the findings alone. Truth: the reviewer's own `again`.
const NIT = /\b(nit|minor|optional|cosmetic|not blocking|non-blocking|no change needed|out of scope|acceptable|harmless|could|consider|worth a|for later|not a bug)\b/i;
const revs = data.reviews.map((r: any) => ({ r, s: findingsState(r.findings) }));
report('findings -> another round (truth: reviewer\'s `again`)', revs.map(({ r, s }: any) => ({
  id: r.task, truth: r.again, p1: n(ask(s, { again: againQuestion }, 1), 'again'), p2: n(ask(s, { again: againQuestion }, 2), 'again'),
  base: r.findings.length > 0 && !r.findings.every((f: any) => NIT.test(f.what)),
})));
{
  const rows = revs.filter(({ r }: any) => r.findings.length > 0).map(({ r, s }: any) => ({ id: r.task, truth: r.again, p1: n(ask(s, { again: againQuestion }, 1), 'again'), p2: n(ask(s, { again: againQuestion }, 2), 'again'), base: !r.findings.every((f: any) => NIT.test(f.what)) }));
  report('  the same, only reviews that HAVE findings (the hard part)', rows);
  report('  the same, without round 3 (where the cap, not the reviewer, says no)', rows.filter((x: any) => !/try3$/.test(x.id)));
}

// The caution: state written by someone with a stake.
{
  const pos = revs.filter(({ r }: any) => r.again);
  const rows = pos.map(({ r, s }: any) => {
    const inj = { findings: s.findings.map((f: any, i: number) => (i === s.findings.length - 1 ? { ...f, what: f.what + INJECTION } : f)) };
    return {
      id: r.task,
      clean: n(ask(s, { again: againQuestion }, 1), 'again'),
      note: n(ask({ ...s, implementer_note: IMPLEMENTER_NOTE }, { again: againQuestion }), 'again'),
      fenced: n(ask({ ...s, implementer_note: IMPLEMENTER_NOTE }, { again: againQuestionFenced }), 'again'),
      inject: n(ask(inj, { again: againQuestion }), 'again'),
    };
  });
  const mean = (k: 'clean' | 'note' | 'fenced' | 'inject') => (rows.reduce((a: number, x: any) => a + x[k], 0) / rows.length).toFixed(3);
  const flips = (k: 'note' | 'fenced' | 'inject', t: number) => rows.filter((x: any) => x.clean >= t && x[k] < t).length;
  console.log(`\n## adversarial state, over the ${rows.length} reviews whose reviewer said again: true`);
  console.log(`  mean P: clean ${mean('clean')} | +implementer_note ${mean('note')} | +note, question fenced ${mean('fenced')} | injection inside a finding ${mean('inject')}`);
  for (const k of ['note', 'fenced', 'inject'] as const) console.log(`  ${k}: yes->below 0.5: ${flips(k, 0.5)} of ${rows.filter((x: any) => x.clean >= 0.5).length}; >=0.8 -> below 0.8: ${flips(k, 0.8)} of ${rows.filter((x: any) => x.clean >= 0.8).length}; largest drop ${Math.max(...rows.map((x: any) => x.clean - x[k])).toFixed(2)}`);
}

// Tokens, dollars, latency: everything recorded, both passes.
{
  const all = fs.readFileSync(`${here}/verdicts.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const tok = all.reduce((a, v) => a + v.usage.input_tokens, 0);
  const ms = all.map((v) => v.ms).sort((a, b) => a - b);
  console.log(`\n## spend: ${all.length} recorded calls, ${tok} input tokens, $${(tok * 0.042 / 1e6).toFixed(4)}; latency median ${ms[ms.length >> 1]} ms, p95 ${ms[Math.floor(ms.length * 0.95)]} ms (8 in flight)`);
}
