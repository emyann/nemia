/**
 * Nemia's machine, pure: the keeper's decision table (`nemiaDue`, `nemiaState`) — what it owes at each state, a task stopped from outside
 * never filed again, a sayCustom, a sayOutbox and an ask carried only while she is kept and up — her custom words judged changed and the
 * words said to her, a word that is no level, her task's id, her diagram drawing each edge and each verb, her selectors waking her alone on
 * a denied call, and her settings turning the daemon's start off. The keeper acting on the table, on the engine's stand-in, is told in
 * `test/nemia-keeper.test.ts`.
 */
import { afterAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { DEFAULT_SELECTORS } from '../subscription/index.ts';
import { parseSelectors, selects } from '../watch/selector.ts';
import { DEMAND_OFF } from '../demand/demand.ts';
import { DENIED, LINE_WORDS, upgraded } from '../feed/index.ts';
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
  folderUnmade,
  trustRefused,
  type HerSubscription,
  type HerTask,
  type Keeping,
} from './nemia.ts';

const SEMI: Keeping = { above: true, task: 'nemia-1' };
const MANUAL: Keeping = { above: false, task: 'nemia-1' };
const HERS: HerSubscription = { task: 'nemia-1', scoped: true, selected: true };
const OLDER: HerSubscription = { task: 'nemia-0', scoped: true, selected: true };
const UNSCOPED: HerSubscription = { task: 'nemia-1', scoped: false, selected: true };
const UNSELECTED: HerSubscription = { task: 'nemia-1', scoped: true, selected: false };
const OPEN: HerTask = { settled: false, stopRequested: false };
const SETTLED: HerTask = { settled: true, stopRequested: false };
const STOPPING: HerTask = { settled: false, stopRequested: true };

describe('`nemiaDue` and `nemiaState`: what the keeper owes, and where she stands, at each state', () => {
  test('a filing, then a subscription, then nothing, while some factory is above manual', () => {
    assert.deepEqual(nemiaDue(SEMI, undefined, undefined), ['file']);
    assert.deepEqual(nemiaDue(SEMI, OPEN, undefined), ['subscribe']);
    assert.deepEqual(nemiaDue(SEMI, OPEN, HERS), []);
    assert.equal(nemiaState(SEMI, OPEN, HERS), 'kept');
    assert.deepEqual(nemiaDue(SEMI, OPEN, OLDER), ['drop', 'subscribe'], 'a subscription left for an older task is put again');
  });
  test('a changed custom instruction is told while she is kept, and in no other state', () => {
    const STALE: Keeping = { ...SEMI, stale: true };
    assert.deepEqual(nemiaDue(STALE, OPEN, HERS), ['sayCustom']);
    assert.deepEqual(nemiaDue({ ...SEMI, stale: false }, OPEN, HERS), [], 'her filed words are the ones that compose now');
    assert.deepEqual(nemiaDue(STALE, OPEN, undefined), ['subscribe'], 'filed: subscribed first, told on a later beat');
    assert.deepEqual(nemiaDue(STALE, OPEN, OLDER), ['drop', 'subscribe']);
    assert.deepEqual(nemiaDue(STALE, undefined, undefined), ['file'], 'due: filed with the words that compose now');
    for (const task of [SETTLED, STOPPING]) assert.deepEqual(nemiaDue(STALE, task, HERS), ['drop'], 'stopped: nothing to tell');
    assert.deepEqual(nemiaDue({ ...MANUAL, stale: true }, OPEN, HERS), ['stop', 'drop'], 'leaving: stopped, not told');
  });
  test("REFUSED: the person's chat words are delivered only while she is kept and her session is live", () => {
    const OWED = { ...SEMI, owed: true, up: true };
    assert.deepEqual(nemiaDue(OWED, OPEN, HERS), ['sayOutbox']);
    assert.deepEqual(nemiaDue({ ...OWED, stale: true }, OPEN, HERS), ['sayCustom', 'sayOutbox'], 'told first, then delivered');
    assert.deepEqual(nemiaDue({ ...OWED, up: false }, OPEN, HERS), [], 'kept but down: kept for later');
    assert.deepEqual(nemiaDue({ ...OWED, owed: false }, OPEN, HERS), [], 'nothing owed');
    assert.deepEqual(nemiaDue(OWED, OPEN, undefined), ['subscribe'], 'filed: not yet kept');
    assert.deepEqual(nemiaDue({ ...OWED, trusted: false }, undefined, undefined), ['trust', 'file'], 'untrusted: trusted, then filed');
    assert.deepEqual(nemiaDue({ ...MANUAL, owed: true, up: true }, OPEN, HERS), ['stop', 'drop'], 'leaving');
  });
  test('REFUSED: a question of hers is written down and its answer carried only while she is kept and her session is live', () => {
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
  test('REFUSED: a subscription of hers without her floor is no keeping; it is dropped and put again with it', () => {
    assert.equal(nemiaState(SEMI, OPEN, UNSCOPED), 'filed');
    assert.deepEqual(nemiaDue(SEMI, OPEN, UNSCOPED), ['drop', 'subscribe']);
  });
  test('REFUSED: a subscription of hers put before a selector of hers was added is no keeping; it is put again with them', () => {
    assert.equal(nemiaState(SEMI, OPEN, UNSELECTED), 'filed');
    assert.deepEqual(nemiaDue(SEMI, OPEN, UNSELECTED), ['drop', 'subscribe']);
  });
  test('REFUSED: a task stopped or ended from outside is never filed again at semi-auto; a subscription left is dropped', () => {
    for (const task of [SETTLED, STOPPING]) {
      assert.equal(nemiaState(SEMI, task, undefined), 'stopped');
      assert.deepEqual(nemiaDue(SEMI, task, undefined), []);
      assert.deepEqual(nemiaDue(SEMI, task, HERS), ['drop']);
    }
  });
  test('with no factory above manual, her open task is stopped and her subscription dropped; with neither, nothing is owed', () => {
    assert.deepEqual(nemiaDue(MANUAL, OPEN, HERS), ['stop', 'drop']);
    assert.equal(nemiaState(MANUAL, OPEN, HERS), 'leaving');
    assert.deepEqual(nemiaDue(MANUAL, STOPPING, HERS), ['drop'], 'a stop asked is not asked again');
    assert.deepEqual(nemiaDue(MANUAL, SETTLED, undefined), []);
    assert.deepEqual(nemiaDue({ above: false }, undefined, undefined), [], 'no level set is manual');
    assert.equal(nemiaState({ above: false }, undefined, undefined), 'off');
  });
  test('her folder not trusted owes its trust, then her filing, in the same beat; a harness that keeps no trust is filed; a running session is never touched', () => {
    const UNTRUSTED: Keeping = { ...SEMI, trusted: false };
    assert.equal(nemiaState(UNTRUSTED, undefined, undefined), 'untrusted');
    assert.deepEqual(nemiaDue(UNTRUSTED, undefined, undefined), ['trust', 'file'], 'the keeper trusts her own folder, then files her');
    assert.deepEqual(nemiaDue(UNTRUSTED, undefined, OLDER), ['trust', 'file'], 'a subscription left is put again once she is filed');
    assert.deepEqual(nemiaDue({ ...SEMI, trusted: true }, undefined, undefined), ['file']);
    assert.deepEqual(nemiaDue(SEMI, undefined, undefined), ['file'], 'a harness that keeps no trust');
    assert.equal(nemiaState(UNTRUSTED, OPEN, undefined), 'filed', 'trust lost later never stops a running session');
    assert.deepEqual(
      nemiaDue(UNTRUSTED, OPEN, undefined),
      ['subscribe'],
      'and owes no trust: her folder is trusted again only to file her',
    );
    assert.equal(nemiaState(UNTRUSTED, OPEN, HERS), 'kept');
    assert.equal(nemiaState({ above: false, trusted: false }, undefined, undefined), 'off', 'manual: nothing waits');
    assert.deepEqual(nemiaDue({ above: false, trusted: false }, undefined, undefined), [], 'manual: nothing is trusted');
  });
});

describe('`customChanged` and `toldCustom`: her custom words changed are those she was not last filed or told with, and are told whole', () => {
  const FILED = 'Her shipped instruction.\n\nAnswer in French.\n';
  test('her shipped instruction is never compared: the same words under another instruction are no change', () => {
    assert.equal(customChanged({ words: 'Answer in French.' }, 'Answer in French.', 'Another instruction.\n'), false);
    assert.equal(customChanged({}, undefined, 'Another instruction.\n\nOnce a paragraph of hers.\n'), false);
  });
  test('a record of what she was told: other words, words removed and words added are each a change', () => {
    assert.equal(customChanged({ words: 'Answer in French.' }, 'Answer in Dutch.', FILED), true);
    assert.equal(customChanged({ words: 'Answer in French.' }, undefined, FILED), true, 'removed: told');
    assert.equal(customChanged({}, 'Answer in French.', FILED), true, 'added: told');
  });
  test('no record: judged by the words her instruction ends with, and never a removal', () => {
    assert.equal(customChanged(undefined, 'Answer in French.', FILED), false, 'no record: her instruction ends with them');
    assert.equal(customChanged(undefined, 'Answer in Dutch.', FILED), true, 'no record: it ends with others');
    assert.equal(customChanged(undefined, 'Answer in Dutch.', undefined), true, 'no record and no instruction');
    assert.equal(customChanged(undefined, undefined, FILED), false, 'no record: whether she had words is unknown, so no removal');
  });
  test("the words that tell her carry the person's new words whole, or say she has none", () => {
    const told = toldCustom('Answer in French.\nTimes in Montreal.');
    assert.ok(told.includes('Answer in French.\nTimes in Montreal.'), told);
    assert.match(told, /replac/);
    const cleared = toldCustom(undefined);
    assert.match(cleared, /removed/);
    assert.match(cleared, /none/);
  });
});

describe('`levelRefusal`: manual, semi-auto and auto are levels; a word that is none is refused, naming the command', () => {
  for (const level of ['manual', 'semi-auto', 'auto'])
    test(`${level} is a level`, () => {
      assert.equal(levelRefusal(level), undefined);
    });
  test('REFUSED: "on" is no level', () => {
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
  assert.ok(drawn.includes('  untrusted --> filed: TRUST_WRITTEN / trust, file'), 'the keeper trusts her folder and files her in one beat');
  assert.ok(drawn.includes('  untrusted --> untrusted: TRUST_REFUSED / trust'), 'a refused write is tried again each beat');
  assert.ok(
    graph.verbs.every((v) => v.guard === 'always'),
    'no verb of the person asks her folder trusted',
  );
});

test("a factory's level changed wakes her, and only her — her selectors name reason=LevelChanged, which the default does not", () => {
  const level = upgraded({
    at: '2026-11-05T13:00:00.000Z',
    store: 'store',
    word: LINE_WORDS.LevelChanged,
    note: 'acme is at auto',
    involved: { kind: 'Store', name: 'store' },
    labels: { factory: 'acme' },
  });
  assert.deepEqual([level.reason, level.source, level.waits], ['LevelChanged', 'person', undefined], "a person's deed, waiting on nobody");
  assert.equal(selects(parseSelectors([...NEMIA_SELECTORS]), level), true, 'she is told of a raise as of a gate');
  assert.equal(selects(parseSelectors([...DEFAULT_SELECTORS]), level), false, 'and nobody else is woken');
});

test("a factory's conflicts pending wake her, and only her — her selectors name reason=ConflictsPending, which the default does not", () => {
  const pending = upgraded({
    at: '2026-11-11T13:00:00.000Z',
    factory: 'acme',
    word: LINE_WORDS.ConflictsPending,
    note: 'RULES.md:1-1: choose one',
    involved: { kind: 'Factory', name: 'acme' },
    labels: { factory: 'acme' },
  });
  assert.deepEqual(
    [pending.reason, pending.type, pending.waits],
    ['ConflictsPending', 'Normal', undefined],
    'a wait on a person by her selector, not by waits',
  );
  assert.equal(selects(parseSelectors([...NEMIA_SELECTORS]), pending), true, 'she is told of an upgrade waiting on a choice');
  assert.equal(selects(parseSelectors([...DEFAULT_SELECTORS]), pending), false, 'and nobody else is woken');
  const settled = upgraded({
    at: '2026-11-11T14:00:00.000Z',
    factory: 'acme',
    word: LINE_WORDS.ConflictsSettled,
    involved: { kind: 'Factory', name: 'acme' },
    labels: { factory: 'acme' },
  });
  assert.equal(selects(parseSelectors([...NEMIA_SELECTORS]), settled), false, 'their settling is routine news, in her digest');
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
  assert.deepEqual(
    [...NEMIA_SELECTORS],
    ['waits=person', 'reason=ToolDenied', 'reason=LevelChanged', 'reason=ConflictsPending'],
    'four lines a person reads in her record',
  );
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

describe("`trustRefused` and `folderUnmade`: each refusal of her folder's trust names what to mend, and offers no command to run the harness by hand", () => {
  const not = { harness: 'Claude Code', folder: '/store/nemia', file: '/home/me/.claude.json', never: null, refused: null };
  const hand = 'run Claude Code in /store/nemia once and accept its prompt';
  const rows: [string, string][] = [
    [
      'a file that did not read',
      trustRefused({ ...not, refused: `/home/me/.claude.json was left as it is, since it is not JSON: ${hand}` }),
    ],
    [
      'a file whose projects entry is no object',
      trustRefused({ ...not, refused: `/home/me/.claude.json was left as it is, since its \`projects\` is no object: ${hand}` }),
    ],
    [
      'a file that changed under every write',
      trustRefused({
        ...not,
        refused: `/home/me/.claude.json changed under each of 5 writes and was left as it is: ask again, or ${hand}`,
      }),
    ],
    ['a file that did not take the trust, the runtime saying nothing', trustRefused(not)],
    ['a write that threw', trustRefused(not, 'EACCES: permission denied')],
    ['a folder the harness never keeps a trust of', trustRefused({ ...not, never: 'Claude Code keeps no trust of a home directory' })],
    ['her folder that could not be made', folderUnmade('/store/nemia', 'EACCES: permission denied, mkdir')],
  ];
  for (const [row, words] of rows)
    test(row, () => {
      assert.ok(words.includes('/store/nemia'), 'her folder named');
      assert.doesNotMatch(words, /&&|\bcd |mkdir -p|accept its prompt|in a terminal/, 'no command to run by hand');
    });
  afterAll(() => {
    assert.ok(rows[0]?.[1].includes('it is not JSON'), "the runtime's reason carried");
    assert.ok(rows[1]?.[1].includes('`projects` is no object'), 'a file that parses but whose entry is no object says so');
    assert.ok(rows[2]?.[1].includes('changed under each of 5 writes'), 'a file that changed under every write says so');
    assert.ok(
      rows.slice(0, 5).every(([, words]) => words.includes(not.file)),
      "the harness's file named where it is what to mend",
    );
    assert.ok(rows[4]?.[1].includes('EACCES'), 'what the write threw said');
    assert.ok(rows[5]?.[1].includes('WF_ROOT'), 'the store moved, where her folder is the home directory');
    assert.ok(!rows[6]?.[1].includes(not.file), "her folder unmade sends no one to the harness's file");
  });
});
