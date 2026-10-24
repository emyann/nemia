/**
 * The brief parser, made to refuse.
 *
 * A parser that accepts any key turns a typo into a default, and nothing about that is visible
 * until a task has run the wrong way. So most of this file is refusals, each at shipped defaults, in one table over `parseBrief`,
 * which is pure; one table holds what a brief reads as, and its first row proves no key is accepted and then dropped. `ae` itself is
 * run twice, for what only its process can show: a refusal is an exit 2 with the sentence and nothing filed, never a stack trace.
 * What `file` refuses of a parsed brief is `test/refusal.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIEF_KEYS, main, parseBrief, type BriefKey } from '../src/cli/main.ts';
import { HARNESS_ARGS } from '../src/index.ts';
import { scratch } from './scratch.ts';

const brief = (front: string, body = 'do the thing') => `---\n${front}\n---\n${body}`;
const parse = (text: string) => parseBrief(text, '/fallback');
const tmp = () => scratch('ae-brief-');

/** Refused with exit code 2 and a message that matches — never a raw exception, never a default. */
const refuses = (text: string, says: RegExp) =>
  assert.throws(
    () => parse(text),
    (e: Error & { exitCode?: number }) => {
      assert.equal(e.exitCode, 2, `exit code 2 for: ${e.message}`);
      assert.match(e.message, says);
      return true;
    },
  );

test('parseBrief: what a brief reads as — every key reaching the spec, `true or false` keys as written, the defaults, and the keys it always had', async (t) => {
  await t.test(
    "every key a brief has reaches the spec — none is accepted and then dropped, and a harness's argument is filed under `config`",
    () => {
      const dir = tmp();
      const schema = path.join(dir, 'closeout.json');
      fs.writeFileSync(schema, '{"type":"object"}');
      const samples: Record<BriefKey, [string, unknown]> = {
        cwd: [dir, dir],
        harness: ['codex', 'codex'],
        model: ['opus', 'opus'],
        permissionMode: ['acceptEdits', 'acceptEdits'],
        deadlineSeconds: ['900', 900],
        resumeFrom: ['abc-123', 'abc-123'],
        worktree: ['my-branch', 'my-branch'],
        closeoutSchema: [schema, { type: 'object' }],
        tools: ['Read, Grep,Glob', ['Read', 'Grep', 'Glob']],
        effort: ['high', 'high'],
        budgetUsd: ['0.25', 0.25],
        contextTokens: ['200000', 200000],
        background: ['true', true],
        holdOpen: ['true', true],
        queued: ['true', true],
        restartPolicy: ['Always', 'Always'],
        trustFrom: [dir, dir],
      };
      const codexKeys: readonly string[] = ['trustFrom'];
      for (const key of BRIEF_KEYS) {
        const [written, read] = samples[key];
        const spec = parse(brief(`${key}: ${written}`));
        const where = codexKeys.includes(key)
          ? (spec.config?.codex ?? {})
          : (HARNESS_ARGS as readonly string[]).includes(key)
            ? (spec.config ?? {})
            : spec;
        assert.deepEqual((where as Record<string, unknown>)[key], read, key);
        assert.equal(Object.hasOwn(spec, key) && where !== spec, false, `${key} is not left beside \`config\``);
        assert.equal(codexKeys.includes(key) && Object.hasOwn(spec.config ?? {}, key), false, `${key} is not left beside \`config.codex\``);
      }
    },
  );

  await t.test('`background: false` is a job, said out loud; absent, the harness default, a job', () => {
    assert.equal(parse(brief('background: false')).config?.background, false, 'false is a job, said out loud');
    assert.equal(parse(brief('model: opus')).config?.background, undefined, 'absent: the harness default, a job');
  });

  await t.test('`queued: false` is written; absent, the task starts on the next tick', () => {
    assert.equal(parse(brief('queued: false')).queued, false);
    assert.equal('queued' in parse(brief('model: opus')), false, 'absent: starts on the next tick');
  });

  await t.test('`restartPolicy: Always` is read as written; absent, the task runs to its end', () => {
    assert.equal(parse(brief('restartPolicy: Always')).restartPolicy, 'Always');
    assert.equal(Object.hasOwn(parse(brief('model: opus')), 'restartPolicy'), false, 'absent: the task runs to its end');
  });

  await t.test('`holdOpen: true` holds it open; `false` is not held open, and leaves no key', () => {
    const held = (v: string) => `---\nholdOpen: ${v}\n---\ndo it`;
    assert.equal(parseBrief(held('true'), '/r').holdOpen, true);
    assert.equal(Object.hasOwn(parseBrief(held('false'), '/r'), 'holdOpen'), false, 'false: not held open, and no key');
  });

  await t.test("a budget and a window in digits are filed under `config`, the window's range left to file()", () => {
    assert.equal(parse(brief('budgetUsd: .5')).config?.budgetUsd, 0.5, "filed under `config`, where the harness's arguments go");
    assert.equal(parse(brief('contextTokens: 150000')).config?.contextTokens, 150000, "the range is file()'s to check");
  });

  await t.test('`resumeFrom`, the session a task continues, is not the retired policy', () => {
    assert.equal(parse(brief('resumeFrom: abc-123')).resumeFrom, 'abc-123');
  });

  await t.test('comments, CRLF and `worktree: false` mean what a person writing them means', () => {
    const spec = parse(brief('# a note on its own line\nharness: codex   # the reviewer\nworktree: false').replace(/\n/g, '\r\n'));
    assert.equal(spec.harness, 'codex');
    assert.equal(spec.config?.worktree, undefined, '`false` is no worktree, not one named "false"');
    assert.equal(spec.brief, 'do the thing');
  });

  await t.test('no frontmatter is all prompt, at the defaults', () => {
    const spec = parse('just do it');
    assert.equal(spec.brief, 'just do it');
    assert.equal(spec.cwd, '/fallback');
    assert.equal('maxAttempts' in spec || 'resume' in spec, false, 'no retry policy: one attempt per start');
  });

  await t.test(
    'a parsed brief has the same own keys it always had: the six always, `holdOpen`, `queued`, `restartPolicy` and `config` only when given',
    () => {
      assert.deepEqual(Object.keys(parse('just do it')), ['brief', 'cwd', 'harness', 'deadlineSeconds', 'resumeFrom', 'closeoutSchema']);
      const spec = parse(brief('holdOpen: true\nqueued: false\nmodel: opus\nworktree: true\ntools: Read'));
      assert.deepEqual(Object.keys(spec), [
        'brief',
        'cwd',
        'harness',
        'deadlineSeconds',
        'resumeFrom',
        'closeoutSchema',
        'holdOpen',
        'queued',
        'config',
      ]);
      assert.deepEqual(Object.keys(spec.config ?? {}), ['model', 'worktree', 'tools']);
      assert.equal(Object.hasOwn(parse(brief('holdOpen: false')), 'holdOpen'), false, '`holdOpen: false` leaves the key out');
      assert.deepEqual(Object.keys(parse(brief('restartPolicy: Always\nqueued: true'))).slice(-2), ['queued', 'restartPolicy']);
    },
  );
});

/** A folder holding the files the refusals below read: none there, not JSON, and not an object. */
const SCHEMAS = (() => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
  fs.writeFileSync(path.join(dir, 'list.json'), '[]');
  return dir;
})();

/**
 * Every brief `parseBrief` refuses, and the sentence it is refused in, exit code 2. A `true or false` key refuses anything else in
 * its own sentence — never read as a job; a number is refused in digits only (`$5`, NaN to `Number`, `1e2`, a hundred dollars nobody
 * meant, one that converts to Infinity); `200k` is written back as its digits.
 */
const BRIEF_REFUSALS: Array<[string, string, RegExp]> = [
  ['an unknown key, by name', brief('afer: implement'), /`afer` is not a key a brief has/],
  ...['yes', 'True', '1', 'bg'].map((bad): [string, string, RegExp] => [
    `background: ${bad}`,
    brief(`background: ${bad}`),
    /is not true or false\. Write `background: true` to run the session as `claude --bg`, which a person can attach to, or leave it out to run it as a job/,
  ]),
  ...['yes', 'True', '1', 'held'].map((bad): [string, string, RegExp] => [
    `queued: ${bad}`,
    brief(`queued: ${bad}`),
    /is not true or false\. Write `queued: true` to have the task wait for `ae admit <id>` before it starts/,
  ]),
  ...['yes', 'True', '1'].map((bad): [string, string, RegExp] => [
    `holdOpen: ${bad}`,
    brief(`holdOpen: ${bad}`),
    /^brief: `holdOpen: .*` is not true or false\. Write `holdOpen: true`/,
  ]),
  ...['always', 'Never', 'OnFailure', 'true'].map((bad): [string, string, RegExp] => [
    `restartPolicy: ${bad}`,
    brief(`restartPolicy: ${bad}`),
    new RegExp(
      `^brief: \`restartPolicy: ${bad}\` is not a restart policy\\. Write \`restartPolicy: Always\` to keep the session open until \`ae stop\`, or leave it out to run the task to its end\\.$`,
    ),
  ]),
  [
    'background: yes, in its own whole sentence',
    brief('background: yes'),
    /^brief: `background: yes` is not true or false\. Write `background: true` to run the session as `claude --bg`, which a person can attach to, or leave it out to run it as a job\.$/,
  ],
  [
    'queued: yes, in its own whole sentence',
    brief('queued: yes'),
    /^brief: `queued: yes` is not true or false\. Write `queued: true` to have the task wait for `ae admit <id>` before it starts, or leave it out to start it on the next tick\.$/,
  ],
  [
    'holdOpen: yes, in its own whole sentence',
    brief('holdOpen: yes'),
    /^brief: `holdOpen: yes` is not true or false\. Write `holdOpen: true` to have the task wait for `ae answer` or `ae close` when an attempt ends, or leave it out to settle it then\.$/,
  ],
  ...['5m', '0', '-30', 'Infinity', 'soon', '1e400'].map((bad): [string, string, RegExp] => [
    `deadlineSeconds: ${bad}, which would be NaN and stop the task on its first pass`,
    brief(`deadlineSeconds: ${bad}`),
    /is not a number of seconds.*deadlineSeconds: 900/,
  ]),
  ...['$5', '5 USD', '0', '0.0', '-1', '1e2', 'Infinity', 'lots', '9'.repeat(400)].map((bad): [string, string, RegExp] => [
    `budgetUsd: ${bad.slice(0, 12)}`,
    brief(`budgetUsd: ${bad}`),
    /is not an amount of dollars.*budgetUsd: 5/,
  ]),
  [
    'contextTokens: 200k, written back as its digits',
    brief('contextTokens: 200k'),
    /`contextTokens: 200k` is not a number of tokens\. Write a whole number in digits — `contextTokens: 200000`/,
  ],
  ['contextTokens: 1M, written back as its digits', brief('contextTokens: 1M'), /`contextTokens: 1000000`/],
  ...['0', '-1', '1e5', '200000.5', 'lots', '9'.repeat(400)].map((bad): [string, string, RegExp] => [
    `contextTokens: ${bad.slice(0, 12)}`,
    brief(`contextTokens: ${bad}`),
    /is not a number of tokens.*like `contextTokens: 200000`/,
  ]),
  [
    'maxAttempts, retired at what was its default, pointing at filing again, retries: and wf retry',
    brief('maxAttempts: 1'),
    /^brief: `maxAttempts` is retired: the runtime makes one attempt per start.*`resumeFrom: <session id>`.*`retries:`.*`wf retry <run> <step>`/,
  ],
  ['maxAttempts: 3', brief('maxAttempts: 3'), /^brief: `maxAttempts` is retired/],
  ['resume, retired', brief('resume: interrupted'), /^brief: `resume` is retired: .*`retries:`.*`wf retry <run> <step>`/],
  ['resume: sometimes', brief('resume: sometimes'), /^brief: `resume` is retired/],
  ['a key given twice', brief('harness: claude\nharness: codex'), /`harness` is given twice/],
  ['a line that is not key: value', brief('harness codex'), /`harness codex` is not a `key: value` line/],
  ['an empty value', brief('model:'), /`model:` has no value/],
  ['a tool list with an empty name in it', brief('tools: Read,,Grep'), /has an empty name in it.*tools: Read, Grep, Glob/],
  ['a tool list ending on an empty name', brief('tools: Read,'), /has an empty name in it/],
  ['frontmatter never closed, not read as the prompt', '---\nharness: codex\nreview the diff', /never closed/],
  ['a brief with no prompt', brief('harness: codex', ''), /there is no prompt/],
  ['a cwd that is not a directory', brief(`cwd: ${path.join(SCHEMAS, 'nope')}`), /is not a directory/],
  ['a closeoutSchema that cannot be read', brief(`closeoutSchema: ${path.join(SCHEMAS, 'missing.json')}`), /cannot be read/],
  ['a closeoutSchema that is not JSON', brief(`closeoutSchema: ${path.join(SCHEMAS, 'bad.json')}`), /is not JSON/],
  ['a closeoutSchema that is not an object', brief(`closeoutSchema: ${path.join(SCHEMAS, 'list.json')}`), /a schema is a JSON object/],
];

test('parseBrief: what it refuses, exit code 2 and the sentence — never a raw exception, never a default', async (t) => {
  for (const [name, text, says] of BRIEF_REFUSALS) await t.test(name, () => refuses(text, says));

  await t.test('an unknown key is refused with the list of keys a brief has', () => {
    assert.throws(
      () => parse(brief('maxAtempts: 3')),
      (e: Error) => BRIEF_KEYS.every((k) => e.message.includes(k)),
    );
  });

  await t.test(
    'a brief wrong in every value is refused in one order: the prompt, then each value from `deadlineSeconds` to `tools`',
    () => {
      const dir = tmp();
      const lines = [
        'deadlineSeconds: 5m',
        'budgetUsd: $5',
        'contextTokens: 200k',
        'background: yes',
        'queued: yes',
        'holdOpen: yes',
        'restartPolicy: always',
        `cwd: ${path.join(dir, 'nope')}`,
        `closeoutSchema: ${path.join(dir, 'missing.json')}`,
        'tools: Read,,Grep',
      ];
      refuses(brief(lines.join('\n'), ''), /there is no prompt/);
      while (lines.length) {
        const key = lines[0].slice(0, lines[0].indexOf(':'));
        refuses(brief(lines.join('\n')), new RegExp(`^brief: \`${key}: `));
        lines.shift();
      }
      assert.equal(parse(brief('model: opus')).brief, 'do the thing');
    },
  );
});

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

/** `main` run in this process with `AE_MAX_CONCURRENT` at `value` (unset for `undefined`) and a board of its own; what it threw. */
const mainWith = async (value: string | undefined, argv: string[]) => {
  const dir = tmp();
  const before = { root: process.env.AE_ROOT, ceiling: process.env.AE_MAX_CONCURRENT };
  process.env.AE_ROOT = dir;
  if (value === undefined) delete process.env.AE_MAX_CONCURRENT;
  else process.env.AE_MAX_CONCURRENT = value;
  try {
    await main(argv);
    return { dir, threw: undefined };
  } catch (e) {
    return { dir, threw: e as Error & { exitCode?: number } };
  } finally {
    for (const [key, was] of [
      ['AE_ROOT', before.root],
      ['AE_MAX_CONCURRENT', before.ceiling],
    ] as const) {
      if (was === undefined) delete process.env[key];
      else process.env[key] = was;
    }
  }
};

test("`ae` refuses at exit 2 with the sentence and files nothing: a brief `ae file` cannot parse, and `AE_MAX_CONCURRENT` set at any value — a person's `AE_MAX_CONCURRENT=1`, read and ignored, would start every task at once", async (t) => {
  await t.test('`ae file` on a brief with an unknown key exits 2 with the sentence, not a stack trace, and files nothing', () => {
    const dir = tmp();
    const file = path.join(dir, 'brief.md');
    fs.writeFileSync(file, brief('afer: implement'));
    const r = spawnSync(process.execPath, [ae, 'file', file], { env: { ...process.env, AE_ROOT: dir }, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^brief: `afer` is not a key a brief has/);
    assert.equal(fs.existsSync(path.join(dir, 'tasks')), false);
  });

  await t.test(
    '`ae file` on a brief `file()` refuses (a harness there is none of) exits 2 with its sentence, not a stack trace, and files nothing',
    () => {
      const dir = tmp();
      const file = path.join(dir, 'brief.md');
      fs.writeFileSync(file, brief('harness: banana'));
      const r = spawnSync(process.execPath, [ae, 'file', file], { env: { ...process.env, AE_ROOT: dir }, encoding: 'utf8' });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /^file: /);
      assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
      assert.equal(fs.existsSync(path.join(dir, 'tasks')), false);
    },
  );

  await t.test('`ae start`, the old spelling, still files the task, and says on stderr that it is `ae file` now', () => {
    const dir = tmp();
    const file = path.join(dir, 'brief.md');
    fs.writeFileSync(file, brief('model: opus'));
    const r = spawnSync(process.execPath, [ae, 'start', file], { env: { ...process.env, AE_ROOT: dir }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stderr.includes('ae file'), r.stderr);
    assert.match(r.stdout, /filed/);
    assert.equal(fs.readdirSync(path.join(dir, 'tasks')).length, 1, 'one task filed');
  });

  await t.test('`ae ls` with `AE_MAX_CONCURRENT` set exits 2 with the sentence, and writes nothing', () => {
    const dir = tmp();
    const r = spawnSync(process.execPath, [ae, 'ls'], { env: { ...process.env, AE_ROOT: dir, AE_MAX_CONCURRENT: '3' }, encoding: 'utf8' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(
      r.stderr,
      /^ae: `AE_MAX_CONCURRENT` is retired: `ae` runs its engine with no ceiling, since a ceiling is the option `maxConcurrent` a program gives `Engine\.layer`\. Unset it, file with `queued: true` and start each with `ae admit <id>`/,
    );
    assert.deepEqual(fs.readdirSync(dir), [], 'nothing written');
  });

  await t.test('every value, empty too, before `ls` and `tick` alike, is refused before an engine is built', async () => {
    for (const value of ['3', '1', '']) {
      for (const argv of [['ls'], ['tick']]) {
        const { dir, threw } = await mainWith(value, argv);
        assert.equal(threw?.exitCode, 2, `${argv} with ${JSON.stringify(value)}: ${threw?.message}`);
        assert.match(threw?.message ?? '', /^ae: `AE_MAX_CONCURRENT` is retired:.*`ae admit <id>`/);
        assert.deepEqual(fs.readdirSync(dir), [], 'nothing written');
      }
    }
  });

  await t.test('unset, the same command runs', async () => {
    const { threw } = await mainWith(undefined, ['ls']);
    assert.equal(threw, undefined);
  });
});
