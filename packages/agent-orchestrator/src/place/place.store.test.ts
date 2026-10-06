/**
 * A place's verbs heard (`runPlaceVerb`) and its declaration read (`readPlaceJson`), against scripts planted in a scratch skill: each of
 * the twelve answers decodes, and one missing a field or holding one of another type is unread, naming it; a refusal at exit 0 is a
 * refusal; a non-zero exit, a signal, a stdout that is not JSON or is empty, a script past its deadline and one that is not there are
 * each unread, with their words; a script past its deadline leaves nothing it started running, children deaf to SIGTERM killed, gone
 * and named; and a `place.json` that does not read as the contract is refused, naming the file and the field.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLACE_DEADLINE_MS, PLACE_VERBS, type PlaceAnswers, type PlaceOutcome, type PlaceRequests, type PlaceVerb } from './place.ts';
import { SHIPPED_PLACE, readPlaceJson, runPlaceVerb, trialMerges } from './place.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { running } from '../../test/running.ts';
import { scratch } from '../../test/scratch.ts';

/** A skill folder holding one script, `scripts/<verb>.ts`, whose body is `body`. */
function planted(verb: PlaceVerb, body: string): string {
  const dir = scratch('wf-place-');
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'scripts', `${verb}.ts`), body);
  return dir;
}

/** A script that prints `value` as JSON at exit 0. */
const printing = (value: unknown): string => `process.stdout.write(${JSON.stringify(JSON.stringify(value))});\n`;

const REQUESTS: PlaceRequests = {
  open: { root: '/r' },
  make: { repo: '/r', at: '/w', name: 'wf/x/a', from: 'main', also: [] },
  handoff: { workspace: '/w', step: 'a', why: '' },
  report: { repo: '/r', baseRef: 'b', onto: 'main', branches: ['wf/x/a'], diffOf: [], present: [], atBase: [] },
  standing: { repo: '/r', branches: [{ branch: 'wf/x/a', baseRef: 'b' }], base: 'main' },
  trial: {
    repo: '/r',
    trials: [
      { onto: 'main', branch: 'wf/x/a' },
      { onto: 'main', branch: 'wf/x/b' },
      { onto: 'gone', branch: 'wf/x/a' },
    ],
  },
  status: { checkout: '/r', tips: {} },
  land: { checkout: '/r', act: 'abort' },
  inventory: { repo: '/r', under: '/w', prefix: 'wf/x/' },
  remove: { repo: '/r', workspaces: [], branches: [] },
  export: { repo: '/r', tag: 'v1', into: '/i' },
  seal: { tree: '/i' },
};

const ANSWERS: PlaceAnswers = {
  open: { repo: '/r', baseRef: 'abc', branch: 'main' },
  make: { workspace: '/w', branch: 'wf/x/a', conflicts: ['a.ts'], notes: ['node_modules: linked'] },
  handoff: { commit: null },
  report: {
    at: { baseRef: 'b', onto: 'o', tips: { 'wf/x/a': 't' } },
    files: {
      'wf/x/a': [
        { path: 'a.ts', status: 'M', added: 1, removed: null },
        { path: 'b.ts', from: 'c.ts', status: 'R', added: 0, removed: 0 },
      ],
    },
    diffs: { 'a.ts': '@@ -1 +1 @@' },
    merges: { 'wf/x/a': { clean: true }, 'wf/x/b': { clean: false, conflicts: ['a.ts'] }, 'wf/x/c': { unknown: 'git is too old' } },
    present: { 'shot.png': 'file', out: 'directory', gone: 'absent' },
    atBase: { 'package.json': null, 'README.md': '# r' },
  },
  standing: {
    heads: { main: 'h' },
    branches: [
      { branch: 'wf/x/a', tip: null, onBase: 'unknown', pastBase: null, ahead: null },
      { branch: 'wf/x/b', tip: 't', onBase: 'no', pastBase: true, ahead: 2 },
    ],
  },
  trial: { at: { main: 'h', gone: null }, trials: [{ clean: true }, { clean: false, conflicts: ['a.ts'] }, { unknown: 'no ref' }] },
  status: { merging: 'ours', conflicted: false, missing: [], head: 'h' },
  land: { aborted: true },
  inventory: {
    workspaces: [
      { path: '/w', step: 'a', branch: 'wf/x/a', head: 'h', detached: false, prunable: false, clean: true, onBranch: true },
      { path: '/v', detached: true, locked: 'moving', prunable: true, clean: null, onBranch: false },
    ],
    branches: [{ branch: 'wf/x/a', merged: false }],
  },
  remove: { removed: ['/w'], left: [{ path: '/v', said: 'locked' }], deleted: ['wf/x/a'], kept: [{ branch: 'wf/x/b', said: 'unmerged' }] },
  export: { commit: 'abc' },
  seal: { removed: true },
};

/** `verb` run on a skill whose script prints `value`. */
const heardOf = <V extends PlaceVerb>(verb: V, value: unknown): PlaceOutcome<V> =>
  runPlaceVerb(planted(verb, printing(value)), verb, REQUESTS[verb]);

/** The words of an unread outcome, or a failure naming what it was instead. */
function saidOf(outcome: PlaceOutcome<PlaceVerb>, verb: PlaceVerb): string {
  assert.ok('unread' in outcome, `unread expected, got ${JSON.stringify(outcome)}`);
  assert.equal(outcome.unread.verb, verb);
  assert.ok(!Number.isNaN(Date.parse(outcome.unread.at)), `at is a time: ${outcome.unread.at}`);
  return outcome.unread.said;
}

for (const verb of PLACE_VERBS) {
  test(`${verb}: its answer decodes, and a field the contract does not name is dropped`, () => {
    assert.deepEqual(heardOf(verb, ANSWERS[verb]), { answer: ANSWERS[verb] });
    assert.deepEqual(heardOf(verb, { ...ANSWERS[verb], newer: 'field' }), { answer: ANSWERS[verb] });
  });

  test(`${verb}: an answer missing a field, or holding one of another type, is unread and names the field`, () => {
    const [first] = Object.keys(ANSWERS[verb]);
    const { [first]: _dropped, ...missing } = ANSWERS[verb] as Record<string, unknown>;
    const said = saidOf(heardOf(verb, missing), verb);
    const wrong = saidOf(heardOf(verb, { ...ANSWERS[verb], [first]: 42 }), verb);
    assert.match(said, new RegExp(`^its answer does not read as ${verb}'s: `));
    assert.match(wrong, new RegExp(`^its answer does not read as ${verb}'s: `));
    if (verb !== 'land') {
      assert.match(said, new RegExp(`\`${first}\` is missing`));
      assert.match(wrong, new RegExp(`\`${first}\` is 42, where `));
    }
  });
}

test('a field deep in an answer that does not read is named by its path', () => {
  const report = { ...ANSWERS.report, files: { 'wf/x/a': [{ path: 'a.ts', status: 'M', added: 'many', removed: 0 }] } };
  assert.match(saidOf(heardOf('report', report), 'report'), /`files\.wf\/x\/a\.0\.added` is "many", where /);
  const standing = { ...ANSWERS.standing, branches: [{ ...ANSWERS.standing.branches[0], onBase: 'maybe' }] };
  assert.match(saidOf(heardOf('standing', standing), 'standing'), /`branches\.0\.onBase` is "maybe"/);
});

test('a refusal at exit 0 is a refusal, in its words; at another exit it is unread', () => {
  assert.deepEqual(heardOf('open', { refused: 'no repository at /r: run git init there' }), {
    refused: 'no repository at /r: run git init there',
  });
  const dir = planted('open', `${printing({ refused: 'why' })}process.exitCode = 1;\n`);
  assert.equal(saidOf(runPlaceVerb(dir, 'open', REQUESTS.open), 'open'), 'it exited 1');
});

test('the script is handed the request with v 1 on stdin, and runs in the skill folder', () => {
  const dir = planted(
    'open',
    `import fs from 'node:fs';\nconst request = fs.readFileSync(0, 'utf8');\nprocess.stdout.write(JSON.stringify({ repo: request, baseRef: process.cwd(), branch: 'b' }));\n`,
  );
  const outcome = runPlaceVerb(dir, 'open', { root: '/some/where' });
  assert.ok('answer' in outcome, JSON.stringify(outcome));
  assert.deepEqual(JSON.parse(outcome.answer.repo), { root: '/some/where', v: 1 });
  assert.equal(fs.realpathSync(outcome.answer.baseRef), fs.realpathSync(dir));
});

test('the environment given is the one the script runs in', () => {
  const dir = planted(
    'open',
    `process.stdout.write(JSON.stringify({ repo: process.env.PLACE_PROBE ?? 'unset', baseRef: 'b', branch: 'c' }));\n`,
  );
  const outcome = runPlaceVerb(dir, 'open', REQUESTS.open, { env: { ...process.env, PLACE_PROBE: 'given' } });
  assert.deepEqual(outcome, { answer: { repo: 'given', baseRef: 'b', branch: 'c' } });
});

test("a non-zero exit is unread with the last four lines of the script's stderr, or its exit when it said nothing", () => {
  const lines = ['one', 'two', 'three', 'four', 'five', 'six'].map((l) => `console.error(${JSON.stringify(l)});`).join('\n');
  const said = saidOf(runPlaceVerb(planted('status', `${lines}\nprocess.exitCode = 1;\n`), 'status', REQUESTS.status), 'status');
  assert.equal(said, 'three / four / five / six');
  assert.equal(saidOf(runPlaceVerb(planted('status', 'process.exitCode = 3;\n'), 'status', REQUESTS.status), 'status'), 'it exited 3');
});

test('a script ended by a signal is unread, naming the signal', () => {
  const dir = planted('handoff', `console.error('about to go');\nprocess.kill(process.pid, 'SIGTERM');\n`);
  assert.equal(saidOf(runPlaceVerb(dir, 'handoff', REQUESTS.handoff), 'handoff'), 'it was ended by SIGTERM: about to go');
});

test('a stdout that is not JSON, or empty, at exit 0 is unread, not an answer', () => {
  const said = saidOf(runPlaceVerb(planted('land', `process.stdout.write('landed, I think');\n`), 'land', REQUESTS.land), 'land');
  assert.equal(said, 'its answer is not JSON: landed, I think');
  assert.equal(saidOf(runPlaceVerb(planted('land', ''), 'land', REQUESTS.land), 'land'), 'it printed no answer');
  assert.match(saidOf(heardOf('land', null), 'land'), /^its answer does not read as land's: /);
  assert.match(saidOf(heardOf('land', []), 'land'), /^its answer does not read as land's: /);
});

test('a verb whose script is not there is unread, naming the path', () => {
  const dir = planted('open', printing(ANSWERS.open));
  const said = saidOf(runPlaceVerb(dir, 'make', REQUESTS.make), 'make');
  assert.equal(said, `the place has no script for make: ${path.join(dir, 'scripts', 'make.ts')} is not there`);
});

test('a script past its deadline is unread, saying so, and is left running nowhere', () => {
  const dir = planted('report', `console.error('reading the diff');\nsetInterval(() => {}, 1000);\n`);
  const said = saidOf(runPlaceVerb(dir, 'report', REQUESTS.report, { deadlineMs: 300 }), 'report');
  assert.match(said, /^it gave no answer within 0\.3 s, its deadline, and was stopped/);
  assert.deepEqual(running(path.join(dir, 'scripts', 'report.ts')), []);
});

/** A script that starts four children, each deaf to SIGTERM, which write their pid to a marker once deaf. */
const DEAF_GROUP = [
  "import { spawn } from 'node:child_process';",
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "const child = path.resolve('scripts', 'child.mjs');",
  `fs.writeFileSync(child, ${JSON.stringify(
    [
      "import fs from 'node:fs';",
      "process.on('SIGTERM', () => {});",
      'fs.writeFileSync(process.argv[2], String(process.pid));',
      'setInterval(() => {}, 1000);',
    ].join('\n'),
  )});`,
  "for (const n of [1, 2, 3, 4]) spawn(process.execPath, [child, path.resolve(`deaf-${n}`)], { stdio: 'ignore' });",
  'setInterval(() => {}, 1000);',
].join('\n');

/** The most tries the group test makes, each with twice the deadline of the one before, for its four children to be deaf in time. */
const DEAF_TRIES = 6;

test('a script past its deadline stops its whole group, killing the children that ignore SIGTERM, and says so', (t) => {
  let deadlineMs = 1500;
  for (let tries = 1; ; tries++, deadlineMs *= 2) {
    const dir = planted('report', DEAF_GROUP);
    const child = path.join(dir, 'scripts', 'child.mjs');
    t.after(() => {
      for (const pid of running(child)) process.kill(pid, 'SIGKILL');
    });
    const said = saidOf(runPlaceVerb(dir, 'report', REQUESTS.report, { deadlineMs }), 'report');
    assert.deepEqual(running(child), [], `try ${tries}: no child left running`);
    assert.deepEqual(running(path.join(dir, 'scripts', 'report.ts')), [], `try ${tries}: the script is not left running`);
    const markers = [1, 2, 3, 4].map((n) => path.join(dir, `deaf-${n}`));
    if (!markers.every((marker) => fs.existsSync(marker))) {
      assert.ok(tries < DEAF_TRIES, `each child ignored SIGTERM before the deadline, on one of ${DEAF_TRIES} tries: ${said}`);
      continue;
    }
    for (const pid of markers.map((marker) => Number(fs.readFileSync(marker, 'utf8'))))
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the child ${pid} is gone, not even a zombie`);
    const seconds = String(deadlineMs / 1000).replace('.', '\\.');
    assert.match(
      said,
      new RegExp(
        `^it gave no answer within ${seconds} s, its deadline, and was stopped, and a process it started outlived SIGTERM for 2 s and was killed, so a lock it held may be left$`,
      ),
    );
    return;
  }
});

test('the deadline is two minutes a verb, ten for make, and it is the default the runner holds a script to', () => {
  for (const verb of PLACE_VERBS) assert.equal(PLACE_DEADLINE_MS[verb], verb === 'make' ? 600_000 : 120_000, verb);
  const body = `setTimeout(() => process.stdout.write(${JSON.stringify(JSON.stringify(ANSWERS.make))}), 1000);\n`;
  assert.deepEqual(runPlaceVerb(planted('make', body), 'make', REQUESTS.make), { answer: ANSWERS.make });
  assert.match(saidOf(runPlaceVerb(planted('make', body), 'make', REQUESTS.make, { deadlineMs: 200 }), 'make'), /within 0\.2 s/);
});

test('trialMerges answers what the trial verb answers, and asks nothing for no trial', () => {
  const dir = planted('trial', printing(ANSWERS.trial));
  assert.deepEqual(trialMerges('/r', REQUESTS.trial.trials, dir), ANSWERS.trial);
  assert.deepEqual(trialMerges('/r', [], planted('trial', 'process.exitCode = 3;\n')), { at: {}, trials: [] });
  assert.ok(fs.existsSync(path.join(SHIPPED_PLACE, 'scripts', 'trial.ts')), `the shipped place is ${SHIPPED_PLACE}`);
});

test('REFUSED: a trial unread or refused, or an answer short of the trials asked, is no verdict: every trial is unknown in its words, and every base null', () => {
  const pairs = [
    { onto: 'main', branch: 'wf/x/a' },
    { onto: 'wf/y/b', branch: 'wf/x/a' },
  ];
  const silent = trialMerges('/r', pairs, planted('trial', "process.stderr.write('git is gone');\nprocess.exitCode = 1;\n"));
  assert.deepEqual(silent, {
    at: { main: null, 'wf/y/b': null },
    trials: [{ unknown: 'the trial merge was not heard: git is gone' }, { unknown: 'the trial merge was not heard: git is gone' }],
  });
  const refused = trialMerges('/r', pairs, planted('trial', printing({ refused: '/r is not a directory' })));
  assert.deepEqual(refused.trials, [{ unknown: '/r is not a directory' }, { unknown: '/r is not a directory' }]);
  const short = trialMerges('/r', pairs, planted('trial', printing({ at: { main: 'a'.repeat(40) }, trials: [{ clean: true }] })));
  assert.deepEqual(short, {
    at: { main: null, 'wf/y/b': null },
    trials: [{ unknown: 'the place answered 1 trial for the 2 asked' }, { unknown: 'the place answered 1 trial for the 2 asked' }],
  });
  const unshaped = trialMerges('/r', pairs, planted('trial', printing({ at: {} })));
  assert.ok(
    unshaped.trials.every((t) => 'unknown' in t && /`trials` is missing/.test(t.unknown)),
    JSON.stringify(unshaped),
  );
});

/** A skill folder with `declared` as its `place.json`, text as is or JSON, and a script for each verb in `scripts`. */
function declaring(declared: unknown, scripts: readonly PlaceVerb[] = ['open', 'status']): string {
  const dir = scratch('wf-place-json-');
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const verb of scripts) fs.writeFileSync(path.join(dir, 'scripts', `${verb}.ts`), '');
  if (declared !== undefined)
    fs.writeFileSync(path.join(dir, 'place.json'), typeof declared === 'string' ? declared : JSON.stringify(declared));
  return dir;
}

const DECLARED = {
  v: 1,
  verbs: ['open', 'status'],
  denyWhileLanding: ['Bash(git commit:*)'],
  say: { look: ['git status'], readResult: 'r', ship: 's', drop: 'd', conflicts: 'c', unlock: 'u' },
};

/** What `readPlaceJson` refuses the skill in `dir` with, its kind and exit code checked. */
function refusedWith(dir: string): string {
  try {
    readPlaceJson(dir);
  } catch (err) {
    assert.ok(err instanceof Invalid, `Invalid expected, got ${String(err)}`);
    assert.equal(err.exitCode, 2);
    assert.ok(err.message.startsWith(path.join(dir, 'place.json')), err.message);
    return err.message;
  }
  return assert.fail('readPlaceJson read it');
}

test('place.json decodes as the contract has it', () => {
  assert.deepEqual(readPlaceJson(declaring(DECLARED)), DECLARED);
});

test('REFUSED: a place.json that is not there, or not JSON', () => {
  assert.match(
    refusedWith(declaring(undefined)),
    /place\.json is not there, and a place skill declares itself in it: write it as contract v 1/,
  );
  assert.match(refusedWith(declaring('{ "v": 1,')), /place\.json is not JSON \(/);
});

test('REFUSED: a place.json whose first wrong field does not read as contract v 1, naming the field', () => {
  assert.match(refusedWith(declaring({ ...DECLARED, v: 2 })), /`v` is 2, where 1 is expected/);
  assert.match(refusedWith(declaring({ ...DECLARED, verbs: ['open', 'fly'] })), /`verbs\.1` is "fly", where /);
  assert.match(
    refusedWith(declaring({ ...DECLARED, denyWhileLanding: 'Bash(git commit:*)' })),
    /`denyWhileLanding` is "Bash\(git commit:\*\)"/,
  );
  const { unlock: _unlock, ...say } = DECLARED.say;
  assert.match(refusedWith(declaring({ ...DECLARED, say })), /`say\.unlock` is missing/);
  assert.match(refusedWith(declaring([])), /does not read as a place's declaration/);
});

test('REFUSED: a verb declared with no script in scripts/', () => {
  assert.match(
    refusedWith(declaring({ ...DECLARED, verbs: ['open', 'status', 'land'] })),
    /declares land, and scripts\/ has no land\.ts: add the script, or take the verb off `verbs`/,
  );
});
