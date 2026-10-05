/**
 * The brief parser, made to refuse.
 *
 * A parser that accepts any key turns a typo into a default, and nothing about that is visible
 * until a task has run the wrong way. So most of this file is refusals, each at shipped defaults,
 * and the one allowing test is the one that proves no key is accepted and then dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIEF_KEYS, parseBrief, type BriefKey } from '../src/cli/main.ts';
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

test("every key a brief has reaches the spec — none is accepted and then dropped, and a harness's argument is filed under `config`", () => {
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
});

test('an unknown key is refused by name, with the list of keys a brief has', () => {
  refuses(brief('afer: implement'), /`afer` is not a key a brief has/);
  assert.throws(
    () => parse(brief('maxAtempts: 3')),
    (e: Error) => BRIEF_KEYS.every((k) => e.message.includes(k)),
  );
});

test('`background:` is true or false, as written — anything else is refused, not read as a job', () => {
  assert.equal(parse(brief('background: false')).config?.background, false, 'false is a job, said out loud');
  assert.equal(parse(brief('model: opus')).config?.background, undefined, 'absent: the harness default, a job');
  for (const bad of ['yes', 'True', '1', 'bg']) {
    refuses(
      brief(`background: ${bad}`),
      /is not true or false\. Write `background: true` to run the session as `claude --bg`, which a person can attach to, or leave it out to run it as a job/,
    );
  }
});

test('`queued:` is true or false, as written — the one way to hold a task back from `ae` — and anything else is refused', () => {
  assert.equal(parse(brief('queued: false')).queued, false);
  assert.equal('queued' in parse(brief('model: opus')), false, 'absent: starts on the next tick');
  for (const bad of ['yes', 'True', '1', 'held']) {
    refuses(
      brief(`queued: ${bad}`),
      /is not true or false\. Write `queued: true` to have the task wait for `ae admit <id>` before it starts/,
    );
  }
});

test('`restartPolicy:` is `Always` as written, and anything else is refused in its whole sentence — not read as a job', () => {
  assert.equal(parse(brief('restartPolicy: Always')).restartPolicy, 'Always');
  assert.equal(Object.hasOwn(parse(brief('model: opus')), 'restartPolicy'), false, 'absent: the task runs to its end');
  for (const bad of ['always', 'Never', 'OnFailure', 'true']) {
    refuses(
      brief(`restartPolicy: ${bad}`),
      new RegExp(
        `^brief: \`restartPolicy: ${bad}\` is not a restart policy\\. Write \`restartPolicy: Always\` to keep the session open until \`ae stop\`, or leave it out to run the task to its end\\.$`,
      ),
    );
  }
});

test('`deadlineSeconds: 5m` is refused — it would be NaN, and stop the task on its first pass', () => {
  for (const bad of ['5m', '0', '-30', 'Infinity', 'soon', '1e400']) {
    refuses(brief(`deadlineSeconds: ${bad}`), /is not a number of seconds.*deadlineSeconds: 900/);
  }
});

test('a budgetUsd that is not dollars above 0, in digits, is refused — `$5`, NaN to `Number`, `1e2`, a hundred dollars nobody meant, and one that converts to Infinity', () => {
  for (const bad of ['$5', '5 USD', '0', '0.0', '-1', '1e2', 'Infinity', 'lots', '9'.repeat(400)]) {
    refuses(brief(`budgetUsd: ${bad}`), /is not an amount of dollars.*budgetUsd: 5/);
  }
  assert.equal(parse(brief('budgetUsd: .5')).config?.budgetUsd, 0.5, "filed under `config`, where the harness's arguments go");
});

test('a contextTokens that is not a whole number of tokens, in digits, is refused — and `200k` is written back as its digits', () => {
  refuses(
    brief('contextTokens: 200k'),
    /`contextTokens: 200k` is not a number of tokens\. Write a whole number in digits — `contextTokens: 200000`/,
  );
  refuses(brief('contextTokens: 1M'), /`contextTokens: 1000000`/);
  for (const bad of ['0', '-1', '1e5', '200000.5', 'lots', '9'.repeat(400)]) {
    refuses(brief(`contextTokens: ${bad}`), /is not a number of tokens.*like `contextTokens: 200000`/);
  }
  assert.equal(parse(brief('contextTokens: 150000')).config?.contextTokens, 150000, "the range is file()'s to check");
});

test('maxAttempts and resume are retired: refused at what were their defaults, pointing at filing again, retries: and wf retry', () => {
  refuses(
    brief('maxAttempts: 1'),
    /^brief: `maxAttempts` is retired: the runtime makes one attempt per start.*`resumeFrom: <session id>`.*`retries:`.*`wf retry <run> <step>`/,
  );
  refuses(brief('maxAttempts: 3'), /^brief: `maxAttempts` is retired/);
  refuses(brief('resume: interrupted'), /^brief: `resume` is retired: .*`retries:`.*`wf retry <run> <step>`/);
  refuses(brief('resume: sometimes'), /^brief: `resume` is retired/);
  assert.equal(
    parse(brief('resumeFrom: abc-123')).resumeFrom,
    'abc-123',
    '`resumeFrom`, the session a task continues, is not the retired policy',
  );
});

test('a key given twice, a line that is not key: value, and an empty value are refused', () => {
  refuses(brief('harness: claude\nharness: codex'), /`harness` is given twice/);
  refuses(brief('harness codex'), /`harness codex` is not a `key: value` line/);
  refuses(brief('model:'), /`model:` has no value/);
});

test('a tool list with an empty name in it is refused', () => {
  refuses(brief('tools: Read,,Grep'), /has an empty name in it.*tools: Read, Grep, Glob/);
  refuses(brief('tools: Read,'), /has an empty name in it/);
});

test('frontmatter that is never closed is refused, not read as the prompt', () => {
  refuses('---\nharness: codex\nreview the diff', /never closed/);
});

test('a brief with no prompt is refused', () => {
  refuses(brief('harness: codex', ''), /there is no prompt/);
});

test('a cwd that is not a directory is refused', () => {
  refuses(brief(`cwd: ${path.join(tmp(), 'nope')}`), /is not a directory/);
});

test('a closeoutSchema that cannot be read, is not JSON, or is not an object is refused', () => {
  const dir = tmp();
  refuses(brief(`closeoutSchema: ${path.join(dir, 'missing.json')}`), /cannot be read/);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
  refuses(brief(`closeoutSchema: ${path.join(dir, 'bad.json')}`), /is not JSON/);
  fs.writeFileSync(path.join(dir, 'list.json'), '[]');
  refuses(brief(`closeoutSchema: ${path.join(dir, 'list.json')}`), /a schema is a JSON object/);
});

test('comments, CRLF and `worktree: false` mean what a person writing them means', () => {
  const spec = parse(brief('# a note on its own line\nharness: codex   # the reviewer\nworktree: false').replace(/\n/g, '\r\n'));
  assert.equal(spec.harness, 'codex');
  assert.equal(spec.config?.worktree, undefined, '`false` is no worktree, not one named "false"');
  assert.equal(spec.brief, 'do the thing');
});

test('no frontmatter is all prompt, at the defaults', () => {
  const spec = parse('just do it');
  assert.equal(spec.brief, 'just do it');
  assert.equal(spec.cwd, '/fallback');
  assert.equal('maxAttempts' in spec || 'resume' in spec, false, 'no retry policy: one attempt per start');
});

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

/** `ae start` on a brief, against a board of its own. */
const aeStart = (front: string) => {
  const dir = tmp();
  const file = path.join(dir, 'brief.md');
  fs.writeFileSync(file, brief(front));
  const r = spawnSync(process.execPath, [ae, 'start', file], { env: { ...process.env, AE_ROOT: dir }, encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, filed: fs.existsSync(path.join(dir, 'tasks')) };
};

test('`ae start` exits 2 with the sentence, not a stack trace, and files nothing', () => {
  const r = aeStart('afer: implement');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^brief: `afer` is not a key a brief has/);
  assert.equal(r.filed, false);
});

test('`ae start` refuses what file() refuses, too — a harness this engine does not have', () => {
  const r = aeStart('harness: banana');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^file: `harness: banana` is not a harness this engine has/);
  assert.equal(r.filed, false);
});

test('`ae start` refuses a `trustFrom` that is not an absolute directory, and one on a harness that is not Codex, in the words of file()', () => {
  const relative = aeStart('harness: codex\ntrustFrom: repo');
  assert.equal(relative.status, 2);
  assert.match(relative.stderr, /^file: `codex\.trustFrom: "repo"` is not an absolute directory\./);
  assert.equal(relative.filed, false);
  const claude = aeStart('trustFrom: /repo');
  assert.equal(claude.status, 2);
  assert.match(
    claude.stderr,
    /^file: `codex` gives Codex arguments of its own, and the `claude` harness is not Codex: its session would start without them\./,
  );
  assert.equal(claude.filed, false);
});

test("`ae` refuses to run with `AE_MAX_CONCURRENT` set, at any value, empty too: exit 2, the sentence, nothing filed — read and ignored, a person's `AE_MAX_CONCURRENT=1` would start every task at once", () => {
  for (const value of ['3', '1', '']) {
    for (const args of [['ls'], ['tick']]) {
      const dir = tmp();
      const r = spawnSync(process.execPath, [ae, ...args], {
        env: { ...process.env, AE_ROOT: dir, AE_MAX_CONCURRENT: value },
        encoding: 'utf8',
      });
      assert.equal(r.status, 2, `${args} with ${JSON.stringify(value)}: ${r.stderr}`);
      assert.match(
        r.stderr,
        /^ae: `AE_MAX_CONCURRENT` is retired: `ae` runs its engine with no ceiling, since a ceiling is the option `maxConcurrent` a program gives `Engine\.layer`\. Unset it, file with `queued: true` and start each with `ae admit <id>`/,
      );
      assert.deepEqual(fs.readdirSync(dir), [], 'nothing written');
    }
  }
  const dir = tmp();
  const { AE_MAX_CONCURRENT: _unset, ...env } = process.env;
  assert.equal(
    spawnSync(process.execPath, [ae, 'ls'], { env: { ...env, AE_ROOT: dir }, encoding: 'utf8' }).status,
    0,
    'unset, the same command runs',
  );
});

test('a parsed brief has the same own keys it always had: the six always, `holdOpen`, `queued`, `restartPolicy` and `config` only when given', () => {
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
});

test('a `true or false` key refuses anything else in its own whole sentence', () => {
  refuses(
    brief('background: yes'),
    /^brief: `background: yes` is not true or false\. Write `background: true` to run the session as `claude --bg`, which a person can attach to, or leave it out to run it as a job\.$/,
  );
  refuses(
    brief('queued: yes'),
    /^brief: `queued: yes` is not true or false\. Write `queued: true` to have the task wait for `ae admit <id>` before it starts, or leave it out to start it on the next tick\.$/,
  );
  refuses(
    brief('holdOpen: yes'),
    /^brief: `holdOpen: yes` is not true or false\. Write `holdOpen: true` to have the task wait for `ae answer` or `ae close` when an attempt signs, or leave it out to settle it then\.$/,
  );
});

test('a brief wrong in every value is refused in one order: the prompt, then each value from `deadlineSeconds` to `tools`', () => {
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
});
