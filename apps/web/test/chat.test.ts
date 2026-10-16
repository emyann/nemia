/**
 * Nemia's chat where it is pure: the merge of her stream's events by their id, where she is as her face reads it, a step's state as a
 * trace line's, her steps folded into a turn, the links read out of her words, how an ask of hers is drawn and what is left of one,
 * the read-back words, and a message the api would not take, kept in this browser and sent once. Each rule with a fixture that breaks
 * it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  askAnswered,
  askLeft,
  asksOpen,
  CHAT_DOWN,
  changedChat,
  drawnAs,
  drawnAsk,
  foldChat,
  followChat,
  jumpWords,
  linksOf,
  mergeChatEvents,
  newFrom,
  newWords,
  presenceOf,
  readableFrom,
  traceStatusOf,
  turnWords,
  unreadChat,
  type ChatFollowed,
  type ChatItem,
  type ChatMessage,
  type ChatStep,
} from '../src/lib/chatFollowing.ts';
import { CHAT_OUTBOX_KEY, editKept, forgetKept, keepUnsent, parseKept, readKept, sendingOnce } from '../src/lib/chatOutbox.ts';
import { composerButton, composerWords } from '../src/lib/nemia.ts';
import { faceOf, UP, type Presence } from '../src/lib/presence.ts';
import type { StreamLike } from '../src/lib/following.ts';
import type { AskQuestion, ChatEvent, ChatPresence } from '../src/lib/api.ts';

const at = (second: number): string => new Date(Date.UTC(2026, 9, 15, 17, 40, second)).toISOString();

/** A message of hers, the person's or the keeper's. */
const message = (id: string, second: number, from: 'agent' | 'person' | 'keeper', text: string): ChatMessage => ({
  kind: 'message',
  id,
  at: at(second),
  from,
  text,
});

/** One step of hers. */
const step = (id: string, second: number, state: ChatStep['state'], sentence = 'Read the inbox'): ChatStep => ({
  kind: 'step',
  id,
  at: at(second),
  tool: 'Read',
  sentence,
  state,
});

const up: ChatPresence = { up: true, answering: false, waitsOnYou: 0, unread: 0 };

test('an event of her chat is replaced by its id alone: the same id twice is one event, the same words under two ids are two', () => {
  const first = mergeChatEvents([], [step('t:1:a', 1, 'running'), message('m:1:b', 2, 'agent', 'One.')]);
  const moved = mergeChatEvents(first, [step('t:1:a', 1, 'done')]);
  assert.deepEqual(
    moved.map((e) => e.id),
    ['t:1:a', 'm:1:b'],
    'the step is replaced where it stands, never drawn twice',
  );
  assert.equal((moved[0] as ChatStep).state, 'done', 'with its later state');
  const twice = mergeChatEvents([], [message('k:1:x', 3, 'keeper', 'Same words'), message('p:1:y', 4, 'person', 'Same words')]);
  assert.equal(twice.length, 2, 'the same words under two ids are two events');
});

test('REFUSED: a merge keyed by the kind beside the id, as a step transcript is, draws a step whose state moved twice', () => {
  const keyed = (known: readonly ChatEvent[], incoming: readonly ChatEvent[]): ChatEvent[] => {
    const merged = [...known];
    const where = new Map(merged.map((e, i) => [`${e.kind}:${e.id}:${JSON.stringify(e)}`, i]));
    for (const e of incoming) {
      const key = `${e.kind}:${e.id}:${JSON.stringify(e)}`;
      const i = where.get(key);
      if (i === undefined) merged.push(e);
      else merged[i] = e;
    }
    return merged;
  };
  const known = [step('t:1:a', 1, 'running')];
  assert.equal(keyed(known, [step('t:1:a', 1, 'done')]).length, 2, 'the mutant draws the step twice');
  assert.equal(mergeChatEvents(known, [step('t:1:a', 1, 'done')]).length, 1, 'the rule draws it once');
});

test("her presence is the api's, her level and this browser's kept message — and at manual she reads as down, whatever the api says", () => {
  assert.deepEqual(presenceOf(up, 'semi-auto', false), { waitsOnYou: 0, notSent: false, down: false, answering: false, unread: 0 });
  assert.equal(presenceOf(up, 'manual', false).down, true, 'at manual she has no session to be up');
  assert.equal(faceOf(presenceOf(up, 'manual', false)), 'sleepy');
  assert.equal(presenceOf({ ...up, up: false }, 'semi-auto', false).down, true);
  assert.equal(presenceOf(up, 'semi-auto', true).notSent, true, 'a message this browser kept is hers to say');
  assert.equal(faceOf(presenceOf(up, 'semi-auto', true)), 'unsure');
  const every: Presence = presenceOf({ up: true, answering: true, waitsOnYou: 2, unread: 3 }, 'manual', true);
  assert.deepEqual(every, { waitsOnYou: 2, notSent: true, down: true, answering: true, unread: 3 });
  assert.equal(faceOf(every), 'surprised', 'what waits on a person comes first in the owner’s order');
});

test('each state one of her steps can be in draws as a trace line says, and done draws plain', () => {
  const states: ChatStep['state'][] = ['done', 'running', 'error', 'pending', 'waits'];
  assert.deepEqual(
    states.map((state) => traceStatusOf(state)),
    [undefined, 'running', 'error', 'pending', 'yours'],
  );
  assert.notEqual(traceStatusOf('waits'), 'pending', 'a step that waits on a person is the look’s own state, never at rest');
});

test('her consecutive steps fold into one turn, in the order they came, and a turn with a step at work or waiting is running', () => {
  const folded = foldChat([
    message('p:1', 1, 'person', 'What is waiting on me?'),
    step('t:1:a', 2, 'done', 'Read the inbox'),
    step('t:1:b', 3, 'done', 'Read the factories'),
    step('t:1:c', 136, 'done', 'Read the runs that wait'),
    message('m:1:d', 140, 'agent', 'Two gates.'),
  ]);
  assert.deepEqual(
    folded.map((item) => item.kind),
    ['event', 'turn', 'event'],
  );
  const turn = folded[1] as Extract<ChatItem, { kind: 'turn' }>;
  assert.deepEqual(
    turn.steps.map((s) => s.sentence),
    ['Read the inbox', 'Read the factories', 'Read the runs that wait'],
    'the turn keeps the order they came in',
  );
  assert.equal(turn.running, false);
  assert.equal(turnWords(turn), 'Worked for 2m 14s · 3 steps');
  assert.equal(turnWords({ ms: 134_000, steps: turn.steps }), 'Worked for 2m 14s · 3 steps');
  assert.equal(turnWords({ ms: 134_000, steps: [turn.steps[0]] }), 'Worked for 2m 14s · 1 step');
  const live = foldChat([step('t:1:a', 2, 'done'), step('t:1:b', 3, 'running')])[0] as Extract<ChatItem, { kind: 'turn' }>;
  assert.equal(live.running, true, 'a turn whose step is at work is still running');
  assert.equal(
    (foldChat([step('t:1:a', 2, 'waits')])[0] as Extract<ChatItem, { kind: 'turn' }>).running,
    true,
    'and one whose step waits on a person',
  );
  const apart = foldChat([step('t:1:a', 2, 'done'), message('m:1:b', 3, 'agent', 'Done.'), step('t:1:c', 4, 'done')]);
  assert.equal(apart.filter((item) => item.kind === 'turn').length, 2, 'steps either side of her words are two turns');
});

test('the read-back words say how many are new, and the line is drawn over the first of her messages the person has not read', () => {
  assert.equal(jumpWords(2), '2 new · Jump to the latest');
  assert.equal(jumpWords(1), '1 new · Jump to the latest');
  assert.equal(newWords(2), '2 new');
  assert.equal(newWords(1), '1 new');
  const events = [
    message('m:1:a', 1, 'agent', 'One.'),
    message('p:1:b', 2, 'person', 'Mine.'),
    message('m:1:c', 3, 'agent', 'Two.'),
    message('m:1:d', 4, 'agent', 'Three.'),
  ];
  assert.equal(newFrom(events, 2), 'm:1:c', "the person's own message is never counted unread");
  assert.equal(newFrom(events, 0), null);
  assert.equal(newFrom(events, 9), null, 'a page holding fewer of hers than the api counts draws no line');
  assert.equal(readableFrom(events), 'm:1:d', 'the mark is posted through her latest');
  assert.equal(readableFrom([message('p:1:b', 2, 'person', 'Mine.')]), null, 'and through nothing where she has said nothing');
});

test('a link of hers to a page of the board is taken out of the sentence and named beside it; one that leaves the board stays in it', () => {
  const read = linksOf('Two gates. [Read the review](/runs/r-1) and [Read the design](/runs/r-2).');
  assert.equal(read.text, 'Two gates. Read the review and Read the design.', 'the sentence reads plain');
  assert.deepEqual(read.links, [
    { words: 'Read the review', href: '/runs/r-1' },
    { words: 'Read the design', href: '/runs/r-2' },
  ]);
  const away = linksOf('[Open the pull request](https://example.test/pr/25)');
  assert.deepEqual(away.links, [], 'a button through the router leads to a route, and that is none');
  assert.equal(away.text, '[Open the pull request](https://example.test/pr/25)', 'so it is left for Markdown to draw');
  const refused = linksOf('[Run it](javascript:doIt)');
  assert.deepEqual(refused.links, []);
  assert.equal(refused.text, '[Run it](javascript:doIt)', 'and so is one whose address Markdown empties');
  const relative = linksOf('[Open it](//evil.test/x)');
  assert.deepEqual(relative.links, [], 'a protocol-relative address is no route of this board, whatever its first character');
  assert.equal(relative.text, '[Open it](//evil.test/x)', 'so it too is left in her words');
  assert.deepEqual(linksOf('Nothing to open here.'), { text: 'Nothing to open here.', links: [] });
});

/** An EventSource as far as `followChat` uses it: its state, the events it sends, and `close`. */
class Stream implements StreamLike {
  readyState = 1;
  readonly #target = new EventTarget();
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.#target.addEventListener(type, listener as EventListener);
  }
  close() {
    this.readyState = 2;
  }
  send(type: string, data: object, id?: string) {
    this.#target.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data), ...(id === undefined ? {} : { lastEventId: id }) }));
  }
  fire(type: string) {
    this.#target.dispatchEvent(new Event(type));
  }
}

/** Her chat followed on a fresh stream, flushed at once, and what the page holds after each event. */
function followed() {
  let state: ChatFollowed = { ...unreadChat(false), live: true };
  const stream = new Stream();
  const stop = followChat(
    stream,
    (change) => {
      state = change(state);
    },
    { request: (flush) => (flush(), 0), cancel: () => {} },
  );
  return { stream, now: () => state, stop };
}

test("her stream's frames reach the page: presence replaces where she is, a chat event merges by its id, and the cursor moves", () => {
  const { stream, now, stop } = followed();
  assert.deepEqual(now().presence, CHAT_DOWN);
  stream.send('presence', up, '1.0.0.0.0');
  assert.deepEqual(now().presence, up);
  assert.equal(now().cursor, '1.0.0.0.0');
  stream.send('chat', step('t:1:a', 1, 'running'), '1.1.0.0.0');
  stream.send('chat', step('t:1:a', 1, 'done'), '1.2.0.0.0');
  assert.equal(now().events.length, 1, 'the step is one event, its state moved');
  assert.equal((now().events[0] as ChatStep).state, 'done');
  assert.equal(now().cursor, '1.2.0.0.0');
  stream.send('unreadable', { error: 'Her chat is unreadable.', retrying: true });
  assert.match(String(now().error), /^Her chat is unreadable\. Reading it again/);
  assert.equal(now().live, true, 'a read it tries again keeps the stream');
  stream.fire('open');
  assert.equal(now().error, null, 'and a connection made clears what the last one said');
  stop();
  assert.equal(stream.readyState, 2);
});

test('REFUSED: data of a shape her chat does not send changes nothing', () => {
  const { stream, now, stop } = followed();
  stream.send('chat', { kind: 'message', id: 'm:1', at: at(1) });
  stream.send('presence', { up: 'yes' });
  assert.deepEqual(now().events, []);
  assert.deepEqual(now().presence, CHAT_DOWN);
  stop();
});

test('a change is taken one at a time: the presence of the later frame wins, and the events of both are held', () => {
  const held = [
    { kind: 'presence' as const, presence: up },
    { kind: 'events' as const, events: [message('m:1', 1, 'agent', 'One.')] },
  ];
  const after = held.reduce(changedChat, unreadChat(false));
  assert.deepEqual(after.presence, up);
  assert.equal(after.events.length, 1);
});

/** A storage of this process's own, or one that refuses every call. */
function storage(refuses = false): { held: Map<string, string> } {
  const held = new Map<string, string>();
  const refuse = () => {
    throw new Error('storage is refused');
  };
  Reflect.set(globalThis, 'localStorage', {
    getItem: (key: string) => (refuses ? refuse() : (held.get(key) ?? null)),
    setItem: (key: string, value: string) => (refuses ? refuse() : void held.set(key, value)),
    removeItem: (key: string) => (refuses ? refuse() : void held.delete(key)),
  });
  return { held };
}

test('a message the api would not take is kept in this browser, read back, changed and forgotten', () => {
  const { held } = storage();
  assert.equal(readKept(), null);
  keepUnsent('Approve the land', at(0));
  assert.deepEqual(readKept(), { text: 'Approve the land', at: at(0) });
  assert.equal(held.has(CHAT_OUTBOX_KEY), true, 'under its one key');
  editKept('Approve the land of the runs page');
  assert.deepEqual(readKept(), { text: 'Approve the land of the runs page', at: at(0) }, 'its moment is kept');
  forgetKept();
  assert.equal(readKept(), null);
});

test('REFUSED: a storage that throws on every call, and words that are no kept message, keep nothing and say so', () => {
  storage(true);
  keepUnsent('Approve the land', at(0));
  assert.equal(readKept(), null, 'a refused storage is swallowed, and keeps nothing');
  forgetKept();
  editKept('Anything');
  storage();
  for (const raw of [null, 'not json', '[]', '{}', '{"text":"","at":"x"}', '{"text":"x"}'])
    assert.equal(parseKept(raw), null, JSON.stringify(raw));
  assert.deepEqual(parseKept('{"text":"x","at":"y","more":1}'), { text: 'x', at: 'y' });
});

test('a kept message reaches her once: a second try while the first is in flight is the first, and the next call tries again', async () => {
  let calls = 0;
  let settle: (() => void) | undefined;
  const send = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      settle = () => resolve('sent');
    });
  };
  const first = sendingOnce(send);
  const second = sendingOnce(send);
  assert.equal(calls, 1, 'the api coming back, the stream opening and the pace all try it: it is sent once');
  settle!();
  assert.deepEqual(await Promise.all([first, second]), ['sent', 'sent']);
  await sendingOnce(() => Promise.resolve('again'));
  assert.equal(calls, 1, 'and once the flight is over the next call runs its own send');
});

test('REFUSED: a send with no guard sends a kept message twice', async () => {
  let calls = 0;
  const send = () => {
    calls += 1;
    return Promise.resolve('sent');
  };
  await Promise.all([send(), send()]);
  assert.equal(calls, 2, 'without the guard the api takes it twice');
  calls = 0;
  const held = new Promise<string>(() => undefined);
  void sendingOnce(() => {
    calls += 1;
    return held;
  });
  void sendingOnce(() => {
    calls += 1;
    return held;
  });
  assert.equal(calls, 1);
});

test("only an outbox entry is drawn as the person's bubble: the keeper's words are a quiet marker, and hers are hers", () => {
  assert.equal(drawnAs(message('k:1:x', 1, 'keeper', 'The person writes from the board: hi')), 'marker');
  assert.equal(drawnAs(message('p:1:y', 2, 'person', 'hi')), 'person');
  assert.equal(drawnAs(message('m:1:z', 3, 'agent', 'Two gates.')), 'agent');
  assert.notEqual(
    drawnAs(message('k:1:x', 1, 'keeper', 'The person writes from the board: hi')),
    'person',
    "a keeper's words drawn as the person's would put the framing sentence in their mouth",
  );
});

/** One question, its two choices explained: the ask of the canvas's board 7. */
const EXPLAINED: AskQuestion = {
  question: 'What the board shows as an old closeout’s one line?',
  header: 'Summary',
  options: [
    { label: 'Cut it on read', description: 'The first line, cut at a word to 120 characters.', recommended: true },
    { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
  ],
  multiSelect: false,
};

/** The same question with nothing to explain: her proposal's two actions, boards 5 and 6. */
const PLAIN: AskQuestion = { ...EXPLAINED, options: EXPLAINED.options.map((option) => ({ ...option, description: '  ' })) };

/** An ask of hers in her chat, waiting on the person. */
const asked = (kind: 'question' | 'proposal', questions: readonly AskQuestion[], chose?: Record<string, string>): ChatEvent => ({
  kind,
  id: `q:${kind}`,
  at: at(2),
  call: kind,
  text: 'The run waits at its gate until you answer.',
  questions,
  ...(chose === undefined ? {} : { chose, choseAt: at(3) }),
});

test('an ask is drawn by what its choices carry: the actions of a proposal, one question’s form, or the flow of several', () => {
  assert.equal(drawnAsk([PLAIN]), 'actions');
  assert.equal(drawnAsk([EXPLAINED]), 'form', 'a choice that explains itself is a row of the form, never a button');
  assert.equal(drawnAsk([PLAIN, PLAIN]), 'many', 'several questions take the flow whatever their choices carry');
  assert.equal(drawnAsk([EXPLAINED, EXPLAINED]), 'many');
  assert.equal(drawnAsk([{ ...PLAIN, options: [...PLAIN.options, EXPLAINED.options[0]] }]), 'form', 'one explained choice is enough');
  assert.equal(drawnAsk([]), 'actions', 'a question with no choice at all is nothing to form');
});

test('a question is answered by a choice or by words with something in them, and what is left is said in the recap', () => {
  const question = EXPLAINED.question;
  assert.equal(askAnswered({ question, labels: ['Cut it on read'] }), true);
  assert.equal(askAnswered({ question, labels: [] }), false, 'nothing chosen');
  assert.equal(askAnswered(undefined), false);
  assert.equal(askAnswered({ question, words: 'Neither: cut it on write' }), true);
  assert.equal(askAnswered({ question, words: '   ' }), false, 'blank words answer nothing');
  assert.equal(askAnswered({ question, words: '', labels: ['Cut it on read'] }), false, 'the words are the answer once they are the pick');
  assert.equal(askLeft(2), '2 not answered');
  assert.equal(askLeft(0), 'All answered');
});

test('the asks waiting on the person are those with no choice on them: one answered waits on nobody', () => {
  const open = asked('question', [EXPLAINED]);
  const done = asked('proposal', [PLAIN], { [PLAIN.question]: 'Cut it on read' });
  assert.deepEqual(
    asksOpen([message('m:1', 1, 'agent', 'One.'), open, done]).map((ask) => ask.id),
    ['q:question'],
  );
  assert.deepEqual(asksOpen([done]), [], 'answered: the composer asks for nothing');
});

test("an ask her stream sends is read whole — its questions, the choices and the person's answer on it", () => {
  const { stream, now, stop } = followed();
  stream.send('chat', asked('question', [EXPLAINED]));
  stream.send('chat', asked('proposal', [PLAIN], { [PLAIN.question]: 'Cut it on read' }));
  const events = now().events;
  assert.deepEqual(
    events.map((event) => event.kind),
    ['question', 'proposal'],
  );
  const [one, two] = events;
  assert.deepEqual(one?.kind === 'question' ? one.questions : [], [EXPLAINED], 'the questions are read as she asked them');
  assert.deepEqual(two?.kind === 'proposal' ? two.chose : undefined, { [PLAIN.question]: 'Cut it on read' });
  assert.equal(two?.kind === 'proposal' ? two.choseAt : undefined, at(3));
  stop();
});

test('REFUSED: an ask whose questions are of another shape changes nothing', () => {
  const { stream, now, stop } = followed();
  stream.send('chat', { ...asked('question', []), questions: [{ question: 'Which?', header: 'H', options: [{ label: 'One' }] }] });
  stream.send('chat', { ...asked('proposal', []), questions: 'none' });
  assert.deepEqual(now().events, []);
  stop();
});

test('the composer invites what where she is asks for, and offers the stop while she answers', () => {
  assert.equal(composerWords(UP), 'Tell Nemia what to do, or ask');
  assert.equal(composerWords({ ...UP, answering: true }), 'She is answering. Write the next one, or stop her');
  assert.equal(composerWords({ ...UP, down: true }), 'Write now; she reads it when she is up');
  assert.equal(composerWords({ ...UP, notSent: true }), 'Waiting for the daemon');
  assert.equal(composerWords({ ...UP, notSent: true, down: true, answering: true }), 'Waiting for the daemon', 'nowhere to send it');
  assert.equal(composerWords({ ...UP, waitsOnYou: 1 }, true), 'Or answer in your own words', 'a question of hers waits on them');
  assert.equal(composerWords({ ...UP, answering: true }, true), 'Or answer in your own words', 'her turn is held by the question');
  assert.equal(composerWords({ ...UP, down: true }, true), 'Write now; she reads it when she is up', 'no session holds the question');
});

test("the composer's button is the stop while she answers, and the send every other time", () => {
  assert.equal(composerButton({ ...UP, answering: true }), 'stop');
  assert.equal(composerButton(UP), 'send', 'no turn of hers to end');
  assert.equal(composerButton({ ...UP, down: true }), 'send');
  assert.equal(composerButton({ ...UP, unread: 2 }), 'send');
  assert.equal(
    composerButton({ ...UP, answering: true, notSent: true }),
    'send',
    'a message this browser kept means the api is not there to be asked for a stop either',
  );
});
