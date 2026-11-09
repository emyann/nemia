/**
 * The board's nemia components (`src/components/nemia/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';
import { nemiaUp, proposalIn, routedWith, TRUST, withProposal } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { timeOfDay } = await import('../src/lib/timeOfDay.ts');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { NemiaFace } = await import('../src/components/nemia/NemiaFace.tsx');
const { UP } = await import('../src/lib/presence.ts');
const { ChatLostBand, ChatRetryingBand, ChatStoppedBand, ChatUnreadableBand } = await import('../src/components/nemia/chat/ChatBand.tsx');
const { dockWords } = await import('../src/lib/presence.ts');
type ChatEvent = import('../src/lib/api.ts').ChatEvent;
const { ChatAsk } = await import('../src/components/nemia/chat/ChatAsk.tsx');
const { ChatAskMany } = await import('../src/components/nemia/chat/ChatAskMany.tsx');
const { ChatActions } = await import('../src/components/nemia/chat/ChatActions.tsx');
type AskQuestion = import('../src/lib/api.ts').AskQuestion;

/** Nemia's section, drawn over a cache holding `level`, her memory, `facts`, and each fact's words, read as if opened once. */
async function nemiaWith(level: Record<string, unknown>, facts: string[] = []): Promise<string> {
  const { NemiaSettings } = await import('../src/components/nemia/NemiaSettings.tsx');
  const client = new QueryClient();
  client.setQueryData(['nemia', 'level'], {
    level: 'manual',
    since: null,
    task: null,
    phase: null,
    sessionId: null,
    reach: [],
    bridge: null,
    stopped: false,
    spend: null,
    allows: [],
    factories: [],
    trust: null,
    ...level,
  });
  client.setQueryData(['nemia', 'memory'], { dir: '/store/nemia/memory', facts, fact: null });
  for (const name of facts)
    client.setQueryData(['nemia', 'memory', name], { dir: '/store/nemia/memory', facts, fact: { name, text: `What ${name} says.` } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(NemiaSettings)));
}

/** The level the Select pressed at `mark` shows in `html`, or undefined where there is none. */
const pickedAt = (html: string, mark: string): string | undefined =>
  html.slice(html.indexOf(mark)).match(/data-slot="select-value"[^>]*><span[^>]*>([^<]*)</)?.[1];

test("REFUSED to offer: the default factory's own switch or raise, a raise over a raise, a raise of a factory at Semi-auto by default", async () => {
  const row = (factory: string, over: Record<string, unknown> = {}) => ({
    factory,
    level: 'manual',
    default: 'manual',
    own: null,
    raise: null,
    ...over,
  });
  const html = await nemiaWith({
    factories: [
      row('default'),
      row('mill', { level: 'semi-auto', raise: { level: 'semi-auto', until: '2026-10-05T18:00:00.000Z' } }),
      row('quay'),
      row('harbour', { level: 'semi-auto', default: 'semi-auto', own: 'semi-auto' }),
    ],
  });
  const of = (factory: string) => html.slice(html.indexOf(`data-factory-level="${factory}"`)).split('</li>')[0];
  assert.match(of('default'), /data-level="manual"/);
  assert.match(of('default'), /the store&#x27;s level, for runs in no factory/);
  assert.doesNotMatch(
    of('default'),
    /data-factory-default|data-factory-raise|data-factory-end/,
    "the default factory's level is the store's",
  );
  assert.match(of('mill'), /data-level="semi-auto"/);
  assert.match(of('mill'), /data-factory-raised/);
  assert.match(of('mill'), /data-factory-end/);
  assert.doesNotMatch(of('mill'), /data-factory-raise=/, 'a raise in force is ended, never raised again');
  assert.match(of('quay'), /data-factory-raise=/);
  assert.match(of('quay'), /data-factory-stretch/);
  assert.doesNotMatch(of('quay'), /data-factory-end|data-factory-raised/);
  assert.doesNotMatch(of('harbour'), /data-factory-raise=|data-factory-end/, 'Semi-auto by default has nothing to raise');
  assert.match(of('harbour'), /Semi-auto by default \(its own\)\./);
});

test('at Auto: her level and a factory by default picked at Auto in one control each, and a session kept from before named', async () => {
  const html = await nemiaWith({
    ...nemiaUp,
    level: 'auto',
    factories: [{ factory: 'quay', level: 'auto', default: 'auto', own: 'auto', raise: null }],
  });
  assert.equal(pickedAt(html, 'data-nemia-pick'), 'Auto');
  assert.equal(pickedAt(html, 'data-factory-default'), 'Auto');
  assert.equal(
    html.split('data-slot="select-trigger"').length - 1,
    2,
    'one control for her level, one for the factory: no raise over Auto',
  );
  assert.doesNotMatch(html, /data-slot="switch"/, 'no switch beside it');
  assert.match(
    html,
    /one kept from before asks you every answer until it is filed again — set her level and every factory above Manual to Manual, ending any raise, and once her session reads Off, set them back\./,
  );
});

test('Nemia off: her level picked at Manual, her session off, no reach, and her memory empty with how to prune it', async () => {
  const html = await nemiaWith({});
  assert.match(html, /data-nemia-level="manual"/);
  assert.equal(pickedAt(html, 'data-nemia-pick'), 'Manual');
  assert.match(html, /data-nemia-session="true" data-state="off"/);
  assert.doesNotMatch(html, /data-nemia-reach/);
  assert.doesNotMatch(html, /data-nemia-restart/);
  assert.match(html, /data-nemia-no-facts[^>]*>She keeps no facts yet\./);
  assert.match(html, /data-nemia-prune[^>]*>She keeps these facts herself[^<]*ask her to in her session\./);
});

test('Nemia up: her level picked at Semi-auto, her task and phase, the attach line as code to copy and the rest as words, her spend and allows', async () => {
  const html = await nemiaWith({ ...nemiaUp, spend: { usd: 1.25, measured: 2, unmeasured: 0 }, allows: ['Bash(git status)'] }, [
    'owner',
    'style',
  ]);
  assert.equal(pickedAt(html, 'data-nemia-pick'), 'Semi-auto');
  assert.match(html, /data-state="up"/);
  assert.match(html, /data-nemia-task[^>]*>nemia-1</);
  assert.match(html, /data-nemia-phase[^>]*>running</);
  assert.match(html, /data-nemia-attach[^>]*>attach 01234567<\/code><button[^>]*data-copy/);
  assert.match(html, /<a href="https:\/\/example\.test\/code\/session_0123" target="_blank" rel="noreferrer"[^>]*data-nemia-bridge="true"/);
  assert.equal(
    html.split('https://example.test/code/session_0123</').length,
    2,
    'her link is drawn once, as a link: never again as her reach line',
  );
  assert.match(html, /data-nemia-spend[^>]*>Spent \$1\.25 over 2 sessions ended; her open one counts once it ends\./);
  assert.match(html, /data-nemia-allows[\s\S]*>Bash\(git status\)</);
  assert.match(html, /data-nemia-fact="owner"[\s\S]*data-nemia-fact="style"/);
  assert.doesNotMatch(html, /data-nemia-fact-text|What style says\./, "a fact's words are drawn only while it is open, read or not");
});

test('Nemia asked bridged and not up: why, in place of her link; not asked: her attach line alone', async () => {
  const why = 'no `bridgeSessionId` yet.';
  const down = await nemiaWith({
    ...nemiaUp,
    reach: ['attach 01234567', `her web link is not up: ${why}`],
    bridge: { url: null, why },
  });
  assert.doesNotMatch(down, /data-nemia-bridge|<a /, 'no link while it is not up');
  assert.match(down, /data-bridge-why[^>]*>The web link is not up: no `bridgeSessionId` yet\.</);
  assert.equal(down.split('is not up: no `bridgeSessionId`').length, 2, 'said once');
  assert.match(down, /data-bridge-why[^>]*class="[^"]*\bwrap-anywhere\b/, 'a word it quotes breaks where it must, on a phone too');
  assert.match(down, /data-nemia-attach[^>]*>attach 01234567<\/code><button[^>]*data-copy/, 'the attach line still to copy');

  const unasked = await nemiaWith({ ...nemiaUp, reach: ['attach 01234567'], bridge: null });
  assert.match(unasked, /data-nemia-attach[^>]*>attach 01234567</);
  assert.doesNotMatch(unasked, /data-nemia-bridge|data-bridge-why/, 'not asked: nothing of a bridge');
});

/** Where the line that trusts her folder sits in Nemia's section `html`: inside her level's part, under its switch, or elsewhere. */
const trustAt = (html: string): 'level' | 'elsewhere' | 'none' => {
  const at = html.indexOf('data-nemia-trust');
  if (at < 0) return 'none';
  return at > html.indexOf('data-nemia-pick') && at < html.indexOf('>Factories</h3>') ? 'level' : 'elsewhere';
};

test('Nemia waiting on her folder trusted: under the switch, that no session is filed until it is, and the line to copy, said once; her session untrusted; trusted: no such line', async () => {
  const html = await nemiaWith({ level: 'semi-auto', since: '2026-10-05T12:00:00.000Z', task: 'nemia-1', trust: TRUST });
  assert.equal(trustAt(html), 'level', 'the wait is plain beside the switch that reads Semi-auto');
  assert.match(
    html,
    /data-nemia-trust[\s\S]*>No session of hers is filed until her folder is trusted: run this once in a terminal[^<]*<\/p>/,
  );
  assert.match(html, /data-nemia-trust[\s\S]*<code[^>]*>cd &#x27;\/store\/nemia&#x27; &amp;&amp; claude<\/code><button[^>]*data-copy/);
  assert.equal(html.split('data-nemia-trust').length, 2, 'the line is drawn once');
  assert.equal(html.split('in a terminal').length, 2, 'how to trust it is said once');
  assert.match(html, /data-nemia-session="true" data-state="untrusted"[\s\S]*>Waiting on your trust: the keeper files her session/);
  assert.equal(trustAt(await nemiaWith({ trust: TRUST })), 'level', 'off, the line is shown before she is turned on');
  assert.doesNotMatch(await nemiaWith({ ...nemiaUp }), /data-nemia-trust/, 'a trusted folder: no trust line');
});

test('Nemia stopped from outside: said so, with a way to a fresh session', async () => {
  const html = await nemiaWith({ ...nemiaUp, stopped: true });
  assert.match(html, /data-state="stopped"/);
  assert.match(html, /data-nemia-restart[^>]*>Start a fresh session</);
});

test('Nemia not filed, or waiting on her trust, names no task; filed, it names its task and phase', async () => {
  const untrusted = await nemiaWith({ level: 'semi-auto', since: '2026-10-05T12:00:00.000Z', task: 'nemia-1', trust: TRUST });
  assert.match(untrusted, /data-state="untrusted"/);
  assert.doesNotMatch(untrusted, /data-nemia-task|>Task/, 'waiting on her trust: nothing filed, no task named');
  const notFiled = await nemiaWith({ level: 'semi-auto', task: 'nemia-1' });
  assert.match(notFiled, /data-state="not-filed"/);
  assert.doesNotMatch(notFiled, /data-nemia-task|>Task/, 'not filed yet: no task named');
  const starting = await nemiaWith({ level: 'semi-auto', task: 'nemia-1', phase: 'pending' });
  assert.match(starting, /data-state="starting"/);
  assert.match(starting, /data-nemia-task[^>]*>nemia-1</);
  assert.match(starting, /data-nemia-phase[^>]*>pending</);
  const stopped = await nemiaWith({ ...nemiaUp, stopped: true });
  assert.match(stopped, /data-nemia-task[^>]*>nemia-1</);
  assert.match(stopped, /data-nemia-phase[^>]*>running</);
});

test("Nemia's face is her blobatar on its plate, dimmed in dark, and wears the expression her presence picks", () => {
  const up = renderToStaticMarkup(createElement(NemiaFace, { presence: UP }));
  const waits = renderToStaticMarkup(createElement(NemiaFace, { presence: { ...UP, runsWaiting: 2, answering: true } }));
  assert.match(up, /data-agent-face="nemia"/);
  assert.match(up, /dark:\[&amp;&gt;path\]:opacity-25|dark:\[&>path\]:opacity-25/, 'the plate, dimmed in dark');
  assert.match(up, /data-nemia-face="idle"/);
  assert.match(waits, /data-nemia-face="surprised"/);
  const drawing = (html: string) => html.slice(html.indexOf('<svg'));
  assert.notEqual(drawing(up), drawing(waits), 'the expression reaches the drawing');
  assert.equal(drawing(renderToStaticMarkup(createElement(NemiaFace, { presence: UP }))), drawing(up), 'one presence, one drawing');
});

test("her session stopped is a status, the daemon lost an alert in the failure's colour, and neither is dimmed by an opacity", async () => {
  const stopped = await routedWith(createElement(ChatStoppedBand, { words: 'Her session was stopped from outside.' }));
  assert.match(stopped, /data-band="stopped"[^>]*role="status"|role="status"[^>]*data-band="stopped"/);
  assert.match(stopped, /Her session stopped/);
  assert.match(stopped, /What you write waits for her\./);
  assert.match(stopped, /data-chat-start[^>]*href="\/settings"|href="\/settings"/, 'Start her session leads to her settings');
  const lost = renderToStaticMarkup(
    createElement(ChatLostBand, { since: '2026-10-15T21:57:00.000Z', now: new Date('2026-10-15T22:00:00.000Z') }),
  );
  assert.match(lost, /data-band="lost"[^>]*role="alert"|role="alert"[^>]*data-band="lost"/);
  assert.match(lost, /No answer from the daemon/);
  assert.match(lost, /bg-failure-container text-on-failure-container/);
  assert.match(lost, /nothing you wrote is lost/);
  for (const html of [stopped, lost]) assert.doesNotMatch(html, /\sopacity-\d/, 'a dimmed text falls under 4.5:1');
});

test("her docked face is called by the presence that gives it its expression, in the owner's order", () => {
  assert.equal(dockWords(UP, false), "Open Nemia's chat. Her session is up.");
  assert.equal(dockWords(UP, true), "Close Nemia's chat. Her session is up.");
  assert.equal(dockWords({ ...UP, runsWaiting: 2 }, false), "Open Nemia's chat. 2 wait on you.");
  assert.equal(dockWords({ ...UP, runsWaiting: 1 }, false), "Open Nemia's chat. 1 waits on you.");
  assert.equal(dockWords({ ...UP, asksWaiting: 2 }, false), "Open Nemia's chat. 2 asks of hers wait on you.");
  assert.equal(dockWords({ ...UP, asksWaiting: 1 }, false), "Open Nemia's chat. 1 ask of hers waits on you.");
  assert.equal(dockWords({ ...UP, notSent: true }, false), "Open Nemia's chat. A message was not sent.");
  assert.equal(dockWords({ ...UP, down: true }, false), "Open Nemia's chat. Her session is down.");
  assert.equal(dockWords({ ...UP, answering: true }, false), "Open Nemia's chat. She is answering.");
  assert.equal(dockWords({ ...UP, unread: 2 }, true), "Close Nemia's chat. 2 new answers.");
  assert.equal(dockWords({ ...UP, unread: 1 }, false), "Open Nemia's chat. 1 new answer.");
  assert.equal(
    dockWords({ runsWaiting: 2, asksWaiting: 1, notSent: true, down: true, answering: true, unread: 3 }, false),
    "Open Nemia's chat. 2 wait on you.",
    'what waits on a person comes first, as her face does',
  );
});

test("a chat the board cannot read says so as an alarm, in the read's own words, and says the board reads again on its own", () => {
  const html = renderToStaticMarkup(createElement(ChatUnreadableBand, { why: 'the api answered 503' }));
  assert.match(html, /data-band="unreadable"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /The board cannot read her chat/);
  assert.match(html, /the api answered 503\. It reads again every few seconds/);
  assert.match(html, /what you write is kept here until the api takes it/);
});

test('a chat the api cannot stream and reads again on a beat is a quiet note at rest, never the failure that ends a page', () => {
  const html = renderToStaticMarkup(createElement(ChatRetryingBand, { why: 'Her session is not pushed as it is written.' }));
  assert.match(html, /data-band="retrying"[^>]*role="status"|role="status"[^>]*data-band="retrying"/);
  assert.match(html, /Reading her chat again/);
  assert.match(html, /Her session is not pushed as it is written\. Nothing is lost/);
  assert.match(html, /border-rest/, 'a note the board makes of itself is rest, not a write refused');
  assert.doesNotMatch(html, /failure/, 'the colour that says a write was refused says nothing here');
});

type ChatAskEvent = Extract<ChatEvent, { kind: 'question' | 'proposal' }>;

/** One question of hers, its choices explained; `plain` is the same with nothing to explain, which her proposal draws as actions. */
const askQuestion = (plain = false): AskQuestion => ({
  question: 'What the board shows as an old closeout’s one line?',
  header: 'Summary',
  options: [
    { label: 'Cut it on read', description: plain ? '' : 'The first line, cut at a word.', recommended: true },
    { label: 'First line as it is', description: plain ? '' : 'The board cuts it by its layout.', recommended: false },
  ],
  multiSelect: false,
});

/** An ask of hers in her chat, its choice on it where one was made. */
const askEvent = (kind: 'question' | 'proposal', questions: readonly AskQuestion[], chose?: Record<string, string>): ChatAskEvent => ({
  kind,
  id: 'q:call-1',
  call: 'call-1',
  at: new Date(Date.UTC(2026, 9, 15, 22, 2, 0)).toISOString(),
  text: 'The design signed off with a question it cannot settle alone. [Read the design](/runs/r-1)',
  questions,
  ...(chose === undefined ? {} : { chose, choseAt: CHOSE_AT.toISOString() }),
});

/** When the person chose, and the time of day the board writes it as, read where the draw reads it: a moment is drawn in the zone
 * the browser is in, and the runner's is not this machine's. */
const CHOSE_AT = new Date(Date.UTC(2026, 9, 15, 22, 4, 0));

test('her one question with its choices explained is drawn as the form: the choice, why, the Recommended tag, and the link in her words', () => {
  const html = renderToStaticMarkup(createElement(ChatAsk, { ask: askEvent('question', [askQuestion()]), onAnswer: () => undefined }));
  assert.match(html, /data-chat-ask="form"/);
  assert.match(html, /data-chat-tag="asks you"/);
  assert.match(html, /1 of 1 · Summary/);
  assert.match(html, /data-chat-option="Cut it on read"/);
  assert.match(html, /The first line, cut at a word\./, 'a choice that explains itself says why on its row');
  assert.match(html, /data-chat-recommended/);
  assert.match(html, /Recommended/);
  assert.match(html, /href="\/runs\/r-1"/, 'the link her words carry is a plain link beside the Answer');
  assert.match(html, /disabled=""/, 'nothing is chosen yet, so the Answer is off');
});

test('her proposal is drawn as its actions, each choice said whole by its own button, and answered it says what was chosen', () => {
  const asks = renderToStaticMarkup(
    createElement(ChatActions, { ask: askEvent('proposal', [askQuestion(true)]), onAnswer: () => undefined }),
  );
  assert.match(asks, /data-chat-ask="actions"/);
  assert.match(asks, /data-chat-tag="proposes"/);
  assert.match(asks, /data-chat-action="Cut it on read"/);
  assert.match(asks, /data-chat-action="First line as it is"/);
  assert.doesNotMatch(asks, /data-chat-option=/, 'a choice with nothing to explain is a button, never a row of a form');
  const chose = renderToStaticMarkup(
    createElement(ChatActions, {
      ask: askEvent('proposal', [askQuestion(true)], { [askQuestion().question]: 'Cut it on read' }),
      onAnswer: () => undefined,
    }),
  );
  assert.match(chose, /data-chat-tag="proposed"/);
  assert.match(chose, /data-chat-chose/);
  assert.match(chose, new RegExp(`You chose: Cut it on read · ${timeOfDay(CHOSE_AT)}`));
  assert.doesNotMatch(chose, /data-chat-action=/, 'an answered proposal asks nothing more');
});

test('her several questions are drawn as the flow: a tab each and Submit, numbered choices, her own words, and N OF M', () => {
  const questions = [askQuestion(), { ...askQuestion(), question: 'And the values?', header: 'Values' }];
  const html = renderToStaticMarkup(createElement(ChatAskMany, { ask: askEvent('question', questions), onAnswer: () => undefined }));
  assert.match(html, /data-chat-ask="many"/);
  assert.match(html, /data-chat-qtab="on"[^>]*>Summary/);
  assert.match(html, /data-chat-qtab="off"[^>]*>Values/);
  assert.match(html, /Submit/);
  assert.match(html, /1\./, 'the choices are numbered');
  assert.match(html, /data-chat-option="own"/);
  assert.match(html, /Your own words/);
  assert.match(html, /data-chat-own/);
  assert.match(html, /data-chat-of[^>]*>1 OF 2/);
  assert.doesNotMatch(html, /data-chat-submit/, 'the Submit tab is reached, never drawn beside the question in hand');
  assert.doesNotMatch(html, /data-chat-asked/, 'while it waits, the tabs say the questions: nothing is said twice');
});

test('her several questions answered keep each question beside the answer it was given, the tabs that asked them gone', () => {
  const questions = [askQuestion(), { ...askQuestion(), question: 'And the values?', header: 'Values' }];
  const chose = { [askQuestion().question]: 'Cut it on read', 'And the values?': 'Hand them' };
  const html = renderToStaticMarkup(createElement(ChatAskMany, { ask: askEvent('question', questions, chose), onAnswer: () => undefined }));
  assert.doesNotMatch(html, /data-chat-qtab/, 'an answered ask asks nothing more');
  assert.match(html, /data-chat-asked/);
  for (const [question, answer] of Object.entries(chose))
    assert.match(
      html,
      new RegExp(`${question.replace(/[?]/g, '\\?')}</dt><dd[^>]*>${answer}`),
      'what she asked stands over what the person answered it, so the history reads as a history',
    );
  assert.match(html, new RegExp(`You chose: Cut it on read · Hand them · ${timeOfDay(CHOSE_AT)}`));
});

test("her chat draws a proposal she links as the page's own part, in her frame", async () => {
  const { ChatProposal } = await import('../src/components/nemia/chat/ChatProposal.tsx');
  const html = await withProposal(proposalIn('waiting', true), createElement(ChatProposal, { factory: 'acme', name: 'nemia-ab12c' }));
  assert.match(html, /^<div data-chat-proposal="nemia-ab12c" data-factory="acme"/);
  assert.match(html, /data-proposal="nemia-ab12c"/);
  assert.match(html, /data-proposal-widens/);
});

test('her policy lists her rules over proposals: in force with a Drop, and proposed with a Confirm until it is in force', async () => {
  const { PolicyRules } = await import('../src/components/nemia/PolicyRules.tsx');
  const gate = { id: 'default', answer: 'approve' as const, when: ['recommends' as const], from: 'default' as const, words: 'Approve.' };
  const hires = {
    id: 'hires',
    answer: 'approve-proposal' as const,
    factory: 'acme',
    resources: ['hires'],
    resourceNames: [],
    verbs: ['update' as const],
    widens: false,
    proposedBy: ['nemia'],
    words: 'Approve proposals in acme that update hires, made by nemia, that never widen access.',
  };
  const list = {
    agent: 'nemia',
    file: '/store/auto/nemia.json',
    isDefault: false,
    rules: [gate],
    proposalRules: [hires],
    builtin: gate,
    proposed: {
      file: '/store/auto/nemia.proposed.json',
      at: '2026-11-06T10:00:00.000Z',
      rules: [],
      proposalRules: [
        { ...hires, from: 'proposed' as const, confirmed: true },
        { ...hires, id: 'skills', resources: ['skills'], words: 'Approve proposals in acme that update skills.', confirmed: false },
      ],
      guidance: [],
      stale: false,
    },
    instruction: null,
  };
  const html = await routedWith(createElement(PolicyRules, { agent: 'nemia' }), [[['policy', 'nemia'], list]]);
  assert.match(html, /data-auto-proposal-rules[^]*data-auto-proposal-rule="hires"[^]*data-auto-drop/, 'in force, with a Drop');
  assert.match(html, /data-auto-proposed[^]*data-auto-proposal-rule="hires"[^]*data-auto-confirmed/, 'proposed and in force');
  assert.match(html, /data-auto-proposal-rule="skills"[^]*data-auto-confirm=/, 'proposed, with a Confirm');
  assert.doesNotMatch(html, /data-auto-rule="hires"/, 'a rule over proposals is not a gate rule');
});
