/**
 * The definitions' verbs the client holds — `nemia policy …`, `nemia agents` and its card, sources, custom instructions, copy, rm and
 * run, and `nemia workflows rm` — told as a person types them against a store served by the api (`served.ts`): parsed from `objects`'
 * words here, a file of words read here and sent as words, each asked of the api, and printed from what it answers; under this machine's
 * context, and under a remote one pointed at the same api. Each asserts its exit code, the store changed as the verb says (read back from
 * its files or through the api), and the lines it prints. A refusal asserts its exit code and the command or file it names, never its
 * sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** A factory's repository, holding the agent `outrider`, which the store knows by the factory `elsewhere`. */
const THEIRS = scratch('nemia-definitions-theirs-');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: THEIRS });
write(path.join(THEIRS, 'workflows', 'agents', 'outrider.md'), '---\ndescription: Rides out.\n---\nRide out.\n');

/** An agent file anywhere, to copy into the library. */
const LOOSE = scratch('nemia-definitions-loose-');
write(path.join(LOOSE, 'critic.md'), '---\ndescription: Critiques it.\n---\nCritique it.\n');

/** The store: an agent of yours, a factory on `THEIRS`, and a workflow of yours to remove. */
const seed = (root: string): void => {
  write(path.join(root, 'workflows', 'agents', 'archivist.md'), '---\ndescription: Files it away.\n---\nFile it away.\n');
  write(path.join(root, 'workflows', 'errand', 'go.md'), '---\nplace: git\n---\nGo.\n');
  write(path.join(root, 'factories', 'elsewhere.json'), JSON.stringify({ repos: [THEIRS] }));
};

const store = await servedStore('nemia-definitions-', seed);
after(store.stop);

/** `nemia <argv>` on `env`, `stdin` its input, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv, stdin = ''): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  child.stdin.end(stdin);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** `said` ended 0, and its stdout. */
const ok = (said: Said, what: string): string => {
  assert.equal(said.code, 0, `${what}: ${said.err}`);
  return said.out;
};

/** The version the api serves `kind`'s `name` at, read through `nemia get`. */
async function versionOf(kind: string, name: string): Promise<string> {
  const read = JSON.parse(ok(await store.nemia(['get', kind, name, '-o', 'json']), `get ${kind} ${name}`)) as {
    metadata: { resourceVersion: string };
  };
  return read.metadata.resourceVersion;
}

const PROPOSAL = JSON.stringify({
  rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'] }],
  guidance: ['Ask before a third try.'],
});

test("`nemia policy`: an agent's rules read, a proposal sent from stdin, a rule confirmed as read and taken out of force", async () => {
  const read = ok(await store.nemia(['policy', 'nemia']), 'policy');
  assert.match(read, /^nemia, rules in force at auto, the default for want of any you confirmed:$/m);
  assert.match(read, /^nemia proposed none: nemia policy propose nemia --file <path>\.$/m);

  const proposed = ok(await store.nemia(['policy', 'propose', 'nemia', '--file', '-'], PROPOSAL), 'propose');
  assert.match(proposed, /^nemia proposed 1 rule\(s\), none in force until confirmed\.$/m);
  assert.match(proposed, /^kept as guidance, which the machinery cannot hold:$/m);
  assert.match(proposed, /^ {2}Ask before a third try\.$/m);
  const words = /^ {2}tries: (.+)$/m.exec(proposed)?.[1] ?? assert.fail(proposed);
  assert.match(ok(await store.nemia(['policy', 'nemia']), 'read back'), /^proposed at \S+:$/m, 'the proposal is in the store');

  const confirmed = ok(await store.nemia(['policy', 'confirm', 'nemia', 'tries', '--words', words]), 'confirm');
  assert.match(confirmed, /^nemia: the rule tries is in force at auto\.$/m);
  assert.match(confirmed, /^ {2}tries \(in force\): /m);

  const dropped = ok(await store.nemia(['policy', 'rm', 'nemia', 'tries']), 'rm');
  assert.match(dropped, /^nemia: the rule tries is out of force; what it allowed is asked again\.$/m);
  assert.doesNotMatch(dropped, /^ {2}tries \(in force\)/m);
});

test("`nemia policy reach` reads a factory's gates; REFUSED, exit 2, given neither --factory nor --run, or a proposal of no file", async () => {
  const reach = ok(await store.nemia(['policy', 'reach', 'nemia', '--factory', 'elsewhere']), 'reach');
  assert.match(reach, /^nemia, in the factory elsewhere at \S+: the rules in force can approve 0 of the 0 step\(s\) at their gate/m);
  const neither = await store.nemia(['policy', 'reach', 'nemia']);
  assert.equal(neither.code, 2, neither.err);
  assert.match(neither.err, /--factory <name> or --run <runId>/);
  const nowhere = await store.nemia(['policy', 'propose', 'nemia', '--file', path.join(LOOSE, 'nowhere.json')]);
  assert.equal(nowhere.code, 2, nowhere.err);
  assert.match(nowhere.err, /nowhere\.json/);
});

test('`nemia agents` lists yours and the repository --repo names, with what each can do; its card on stdout, what it is not on stderr', async () => {
  const listed = ok(await store.nemia(['agents', '--repo', THEIRS]), 'agents');
  assert.match(listed, /^outrider {2}repo {2}Rides out\.$/m);
  assert.match(listed, /^ {3}outrider {2}outrider — Rides out\.$/m);
  assert.match(listed, /^archivist {2}yours {2}Files it away\.$/m);
  assert.match(listed, /one in A2A's shape: nemia agents card <name>/);
  assert.doesNotMatch(ok(await store.nemia(['agents']), 'agents bare'), /outrider/, "the api's own repository, with no --repo");

  const card = await store.nemia(['agents', 'card', 'outrider', '--repo', THEIRS]);
  assert.equal(card.code, 0, card.err);
  assert.equal((JSON.parse(card.out) as { name: string }).name, 'outrider', 'the card alone on stdout');
  assert.match(card.err, /^outrider \(repo\) — a card, not an address/m);

  const sources = ok(await store.nemia(['agents', 'sources', '--path', LOOSE]), 'sources');
  assert.match(sources, /^ {2}critic {2}Critiques it\. {2}/m);
  assert.match(sources, /^copy one into your library: nemia agents copy <file> \[--as <name>\]$/m);

  const ghost = await store.nemia(['agents', 'card', 'ghost']);
  assert.equal(ghost.code, 2, ghost.err);
  assert.match(ghost.err, /ghost/);
});

test("`nemia agents custom`: an agent's words written from stdin, read bare, listed, cleared; Nemia's own; a file not there refused", async () => {
  const file = path.join(store.root, 'custom-instructions', 'archivist.md');
  assert.match(ok(await store.nemia(['agents', 'custom', 'archivist']), 'bare'), /^archivist has no custom instructions\. Set them/);
  const written = ok(await store.nemia(['agents', 'custom', 'archivist', '--file', '-'], 'File it twice.\n'), 'write');
  assert.match(
    written,
    /^archivist: custom instructions written to .*archivist\.md, told after its instructions in every run started from now/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'File it twice.\n');
  assert.equal(ok(await store.nemia(['agents', 'custom', 'archivist']), 'read'), `${file}\n\nFile it twice.\n`);
  assert.ok(ok(await store.nemia(['agents']), 'listed').includes(`   custom instructions: ${file}`));
  assert.match(ok(await store.nemia(['agents', 'custom', 'archivist', '--clear']), 'clear'), /^archivist: custom instructions removed/);
  assert.equal(fs.existsSync(file), false);
  assert.match(
    ok(await store.nemia(['agents', 'custom', 'archivist', '--clear']), 'again'),
    /^archivist has no custom instructions to remove$/m,
  );

  const hers = ok(await store.nemia(['agents', 'custom', 'nemia', '--file', '-'], 'Answer in French.\n'), 'hers');
  assert.match(hers, /her open session is told at the keeper's next beat/);
  assert.match(ok(await store.nemia(['agents', 'custom', 'nemia', '--clear']), 'hers cleared'), /^nemia: custom instructions removed/);

  const nowhere = await store.nemia(['agents', 'custom', 'archivist', '--file', path.join(LOOSE, 'nowhere.md')]);
  assert.equal(nowhere.code, 2, nowhere.err);
  assert.match(nowhere.err, /nowhere\.md/);
});

test('`nemia agents copy` copies a file into yours, said where it came from; `agents rm` removes it at its version; `agents run` starts a try', async () => {
  const copied = ok(await store.nemia(['agents', 'copy', path.join(LOOSE, 'critic.md')]), 'copy');
  assert.match(copied, /^critic copied into your library: agents\/critic\.md$/m);
  assert.match(copied, /^give it to a step: nemia factory hire <factory> critic --step <workflow>\/<step>$/m);
  assert.ok(fs.existsSync(path.join(store.root, 'workflows', 'agents', 'critic.md')));
  assert.match(ok(await store.nemia(['agents']), 'listed'), new RegExp(`^ {3}copied from ${path.join(LOOSE, 'critic.md')} at \\S+$`, 'm'));

  const removed = ok(await store.nemia(['agents', 'rm', 'yours', 'critic', '--version', await versionOf('agent', 'critic')]), 'rm');
  assert.equal(removed, `removed from ${path.join(store.root, 'workflows', 'agents')}: critic.md\n`);
  assert.equal(fs.existsSync(path.join(store.root, 'workflows', 'agents', 'critic.md')), false);

  const started = ok(await store.nemia(['agents', 'run', 'yours', 'archivist', '--brief', 'File the notes.']), 'run');
  const id = /^(\S+) {2}a try of archivist started: nemia ls shows how it goes, and its page on the board$/m.exec(started)?.[1];
  assert.ok(id !== undefined, started);
  assert.ok(fs.existsSync(path.join(store.root, 'runs', `${id}.json`)), 'its run is in the store');

  const stale = await store.nemia(['agents', 'rm', 'yours', 'archivist', '--version', '0000000000000000']);
  assert.equal(stale.code, 1, `a stale version is the api's Conflict: ${stale.err}`);
  assert.ok(fs.existsSync(path.join(store.root, 'workflows', 'agents', 'archivist.md')), 'left as it was');
});

test('`nemia workflows rm` removes a folder of yours at its version, printing the files it held', async () => {
  const removed = ok(await store.nemia(['workflows', 'rm', 'yours', 'errand', '--version', await versionOf('workflow', 'errand')]), 'rm');
  assert.equal(removed, `removed ${path.join(store.root, 'workflows', 'errand')}: go.md\n`);
  assert.equal(fs.existsSync(path.join(store.root, 'workflows', 'errand')), false);
});

test('under a remote context pointed at the served store: the same verbs land there, a path typed as the daemon reads it', async () => {
  const exposed = await servedStore('nemia-definitions-remote-', seed, { WF_EXPOSED: '1' });
  after(exposed.stop);
  const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const folder = scratch('nemia-definitions-laptop-');
  const env: NodeJS.ProcessEnv = {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
  configWritten({ contexts: [{ name: 'vps', server: exposed.url, token }], current: 'vps' }, env);

  assert.match(ok(await nemia(['policy', 'nemia'], env), 'policy'), /^nemia, rules in force at auto/m);
  assert.match(ok(await nemia(['agents', '--repo', THEIRS], env), 'agents'), /^outrider {2}repo {2}Rides out\.$/m);
  ok(await nemia(['agents', 'custom', 'archivist', '--file', '-'], env, 'Far away.\n'), 'custom');
  assert.equal(fs.readFileSync(path.join(exposed.root, 'custom-instructions', 'archivist.md'), 'utf8'), 'Far away.\n');
  const version = /"resourceVersion":\s*"([^"]+)"/.exec(ok(await nemia(['get', 'workflow', 'errand', '-o', 'json'], env), 'get'))?.[1];
  ok(await nemia(['workflows', 'rm', 'yours', 'errand', '--version', version ?? ''], env), 'workflows rm');
  assert.equal(fs.existsSync(path.join(exposed.root, 'workflows', 'errand')), false, 'removed on the remote store');
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing read or made on this machine's store");
});
