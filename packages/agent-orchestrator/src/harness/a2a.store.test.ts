/**
 * A step on a remote A2A agent (`harness: a2a:<name>`), up to the engine: the store's `a2a-agents.json` and each way it is refused, the
 * variable a secret is read from and the refusal that names it, the keys a remote step may not set, each refused at load from the step and
 * from its agent, `nemia start`'s refusal of a name the file does not declare, and what the tick files — no harness arguments, no schema,
 * no hold, and a brief that names nothing of this machine. The agent itself, reached over HTTP, is `remote-step.test.ts`'s. `WF_ROOT` is
 * set before the import, since the module reads it as it loads.
 *
 * The holder's branch of `credentials` is here too, beside the remote one: a lease written by hand for a process that is alive and
 * is not this one — the test runner that started it, `process.ppid`, which needs no process started — and the token written into the
 * file a holder's engine mints it in. That path is the runtime's own, and that the two processes agree on
 * it is what `apps/api/test/holder-stream.boundary.test.ts` proves with a real holder; this file proves the branch that reads it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STEP_KEYS, WorkflowError } from '../step/step.ts';
import { REMOTE_REFUSED_KEYS } from './harness.ts';
import { parseWorkflow } from '../workflow/index.ts';
import { parseFolder } from '../folder/folder.ts';
import { parseAgent, type Agents } from '../agents/agents.ts';
import { envNameOf, readRemoteAgents } from './a2a.store.ts';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import type { EnginePhase } from '../views/views-words.ts';

const ROOT = scratch('wf-a2a-agents-');
process.env.WF_ROOT = ROOT;
const { advanceRun, remoteAgents, retryRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { engineOf } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../record/record.store.ts');
const { credentials, missingCredential, readRemote } = await import('../runtime-client.ts');
const { remoteBrief } = await import('../run.ts');

const FILE = path.join(ROOT, 'a2a-agents.json');
const declare = (agents: unknown): void => fs.writeFileSync(FILE, typeof agents === 'string' ? agents : JSON.stringify(agents));

/** What `fn` is refused with — exit code 2, a person's to fix — as its message. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, String(err));
    return (err as Error).message;
  }
  return assert.fail('it was not refused');
}

/** What `fn`, which returns a Promise, is refused with — exit code 2, a person's to fix — as its message. */
async function rejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, String(err));
    return (err as Error).message;
  }
  return assert.fail('it was not refused');
}

/** What `fn` is refused with at load, as a `WorkflowError`'s message. */
function loadRefusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  return assert.fail('it was not refused');
}

test('a store with no a2a-agents.json declares no agent, and the file maps each name to its entry in its order', () => {
  assert.equal(readRemoteAgents(path.join(ROOT, 'nowhere.json')).size, 0);
  const file = path.join(ROOT, 'two.json');
  fs.writeFileSync(file, JSON.stringify({ reviewer: { url: 'https://a.example/reviewer' }, 'second-opinion': { card: { name: 'x' } } }));
  assert.deepEqual(
    [...readRemoteAgents(file)],
    [
      ['reviewer', { url: 'https://a.example/reviewer' }],
      ['second-opinion', { card: { name: 'x' } }],
    ],
  );
});

test('a2a-agents.json is refused, naming the file and the fix, for text that is not JSON, a list, a name no step can give and an entry that is not an object', () => {
  const file = path.join(ROOT, 'bad.json');
  const refused = (text: string) => {
    fs.writeFileSync(file, text);
    return refusal(() => readRemoteAgents(file));
  };
  const shape = '{ "reviewer": { "url": "https://…" } }';
  const notJson = refused('{ reviewer: ');
  assert.match(notJson, /bad\.json: is not JSON/);
  assert.ok(notJson.includes(shape), `the fix names the shape the file takes: ${notJson}`);
  const list = refused('[]');
  assert.match(list, /bad\.json: is a list/);
  assert.ok(list.includes(shape), `the fix names the shape the file takes: ${list}`);
  assert.match(refused('"reviewer"'), /bad\.json: is `"reviewer"`, and it is an object/);
  const capital = refused(JSON.stringify({ Reviewer: { url: 'https://a.example' } }));
  assert.match(capital, /`Reviewer` is not a name a step can give/);
  assert.match(capital, /lowercase words joined by dashes/);
  assert.match(capital, /Rename it\./);
  assert.match(
    refused(JSON.stringify({ code_review: { url: 'https://a.example' } })),
    /`code_review` is not a name a step can give/,
    'an underscore is refused: one with a dash in a variable',
  );
  const string = refused(JSON.stringify({ reviewer: 'https://a.example' }));
  assert.match(string, /`reviewer` is given "https:\/\/a\.example"/);
  assert.ok(string.includes('{ "url": "https://…" }'), `the fix names the shape of an agent: ${string}`);
});

test("two names whose secrets' variables can meet are refused: a card the other party writes could name a scheme given the other's secret", () => {
  const file = path.join(ROOT, 'meet.json');
  fs.writeFileSync(file, JSON.stringify({ acme: { url: 'https://acme.example' }, 'acme-internal': { url: 'https://internal.example' } }));
  const refused = refusal(() => readRemoteAgents(file));
  assert.match(refused, /`acme` and `acme-internal` are both declared/);
  assert.match(refused, /`WF_A2A_ACME_INTERNAL_TOKEN`/);
  assert.match(refused, /`internal-token`/);
  assert.match(refused, /Rename one/);
  assert.equal(
    envNameOf('acme', 'internal-token'),
    envNameOf('acme-internal', 'token'),
    'the refusal is about a real collision, not a style',
  );
  fs.writeFileSync(file, JSON.stringify({ acme: { url: 'https://acme.example' }, acmecorp: { url: 'https://corp.example' } }));
  assert.equal(readRemoteAgents(file).size, 2, 'names that share a beginning without a dash meet nowhere, and are both declared');
});

test("an entry the runtime would refuse is left out of remoteAgents() and said by readRemote(), naming the file and the entry, in the runtime's words", () => {
  declare({ reviewer: { url: 'ftp://a.example' }, critic: { url: 'https://a.example/critic' } });
  try {
    assert.deepEqual([...remoteAgents().keys()], ['critic'], 'the entry refused is left out, and the others are not');
    const refused = readRemote().refused.get('reviewer')!;
    assert.ok(refused.startsWith(`${FILE}: \`reviewer\`: `), refused);
    assert.match(refused, /the `a2a:reviewer` harness/);
    declare({ reviewer: { card: { name: 'no interfaces' } } });
    const noInterfaces = readRemote().refused.get('reviewer')!;
    assert.ok(noInterfaces.startsWith(`${FILE}: \`reviewer\`: `), noInterfaces);
    assert.match(noInterfaces, /`card`/);
    assert.match(noInterfaces, /`supportedInterfaces` is missing/);
    declare({
      reviewer: { card: { supportedInterfaces: [{ url: 3, protocolBinding: 'JSONRPC' }] } },
      critic: { url: 'https://a.example/critic' },
    });
    const wrong = readRemote().refused.get('reviewer')!;
    assert.ok(wrong.startsWith(`${FILE}: \`reviewer\`: `), wrong);
    assert.match(wrong, /its `supportedInterfaces\.0\.url` is 3, where an A2A 1\.0 card holds string/);
    assert.deepEqual([...remoteAgents().keys()], ['critic'], 'a card that does not decode is left out');
    declare({ reviewer: { url: 'https://a.example/reviewer' } });
    assert.deepEqual([...remoteAgents().keys()], ['reviewer']);
    assert.equal(readRemote().refused.size, 0);
    declare('{ reviewer: ');
    assert.match(
      refusal(() => remoteAgents()),
      /a2a-agents\.json: is not JSON/,
      'a file refused as it stands is refused by remoteAgents()',
    );
    assert.match(readRemote().unread!, /a2a-agents\.json: is not JSON/, 'and said by readRemote()');
    assert.equal(readRemote().agents.size, 0, 'with no agent');
  } finally {
    fs.rmSync(FILE, { force: true });
  }
});

test('a secret is read from WF_A2A_<NAME>_<SCHEME>, upper case with a dash made an underscore, and never for a local harness', () => {
  assert.equal(envNameOf('reviewer', 'bearer'), 'WF_A2A_REVIEWER_BEARER');
  assert.equal(envNameOf('second-opinion', 'api-key'), 'WF_A2A_SECOND_OPINION_API_KEY');
  process.env.WF_A2A_SECOND_OPINION_API_KEY = 's3cret';
  try {
    assert.equal(credentials('api-key', 'https://a.example', 'a2a:second-opinion'), 's3cret');
    assert.equal(credentials('api-key', 'https://a.example', 'a2a:reviewer'), undefined, "another agent's variable");
    assert.equal(credentials('api-key', 'https://a.example', 'claude'), undefined, 'a local harness is given no secret');
    process.env.WF_A2A_SECOND_OPINION_API_KEY = '';
    assert.equal(credentials('api-key', 'https://a.example', 'a2a:second-opinion'), undefined, 'an empty variable is none');
  } finally {
    delete process.env.WF_A2A_SECOND_OPINION_API_KEY;
  }
});

test("the holder's token is answered for its scheme and a harness the lease names, and for nothing else", async (t) => {
  const { procStartOf } = await import('../runner.ts');
  const { BEARER } = await import('agent-runtime');
  const engineRoot = path.join(ROOT, 'engine');
  const tokenFile = path.join(engineRoot, 'a2a', 'holder-token');
  const writeToken = (token: string) => {
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  };
  const forgetToken = () => fs.rmSync(tokenFile, { force: true });
  const daemonJson = path.join(ROOT, 'daemon.json');
  const held = process.ppid;
  t.after(() => {
    fs.rmSync(daemonJson, { force: true });
    forgetToken();
  });
  const lease = (over: Record<string, unknown> = {}) =>
    fs.writeFileSync(
      daemonJson,
      JSON.stringify({
        pid: held,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        cwd: ROOT,
        every: 4000,
        passedAt: new Date().toISOString(),
        procStart: procStartOf(held),
        holder: { claude: { name: 'claude' } },
        ...over,
      }),
    );
  writeToken('held-tok-1');
  lease();
  assert.equal(credentials(BEARER, 'http://127.0.0.1:45671/claude', 'claude'), 'held-tok-1', 'the holder of this store holds `claude`');
  assert.equal(credentials('api-key', 'http://127.0.0.1:45671/claude', 'claude'), undefined, 'another scheme is not the card’s bearer');
  assert.equal(credentials(BEARER, 'http://127.0.0.1:45671/codex', 'codex'), undefined, 'a harness the lease names no holder for');
  lease({ pid: process.pid, procStart: procStartOf(process.pid) });
  assert.equal(credentials(BEARER, 'http://127.0.0.1:45671/claude', 'claude'), undefined, 'a lease this process holds: never itself');
  lease({ stoppedAt: new Date().toISOString() });
  assert.equal(credentials(BEARER, 'http://127.0.0.1:45671/claude', 'claude'), undefined, 'a lease let go names no holder');
  fs.rmSync(daemonJson, { force: true });
  assert.equal(credentials(BEARER, 'http://127.0.0.1:45671/claude', 'claude'), undefined, 'and no lease at all names none');
  lease();
  forgetToken();
  assert.equal(
    credentials(BEARER, 'http://127.0.0.1:45671/claude', 'claude'),
    undefined,
    'a store whose token file is gone answers none, and the follow is refused in words naming the fix',
  );
});

test('a secret not given is refused naming the variable to set, where to set it, and what to do after', () => {
  const said = missingCredential('api-key', 'https://a.example', 'a2a:second-opinion');
  assert.match(
    said,
    /^set WF_A2A_SECOND_OPINION_API_KEY to the secret for the scheme `api-key` second-opinion's card declares, in the environment of the daemon — the api, or `nemia up` —/,
  );
  assert.match(said, /restart it; then `nemia retry` the step/);
});

test('harness: a2a:<name> is a harness a step can run on, and a name of another shape is refused', () => {
  assert.equal(parseWorkflow('ask', '---\nplace: git\nharness: a2a:reviewer\n---\nReview it.\n').harness, 'a2a:reviewer');
  assert.equal(parseWorkflow('ask', '---\nplace: git\nharness: a2a:second-opinion\n---\nReview it.\n').harness, 'a2a:second-opinion');
  for (const bad of ['a2a:', 'a2a:Reviewer', 'a2a:code_review', 'a2a:-x', 'a2a:a b']) {
    assert.match(
      loadRefusal(() => parseWorkflow('ask', `---\nplace: git\nharness: ${bad}\n---\nReview it.\n`)),
      /names a remote A2A agent, and `.*` is not a name one is declared under/,
      bad,
    );
  }
  assert.match(
    loadRefusal(() => parseWorkflow('ask', '---\nplace: git\nharness: remote\n---\nx\n')),
    /The harnesses are: .*`a2a:<name>` for a remote A2A agent/,
  );
});

/** Each key a remote step may not set, with a value the parser takes on a local harness. */
const LOCAL_ONLY: Record<string, string> = {
  model: 'opus',
  effort: 'high',
  context: '200k',
  background: 'true',
  remote: 'true',
  permissionMode: 'plan',
  sandbox: 'read-only',
  tools: 'Read',
  disallowedTools: 'Bash',
  allowedTools: 'Edit(**)',
  denials: 'fail',
  budget: '5',
  output: 'schema.json',
  tally: 'issues',
  resume: 'plan',
  check: 'npm test',
  skills: 'review-a-change',
  writable: 'web',
  reads: 'inbox',
};

test('each key that tells a harness of ours how to run is refused on a remote step, naming the key and the harness', () => {
  for (const [key, value] of Object.entries(LOCAL_ONLY)) {
    const refused = loadRefusal(() =>
      parseWorkflow('ask', `---\nplace: git\nharness: a2a:reviewer\n${key}: ${value}\n---\nx\n`, () => '{"type":"object"}'),
    );
    assert.ok(refused.startsWith(`ask: \`${key}: ${value}\` `), `${key}: ${refused}`);
    assert.match(refused, /`harness: a2a:reviewer`/, key);
    assert.match(refused, /Delete the line/, key);
  }
  assert.match(
    loadRefusal(() => parseWorkflow('ask', '---\nplace: git\nharness: a2a:reviewer\nloop: plan\n---\nx\n')),
    /^ask: `loop: plan` .*remote A2A agent/,
  );
  assert.match(
    loadRefusal(() => parseWorkflow('ask', '---\nplace: git\nharness: a2a:reviewer\nworkspace: main\n---\nx\n')),
    /^ask: `workspace: main` runs the step in the repository's own checkout/,
  );
  assert.deepEqual(
    REMOTE_REFUSED_KEYS,
    STEP_KEYS.filter((key) => key in LOCAL_ONLY || key === 'loop'),
    "what the board's form leaves off a remote step is what the load refuses there, key for key, in the package's order",
  );
  const ok = parseWorkflow(
    'ask',
    '---\nplace: git\nharness: a2a:reviewer\nafter: plan\ninput: plan\ngate: true\nretries: 1\ndeadlineSeconds: 600\n---\nReview the plan.\n',
  );
  assert.equal(ok.harness, 'a2a:reviewer', 'a remote step may say where it sits, its gate, its tries, its deadline, what it reads');
});

const agentsOf = (files: Record<string, string>): Agents =>
  new Map(Object.entries(files).map(([name, text]) => [name, parseAgent(name, text)]));

test("a key a remote step's agent gives is refused as the step's own is, and so are its skills and its harness prompt", () => {
  const refused = loadRefusal(() =>
    parseWorkflow(
      'ask',
      '---\nplace: git\nagent: critic\nharness: a2a:reviewer\n---\nx\n',
      undefined,
      agentsOf({ critic: '---\nmodel: opus\n---\nCriticise.\n' }),
    ),
  );
  assert.ok(refused.startsWith('ask: `model: opus` '), refused);
  assert.match(refused, /Delete the line/);
  assert.match(refused, /from the agent it names/);
  assert.match(
    loadRefusal(() =>
      parseWorkflow(
        'ask',
        '---\nplace: git\nagent: critic\n---\nx\n',
        undefined,
        agentsOf({ critic: '---\nharness: a2a:reviewer\ntools: Read\n---\nCriticise.\n' }),
      ),
    ),
    /`tools: Read` fences a session on this machine/,
    'and from an agent that itself names the remote harness',
  );
  const skilled = loadRefusal(() =>
    parseWorkflow(
      'ask',
      '---\nplace: git\nagent: critic\nharness: a2a:reviewer\n---\nx\n',
      undefined,
      agentsOf({ critic: '---\nskills: look\n---\nCriticise.\n' }),
      new Map([['look', { dir: ROOT }]]) as never,
    ),
  );
  assert.match(
    skilled,
    /gives Claude Code skills .*`harness: a2a:reviewer` is a remote A2A agent, which has the skills its operator gave it/,
  );
  const prompted = loadRefusal(() =>
    parseWorkflow(
      'ask',
      '---\nplace: git\nagent: critic\nharness: a2a:reviewer\n---\nx\n',
      undefined,
      agentsOf({ critic: '---\nharnessPrompt: keep\n---\nCriticise.\n' }),
    ),
  );
  assert.match(prompted, /`harnessPrompt: keep` shapes Claude Code's own prompt, and `harness: a2a:reviewer` is a remote A2A agent/);
  const told = parseWorkflow(
    'ask',
    '---\nplace: git\nagent: critic\nharness: a2a:reviewer\n---\nThe plan.\n',
    undefined,
    agentsOf({ critic: '---\ndescription: Criticises\n---\nCriticise.\n' }),
  );
  assert.equal(told.harness, 'a2a:reviewer', 'an agent of instructions alone is sent them in the brief');
});

test("a loop's target on a remote agent is refused; a step inside the loop may be one", () => {
  const LOOPING = JSON.stringify({
    type: 'object',
    properties: { again: { type: 'boolean' } },
    required: ['again'],
    additionalProperties: false,
  });
  const read = () => LOOPING;
  const refused = loadRefusal(() =>
    parseFolder(
      [
        ['build', '---\nplace: git\nharness: a2a:builder\n---\nBuild.\n'],
        ['review', '---\nafter: build\nplace: git\nloop: build\noutput: again.json\n---\nReview.\n'],
      ],
      read,
    ),
  );
  assert.ok(refused.startsWith('review: `loop: build`'), refused);
  assert.match(refused, /build runs on `harness: a2a:builder`/);
  assert.match(refused, /Loop back to a step on a harness of ours/);
  const inside = parseFolder(
    [
      ['build', '---\nplace: git\n---\nBuild.\n'],
      ['ask', '---\nafter: build\nplace: git\nharness: a2a:second-opinion\n---\nGive a second opinion.\n'],
      ['review', '---\nafter: ask\nplace: git\nloop: build\noutput: again.json\n---\nReview.\n'],
    ],
    read,
  );
  assert.equal(inside.find((s) => s.name === 'ask')!.harness, 'a2a:second-opinion');
});

/** The engine stand-in, with what each task is doing and how it signed off settled by hand, and every task's spec as it was filed. */
const board = () => {
  const held = engine();
  const settle = (id: string, phase: EnginePhase, closeout?: unknown) => held.settle(id, phase, closeout === undefined ? {} : { closeout });
  return { e: engineOf(held.layer), tasks: held.tasks, settle };
};

function team(name: string, steps: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
}
const HERE = path.join(ROOT, 'here');
fs.mkdirSync(HERE, { recursive: true });
const FOLDER = 'workspace: folder\n';

test('nemia start refuses a step whose remote agent a2a-agents.json does not declare, before a run is written, with the entry to add', async () => {
  const dir = team('undeclared', { ask: `---\n${FOLDER}harness: a2a:reviewer\n---\nReview it.\n` });
  const before = fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).length : 0;
  const none = await rejection(() => runPlaced(startRun({ brief: 'a review', repo: HERE, workflowDir: dir })));
  assert.equal(
    none,
    `ask: \`harness: a2a:reviewer\` names a remote A2A agent \`reviewer\`, and ${FILE} declares none. Add it there — \`{ "reviewer": { "url": "https://…" } }\`, the agent's base URL, where its card is served — or name a declared one.`,
  );
  declare({ critic: { url: 'https://a.example/critic' } });
  try {
    assert.match(
      await rejection(() => runPlaced(startRun({ brief: 'a review', repo: HERE, workflowDir: dir }))),
      /and .*a2a-agents\.json declares `critic`\. Add it there/,
    );
    declare({ reviewer: { url: 'ftp://a.example' }, critic: { url: 'https://a.example/critic' } });
    const entry = await rejection(() => runPlaced(startRun({ brief: 'a review', repo: HERE, workflowDir: dir })));
    assert.ok(
      entry.startsWith(`ask: \`harness: a2a:reviewer\` names a remote A2A agent whose entry is refused. ${FILE}: \`reviewer\`: `),
      `an entry the runtime refuses is refused for the step that names it, in the file's words: ${entry}`,
    );
    declare('[]');
    assert.match(
      await rejection(() => runPlaced(startRun({ brief: 'a review', repo: HERE, workflowDir: dir }))),
      /^ask: `harness: a2a:reviewer` names a remote A2A agent, and the file that declares them is refused\. .*a2a-agents\.json: is a list/,
      'a file refused as it stands is refused for any step',
    );
    const after = fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).length : 0;
    assert.equal(after, before, 'no run was written');
  } finally {
    fs.rmSync(FILE, { force: true });
  }
});

test('the tick files a remote step with no harness arguments, schema, hold or session, and a brief that names nothing of this machine', async () => {
  declare({ reviewer: { url: 'https://a.example/reviewer' } });
  try {
    const dir = team('remote', {
      draft: `---\n${FOLDER}---\nDraft a note on tides.\n`,
      ask: `---\n${FOLDER}after: draft\nharness: a2a:reviewer\n---\nReview the draft.\n`,
    });
    const input = path.join(ROOT, 'tides.csv');
    fs.writeFileSync(input, 'hour,height\n');
    const run = await runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir, inputs: [input] }));
    const { e, tasks, settle } = board();
    await runWith(e, advanceRun(readRun(run.id)));
    const draft = tasks.get(`${run.id}-draft`)!.spec;
    assert.ok('config' in draft && 'closeoutSchema' in draft, 'a local step is filed as it always was');

    settle(`${run.id}-draft`, 'succeeded', { outcome: 'done', summary: 'drafted', artifacts: [], needs: null });
    await runWith(e, advanceRun(readRun(run.id)));
    const ask = tasks.get(`${run.id}-ask`)?.spec;
    assert.ok(ask, `signed off, the draft lets the remote step be filed: ${[...tasks.keys()].join(', ')}`);
    assert.equal(ask.harness, 'a2a:reviewer');
    for (const key of ['config', 'closeoutSchema', 'holdOpen', 'resumeFrom'])
      assert.equal(key in ask, false, `${key} is not on a remote filing at all`);
    assert.match(ask.brief, /^Review the draft\.\n\n## What was asked for\n\na note on tides\n/);
    assert.match(
      ask.brief,
      /Files were given with it \(`nemia start --input`\): `tides\.csv`\. They stay on the machine that runs this workflow/,
    );
    assert.equal(ask.brief.includes(ROOT), false, `no path under the store: ${ask.brief}`);
    assert.doesNotMatch(ask.brief, /closeout|artifacts|## Finishing/i, 'no contract a remote agent could not keep');
  } finally {
    fs.rmSync(FILE, { force: true });
  }
});

test('nemia retry refuses --model and --budget on a remote step, in the words its load refuses the keys in, and asks a try without them', async () => {
  declare({ reviewer: { url: 'https://a.example/reviewer' } });
  try {
    const dir = team('retried', { ask: `---\n${FOLDER}harness: a2a:reviewer\n---\nReview it.\n` });
    const run = await runPlaced(startRun({ brief: 'a review', repo: HERE, workflowDir: dir }));
    const { e, settle } = board();
    await runWith(e, advanceRun(readRun(run.id)));
    settle(`${run.id}-ask`, 'failed');
    const model = await runWith(e, retryRun(run.id, 'ask', { mode: 'fresh', model: 'haiku' })).then(
      () => assert.fail('--model was not refused'),
      (err: Error & { exitCode?: number }) => err,
    );
    assert.equal(model.exitCode, 2);
    assert.equal(
      model.message,
      `\`--model haiku\` is how a harness of ours is to run the session, and a remote agent runs as its operator configured it: A2A carries no such argument, and the runtime refuses a task filed with one, and ask runs on \`harness: a2a:reviewer\`, a remote A2A agent: its try would be sent without it. Ask without --model: nemia retry ${run.id} ask.`,
    );
    await assert.rejects(
      runWith(e, retryRun(run.id, 'ask', { mode: 'nudge', budget: 5 })),
      (err: Error & { exitCode?: number }) =>
        err.exitCode === 2 && err.message.startsWith('`--budget 5` ') && err.message.includes(`nemia retry ${run.id} ask`),
    );
    const asked = await runWith(e, retryRun(run.id, 'ask', { mode: 'fresh' }));
    assert.equal(asked.ask.try, 2, 'without them, the same try is asked for');
  } finally {
    fs.rmSync(FILE, { force: true });
  }
});

test("a remote step after a run (`--after`) is told that run's work stays here and is summarised below, never that it is in its workspace", () => {
  const steps = parseFolder([['ask', '---\nplace: git\nharness: a2a:reviewer\n---\nReview it.\n']]);
  const run = { id: 'r-1', brief: 'a review', steps: {}, workflowDir: '/store/workflows/w' } as never;
  const built = parseFolder([['build', '---\nplace: git\n---\nBuild.\n']])[0];
  const parents = [
    {
      run: 'r-0',
      asked: 'build the tides page',
      steps: [{ step: built, said: { outcome: 'done', summary: 'Built it.', artifacts: [], needs: null } }],
    },
    { run: 'r-00', unreadable: 'its record is gone' },
  ] as never;
  const brief = remoteBrief(steps[0], run, steps, undefined, undefined, parents);
  assert.match(
    brief,
    /## From run r-0\n\nThis run waited on r-0 \(`--after`\) and started once it landed\. Its work stays on the machine that runs this workflow and is not sent to you: what it was asked\nand what its last steps said when they signed off are summarised below/,
  );
  assert.match(
    brief,
    /## From run r-00\n\nThis run waited on r-00 .*not sent to you, and what it concluded cannot be given here — its record is gone\./,
  );
  assert.match(brief, /Built it\./);
  assert.doesNotMatch(brief, /this workspace|on disk|Read the change/);
});

test("a remote step's try is a new task, told which try and what a person said, with no path", () => {
  const steps = parseFolder([['ask', '---\nplace: git\nharness: a2a:reviewer\nretries: 1\n---\nReview it.\n']]);
  const run = { id: 'r-1', brief: 'a review', steps: {}, workflowDir: '/store/workflows/w' } as never;
  const brief = remoteBrief(steps[0], run, steps, undefined, {
    try: 2,
    by: 'ask',
    mode: 'nudge',
    resumed: false,
    status: 'failed',
    message: 'Look at the tables too.',
  });
  assert.match(
    brief,
    /## Try 2\n\nThe last try of this step ended `failed`\. A person asked for this try \(`nemia retry`\), with what they said below\. This is a new task/,
  );
  assert.match(brief, /## Your answer\n\n[`~]+text\nLook at the tables too\.\n/);
  const auto = remoteBrief(steps[0], run, steps, undefined, { try: 2, by: 'retries', mode: 'nudge', resumed: false, status: 'failed' });
  assert.match(auto, /The run filed this try itself: this step declares `retries: 1`\./);
  assert.doesNotMatch(auto, /\/store/);
});
