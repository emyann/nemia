/**
 * Nemia's `verbs` skill, generated from the command table (`TABLE`) and each command's class (`CommandClass`): every verb the CLI serves
 * her, by who answers for it, with its usage and help as `nemia`'s help prints them (`helpOf`). Built in as `nemia/skills/verbs/SKILL.md`,
 * and held to the table by `test/verbs-skill.test.ts`, which names `REGENERATE` when the file drifts.
 */
import type { CommandClass } from '../admission/index.ts';
import { CLI_VERBS, helpOf, type CommandSpec } from '../command/command.ts';
import { renderFrontmatter } from '../frontmatter/frontmatter.ts';
import { TABLE } from '../command/commands.verb.ts';

/** The command that writes the skill again from the table, from the repository's root. */
export const REGENERATE =
  'node -e "import(\'./packages/agent-orchestrator/src/nemia/verbs.verb.ts\').then((m) => process.stdout.write(m.verbsSkill()))" > ' +
  'packages/agent-orchestrator/nemia/skills/verbs/SKILL.md';

/** An entry as the skill reads it: its name, usage, help, class and the side it is served on alone. */
type Entry = Pick<CommandSpec, 'name' | 'usage' | 'help' | 'only' | 'class'>;

/** A verb the CLI runs by a hand of its own: its name, usage and help, its class its table entry's. */
type CliVerb = Pick<CommandSpec, 'name' | 'usage' | 'help'>;

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
      'Each answers what waits on the person. Bring the matter first, with the `bring-what-waits` skill, then run the verb they choose ' +
      'with their words as `--message`: its prompt is their decision, asked once. `nemia retry` asks only of a step that waits on the person, or with `--budget`.',
  },
];

/** The section a class is listed under: a command that reads bare and sets with some words is a read. */
const sectionOf = (c: CommandClass): CommandClass => (typeof c === 'object' ? 'read' : c);

/** An entry's help, and for a command that reads bare, the words that make it prompt the person. */
function helpLines(entry: Entry): readonly string[] {
  if (typeof entry.class !== 'object') return entry.help;
  const words = entry.class.setsBy.join(', ');
  return [...entry.help, `reads bare; prompts the person given ${words}`];
}

/**
 * The text of the `verbs` skill for `table` and `cliVerbs`: its frontmatter, written as YAML (`renderFrontmatter`), the note that it
 * is generated with `REGENERATE`, and a section per class, each the commands of that class as `helpOf` prints them, in the table's order
 * and then the CLI's own verbs. Left out: a command out of her reach (`none`), one the api alone serves, and a verb of the CLI with no
 * entry in `table` to class it.
 */
export function verbsSkillOf(table: readonly Entry[], cliVerbs: readonly CliVerb[]): string {
  const served = table.filter((c) => c.only?.side !== 'api');
  const own = cliVerbs.flatMap((v) => {
    const entry = table.find((c) => c.name === v.name);
    return entry === undefined ? [] : [{ ...v, class: entry.class }];
  });
  const sections = SECTIONS.flatMap((s) => {
    const under = [...served, ...own].filter((c) => sectionOf(c.class) === s.class).map((c) => ({ ...c, help: helpLines(c) }));
    return under.length === 0 ? [] : [`## ${s.heading}`, '', s.says, '', '```text', helpOf(under), '```', ''];
  });
  return [
    '---',
    renderFrontmatter([
      ['name', 'verbs'],
      [
        'description',
        'Every nemia verb you run, by who answers for it — a read, yours unasked, one that prompts the person, one that answers what waits on them — with its usage and help.',
      ],
    ]).replace(/\n$/, ''),
    '---',
    '# The verbs',
    '',
    'Every verb `nemia` serves you, by who answers for it, with its usage and help as `nemia --help` prints them. `nemia <verb> --help`',
    'says more of one that has a manual.',
    '',
    `Generated from the command table, never edited by hand: from the repository's root, \`${REGENERATE}\`.`,
    '',
    ...sections,
  ].join('\n');
}

/** The `verbs` skill as the command table says it today: what `nemia/skills/verbs/SKILL.md` holds. */
export const verbsSkill = (): string => verbsSkillOf(TABLE, CLI_VERBS);
