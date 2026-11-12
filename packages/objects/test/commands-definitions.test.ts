/**
 * The words of the definitions' commands (`DEFINITION_WORDS`, `commands-definitions.ts` and `commands-definitions-agents.ts`): each
 * command line a person mistypes refused before anything is asked — by the parser in the command's own words (`CommandRefused`), or by
 * its `check` — each refusal asserted by the fragments it names, never its sentence; a line each takes read into what its runner sends;
 * and the class each says, which admission reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTS_CARD_WORDS,
  AGENTS_CUSTOM_WORDS,
  AGENTS_RM_WORDS,
  AGENTS_WORDS,
  CommandRefused,
  DEFINITION_WORDS,
  POLICY_CONFIRM_WORDS,
  POLICY_PROPOSE_WORDS,
  POLICY_REACH_WORDS,
  parseArgv,
  type Args,
  type CommandWords,
} from 'objects';

/** What `words` refuses of `argv`: the parser's refusal, else its check's, else nothing. */
function refusalOf(words: CommandWords, argv: readonly string[]): string | null {
  let args: Args | undefined;
  try {
    args = parseArgv(words.spec, argv);
  } catch (err) {
    if (err instanceof CommandRefused) return err.message;
    throw err;
  }
  return args === undefined ? null : (words.check?.(args) ?? null);
}

/** Each fragment of `facts` in `said`. */
const naming = (said: string | null, facts: readonly string[], row: string): void => {
  assert.ok(said !== null, `${row}: refused`);
  for (const fact of facts) assert.ok(said.includes(fact), `${row}: names ${fact} in ${said}`);
};

test("REFUSED, before anything is asked: each of nemia agents' lines a person mistypes, by what it names", () => {
  const commands = 'card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours';
  const takes = 'It takes --repo <r>, and for a card --from repo|yours';
  const repoTakes = ['--repo takes the repository whose workflows/agents to read', 'nemia agents --repo <r>'];
  const fromTakes = ['--from takes which place the agent is in', 'nemia agents card <name> --from repo|yours'];
  const rows: ReadonlyArray<[string, CommandWords, readonly string[], readonly string[]]> = [
    ['a word that is none of its commands', AGENTS_WORDS, ['nope'], [commands, 'nemia agents card nope', 'nemia agents custom nope']],
    ['a flag it does not take', AGENTS_WORDS, ['--nope'], ['nemia agents does not take --nope', takes]],
    ['--repo left out', AGENTS_WORDS, ['--repo'], repoTakes],
    ['--repo followed by another flag', AGENTS_WORDS, ['--repo', '--from', 'repo'], repoTakes],
    ['--repo followed by a flag it does not take', AGENTS_WORDS, ['--repo', '--elsewhere'], repoTakes],
    ['--repo= with nothing', AGENTS_WORDS, ['--repo='], repoTakes],
    ['--from left out', AGENTS_CARD_WORDS, ['scribe', '--from'], fromTakes],
    ['--from followed by another flag', AGENTS_CARD_WORDS, ['scribe', '--from', '--repo', '.'], fromTakes],
    ['--from that is neither place', AGENTS_CARD_WORDS, ['twin', '--from', 'elsewhere'], ['nemia agents --from takes repo or yours']],
    ['--repo twice', AGENTS_WORDS, ['--repo', 'a', '--repo', 'b'], ['nemia agents takes --repo once', 'one repository']],
    ['--from twice', AGENTS_CARD_WORDS, ['x', '--from', 'repo', '--from', 'yours'], ['nemia agents takes --from once', 'one place']],
    ['a flag it does not take after --repo', AGENTS_WORDS, ['--repo', '.', '--nope'], ['nemia agents does not take --nope', takes]],
    ['a word after the card', AGENTS_CARD_WORDS, ['scribe', 'extra'], [commands, 'nemia agents card extra', 'nemia agents custom extra']],
    ['custom given --file and --clear both', AGENTS_CUSTOM_WORDS, ['scribe', '--file', 'w.md', '--clear'], ['--file or --clear']],
    ['custom given --repo with nothing', AGENTS_CUSTOM_WORDS, ['scribe', '--repo='], ['--repo takes the repository whose agents']],
    [
      'a key the api alone takes: agents rm --repo',
      AGENTS_RM_WORDS,
      ['yours', 'plain', '--repo', 'x'],
      ['nemia agents rm takes no --repo', 'nemia agents rm yours <name> --version <v>'],
    ],
  ];
  for (const [row, words, argv, facts] of rows) naming(refusalOf(words, argv), facts, row);
});

test("REFUSED, before anything is asked: each of nemia policy's lines a person mistypes, by what it names", () => {
  const rows: ReadonlyArray<[string, CommandWords, readonly string[], readonly string[]]> = [
    ['a proposal with no --file', POLICY_PROPOSE_WORDS, ['nemia'], ['--file <path>', '--file -']],
    ['a confirm with no words', POLICY_CONFIRM_WORDS, ['nemia', 'r1'], ["--words '<words>'", 'nemia policy nemia']],
    ['a confirm with blank words', POLICY_CONFIRM_WORDS, ['nemia', 'r1', '--words', '  '], ["--words '<words>'"]],
    ['a reach of neither', POLICY_REACH_WORDS, ['nemia'], ['--factory <name> or --run <runId>']],
    ['a reach of both', POLICY_REACH_WORDS, ['nemia', '--factory', 'f', '--run', 'r-1'], ['--factory <name> or --run <runId>']],
  ];
  for (const [row, words, argv, facts] of rows) naming(refusalOf(words, argv), facts, row);
  assert.equal(refusalOf(POLICY_REACH_WORDS, ['nemia', '--factory', 'f']), null, 'one of the two is taken');
  assert.equal(refusalOf(POLICY_PROPOSE_WORDS, ['nemia', '--file', '-']), null, 'stdin is taken');
});

test('a line each takes, read into the arguments its runner sends', () => {
  assert.deepEqual(parseArgv(AGENTS_CARD_WORDS.spec, ['scribe', '--repo=/r', '--from', 'yours']), {
    name: 'scribe',
    repo: '/r',
    from: 'yours',
  });
  assert.deepEqual(parseArgv(POLICY_REACH_WORDS.spec, ['nemia', '--run', 'r-1']), { name: 'nemia', runId: 'r-1' });
  assert.deepEqual(parseArgv(AGENTS_CUSTOM_WORDS.spec, ['scribe', '--clear']), { name: 'scribe', clear: true });
});

test('each command of the group says its class, and only an ask is asked of the person every time', () => {
  const classes = Object.fromEntries(DEFINITION_WORDS.map((w) => [w.name, w.class]));
  assert.deepEqual(classes, {
    agents: 'read',
    'agents card': 'read',
    'agents sources': 'read',
    'agents custom': { bare: 'read', sets: 'ask', setsBy: ['--file', '--clear'], readsBy: ['--repo'] },
    'agents copy': 'ask',
    'agents rm': 'ask',
    'agents run': 'act',
    policy: 'read',
    'policy propose': 'act',
    'policy confirm': 'ask',
    'policy rm': 'ask',
    'policy reach': 'read',
    'workflows rm': 'ask',
  });
  assert.deepEqual(
    DEFINITION_WORDS.filter((w) => 'asksAlways' in w).map((w) => w.name),
    ['policy confirm', 'policy rm'],
  );
  assert.deepEqual(
    DEFINITION_WORDS.filter((w) => 'ticks' in w).map((w) => w.name),
    ['agents run'],
  );
});
