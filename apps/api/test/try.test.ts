/**
 * An agent of yours tried on a short brief: the try's folder written in the store's `tries/`, and a run of it started with no repository —
 * a folder run, its one step naming the agent and fenced to its folder with a dollar to spend. The run is listed as a try, one at a time,
 * and the board removes it. Every refusal is made to refuse, and leaves no run behind: a repository agent, an empty brief, a try while one
 * moves, a name a try's folder cannot take, a skill only the repository has, and the guard's.
 *
 * `WF_ROOT` points at a scratch directory before the api loads: agent-orchestrator locates its store when the module loads. Your agents are
 * `scribe`, with a result schema beside it; `borrower`, which gives a skill only the repository's .claude/skills has; `agents` and
 * `skills`, whose names a try's folder cannot take; and those a try's fence does not reach: `coder` on codex, `faraway`, a remote A2A
 * agent, and `bridged`, bridged to claude.ai. The repository's own agents are `critic` and `grader`, the second with a result schema beside
 * it.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const root = scratch('hkb-api-try-');
process.env.WF_ROOT = root;
/** The board's repository: a plain directory, with agents of its own and a skill only it has. */
const repo = scratch('hkb-api-try-repo-');
process.env.HKB_REPO = repo;

const YOURS = path.join(root, 'workflows', 'agents');
const TRIES = path.join(root, 'tries');
const RUNS = path.join(root, 'runs');

fs.mkdirSync(YOURS, { recursive: true });
const SCRIBE =
  '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\neffort: low\npermissionMode: acceptEdits\noutput: scribe.schema.json\n---\nWrite the notes.\n';
fs.writeFileSync(path.join(YOURS, 'scribe.md'), SCRIBE);
fs.writeFileSync(
  path.join(YOURS, 'scribe.schema.json'),
  JSON.stringify({ type: 'object', additionalProperties: false, required: ['notes'], properties: { notes: { type: 'string' } } }),
);
fs.writeFileSync(
  path.join(YOURS, 'borrower.md'),
  '---\ndescription: Use this to borrow.\ntools: Read, Skill\nskills: theirs\n---\nBorrow it.\n',
);
fs.mkdirSync(path.join(repo, '.claude', 'skills', 'theirs'), { recursive: true });
fs.writeFileSync(
  path.join(repo, '.claude', 'skills', 'theirs', 'SKILL.md'),
  "---\nname: theirs\ndescription: The repository's own.\n---\nDo it their way.\n",
);
for (const name of ['agents', 'skills'])
  fs.writeFileSync(path.join(YOURS, `${name}.md`), `---\ndescription: Use this as ${name}.\n---\nDo it.\n`);
fs.writeFileSync(path.join(YOURS, 'coder.md'), '---\ndescription: Use this to code.\nharness: codex\n---\nCode it.\n');
fs.writeFileSync(path.join(YOURS, 'faraway.md'), '---\ndescription: Use this far away.\nharness: a2a:faraway\n---\nDo it there.\n');
fs.writeFileSync(path.join(YOURS, 'bridged.md'), '---\ndescription: Use this from a phone.\nremote: true\n---\nDo it.\n');
fs.mkdirSync(path.join(repo, 'workflows', 'agents'), { recursive: true });
fs.writeFileSync(path.join(repo, 'workflows', 'agents', 'critic.md'), '---\ndescription: Use this to criticise.\n---\nCriticise it.\n');
fs.writeFileSync(
  path.join(repo, 'workflows', 'agents', 'grader.md'),
  '---\ndescription: Use this to grade.\noutput: grader.schema.json\n---\nGrade it.\n',
);
fs.writeFileSync(
  path.join(repo, 'workflows', 'agents', 'grader.schema.json'),
  JSON.stringify({ type: 'object', properties: { grade: { type: 'string' } } }),
);
/** A workflow folder whose run is no try, to hold the two apart. */
const other = path.join(root, 'workflows', 'notes');
fs.mkdirSync(other, { recursive: true });
fs.writeFileSync(
  path.join(other, 'write.md'),
  '---\nworkspace: folder\npermissionMode: dontAsk\nallowedTools: Edit(**)\n---\nWrite the note.\n',
);

const { app } = await import('../src/app.ts');
const { start } = await import('agent-orchestrator');
type RunSummary = import('../src/runs/runs.ts').RunSummary;
type RunDetail = import('../src/detail/detail.ts').RunDetail;
type AgentListing = import('../src/agents/agents.ts').AgentListing;

const json = { 'content-type': 'application/json' };
const tryIt = (name: string, body: unknown, from = 'yours', headers: Record<string, string> = json) =>
  app.request(`/api/agents/${from}/${name}/try`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const remove = (id: string, headers: Record<string, string> = json) =>
  app.request(`/api/runs/${id}`, { method: 'DELETE', headers, body: '{}' });

const records = (): string[] =>
  fs.existsSync(RUNS)
    ? fs
        .readdirSync(RUNS)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];

/** A request refused with `status` and words `pattern` matches, with no run written and the tries as they were. */
async function refused(res: Response | Promise<Response>, status: number, pattern: RegExp): Promise<string> {
  const runs = records();
  const tries = fs.existsSync(TRIES) ? fs.readdirSync(TRIES).sort() : [];
  const answer = await res;
  const body = (await answer.json()) as { error: string };
  assert.equal(answer.status, status, body.error);
  assert.match(body.error, pattern);
  assert.deepEqual(records(), runs, 'a refused try starts no run');
  assert.deepEqual(fs.existsSync(TRIES) ? fs.readdirSync(TRIES).sort() : [], tries, 'and writes no try folder');
  return body.error;
}

/** A task's journal, as the engine writes it: filed in the step's folder, and signed off. */
function signedOff(taskId: string, cwd: string): void {
  const at = '2026-09-26T00:10:00.000Z';
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    [
      { kind: 'filed', at, brief: 'Write it.', cwd, maxAttempts: 1, harness: 'claude' },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      {
        kind: 'ended',
        at,
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] },
      },
      { kind: 'settled', at, outcome: 'succeeded' },
    ]
      .map((e) => `${JSON.stringify(e)}\n`)
      .join(''),
  );
}

const listed = async (): Promise<RunSummary[]> => (await (await app.request('/api/runs')).json()) as RunSummary[];

let first = '';

/** A try ended, as a tick and the engine leave it: its step filed, and signed off. */
function ended(id: string): void {
  const file = path.join(RUNS, `${id}.json`);
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cwd = path.join(run.workspace, 'try');
  fs.mkdirSync(cwd, { recursive: true });
  signedOff(`t-${id}`, cwd);
  run.steps = { try: { taskId: `t-${id}`, workspace: cwd } };
  fs.writeFileSync(file, JSON.stringify(run));
}

const idOf = async (res: Response): Promise<string> => {
  const body = (await res.json()) as { id: string; error?: string };
  assert.equal(res.status, 201, body.error);
  return body.id;
};

test('a try of an agent of yours writes its folder and starts a folder run of it, fenced, with a dollar to spend', async () => {
  const res = await tryIt('scribe', { brief: '  Write the notes for a change that renames a flag.  ' });
  const body = (await res.json()) as { id: string; error?: string };
  assert.equal(res.status, 201, body.error);
  first = body.id;

  const file = path.join(TRIES, 'scribe', 'try.md');
  const text = fs.readFileSync(file, 'utf8');
  for (const line of ['workspace: folder', 'agent: scribe', 'budget: 1', 'permissionMode: dontAsk', 'allowedTools: Edit(**)']) {
    assert.ok(text.split('\n').includes(line), `the try's step says ${line}`);
  }
  const agent = (await (await app.request('/api/agents/yours/scribe')).json()) as AgentListing;
  assert.ok(text.includes(`# version ${agent.version}`), "and records the agent's version it was written at");

  const run = JSON.parse(fs.readFileSync(path.join(RUNS, `${first}.json`), 'utf8'));
  assert.deepEqual(run.place, { kind: 'folder' }, 'a folder run');
  assert.equal(run.repo, undefined, 'with no repository');
  assert.equal(run.workflowDir, path.join(TRIES, 'scribe'));
  assert.equal(run.brief, 'Write the notes for a change that renames a flag.');
  assert.equal(run.workflow.length, 1);
  const step = run.workflow[0];
  assert.equal(step.name, 'try');
  assert.equal(step.agent.name, 'scribe');
  assert.equal(step.agent.instructions, 'Write the notes.');
  assert.equal(step.permissionMode, 'dontAsk', "the try's fence, not the agent's own acceptEdits");
  assert.equal(step.agent.given.permissionMode, undefined, "which the step's own key overrides");
  assert.deepEqual(step.allowedTools, ['Edit(**)']);
  assert.equal(step.budget, 1);
  assert.equal(step.model, 'sonnet', "the agent's own keys");
  assert.ok(step.output, 'its result schema, found beside the agent from a folder under tries/');

  const summary = (await listed()).find((r) => r.id === first)!;
  assert.deepEqual(summary.try, { agent: 'scribe' });
  assert.equal(summary.moving, true, 'a try nothing has filed yet moves: a tick files it');
  const detail = (await (await app.request(`/api/runs/${first}`)).json()) as RunDetail;
  assert.deepEqual(detail.try, { agent: 'scribe' });
});

test('a run that is no try says so', async () => {
  const run = start({ brief: 'Write a note.', repo: '', workflowDir: other });
  try {
    assert.equal((await listed()).find((r) => r.id === run.id)!.try, null);
    assert.equal(((await (await app.request(`/api/runs/${run.id}`)).json()) as RunDetail).try, null);
    const res = await remove(run.id);
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 409, "the board removes only a try: another run is `wf rm`'s, which says what it leaves");
    assert.match(body.error, /removes only a try/);
    assert.match(body.error, new RegExp(`wf rm ${run.id}`));
    assert.ok(fs.existsSync(path.join(RUNS, `${run.id}.json`)), 'and it is still there');
  } finally {
    fs.rmSync(path.join(RUNS, `${run.id}.json`));
    fs.rmSync(path.join(RUNS, run.id), { recursive: true, force: true });
  }
});

test('a try while one of the same agent still moves is refused', async () => {
  assert.ok(first, 'the first test started a try');
  const error = await refused(tryIt('scribe', { brief: 'Once more.' }), 409, /still running/);
  assert.ok(error.includes(first), 'naming the try that runs');
});

test('once the try has ended, the agent can be tried again, and its folder is written again only when the agent moves', async () => {
  ended(first);
  assert.equal((await listed()).find((r) => r.id === first)!.moving, false);

  const folder = path.join(TRIES, 'scribe', 'try.md');
  const was = fs.statSync(folder).mtimeMs;
  const second = await idOf(await tryIt('scribe', { brief: 'Write them shorter.' }));
  assert.equal(fs.statSync(folder).mtimeMs, was, 'the same version: the folder is left as it was');
  ended(second);
  assert.equal((await remove(second)).status, 200);

  fs.writeFileSync(path.join(YOURS, 'scribe.md'), SCRIBE.replace('Write the notes.', 'Write the notes, briefly.'));
  const agent = (await (await app.request('/api/agents/yours/scribe')).json()) as AgentListing;
  const third = await idOf(await tryIt('scribe', { brief: 'Write them again.' }));
  assert.ok(
    fs.readFileSync(folder, 'utf8').includes(`# version ${agent.version}`),
    "the agent edited, its version moves: the next try's folder is written again at the version the agent is at",
  );
  ended(third);
  assert.equal((await remove(third)).status, 200);
});

test('a try still in flight is not removed: the package says to cancel it first', async () => {
  const id = await idOf(await tryIt('scribe', { brief: 'Still going.' }));
  const res = await remove(id);
  const body = (await res.json()) as { error: string };
  assert.equal(res.status, 409);
  assert.match(body.error, new RegExp(`wf cancel ${id}`));
  assert.ok(fs.existsSync(path.join(RUNS, `${id}.json`)), 'and it is still there');
  ended(id);
  assert.equal((await remove(id)).status, 200);
});

test('the board removes a try: its record and the folders it worked in', async () => {
  const workspace = JSON.parse(fs.readFileSync(path.join(RUNS, `${first}.json`), 'utf8')).workspace;
  assert.ok(fs.existsSync(workspace));
  const res = await remove(first);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.deepEqual(await res.json(), { id: first, removed: true });
  assert.ok(!fs.existsSync(path.join(RUNS, `${first}.json`)), 'the record is gone');
  assert.ok(!fs.existsSync(workspace), 'and its folders');
  assert.ok(!(await listed()).some((r) => r.id === first), 'and the list has it no more');
  const gone = await remove(first);
  assert.equal(gone.status, 404);
});

test('a removal is guarded as every write is', async () => {
  const id = await idOf(await tryIt('scribe', { brief: 'Kept.' }));
  ended(id);
  try {
    assert.equal((await remove(id, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await remove(id, { ...json, 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await remove(id, { ...json, host: 'evil.example' })).status, 403);
    assert.ok(fs.existsSync(path.join(RUNS, `${id}.json`)), 'the try is still there');
  } finally {
    assert.equal((await remove(id)).status, 200);
  }
});

test('a repository agent is refused: copy it to yours — the store this api reads — to try it, its schema with it', async () => {
  const error = await refused(tryIt('critic', { brief: 'Criticise it.' }, 'repo'), 403, /[Cc]opy it to yours to try it/);
  assert.ok(
    error.includes(`mkdir -p '${YOURS}' && cp '${path.join(repo, 'workflows', 'agents', 'critic.md')}' '${YOURS}/'`),
    `with the copy to make: ${error}`,
  );
  const graded = await refused(tryIt('grader', { brief: 'Grade it.' }, 'repo'), 403, /[Cc]opy it to yours to try it/);
  const theirs = path.join(repo, 'workflows', 'agents');
  assert.ok(
    graded.includes(`cp '${path.join(theirs, 'grader.md')}' '${path.join(theirs, 'grader.schema.json')}' '${YOURS}/'`),
    `the schema its output names copied too: ${graded}`,
  );
});

test("an agent a try's fence does not reach is refused before anything is written: codex, a remote agent, and one bridged to claude.ai", async () => {
  assert.equal(fs.existsSync(path.join(TRIES, 'coder')), false);
  const codex = await refused(
    tryIt('coder', { brief: 'Code it.' }),
    422,
    /runs on `codex`, and a try is fenced by Claude Code's permission mode/,
  );
  assert.match(codex, /Only an agent on Claude Code is tried here/);
  await refused(tryIt('faraway', { brief: 'Do it there.' }), 422, /is a remote agent \(`harness: a2a:faraway`\)/);
  await refused(tryIt('bridged', { brief: 'Do it.' }), 422, /says `remote: true`.*a try runs as a job/);
  for (const name of ['coder', 'faraway', 'bridged'])
    assert.equal(fs.existsSync(path.join(TRIES, name)), false, `no try folder for ${name}`);
});

test('the listing says why an agent cannot be tried, in the words the try refuses with, and the copy for a repository agent', async () => {
  const agents = (await (await app.request('/api/agents')).json()) as AgentListing[];
  const of = (from: string, name: string) => agents.find((agent) => agent.from === from && agent.name === name)!;
  assert.equal(of('yours', 'scribe').untried, null, 'nothing refuses a try of scribe');
  assert.match(of('yours', 'coder').untried!.why, /runs on `codex`/);
  assert.equal(of('yours', 'coder').untried!.copy, null);
  assert.match(of('yours', 'faraway').untried!.why, /remote agent/);
  assert.match(of('yours', 'bridged').untried!.why, /remote: true/);
  assert.match(of('yours', 'agents').untried!.why, /cannot be tried from the board/);
  assert.ok(of('repo', 'grader').untried!.copy!.includes('grader.schema.json'), JSON.stringify(of('repo', 'grader')));
  assert.equal(
    of('repo', 'critic').untried!.copy,
    `mkdir -p '${YOURS}' && cp '${path.join(repo, 'workflows', 'agents', 'critic.md')}' '${YOURS}/'`,
  );
});

test('an empty brief is refused, and a brief that is no string', async () => {
  await refused(tryIt('scribe', { brief: '   ' }), 422, /the brief is empty/);
  await refused(tryIt('scribe', { brief: '' }), 422, /the brief is empty/);
  await refused(tryIt('scribe', {}), 400, /`brief` is what the agent is asked to do/);
  await refused(tryIt('scribe', 'not json'), 400, /takes a JSON body/);
  await refused(
    tryIt('scribe', { brief: ['Do it.'] }),
    400,
    /^POST \/api\/agents\/yours\/scribe\/try: `brief` is what the agent is asked to do, a string: `\{ "brief": "<what the agent is asked to do>" \}`\. This request's was \["Do it\."\]\.$/,
  );
  await refused(
    tryIt('scribe', ['Do it.']),
    400,
    /^POST \/api\/agents\/yours\/scribe\/try: `brief` is what the agent is asked to do[^]*This request's was undefined\.$/,
  );
});

test('an agent not there, one named as a try folder cannot be, and one giving a skill only the repository has, are refused', async () => {
  await refused(tryIt('nobody', { brief: 'Do it.' }), 404, /no agent named 'nobody'/);
  await refused(tryIt('agents', { brief: 'Do it.' }), 422, /cannot be tried from the board/);
  await refused(tryIt('skills', { brief: 'Do it.' }), 422, /cannot be tried from the board/);
  const error = await refused(tryIt('borrower', { brief: 'Borrow it.' }), 422, /only the repository has/);
  assert.ok(error.includes(path.join(repo, '.claude', 'skills', 'theirs')), 'naming where the skill is');
  assert.ok(error.includes(path.join(root, 'workflows', 'skills')), 'and the library to copy it into');
});

test('a try is guarded as every write is', async () => {
  await refused(tryIt('scribe', { brief: 'Do it.' }, 'yours', { 'content-type': 'text/plain' }), 415, /application\/json/);
  await refused(tryIt('scribe', { brief: 'Do it.' }, 'yours', { ...json, 'sec-fetch-site': 'cross-site' }), 403, /another site/);
  await refused(tryIt('scribe', { brief: 'Do it.' }, 'yours', { ...json, host: 'evil.example' }), 403, /evil\.example/);
  await refused(tryIt('scribe', { brief: 'Do it.' }, 'elsewhere'), 400, /`repo` or `yours`/);
});

test("a try's folder that is a link is refused, never written through", async () => {
  const away = scratch('hkb-api-try-away-');
  fs.renameSync(path.join(TRIES, 'scribe'), path.join(TRIES, 'scribe.kept'));
  fs.symlinkSync(away, path.join(TRIES, 'scribe'));
  try {
    await refused(tryIt('scribe', { brief: 'Do it.' }), 422, /is a link/);
    assert.deepEqual(fs.readdirSync(away), [], 'nothing written where it points');
  } finally {
    fs.rmSync(path.join(TRIES, 'scribe'));
    fs.renameSync(path.join(TRIES, 'scribe.kept'), path.join(TRIES, 'scribe'));
  }
});
