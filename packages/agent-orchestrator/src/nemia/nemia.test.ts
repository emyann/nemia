/**
 * Nemia's machine, pure: the keeper's decision table (`nemiaDue`, `nemiaState`) — what it owes at each state, a task stopped from outside
 * never filed again, a tell, a delivery and an ask carried only while she is kept and up — her custom words judged changed and the words
 * that tell her, a word that is no level, her task's id, her diagram drawing each edge and each verb, her selectors waking her alone on
 * a denied call, and her settings turning the daemon's start off. The keeper acting on the table, on the engine's stand-in, is told in
 * `test/nemia-keeper.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SELECTORS } from '../subscription/index.ts';
import { parseSelectors, selects } from '../watch/selector.ts';
import { DEMAND_OFF } from '../demand/demand.ts';
import { DENIED, upgraded } from '../feed/index.ts';
import { names } from '../../test/assessed.ts';
import {
  NEMIA_SELECTORS,
  customChanged,
  levelRefusal,
  nemiaDiagram,
  nemiaDue,
  nemiaGraph,
  nemiaSettings,
  nemiaState,
  nemiaTaskId,
  toldCustom,
  type HerSubscription,
  type HerTask,
  type Keeping,
} from './nemia.ts';

const SEMI: Keeping = { above: true, task: 'nemia-1' };
const MANUAL: Keeping = { above: false, task: 'nemia-1' };
const HERS: HerSubscription = { task: 'nemia-1', scoped: true };
const OLDER: HerSubscription = { task: 'nemia-0', scoped: true };
const UNSCOPED: HerSubscription = { task: 'nemia-1', scoped: false };
const OPEN: HerTask = { settled: false, stopRequested: false };
const SETTLED: HerTask = { settled: true, stopRequested: false };
const STOPPING: HerTask = { settled: false, stopRequested: true };

test('`nemiaDue` and `nemiaState`: what the keeper owes, and where she stands, at each state', async (t) => {
  await t.test('a filing, then a subscription, then nothing, while some factory is above manual', () => {
    assert.deepEqual(nemiaDue(SEMI, undefined, undefined), ['file']);
    assert.deepEqual(nemiaDue(SEMI, OPEN, undefined), ['subscribe']);
    assert.deepEqual(nemiaDue(SEMI, OPEN, HERS), []);
    assert.equal(nemiaState(SEMI, OPEN, HERS), 'kept');
    assert.deepEqual(nemiaDue(SEMI, OPEN, OLDER), ['drop', 'subscribe'], 'a subscription left for an older task is put again');
  });
  await t.test('a changed custom instruction is told while she is kept, and in no other state', () => {
    const STALE: Keeping = { ...SEMI, stale: true };
    assert.deepEqual(nemiaDue(STALE, OPEN, HERS), ['tell']);
    assert.deepEqual(nemiaDue({ ...SEMI, stale: false }, OPEN, HERS), [], 'her filed words are the ones that compose now');
    assert.deepEqual(nemiaDue(STALE, OPEN, undefined), ['subscribe'], 'filed: subscribed first, told on a later beat');
    assert.deepEqual(nemiaDue(STALE, OPEN, OLDER), ['drop', 'subscribe']);
    assert.deepEqual(nemiaDue(STALE, undefined, undefined), ['file'], 'due: filed with the words that compose now');
    for (const task of [SETTLED, STOPPING]) assert.deepEqual(nemiaDue(STALE, task, HERS), ['drop'], 'stopped: nothing to tell');
    assert.deepEqual(nemiaDue({ ...MANUAL, stale: true }, OPEN, HERS), ['stop', 'drop'], 'leaving: stopped, not told');
  });
  await t.test("REFUSED: the person's chat words are delivered only while she is kept and her session is live", () => {
    const OWED = { ...SEMI, owed: true, up: true };
    assert.deepEqual(nemiaDue(OWED, OPEN, HERS), ['deliver']);
    assert.deepEqual(nemiaDue({ ...OWED, stale: true }, OPEN, HERS), ['tell', 'deliver'], 'told first, then delivered');
    assert.deepEqual(nemiaDue({ ...OWED, up: false }, OPEN, HERS), [], 'kept but down: kept for later');
    assert.deepEqual(nemiaDue({ ...OWED, owed: false }, OPEN, HERS), [], 'nothing owed');
    assert.deepEqual(nemiaDue(OWED, OPEN, undefined), ['subscribe'], 'filed: not yet kept');
    assert.deepEqual(nemiaDue({ ...OWED, trusted: false }, undefined, undefined), [], 'untrusted');
    assert.deepEqual(nemiaDue({ ...MANUAL, owed: true, up: true }, OPEN, HERS), ['stop', 'drop'], 'leaving');
  });
  await t.test('REFUSED: a question of hers is written down and its answer carried only while she is kept and her session is live', () => {
    const ASKING = { ...SEMI, asking: true, up: true };
    assert.deepEqual(nemiaDue(ASKING, OPEN, HERS), ['record']);
    assert.deepEqual(nemiaDue({ ...ASKING, asking: false }, OPEN, HERS), [], 'her view holds no question: nothing to write down');
    assert.deepEqual(nemiaDue({ ...ASKING, up: false }, OPEN, HERS), [], 'kept but down: no session holds a question open');
    assert.deepEqual(nemiaDue({ ...ASKING, answered: true }, OPEN, HERS), ['record', 'answer'], 'written down first, then answered');
    assert.deepEqual(nemiaDue({ ...SEMI, answered: true, up: true }, OPEN, HERS), ['answer'], 'an answer owed of a question gone');
    assert.deepEqual(nemiaDue({ ...SEMI, answered: true, asking: true }, OPEN, HERS), [], 'down: carried on a later beat');
    assert.deepEqual(nemiaDue({ ...ASKING, answered: true }, OPEN, undefined), ['subscribe'], 'filed: not yet kept');
    assert.deepEqual(nemiaDue({ ...MANUAL, asking: true, answered: true, up: true }, OPEN, HERS), ['stop', 'drop'], 'leaving');
    assert.deepEqual(
      nemiaDue({ ...SEMI, closing: true, up: true }, OPEN, HERS),
      ['record'],
      'her view holds no question, and the chat holds one whose call is gone: the beat runs to mark what became of it',
    );
    assert.deepEqual(nemiaDue({ ...SEMI, closing: false, up: true }, OPEN, HERS), [], 'nothing open and nothing to mark');
    assert.deepEqual(nemiaDue({ ...SEMI, closing: true, up: false }, OPEN, HERS), [], 'down: the world is read again when she is up');
  });
  await t.test('REFUSED: a subscription of hers without her floor is no keeping; it is dropped and put again with it', () => {
    assert.equal(nemiaState(SEMI, OPEN, UNSCOPED), 'filed');
    assert.deepEqual(nemiaDue(SEMI, OPEN, UNSCOPED), ['drop', 'subscribe']);
  });
  await t.test('REFUSED: a task stopped or ended from outside is never filed again at semi-auto; a subscription left is dropped', () => {
    for (const task of [SETTLED, STOPPING]) {
      assert.equal(nemiaState(SEMI, task, undefined), 'stopped');
      assert.deepEqual(nemiaDue(SEMI, task, undefined), []);
      assert.deepEqual(nemiaDue(SEMI, task, HERS), ['drop']);
    }
  });
  await t.test('with no factory above manual, her open task is stopped and her subscription dropped; with neither, nothing is owed', () => {
    assert.deepEqual(nemiaDue(MANUAL, OPEN, HERS), ['stop', 'drop']);
    assert.equal(nemiaState(MANUAL, OPEN, HERS), 'leaving');
    assert.deepEqual(nemiaDue(MANUAL, STOPPING, HERS), ['drop'], 'a stop asked is not asked again');
    assert.deepEqual(nemiaDue(MANUAL, SETTLED, undefined), []);
    assert.deepEqual(nemiaDue({ above: false }, undefined, undefined), [], 'no level set is manual');
    assert.equal(nemiaState({ above: false }, undefined, undefined), 'off');
  });
  await t.test(
    'REFUSED: no task is filed while her folder is not trusted; once it is, or for a harness that keeps no trust, she is filed',
    () => {
      const UNTRUSTED: Keeping = { ...SEMI, trusted: false };
      assert.equal(nemiaState(UNTRUSTED, undefined, undefined), 'untrusted');
      assert.deepEqual(nemiaDue(UNTRUSTED, undefined, undefined), [], 'her session waits for the person to trust her folder');
      assert.deepEqual(nemiaDue(UNTRUSTED, undefined, OLDER), [], 'nothing owed while she waits');
      assert.deepEqual(nemiaDue({ ...SEMI, trusted: true }, undefined, undefined), ['file']);
      assert.deepEqual(nemiaDue(SEMI, undefined, undefined), ['file'], 'a harness that keeps no trust');
      assert.equal(nemiaState(UNTRUSTED, OPEN, undefined), 'filed', 'trust lost later never stops a running session');
      assert.equal(nemiaState(UNTRUSTED, OPEN, HERS), 'kept');
      assert.equal(nemiaState({ above: false, trusted: false }, undefined, undefined), 'off', 'manual: nothing waits');
    },
  );
});

test('`customChanged` and `toldCustom`: her custom words changed are those she was not last filed or told with, and are told whole', async (t) => {
  const FILED = 'Her shipped instruction.\n\nAnswer in French.\n';
  await t.test('her shipped instruction is never compared: the same words under another instruction are no change', () => {
    assert.equal(customChanged({ words: 'Answer in French.' }, 'Answer in French.', 'Another instruction.\n'), false);
    assert.equal(customChanged({}, undefined, 'Another instruction.\n\nOnce a paragraph of hers.\n'), false);
  });
  await t.test('a record of what she was told: other words, words removed and words added are each a change', () => {
    assert.equal(customChanged({ words: 'Answer in French.' }, 'Answer in Dutch.', FILED), true);
    assert.equal(customChanged({ words: 'Answer in French.' }, undefined, FILED), true, 'removed: told');
    assert.equal(customChanged({}, 'Answer in French.', FILED), true, 'added: told');
  });
  await t.test('no record: judged by the words her instruction ends with, and never a removal', () => {
    assert.equal(customChanged(undefined, 'Answer in French.', FILED), false, 'no record: her instruction ends with them');
    assert.equal(customChanged(undefined, 'Answer in Dutch.', FILED), true, 'no record: it ends with others');
    assert.equal(customChanged(undefined, 'Answer in Dutch.', undefined), true, 'no record and no instruction');
    assert.equal(customChanged(undefined, undefined, FILED), false, 'no record: whether she had words is unknown, so no removal');
  });
  await t.test("the words that tell her carry the person's new words whole, or say she has none", () => {
    const told = toldCustom('Answer in French.\nTimes in Montreal.');
    assert.ok(told.includes('Answer in French.\nTimes in Montreal.'), told);
    assert.match(told, /replac/);
    const cleared = toldCustom(undefined);
    assert.match(cleared, /removed/);
    assert.match(cleared, /none/);
  });
});

test('`levelRefusal`: manual, semi-auto and auto are levels; a word that is none is refused, naming the command', async (t) => {
  for (const level of ['manual', 'semi-auto', 'auto'])
    await t.test(`${level} is a level`, () => {
      assert.equal(levelRefusal(level), undefined);
    });
  await t.test('REFUSED: "on" is no level', () => {
    names(levelRefusal('on'), '"on"', 'nemia level [manual|semi-auto|auto]', '--factory <name>', '--for <duration>', '--end');
  });
});

test("her task's id is nemia- and the digits of the moment a factory was put above manual", () => {
  assert.equal(nemiaTaskId('2026-10-05T16:27:03.120Z'), 'nemia-20261005162703120');
});

test('her diagram draws every edge and each verb from every state it is taken from', () => {
  const graph = nemiaGraph();
  const drawn = nemiaDiagram(graph).split('\n');
  assert.equal(drawn[0], 'stateDiagram-v2');
  for (const e of graph.edges) assert.ok(drawn.includes(`  ${e.from} --> ${e.to}: ${e.event} / ${e.action}`), e.event);
  for (const v of graph.verbs)
    for (const from of v.from) assert.ok(drawn.includes(`  ${from} --> ${v.to}: ${v.verb} [${v.guard}] (by ${v.by})`), v.verb);
  assert.deepEqual(
    graph.verbs.map((v) => v.verb),
    ['level (a factory above manual)', 'level (none above manual)', 'agents custom nemia (set or clear)'],
  );
  assert.ok(drawn.includes('  kept --> kept: CUSTOM_CHANGED / tell'));
  assert.ok(drawn.includes('  untrusted --> due: FOLDER_TRUSTED / nothing'));
  assert.ok(
    graph.verbs.every((v) => v.guard === 'always'),
    'no verb of the person asks her folder trusted',
  );
});

test("REFUSED: a step's denied call wakes her, and only her — her selectors name reason=ToolDenied, which the default does not", () => {
  const shot = upgraded({
    at: '2026-10-05T16:00:00.000Z',
    run: 'r-1',
    step: 'build',
    word: 'denied: Bash(git push)',
    note: 'try 2',
    involved: { kind: 'Step', name: 'r-1/build' },
    labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'build', agent: 'ada' },
    call: 'Bash(git push)',
    try: 2,
  });
  assert.equal(shot.reason, 'ToolDenied', 'a denial is a signal of its own');
  assert.equal(selects(parseSelectors([...NEMIA_SELECTORS]), shot), true, 'she is told of every denial at once');
  assert.equal(selects(parseSelectors([...DEFAULT_SELECTORS]), shot), false, 'and nobody else is woken, as nobody is today');
  assert.ok(shot.word.startsWith(DENIED), `the one-shot's word leads with ${JSON.stringify(DENIED)}, and her selector reads its reason`);
  assert.deepEqual([...NEMIA_SELECTORS], ['waits=person', 'reason=ToolDenied'], 'two lines a person reads in her record');
  assert.equal(shot.waits, undefined, 'a denial waits on nobody: the step runs on');
});

test('a nemia she types starts no daemon beside the one that keeps her, with a bin of its own or none', () => {
  const rules = { ask: ['Bash(nemia cancel:*)'], deny: [] };
  assert.deepEqual(JSON.parse(nemiaSettings(rules, undefined, '/usr/bin')).env, { [DEMAND_OFF]: 'off' });
  assert.deepEqual(JSON.parse(nemiaSettings(rules, '/srv/nemia/bin', '/usr/bin:/srv/nemia/bin')).env, {
    [DEMAND_OFF]: 'off',
    PATH: '/srv/nemia/bin:/usr/bin',
  });
});
