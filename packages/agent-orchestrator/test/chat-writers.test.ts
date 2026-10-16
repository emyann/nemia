/**
 * One writer per chat file: the person's outbox and read mark are written by the chat's verbs alone (`chat.verb.ts`), the delivered
 * marks by the delivery alone (`deliver.verb.ts`), and none by any other file of the package's or the api's source. Each writer's
 * name is matched as a call, across line breaks; its definitions in the store are its own.
 *
 * Made to refuse a planted source first: a rule that reads nothing passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Each writer of a chat file, and the one source file that may call it. */
const WRITERS: Readonly<Record<string, string>> = {
  appendOutbox: 'packages/agent-orchestrator/src/chat/chat.verb.ts',
  writeReadMark: 'packages/agent-orchestrator/src/chat/chat.verb.ts',
  appendDelivered: 'packages/agent-orchestrator/src/chat/deliver.verb.ts',
};

/** The store that defines the writers. */
const STORE = 'packages/agent-orchestrator/src/chat/chat.store.ts';

/** The source the rule reads: every `.ts` file of the package's `src` and the api's, tests beside them left out. */
const sources = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const root of ['packages/agent-orchestrator/src', 'apps/api/src'])
    for (const f of fs.readdirSync(path.join(REPO, root), { recursive: true, encoding: 'utf8' }))
      if (f.endsWith('.ts') && !f.endsWith('.test.ts'))
        out[`${root}/${f.split(path.sep).join('/')}`] = fs.readFileSync(path.join(REPO, root, f), 'utf8');
  return out;
};

/** Each call of a writer in a file that is not its one writer. */
function strayWriters(files: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (file === STORE) continue;
    for (const [name, writer] of Object.entries(WRITERS))
      if (file !== writer && new RegExp(`\\b${name}\\s*\\(`).test(text)) out.push(`${file} calls ${name}, which ${writer} alone calls`);
  }
  return out;
}

test('REFUSED: a second writer of the outbox, the read mark or the delivered marks, a call across a line break too', () => {
  assert.deepEqual(
    strayWriters({
      'packages/agent-orchestrator/src/nemia/keep.verb.ts': 'appendOutbox(dir, entry);',
      'packages/agent-orchestrator/src/chat/chat.verb.ts': 'appendDelivered\n  (dir, mark);',
      'apps/api/src/nemia/chat.ts': 'writeReadMark(dir, mark)',
    }),
    [
      'packages/agent-orchestrator/src/nemia/keep.verb.ts calls appendOutbox, which packages/agent-orchestrator/src/chat/chat.verb.ts alone calls',
      'packages/agent-orchestrator/src/chat/chat.verb.ts calls appendDelivered, which packages/agent-orchestrator/src/chat/deliver.verb.ts alone calls',
      'apps/api/src/nemia/chat.ts calls writeReadMark, which packages/agent-orchestrator/src/chat/chat.verb.ts alone calls',
    ],
  );
});

test('each chat file has its one writer, and that writer calls it', () => {
  const files = sources();
  assert.deepEqual(strayWriters(files), []);
  for (const [name, writer] of Object.entries(WRITERS))
    assert.match(files[writer] ?? '', new RegExp(`\\b${name}\\s*\\(`), `${writer} writes through ${name}`);
});
