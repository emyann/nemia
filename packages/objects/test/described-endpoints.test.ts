/**
 * What each endpoint of the api says of itself: every operation of the api's document (`OpenApi.fromApi(Api)`) carries a `description`,
 * set on the endpoint where its group defines it (`.annotate(OpenApi.Description, '…')`), in the api's own words — what it reads or
 * changes, and what it answers. A command's help is the command's, never the endpoint's: a description holding a help line of a command
 * that links the endpoint (`served`, in `COMMAND_WORDS`) is refused. The endpoints still said nowhere are counted per group in
 * `described-endpoints.baseline.json`, which only shrinks: a group with more than its count is refused, one the baseline does not name
 * owes none, and a count above today's is refused too. Today's counts, as the baseline's text: `node test/described-endpoints.test.ts
 * --print`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OpenApi } from 'effect/http-api';
import { Api, COMMAND_WORDS } from 'objects';

const BASELINE = 'packages/objects/test/described-endpoints.baseline.json';

/** The shortest help line a description is refused for holding: a shorter one ("the same, by its name") is any sentence's. */
const COPIED_FLOOR = 30;

/** An operation of the document, as far as this reads it: its id, the group it is tagged with, and what it says of itself. */
type Operation = { readonly operationId?: string; readonly tags?: readonly string[]; readonly description?: string };

/** The document, as far as this reads it: its operations by path and method. */
export type Document = { readonly paths?: Readonly<Record<string, Readonly<Record<string, Operation>>>> };

/** A command's words, as far as this reads them: its name, its help lines, and the endpoints that serve it. */
export type Words = {
  readonly name: string;
  readonly help: readonly string[];
  readonly served?: readonly { readonly endpoint: string }[];
};

/** Every operation of `document`. */
const operationsOf = (document: Document) => Object.values(document.paths ?? {}).flatMap((methods) => Object.values(methods));

/**
 * The operations of `document` with no description of their own, by their `operationId`, per group (the operation's first tag): a group
 * with none owed is left out.
 * @param document The api's document, `OpenApi.fromApi(Api)`, or a planted one.
 */
export const unsaid = (document: Document) => {
  const owed: Record<string, string[]> = {};
  for (const operation of operationsOf(document))
    if (!operation.description?.trim()) {
      const group = operation.tags?.[0] ?? '?';
      owed[group] = [...(owed[group] ?? []), operation.operationId ?? '?'].sort();
    }
  return Object.fromEntries(Object.entries(owed).sort(([a], [b]) => a.localeCompare(b)));
};

/**
 * The endpoints whose description holds a help line of a command that links them, each a sentence naming the fix.
 * @param document The api's document, or a planted one.
 * @param words The command table, `COMMAND_WORDS`, or a planted one.
 */
export const copied = (document: Document, words: readonly Words[]) =>
  operationsOf(document).flatMap((operation) =>
    words
      .filter((command) => command.served?.some((link) => link.endpoint === operation.operationId))
      .flatMap((command) =>
        command.help
          .map((line) => line.trim())
          .filter((line) => line.length >= COPIED_FLOOR && operation.description?.includes(line))
          .map(
            (line) =>
              `${operation.operationId} says "${line}", a line of \`nemia ${command.name}\`'s help: say what the endpoint reads or ` +
              'changes and what it answers in the api’s words; the help stays the command’s',
          ),
      ),
  );

/**
 * What today's counts and `baseline` disagree on, each a sentence naming the fix.
 * @param today The endpoints said nowhere, per group, from `unsaid`.
 * @param baseline The counts `described-endpoints.baseline.json` holds.
 */
export const breaks = (today: Readonly<Record<string, readonly string[]>>, baseline: Readonly<Record<string, number>>) => [
  ...Object.entries(today)
    .filter(([group, names]) => names.length > (baseline[group] ?? 0))
    .map(
      ([group, names]) =>
        `${group} has ${names.length} endpoint${names.length === 1 ? '' : 's'} with no description (${names.join(', ')}), and ${BASELINE} ` +
        `allows ${baseline[group] ?? 0}: say what each does on it, \`.annotate(OpenApi.Description, "…")\` where its group defines it in ` +
        'packages/objects/src; never raise the count',
    ),
  ...Object.entries(baseline)
    .filter(([group, kept]) => kept > (today[group]?.length ?? 0))
    .map(
      ([group, kept]) =>
        `${group} owes ${today[group]?.length ?? 0} now, and ${BASELINE} holds ${kept}: lower it there, which only shrinks`,
    ),
];

const document = () => OpenApi.fromApi(Api) as Document;

if (process.argv.includes('--print'))
  process.stdout.write(
    `${JSON.stringify(Object.fromEntries(Object.entries(unsaid(document())).map(([group, names]) => [group, names.length])), null, 2)}\n`,
  );
else {
  test('every endpoint of the api says what it does, but those the baseline counts, which only shrinks', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'described-endpoints.baseline.json'), 'utf8')) as Record<
      string,
      number
    >;
    assert.deepEqual(breaks(unsaid(document()), baseline), []);
  });

  test("no endpoint's description holds a help line of a command that links it", () => {
    assert.deepEqual(copied(document(), COMMAND_WORDS), []);
  });

  const planted: Document = {
    paths: {
      '/parcels': {
        get: { operationId: 'parcels.list', tags: ['parcels'], description: 'Lists the parcels.' },
        post: { operationId: 'parcels.send', tags: ['parcels'] },
      },
      '/parcels/{name}': { delete: { operationId: 'parcels.drop', tags: ['parcels'], description: ' ' } },
    },
  };

  test('REFUSED: an endpoint with no description and one with a blank one are each counted under their group', () => {
    assert.deepEqual(unsaid(planted), { parcels: ['parcels.drop', 'parcels.send'] });
  });

  test('REFUSED: a group over its count, one the baseline does not name, and a count above what is owed', () => {
    const today = unsaid(planted);
    assert.equal(breaks(today, {}).length, 1, 'a group the baseline does not name');
    assert.equal(breaks(today, { parcels: 1 }).length, 1, 'more than its count');
    assert.deepEqual(breaks(today, { parcels: 2 }), []);
    assert.equal(breaks(today, { parcels: 3 }).length, 1, 'a count above what is owed');
    assert.equal(breaks({}, { parcels: 1 }).length, 1, 'a count for a group that owes none');
  });

  test("REFUSED: a description holding a help line of a command that links it; a short line, or another endpoint's command's, is not", () => {
    const help = ['Lists every parcel the depot holds, newest first.', 'the same, by its name'];
    const said = (description: string) => ({
      paths: { '/parcels': { get: { operationId: 'parcels.list', tags: ['parcels'], description } } },
    });
    const words: Words[] = [{ name: 'parcels', help, served: [{ endpoint: 'parcels.list' }] }];
    assert.equal(copied(said(`Reads. ${help[0]}`), words).length, 1);
    assert.deepEqual(copied(said(`Reads them, the same, by its name.`), words), []);
    assert.deepEqual(copied(said(`Reads. ${help[0]}`), [{ ...words[0], served: [{ endpoint: 'parcels.send' }] }]), []);
  });
}
