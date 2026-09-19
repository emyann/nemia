import { readFileSync, readdirSync } from 'node:fs';
import { TypeSafeClient, choice, noul, score } from '@typesafe-ai/sdk';
const W = '/home/yrnd1/projects/hkb-v2/workflows';
const folders = readdirSync(W).filter((n) => { try { readFileSync(`${W}/${n}/README.md`); return true; } catch { return false; } });
const readmes = Object.fromEntries(folders.map((n) => [n, readFileSync(`${W}/${n}/README.md`, 'utf8').slice(0, 2600)]));
const CARDS = {
  'home (yours)': 'I would like a new home item in the menu and a homepage that is surfacing the most important thing a user should know.',
  'typo': "Fix the typo in the engine's README, in the section about ceilings.",
  'engine tokens': 'The engine should record the peak context of each attempt and split input tokens into cache read, cache write and uncached.',
  'vague': 'Make it faster.',
  'big': 'Replace the file store with sqlite across the engine, the workflows package and the api, keeping every record replayable.',
  'watch': 'Watch my runs and tell me on my phone when one needs me.',
};
const client = new TypeSafeClient();
const options = Object.fromEntries([...folders.map((n) => [n, null]), ['none of these', 'No workflow described fits, or the card does not say enough to choose.']]);
for (const [name, card] of Object.entries(CARDS)) {
  const out = [];
  for (let k = 0; k < 2; k++) {
    const r = await client.systemOne({ model: 'jev-1.13.0', state: { card, workflows: readmes }, questions: {
      route: choice('A person left `card` in an inbox. Each entry of `workflows` is the description of one workflow. Which workflow should do the work `card` asks for?', options),
      seen: noul('Does `card` ask for a change that a person using the web app would see on a page?'),
      web: noul('Would doing what `card` asks require changing the source code of a web application front end?'),
      plan: noul('Is what `card` asks open-ended enough that someone should read the code and propose a plan before anyone changes anything?', { true: 'The card leaves real design decisions open: what to build, where, or how is not settled by its words.', false: 'The card names a specific, bounded change that an engineer could start on directly.' }),
      clear: score('How well does `card` say what done looks like?', ['It does not say what is wanted at all', 'It names a goal but leaves what to build open', 'It says what to build but not how to check it', 'It says what to build and how to tell it is done']),
    } });
    out.push(r);
  }
  const [a, b] = out.map((r) => r.answers);
  const top = Object.entries(a.route.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, p]) => `${n} ${p.toFixed(2)}`).join(' · ');
  console.log(`\n■ ${name}: "${card.slice(0, 90)}${card.length > 90 ? '…' : ''}"`);
  console.log(`  one Choice  → ${a.route.choice} (confidence ${a.route.confidence.toFixed(2)}; 2nd asking: ${b.route.choice} ${b.route.confidence.toFixed(2)})   [${top}]`);
  console.log(`  decomposed  → seen on a page ${a.seen.noul.toFixed(2)}/${b.seen.noul.toFixed(2)} · front-end source ${a.web.noul.toFixed(2)}/${b.web.noul.toFixed(2)} · plan first ${a.plan.noul.toFixed(2)}/${b.plan.noul.toFixed(2)} · clarity ${a.clear.score.toFixed(2)} of 3 (conf ${a.clear.confidence.toFixed(2)})`);
  if (name.startsWith('home')) console.log(`  tokens ${out[0].usage.input_tokens} = $${(out[0].usage.input_tokens * 0.042 / 1e6).toFixed(5)}`);
}
