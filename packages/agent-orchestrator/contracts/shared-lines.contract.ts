/**
 * An agent's list field with the lines of a template's file in it (agent-orchestrator, src/template/shared-lines.ts): a list field of an
 * agent's harness block (`claude: { fence: { allowedTools: [...] } }`) holds strings, its own lines, and `{ path }` items, each naming one
 * file of the template that holds lines several agents share. `withSharedLines` answers the list the render writes into the factory's tree:
 * every item in its place, a `{ path }` item replaced by the lines of the file it names (`linesOf`, read and refused by the lint before the
 * render runs), and a line already written kept at its first place and not written again. Nothing is added that neither the agent nor a
 * file it names says.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One item of an agent's list field: its own line, or the file of the template whose lines it takes. */
type ListItem = string | { readonly path: string };

const isPath = (item: ListItem): item is { readonly path: string } => typeof item !== 'string';

const withSharedLinesSpec = spec<
  (items: readonly ListItem[], linesOf: Readonly<Record<string, readonly string[]>>) => readonly string[]
>({
  requires: ({ input: [items, linesOf] }) => items.every((item) => !isPath(item) || linesOf[item.path] !== undefined),
  ensures: {
    ownLinesKept: {
      description: "Every line the agent writes itself is in the list the render writes",
      condition: ({ input: [items], output }) => items.every((item) => isPath(item) || output.includes(item)),
    },
    sharedLinesKept: {
      description: 'Every line of a file the agent names is in the list the render writes',
      condition: ({ input: [items, linesOf], output }) =>
        items.every((item) => !isPath(item) || (linesOf[item.path] ?? []).every((line) => output.includes(line))),
    },
    nothingElse: {
      description: 'The render writes no line that neither the agent nor a file it names says',
      condition: ({ input: [items, linesOf], output }) =>
        output.every((line) =>
          items.some((item) => (isPath(item) ? (linesOf[item.path] ?? []).includes(line) : item === line)),
        ),
    },
    eachOnce: {
      description: 'A line said twice, by the agent or by two files, is written once',
      condition: ({ output }) => new Set(output).size === output.length,
    },
  },
});

/** `withSharedLines`'s type, which `src/template/shared-lines.ts` takes. */
export type WithSharedLines = Implementation<typeof withSharedLinesSpec>;
