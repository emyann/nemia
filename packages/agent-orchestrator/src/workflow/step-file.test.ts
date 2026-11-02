/**
 * A step file read (`parseWorkflow`) and written (`renderStep`), as tables: each key read, and refused blank, twice or with a word it
 * does not take; the list entries of `tools:`, `disallowedTools:` and `allowedTools:`; the former names a file may still say; what
 * `renderStep` writes and refuses; and the frontmatter's own syntax. A refusal is a `WorkflowError` with exit 2, opening on the step
 * it is about and naming the line and its fix; its sentence is the code's to word. Reading a folder from disk is `test/workflow.test.ts`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_PERMISSION_MODES, CODEX_SANDBOXES } from 'agent-runtime';
import {
  asNamed,
  DEFAULT_ROUNDS,
  DENIALS,
  FORMER_KEYS,
  harnessPromptNamed,
  isFolderTeam,
  parseAgent,
  parseFolder,
  parseWorkflow,
  renderAgent,
  renderStep,
  splitFrontmatter,
  STEP_KEYS,
  WorkflowError,
  type StepDraft,
  type StepKey,
  type Workflow,
} from '../workflow.ts';
import { endsOnBase } from '../step/step.ts';
import { readsMounts } from '../filed/filed.ts';
import { FILED_AS } from '../keys/filed-as.ts';

/** `lines` with `place: git` before them, unless they say a place already, as every step file must. */
const placed = (lines: string): string => (/^(place:|workspace: folder)/m.test(lines) ? lines : `place: git\n${lines}`);

/** A step with this frontmatter and a body, with `place: git` unless it says a place (`placed`), as a folder hands it to the parser. */
const fm = (name: string, lines: string) => parseWorkflow(name, `---\n${placed(lines)}\n---\nDo the work.\n`);

/** A strict output schema declaring `findings` and `again`, as a looping step's is. */
const LOOPING = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
    again: { type: 'boolean' },
  },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const readLooping = (file: string) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined);

/** A row: what it does, and, for a refusal, the text its message opens on and what else it names. */
type Row = { row: string; run: () => unknown; naming?: [at: string, ...named: string[]] };

/** Each row of `rows` as a subtest of `t`: a refusal read as a `WorkflowError` with exit 2 naming what it says; any other, run. */
async function table(t: TestContext, rows: readonly Row[]): Promise<void> {
  for (const { row, run, naming } of rows)
    await t.test(row, () => {
      if (!naming) return void run();
      const [at, ...named] = naming;
      assert.throws(run, (e: unknown) => {
        assert.ok(e instanceof WorkflowError, String(e));
        assert.equal(e.exitCode, 2, e.message);
        assert.ok(e.message.startsWith(at), e.message);
        for (const name of named) assert.ok(e.message.includes(name), `names ${name}: ${e.message}`);
        return true;
      });
    });
}

/** A row reading step `name` with `lines`, its fields as `is` says. */
const reads = (row: string, name: string, lines: string, is: Partial<Record<keyof Workflow, unknown>>): Row => ({
  row,
  run: () => {
    const w = fm(name, lines) as Record<string, unknown>;
    for (const [key, value] of Object.entries(is)) assert.deepEqual(w[key], value, key);
  },
});

/** A row refusing step `name` with `lines`, its message opening on the step and naming each of `named`. */
const refuses = (row: string, name: string, lines: string, ...named: string[]): Row => ({
  row: `REFUSED: ${row}`,
  run: () => fm(name, lines),
  naming: [`${name}: `, ...named],
});

test('each key a step has: read as written, and refused blank, twice or with a word it does not take', async (t) => {
  await table(t, [
    reads('frontmatter and prose: the keys, and the body whole', 'review', 'harness: codex\nafter: implement', {
      harness: 'codex',
      after: ['implement'],
      body: 'Do the work.',
    }),
    reads('a step with no key but its place: nothing set', 'only', 'harness: claude', {
      after: [],
      check: undefined,
      retries: undefined,
      tools: undefined,
      effort: undefined,
      context: undefined,
      disallowedTools: undefined,
      allowedTools: undefined,
      budget: undefined,
      gate: undefined,
      workspace: undefined,
      slot: undefined,
      remote: undefined,
      denials: undefined,
      reads: undefined,
      input: undefined,
    }),
    {
      row: 'REFUSED: a step with nothing to say',
      run: () => parseWorkflow('empty', '---\nplace: git\nharness: claude\n---\n'),
      naming: ['empty'],
    },
    refuses(
      'a key no step has, with the keys it has',
      'review',
      'colour: red',
      '`colour` is not a key a step has',
      'after, resume, input',
      'rounds',
    ),
    refuses('a key in another case', 'review', 'Harness: codex', '`Harness` is not a key a step has'),
    refuses('a key of the prototype', 'review', 'constructor: x', '`constructor` is not a key a step has'),
    refuses("the agent's own line", 'review', 'role: Reviewer', '`role` is not a key a step has'),
    refuses('`afer`, which would make a root', 'review', 'afer: implement', '`afer`', 'after, resume'),
    refuses('guide', 'implement', 'guide: CLAUDE.md', '`guide`', 'CLAUDE.md'),
    ...['1', '2'].map((v) =>
      refuses(
        `maxAttempts: ${v}`,
        'implement',
        `maxAttempts: ${v}`,
        '`maxAttempts`',
        '`retries: N`',
        '`nemia retry <run> <step>`',
        'Delete the line',
      ),
    ),
    ...['true', 'false'].map((v) =>
      refuses(`background: ${v}`, 'implement', `background: ${v}`, '`background`', 'Agent SDK', 'Delete the line'),
    ),
    {
      row: 'the retired keys are no longer keys',
      run: () =>
        assert.deepEqual(
          ['maxAttempts', 'background'].filter((k) => (STEP_KEYS as readonly string[]).includes(k)),
          [],
        ),
    },
    refuses('a key set twice', 'review', 'harness: claude\nharness: codex', '`harness` is set twice'),
    refuses('after set twice, saying how to list', 'integrate', 'after: docs\nafter: tests', '`after` is set twice', '`after: a, b`'),
    refuses('a key with no value', 'implement', 'model:', '`model` has no value', 'Delete the line'),

    reads('after: a list, trimmed', 'x', 'after: a, b ,c', { after: ['a', 'b', 'c'] }),
    reads('resume: implies after', 'respond', 'resume: implement', { resume: 'implement', after: ['implement'] }),
    reads('input: a list, like after', 'integrate', 'after: a, b\ninput: a, b', { input: ['a', 'b'] }),

    reads(
      'check: verbatim, colons and all; retries: a count',
      'implement',
      'check: npm test && node -e "console.log(1 ? 2 : 3)"\nretries: 2',
      {
        check: 'npm test && node -e "console.log(1 ? 2 : 3)"',
        retries: 2,
      },
    ),
    reads('check: a flow list is the shell the line form wrote', 'implement', 'check: [ -f x ]', { check: '[ -f x ]' }),
    refuses('check: blank', 'implement', 'check:', '`check` has no value', 'exit 0'),
    refuses('check: only spaces', 'implement', 'check:   ', '`check` has no value'),
    refuses('check: none, which runs as a command', 'implement', 'check: none', 'exits 127'),
    ...['""', "''"].map((none) => refuses(`check: ${none}, YAML's empty text`, 'implement', `check: ${none}`)),
    { row: 'REFUSED: check: a list on a key of one value', run: () => fm('implement', 'check:\n  - npm test'), naming: ['implement:3: '] },
    refuses('check: twice', 'implement', 'check: npm test\ncheck: npm run lint'),

    reads('retries: 0, what absent means', 'x', 'retries: 0', { retries: 0 }),
    ...['-1', '1.5', 'once'].map((bad) =>
      refuses(`retries: ${bad}`, 'x', `retries: ${bad}`, `\`retries: ${bad}\` is not a count`, 'zero or more'),
    ),

    reads('deadlineSeconds: a count', 'review', 'deadlineSeconds: 900', { deadlineSeconds: 900 }),
    refuses(
      'deadlineSeconds: 5m, with the seconds',
      'review',
      'deadlineSeconds: 5m',
      '`deadlineSeconds: 5m`',
      'not a count',
      '`deadlineSeconds: 300`',
    ),
    refuses('deadlineSeconds: 2h, with the seconds', 'review', 'deadlineSeconds: 2h', '`deadlineSeconds: 7200`'),
    ...['0', '-5', '1.5', '9e2', 'NaN', 'Infinity', 'ninety', '0x10'].map((bad) =>
      refuses(`deadlineSeconds: ${bad}`, 'review', `deadlineSeconds: ${bad}`, 'is not a count', 'above zero'),
    ),

    ...(
      [
        ['5', 5],
        ['2.50', 2.5],
        ['0.25', 0.25],
      ] as const
    ).map(([v, n]) => reads(`budget: ${v}`, 'implement', `budget: ${v}`, { budget: n })),
    reads('budget: on claude', 'implement', 'harness: claude\nbudget: 3', { budget: 3 }),
    ...['0', '0.00'].map((zero) =>
      refuses(`budget: ${zero}`, 'implement', `budget: ${zero}`, `\`budget: ${zero}\` is not an amount`, 'a number above zero'),
    ),
    ...['-1', '-2.50', 'five', 'lots', '1e3', '.5', '2.', 'Infinity', 'NaN', '5 5'].map((bad) =>
      refuses(`budget: ${bad}`, 'implement', `budget: ${bad}`, 'is not an amount', 'for example `budget: 5`'),
    ),
    refuses('budget: $5, a unit', 'implement', 'budget: $5', '`budget: $5` is not an amount', 'with no unit — `budget: 5`'),
    refuses('budget: 2.50 USD, a unit', 'implement', 'budget: 2.50 USD', 'with no unit — `budget: 2.50`'),
    refuses('budget: blank', 'implement', 'budget:', '`budget` has no value', 'or delete the line'),
    refuses('budget: only spaces', 'implement', 'budget:   ', '`budget` has no value'),

    ...['claude', 'codex'].map((h) => reads(`harness: ${h}`, 'x', `harness: ${h}`, { harness: h })),
    refuses(
      'harness: a word that is none',
      'review',
      'harness: banana',
      '`harness: banana`',
      'claude, codex',
      '`a2a:<name>`',
      '`a2a-agents.json`',
    ),
    refuses("harness: check, the run's own", 'review', 'harness: check', '`harness: check`', '`check:`'),
    refuses('harness: in another case', 'review', 'harness: Codex', 'not a harness a step can run on'),
    refuses('harness: the retired one', 'review', 'harness: claude-detached', '`harness: claude-detached`', 'Delete the line', 'Agent SDK'),

    ...(
      [
        ['implement', 'effort: extreme', 'extreme'],
        ['review', 'harness: codex\neffort: ultra', 'ultra'],
        ['review', 'harness: codex\neffort: minimal', 'minimal'],
        ['x', 'harness: claude\neffort: max', 'max'],
      ] as const
    ).map(([name, lines, effort]) => reads(`effort: ${lines.replace(/\n/g, ', ')}, as written`, name, lines, { effort })),

    ...(
      [
        ['200k', 200_000],
        ['150000', 150_000],
        ['100K', 100_000],
        ['1M', 1_000_000],
        ['1000k', 1_000_000],
        ['123456', 123_456],
        ['50k', 50_000],
        ['200', 200],
      ] as const
    ).map(([written, tokens]) => reads(`context: ${written}`, 'implement', `context: ${written}`, { context: tokens })),
    reads('context: on claude', 'x', 'harness: claude\ncontext: 2M', { context: 2_000_000 }),
    reads('context: on codex', 'x', 'harness: codex\ncontext: 200k', { context: 200_000 }),
    ...['lots', '200 k', '1.5M', '200,000', '0', '-1', '200kb', '0k'].map((bad) =>
      refuses(`context: ${bad}`, 'implement', `context: ${bad}`, `\`context: ${bad}\` is not a number of tokens`, '`context: 200k`'),
    ),
    refuses('context: blank', 'implement', 'context:', '`context` has no value'),

    ...['yolo', 'read-only', 'auto', 'manual'].map((mode) =>
      reads(`permissionMode: ${mode}, as written`, 'x', `permissionMode: ${mode}`, { permissionMode: mode }),
    ),
    reads('permissionMode: on claude', 'x', 'harness: claude\npermissionMode: bypassPermissions', { permissionMode: 'bypassPermissions' }),
    ...['yolo', 'read-only', 'bypassPermissions', 'danger-full-access'].map((sandbox) =>
      reads(`sandbox: ${sandbox} on codex, as written`, 'review', `harness: codex\nsandbox: ${sandbox}`, { sandbox }),
    ),
    ...(['', 'harness: claude\n'] as const).flatMap((line) =>
      CODEX_SANDBOXES.map((sandbox) =>
        refuses(
          `sandbox: ${sandbox} on claude${line ? '' : ', the default harness'}`,
          'implement',
          `${line}sandbox: ${sandbox}`,
          `\`sandbox: ${sandbox}\` is a codex step's sandbox`,
          'runs on claude',
          ...(line ? [] : ['there is no `harness:` line']),
          'Write `permissionMode:` instead',
        ),
      ),
    ),

    reads('gate: true', 'plan', 'gate: true', { gate: true }),
    refuses('gate: false', 'plan', 'gate: false', '`gate: false` is what a step without the line already is', '--gate plan'),
    ...['yes', 'True', 'plan', '1'].map((word) =>
      refuses(`gate: ${word}`, 'plan', `gate: ${word}`, `\`gate: ${word}\` is not \`true\``, '--gate plan'),
    ),
    refuses('gate: blank', 'plan', 'gate:', '`gate` has no value'),
    refuses('gate: twice', 'plan', 'gate: true\ngate: true', '`gate` is set twice'),

    reads('workspace: base', 'ship', 'after: review\nworkspace: base', { workspace: 'base' }),
    refuses(
      'workspace: worktree',
      'ship',
      'workspace: worktree',
      '`workspace: worktree` is what a step without the line already is',
      '`workspace: base`',
    ),
    ...['Base', 'Main', 'repo', '/tmp/x', 'true'].map((word) =>
      refuses(`workspace: ${word}`, 'ship', `workspace: ${word}`, `\`workspace: ${word}\` is not \`base\``),
    ),
    refuses('workspace: blank', 'ship', 'workspace:', '`workspace` has no value'),
    refuses('workspace: twice', 'ship', 'workspace: base\nworkspace: base', '`workspace` is set twice'),

    reads('place: folder', 'write', 'place: folder', { place: 'folder' }),
    reads('place: git', 'write', 'place: git', { place: 'git' }),
    reads("place: folder, a check run in the step's folder", 'review', 'place: folder\ncheck: test -s note.md', { place: 'folder' }),
    reads('place: folder, a resume in the folder it continues', 'review', 'place: folder\nresume: write', { place: 'folder' }),
    ...['Folder', 'folders', 'cloud'].map((word) =>
      refuses(
        `place: ${word}`,
        'write',
        `place: ${word}`,
        `\`place: ${word}\` is not a place a step works in`,
        '`place: git`',
        '`place: folder`',
      ),
    ),
    {
      row: 'REFUSED: place: none in the frontmatter',
      run: () => parseWorkflow('write', '---\ncheck: npm test\n---\nDo it.\n'),
      naming: ['write: ', 'says no `place:`', 'Write `place: git`', '`place: folder`'],
    },
    { row: 'REFUSED: place: none, a bare body', run: () => parseWorkflow('write', 'Do it.\n'), naming: ['write: ', 'says no `place:`'] },
    {
      row: 'REFUSED: place: none, which an agent cannot give',
      run: () =>
        parseWorkflow(
          'write',
          '---\nagent: writer\n---\n',
          undefined,
          new Map([['writer', parseAgent('writer', '---\nharness: claude\n---\nYou write.\n')]]),
        ),
      naming: ['write: ', 'says no `place:`'],
    },
    {
      row: 'REFUSED: place: none, which a hired agent cannot give',
      run: () =>
        parseWorkflow(
          'write',
          'Write.\n',
          undefined,
          new Map([['writer', parseAgent('writer', '---\nharness: claude\n---\nYou write.\n')]]),
          undefined,
          {
            agent: 'writer',
            factory: 'f',
            step: 'write',
          },
        ),
      naming: ['write: ', 'says no `place:`'],
    },
    {
      row: 'REFUSED: place: none, beside a step that says one — for the missing line',
      run: () =>
        parseFolder([
          ['write', '---\nplace: folder\n---\nWrite.\n'],
          ['review', '---\nafter: write\n---\nReview.\n'],
        ]),
      naming: ['review: ', 'says no `place:`'],
    },
    {
      row: 'REFUSED: place: on an agent, which is wiring',
      run: () => parseAgent('writer', '---\nplace: folder\n---\nYou write.\n'),
      naming: ['', '`place` is wiring, and belongs on the step'],
    },

    reads('slot: none', 'supervise', 'slot: none', { slot: 'none' }),
    ...['None', 'false', '0', 'off', 'one', 'true'].map((word) =>
      refuses(`slot: ${word}`, 'supervise', `slot: ${word}`, `\`slot: ${word}\` is not \`none\``, 'WF_MAX_RUNS'),
    ),
    refuses('slot: blank', 'supervise', 'slot:', '`slot` has no value'),
    refuses('slot: twice', 'supervise', 'slot: none\nslot: none', '`slot` is set twice'),

    reads('remote: true', 'implement', 'remote: true', { remote: true }),
    reads('remote: false, kept', 'implement', 'remote: false', { remote: false }),
    reads('remote: on codex, the engine judges at start', 'review', 'harness: codex\nremote: true', { remote: true }),
    ...['yes', 'no', 'on', 'True', '1', 'claude'].map((word) =>
      refuses(`remote: ${word}`, 'implement', `remote: ${word}`, `\`remote: ${word}\` is not \`true\` or \`false\``, 'claude.ai'),
    ),
    refuses('remote: blank', 'implement', 'remote:', '`remote` has no value'),
    refuses('remote: twice', 'implement', 'remote: true\nremote: false', '`remote` is set twice'),

    reads('denials: fail, on a claude job', 'review', 'denials: fail', { denials: 'fail' }),
    { row: 'denials: the one word', run: () => assert.deepEqual(DENIALS, ['fail']) },
    ...['true', 'stop', 'Fail', 'record'].map((word) =>
      refuses(`denials: ${word}`, 'review', `denials: ${word}`, `\`denials: ${word}\` is not \`fail\``, 'Write `denials: fail`'),
    ),
    refuses('denials: blank', 'review', 'denials:', '`denials` has no value', 'Delete the line'),
    refuses('denials: twice', 'review', 'denials: fail\ndenials: fail', '`denials` is set twice'),
    refuses(
      'denials: on codex',
      'review',
      'harness: codex\ndenials: fail',
      '`denials: fail`',
      '`codex exec` records none',
      'delete `harness: codex`',
      'delete `denials: fail`',
    ),

    reads('reads: inbox', 'review', 'reads: inbox', { reads: ['inbox'] }),
    reads('reads: costs', 'review', 'reads: costs', { reads: ['costs'] }),
    reads('reads: both', 'review', 'reads: inbox, costs', { reads: ['inbox', 'costs'] }),
    reads('reads: on claude', 'review', 'harness: claude\nreads: inbox', { reads: ['inbox'] }),
    {
      row: 'reads: a filing mounts only the names that mount a folder',
      run: () => {
        assert.deepEqual(readsMounts({ harness: 'claude', reads: ['costs'] }, '/s/inbox'), [], '`costs` is said in the brief');
        assert.equal(FILED_AS.mounts(fm('review', 'reads: inbox, costs')), 'reads: inbox');
        assert.equal(FILED_AS.mounts(fm('review', 'reads: costs')), undefined, '`costs` gives no mount');
        assert.equal(FILED_AS.mounts(fm('review', 'writable: web\nreads: costs')), 'writable: web');
      },
    },
    ...['runs', '/home/me/.agent-workflows/inbox', 'cost'].map((name) =>
      refuses(
        `reads: ${name}`,
        'review',
        `reads: ${name}`,
        `\`reads: ${name}\` has \`${name}\``,
        'names nothing of the store',
        'inbox, costs',
      ),
    ),
    ...['inbox', 'costs'].map((name) => refuses(`reads: ${name} twice`, 'review', `reads: ${name}, ${name}`, `names \`${name}\` twice`)),
    refuses('reads: no name', 'review', 'reads: , ,', '`reads: , ,` names nothing'),
    refuses('reads: on a remote agent', 'review', 'harness: a2a:peer\nreads: inbox', '`reads: inbox` gives a session on this machine'),
  ]);
});

test('the list entries of `tools:`, `disallowedTools:` and `allowedTools:`: one name or rule an entry, trimmed', async (t) => {
  await table(t, [
    reads('tools: an MCP tool', 'look', 'tools: mcp__playwright__browser_take_screenshot', {
      tools: ['mcp__playwright__browser_take_screenshot'],
    }),
    ...['tools: [Read, Grep]', 'tools:\n  - Read\n  - Grep', 'tools: "Read, Grep"'].map((lines) =>
      reads(`tools: YAML, ${JSON.stringify(lines)}`, 'review', lines, { tools: ['Read', 'Grep'] }),
    ),
    reads("tools: quotes are YAML's", 'review', 'tools: "Read"', { tools: ['Read'] }),
    reads('tools: on claude', 'review', 'harness: claude\ntools: Read', { tools: ['Read'] }),
    refuses('tools: blank', 'review', 'tools:', '`tools` has no value', '`tools: Read, Grep, Glob, Bash`'),
    refuses('tools: only a comma', 'review', 'tools: ,', '`tools: ,`', 'names no tool', 'Without the line'),
    refuses('tools: only commas', 'review', 'tools:  , ,', 'names no tool'),
    refuses('tools: no commas', 'review', 'tools: Read Grep Glob', '`tools: Read Grep Glob`', '`Read Grep Glob`', 'comma-separated'),
    refuses(
      'tools: a comma inside an entry',
      'review',
      'tools: Read, Bash(git diff, git log)',
      'a comma inside an entry',
      '`Bash(git diff`',
      '`git log)`',
    ),
    {
      row: 'REFUSED: tools: an item of a YAML list holding a comma',
      run: () => fm('review', 'tools: [Read, "Bash(a, b)"]'),
      naming: ['review:3: '],
    },
    refuses('tools: a rule', 'review', 'tools: Read, Bash(npm test)', '`Bash(npm test)`', 'not a tool name', '`Bash`, whole'),
    refuses('tools: a rule with no space', 'review', 'tools: Read, Bash(git:*)', '`Bash(git:*)`', 'not a tool name'),
    refuses(
      'tools: on codex',
      'review',
      'harness: codex\ntools: Read, Grep, Glob',
      '`tools: Read, Grep, Glob`',
      'codex has none',
      '`sandbox: read-only`',
    ),
    refuses('tools: on codex, the harness after it', 'review', 'tools: Read\nharness: codex\nsandbox: read-only', 'codex has none'),

    reads(
      'disallowedTools: a space inside a rule stays, a trailing comma adds none',
      'review',
      'tools: Read, Bash\ndisallowedTools: Bash(npm run build) ,  Bash(npm run e2e), SendMessage,',
      {
        disallowedTools: ['Bash(npm run build)', 'Bash(npm run e2e)', 'SendMessage'],
      },
    ),
    reads(
      'disallowedTools: an MCP tool and a path',
      'review',
      'disallowedTools: mcp__playwright__browser_run_code_unsafe, Read(//home/**)',
      {
        disallowedTools: ['mcp__playwright__browser_run_code_unsafe', 'Read(//home/**)'],
      },
    ),
    ...[`'`, `"`].flatMap((q) => {
      const rule = `Bash(git commit -m ${q}wip${q})`;
      return [
        reads(`disallowedTools: a quoted rule (${q}), then another`, 'review', `disallowedTools: ${rule}, SendMessage`, {
          disallowedTools: [rule, 'SendMessage'],
        }),
        reads(`disallowedTools: another, then a quoted rule (${q})`, 'review', `disallowedTools: SendMessage, ${rule}`, {
          disallowedTools: ['SendMessage', rule],
        }),
      ];
    }),
    reads('disallowedTools: on claude', 'review', 'harness: claude\ndisallowedTools: SendMessage', { disallowedTools: ['SendMessage'] }),
    reads('disallowedTools: a YAML list', 'review', 'disallowedTools: [SendMessage, CronCreate]', {
      disallowedTools: ['SendMessage', 'CronCreate'],
    }),
    reads('disallowedTools: quoted', 'review', 'disallowedTools: "SendMessage"', { disallowedTools: ['SendMessage'] }),
    reads('disallowedTools: on codex, the runtime judges at start', 'review', 'harness: codex\ndisallowedTools: Bash(npm run build)', {
      disallowedTools: ['Bash(npm run build)'],
    }),
    reads('disallowedTools: on codex beside a sandbox', 'review', 'disallowedTools: SendMessage\nharness: codex\nsandbox: read-only', {
      disallowedTools: ['SendMessage'],
    }),
    refuses(
      'disallowedTools: blank',
      'review',
      'disallowedTools:',
      '`disallowedTools` has no value',
      '`disallowedTools: Bash(npm run build), SendMessage`',
      'delete the line',
    ),
    refuses('disallowedTools: only a comma', 'review', 'disallowedTools: ,', '`disallowedTools: ,`', 'names no rule', 'Without the line'),
    refuses('disallowedTools: only commas', 'review', 'disallowedTools:  , ,', 'names no rule'),
    refuses(
      'disallowedTools: a comma inside the parentheses',
      'review',
      'disallowedTools: Bash(git push, git reset)',
      'a comma inside an entry',
      '`Bash(git push`',
      '`git reset)`',
      '`Bash(git push), Bash(git reset)`',
    ),
    refuses(
      'disallowedTools: a comma in quotes inside them',
      'review',
      "disallowedTools: Bash(git commit -m 'a, b'), SendMessage",
      'has a comma inside an entry',
    ),
    refuses(
      'disallowedTools: a space outside them',
      'review',
      'disallowedTools: SendMessage CronCreate',
      '`SendMessage CronCreate`',
      'not one rule',
      'a space outside',
    ),
    refuses(
      'disallowedTools: unclosed',
      'review',
      'disallowedTools: Bash(npm run build',
      '`Bash(npm run build`',
      'not one rule',
      'parentheses',
    ),
    refuses(
      'disallowedTools: a space before them',
      'review',
      'disallowedTools: Bash (npm run build)',
      '`Bash (npm run build)`',
      'not one rule',
      'parentheses',
    ),

    reads(
      'allowedTools: a space inside a rule stays, a trailing comma adds none',
      'write',
      'permissionMode: dontAsk\nallowedTools: Edit(**) ,  Bash(npm test), Read,',
      {
        allowedTools: ['Edit(**)', 'Bash(npm test)', 'Read'],
      },
    ),
    reads('allowedTools: on claude', 'write', 'harness: claude\nallowedTools: Edit(**)', { allowedTools: ['Edit(**)'] }),
    reads('allowedTools: beside the deny list', 'write', 'allowedTools: Edit(**)\ndisallowedTools: SendMessage', {
      allowedTools: ['Edit(**)'],
      disallowedTools: ['SendMessage'],
    }),
    reads('allowedTools: a YAML list', 'write', 'allowedTools: [Write, Edit]', { allowedTools: ['Write', 'Edit'] }),
    reads('allowedTools: on codex', 'write', 'harness: codex\nallowedTools: Edit(**)', { allowedTools: ['Edit(**)'] }),
    reads('allowedTools: on codex beside a sandbox', 'write', 'allowedTools: Edit(**)\nharness: codex\nsandbox: workspace-write', {
      allowedTools: ['Edit(**)'],
    }),
    refuses(
      'allowedTools: blank',
      'write',
      'allowedTools:',
      '`allowedTools` has no value',
      '`allowedTools: Edit(**), Bash(npm test)`',
      'delete the line',
    ),
    refuses(
      'allowedTools: only a comma',
      'write',
      'allowedTools: ,',
      '`allowedTools: ,`',
      'names no rule',
      'Without the line',
      '`permissionMode`',
    ),
    refuses(
      'allowedTools: a comma inside an entry',
      'write',
      'allowedTools: Bash(npm test, npm run build)',
      'a comma inside an entry',
      '`Bash(npm test`',
      '`npm run build)`',
      '`Edit(**), Bash(npm test)`',
    ),
    refuses('allowedTools: a space outside', 'write', 'allowedTools: Write Edit', '`Write Edit`', 'not one rule', 'a space outside'),
    refuses('allowedTools: unclosed', 'write', 'allowedTools: Write(**', '`Write(**`', 'not one rule', 'parentheses'),

    refuses(
      'allowedTools: a Write rule, never matched',
      'write',
      'allowedTools: Write(**)',
      '`allowedTools: Write(**)`',
      'denies the write',
      'Write `Edit(**)` instead',
    ),
    refuses(
      'allowedTools: a NotebookEdit rule, anywhere in the list',
      'write',
      'allowedTools: Edit(**), NotebookEdit(notes/**)',
      '`NotebookEdit(notes/**)`',
      'Write `Edit(notes/**)` instead',
    ),
    refuses('allowedTools: a Write rule on claude', 'write', 'harness: claude\nallowedTools: Write(src/**)', 'against `Edit` rules alone'),
    refuses(
      'disallowedTools: a Write rule, never matched',
      'write',
      'disallowedTools: Write(**)',
      '`disallowedTools: Write(**)`',
      'allows the write',
      'Write `Edit(**)` instead',
    ),
    refuses(
      'disallowedTools: a NotebookEdit rule, anywhere in the list',
      'write',
      'disallowedTools: SendMessage, NotebookEdit(notes/**)',
      'Write `Edit(notes/**)` instead',
    ),
    reads('allowedTools: the Edit rule', 'write', 'allowedTools: Edit(**)', { allowedTools: ['Edit(**)'] }),
    reads('disallowedTools: the Edit rule', 'write', 'disallowedTools: Edit(../**)', { disallowedTools: ['Edit(../**)'] }),
    reads('allowedTools: Write bare, no path to miss', 'write', 'allowedTools: Write', { allowedTools: ['Write'] }),
    reads('disallowedTools: Write bare, the tool itself', 'write', 'disallowedTools: Write', { disallowedTools: ['Write'] }),
  ]);
});

test('the former names a file may still say: read under the names they have now, never written, and refused beside them', async (t) => {
  const writer = (text: string) => new Map([['writer', parseAgent('writer', text)]]);
  await table(t, [
    {
      row: 'disallow and allow are the lists',
      run: () => assert.deepEqual(FORMER_KEYS, { disallow: 'disallowedTools', allow: 'allowedTools' }),
    },
    {
      row: 'disallow and allow: read as the new names, field for field',
      run: () => {
        const old = fm('write', 'disallow: Bash(git push *), SendMessage\nallow: Edit(**), Bash(npm test)');
        assert.deepEqual(old, fm('write', 'disallowedTools: Bash(git push *), SendMessage\nallowedTools: Edit(**), Bash(npm test)'));
        assert.equal(Object.hasOwn(old, 'allow') || Object.hasOwn(old, 'disallow'), false);
        assert.deepEqual(
          fm('review', 'disallow:\n  - SendMessage\n  - CronCreate').disallowedTools,
          ['SendMessage', 'CronCreate'],
          'a YAML list',
        );
      },
    },
    {
      row: "disallow and allow: an agent's file reads them the same way",
      run: () =>
        assert.deepEqual(parseAgent('writer', '---\ndescription: Writes\nallow: Edit(**)\n---\nWrite.\n').keys, {
          allowedTools: 'Edit(**)',
        }),
    },
    {
      row: 'disallow and allow: written back under the new names, in the harness block',
      run: () => {
        const text = renderStep(fm('write', 'disallow: Bash(git push *), SendMessage\nallow: Edit(**), Bash(npm test)'));
        assert.match(text, /^claude:\n {2}fence:\n {4}disallowedTools: Bash\(git push \*\), SendMessage$/m);
        assert.match(text, /^ {4}allowedTools: Edit\(\*\*\), Bash\(npm test\)$/m);
        assert.doesNotMatch(text, /^ *(dis)?allow:/m);
        assert.doesNotMatch(text, /^(dis)?allowedTools:/m, 'and no fence key at the top level');
      },
    },
    {
      row: "allow: a step's own over its agent's on the new name",
      run: () => {
        const [step] = parseFolder(
          [['write', '---\nplace: git\nagent: writer\nallow: Edit(notes/**)\n---\n']],
          undefined,
          writer('---\nallowedTools: Edit(**)\ndisallowedTools: SendMessage\n---\nWrite.\n'),
        );
        assert.deepEqual([step.allowedTools, step.disallowedTools], [['Edit(notes/**)'], ['SendMessage']]);
        assert.deepEqual(step.agent?.keys, ['place', 'allowedTools'], 'owned under the new name');
        assert.equal(step.agent?.given.disallowedTools, 'SendMessage');
        assert.equal(Object.hasOwn(step.agent?.given ?? {}, 'allowedTools'), false, 'what the step sets is not given to it');
      },
    },
    {
      row: 'REFUSED: renderStep handed disallow',
      run: () => renderStep({ name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'] } as unknown as StepDraft),
      naming: ['write: ', '`disallow`', 'former name', 'Send `disallowedTools`', 'reload it'],
    },
    {
      row: 'REFUSED: renderAgent handed allow',
      run: () => renderAgent({ name: 'writer', body: 'Write.', keys: { allow: 'Edit(**)' } } as never),
      naming: ['agents/writer.md: ', '`allow`', 'former name', 'Send `allowedTools`'],
    },
    {
      row: 'renderStep handed allow: null, nothing to write',
      run: () => renderStep({ name: 'write', after: [], body: 'Write.', allow: null } as unknown as StepDraft),
    },
    refuses(
      'allow beside allowedTools',
      'write',
      'allow: Edit(**)\nallowedTools: Read',
      '`allowedTools` is set twice',
      '`allow:`',
      'Keep the `allowedTools:` line',
    ),
    refuses(
      'disallowedTools beside disallow, whichever first',
      'write',
      'disallowedTools: SendMessage\ndisallow: Bash',
      '`disallowedTools` is set twice',
      '`disallow:`',
      'Keep the `disallowedTools:` line',
    ),
    {
      row: 'REFUSED: allow beside allowedTools in an agent, even with one value',
      run: () => parseAgent('writer', '---\nallow: Edit(**)\nallowedTools: Edit(**)\n---\nWrite.\n'),
      naming: ['agents/writer.md: ', '`allowedTools` is set twice', '`allow:`'],
    },
    refuses('allow twice', 'write', 'allow: Edit(**)\nallow: Read', '`allow` is set twice'),
    refuses('allow: blank', 'write', 'allow:', '`allow` has no value', 'allows nothing'),
    refuses('disallow: blank', 'write', 'disallow:', '`disallow` has no value', 'denies nothing'),
    refuses(
      'allow: a Write rule',
      'write',
      'allow: Write(**)',
      '`allow: Write(**)`',
      "`allowedTools:`'s former name",
      'Write `Edit(**)` instead',
    ),
    refuses(
      'disallow: a NotebookEdit rule',
      'write',
      'disallow: NotebookEdit(notes/**)',
      '`disallow: NotebookEdit(notes/**)`',
      "`disallowedTools:`'s former name",
    ),
    refuses(
      'allow: a comma inside an entry',
      'write',
      'allow: Bash(npm test, npm run build)',
      '`allow: Bash(npm test, npm run build)`',
      "`allowedTools:`'s former name",
    ),
    {
      row: 'asNamed: a frozen step under the former names reads under the new ones',
      run: () => {
        const now = fm('write', 'disallowedTools: SendMessage\nallowedTools: Edit(**)');
        assert.equal(asNamed(now), now, 'nothing to rename, nothing copied');
        const frozen = { name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'], allow: ['Edit(**)'] } as unknown as Workflow;
        assert.deepEqual(asNamed(frozen), {
          name: 'write',
          after: [],
          body: 'Write.',
          disallowedTools: ['SendMessage'],
          allowedTools: ['Edit(**)'],
        });
        const resolved = {
          name: 'write',
          after: [],
          body: 'Write.',
          allow: ['Edit(**)'],
          disallow: ['SendMessage'],
          agent: { name: 'writer', keys: ['allow'], body: '', given: { disallow: 'SendMessage' } },
        } as unknown as Workflow;
        assert.deepEqual(asNamed(resolved), {
          name: 'write',
          after: [],
          body: 'Write.',
          allowedTools: ['Edit(**)'],
          disallowedTools: ['SendMessage'],
          agent: { name: 'writer', keys: ['allowedTools'], body: '', given: { disallowedTools: 'SendMessage' } },
        });
        const both = { name: 'write', after: [], body: 'Write.', allow: ['Read'], allowedTools: ['Edit(**)'] } as unknown as Workflow;
        assert.deepEqual(asNamed(both), { name: 'write', after: [], body: 'Write.', allowedTools: ['Edit(**)'] }, "the new name's value");
      },
    },
    ...['yolo', ...CLAUDE_PERMISSION_MODES.filter((m) => m !== 'bypassPermissions'), ...CODEX_SANDBOXES].flatMap((mode) =>
      [`harness: codex\npermissionMode: ${mode}`, `permissionMode: ${mode}\nharness: codex`].map((lines) =>
        reads(
          `codex permissionMode: ${mode} as sandbox, ${lines.startsWith('harness') ? 'harness first' : 'harness after'}`,
          'review',
          lines,
          {
            sandbox: mode,
            permissionMode: undefined,
          },
        ),
      ),
    ),
    reads("codex permissionMode: bypassPermissions as Codex's widest", 'review', 'harness: codex\npermissionMode: bypassPermissions', {
      sandbox: 'danger-full-access',
    }),
    ...(
      [
        ['read-only', 'read-only'],
        ['workspace-write', 'read-only'],
        ['bypassPermissions', 'danger-full-access'],
      ] as const
    ).map(([old, now]) =>
      refuses(
        `codex permissionMode: ${old} beside sandbox: ${now}`,
        'review',
        `harness: codex\npermissionMode: ${old}\nsandbox: ${now}`,
        `\`permissionMode: ${old}\` and \`sandbox: ${now}\` are both set`,
        'Keep the `sandbox:` line',
      ),
    ),
    {
      row: 'workspace: folder, read as place: folder and never written',
      run: () => {
        const former = fm('write', 'workspace: folder');
        assert.deepEqual([former.place, former.workspace], ['folder', undefined]);
        assert.equal(renderStep(former), '---\nplace: folder\n---\nDo the work.\n');
        const attached = parseWorkflow(
          'write',
          '---\nagent: writer\nworkspace: folder\n---\nWrite.\n',
          undefined,
          new Map([['writer', { name: 'writer', keys: {}, body: 'You write.', read: () => undefined }]]),
        );
        assert.deepEqual(attached.agent?.keys, ['place'], "the step's own keys say `place`");
        const team = parseFolder([
          ['write', '---\nworkspace: folder\npermissionMode: dontAsk\n---\nWrite.\n'],
          ['review', '---\nafter: write\nworkspace: folder\n---\nReview.\n'],
        ]);
        assert.equal(isFolderTeam(team), true, 'a team spelled the former way is still a folder team');
      },
    },
    {
      row: 'REFUSED: renderStep handed workspace: folder',
      run: () => renderStep({ ...fm('write', 'workspace: folder'), workspace: 'folder' as never }),
      naming: ['write: ', '`workspace: folder`', 'former spelling', 'Send `place: folder`', 'reload it'],
    },
    ...['folder', 'git'].map((place) =>
      refuses(
        `workspace: folder beside place: ${place}`,
        'write',
        `workspace: folder\nplace: ${place}`,
        `\`workspace: folder\` and \`place: ${place}\` are both set`,
        'keep `place:`',
      ),
    ),
    {
      row: 'workspace: main, read as base and never written',
      run: () => {
        const former = fm('ship', 'after: review\nworkspace: main');
        assert.equal(former.workspace, 'base');
        assert.equal(endsOnBase(former), true);
        assert.match(renderStep(former), /^workspace: base$/m);
        assert.doesNotMatch(renderStep(former), /workspace: main/);
        const frozen = { name: 'ship', after: ['review'], body: 'Ship.', workspace: 'main' } as unknown as Workflow;
        assert.deepEqual(
          asNamed(frozen),
          { name: 'ship', after: ['review'], body: 'Ship.', workspace: 'base' },
          'a frozen `main` reads as `base`',
        );
      },
    },
    {
      row: 'REFUSED: renderStep handed workspace: main',
      run: () => renderStep({ ...fm('ship', 'after: review\nworkspace: main'), workspace: 'main' as never }),
      naming: ['ship: ', '`workspace: main`', 'former spelling', 'Send `workspace: base`', 'reload it'],
    },
    {
      row: "systemPrompt: an agent's, read as harnessPrompt",
      run: () => {
        const agent = parseAgent('builder', '---\nsystemPrompt: own\n---\nYou build.\n');
        assert.deepEqual(agent.keys, parseAgent('builder', `---\nharnessPrompt: ${harnessPromptNamed('own')}\n---\nYou build.\n`).keys);
      },
    },
  ]);
});

/** The keys every-key row sets, each as a file writes it: all but those read on a step of their own. */
const EVERY: Record<Exclude<StepKey, 'workspace' | 'slot' | 'agent' | 'skills' | 'mcp' | 'sandbox'>, string> = {
  after: 'implement',
  resume: 'implement',
  input: 'implement',
  place: 'folder',
  writable: 'web, docs',
  reads: 'inbox',
  harness: 'claude',
  model: 'opus',
  effort: 'xhigh',
  context: '200000',
  permissionMode: 'dontAsk',
  tools: 'Read, Grep,Glob , Bash',
  disallowedTools: 'Bash(npm run build), SendMessage',
  allowedTools: 'Edit(**),Bash(npm test)',
  denials: 'fail',
  remote: 'true',
  deadlineSeconds: '900',
  budget: '2.50',
  check: 'npm test && node -e "console.log(1 ? 2 : 3)"',
  retries: '0',
  gate: 'true',
  output: 'review.schema.json',
  tally: 'findings',
  loop: 'implement',
  rounds: '2',
};

test('`renderStep`: the parser run backwards, in one canonical form, and refusing what a file cannot hold', async (t) => {
  const roundTrip = (name: string, text: string, read?: (file: string) => string | undefined) => {
    const step = parseWorkflow(name, text, read);
    const rendered = renderStep(step);
    assert.deepEqual(parseWorkflow(name, rendered, read), step, 'and it reads back as the step');
    return rendered;
  };
  await table(t, [
    ...(
      [
        ['150000', '150k'],
        ['200K', '200k'],
        ['1M', '1000k'],
        ['123456', '123456'],
      ] as const
    ).map(([written, rendered]): Row => ({
      row: `context: ${written} is written ${rendered}`,
      run: () =>
        assert.match(
          roundTrip('implement', `---\nplace: git\ncontext: ${written}\n---\nDo it.\n`),
          new RegExp(`^context: ${rendered}$`, 'm'),
        ),
    })),
    {
      row: "every key: one line a key, in STEP_KEYS order, the fence in the harness's block",
      run: () => {
        const text = `---\n${Object.entries(EVERY)
          .reverse()
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')}\n---\n\nDo the work.\n\nAll of it.\n\n`;
        const step = parseWorkflow('review', text, readLooping);
        for (const key of Object.keys(EVERY) as Array<keyof Workflow>) assert.notEqual(step[key], undefined, key);
        assert.equal(
          roundTrip('review', text, readLooping),
          [
            '---',
            'after: implement',
            'resume: implement',
            'input: implement',
            'place: folder',
            'writable: web, docs',
            'reads: inbox',
            'harness: claude',
            'model: opus',
            'effort: xhigh',
            'context: 200k',
            'claude:',
            '  fence:',
            '    permissionMode: dontAsk',
            '    tools: Read, Grep, Glob, Bash',
            '    disallowedTools: Bash(npm run build), SendMessage',
            '    allowedTools: Edit(**), Bash(npm test)',
            'denials: fail',
            'remote: true',
            'deadlineSeconds: 900',
            'budget: 2.5',
            `check: 'npm test && node -e "console.log(1 ? 2 : 3)"'`,
            'retries: 0',
            'gate: true',
            'output: review.schema.json',
            'tally: findings',
            'loop: implement',
            'rounds: 2',
            '---',
            'Do the work.',
            '',
            'All of it.',
            '',
          ].join('\n'),
        );
        assert.match(renderStep({ ...step, remote: false }), /^remote: false$/m, 'remote: false is written');
      },
    },
    {
      row: 'workspace: base, after place, before harness',
      run: () =>
        assert.equal(
          roundTrip('ship', '---\nafter: review\nplace: git\ngate: true\nworkspace: base\nharness: claude\n---\nShip it.\n'),
          ['---', 'after: review', 'place: git', 'workspace: base', 'harness: claude', 'gate: true', '---', 'Ship it.', ''].join('\n'),
        ),
    },
    {
      row: 'slot: none, after workspace, before harness',
      run: () =>
        assert.equal(
          roundTrip('supervise', '---\nplace: git\nharness: claude\nslot: none\nworkspace: base\n---\nWatch the runs.\n'),
          ['---', 'place: git', 'workspace: base', 'slot: none', 'harness: claude', '---', 'Watch the runs.', ''].join('\n'),
        ),
    },
    {
      row: "sandbox: in codex's block",
      run: () =>
        assert.equal(
          roundTrip('review', '---\nplace: git\nsandbox: read-only\neffort: high\nharness: codex\n---\nReview it.\n'),
          [
            '---',
            'place: git',
            'harness: codex',
            'effort: high',
            'codex:',
            '  fence:',
            '    sandbox: read-only',
            '---',
            'Review it.',
            '',
          ].join('\n'),
        ),
    },
    {
      row: "a sandbox read from the former line, under Codex's name",
      run: () =>
        assert.equal(
          renderStep(parseWorkflow('review', '---\nplace: git\nharness: codex\npermissionMode: bypassPermissions\n---\nReview it.\n')),
          ['---', 'place: git', 'harness: codex', 'codex:', '  fence:', '    sandbox: danger-full-access', '---', 'Review it.', ''].join(
            '\n',
          ),
        ),
    },
    {
      row: 'denials: after the harness block, before remote',
      run: () =>
        assert.equal(
          roundTrip('review', '---\nplace: git\ndenials: fail\nallowedTools: Edit(**)\n---\nDo the work.\n'),
          ['---', 'place: git', 'claude:', '  fence:', '    allowedTools: Edit(**)', 'denials: fail', '---', 'Do the work.', ''].join('\n'),
        ),
    },
    {
      row: 'reads: as written',
      run: () => assert.match(roundTrip('review', '---\nplace: git\nreads: inbox\n---\nDo it.\n'), /^reads: inbox$/m),
    },
    {
      row: "the sandbox and a claude step's mode, each in its own block",
      run: () => {
        for (const text of [
          renderStep({ name: 'review', body: 'Review it.', harness: 'codex', sandbox: 'read-only' } as StepDraft),
          renderAgent({ name: 'reviewer', keys: { harness: 'codex', sandbox: 'read-only' }, body: 'You review.' }),
        ]) {
          assert.match(text, /^codex:\n {2}fence:\n {4}sandbox: read-only$/m);
          assert.doesNotMatch(text, /^(sandbox|permissionMode):/m, 'and no fence key at the top level');
        }
        const claude = renderStep({ name: 'implement', body: 'Do it.', permissionMode: 'dontAsk' } as StepDraft);
        assert.match(claude, /^claude:\n {2}fence:\n {4}permissionMode: dontAsk$/m);
        assert.doesNotMatch(claude, /^(sandbox|permissionMode):/m);
      },
    },
    ...(['read-only', 'bypassPermissions', 'dontAsk'] as const).map((word): Row => ({
      row: `REFUSED: a codex draft sending permissionMode: ${word}`,
      run: () => renderStep({ name: 'review', body: 'Review it.', harness: 'codex', permissionMode: word } as StepDraft),
      naming: ['review: ', `\`permissionMode: ${word}\``, 'former name of `sandbox:`', 'reload it'],
    })),
    ...(['read-only', 'dontAsk'] as const).map((word): Row => ({
      row: `REFUSED: a codex agent draft sending permissionMode: ${word}`,
      run: () => renderAgent({ name: 'reviewer', keys: { harness: 'codex', permissionMode: word }, body: 'You review.' }),
      naming: ['agents/reviewer.md: ', `\`permissionMode: ${word}\``, 'former name of `sandbox:`'],
    })),
    {
      row: 'a step that sets nothing is its body; undefined, null and an empty list are no line',
      run: () => {
        const bare: StepDraft = { name: 'implement', after: [], body: 'Implement it.' };
        assert.equal(renderStep(bare), 'Implement it.\n');
        assert.equal(
          renderStep({
            ...bare,
            harness: undefined,
            input: [],
            disallowedTools: [],
            allowedTools: [],
            model: null,
          } as unknown as StepDraft),
          'Implement it.\n',
        );
        assert.deepEqual(
          parseWorkflow('implement', renderStep({ ...bare, place: 'git' })),
          parseWorkflow('implement', '---\nplace: git\n---\nImplement it.'),
        );
      },
    },
    {
      row: "a draft names its output by file; a loop's rounds are the default",
      run: () => {
        const text = renderStep({
          name: 'review',
          after: ['implement'],
          body: 'Review it.',
          place: 'git',
          output: { file: 'review.schema.json' },
          loop: 'implement',
        });
        assert.equal(text, '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n---\nReview it.\n');
        const step = parseWorkflow('review', text, readLooping);
        assert.deepEqual([step.output?.schema, step.rounds], [LOOPING, DEFAULT_ROUNDS]);
      },
    },
    {
      row: 'a body that opens on --- keeps an empty frontmatter before it',
      run: () => {
        const rule: StepDraft = { name: 'implement', after: [], body: '---\nThe brief, below a rule.' };
        assert.equal(renderStep(rule), '---\n\n---\n---\nThe brief, below a rule.\n');
        assert.equal(
          parseWorkflow('implement', renderStep({ ...rule, place: 'git' })).body,
          '---\nThe brief, below a rule.',
          'nor is one needed after keys',
        );
        assert.equal(splitFrontmatter('implement', renderStep(rule)).body, '---\nThe brief, below a rule.');
      },
    },
    {
      row: 'a long shell check: a literal block, byte for byte',
      run: () => {
        const check =
          '{ if [ -n "${WF_BASE_REF:-}" ]; then git diff --quiet "$WF_BASE_REF" -- docs/ || echo "docs: changed"; fi; } && npm test # the suite of what changed';
        const text = renderStep(
          parseWorkflow('implement', renderStep({ name: 'implement', after: [], place: 'git', check, body: 'Do it.' })),
        );
        assert.ok(text.startsWith(`---\nplace: git\ncheck: |-\n  ${check}\n---\n`), text);
        assert.equal(parseWorkflow('implement', text).check, check);
        assert.equal(renderStep(parseWorkflow('implement', text)), text, 'and renders to the same text again');
      },
    },
    {
      row: 'a line break in a value is a block, never a key of its own',
      run: () => {
        const written = renderStep({
          name: 'review',
          after: ['implement'],
          place: 'git',
          body: 'Review it.',
          check: 'npm test\nharness: codex',
        });
        assert.match(written, /^check: \|-\n {2}npm test\n {2}harness: codex\n/m);
        assert.deepEqual(
          [parseWorkflow('review', written).check, parseWorkflow('review', written).harness],
          ['npm test\nharness: codex', undefined],
        );
      },
    },
    {
      row: "over an agent: its own denies alone, which add to its agent's",
      run: () => {
        const agents = new Map([
          ['implementer', parseAgent('implementer', '---\ndisallowedTools: Bash(git push), Bash(git push:*)\n---\nWork.\n')],
        ]);
        const parsed = (text: string) => parseWorkflow('implement', text, undefined, agents);
        const own = parsed('---\nagent: implementer\nplace: git\ndisallowedTools: Bash(npm run build), Bash(git push)\n---\nDo it.\n');
        assert.match(renderStep(own), /^claude:\n {2}fence:\n {4}disallowedTools: Bash\(npm run build\)$/m);
        assert.doesNotMatch(renderStep(own), /^disallowedTools:/m);
        assert.deepEqual(parsed(renderStep(own)).disallowedTools, own.disallowedTools);
        const repeated = parsed('---\nagent: implementer\nplace: git\ndisallowedTools: Bash(git push:*), Bash(git push)\n---\nDo it.\n');
        assert.doesNotMatch(renderStep(repeated), /disallowedTools/, 'a line that only repeats its agent is no line');
        assert.deepEqual(parsed(renderStep(repeated)).disallowedTools, ['Bash(git push)', 'Bash(git push:*)']);
      },
    },
    ...(
      [
        ['afer', { afer: ['implement'] }, '`afer`', 'after, resume'],
        ['guide', { guide: 'CLAUDE.md' }, '`guide`', 'CLAUDE.md'],
        ['maxAttempts', { maxAttempts: 2 }, '`maxAttempts`', '`retries: N`'],
        ['colour', { colour: 'red' }, '`colour` is not a key a step has'],
      ] as const
    ).map(([key, more, ...named]): Row => ({
      row: `REFUSED: a key no step has, in the parser's words — ${key}`,
      run: () => renderStep({ name: 'review', after: ['implement'], place: 'git', body: 'Review it.', ...more } as unknown as StepDraft),
      naming: ['review: ', ...named],
    })),
    {
      row: 'a key set to nothing is not set',
      run: () => renderStep({ name: 'review', after: [], body: 'x', colour: undefined, shade: null } as unknown as StepDraft),
    },
    {
      row: 'REFUSED: a key sent as an object',
      run: () => renderStep({ name: 'review', after: [], body: 'x', model: { name: 'opus' } } as unknown as StepDraft),
      naming: ['review: ', '`model` is {"name":"opus"}', '`[object Object]`'],
    },
    {
      row: "REFUSED: a comma in a step's name in after",
      run: () => renderStep({ name: 'review', after: ['implement, docs'], body: 'x' }),
      naming: ['review: ', '`after` lists `implement, docs`', '`implement`, `docs`', 'an entry of its own'],
    },
    {
      row: "REFUSED: a comma in a step's name in input",
      run: () => renderStep({ name: 'review', after: [], body: 'x', input: ['a,b'] }),
      naming: ['review: ', '`input` lists `a,b`'],
    },
    ...(
      [
        [{ tools: [] }, 'claude:\n  fence:\n    tools:', '`tools` has no value'],
        [{ model: '' }, 'model:', '`model` has no value'],
        [{ deadlineSeconds: '5m' }, 'deadlineSeconds: 5m', '`deadlineSeconds: 5m` is not a count'],
        [{ gate: false }, 'gate: false', '`gate: false` is what a step without the line already is'],
        [{ harness: 'banana' }, 'harness: banana', '`harness: banana` is not a harness'],
        [
          { disallowedTools: ['Bash(git push, git reset)'] },
          'claude:\n  fence:\n    disallowedTools: Bash(git push, git reset)',
          'has a comma inside an entry',
        ],
        [{ output: {} }, 'output:', '`output` has no value'],
      ] as const
    ).map(([more, lines, named]): Row => ({
      row: `REFUSED: written as given for the parser to refuse — ${lines.split('\n').at(-1)}`,
      run: () => {
        const text = renderStep({
          name: 'review',
          after: ['implement'],
          place: 'git',
          body: 'Review it.',
          ...more,
        } as unknown as StepDraft);
        assert.ok(text.includes(`\n${lines}\n`), text);
        return parseWorkflow('review', text);
      },
      naming: ['review: ', named],
    })),
  ]);
});

test("the frontmatter's syntax: closed, `key: value` a line, comments and blank lines no keys, a Windows file read as any", async (t) => {
  await table(t, [
    {
      row: 'REFUSED: frontmatter that never closes',
      run: () => parseWorkflow('review', '---\nplace: git\nharness: codex\nafter: implement\nReview it.'),
      naming: ['review: ', 'never closes'],
    },
    {
      row: 'a file saved on Windows, with a byte order mark, keeps its keys',
      run: () => {
        const crlf = parseWorkflow('review', '﻿---\r\nplace: git\r\nharness: codex\r\nafter: implement\r\n---\r\nReview it.\r\n');
        assert.deepEqual([crlf.harness, crlf.after], ['codex', ['implement']]);
      },
    },
    { row: 'an empty frontmatter is still frontmatter', run: () => assert.equal(splitFrontmatter('x', '---\n---\nbody').body, 'body') },
    {
      row: 'REFUSED: an empty block before a body that opens on ---',
      run: () => parseWorkflow('implement', '---\n---\n---\nThe brief, below a rule.\n'),
      naming: ['implement:2:'],
    },
    { row: 'REFUSED: a line that is not key: value', run: () => fm('review', 'afer implement'), naming: ['review:3: '] },
    { row: 'REFUSED: a line with no key', run: () => fm('review', ': codex'), naming: ['review:3: '] },
    reads('blank lines and # comments are not keys', 'review', '# a second opinion\nharness: codex\n\nafter: implement', {
      harness: 'codex',
      after: ['implement'],
    }),
  ]);
});
