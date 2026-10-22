/**
 * The outputs the shipped readers are tested on, shaped as each harness prints them (keys trimmed): `claude -p`'s result line
 * and its `stream-json` events, and Codex's `exec --json` stream. `READER_STREAMS` is a corpus of them, each reader's cases
 * together, over which `said.test.ts` pins what the readers decode (`SAID_DIGEST`).
 */

/** The session id every Claude Code line here carries. */
export const SESSION = '5e551011-0000-4000-8000-000000000001';

/** The model every Claude Code `init` line here names: what the session really started on, as a reader reads it back. */
export const MODEL = 'claude-haiku-4-5';

/** A `result` object as `claude -p --output-format json` prints it, on one line (keys trimmed), with `o` over its fields. */
export const resultLine = (o: object) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: 'ok', session_id: SESSION, ...o });

/** Lines of `claude -p --output-format stream-json --verbose`, shaped as Claude Code prints them (keys trimmed). */
export const stream = {
  init: JSON.stringify({ type: 'system', subtype: 'init', session_id: SESSION, permissionMode: 'default', model: MODEL }),
  calls: (...uses: Array<[string, string, object]>) =>
    JSON.stringify({
      type: 'assistant',
      session_id: SESSION,
      message: { role: 'assistant', content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })) },
    }),
  denied: (id: string, tool: string, reason?: object) =>
    JSON.stringify({
      type: 'system',
      subtype: 'permission_denied',
      tool_name: tool,
      tool_use_id: id,
      ...(reason ?? {
        decision_reason_type: 'asyncAgent',
        decision_reason: 'no approval surface in this session; permission request denied automatically',
      }),
      message: 'Permission for this tool use was denied. It requires approval, and this session has no approval surface.',
      session_id: SESSION,
    }),
  toolResult: (id: string) =>
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'denied' }] },
    }),
};

/** A stream as `codex exec --json` writes it, its text shortened. */
export const codexStream = (...events: object[]) =>
  ['Reading additional input from stdin...', ...events.map((e) => JSON.stringify(e))].join('\n');
export const THREAD = { type: 'thread.started', thread_id: '01a09996-d343-7932-8971-b2f209ba315b' };
export const TURN = { type: 'turn.started' };
export const item = (phase: 'started' | 'completed', id: string, type: string, rest: object = {}) => ({
  type: `item.${phase}`,
  item: { id, type, ...rest },
});
export const USED = {
  input_tokens: 373710,
  cached_input_tokens: 313856,
  cache_write_input_tokens: 0,
  output_tokens: 1082,
  reasoning_output_tokens: 108,
};
export const completed = (usage: object = USED) => ({ type: 'turn.completed', usage });

const DENIALS = [
  { tool_name: 'Write', tool_use_id: 'toolu_1', tool_input: { file_path: '/tmp/outside/x.txt', content: 'hi' } },
  { tool_name: 'WebFetch', tool_use_id: 'toolu_2', tool_input: { url: 'https://example.com', prompt: 'the title?' } },
  { tool_name: 'Bash', tool_use_id: 'toolu_3', tool_input: { command: "  python3 -c 'import os; print(42)'", description: 'make it' } },
  { tool_name: 'Skill', tool_use_id: 'toolu_4', tool_input: { skill: 'look' } },
  { tool_name: 'NotebookEdit', tool_use_id: 'toolu_5', tool_input: { notebook_path: '/r/n.ipynb' } },
  { tool_name: 'Bash', tool_use_id: 'toolu_6', tool_input: { command: '' } },
  { tool_use_id: 'toolu_7', tool_input: { command: 'ls' } },
  { tool_name: 'WebFetch', tool_use_id: 'toolu_2', tool_input: { url: 'https://example.com' } },
];

const RESULTS = [
  ['a warning on stderr', resultLine({ structured_output: { outcome: 'done' } }), ''].join('\n'),
  resultLine({}),
  resultLine({ structured_output: null }),
  resultLine({ structured_output: { outcome: 'done' } }).slice(0, -8),
  'The result: {"outcome":"done"}',
  '',
  resultLine({
    subtype: 'error_max_budget_usd',
    is_error: true,
    terminal_reason: 'budget_exhausted',
    errors: ['Reached maximum budget ($0.01)'],
    total_cost_usd: 0.01804,
    duration_api_ms: 718,
  }),
  resultLine({ subtype: 'error_max_turns', is_error: true }),
  resultLine({
    usage: { input_tokens: 10, cache_creation_input_tokens: 21392, cache_read_input_tokens: 0, output_tokens: 36, iterations: [] },
  }),
  resultLine({ usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }),
  resultLine({ usage: { input_tokens: 10, output_tokens: 5 } }),
  resultLine({ total_cost_usd: 0.01804, duration_api_ms: 718, usage: { input_tokens: 0, output_tokens: 0 } }),
  resultLine({ structured_output: { outcome: 'done' }, total_cost_usd: 0.2 }),
  resultLine({ total_cost_usd: 'a lot', duration_api_ms: null }),
  resultLine({ permission_denials: DENIALS }),
  resultLine({ permission_denials: 'Write' }),
];

const DENIED_STREAM = [
  stream.init,
  stream.calls(['toolu_w', 'Write', { file_path: '/tmp/outside/x.txt', content: 'hi' }]),
  stream.denied('toolu_w', 'Write', { decision_reason_type: 'workingDir', decision_reason: 'Path is outside allowed working directories' }),
  stream.toolResult('toolu_w'),
  stream.calls(['toolu_u', 'Bash', { command: 'uname -a' }]),
  stream.toolResult('toolu_u'),
  stream.calls(['toolu_s', 'Skill', { skill: 'look' }], ['toolu_f', 'WebFetch', { url: 'https://example.com' }]),
  stream.denied('toolu_f', 'WebFetch', {}),
  stream.toolResult('toolu_f'),
  resultLine({
    total_cost_usd: 0.02,
    structured_output: { outcome: 'done' },
    permission_denials: [
      { tool_name: 'Write', tool_use_id: 'toolu_w', tool_input: { file_path: '/tmp/outside/x.txt', content: 'hi' } },
      { tool_name: 'WebFetch', tool_use_id: 'toolu_f', tool_input: { url: 'https://example.com' } },
    ],
  }),
];

/**
 * A session that loaded skills: two loads, one of them named again on a later line, a load it was denied, and a call that
 * names no skill, before its result.
 */
export const SKILLS_STREAM = [
  stream.init,
  stream.calls(['toolu_k1', 'Skill', { skill: 'nemia-seldon:write-a-spec' }], ['toolu_k2', 'Skill', { skill: 'look' }]),
  stream.toolResult('toolu_k1'),
  stream.calls(['toolu_k1', 'Skill', { skill: 'nemia-seldon:write-a-spec' }]),
  stream.calls(['toolu_k3', 'Skill', { skill: 'grill-me' }]),
  stream.denied('toolu_k3', 'Skill'),
  stream.calls(['toolu_k4', 'Skill', {}], ['toolu_k5', 'Skill', { skill: ' ' }]),
  resultLine({ structured_output: { outcome: 'done' } }),
].join('\n');

/**
 * A session in `/w` that read and wrote files: one read twice, one outside its folder, one denied, and a call that names no file,
 * before its result.
 */
export const FILES_STREAM = [
  JSON.stringify({ type: 'system', subtype: 'init', cwd: '/w', session_id: SESSION, permissionMode: 'default', model: MODEL }),
  stream.calls(['toolu_r1', 'Read', { file_path: '/w/apps/web/a.tsx' }], ['toolu_e1', 'Edit', { file_path: '/w/b.ts' }]),
  stream.calls(['toolu_r2', 'Read', { file_path: '/w/apps/web/a.tsx' }], ['toolu_r3', 'Read', { file_path: '/elsewhere/c.ts' }]),
  stream.calls(['toolu_r4', 'Read', { file_path: '/w/d.ts' }]),
  stream.denied('toolu_r4', 'Read'),
  stream.calls(['toolu_g1', 'Grep', { pattern: 'x', path: '/w/e.ts' }], ['toolu_n1', 'NotebookEdit', { notebook_path: '/w/n.ipynb' }]),
  resultLine({ structured_output: { outcome: 'done' } }),
].join('\n');

/**
 * A session's whole conversation as `claude -p --verbose --include-partial-messages` prints it, outside `READER_STREAMS` so the
 * digest stays: an `init`, partial messages, an assistant's text and thinking beside calls whose input holds more than a reader
 * reads, a tool's result, a `system` line of another subtype, a rate limit, a denial and a result.
 */
export const CONVERSATION_STREAM = [
  JSON.stringify({ ...JSON.parse(stream.init), cwd: '/w' }),
  JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_1' } }, session_id: SESSION }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let' } } }),
  JSON.stringify({
    type: 'assistant',
    session_id: SESSION,
    message: {
      id: 'msg_1',
      role: 'assistant',
      usage: { input_tokens: 3, output_tokens: 9 },
      content: [
        { type: 'thinking', thinking: 'the secret plan', signature: 'sig' },
        { type: 'text', text: 'Let me write the file.' },
        { type: 'tool_use', id: 'toolu_c1', name: 'Write', input: { file_path: '/w/a.ts', content: 'export const a = 1;' } },
        { type: 'tool_use', id: 'toolu_c2', name: 'Edit', input: { file_path: '/w/b.ts', old_string: 'x', new_string: 'y' } },
        { type: 'tool_use', id: 'toolu_c3', name: 'Bash', input: { command: 'npm test -- --force', description: 'run the tests' } },
        { type: 'tool_use', id: 'toolu_c4', name: 'Grep', input: { pattern: 'secret', path: '/w' } },
        { type: 'tool_use', id: 'toolu_c5', name: 'Bash', input: { command: 'git push origin main', description: 'push it' } },
      ],
    },
  }),
  JSON.stringify({ type: 'assistant', session_id: SESSION, message: { content: [{ type: 'text', text: 'Only words here.' }] } }),
  stream.toolResult('toolu_c1'),
  stream.denied('toolu_c5', 'Bash'),
  JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 160000 } }),
  JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
  'a warning on stderr',
  resultLine({ structured_output: { outcome: 'done' }, total_cost_usd: 0.3, result: 'All done.' }),
  '',
].join('\n');

const LONE = [stream.init, stream.denied('toolu_b', 'Bash')].join('\n');

const STREAMS = [
  ...RESULTS,
  DENIED_STREAM.join('\n'),
  DENIED_STREAM.slice(0, -1).join('\n'),
  LONE,
  [LONE, stream.denied('toolu_b', 'Bash'), 'not json "permission_denied"'].join('\n'),
  [
    LONE,
    stream.calls(['toolu_x', 'Read', { file_path: '/r/a' }]),
    resultLine({
      permission_denials: [
        { tool_name: 'Bash', tool_use_id: 'toolu_b', tool_input: { command: 'pytest -q' } },
        { tool_name: 'Read', tool_use_id: 'toolu_x', tool_input: { file_path: '/r/a' } },
      ],
    }),
  ].join('\n'),
  [stream.init, stream.calls(['toolu_q', 'Bash', { command: 'ls' }]), stream.toolResult('toolu_q'), resultLine({})].join('\n'),
  SKILLS_STREAM,
  SKILLS_STREAM.split('\n').slice(1).join('\n'),
  FILES_STREAM,
  resultLine({ duration_api_ms: null }),
  [stream.init, JSON.stringify({ ...JSON.parse(stream.denied('toolu_b', 'Bash')), tool_use_id: 7 }), resultLine({})].join('\n'),
  [stream.init, stream.calls(['toolu_b', 'Bash', { command: 'ls' }]).replace('"toolu_b"', '5'), resultLine({})].join('\n'),
  [JSON.stringify({ ...JSON.parse(stream.init), cwd: 5 }), resultLine({})].join('\n'),
];

const CODEX = [
  codexStream(
    THREAD,
    TURN,
    item('completed', 'item_0', 'agent_message', { text: 'reading the diff' }),
    item('started', 'item_1', 'command_execution', { command: "/bin/bash -lc 'git diff'", status: 'in_progress' }),
    item('completed', 'item_1', 'command_execution', { exit_code: 0, status: 'completed' }),
    item('completed', 'item_2', 'file_change', { status: 'completed' }),
    completed(),
  ),
  codexStream(THREAD, TURN, item('started', 'item_1', 'command_execution')),
  codexStream(TURN, completed(), TURN),
  codexStream(TURN, completed({ output_tokens: 5 })),
  codexStream(TURN, item('completed', 'item_1', 'mcp_tool_call'), completed()),
  codexStream(TURN, completed({ ...USED, cache_write_input_tokens: 5 })),
  codexStream(TURN, completed(), TURN, completed({ ...USED, input_tokens: 1, output_tokens: 2 })),
  codexStream(THREAD),
];

/** Each shipped reader's cases, by the reader's name: the Claude streams are read by both of Claude's readers. */
export const READER_STREAMS: Readonly<Record<'claudeResultOutput' | 'claudeStreamOutput' | 'codexOutput', readonly string[]>> = {
  claudeResultOutput: STREAMS,
  claudeStreamOutput: STREAMS,
  codexOutput: CODEX,
};
