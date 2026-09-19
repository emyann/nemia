// Skeptic probe: the language track's own questions, asked over only the FIRST LINE of each brief (a stand-in for a terse inbox card).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const L = process.argv[2]!;
const require = createRequire(L + '/x.js');
const { TypeSafeClient } = require('@typesafe-ai/sdk');
const { cardQuestions, cardState } = await import(L + '/questions.ts');
const data = JSON.parse(fs.readFileSync(L + '/dataset.json', 'utf8'));
const client = new TypeSafeClient({ timeout: 20000 });
const { size, ...nouls } = cardQuestions;
const out: any[] = []; let tok = 0;
const terse = (b: string) => { const first = b.split(/\n/)[0]!; const s = first.split(/(?<=[.:])\s/)[0]!; return s.slice(0, 160); };
const runs = data.runs;
for (let i = 0; i < runs.length; i += 8) {
  await Promise.all(runs.slice(i, i + 8).map(async (r: any) => {
    const card = terse(r.brief);
    try {
      const v = await client.systemOne({ model: 'jev-1.13.0', state: cardState(card), questions: nouls as never });
      tok += v.usage.input_tokens;
      out.push({ id: r.id, card, full: r.brief.length, web: (v.answers as any).web.noul, truthWeb: r.touchesWeb, engine: (v.answers as any).engine.noul, truthEngine: r.pkgs.includes('packages/agent-engine') });
    } catch (e: any) { out.push({ id: r.id, card, error: String(e?.message ?? e).slice(0, 120) }); }
  }));
}
fs.writeFileSync(import.meta.dirname + '/terse-result.json', JSON.stringify({ tok, usd: tok * 0.042 / 1e6, out }, null, 1));
console.log('tokens', tok, 'usd', (tok * 0.042 / 1e6).toFixed(5), 'errors', out.filter((o) => o.error).length);
