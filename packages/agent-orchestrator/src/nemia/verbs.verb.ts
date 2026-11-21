/**
 * Nemia's `verbs` skill, generated from the command table (`TABLE`) and each command's class (`CommandClass`): every verb the CLI serves
 * her, by who answers for it, with its usage and help as `nemia`'s help prints them (`helpOf`), and the tools that serve it on the MCP port
 * (`toolsOf`) or why the command line alone runs it, opened by where to start (`objects`' `shellGuidance`, the shell form of what the port
 * tells an outside session); and beside it `tools.md`, each port tool's words as the port describes it (`objects`' `toolWordsOf`). Built in
 * as `nemia/skills/verbs/SKILL.md` and `tools.md`, and held to the table by `test/verbs-skill.test.ts`, which names `REGENERATE` when
 * either drifts.
 */
import { Api, type DescribedApi, shellGuidance, type Spec, toolLinesOf, toolWordsOf } from 'objects';
import type { CommandClass } from '../admission/index.ts';
import { CLI_VERBS, helpOf, toolsOf, type CommandSpec } from '../command/command.ts';
import { renderFrontmatter } from '../frontmatter/frontmatter.ts';
import { TABLE } from '../command/commands.verb.ts';

/** The command that writes one file of the skill again from the table, by the function `fn` that renders it, into `file`. */
const regenerating = (fn: string, file: string) =>
  `node -e "import('./packages/agent-orchestrator/src/nemia/verbs.verb.ts').then((m) => process.stdout.write(m.${fn}()))" > ` +
  `packages/agent-orchestrator/nemia/skills/verbs/${file}`;

/** The command that writes the skill's two files again from the table, from the repository's root. */
export const REGENERATE = `${regenerating('verbsSkill', 'SKILL.md')} && ${regenerating('toolsReference', 'tools.md')}`;

/** An entry as the skill reads it: its name, usage, help, class, the side it is served on alone, its endpoints and its spec. */
type Entry = Pick<CommandSpec, 'name' | 'usage' | 'help' | 'only' | 'class' | 'served'> & { readonly spec?: Spec };

/** A verb the CLI runs by a hand of its own: its name, usage, help, class, its endpoints, the side it is served on alone and its spec. */
type CliVerb = Pick<CommandSpec, 'name' | 'usage' | 'help' | 'class' | 'served' | 'only'> & { readonly spec?: Spec };

/** The skill's sections, in order: the class each lists, its heading, and what it tells her of every verb under it; none lists `none`. */
const SECTIONS: readonly { readonly class: 'read' | 'act' | 'ask' | 'answer'; readonly heading: string; readonly says: string }[] = [
  {
    class: 'read',
    heading: 'Reads',
    says: 'They write nothing: run them unasked, as often as you need. One that sets with some words prompts the person given them.',
  },
  { class: 'act', heading: 'Yours', says: 'They write, and are yours to run unasked, on your judgement: say what you did.' },
  {
    class: 'ask',
    heading: 'Prompts the person',
    says: 'Each asks the person at a prompt every time it runs: say what it does before you run it.',
  },
  {
    class: 'answer',
    heading: 'Answers what waits',
    says:
      'Each answers what waits on the person. Bring the matter first, with the `bring-what-waits` skill, then run the verb they choose, at a shell ' +
      'with their words as `--message`, or its tool on the port with them as its message: its prompt is their decision, asked once. `retry` asks ' +
      'only of a step that waits on the person, or with `--budget`.',
  },
];

/** The section a class is listed under: a command that reads bare and sets with some words is a read. */
const sectionOf = (c: CommandClass) => (typeof c === 'object' ? 'read' : c);

/** Where an entry is served besides the shell: its tools on the MCP port (`toolsOf`), or why the command line alone runs it. */
function servedLine(entry: Entry) {
  const tools = toolsOf(entry).map((t) => t.tool);
  if (tools.length > 0) return [`on the port: ${tools.join(', ')}`];
  return entry.only?.side === 'cli' ? [`CLI only: ${entry.only.why}`] : [];
}

/** Where the words of each tool of an entry are, by its section's heading in `tools.md`: none where no tool serves it. */
function wordsLine(entry: Entry) {
  const tools = toolsOf(entry).map((t) => `tools.md#${t.tool}`);
  return tools.length > 0 ? [`each tool's words: ${tools.join(', ')}`] : [];
}

/**
 * An entry's help, for a command that reads bare the words that make it prompt the person, where its tools' words are (`wordsLine`) and
 * where it is served (`servedLine`).
 */
function helpLines(entry: Entry) {
  const bare = typeof entry.class === 'object' ? [`reads bare; prompts the person given ${entry.class.setsBy.join(', ')}`] : [];
  return [...entry.help, ...bare, ...wordsLine(entry), ...servedLine(entry)];
}

/**
 * The text of the `verbs` skill for `table` and `cliVerbs`: its frontmatter, written as YAML (`renderFrontmatter`), the note that it
 * is generated with `REGENERATE`, and a section per class, each the commands of that class as `helpOf` prints them, in the table's order
 * and then the CLI's own verbs. Left out: a command out of her reach (`none`), one the api alone serves, and a verb of the CLI with no
 * entry in `table` to class it.
 * @param table The command table, each entry with its class and help.
 * @param cliVerbs The command line's own verbs, each with its class and help.
 */
export function verbsSkillOf(table: readonly Entry[], cliVerbs: readonly CliVerb[]) {
  const served = table.filter((c) => c.only?.side !== 'api');
  const sections = SECTIONS.flatMap((s) => {
    const under = [...served, ...cliVerbs].filter((c) => sectionOf(c.class) === s.class).map((c) => ({ ...c, help: helpLines(c) }));
    return under.length === 0 ? [] : [`## ${s.heading}`, '', s.says, '', '```text', helpOf(under), '```', ''];
  });
  return [
    '---',
    renderFrontmatter([
      ['name', 'verbs'],
      [
        'description',
        'Every nemia verb you run, by who answers for it — a read, yours unasked, one that prompts the person, one that answers what waits on them — with its usage and help, and where to start.',
      ],
    ]).replace(/\n$/, ''),
    '---',
    '# The verbs',
    '',
    'Every verb `nemia` serves you, by who answers for it, with its usage and help as `nemia --help` prints them. `nemia <verb> --help`',
    'says more of one that has a manual. With a shell, run `nemia <verb>`; on the MCP port, call the tool its `on the port` line names,',
    'whose schema says its arguments. A verb said `CLI only` runs at a shell alone, for the reason given. `tools.md`, beside this file,',
    "says each tool's words as the port says them: the endpoint it calls, what it does and what each argument takes.",
    '',
    `Generated from the command table, never edited by hand: from the repository's root, \`${REGENERATE}\`.`,
    '',
    '## Start here',
    '',
    shellGuidance(),
    '',
    ...sections,
  ].join('\n');
}

/** The `verbs` skill as the command table says it today: what `nemia/skills/verbs/SKILL.md` holds. */
export const verbsSkill = () => verbsSkillOf(TABLE, CLI_VERBS);

/** How a shell types the key `key` of `spec`: `<key>` for a positional, its flags for the flags that set it; none where nothing does. */
function spelledAt(spec: Spec | undefined, key: string) {
  if (spec === undefined) return undefined;
  if (spec.positionals.some((p) => p.key === key)) return `<${key}>`;
  const flags = spec.flags.filter((f) => f.key === key || (f.sets !== undefined && key in f.sets)).map((f) => f.flag);
  return flags.length > 0 ? flags.join(', ') : undefined;
}

/**
 * The section of `tools.md` for one tool: its heading, the verb's usage and help as `nemia`'s help prints them (the usage said the port's
 * alone where the api alone serves the verb), what the endpoint does, the call, each key's words with how a shell spells it where the
 * verb's spec says, and how the port answers it.
 */
function toolSection(verb: Entry, tool: ReturnType<typeof toolWordsOf<Entry>>[number]['words']) {
  const lines = toolLinesOf(verb, tool);
  const alone = verb.only?.side === 'api' ? [`    the port's alone: no \`nemia\` verb runs it at a shell`] : [];
  const keys = tool.keys.map(({ key, words }, i) => {
    const spelled = spelledAt(verb.spec, key);
    return `- ${spelled === undefined ? lines.keys[i] : `${key} (${spelled} at a shell): ${words}`}`;
  });
  return [
    `## ${tool.name}`,
    '',
    '```text',
    `  ${lines.usage}`,
    ...lines.help.map((line) => `    ${line}`),
    ...alone,
    '```',
    '',
    lines.said,
    '',
    `Calls \`${lines.call}\`.`,
    '',
    ...(keys.length > 0 ? ['Its arguments:', '', ...keys, ''] : []),
    ...(lines.answers.length > 0 ? [...lines.answers.map((line) => `- On the port: ${line}`), ''] : []),
  ];
}

/**
 * The text of the `verbs` skill's `tools.md` for `table`, `cliVerbs` and `api`: the note that it is generated with `REGENERATE`, then a
 * section per tool of the MCP port, in the port's order (`toolWordsOf`), the api's own verbs among them, each saying what the port's
 * description says (`toolSection`).
 * @param table The command table, each entry with its links and spec.
 * @param cliVerbs The command line's own verbs, each with its links and spec where it has one.
 * @param api The Api whose endpoints the links name.
 */
export function toolsReferenceOf(table: readonly Entry[], cliVerbs: readonly CliVerb[], api: DescribedApi) {
  const sections = toolWordsOf<Entry>(table, cliVerbs, api).flatMap(({ verb, words }) => toolSection(verb, words));
  return [
    "# The port's tools",
    '',
    'Each tool of the MCP port, by its name, as the port describes it: the verb it is, with its usage and help, what its endpoint does,',
    'the call, what each argument takes, and how the port answers it. At a shell, run the verb; an argument whose shell spelling is',
    "given is typed so, and one without is the endpoint's, which the verb's own usage says how to give.",
    '',
    `Generated from the command table and the Api, never edited by hand: from the repository's root, \`${REGENERATE}\`.`,
    '',
    ...sections,
  ].join('\n');
}

/** The `verbs` skill's `tools.md` as the table and the Api say it today: what `nemia/skills/verbs/tools.md` holds. */
export const toolsReference = () => toolsReferenceOf(TABLE, CLI_VERBS, Api);
