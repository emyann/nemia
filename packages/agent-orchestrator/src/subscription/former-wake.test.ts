/**
 * The conversion of a stored wake list to selectors (`former-wake.ts`): what each of the eight shipped words was selecting, the two lists
 * a store holds today, the subsumption that makes them read as they did, a word the table does not know, and the refusal of the retired
 * flags. Pure: it needs no stand-in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMER_DEFAULT_WAKE,
  FORMER_NEMIA_WAKE,
  FORMER_WAKE,
  retiredWakeRefusal,
  selectorsOfWake,
} from './former-wake.ts';
import { NEMIA_SELECTORS } from '../nemia/nemia.ts';
import { DEFAULT_SELECTORS } from './subscription.ts';
import { REASON_CODES } from '../feed/index.ts';
import { selectorsRefusal } from '../watch/selector.ts';

/** Every subset of the eight shipped words, the empty one included: 256 lists a store could hold. */
const SUBSETS: readonly string[][] = Array.from({ length: 1 << FORMER_NEMIA_WAKE.length }, (_, mask) =>
  FORMER_NEMIA_WAKE.filter((_word, i) => (mask & (1 << i)) !== 0),
);

test('each shipped word converts to what it was selecting, and a word with no reason to the wait a note carried', () => {
  assert.deepEqual(selectorsOfWake(['awaiting approval']).selectors, ['reason=AwaitingApproval']);
  assert.deepEqual(selectorsOfWake(['rounds exhausted']).selectors, ['reason=RoundsExhausted']);
  assert.deepEqual(selectorsOfWake(['needs-human']).selectors, ['reason=NeedsHuman']);
  assert.deepEqual(selectorsOfWake(['blocked']).selectors, ['reason=Blocked']);
  assert.deepEqual(selectorsOfWake(['denied:']).selectors, ['reason=ToolDenied']);
  assert.deepEqual(selectorsOfWake(['waiting on you:']).selectors, ['waits=person']);
  assert.deepEqual(selectorsOfWake(['needs:']).selectors, ['waits=person']);
  assert.deepEqual(
    selectorsOfWake(['failed']).selectors,
    ['reason in (Failed,CheckFailed)'],
    'one word was a substring of two words of the feed, and a reason that waits survives while waits=person is not there',
  );
  assert.deepEqual(selectorsOfWake([' BLOCKED ']).selectors, ['reason=Blocked'], 'a word is keyed as sortLine folded its case and spaces');
  assert.deepEqual(selectorsOfWake(['Needs:']).selectors, ['waits=person'], 'the note words too');
  assert.deepEqual(
    selectorsOfWake(['denied:', 'blocked']).selectors,
    ['reason in (Blocked,ToolDenied)'],
    'and the reasons of one list are one selector, in the table’s order whatever the order they were typed in',
  );
});

test('the two lists a store holds today convert to the selectors the package ships, which is what holds a record to its constant', () => {
  assert.deepEqual(selectorsOfWake(FORMER_DEFAULT_WAKE), { selectors: [...DEFAULT_SELECTORS], unconverted: [] });
  assert.deepEqual(selectorsOfWake(FORMER_NEMIA_WAKE), { selectors: [...NEMIA_SELECTORS], unconverted: [] });
  assert.deepEqual([...NEMIA_SELECTORS], ['waits=person', 'reason=ToolDenied'], "her record reads as the intent words it");
});

test('a word the table does not know converts to nothing and is said; the rest of its list still converts', () => {
  assert.deepEqual(selectorsOfWake(['blocked', 'verified']), { selectors: ['reason=Blocked'], unconverted: ['verified'] });
  assert.deepEqual(selectorsOfWake(['verified']), { selectors: [], unconverted: ['verified'] }, 'a list of its own converts to nothing');
  assert.deepEqual(selectorsOfWake([]), { selectors: [], unconverted: [] }, 'and so does an empty list, which woke on no line');
});

test('every subset of the eight words converts to text the grammar takes, and every reason it names is one the feed has', () => {
  for (const subset of SUBSETS) {
    const { selectors } = selectorsOfWake(subset);
    assert.equal(selectorsRefusal(selectors), undefined, JSON.stringify(subset));
    for (const named of selectors.flatMap((one) => {
      const listed = /^reason in \(([^()]*)\)$/.exec(one);
      if (listed) return listed[1].split(',');
      const one0 = /^reason=(.*)$/.exec(one);
      return one0 ? [one0[1]] : [];
    }))
      assert.ok((REASON_CODES as readonly string[]).includes(named), `${named} is no reason of the feed`);
  }
  assert.equal(SUBSETS.length, 256, 'the eight words the package ever shipped');
  assert.deepEqual(Object.keys(FORMER_WAKE).length, 8, 'and the table names each once');
});

test('REFUSED: each retired flag, by name, with the selector to type and the keys one takes; a flag the table does not know is none', () => {
  for (const command of ['nemia watch', 'nemia subscribe'])
    for (const arg of ['--wake', '--wake-word', '--wake=1', '--wake-word=blocked']) {
      const said = retiredWakeRefusal(command, arg) ?? '';
      assert.ok(said.startsWith(`${command} no longer takes ${arg.split('=')[0]}`), said);
      assert.match(said, /-l waits=person/);
      assert.match(said, /The keys: run, factory, workflow, step, agent, kind, reason, type, waits, source/);
    }
  assert.equal(retiredWakeRefusal('nemia watch', '--json'), undefined);
  assert.equal(retiredWakeRefusal('nemia watch', '--wakeful'), undefined, 'a flag that merely begins with one is not it');
});
