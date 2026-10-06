/**
 * Who answers for a command an agent calls (`CommandClass`), said once in its entry of the table, and the refusals of a table whose classes
 * break the rules (`classBreaks`). Pure: an agent's fence is derived from the classes (`nemiaFence`), and a call's admission reads them
 * (`admissionOf`).
 */

/**
 * The class of a command an agent calls:
 *
 * - `read`: writes nothing, and runs unasked;
 * - `hers`: a write the agent runs unasked;
 * - `prompts`: a write that asks the person each time — what cannot be undone, the person's own settings, a factory's definition;
 * - `answers`: an answer to what waits on the person — a step at its gate, a step's question, a loop out of rounds — which admission asks
 *   the person of where the run's state says it waits on them;
 * - `out`: out of the agent's reach;
 * - a command that reads bare and sets with some words: a read, but a write that asks given one of `setsBy` — a flag (`--clear`) or a
 *   positional word (`manual`); `readsBy`, the flags it takes that only read.
 */
export type CommandClass =
  | 'read'
  | 'hers'
  | 'prompts'
  | 'answers'
  | 'out'
  | { readonly bare: 'read'; readonly sets: 'prompts'; readonly setsBy: readonly string[]; readonly readsBy?: readonly string[] };

/** The classes a command is given, as a refusal names them. */
const CLASSES = "'read', 'hers', 'prompts', 'answers', 'out', or { bare: 'read', sets: 'prompts', setsBy }";

/** An entry as `classBreaks` reads it: its name, whether it writes, its class and the flags its spec takes. */
type Classed = {
  readonly name: string;
  readonly writes: boolean;
  readonly nemia?: CommandClass;
  readonly spec?: { readonly flags: readonly { readonly flag: string; readonly only?: { readonly side: 'cli' | 'api' } }[] };
};

/** The class a rule on a command's name gives every command it extends: an ask or an allow on `<name>:*`. */
const covers = (c: CommandClass | undefined): boolean => c === 'answers' || c === 'prompts';

/** Where one entry's class breaks the rules: none given, a read classed as a write, a write classed as a read, a flag a bare read leaves out. */
function ownBreaks(c: Classed): string[] {
  if (c.nemia === undefined) return [`${c.name} has no class: say who answers for it when an agent calls it — ${CLASSES}`];
  if (!c.writes && c.nemia !== 'read') return [`${c.name} writes nothing and is classed ${JSON.stringify(c.nemia)}: class it 'read'`];
  if (c.writes && c.nemia === 'read') return [`${c.name} writes and is classed 'read': class it as the write it is`];
  if (typeof c.nemia !== 'object') return [];
  const said = [...c.nemia.setsBy, ...(c.nemia.readsBy ?? [])];
  return (c.spec?.flags ?? [])
    .filter((f) => f.only?.side !== 'api' && !said.includes(f.flag))
    .map((f) => `${c.name}'s ${f.flag} is in neither its setsBy nor its readsBy: say whether it sets or reads`);
}

/**
 * Where a table's classes break the rules, a sentence each: an entry with no class; a command that writes nothing classed other than a
 * read, and one that writes classed a read; a flag of a command that reads bare in neither its `setsBy` nor its `readsBy`, which would run
 * unasked whatever it does; and a name that extends an `answers` or a `prompts` name by a word (`approve now` under `approve`) in another
 * class, whose own class the rule on the shorter name would override.
 */
export function classBreaks(table: readonly Classed[]): string[] {
  const breaks = table.flatMap(ownBreaks);
  for (const c of table) {
    const under = table.find((o) => covers(o.nemia) && c.name.startsWith(`${o.name} `) && o.nemia !== c.nemia);
    if (under !== undefined)
      breaks.push(
        `${c.name} is classed ${JSON.stringify(c.nemia)} under ${under.name}, classed ${JSON.stringify(under.nemia)}, whose rule covers it: rename it, or class it ${JSON.stringify(under.nemia)}`,
      );
  }
  return breaks;
}
