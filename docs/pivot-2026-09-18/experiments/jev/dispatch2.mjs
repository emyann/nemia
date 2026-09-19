import { readFileSync, writeFileSync } from 'node:fs';
import { TypeSafeClient, choice, noul, score } from '@typesafe-ai/sdk';
const S = '/tmp/claude-1000/-home-yrnd1-projects-hkb-v2/2ed48a58-52f4-4a7d-97e1-cbeb7dbc6835/scratchpad/';
// file, the workflow Claude chose, and whether the run's branch really touched apps/web (git; null = not run yet)
const CARDS = [
  ['card-p01.md', 'dev', false], ['card-p02.md', 'dev-build', true], ['card-p1.md', 'dev-planned-build', true], ['card-p04.md', 'dev-build', true],
  ['card-leftovers.md', 'dev', false], ['card-agents-board.md', 'dev-planned-build', true], ['card-merge-message.md', 'dev', false],
  ['card-gate-factory.md', 'dev-build', true], ['card-p05.md', 'dev-planned', false], ['card-p06.md', 'dev', false], ['card-p07.md', 'dev-build', null],
];
const body = (f) => readFileSync(S + f, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
const repository = {
  'packages/agent-engine': 'runs one agent session to completion, durably; no user interface',
  'packages/agent-workflows': 'sequences engine tasks into runs of steps; the wf command line; no user interface',
  'apps/api': 'a Node server that puts the workflows behind HTTP; the web app and its end-to-end test run against it',
  'apps/web': 'the React web app people look at: the Factory, a run\'s page, the inbox, the workflows and agents pages',
  'workflows/': 'folders of markdown that say which agents do a piece of work and in what order',
};
const teams = {
  dev: 'Implement, then a second engineer reviews (up to three rounds), then a merge a person approves. Verified by the unit tests and the typecheck only. Use when the work does not change the web app or the api it runs against, and its design is settled by the request.',
  'dev-build': 'As dev, and also verified by building the web app and running its end-to-end test in a browser. Use when the work changes the web app or the api it runs against, and its design is settled by the request.',
  'dev-planned': 'A planner reads the code and proposes a plan before anyone changes anything, then as dev. Use when the request leaves real design decisions open or changes several parts of the system together, and does not change the web app.',
  'dev-planned-build': 'A plan first, then as dev-build, with the web app built and its end-to-end test run. Use when the request leaves design decisions open AND changes the web app or the api it runs against.',
  ui: 'Implement a change a person will see in the web app and look at every page it changed in both themes; reviewed against screenshots. It ends at its result: nothing merges it.',
  supervisor: 'One long session that watches the runs and brings what needs a person to that person. Not for changing code.',
  'none of these': 'No team described fits, or the card does not say enough to choose.',
};
const questions = {
  team: choice('A person left `card` in an inbox. Which team should do the work it asks for?', teams),
  web: noul('Would doing what `card` asks change the source of the web app (apps/web) or of the api it runs against (apps/api)? `repository` says what each part is.', { true: 'Something a person sees on the board, or the api behind it, has to change.', false: 'The work stays in the packages, the workflow folders, tests or documents; nothing the browser loads changes.' }),
  plan: noul('Should someone read the code and propose a plan before anyone changes anything, because `card` leaves real design decisions open or changes several parts of the system together?', { true: 'What to build, where, or how is not settled by the card\'s words, or the change spans several parts that must agree.', false: 'The card names a bounded change whose design is settled; an engineer could start directly.' }),
  clear: score('How well does `card` say what done looks like?', ['It does not say what is wanted', 'It names a goal and leaves what to build open', 'It says what to build but not how to check it', 'It says what to build and how to tell it is done']),
  size: score('How large is the work `card` asks for?', ['A line or two in one file', 'A small change in one part of the system, an hour or two', 'A feature in one part, or a change across two parts', 'A change across three or more parts of the system']),
};
const client = new TypeSafeClient(); const out = []; let tokens = 0; const ms = [];
for (const [file, chose, touchedWeb] of CARDS) {
  const full = body(file); const title = full.split('\n')[0];
  for (const [form, card] of [['title', title], ['full', full]]) {
    const asks = [];
    for (let k = 0; k < 2; k++) {
      const t = performance.now();
      const r = await client.systemOne({ model: 'jev-1.13.0', state: { card, repository }, questions }, { timeout: 120000 });
      ms.push(performance.now() - t); tokens += r.usage.input_tokens;
      const a = r.answers;
      asks.push({ team: a.team.choice, teamP: a.team.probabilities, conf: a.team.confidence, web: a.web.noul, plan: a.plan.noul, clear: a.clear.score, size: a.size.score });
    }
    out.push({ file, title: title.slice(0, 70), form, chose, touchedWeb, chars: card.length, asks });
  }
}
writeFileSync('dispatch2-result.json', JSON.stringify(out, null, 1));
ms.sort((x, y) => x - y);
console.log(`${out.length * 2} requests · ${tokens} tokens = $${(tokens * 0.042 / 1e6).toFixed(4)} · median ${ms[ms.length >> 1].toFixed(0)} ms`);
