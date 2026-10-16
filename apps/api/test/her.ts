/**
 * Nemia's session as an api test plants it: her task journalled filed long-lived and spawned, its session listed working by the
 * harness's `claude agents`, its transcript written where Claude Code keeps one, and her level file naming it (`withHer`); `said`
 * appends to a session's transcript afterwards. Her chat's own files are planted by none of it.
 *
 * Read by the tests of her chat on the api (`nemia-chat.test.ts`, `nemia-chat-stop.boundary.test.ts`), which share one fixture so her
 * record is planted one way.
 */
import { config, registry, root } from './harness.ts';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** The moment every planted line is written from. */
export const T0 = Date.parse('2026-10-15T12:00:00.000Z');

/** `s` seconds after `T0`, as a time is written. */
export const at = (s: number): string => new Date(T0 + s * 1000).toISOString();

const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** One line of her session's transcript, as Claude Code writes it: her words `text`. */
const herLine = (sessionId: string, uuid: string, s: number, text: string) => ({
  sessionId,
  isSidechain: false,
  userType: 'external',
  cwd: '/code/app',
  version: '2.1.270',
  type: 'assistant',
  uuid,
  timestamp: at(s),
  message: { role: 'assistant', content: [{ type: 'text', text }] },
});

/** Her session's transcript, `words` appended to it. */
export const said = (sessionId: string, words: string[], from = 0): void => {
  const file = path.join(config, 'projects', '-code-app', `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, jsonl(words.map((w, i) => herLine(sessionId, `e${from + i}`, from + i + 1, w))));
};

/**
 * Her task at work: journalled as filed long-lived and spawned, its session listed working by `claude agents`, its transcript `words`,
 * and her level file naming it; her chat's files none.
 */
export function withHer(words: string[]): { task: string; sessionId: string } {
  const task = `nemia-${randomUUID().slice(0, 8)}`;
  const sessionId = randomUUID();
  const journal = path.join(root, 'engine', 'tasks', `${task}.jsonl`);
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const filed = { kind: 'filed', at: at(0), brief: 'Be there.', cwd: '/code/app', maxAttempts: 1, harness: 'claude' };
  fs.writeFileSync(journal, jsonl([filed, { kind: 'starting', at: at(0), attempt: 1 }, { kind: 'spawned', at: at(0), attempt: 1 }]));
  const rows = fs.existsSync(registry) ? (JSON.parse(fs.readFileSync(registry, 'utf8')) as object[]) : [];
  rows.push({ name: `ae/${task}/1`, sessionId, kind: 'background', state: 'working', status: 'busy', startedAt: T0 });
  fs.writeFileSync(registry, JSON.stringify(rows));
  said(sessionId, words);
  fs.mkdirSync(path.join(root, 'nemia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'semi-auto', since: at(0), task }));
  fs.rmSync(path.join(root, 'nemia', 'chat'), { recursive: true, force: true });
  return { task, sessionId };
}
