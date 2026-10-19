/**
 * A stand-in for a harness that prints Claude Code's stream-json as it writes: what a holder's session is in
 * `test/holder-follow.boundary.test.ts`, so a follow across processes has text in progress to carry.
 *
 * It prints its start event, opens a text block, writes `Rivers`, then waits for the file `go` under `STAND_ROOT` before it
 * writes ` run.`, closes the block and ends with a result. Its conversation goes in `STAND_ROOT/transcripts/<id>.jsonl`,
 * where the spec's `transcript.file` reads it, so a reader with the holder gone still has it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = process.env.STAND_ROOT;
if (!root) throw new Error('the stand-in job is told its store in STAND_ROOT');

const id = randomUUID();
const transcripts = path.join(root, 'transcripts');
fs.mkdirSync(transcripts, { recursive: true });
const file = path.join(transcripts, `${id}.jsonl`);

const say = (o: object) => process.stdout.write(`${JSON.stringify(o)}\n`);
const event = (e: object) => say({ type: 'stream_event', event: e, session_id: id });
const kept = (o: object) => fs.appendFileSync(file, `${JSON.stringify(o)}\n`);
const at = () => new Date().toISOString();
const delta = (text: string) => event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });

say({ type: 'system', subtype: 'init', session_id: id, cwd: process.cwd() });
kept({ type: 'user', uuid: 'u-1', timestamp: at(), message: { role: 'user', content: 'Say it.' } });
event({ type: 'message_start', message: { id: 'msg_1' } });
event({ type: 'content_block_start', index: 0 });
delta('Rivers');

const go = path.join(root, 'go');
while (!fs.existsSync(go)) await new Promise((r) => setTimeout(r, 25));

delta(' run.');
const said = {
  type: 'assistant',
  uuid: 'a-1',
  timestamp: at(),
  message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'Rivers run.' }] },
};
say(said);
event({ type: 'content_block_stop', index: 0 });
kept(said);
say({ type: 'result', subtype: 'success', session_id: id, is_error: false, result: 'Rivers run.' });
