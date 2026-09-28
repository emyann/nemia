/**
 * What "done" means for Claude Code, tested without Claude Code: `claudeOps` translates what `claude agents` lists into A2A's
 * states, with an injected clock and an injected transcript, and leaves the judgement to the engine. `observe` shells out to
 * `claude`, so each test puts a fake one on PATH that prints the registry it is given.
 *
 * Facts about Claude Code these tests hold the runner to:
 * - a tool call that runs for minutes leaves the transcript untouched for as long, while the registry lists the session busy;
 * - a closeout read is a full read of a transcript that runs to tens of megabytes, where its mtime is cheap: the runner reads
 *   it once per write of the transcript, never once per pass;
 * - `--tools`, `--disallowedTools` and `--allowedTools` are variadic, and `--remote-control` and `--worktree` take an optional
 *   value: each would take the prompt after it, so a flag always follows them and the prompt comes last;
 * - a list of rules joined by commas is one rule per item: `--allowedTools "Write(**),Edit(**)"` allows both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { claudeOps, QUIESCENT_AFTER_MS } from '../src/runner.ts';
import { lastStructuredOutput } from '../src/runner-claude-transcript.ts';
import { createEngine } from '../src/facade.ts';
import { Journal } from '../src/journal.ts';
import type { Event } from '../src/domain.ts';

import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const withFakeClaude = (json: string) => {
  const dir = scratch('fake-claude-');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat <<'JSON'\n${json}\nJSON\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  return () => {
    process.env.PATH = prev;
  };
};

const row = (state: string, status: string) =>
  JSON.stringify([
    {
      name: 'ae/t-1/1',
      sessionId: 's-1',
      state,
      status,
      kind: 'background',
    },
  ]);

test("the registry's words, read through `claude agents`: each is A2A's name once, and a blocked session's wait says which", async () => {
  const rows = [
    ['working', undefined, 'working'],
    ['done', undefined, 'completed'],
    ['failed', undefined, 'failed'],
    ['stopped', undefined, 'canceled'],
    ['blocked', 'permission prompt', 'input-required'],
    ['blocked', 'authentication', 'auth-required'],
    ['blocked', 'sign in to continue', 'auth-required'],
    ['vanished', undefined, 'failed'],
  ] as const;
  const restore = withFakeClaude(
    JSON.stringify(
      rows.map(([state, waitingFor], i) => ({
        name: `ae/t-${i}/1`,
        sessionId: `s-${i}`,
        state,
        status: 'idle',
        kind: 'background',
        ...(waitingFor ? { waitingFor } : {}),
      })),
    ),
  );
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 1 }).observe);
    assert.deepEqual(
      rows.map((_, i) => seen.get(`ae/t-${i}/1`)?.state),
      rows.map(([, , name]) => name),
    );
    assert.equal(seen.get('ae/t-5/1')?.waitingFor, 'authentication', "the wait is carried in the harness's own words");
  } finally {
    restore();
  }
});

test('state=done is taken at its word, immediately', async () => {
  const restore = withFakeClaude(row('done', 'idle'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 1 }).observe);
    assert.equal(seen.get('ae/t-1/1')?.state, 'completed');
  } finally {
    restore();
  }
});

test('working + busy is running, however long it lasts', async () => {
  const restore = withFakeClaude(row('working', 'busy'));
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 1 });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, undefined);
    t += 10 * QUIESCENT_AFTER_MS;
    const seen = (await Effect.runPromise(ops.observe)).get('ae/t-1/1');
    assert.equal(seen?.state, 'working');
    assert.equal(seen?.quietMs, undefined, 'busy is never quiet');
  } finally {
    restore();
  }
});

test("working + idle is reported quiet only after the window, not before — and stays working: what quiet means is the engine's", async () => {
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 0 });

    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, undefined, 'it just spoke');
    t = QUIESCENT_AFTER_MS - 1;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, undefined, 'one millisecond short');
    t = QUIESCENT_AFTER_MS;
    const seen = (await Effect.runPromise(ops.observe)).get('ae/t-1/1');
    assert.equal(seen?.quietMs, QUIESCENT_AFTER_MS, 'and now it has stopped, for this long');
    assert.equal(
      seen?.state,
      'working',
      'reported, not concluded: never `done` — a task that asked for a statement and got none has not finished',
    );
  } finally {
    restore();
  }
});

test('a transcript that moves PUSHES THE DEADLINE OUT — it was between steps, not finished', async () => {
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    let t = 0;
    let written = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => written });

    t = QUIESCENT_AFTER_MS - 1_000;
    written = t;
    assert.equal(
      (await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs,
      undefined,
      '`working` also means between steps of work it drives on its own: it wrote, so it is alive',
    );

    t += QUIESCENT_AFTER_MS - 1_000;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, undefined, 'deadline moved with it');

    t += 1_000;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, QUIESCENT_AFTER_MS, 'quiet again, and now past it');
  } finally {
    restore();
  }
});

test('a cold transcript is NOT silence while the session is busy', async () => {
  const restore = withFakeClaude(row('working', 'busy'));
  try {
    const ops = claudeOps({ now: () => 100 * QUIESCENT_AFTER_MS, transcriptTime: async () => 0 });
    assert.equal(
      (await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs,
      undefined,
      'a tool call that runs for minutes writes nothing at all: only `busy` tells it from silence',
    );
  } finally {
    restore();
  }
});

const STARTED = 1_789_000_000_000;
const busyRow = JSON.stringify([
  { name: 'ae/t-1/1', sessionId: 's-1', state: 'working', status: 'busy', kind: 'background', startedAt: STARTED },
]);
/**
 * A busy session observed `after` its start, whose transcript was last written `written` and holds `said`. A session that signed
 * off with StructuredOutput and left a background shell running is listed busy for as long as the shell runs; its own closeout as
 * the last word in the conversation, and a transcript cold for the window, tell it from a session in a long turn.
 */
const heldSession = async (after: number, written: number, said: { payload: unknown; at: number; lastWord?: boolean } | undefined) => {
  const restore = withFakeClaude(busyRow);
  let asked = 0;
  try {
    const ops = claudeOps({
      now: () => STARTED + after,
      transcriptTime: async () => written,
      closeoutFrom: async () => {
        asked++;
        return said;
      },
      usageFrom: async () => ({ turns: 4 }),
    });
    return { seen: (await Effect.runPromise(ops.observe)).get('ae/t-1/1'), asked };
  } finally {
    restore();
  }
};

test('a busy session whose own closeout is the last word, and whose transcript has been cold for the window, is QUIET: the work is over, whatever its process is still doing', async () => {
  const said = { payload: { outcome: 'done' }, at: STARTED + 10, lastWord: true };
  const { seen } = await heldSession(10 + QUIESCENT_AFTER_MS, STARTED + 10, said);
  assert.equal(seen?.quietMs, QUIESCENT_AFTER_MS, 'quiet since its closeout');
  assert.deepEqual(seen?.closeout, { payload: { outcome: 'done' }, at: STARTED + 10 }, 'with the statement, for the engine to judge');
  assert.equal(seen?.state, 'working', 'reported, not concluded');
  assert.equal(seen?.busy, true, 'and still busy: that is a fact about its process, not about the work');
  assert.deepEqual(seen?.usage, { turns: 4 }, 'over, so what it consumed is final too');
});

test('a busy session whose transcript is still advancing is left alone, and is not even read for a statement', async () => {
  const said = { payload: { outcome: 'done' }, at: STARTED + 10, lastWord: true };
  const { seen, asked } = await heldSession(QUIESCENT_AFTER_MS, STARTED + 1, said);
  assert.equal(seen?.quietMs, undefined, 'one millisecond short of the floor: it is working');
  assert.equal(seen?.closeout, undefined);
  assert.equal(asked, 0, 'a busy session that just wrote costs its mtime and nothing more');
});

test('a busy session that has spoken since its closeout is still working — the statement is not its last word', async () => {
  const { seen, asked } = await heldSession(10 * QUIESCENT_AFTER_MS, STARTED + 10, {
    payload: { outcome: 'done' },
    at: STARTED + 10,
    lastWord: false,
  });
  assert.equal(seen?.quietMs, undefined);
  assert.equal(seen?.closeout, undefined, 'nothing it has said is final while its process works');
  assert.equal(asked, 1, 'read once the floor was reached, and read for nothing else');
});

test('a busy session with no statement at all is left to the deadline, as it always was', async () => {
  const { seen } = await heldSession(10 * QUIESCENT_AFTER_MS, STARTED + 10, undefined);
  assert.equal(seen?.quietMs, undefined);
});

test('a busy session carrying only the closeout of the session it continues is not quiet: it has said nothing of its own', async () => {
  const { seen } = await heldSession(10 * QUIESCENT_AFTER_MS, STARTED - 3_600_000, {
    payload: { outcome: 'done' },
    at: STARTED - 3_600_000,
    lastWord: true,
  });
  assert.equal(
    seen?.quietMs,
    undefined,
    "`--resume` keeps the parent's whole conversation, its closing turn last: a continuation's first turn that runs past the floor has just begun",
  );
  assert.equal(seen?.closeout, undefined);
});

test('a busy session over a cold transcript is read ONCE, and again only once the transcript grows — not on every pass of a long tool call', async () => {
  const restore = withFakeClaude(busyRow);
  try {
    let asked = 0;
    let written = STARTED;
    let t = STARTED + QUIESCENT_AFTER_MS;
    const ops = claudeOps({
      now: () => t,
      transcriptTime: async () => written,
      closeoutFrom: async () => {
        asked++;
        return undefined;
      },
    });
    await Effect.runPromise(ops.observe);
    await Effect.runPromise(ops.observe);
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 1, 'three passes over a transcript nothing has written: one read');

    written = t;
    t += QUIESCENT_AFTER_MS;
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 2, 'written since the read: read again');
  } finally {
    restore();
  }
});

test('a busy session the registry gives no start is left alone: its conversation could not be told from the one it continues', async () => {
  const restore = withFakeClaude(row('working', 'busy'));
  try {
    const ops = claudeOps({
      now: () => 10 * QUIESCENT_AFTER_MS,
      transcriptTime: async () => 0,
      closeoutFrom: async () => ({ payload: { outcome: 'done' }, at: 1, lastWord: true }),
    });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, undefined);
  } finally {
    restore();
  }
});

test('the verdict does not depend on WHO is asking, or for how long', async () => {
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    const at = (t: number) => claudeOps({ now: () => t, transcriptTime: async () => 0 });
    const first = await Effect.runPromise(at(QUIESCENT_AFTER_MS).observe);
    const second = await Effect.runPromise(at(QUIESCENT_AFTER_MS).observe);
    assert.equal(
      first.get('ae/t-1/1')?.quietMs,
      QUIESCENT_AFTER_MS,
      'two runners are what two processes that each tick once are: neither keeps the clock between passes',
    );
    assert.equal(second.get('ae/t-1/1')?.quietMs, QUIESCENT_AFTER_MS, 'a runner that has never seen this session agrees');
  } finally {
    restore();
  }
});

test('no transcript, no verdict — we do not settle on one idle sample', async () => {
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    const ops = claudeOps({ now: () => 100 * QUIESCENT_AFTER_MS, transcriptTime: async () => undefined });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.quietMs, undefined, 'the deadline handles this one');
  } finally {
    restore();
  }
});

test('blocked is never quiescent — a session waiting on a person is not finished', async () => {
  const restore = withFakeClaude(row('blocked', 'idle'));
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 500 });
    await Effect.runPromise(ops.observe);
    t += 10 * QUIESCENT_AFTER_MS;
    const seen = (await Effect.runPromise(ops.observe)).get('ae/t-1/1');
    assert.equal(seen?.state, 'input-required');
    assert.equal(seen?.quietMs, undefined, 'never quiet');
  } finally {
    restore();
  }
});

test('quiet is counted from the later of its last write and its own start: a session resumed over a cold transcript has just begun', async () => {
  const started = 10 * QUIESCENT_AFTER_MS;
  const restore = withFakeClaude(
    JSON.stringify([{ name: 'ae/t-1/2', sessionId: 's-1', state: 'working', status: 'idle', kind: 'background', startedAt: started }]),
  );
  try {
    let t = started + 1_000;
    const ops = claudeOps({
      now: () => t,
      transcriptTime: async () => 0,
      closeoutFrom: async () => undefined,
      usageFrom: async () => undefined,
    });
    assert.equal(
      (await Effect.runPromise(ops.observe)).get('ae/t-1/2')?.quietMs,
      undefined,
      'its transcript is cold, and it started a second ago',
    );
    t = started + QUIESCENT_AFTER_MS;
    assert.equal(
      (await Effect.runPromise(ops.observe)).get('ae/t-1/2')?.quietMs,
      QUIESCENT_AFTER_MS,
      'quiet for the window since it started',
    );
  } finally {
    restore();
  }
});

const entry = (o: object) => JSON.stringify(o);
const structured = (timestamp: string, input: object) =>
  entry({
    type: 'assistant',
    timestamp,
    message: { content: [{ type: 'tool_use', name: 'StructuredOutput', input }] },
  });

test('the LAST StructuredOutput call is the statement, stamped with when it was made', () => {
  const jsonl = [
    entry({ type: 'system', tools: [{ name: 'StructuredOutput' }] }),
    structured('2026-09-12T08:00:00.000Z', { outcome: 'done', by: 'parent' }),
    entry({ type: 'user', timestamp: '2026-09-12T09:00:00.000Z', message: { content: 'carry on' } }),
    structured('2026-09-12T09:30:00.000Z', { outcome: 'blocked' }),
    '{half a line mentioning StructuredOutput',
  ].join('\n');
  assert.deepEqual(
    lastStructuredOutput(jsonl),
    {
      payload: { outcome: 'blocked' },
      at: Date.parse('2026-09-12T09:30:00.000Z'),
      lastWord: false,
    },
    "the last call, with its time: a resumed transcript holds the parent's calls too, and the tool's definition names it",
  );
  assert.equal(
    lastStructuredOutput(entry({ type: 'user', message: { content: 'say StructuredOutput' } })),
    undefined,
    'a name said is not a call',
  );
});

/**
 * A closing turn as Claude Code writes it: the StructuredOutput call, an `attachment` line carrying the same payload, the call's
 * result, and a `system` line with the turn's duration.
 */
const closingTurn = (timestamp: string, id: string, input: object) => [
  entry({ type: 'assistant', timestamp, message: { content: [{ type: 'tool_use', id, name: 'StructuredOutput', input }] } }),
  entry({ parentUuid: 'u1', attachment: { type: 'structured_output', data: input } }),
  entry({
    type: 'user',
    timestamp,
    message: { content: [{ tool_use_id: id, type: 'tool_result', content: 'Structured output provided successfully' }] },
  }),
  entry({ type: 'system', subtype: 'turn_duration', timestamp, durationMs: 11_545 }),
];

test('a statement is the LAST WORD when the conversation ends with its result — bookkeeping after it does not count, and anything said after it does', () => {
  const at = '2026-09-17T02:53:00.160Z';
  const closed = closingTurn(at, 'toolu_1', { outcome: 'done' }).join('\n');
  assert.deepEqual(lastStructuredOutput(closed), { payload: { outcome: 'done' }, at: Date.parse(at), lastWord: true });
  assert.equal(lastStructuredOutput(`${closed}\n`)?.lastWord, true, 'a trailing newline is not a line');

  const woken = [closed, entry({ type: 'user', timestamp: '2026-09-17T04:03:15.727Z', message: { content: 'carry on' } })].join('\n');
  assert.equal(lastStructuredOutput(woken)?.lastWord, false, 'it was woken and spoken to: not the last word any more');

  const other = [
    closed,
    entry({ type: 'user', timestamp: at, message: { content: [{ tool_use_id: 'toolu_other', type: 'tool_result', content: 'ok' }] } }),
  ].join('\n');
  assert.equal(lastStructuredOutput(other)?.lastWord, false, "another call's result is not this statement's");

  const unfinished = [closed, '{half a line still being writ'].join('\n');
  assert.equal(
    lastStructuredOutput(unfinished)?.lastWord,
    true,
    'a line still being written is passed over, as the reader passes over any',
  );

  const noResult = closingTurn(at, 'toolu_1', { outcome: 'done' }).slice(0, 2).join('\n');
  assert.equal(lastStructuredOutput(noResult)?.lastWord, false, 'the call alone is not the result: the turn has not closed');
});

test('an idle session reports what it said; a busy one is not even asked', async () => {
  const said = { payload: { outcome: 'done' }, at: 5 };
  let asked = 0;
  const closeoutFrom = async () => {
    asked++;
    return said;
  };

  let restore = withFakeClaude(row('working', 'busy'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 0, closeoutFrom }).observe);
    assert.equal(seen.get('ae/t-1/1')?.closeout, undefined);
    assert.equal(asked, 0, 'mid-turn, nothing it has said is final');
  } finally {
    restore();
  }

  restore = withFakeClaude(row('working', 'idle'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 0, closeoutFrom }).observe);
    assert.deepEqual(seen.get('ae/t-1/1')?.closeout, said);
    assert.equal(seen.get('ae/t-1/1')?.state, 'working', 'reported, not acted on — whose it is, the engine decides');
  } finally {
    restore();
  }
});

test('a blocked, idle session reports what it said too — and stays blocked, for the engine to judge', async () => {
  const said = { payload: { outcome: 'done' }, at: 5 };
  const restore = withFakeClaude(row('blocked', 'idle'));
  try {
    const seen = await Effect.runPromise(
      claudeOps({ now: () => 0, transcriptTime: async () => 0, closeoutFrom: async () => said }).observe,
    );
    assert.deepEqual(
      seen.get('ae/t-1/1')?.closeout,
      said,
      'Claude Code lists a session that gave its closeout and ended its turn as blocked and idle: the engine ends that attempt only if it is handed the statement',
    );
    assert.equal(seen.get('ae/t-1/1')?.state, 'input-required');
  } finally {
    restore();
  }
});

test('a finished session is read once while its transcript is unchanged — again once it is written, and again for another attempt', async () => {
  let asked = 0;
  let written = 0;
  const ops = claudeOps({
    transcriptTime: async () => written,
    closeoutFrom: async () => {
      asked++;
      return { payload: 1, at: 1 };
    },
  });
  let restore = withFakeClaude(row('done', 'idle'));
  try {
    await Effect.runPromise(ops.observe);
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 1, 'its transcript is older than the read');
    written = Date.now();
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 2, 'written since the read: read again');
  } finally {
    restore();
  }

  written = 0;
  restore = withFakeClaude(JSON.stringify([{ name: 'ae/t-2/1', sessionId: 's-1', state: 'done', status: 'idle', kind: 'background' }]));
  try {
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 3, "`--resume` keeps the session's id: under a new attempt's name it is read again, however old its transcript");
  } finally {
    restore();
  }
});

test('Claude Code is handed the schema as --json-schema, and the prompt still comes last', async () => {
  const dir = scratch('fake-claude-');
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const schema = { type: 'object', properties: { outcome: { type: 'string' } } };
    await Effect.runPromise(claudeOps().spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: dir, closeoutSchema: schema }));
    const args = fs.readFileSync(argsFile, 'utf8').trim().split('\n');
    const i = args.indexOf('--json-schema');
    assert.notEqual(i, -1);
    assert.deepEqual(JSON.parse(args[i + 1]), schema);
    assert.equal(args.at(-1), 'the prompt');
  } finally {
    process.env.PATH = prev;
  }
});

import type { SpawnRequest } from '../src/runner.ts';

/** The argv `claudeOps().spawn` hands to `claude`, recorded by a fake one on PATH. */
const argvOf = async (r: Partial<SpawnRequest>) => {
  const dir = scratch('fake-claude-');
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    await Effect.runPromise(claudeOps().spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: dir, ...r }));
    return fs.readFileSync(argsFile, 'utf8').replace(/\n$/, '').split('\n');
  } finally {
    process.env.PATH = prev;
  }
};

test('at shipped defaults Claude Code is given neither --tools nor --effort', async () => {
  const args = await argvOf({});
  assert.equal(args.includes('--tools'), false, 'no list: every tool the harness has');
  assert.equal(args.includes('--disallowedTools'), false, 'no deny list: nothing denied beyond the settings');
  assert.equal(args.includes('--allowedTools'), false, 'no allow list: only what the permission mode allows by itself');
  assert.equal(args.includes('--effort'), false, "no effort: the harness's own");
  assert.equal(args.includes('--max-budget-usd'), false, 'no budget: no cap');
  assert.equal(args.includes('--remote-control'), false, 'no Remote Control: never a default');
  assert.equal(args.includes('--autocompact'), false, "no window: the model's own");
});

test('a context window reaches Claude Code as --autocompact and its digits, where no variadic flag can take it and it takes nothing', async () => {
  const args = await argvOf({
    config: {
      contextTokens: 200000,
      tools: ['Read'],
      disallowedTools: ['SendMessage'],
      claude: { remoteControl: true },
      worktree: true,
      effort: 'high',
    },
  });
  const i = args.indexOf('--autocompact');
  assert.notEqual(i, -1, args.join(' '));
  assert.equal(args[i + 1], '200000', 'digits, never `200k`, and never below 1000, which the CLI reads as thousands');
  assert.ok(i > args.indexOf('--permission-mode'), 'after the flag that ends the variadic lists');
  assert.ok(i < args.indexOf('--worktree'), 'before the optional value that must never meet the prompt');
  assert.equal(args.at(-1), 'the prompt');
  assert.equal(
    args.filter((a) => a === '--autocompact').length,
    1,
    'once, beside the variadic lists and the flags that take an optional value',
  );
});

test('claude.remoteControl reaches Claude Code as --remote-control, and a flag follows it so it cannot take the prompt as its name', async () => {
  const args = await argvOf({ config: { claude: { remoteControl: true }, tools: ['Read'], disallowedTools: ['SendMessage'] } });
  const i = args.indexOf('--remote-control');
  assert.notEqual(i, -1, args.join(' '));
  assert.equal(args[i + 1], '--permission-mode', 'a flag, not a value, comes next');
  assert.equal(
    args.filter((a) => a === '--remote-control').length,
    1,
    "`--remote-control [name]` takes an optional value: before the prompt it would take the prompt as the session's name",
  );
  assert.equal(args[args.indexOf('--tools') + 1], 'Read', 'the variadic lists before it keep their values');
  assert.equal(args[args.indexOf('--disallowedTools') + 1], 'SendMessage');
  assert.equal(args.at(-1), 'the prompt');
  assert.equal((await argvOf({ config: { claude: {} } })).includes('--remote-control'), false, 'not asked, not given');
});

test('at shipped defaults, a background task filed with claude.remoteControl is spawned with --remote-control, and so is one journalled with remoteControl before it moved; one filed without it never is', async () => {
  const dir = scratch('fake-claude-');
  const registry = path.join(dir, 'registry.json');
  const runs = path.join(dir, 'runs.jsonl');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(
    path.join(dir, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === '--bg') {
  fs.appendFileSync(${JSON.stringify(runs)}, JSON.stringify(args) + '\\n');
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
}
`,
    { mode: 0o755 },
  );
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const root = scratch('ae-remote-');
    const engine = createEngine({ root });
    await engine.file({ brief: 'bridged', cwd: dir, config: { background: true, claude: { remoteControl: true } } });
    await engine.file({ brief: 'plain', cwd: dir, config: { background: true } });
    const at = new Date().toISOString();
    await Effect.runPromise(
      Journal.filesOps(root).append('t-before-the-move', {
        kind: 'filed',
        at,
        brief: 'bridged before',
        cwd: dir,
        queued: false,
        config: { background: true, remoteControl: true },
      } as unknown as Event),
    );
    await engine.tick();

    const argvs = fs
      .readFileSync(runs, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
    const of = (brief: string) => argvs.filter((a) => a.at(-1) === brief);
    assert.equal(of('bridged').length, 1, 'its attempt');
    for (const args of of('bridged')) assert.ok(args.includes('--remote-control'), args.join(' '));
    assert.equal(of('bridged before').length, 1, 'its attempt');
    for (const args of of('bridged before')) assert.equal(args[args.indexOf('--remote-control') + 1], '--permission-mode', args.join(' '));
    assert.equal(of('plain').length, 1);
    for (const args of of('plain')) assert.equal(args.includes('--remote-control'), false, args.join(' '));
  } finally {
    process.env.PATH = prev;
  }
});

test('a budget reaches Claude Code as --max-budget-usd, and the prompt still comes last', async () => {
  const args = await argvOf({ config: { tools: ['Read'], budgetUsd: 0.5 } });
  assert.equal(
    args[args.indexOf('--max-budget-usd') + 1],
    '0.5',
    '`file()` refuses a budget on this harness, which keeps none under `--bg`; a task that reaches the runner with one gets it',
  );
  assert.equal(args.at(-1), 'the prompt');
});

test('tools reach Claude Code as --tools, and a flag ends the list before the prompt', async () => {
  const args = await argvOf({ config: { tools: ['Read', 'Grep', 'Glob'] } });
  const i = args.indexOf('--tools');
  assert.notEqual(i, -1);
  assert.equal(args[i + 1], 'Read,Grep,Glob');
  assert.equal(args[i + 2], '--permission-mode', '`--tools <tools...>` is variadic: before the prompt it would take the prompt as a tool');
  assert.equal(args.at(-1), 'the prompt');
});

test('an empty tool list reaches Claude Code as no tools at all, not as every tool', async () => {
  const args = await argvOf({ config: { tools: [] } });
  assert.equal(args[args.indexOf('--tools') + 1], '');
});

test('disallowedTools reach Claude Code as --disallowedTools, the rules in one argument, and a flag ends the list before the prompt', async () => {
  const args = await argvOf({
    config: { tools: ['Read', 'Bash'], disallowedTools: ['Bash(npm run build)', 'Bash(npm run e2e)', 'SendMessage'] },
  });
  const i = args.indexOf('--disallowedTools');
  assert.notEqual(i, -1, args.join(' '));
  assert.equal(args[i + 1], 'Bash(npm run build),Bash(npm run e2e),SendMessage', 'a space inside a rule stays inside it');
  assert.equal(args[i + 2], '--permission-mode', 'variadic: before the prompt it would take the prompt as a rule to deny');
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Bash', 'beside the tool list, not in its place');
  assert.equal(args.at(-1), 'the prompt');
  assert.equal(
    (await argvOf({ config: { disallowedTools: [] } })).includes('--disallowedTools'),
    false,
    'an empty list denies nothing, and is not passed',
  );
});

test('allowedTools reach Claude Code as --allowedTools, the rules in one argument, and a flag ends the list before the prompt', async () => {
  const args = await argvOf({
    config: { tools: ['Read', 'Write'], disallowedTools: ['SendMessage'], allowedTools: ['Write(**)', 'Bash(npm test)'] },
  });
  const i = args.indexOf('--allowedTools');
  assert.notEqual(i, -1, args.join(' '));
  assert.equal(args[i + 1], 'Write(**),Bash(npm test)', 'a space inside a rule stays inside it');
  assert.equal(args[i + 2], '--permission-mode', 'variadic: before the prompt it would take the prompt as a rule to allow');
  assert.equal(args[args.indexOf('--disallowedTools') + 1], 'SendMessage', 'beside the deny list, not in its place');
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Write');
  assert.equal(args.at(-1), 'the prompt');
  assert.equal(
    (await argvOf({ config: { allowedTools: [] } })).includes('--allowedTools'),
    false,
    'an empty list allows nothing extra, and is not passed',
  );
});

test('effort reaches Claude Code as --effort', async () => {
  const args = await argvOf({ config: { effort: 'high' } });
  assert.equal(args[args.indexOf('--effort') + 1], 'high');
  assert.equal(args.at(-1), 'the prompt');
});

const rowStarted = (state: string, status: string, startedAt?: number) =>
  JSON.stringify([
    {
      name: 'ae/t-1/1',
      sessionId: 's-1',
      state,
      status,
      kind: 'background',
      ...(startedAt !== undefined ? { startedAt } : {}),
    },
  ]);

test("usage is measured from the session's own start, as the registry records it", async () => {
  const restore = withFakeClaude(rowStarted('done', 'idle', 1_789_000_000_000));
  try {
    let since: number | undefined;
    const ops = claudeOps({
      transcriptTime: async () => 0,
      closeoutFrom: async () => undefined,
      usageFrom: async (_id, from) => {
        since = from;
        return { turns: 2, toolCalls: 1 };
      },
    });
    const seen = (await Effect.runPromise(ops.observe)).get('ae/t-1/1');
    assert.equal(since, 1_789_000_000_000);
    assert.deepEqual(seen?.usage, { turns: 2, toolCalls: 1 });
  } finally {
    restore();
  }
});

test('no start in the registry, no usage — an inherited conversation could not be told apart', async () => {
  const restore = withFakeClaude(rowStarted('done', 'idle'));
  try {
    let asked = 0;
    const ops = claudeOps({
      transcriptTime: async () => 0,
      closeoutFrom: async () => undefined,
      usageFrom: async () => {
        asked++;
        return { turns: 9, toolCalls: 9 };
      },
    });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.usage, undefined);
    assert.equal(asked, 0, 'not even asked');
  } finally {
    restore();
  }
});

test('a busy session is not read for usage — nothing it has consumed is final', async () => {
  const restore = withFakeClaude(rowStarted('working', 'busy', 1));
  try {
    let asked = 0;
    const ops = claudeOps({
      transcriptTime: async () => 0,
      usageFrom: async () => {
        asked++;
        return { turns: 1, toolCalls: 0 };
      },
    });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.usage, undefined);
    assert.equal(asked, 0);
  } finally {
    restore();
  }
});

test('claude that could not even be launched says nothing started; one that ran and failed does not', async () => {
  const caught = (cwd: string) =>
    Effect.runPromise(
      claudeOps()
        .spawn({ name: 'ae/t/1', brief: 'b', cwd })
        .pipe(
          Effect.as(undefined),
          Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
        ),
    );
  const missing = await caught(path.join(scratch('ae-nocwd-'), 'gone'));
  assert.equal(missing?.refused, true, 'the OS refused the process: no session can exist');

  const dir = scratch('fake-claude-');
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\necho "something went wrong" >&2\nexit 1\n', { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const ran = await caught(dir);
    assert.ok(ran, 'it failed');
    assert.notEqual(ran?.refused, true, 'claude ran and exited 1: whether it registered a session is not known');
  } finally {
    process.env.PATH = prev;
  }
});
