/**
 * The words of the reads that print the api's answer as it is (`answerSpec`): the server's and the store's own reads
 * (`src/commands-rest-server.ts`), `lines`, `factory commands`, `factory server sign-in`, `workflows keys`, and `library <kind> <name>`.
 * Each reads `--json` and its positionals, and refuses a word it does not take and a positional left out, a `CommandRefused` naming the
 * command to type.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CAPABILITIES_WORDS,
  CommandRefused,
  FACTORY_COMMANDS_WORDS,
  FACTORY_SERVER_SIGN_IN_WORDS,
  LIBRARY_WORDS,
  LINES_WORDS,
  parseArgv,
  SERVER_READ_WORDS,
  WORKFLOWS_KEYS_WORDS,
  type Args,
  type CommandWords,
} from 'objects';

/** The verbs whose words are read here, each by its words. */
const READS: readonly CommandWords[] = [
  ...SERVER_READ_WORDS,
  LINES_WORDS,
  FACTORY_COMMANDS_WORDS,
  FACTORY_SERVER_SIGN_IN_WORDS,
  WORKFLOWS_KEYS_WORDS,
];

/** The positionals each verb is given where it takes some. */
const POSITIONALS: Readonly<Record<string, readonly string[]>> = {
  lines: ['r-1'],
  'factory commands': ['f'],
  'factory server sign-in': ['f', 's'],
};

/** That `words` refuse `argv` by a `CommandRefused` naming the command, by the spec or by its check. */
function refused(words: CommandWords, argv: readonly string[]) {
  try {
    const args = parseArgv(words.spec, argv);
    const wrong = args === undefined ? null : (words.check?.(args) ?? null);
    assert.ok(wrong !== null, `${words.name} ${argv.join(' ')} is refused, and was read as ${JSON.stringify(args)}`);
    assert.ok(wrong.includes(`nemia ${words.name}`), `${wrong} names nemia ${words.name}`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    assert.ok(err instanceof CommandRefused, `${String(err)} is a CommandRefused`);
    assert.ok(err.message.includes(`nemia ${words.name}`), `${err.message} names nemia ${words.name}`);
  }
}

/** The arguments `words` read of `argv`, refused by neither the spec nor the check. */
function argsOf(words: CommandWords, argv: readonly string[]) {
  const args = parseArgv(words.spec, argv);
  assert.ok(args !== undefined, `${words.name} ${argv.join(' ')} is read`);
  assert.equal(words.check?.(args) ?? null, null);
  return args satisfies Args;
}

test('each read takes --json and its positionals, and is a read that writes nothing and links one endpoint', () => {
  for (const words of READS) {
    const given = POSITIONALS[words.name] ?? [];
    assert.equal(argsOf(words, [...given, '--json']).json, true, `${words.name} reads --json`);
    assert.equal(argsOf(words, given).json, undefined, `${words.name} reads bare`);
    assert.equal(words.class, 'read');
    assert.equal(words.writes, false);
    assert.equal(words.served?.length, 1, `${words.name} links the one endpoint it reads`);
  }
  assert.deepEqual(argsOf(FACTORY_SERVER_SIGN_IN_WORDS, ['f', 's']), { factory: 'f', server: 's' });
  assert.deepEqual(argsOf(CAPABILITIES_WORDS, ['--factory', 'f', '--repo', '/r']), { factory: 'f', repo: '/r' });
});

test('REFUSED: each read refuses a stray flag, a word past its positionals, and a positional left out', () => {
  for (const words of READS) {
    const given = POSITIONALS[words.name] ?? [];
    refused(words, [...given, '--stray']);
    refused(words, [...given, 'extra']);
    if (given.length > 0) refused(words, given.slice(0, -1));
  }
});

test('library reads one item by its kind and name, and refuses a name with a factory, --json with no name, and a third word', () => {
  assert.deepEqual(argsOf(LIBRARY_WORDS, ['skills', 's', '--json']), { kind: 'skills', name: 's', json: true });
  assert.deepEqual(argsOf(LIBRARY_WORDS, ['agents']), { kind: 'agents' });
  refused(LIBRARY_WORDS, ['skills', 's', '--factory', 'f']);
  refused(LIBRARY_WORDS, ['--json']);
  refused(LIBRARY_WORDS, ['skills', 's', 'x']);
  refused(LIBRARY_WORDS, ['tools', 's']);
});
