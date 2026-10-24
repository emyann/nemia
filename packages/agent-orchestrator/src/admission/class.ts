/**
 * Who answers for a command an agent calls (`CommandClass`), said once in its entry of the table, and the refusals of a table whose classes
 * break the rules (`classBreaks`). Pure: an agent's fence is derived from the classes (`nemiaFence`), and a call's admission reads them
 * (`admissionOf`).
 */

/**
 * The class of a command an agent calls, and what admission does with a call of it:
 *
 * - `read`: writes nothing, and runs unasked;
 * - `act`: a write that runs unasked;
 * - `ask`: a write that asks the person each time — what cannot be undone, the person's own settings, a factory's definition;
 * - `answer`: an answer to what waits on the person — a step at its gate, a step's question, a loop out of rounds — which admission asks
 *   the person of where the run's state says it waits on them;
 * - `none`: refused, out of the agent's reach;
 * - a command that reads bare and sets with some words: a read, but a write that asks given one of `setsBy` — a flag (`--clear`) or a
 *   positional word (`manual`); `readsBy`, the flags it takes that only read.
 */
export type CommandClass =
  | 'read'
  | 'act'
  | 'ask'
  | 'answer'
  | 'none'
  | { readonly bare: 'read'; readonly sets: 'ask'; readonly setsBy: readonly string[]; readonly readsBy?: readonly string[] };

/** An entry as `classBreaks` reads it: its name, whether it writes, its class, whether it is asked every time and its spec's flags. */
type Classed = {
  readonly name: string;
  readonly writes: boolean;
  readonly class: CommandClass;
  readonly asksAlways?: true;
  readonly spec?: { readonly flags: readonly { readonly flag: string; readonly only?: { readonly side: 'cli' | 'api' } }[] };
};

/** The class a rule on a command's name gives every command it extends: an ask or an allow on `<name>:*`. */
const covers = (c: CommandClass): boolean => c === 'answer' || c === 'ask';

/** The command whose writes are the person's confirmed list for `auto`, which a prompt's allow must never reach. */
const ALWAYS_ASKED_UNDER = 'policy';

/**
 * Where an entry's `asksAlways` breaks the rules: given a class other than `ask`, where it asks nothing a prompt's allow could reach;
 * left out of an `ask` write under `nemia policy`, which writes the person's confirmed list.
 */
function askedBreaks(c: Classed): string[] {
  if (c.asksAlways && c.class !== 'ask')
    return [`${c.name} asks always and is classed ${JSON.stringify(c.class)}: asksAlways is a prompt's, so class it 'ask' or drop it`];
  if (!c.asksAlways && c.class === 'ask' && c.name.startsWith(`${ALWAYS_ASKED_UNDER} `))
    return [`${c.name} writes the person's rules for auto and is not asked always: give it asksAlways, so no allow at a prompt reaches it`];
  return [];
}

/**
 * Where one entry's class breaks the rules: a read classed as a write, a write classed as a read, a flag a bare read leaves
 * out, and its `asksAlways` (`askedBreaks`).
 */
function ownBreaks(c: Classed): string[] {
  const asked = askedBreaks(c);
  if (asked.length) return asked;
  if (!c.writes && c.class !== 'read') return [`${c.name} writes nothing and is classed ${JSON.stringify(c.class)}: class it 'read'`];
  if (c.writes && c.class === 'read') return [`${c.name} writes and is classed 'read': class it as the write it is`];
  if (typeof c.class !== 'object') return [];
  const said = [...c.class.setsBy, ...(c.class.readsBy ?? [])];
  return (c.spec?.flags ?? [])
    .filter((f) => f.only?.side !== 'api' && !said.includes(f.flag))
    .map((f) => `${c.name}'s ${f.flag} is in neither its setsBy nor its readsBy: say whether it sets or reads`);
}

/**
 * Where a table's classes break the rules, a sentence each: a command that writes nothing classed other than a
 * read, and one that writes classed a read; a flag of a command that reads bare in neither its `setsBy` nor its `readsBy`, which would run
 * unasked whatever it does; an `asksAlways` on a class but `ask`, or left out of a write of the person's rules for auto; and a name
 * that extends an `answer` or an `ask` name by a word (`approve now` under `approve`) in another class, whose own class the rule on
 * the shorter name would override.
 */
export function classBreaks(table: readonly Classed[]): string[] {
  const breaks = table.flatMap(ownBreaks);
  for (const c of table) {
    const under = table.find((o) => covers(o.class) && c.name.startsWith(`${o.name} `) && o.class !== c.class);
    if (under !== undefined)
      breaks.push(
        `${c.name} is classed ${JSON.stringify(c.class)} under ${under.name}, classed ${JSON.stringify(under.class)}, whose rule covers it: rename it, or class it ${JSON.stringify(under.class)}`,
      );
  }
  return breaks;
}
