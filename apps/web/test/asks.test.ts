/**
 * What a step needs from a person, as the board says it, and what the run's page offers to answer it with (lib/asks.ts): off the api's
 * `needs`, `blockedByHarness`, `lastLine`, `asked` and `waitingOnYou` alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answersOf, askedSaid, gateOffered, needLine, needNodeText, needOf, needsOf, needText, offersOf, raiseTo, stepAnchor, type Need } from '../src/lib/asks.ts';
import type { RetryMode, RunDetail } from '../src/lib/api.ts';

const LOGIN = 'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute';
/** What the harness says such a session waits for, in the package's words, as the api gives them (`StepNeeds.waitingFor`). */
const WAIT = { words: 'waiting for a permission prompt', advice: 'answer it in Claude Code: claude agents, session ae/t-held/1' };

type Step = RunDetail['steps'][number];

/** A step as a run's detail gives it, cut to what these read. */
const step = (name: string, status: string, over: Partial<Step> = {}): Step =>
  ({ name, status, note: null, needs: null, blockedByHarness: false, waitingFor: null, approve: null, denied: null, lastLine: null, asked: null, check: null, ...over }) as Step;

/** A run of these steps, waiting on `waitingOnYou`. */
const run = (steps: Step[], waitingOnYou: string[], cancelledAt: string | null = null) => ({ steps, waitingOnYou, cancelledAt });

test("a step's need is its question while it waits on you, or that the harness blocked its session, with what that harness waits for and what it said last where the api read it — none once asked, and none on a run called off", () => {
  const steps = [
    step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' }),
    step('theme', 'failed ✗ check (exit 1)'),
    step('held', 'needs-human', { blockedByHarness: true, lastLine: LOGIN, waitingFor: WAIT }),
    // Blocked by a harness that said nothing about what for, and said nothing since: the need is the harness's, with nothing under it.
    step('silent', 'needs-human', { blockedByHarness: true }),
    // Signed off blocked with a question, and a person has asked for its next try: the api leaves it out of `waitingOnYou`.
    step('plan', 'succeeded · BLOCKED', { needs: 'Which plan?', note: 'try 2 asked (--nudge, with your answer) — the next tick files it' }),
    step('review', 'waiting'),
  ];
  const needs = needsOf(run(steps, ['implement', 'theme']));
  assert.deepEqual(needs, [
    { step: 'implement', kind: 'asks', needs: 'Which database?' },
    { step: 'held', kind: 'harness', waitingFor: WAIT, lastLine: LOGIN },
    { step: 'silent', kind: 'harness', waitingFor: null, lastLine: null },
  ]);
  assert.deepEqual(needsOf(run(steps, [], '2026-09-14T07:00:00.000Z')), []);
  assert.equal(needOf(steps[0]!, false, false), null, 'asked already: no question to show');
  assert.equal(needOf(steps[2]!, false, true), null, 'called off: nobody waits for the session');

  // The wait before the last line: it is why the session has not moved. What a person does about it is not in either — the banner says it.
  assert.deepEqual(needs.map(needLine), [
    'implement asks: Which database?',
    `held is blocked by the harness: ${WAIT.words} · ${LOGIN}`,
    'silent is blocked by the harness',
  ]);
  assert.deepEqual(needs.map(needText), ['asks: Which database?', `blocked by the harness: ${WAIT.words} · ${LOGIN}`, 'blocked by the harness']);
  for (const line of [...needs.map(needLine), ...needs.map(needText)]) assert.doesNotMatch(line, /answer it in Claude Code/);

  // A step's node has one narrow line: it says the wait alone, and every other need as it reads anywhere else.
  assert.deepEqual(needs.map(needNodeText), ['asks: Which database?', WAIT.words, 'blocked by the harness']);

  // As the list gives a step the harness blocked, with no last line to give: the card names the harness and what it waits for, and quotes nothing.
  const listed = needOf({ name: 'held', needs: null, blockedByHarness: true, waitingFor: WAIT }, false, false);
  assert.deepEqual(listed, { step: 'held', kind: 'harness', waitingFor: WAIT, lastLine: null });
  assert.equal(needLine(listed!), `held is blocked by the harness: ${WAIT.words}`);
});

test("a step at its gate needs its approval, in `wf ls`'s words, while it waits on you — none once approved or sent back, and none on a run called off; the Decide section offers it nothing, since Approve is in its section", () => {
  const plan = step('plan', 'awaiting approval', { approve: 'approve plan' });
  const steps = [plan, step('implement', 'waiting'), step('theme', 'failed ✗ check (exit 1)')];
  const needs = needsOf(run(steps, ['plan', 'theme']));
  assert.deepEqual(needs, [{ step: 'plan', kind: 'approve', said: 'approve plan' }]);
  // The words name the step already: the card and the node say them as they are.
  assert.equal(needLine(needs[0]!), 'approve plan');
  assert.equal(needText(needs[0]!), 'approve plan');
  // Sent back, the api waits on nobody for it and carries no `approve`; approved, it reads as it stands and carries none either.
  assert.equal(needOf(plan, false, false), null, 'not waiting on you: nothing to approve');
  assert.equal(needOf({ ...plan, approve: null }, true, false), null, 'no need the api does not carry');
  assert.deepEqual(needsOf(run(steps, ['plan'], '2026-09-16T22:00:00.000Z')), [], 'nothing on a run called off');
  // An ending step at its gate is the run's to-decide line, which names it and the command: not asked for twice, as `wf ls` prints it.
  const ship = step('ship', 'awaiting approval', { approve: 'approve ship' });
  const ending = { ...run([step('implement', 'unverified · done'), ship], ['ship']), toDecide: { kind: 'approve', step: 'ship', says: 'Merge it.', said: 'Merge it. — wf approve r ship', command: 'wf approve r ship' } as const };
  assert.deepEqual(needsOf(ending), [], 'the to-decide line says it');
  // Another step's own gate, mid-workflow, is still asked for beside it.
  const both = { ...ending, steps: [...ending.steps, plan], waitingOnYou: ['ship', 'plan'] };
  assert.deepEqual(needsOf(both), [{ step: 'plan', kind: 'approve', said: 'approve plan' }]);
  // And a branch nobody merged names no step, so nothing is left out.
  const ahead = { ...run(steps, ['plan']), toDecide: { kind: 'git', branches: ['wf/r/implement'], said: 'wf/r/implement is ahead of main, and nothing has merged it — wf decide r', command: 'wf decide r' } as const };
  assert.deepEqual(needsOf(ahead), [{ step: 'plan', kind: 'approve', said: 'approve plan' }]);
  // A gate's step is answered where its closeout is, not among the answers.
  assert.deepEqual(offersOf(run(steps, ['plan', 'theme'])), [{ step: 'theme', kind: 'try-again', recheck: true, unfinished: false }]);
  // Sent back: its try asked, which the Decide section says, as for any try asked.
  const note = 'try 2 asked (--nudge, with your answer) — the next tick files it';
  const sent = step('plan', 'awaiting approval', { note, asked: { try: 2, mode: 'nudge', model: null, message: 'Store it first.', stopFirst: false } });
  assert.deepEqual(answersOf(run([sent], [])), [{ step: 'plan', kind: 'asked', try: 2, note }]);
  assert.equal(stepAnchor('plan'), 'step-plan');
});

test('what the Decide section offers: an answer to a step that asks, Try again for a refused check — recheck first where it did not finish — or an unsigned step, and the note of a try asked', () => {
  const steps = [
    step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' }),
    step('quiet', 'succeeded · BLOCKED'),
    step('theme', 'failed ✗ check (exit 1)', { check: { command: 'npm test', taskId: 't-c', verdict: 'exit 1', refused: null } }),
    step('lint', 'failed ✗ check (unfinished)', { check: { command: 'npm run lint', taskId: 't-l', verdict: 'unfinished', refused: null } }),
    step('docs', 'unsigned'),
    step('plan', 'succeeded · BLOCKED', {
      needs: 'Which plan?', note: 'try 2 asked (--fresh, with your answer) — the next tick files it',
      asked: { try: 2, mode: 'fresh', model: null, message: 'The small one.' },
    }),
    // Out of rounds: `wf round`, among the commands, and no try.
    step('review', 'rounds exhausted'),
    // Done, and waiting on nobody.
    step('tokens', 'unverified · done'),
  ];
  const waiting = ['implement', 'quiet', 'theme', 'lint', 'docs', 'review'];
  assert.deepEqual(offersOf(run(steps, waiting)), [
    { step: 'implement', kind: 'answer', needs: 'Which database?' },
    { step: 'quiet', kind: 'answer', needs: null },
    { step: 'theme', kind: 'try-again', recheck: true, unfinished: false },
    { step: 'lint', kind: 'try-again', recheck: true, unfinished: true },
    { step: 'docs', kind: 'try-again', recheck: false, unfinished: false },
    { step: 'plan', kind: 'asked', try: 2, note: 'try 2 asked (--fresh, with your answer) — the next tick files it' },
  ]);
  // A blocked step the api does not name as waiting on you is offered nothing: what waits is the api's word.
  assert.deepEqual(offersOf(run([steps[0]!], [])), []);
  assert.deepEqual(offersOf(run(steps, waiting, '2026-09-14T07:00:00.000Z')), [], 'nothing on a run called off');
  const kinds = (needs: Need[]) => needs.map((n) => n.kind);
  assert.deepEqual(kinds(needsOf(run(steps, waiting))), ['asks'], 'the banner names the step that asks');
});

test('a session the harness blocked is offered Continue, whether or not the api names it as waiting on you — and once asked, the note of its try, in the Decide section too; Continue itself is the banner\'s', () => {
  const held = step('held', 'needs-human', { blockedByHarness: true, lastLine: LOGIN });
  const implement = step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' });
  // It asked nothing, so the package's `waitingOnYou` does not name it; the package takes a try of it all the same.
  assert.deepEqual(offersOf(run([held], [])), [{ step: 'held', kind: 'continue' }]);
  assert.deepEqual(offersOf(run([held], ['held'])), [{ step: 'held', kind: 'continue' }]);
  assert.deepEqual(offersOf(run([implement, held], ['implement'])), [
    { step: 'implement', kind: 'answer', needs: 'Which database?' },
    { step: 'held', kind: 'continue' },
  ]);
  assert.deepEqual(answersOf(run([implement, held], ['implement'])), [{ step: 'implement', kind: 'answer', needs: 'Which database?' }]);
  assert.deepEqual(answersOf(run([held], [])), [], 'no Decide section for it until its try is asked');

  const note = 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it';
  const asked = step('held', 'needs-human', { blockedByHarness: true, lastLine: LOGIN, note, asked: { try: 2, mode: 'nudge', model: null, message: null, stopFirst: true } });
  assert.deepEqual(offersOf(run([asked], [])), [{ step: 'held', kind: 'asked', try: 2, note }]);
  assert.deepEqual(answersOf(run([asked], [])), [{ step: 'held', kind: 'asked', try: 2, note }], 'the Decide section is drawn for it, as for any try asked');
  // The need stays for as long as the harness keeps the session blocked: no tick has stopped it yet.
  assert.deepEqual(needsOf(run([asked], [])), [{ step: 'held', kind: 'harness', waitingFor: null, lastLine: LOGIN }]);
});

test('REFUSED: no Continue for a session still at work, which the harness did not block, nor for one it blocked on a run called off', () => {
  assert.deepEqual(offersOf(run([step('working', 'running (working)')], [])), []);
  assert.deepEqual(offersOf(run([step('working', 'running (working)')], ['working'])), []);
  const held = step('held', 'needs-human', { blockedByHarness: true, lastLine: LOGIN });
  assert.deepEqual(offersOf(run([held], [], '2026-09-14T07:00:00.000Z')), []);
});

test('a try the api has just taken, as the board says it until the run is read again: what the tick does next — stopping a blocked session first, where the package says so', () => {
  assert.equal(askedSaid({ try: 2, stopFirst: false }), 'try 2 asked — the next tick files it');
  assert.equal(askedSaid({ try: 3, stopFirst: true }), 'try 3 asked — stopping its blocked session, then the tick files it');
});

test("a step the api carries a raise for is offered it — with its try, or its loop's round — whatever its word, with its question where it signed off blocked, and whether its check did not finish", () => {
  const byTry = { by: 'retry' as const, above: 4.25, said: '$4.25', modes: ['nudge', 'fresh', 'recheck'] as RetryMode[], own: 'failed (check)' };
  const byRound = { by: 'round' as const, above: 2.1, said: '$2.10', modes: [] as RetryMode[], own: null };
  const ended = { by: 'retry' as const, above: 3.02, said: '$3.02', modes: ['nudge', 'fresh'] as RetryMode[], own: 'budget exhausted' };
  const blocked = { by: 'retry' as const, above: 1.5, said: '$1.50', modes: ['nudge', 'fresh'] as RetryMode[], own: 'blocked' };
  const unfinished = { ...byTry, above: 3.5, said: '$3.50' };
  const steps = [
    step('tokens', 'over budget $4.25 of $3', { raise: byTry, check: { command: 'npm test', taskId: 't-c', verdict: 'exit 1', refused: null } }),
    step('review', 'over budget — implement $2.10 of $2', { raise: byRound }),
    step('lint', 'budget exhausted $3.02 of $3', { raise: ended }),
    // Signed off blocked past its budget: its word is `over budget`, and its question is still the closeout's.
    step('palette', 'over budget $1.50 of $1', { raise: blocked, needs: 'Warm colours, or cool ones?' }),
    // Its check did not finish past its budget: a check's word, and a session of it refused without the raise all the same.
    step('types', 'failed ✗ check (unfinished)', { raise: unfinished, check: { command: 'npm run typecheck', taskId: 't-t', verdict: 'unfinished', refused: null } }),
  ];
  assert.deepEqual(offersOf(run(steps, ['tokens', 'review', 'lint', 'palette', 'types'])), [
    { step: 'tokens', kind: 'raise', status: 'over budget $4.25 of $3', needs: null, unfinished: false, ...byTry },
    { step: 'review', kind: 'raise', status: 'over budget — implement $2.10 of $2', needs: null, unfinished: false, ...byRound },
    { step: 'lint', kind: 'raise', status: 'budget exhausted $3.02 of $3', needs: null, unfinished: false, ...ended },
    { step: 'palette', kind: 'raise', status: 'over budget $1.50 of $1', needs: 'Warm colours, or cool ones?', unfinished: false, ...blocked },
    { step: 'types', kind: 'raise', status: 'failed ✗ check (unfinished)', needs: null, unfinished: true, ...unfinished },
  ]);
  assert.deepEqual(answersOf(run(steps, ['tokens'])).map((o) => o.kind), ['raise'], 'a raise is an answer the Decide section offers');
  // The first whole dollar above what the package says the cap has to pass: never the amount itself, which it refuses.
  assert.deepEqual([raiseTo(4.25), raiseTo(3), raiseTo(2.1), raiseTo(0.004)], [5, 4, 3, 1]);
});

test('REFUSED: no raise for a step past its budget the package takes none of, nor one not waiting on you, nor one whose raise is asked, nor on a run called off — and none for a check that did not finish within its budget', () => {
  const byTry = { by: 'retry' as const, above: 4.25, said: '$4.25', modes: ['nudge', 'fresh', 'recheck'] as RetryMode[], own: 'failed (check)' };
  // The loop's target: it goes again with its looping step's round, whose row that is.
  assert.deepEqual(offersOf(run([step('implement', 'over budget $2.10 of $2', { raise: null })], ['implement'])), []);
  assert.deepEqual(offersOf(run([step('tokens', 'over budget $4.25 of $3', { raise: byTry })], [])), []);
  const note = 'try 3 asked (--nudge, --budget 5) — the next tick files it';
  const asked = step('tokens', 'over budget $4.25 of $3', { raise: byTry, note, asked: { try: 3, mode: 'nudge', model: null, message: null, stopFirst: false } });
  assert.deepEqual(offersOf(run([asked], [])), [{ step: 'tokens', kind: 'asked', try: 3, note }]);
  assert.deepEqual(offersOf(run([step('tokens', 'over budget $4.25 of $3', { raise: byTry })], ['tokens'], '2026-09-15T07:00:00.000Z')), []);
  // A check that did not finish within its budget: the api carries no raise, and the board offers a try again, its recheck first.
  const lint = step('lint', 'failed ✗ check (unfinished)', { raise: null, check: { command: 'npm run lint', taskId: 't-l', verdict: 'unfinished', refused: null } });
  assert.deepEqual(offersOf(run([lint], ['lint'])), [{ step: 'lint', kind: 'try-again', recheck: true, unfinished: true }]);
});

test('REFUSED: a step\'s section offers its gate only for the words `wf ls` asks with — not for a step with none, not for a detail that carries no `approve` at all, and not on a run called off', () => {
  assert.equal(gateOffered({ approve: 'approve plan' }, false), true);
  assert.equal(gateOffered({ approve: null }, false), false, 'approved, sent back, or never gated');
  // An api started before it carried `approve`: nothing there is no approval to ask for, and its approve route would answer 404.
  assert.equal(gateOffered({} as Pick<Step, 'approve'>, false), false, 'a field the api did not send');
  assert.equal(gateOffered({ approve: '' }, false), false);
  assert.equal(gateOffered({ approve: 'approve plan' }, true), false, 'nobody waits for an approval on a run called off');
});

test('REFUSED: nothing is offered on a run a person holds — not Continue for a session the harness blocked, which the api names whatever waits on you, nor anything the api would still name — since the package refuses every one of these verbs on a held run', () => {
  const holding = { at: '2026-09-23T07:00:00.000Z', runs: [], word: 'held until a-1 ships', advice: 'wf hold r --off', onYou: false };
  const held = step('held', 'needs-human', { blockedByHarness: true });
  const blocked = step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' });
  // Unheld, each is offered: the hold is the only thing refusing them.
  assert.equal(offersOf(run([held, blocked], ['implement'])).length, 2);
  assert.deepEqual(offersOf({ ...run([held, blocked], ['implement']), holding }), []);
  assert.deepEqual(answersOf({ ...run([held, blocked], ['implement']), holding }), []);
  // An api older than the hold sends no `holding` at all, and a run it does not hold `null`: both are offered as before.
  assert.equal(offersOf({ ...run([held], []), holding: null }).length, 1);
});
