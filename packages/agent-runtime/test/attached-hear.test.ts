/**
 * A held session hears the words said to it from its say file (`hear`): a line that does not decode as words said is passed over and
 * counted heard, said on stderr with its byte in the file, and the lines after it are heard.
 */
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { hear, type Live } from '../src/harness/claude/attached-session.ts';
import { filesOf, type AttachedRun } from '../src/harness/claude/attached-file.ts';

const NAME = 'ae/t1/1';

test('REFUSED: a say-file line that is no words said is passed over, said with its byte, and the next line is heard', () => {
  const root = scratch('ae-hear-');
  const { say } = filesOf(root, NAME);
  fs.mkdirSync(path.dirname(say), { recursive: true });
  const bad = '{"txt":"x"}\n';
  fs.writeFileSync(say, `${bad}{"text":"y"}\n`);
  const pushed: string[] = [];
  const run = { name: NAME, state: 'idle', owner: process.pid, startedAt: new Date(0).toISOString() } as AttachedRun;
  const live = {
    run,
    letGo: false,
    open: false,
    waiting: 0,
    calls: new Map(),
    unanswered: new Set<string>(),
    asking: new Set<string>(),
    input: {
      closed: false,
      push: (words: string) => {
        pushed.push(words);
        return `${pushed.length}`;
      },
    },
  } as unknown as Live;
  const written = vi.spyOn(process.stderr, 'write');
  try {
    hear(root, live);
    assert.deepEqual(pushed, ['y']);
    assert.equal(live.run.heard, fs.statSync(say).size, 'every line is heard, the one passed over among them');
    const said = written.mock.calls.map(([text]) => String(text)).join('');
    assert.ok(said.includes(say) && said.includes('byte 0'), said);
  } finally {
    written.mockRestore();
  }
});
