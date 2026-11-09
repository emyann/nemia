/**
 * An agent's list field with the lines of a template's file in it (agent-orchestrator, src/template/shared-lines.ts): a list field of an
 * agent's harness block (`claude: { fence: { allowedTools: [...] } }`) holds strings, its own lines, and `{ path }` items, each naming one
 * file of the template that holds lines several agents share. `withSharedLines` answers the list the render writes into the factory's tree:
 * every item in its place, a `{ path }` item replaced by the lines of the file it names (`linesOf`, read and refused by the lint before the
 * render runs), and a line already written kept at its first place and not written again. Nothing is added that neither the agent nor a
 * file it names says.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * One item of an agent's list field: its own line, or the file of the template whose lines it takes. The YAML writes a line as a plain
 * string; it is handed in as `{ line }`, since the verifier models a union of records and not one of a string and a record.
 */
export type ListItem = { readonly line: string } | { readonly path: string };

const isPath = (item: ListItem): item is { readonly path: string } => 'path' in item;

const withSharedLinesSpec = spec<(items: readonly ListItem[], linesOf: Readonly<Record<string, readonly string[]>>) => readonly string[]>({
  requires: ({ input: [items, linesOf] }) => items.every((item) => !isPath(item) || linesOf[item.path] !== undefined),
  /**
   * Narrowed to what tsverify proves today, as `watch-changes.contract.ts` is: every line the agent writes and every line of a file it
   * names is in the answer, no other line is, and each is written once. Each of the four runs out of the solver's work through the
   * `flatMap` and `filter` the function is (tsverify 0.9.0 leaves each `bounded`, as it does a filter's result keeping every element, its
   * card `src-a-filter-s-result-is-pro-p25m`), so they are held whole by `src/template/shared-lines.test.ts` until that card restores them
   * here. What is proved is `onceEach`'s, below, the step it ends on.
   */
  ensures: {},
});

/**
 * A list with each line written once, at its first place (src/template/shared-lines.ts, `onceEach`): the step `withSharedLines` ends on, a
 * spec of its own so that its laws lean on these rather than on a loop read inside them.
 */
const onceEachSpec = spec<(lines: readonly string[]) => readonly string[]>({
  /** That every line of the list is kept is a filter keeping every element, which tsverify 0.9.0 leaves `bounded`: held by the test. */
  ensures: {
    noLineAdded: {
      description: 'It answers no line the list does not hold',
      condition: ({ input: [lines], output }) => output.every((line) => lines.includes(line)),
    },
    eachLineOnce: {
      description: 'It answers each line once',
      condition: ({ output }) => output.every((line, i) => !output.slice(0, i).includes(line)),
    },
  },
});

/** `onceEach`'s type, which `src/template/shared-lines.ts` takes. */
export type OnceEach = Implementation<typeof onceEachSpec>;

/** `withSharedLines`'s type, which `src/template/shared-lines.ts` takes. */
export type WithSharedLines = Implementation<typeof withSharedLinesSpec>;
