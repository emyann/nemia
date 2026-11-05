/**
 * Nemia's chat where it is pure: the merge of her stream's events by their id, where she is as her face reads it, her calls folded
 * into a turn and that fold mapped onto the one shape the family draws (`chatItems`), the links read out of her words, how an ask of
 * hers is drawn and what is left of one, which of her messages are new, and a message the api would not take, kept in this browser and
 * sent once. Each rule with a fixture that breaks it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { story } from './checkpoints.ts';
import {
  askAnswered,
  broughtOf,
  askInWords,
  askLeft,
  asksOpen,
  CHAT_DOWN,
  changedChat,
  drawnAs,
  drawnAsk,
  chatItems,
  foldChat,
  followChat,
  linksOf,
  mergeChatEvents,
  newFrom,
  presenceOf,
  readableFrom,
  unreadChat,
  wordsAnswer,
  type ChatAsk,
  type ChatFollowed,
  type ChatItem,
  type ChatMessage,
  type ChatCall,
} from '../src/lib/chatFollowing.ts';
import { turnWords } from '../src/lib/conversation.ts';
import { CHAT_OUTBOX_KEY, editKept, forgetKept, keepUnsent, parseKept, readKept, sendingOnce } from '../src/lib/chatOutbox.ts';
import { anyAbove, composerButton, composerWords } from '../src/lib/nemia.ts';
import { faceOf, UP, type Presence } from '../src/lib/presence.ts';
import type { StreamLike } from '../src/lib/follow.ts';
import type { AskQuestion, ChatEvent, ChatPresence, FactoryLevel, PermissionFacts } from '../src/lib/api.ts';

const at = (second: number): string => new Date(Date.UTC(2026, 9, 15, 17, 40, second)).toISOString();

/** A message of hers, the person's or the keeper's. */
const message = (id: string, second: number, from: 'agent' | 'person' | 'keeper', text: string): ChatMessage => ({
  kind: 'message',
  id,
  at: at(second),
  from,
  text,
});

/** One tool call of hers. */
const call = (id: string, second: number, state: ChatCall['state'], sentence = 'Read the inbox'): ChatCall => ({
  kind: 'call',
  id,
  at: at(second),
  tool: 'Read',
  sentence,
  state,
});

const up: ChatPresence = { up: true, answering: false, waitsOnYou: 0, unread: 0 };

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

test('mergeChatEvents and changedChat: an event of her chat is replaced by its id alone, and a change is taken one at a time', async (t) => {
  await t.test(
    'an event of her chat is replaced by its id alone: the same id twice is one event, the same words under two ids are two',
    () => {
      const first = mergeChatEvents([], [call('t:1:a', 1, 'running'), message('m:1:b', 2, 'agent', 'One.')]);
      const moved = mergeChatEvents(first, [call('t:1:a', 1, 'done')]);
      assert.deepEqual(
        moved.map((e) => e.id),
        ['t:1:a', 'm:1:b'],
        'the call is replaced where it stands, never drawn twice',
      );
      assert.equal((moved[0] as ChatCall).state, 'done', 'with its later state');
      const twice = mergeChatEvents([], [message('k:1:x', 3, 'keeper', 'Same words'), message('p:1:y', 4, 'person', 'Same words')]);
      assert.equal(twice.length, 2, 'the same words under two ids are two events');
    },
  );
  await t.test('REFUSED: a merge keyed by the kind beside the id, as a step transcript is, draws a call whose state moved twice', () => {
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
    const known = [call('t:1:a', 1, 'running')];
    assert.equal(keyed(known, [call('t:1:a', 1, 'done')]).length, 2, 'the mutant draws the call twice');
    assert.equal(mergeChatEvents(known, [call('t:1:a', 1, 'done')]).length, 1, 'the rule draws it once');
  });
  await t.test('a change is taken one at a time: the presence of the later frame wins, and the events of both are held', () => {
    const held = [
      { kind: 'presence' as const, presence: up },
      { kind: 'events' as const, events: [message('m:1', 1, 'agent', 'One.')] },
    ];
    const after = held.reduce(changedChat, unreadChat(false));
    assert.deepEqual(after.presence, up);
    assert.equal(after.events.length, 1);
  });
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

test('chatOutbox: a message the api would not take is kept in this browser, and sent once', async (t) => {
  await t.test('a message the api would not take is kept in this browser, read back, changed and forgotten', () => {
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
  await t.test('REFUSED: a storage that throws on every call, and words that are no kept message, keep nothing and say so', () => {
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
  await t.test(
    'a kept message reaches her once: a second try while the first is in flight is the first, and the next call tries again',
    async () => {
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
    },
  );
  await t.test('REFUSED: a send with no guard sends a kept message twice', async () => {
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
const asked = (kind: 'question' | 'proposal', questions: readonly AskQuestion[], chose?: Record<string, string>): ChatAsk => ({
  kind,
  id: `q:${kind}`,
  at: at(2),
  call: kind,
  text: 'The run waits at its gate until you answer.',
  questions,
  ...(chose === undefined ? {} : { chose, choseAt: at(3) }),
});

test('drawnAsk, askAnswered, asksOpen and askInWords: an ask of hers drawn, answered, left open, and answered in words', async (t) => {
  await t.test('an ask is drawn by what its choices carry: the actions of a proposal, one question’s form, or the flow of several', () => {
    assert.equal(drawnAsk([PLAIN]), 'actions');
    assert.equal(drawnAsk([EXPLAINED]), 'form', 'a choice that explains itself is a row of the form, never a button');
    assert.equal(drawnAsk([PLAIN, PLAIN]), 'many', 'several questions take the flow whatever their choices carry');
    assert.equal(drawnAsk([EXPLAINED, EXPLAINED]), 'many');
    assert.equal(drawnAsk([{ ...PLAIN, options: [...PLAIN.options, EXPLAINED.options[0]] }]), 'form', 'one explained choice is enough');
    assert.equal(drawnAsk([]), 'actions', 'a question with no choice at all is nothing to form');
  });
  await t.test('a question is answered by a choice or by words with something in them, and what is left is said in the recap', () => {
    const question = EXPLAINED.question;
    assert.equal(askAnswered({ question, labels: ['Cut it on read'] }), true);
    assert.equal(askAnswered({ question, labels: [] }), false, 'nothing chosen');
    assert.equal(askAnswered(undefined), false);
    assert.equal(askAnswered({ question, words: 'Neither: cut it on write' }), true);
    assert.equal(askAnswered({ question, words: '   ' }), false, 'blank words answer nothing');
    assert.equal(
      askAnswered({ question, words: '', labels: ['Cut it on read'] }),
      false,
      'the words are the answer once they are the pick',
    );
    assert.equal(askLeft(2), '2 not answered');
    assert.equal(askLeft(0), 'All answered');
  });
  await t.test('the asks waiting on the person are those with no choice on them: one answered waits on nobody', () => {
    const open = asked('question', [EXPLAINED]);
    const done = asked('proposal', [PLAIN], { [PLAIN.question]: 'Cut it on read' });
    assert.deepEqual(
      asksOpen([message('m:1', 1, 'agent', 'One.'), open, done]).map((ask) => ask.id),
      ['q:question'],
    );
    assert.deepEqual(asksOpen([done]), [], 'answered: the composer asks for nothing');
    const cut = { ...asked('question', [EXPLAINED]), cutAt: at(4) };
    assert.deepEqual(asksOpen([cut]), [], 'her call was cut with nothing answered: nothing of hers is held open for it');
    assert.equal(askInWords([cut]), undefined, 'so the composer is what it always is, and what they write is said to her');
  });
  await t.test('the composer\u2019s own words answer one question drawn as the form, and no proposal, no flow and no two at once', () => {
    const form = asked('question', [EXPLAINED]);
    const proposal = asked('proposal', [PLAIN]);
    const many = { ...asked('question', [EXPLAINED, EXPLAINED]), id: 'q:many', call: 'many' };
    assert.equal(askInWords([message('m:1', 1, 'agent', 'One.'), form])?.call, 'question');
    assert.equal(askInWords([proposal]), undefined, 'a proposal\u2019s buttons say its choices whole: they take no words of theirs');
    assert.equal(askInWords([many]), undefined, 'several questions are answered in the flow, which has a row for their words');
    assert.equal(askInWords([form, proposal]), undefined, 'two asks at once: their words would name no question');
    assert.equal(askInWords([asked('question', [EXPLAINED], { [EXPLAINED.question]: 'Cut it on read' })]), undefined, 'answered already');
    assert.equal(askInWords([]), undefined);
    assert.deepEqual(wordsAnswer(form, 'Neither: cut it on write'), [{ question: EXPLAINED.question, words: 'Neither: cut it on write' }]);
  });
});

/** A call of hers that would prompt, as the SDK hands it over: its one question, its three choices, and the facts drawn over them. */
const PERMISSION_QUESTION: AskQuestion = {
  question: 'Claude wants to run a command',
  header: 'Permission',
  options: [
    { label: 'Allow once', description: 'Run this call, and ask again next time.', recommended: false },
    { label: 'Always allow', description: 'Run it, and calls like it, without asking.', recommended: false },
    { label: 'Deny', description: 'Refuse the call; she is told it was refused.', recommended: false },
  ],
  multiSelect: false,
};

/** The facts the SDK handed over with the call, every one of them there. */
const FACTS: PermissionFacts = {
  tool: 'Bash',
  command: 'rm -rf  ./dist && echo "done"',
  title: PERMISSION_QUESTION.question,
  description: 'Removes the build folder',
  decisionReason: 'No rule allows Bash(rm *)',
  blockedPath: '/srv/project/dist',
  always: true,
  defaultToNo: false,
};

/** A permission of hers waiting on the person, carrying `facts`, its choice on it where one was made. */
const permission = (facts: PermissionFacts = FACTS, chose?: Record<string, string>): ChatAsk => ({
  kind: 'permission',
  id: 'q:permission',
  at: at(2),
  call: 'permission',
  text: PERMISSION_QUESTION.question,
  questions: [PERMISSION_QUESTION],
  permission: facts,
  ...(chose === undefined ? {} : { chose, choseAt: at(3) }),
});

test('a permission of hers is an ask: waiting, drawn as the form, answered in words, and tagged by what it asks', async (t) => {
  await t.test('it is an ask that waits on the person until they answer it, drawn as one question’s form', () => {
    const open = permission();
    assert.equal(drawnAsk(open.questions), 'form', 'its choices explain themselves: the form, never a proposal’s buttons');
    assert.deepEqual(
      asksOpen([message('m:1', 1, 'agent', 'One.'), open]).map((ask) => ask.kind),
      ['permission'],
    );
    assert.equal(asksOpen([permission(FACTS, { [PERMISSION_QUESTION.question]: 'Deny' })]).length, 0, 'answered: it waits on nobody');
    assert.equal(asksOpen([{ ...open, cutAt: at(4) }]).length, 0, 'its call cut: nothing is held open for it');
  });
  await t.test('the composer’s words answer it, and the words are the answer filed', () => {
    const open = permission();
    assert.equal(askInWords([open])?.kind, 'permission');
    assert.deepEqual(wordsAnswer(open, 'Not in dist, use out/'), [
      { question: PERMISSION_QUESTION.question, words: 'Not in dist, use out/' },
    ]);
    assert.equal(askInWords([open, asked('question', [EXPLAINED])]), undefined, 'beside a question of hers, the words would name neither');
  });
  await t.test('her adapter hands it to her talk as her own, carrying its facts', () => {
    const [own] = chatItems([permission()]);
    if (own?.kind !== 'own') throw new Error('a permission of hers is her own to draw');
    assert.equal(own.own.kind === 'permission' ? own.own.permission.command : undefined, FACTS.command);
  });
  await t.test('its tag says it asks to run while it waits, and that it was answered once chosen', async () => {
    await import('./tsx.ts');
    const { askTag } = await import('../src/components/chat/ChatAsk.tsx');
    assert.deepEqual(askTag(permission()), { words: 'Asks to run', hue: 'yours' });
    assert.deepEqual(askTag(permission(FACTS, { [PERMISSION_QUESTION.question]: 'Allow once' })), { words: 'Answered', hue: 'grey' });
  });
  await t.test('drawn, it shows what the SDK handed over and the command as typed, Deny picked where the SDK leans to no', async () => {
    await import('./tsx.ts');
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ChatAsk: Drawn } = await import('../src/components/chat/ChatAsk.tsx');
    const draw = (ask: ChatAsk) => renderToStaticMarkup(createElement(Drawn, { ask, onAnswer: () => undefined }));
    const html = draw(permission());
    assert.match(html, /data-chat-ask="form"/);
    assert.match(html, /data-chat-tag="asks to run"/);
    assert.match(html, /Claude wants to run a command/);
    assert.match(html, /data-chat-permission="description"[^>]*>Removes the build folder</);
    assert.match(html, /data-chat-permission="reason"[^>]*>No rule allows Bash\(rm \*\)</);
    assert.match(html, /data-chat-permission="path"[^>]*>\/srv\/project\/dist</);
    assert.match(html, /data-chat-permission="command"[^>]*>rm -rf {2}\.\/dist &amp;&amp; echo &quot;done&quot;</, 'the command as typed');
    assert.match(html, /data-chat-option="Always allow"/);
    assert.match(html, /disabled=""/, 'nothing is picked where the SDK does not lean, so the Answer is off');

    const leans = draw(permission({ ...FACTS, defaultToNo: true }));
    assert.match(leans, /data-chat-option="Deny"[^>]*data-selected="true"/, 'Deny is picked before the person picks');
    assert.doesNotMatch(leans, /disabled=""/, 'and the Answer is on');

    const bare = draw(permission({ tool: 'Bash', always: true, defaultToNo: false }));
    assert.doesNotMatch(bare, /data-chat-permission=/, 'what the SDK did not hand over is not drawn');
    assert.doesNotMatch(draw(permission(FACTS, { [PERMISSION_QUESTION.question]: 'Deny' })), /data-chat-option=/, 'answered: the record');
  });
});

test('her chat followed on one stream: what it does not read is dropped, where she is replaced, her events merged and her asks read whole, then a notice, and the end', async (t) => {
  const s = story(t);
  const { stream, now, stop } = followed();

  await s.test('REFUSED: data of a shape her chat does not send changes nothing', () => {
    stream.send('chat', { kind: 'message', id: 'm:1', at: at(1) });
    stream.send('presence', { up: 'yes' });
    assert.deepEqual(now().events, []);
    assert.deepEqual(now().presence, CHAT_DOWN);
  });

  await s.test(
    "her stream's frames reach the page: presence replaces where she is, a chat event merges by its id, and the cursor moves",
    () => {
      assert.deepEqual(now().presence, CHAT_DOWN);
      stream.send('presence', up, '1.0.0.0.0');
      assert.deepEqual(now().presence, up);
      assert.equal(now().cursor, '1.0.0.0.0');
      stream.send('chat', call('t:1:a', 1, 'running'), '1.1.0.0.0');
      stream.send('chat', call('t:1:a', 1, 'done'), '1.2.0.0.0');
      assert.equal(now().events.length, 1, 'the call is one event, its state moved');
      assert.equal((now().events[0] as ChatCall).state, 'done');
      assert.equal(now().cursor, '1.2.0.0.0');
    },
  );

  await s.test('REFUSED: an ask whose questions are of another shape changes nothing', () => {
    const before = now().events;
    stream.send('chat', { ...asked('question', []), questions: [{ question: 'Which?', header: 'H', options: [{ label: 'One' }] }] });
    stream.send('chat', { ...asked('proposal', []), questions: 'none' });
    assert.deepEqual(now().events, before);
    assert.equal(now().events.length, 1, 'the call alone');
  });

  await s.test("an ask her stream sends is read whole — its questions, the choices and the person's answer on it", () => {
    stream.send('chat', { ...asked('question', [EXPLAINED]), cutAt: at(4) });
    stream.send('chat', asked('proposal', [PLAIN], { [PLAIN.question]: 'Cut it on read' }));
    const events = now().events;
    assert.deepEqual(
      events.map((event) => event.kind),
      ['call', 'question', 'proposal'],
    );
    const [, one, two] = events;
    assert.deepEqual(one?.kind === 'question' ? one.questions : [], [EXPLAINED], 'the questions are read as she asked them');
    assert.equal(one?.kind === 'question' ? one.cutAt : undefined, at(4), 'and a call cut with nothing answered says when it was');
    assert.deepEqual(two?.kind === 'proposal' ? two.chose : undefined, { [PLAIN.question]: 'Cut it on read' });
    assert.equal(two?.kind === 'proposal' ? two.choseAt : undefined, at(3));
  });

  await s.test('a read the api makes again is a notice the next connection clears, and one it will not make again is the end', () => {
    stream.send('unreadable', { error: 'Her chat is unreadable.', retrying: true });
    assert.deepEqual(
      [now().retrying, now().error, now().live],
      ['Her chat is unreadable.', null, true],
      "a read the api makes again is a notice apart from an end, in the api's own words, and keeps the stream",
    );
    stream.fire('open');
    assert.deepEqual([now().retrying, now().error], [null, null], 'and a connection made clears what the last one said');
    stream.send('unreadable', { error: 'Her chat is gone.', retrying: false });
    assert.deepEqual(
      [now().error, now().retrying, now().live],
      ['Her chat is gone.', null, false],
      'one it will not make again is the end',
    );
    stop();
    assert.equal(stream.readyState, 2);
  });
});

test('presenceOf, composerWords and composerButton: where she is, and what the composer offers for it', async (t) => {
  await t.test(
    "her presence is the api's and this browser's kept message — and she reads as down when her session is not up, only then",
    () => {
      assert.deepEqual(presenceOf(up, false), { waitsOnYou: 0, notSent: false, down: false, answering: false, unread: 0 });
      assert.equal(presenceOf({ ...up, up: false }, false).down, true);
      assert.equal(faceOf(presenceOf({ ...up, up: false }, false)), 'sleepy');
      assert.equal(presenceOf(up, true).notSent, true, 'a message this browser kept is hers to say');
      assert.equal(faceOf(presenceOf(up, true)), 'unsure');
      const every: Presence = presenceOf({ up: true, answering: true, waitsOnYou: 2, unread: 3 }, true);
      assert.deepEqual(every, { waitsOnYou: 2, notSent: true, down: false, answering: true, unread: 3 });
      assert.equal(faceOf(every), 'surprised', 'what waits on a person comes first in the owner’s order');
    },
  );
  await t.test(
    'a store at Manual with one factory raised above it keeps her up: her face reads her session, never the store’s level',
    () => {
      const raised: FactoryLevel = {
        factory: 'tsverify',
        level: 'auto',
        default: 'manual',
        own: null,
        raise: { level: 'auto', until: '2026-11-05T04:00:00.000Z' },
      };
      const kept = { level: 'manual' as const, factories: [raised] };
      assert.equal(anyAbove(kept), true, 'the raise keeps her above Manual, though the store reads Manual');
      assert.equal(presenceOf(up, false).down, false, 'her session is up, so she is');
      assert.equal(faceOf(presenceOf(up, false)), 'idle');
      assert.equal(anyAbove({ level: 'manual', factories: [{ ...raised, level: 'manual', raise: null }] }), false, 'Manual everywhere');
    },
  );
  await t.test('the composer invites what where she is asks for, and offers the stop while she answers', () => {
    assert.equal(composerWords(UP), 'Tell Nemia what to do, or ask');
    assert.equal(composerWords({ ...UP, answering: true }), 'She is answering. Write the next one, or stop her');
    assert.equal(composerWords({ ...UP, down: true }), 'Write now; she reads it when she is up');
    assert.equal(composerWords({ ...UP, notSent: true }), 'Waiting for the daemon');
    assert.equal(composerWords({ ...UP, notSent: true, down: true, answering: true }), 'Waiting for the daemon', 'nowhere to send it');
    assert.equal(composerWords({ ...UP, waitsOnYou: 1 }, true), 'Or answer in your own words', 'a question of hers waits on them');
    assert.equal(composerWords({ ...UP, answering: true }, true), 'Or answer in your own words', 'her turn is held by the question');
    assert.equal(composerWords({ ...UP, down: true }, true), 'Write now; she reads it when she is up', 'no session holds the question');
  });
  await t.test("the composer's button is the stop while she answers, and the send every other time", () => {
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
});

test('foldChat, newFrom, linksOf, drawnAs and chatItems: her events as the page draws them', async (t) => {
  await t.test(
    'her consecutive calls fold into one turn, in the order they came, and a turn with a call at work or waiting is running',
    () => {
      const folded = foldChat([
        message('p:1', 1, 'person', 'What is waiting on me?'),
        call('t:1:a', 2, 'done', 'Read the inbox'),
        call('t:1:b', 3, 'done', 'Read the factories'),
        call('t:1:c', 136, 'done', 'Read the runs that wait'),
        message('m:1:d', 140, 'agent', 'Two gates.'),
      ]);
      assert.deepEqual(
        folded.map((item) => item.kind),
        ['event', 'turn', 'event'],
      );
      const turn = folded[1] as Extract<ChatItem, { kind: 'turn' }>;
      assert.deepEqual(
        turn.calls.map((c) => c.sentence),
        ['Read the inbox', 'Read the factories', 'Read the runs that wait'],
        'the turn keeps the order they came in',
      );
      assert.equal(turn.running, false);
      assert.equal(turnWords(turn.ms, turn.calls.length, 'call'), 'Worked for 2m 14s · 3 calls');
      const live = foldChat([call('t:1:a', 2, 'done'), call('t:1:b', 3, 'running')])[0] as Extract<ChatItem, { kind: 'turn' }>;
      assert.equal(live.running, true, 'a turn whose call is at work is still running');
      assert.equal(
        (foldChat([call('t:1:a', 2, 'waits')])[0] as Extract<ChatItem, { kind: 'turn' }>).running,
        true,
        'and one whose call waits on a person',
      );
      const apart = foldChat([call('t:1:a', 2, 'done'), message('m:1:b', 3, 'agent', 'Done.'), call('t:1:c', 4, 'done')]);
      assert.equal(apart.filter((item) => item.kind === 'turn').length, 2, 'calls either side of her words are two turns');
    },
  );
  await t.test('the line that says what is new is drawn over the first of her messages the person has not read', () => {
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
  await t.test(
    'a link of hers to a page of the board is taken out of the sentence and named beside it; one that leaves the board stays in it',
    () => {
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
    },
  );
  await t.test("only an outbox entry is drawn as the person's bubble: the keeper's words are a quiet marker, and hers are hers", () => {
    assert.equal(drawnAs(message('k:1:x', 1, 'keeper', 'The person writes from the board: hi')), 'marker');
    assert.equal(drawnAs(message('p:1:y', 2, 'person', 'hi')), 'person');
    assert.equal(drawnAs(message('m:1:z', 3, 'agent', 'Two gates.')), 'agent');
    assert.notEqual(
      drawnAs(message('k:1:x', 1, 'keeper', 'The person writes from the board: hi')),
      'person',
      "a keeper's words drawn as the person's would put the framing sentence in their mouth",
    );
  });
  await t.test(
    'her adapter maps her events onto the one shape the family draws: each kind, in the order they came, with what it carries',
    () => {
      const items = chatItems([
        call('t:1:a', 2, 'done', 'Read the inbox'),
        call('t:1:b', 136, 'waits', 'Waits for your approval'),
        message('m:1:c', 140, 'agent', 'Two gates: [the run](/runs/r-1) and [the card](/inbox/c-2).'),
        message('p:1:d', 141, 'person', 'Land the first.'),
        message('k:1:e', 142, 'keeper', 'She was told what you wrote.'),
        { kind: 'session', id: 's:1:f', at: at(143), attempt: 4 },
        asked('question', [EXPLAINED]),
      ]);
      assert.deepEqual(
        items.map((item) => [item.kind, item.id]),
        [
          ['work', 't:1:a'],
          ['said', 'm:1:c'],
          ['said', 'p:1:d'],
          ['note', 'k:1:e'],
          ['note', 's:1:f'],
          ['own', 'q:question'],
        ],
        'the ids her events carry, in the order they came',
      );
      const work = items[0];
      if (work.kind !== 'work') throw new Error('her consecutive calls are one turn');
      assert.deepEqual(
        work.lines.map((line) => [line.id, line.tool, line.sentence, line.state]),
        [
          ['t:1:a', 'Read', 'Read the inbox', 'done'],
          ['t:1:b', 'Read', 'Waits for your approval', 'waits'],
        ],
      );
      assert.equal(work.running, true, 'a turn whose line waits on a person is still at work');
      assert.equal(work.ms, 134_000);
      assert.equal(
        work.lines.every((line) => line.input === undefined && line.result === undefined),
        true,
        'her calls open on nothing',
      );

      const hers = items[1];
      if (hers.kind !== 'said') throw new Error('her words are said');
      assert.deepEqual(
        { who: hers.who, yours: hers.yours, markdown: hers.markdown, text: hers.text },
        { who: 'Nemia', yours: false, markdown: true, text: 'Two gates: the run and the card.' },
        'her links are taken out of the sentence, which reads plain',
      );
      assert.deepEqual(hers.links, [
        { words: 'the run', href: '/runs/r-1' },
        { words: 'the card', href: '/inbox/c-2' },
      ]);

      const theirs = items[2];
      if (theirs.kind !== 'said') throw new Error("the person's words are said");
      assert.deepEqual(
        { who: theirs.who, yours: theirs.yours, markdown: theirs.markdown, text: theirs.text, links: theirs.links },
        {
          who: 'You',
          yours: true,
          markdown: false,
          text: 'Land the first.',
          links: [],
        },
      );

      assert.deepEqual(
        items.slice(3, 5).map((item) => (item.kind === 'note' ? [item.what, item.words] : null)),
        [
          ['keeper', 'She was told what you wrote.'],
          ['session', 'A session of hers began — her 4'],
        ],
        "the keeper's framing and the rule between two of her sessions are quiet lines",
      );

      const own = items[5];
      if (own.kind !== 'own') throw new Error('an ask of hers is her own to draw');
      assert.equal(own.own.kind, 'question', 'carrying the event, which her talk draws itself');
      assert.equal(own.own.questions[0], EXPLAINED);

      assert.deepEqual(chatItems([]), [], 'nothing said is nothing drawn');
    },
  );
});

/** The link `bring-what-waits` teaches her to name a step by, its placeholders as the skill writes them. */
const TAUGHT = '/runs/<run>?step=<step>';

test('broughtOf and chatItems: a step her words link to is brought, drawn under her words as its own item', async (t) => {
  await t.test('a link to a step of a run names the run and the step, and every other address names none', () => {
    const rows: Array<[string, { run: string; step: string } | undefined]> = [
      ['/runs/r-1?step=design', { run: 'r-1', step: 'design' }],
      ['/runs/r-1?step=plan%2Fv2', { run: 'r-1', step: 'plan/v2' }],
      ['/runs/r%201?step=design', { run: 'r 1', step: 'design' }],
      [TAUGHT.replace('<run>', 'cli-one-run-e4tv').replace('<step>', 'design'), { run: 'cli-one-run-e4tv', step: 'design' }],
      ['/runs/r-1', undefined],
      ['/runs/r-1?step=', undefined],
      ['/runs?step=x', undefined],
      ['/runs/?step=x', undefined],
      ['/runs/r-1/steps/design', undefined],
      ['/runs/a/b?step=x', undefined],
      ['/inbox/c?step=x', undefined],
      ['/runs/r-1?step=%E0%A4%A', undefined],
      ['https://example.test/runs/r-1?step=design', undefined],
    ];
    for (const [href, named] of rows) assert.deepEqual(broughtOf(href), named, href);
  });
  await t.test('her message brings each step it links once, after her words and in her order; a person who writes the same brings none', () => {
    const items = chatItems([
      message(
        'm:1:a',
        1,
        'agent',
        'Two wait. [design of r-1](/runs/r-1?step=design), [review of r-2](/runs/r-2?step=review), [design again](/runs/r-1?step=design), [the run](/runs/r-3).',
      ),
      message('p:1:b', 2, 'person', 'See [design of r-1](/runs/r-1?step=design).'),
    ]);
    assert.deepEqual(
      items.map((item) => [item.kind, item.id]),
      [
        ['said', 'm:1:a'],
        ['own', 'm:1:a:brought:r-1/design'],
        ['own', 'm:1:a:brought:r-2/review'],
        ['said', 'p:1:b'],
      ],
    );
    const own = items[1];
    if (own.kind !== 'own') throw new Error('a brought step is her own item');
    assert.deepEqual(own.own, { kind: 'brought', run: 'r-1', step: 'design' });
    const said = items[0];
    if (said.kind !== 'said') throw new Error('her words are said');
    assert.deepEqual(
      said.links.map((link) => link.href),
      ['/runs/r-1?step=design', '/runs/r-2?step=review', '/runs/r-1?step=design', '/runs/r-3'],
      'every link stays a button beside what it brings',
    );
  });
});

test('reading her chat: a read made again that fails is the end, and clears the notice an earlier stream left', async (t) => {
  const { reading } = await import('../src/lib/useNemiaChat.ts');
  const fetchBefore = globalThis.fetch;
  const sourceBefore = (globalThis as { EventSource?: unknown }).EventSource;
  const streams: Stream[] = [];
  Object.assign(globalThis, {
    EventSource: class extends Stream {
      constructor(_url: string) {
        super();
        streams.push(this);
      }
    },
  });
  t.after(() => {
    globalThis.fetch = fetchBefore;
    Object.assign(globalThis, { EventSource: sourceBefore });
  });
  let state: ChatFollowed = unreadChat(true);
  const setState = (next: ChatFollowed | ((s: ChatFollowed) => ChatFollowed)) => {
    state = typeof next === 'function' ? next(state) : next;
  };
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setImmediate(r));
    assert.ok(done(), 'the read answers');
  };

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ events: [], before: null, cursor: 'c:1', presence: up }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const open = reading({ setState, tryAgain: () => {}, follow: true });
  await until(() => streams.length === 1);
  streams[0].send('unreadable', { error: 'Her chat is unreadable.', retrying: true });
  assert.equal(state.retrying, 'Her chat is unreadable.', 'the panel open, the stream says the api reads her again');

  open();
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  const closed = reading({ setState, tryAgain: () => {}, follow: false });
  await until(() => state.error !== null);
  closed();
  assert.deepEqual(
    [state.live, state.retrying],
    [false, null],
    'the panel closed and the api down, the fresh read that fails is the end, and leaves no retrying notice beside its error',
  );
});
