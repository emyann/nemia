// The detached worker: runs an SDK session in its own process, reports via a status file.
import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'node:fs';
const [cwd, statusFile] = process.argv.slice(2);
const write = (o) => fs.writeFileSync(statusFile, JSON.stringify({ pid: process.pid, ...o }) + '\n');
write({ state: 'working' });
try {
  for await (const m of query({
    prompt: 'Write the word detached into DETACHED.md. Then stop.',
    options: { cwd, permissionMode: 'acceptEdits' },
  })) {
    if (m.type === 'system' && m.subtype === 'init') write({ state: 'working', sessionId: m.session_id });
    if (m.type === 'result') write({ state: m.is_error ? 'failed' : 'done', sessionId: m.session_id, costUsd: m.total_cost_usd });
  }
} catch (e) { write({ state: 'failed', error: String(e).slice(0, 120) }); }
