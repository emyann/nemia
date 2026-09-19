import { TypeSafeClient, choice, noul, score } from '@typesafe-ai/sdk';
const client = new TypeSafeClient();
const CAPTURES = ['call dentist to move thursday appointment', 'mom bday', 'redo the kitchen', 'interesting article on sqlite internals, read later maybe', 'reply to Sam: yes to lunch friday', 'learn piano someday', 'tax return due april 30, need receipts from accountant first', 'asdf test note', 'ask Priya for the Q3 numbers'];
const questions = {
  kind: choice('What is `capture`, a note a person jotted into their inbox?', { action: 'Something the person intends to do or get done.', reference: 'Information to keep, with nothing to do about it.', someday: 'An idea or wish with no commitment to act on it now.', trash: 'Nothing worth keeping.' }),
  multi: noul('Would finishing what `capture` describes take more than one distinct step or sitting?'),
  size: score('How much effort would the very first step of `capture` take?', ['A minute or two: one quick message, call or click', 'Up to half an hour of focused work', 'A few hours', 'Days or more']),
  dated: noul('Does `capture` name a specific date, day or deadline?'),
  waiting: noul('Does `capture` depend on another person doing or providing something before it can be finished?'),
  where: choice('Where would the person need to be, or what would they need, to do the first step of `capture`?', { phone: null, computer: null, home: null, errands: null, 'in person': null, anywhere: null }),
  clear: noul('Is it clear from `capture` alone what the very next physical action is?'),
};
let tokens = 0; const ms = [];
for (const capture of CAPTURES) {
  const t = performance.now();
  const { answers: a, usage } = await client.systemOne({ model: 'jev-1.13.0', state: { capture }, questions });
  ms.push(performance.now() - t); tokens += usage.input_tokens;
  // The GTD diagram, as code. Every threshold sends the doubtful case to the side where a person looks.
  let out;
  if (a.kind.confidence < 0.5) out = 'STAYS IN INBOX — unsure what it is';
  else if (a.kind.choice === 'trash') out = a.kind.probabilities.trash > 0.9 ? 'trash' : 'STAYS IN INBOX — maybe trash, a person decides';
  else if (a.kind.choice !== 'action') out = a.kind.choice === 'someday' ? 'someday / maybe' : 'reference';
  else if (a.clear.noul < 0.5) out = 'STAYS IN INBOX — actionable, but the next action is not clear';
  else if (a.multi.noul >= 0.7) out = 'PROJECT — needs a next action written' + (a.dated.noul >= 0.7 ? ' · has a date' : '');
  else if (a.waiting.noul >= 0.7) out = 'delegate → waiting for';
  else if (a.size.score <= 0.5) out = 'DO IT NOW (two-minute rule)';
  else out = (a.dated.noul >= 0.7 ? 'calendar' : 'next actions') + ` @${a.where.choice}`;
  console.log(`${capture.padEnd(62)} → ${out}`);
  console.log(`   kind ${a.kind.choice} ${a.kind.confidence.toFixed(2)} · multi ${a.multi.noul.toFixed(2)} · size ${a.size.score.toFixed(2)}/3 · dated ${a.dated.noul.toFixed(2)} · waiting ${a.waiting.noul.toFixed(2)} · clear ${a.clear.noul.toFixed(2)} · @${a.where.choice} ${a.where.confidence.toFixed(2)}`);
}
ms.sort((x, y) => x - y);
console.log(`\n${CAPTURES.length} captures × 7 judgments: ${tokens} tokens = $${(tokens * 0.042 / 1e6).toFixed(5)} · median ${ms[Math.floor(ms.length / 2)].toFixed(0)} ms per capture`);
