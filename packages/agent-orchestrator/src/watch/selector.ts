/**
 * The selector grammar of the feed, whole and pure: the keys a selector may name, the refusal of every malformed form, the parse of
 * already-checked text, what a line offers a selector (`selectableOf`), and whether a line is selected (`selects`).
 *
 * One grammar, Kubernetes': `key=value`, `key!=value`, `key in (a,b)`, `key notin (a,b)` and a bare `key`, which selects a line that
 * carries it at all. Clauses of one selector are separated by commas and all must hold (AND); `-l` given more than once selects a line
 * any one of them holds for (OR). It is read by `nemia watch` here, and by every other surface that selects the feed's lines.
 *
 * **The keys are the line's own vocabulary, never its message**: the five labels a filing carries (`FeedLabels`) and the five reserved
 * keys a signed line names — `kind`, `reason`, `on` (what a `Waiting` line waits on), `via` (where an `AwaitingAnswer` line's answer is
 * asked), `type`, `waits` and `source`. The message a person reads is prose, worded anew whenever a
 * status is reworded, so nothing selects on it: `-l message=…` is refused as a key the feed has none of.
 *
 * A label may not take a reserved name (`labelKeysRefusal`), or a line's label would decide what `reason` means to a selector.
 *
 * **A former reason still selects what it did** (`FORMER_REASONS`): a clause on `reason` that names one is held of the line's current
 * reason and of the one it would have been written under (`formerOf`), so `reason=NeedsHuman` and `reason notin (WaitingForSlot)` keep
 * their meaning in a selector typed or stored before the codes were renamed, which is never rewritten.
 */
import { formerOf, involvedOf, isFormerReason, upgraded, type Codes, type FeedLabels, type FeedLine } from '../feed/index.ts';

/**
 * Every label key of a feed line, each named once. A `Record` of `keyof FeedLabels`, whose keys are required however optional the
 * labels themselves are, so a label added to `FeedLabels` fails the typecheck here until it is named — and a selector reaches it the
 * day it exists, rather than being refused as no key of a line.
 */
const EVERY_LABEL: Record<keyof FeedLabels, true> = { run: true, factory: true, workflow: true, step: true, agent: true };

/** The label keys a selector may name, in the order `FeedLabels` declares them: every one of them (`EVERY_LABEL`). */
export const LABEL_KEYS: readonly (keyof FeedLabels)[] = Object.keys(EVERY_LABEL) as (keyof FeedLabels)[];

/** The keys a signed line names of itself, which a selector reads beside the labels: what it is about, and how its writer judged it. */
export const RESERVED_KEYS: readonly string[] = ['kind', 'reason', 'on', 'via', 'type', 'waits', 'source'];

/** Every key a selector may name: the labels and the reserved keys, in that order. */
export const SELECTABLE_KEYS: readonly string[] = [...LABEL_KEYS, ...RESERVED_KEYS];

/** The command line a selector's refusals end on, so a person reads what the grammar takes from any one of them. */
export const SELECTOR_FORM =
  '-l <key>=<value>, -l <key>!=<value>, -l "<key> in (<a>,<b>)", -l "<key> notin (<a>,<b>)" or -l <key> for a line that carries it; ' +
  `commas between clauses, which all must hold, and -l again for another selector, of which one must. The keys: ${SELECTABLE_KEYS.join(', ')}`;

/**
 * Why `keys` cannot be the label keys — a label named as a reserved key, which would decide for a selector what that key means — or
 * undefined where none is. Pure, and asked of `LABEL_KEYS` itself, so a label added under a reserved name is refused by name.
 */
export const labelKeysRefusal = (keys: readonly string[]): string | undefined => {
  const taken = keys.find((key) => RESERVED_KEYS.includes(key));
  return taken === undefined
    ? undefined
    : `${taken} is a reserved key of a feed line (${RESERVED_KEYS.join(', ')}) and cannot be a label: name the label something else`;
};

/** One clause of a selector, parsed: a key compared with one value, with a list, or named alone for a line that carries it. */
export type Clause =
  | { readonly key: string; readonly op: '='; readonly value: string }
  | { readonly key: string; readonly op: '!='; readonly value: string }
  | { readonly key: string; readonly op: 'in'; readonly values: readonly string[] }
  | { readonly key: string; readonly op: 'notin'; readonly values: readonly string[] }
  | { readonly key: string; readonly op: 'exists' };

/** Every selector given, parsed: the clauses of one all hold, and one selector of them does (AND within, OR across). */
export type Selectors = readonly (readonly Clause[])[];

/** A key as a selector spells one: a letter, then letters and digits. */
const KEY = /^[A-Za-z][A-Za-z0-9]*$/;

/** A clause naming a list: its key, `in` or `notin`, and the values between its parentheses. */
const LISTED = /^([^\s=!()]+)\s+(in|notin)\s*\(([^()]*)\)$/;

/** A clause comparing one value: its key, `=` or `!=`, and the value after it. */
const COMPARED = /^([^\s=!()]+)\s*(!=|=)(.*)$/;

/** Where a word says a list is meant, however it is spelled: `in` or `notin` as a word of the clause. */
const MEANS_LIST = /(^|\s)(in|notin)(\s|\()/;

/**
 * `text` split into its clauses on the commas outside parentheses, so a list's commas stay in their clause — or undefined where a
 * parenthesis is left open, which no split could read.
 */
function clausesOf(text: string): string[] | undefined {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
    if (depth < 0) return undefined;
  }
  if (depth !== 0) return undefined;
  out.push(text.slice(start));
  return out;
}

/** The refusal of `key`, where a selector may not name it, or undefined. */
const keyRefusal = (key: string): string | undefined =>
  KEY.test(key) && SELECTABLE_KEYS.includes(key)
    ? undefined
    : `${JSON.stringify(key)} is no key of a feed line: a selector names one of ${SELECTABLE_KEYS.join(', ')} — ${SELECTOR_FORM}`;

/** The refusal of a value a selector cannot hold: empty, or spelling a comma or a parenthesis, which the grammar reads itself. */
const valueRefusal = (key: string, op: string, value: string): string | undefined => {
  if (!value) return `${key}${op} takes a value: ${SELECTOR_FORM}`;
  if (/[(),]/.test(value)) return `${JSON.stringify(value)} is no value of a selector, which reads ( ) and , itself: ${SELECTOR_FORM}`;
  return undefined;
};

/** The refusal of the values between a list's parentheses: none at all, or one of them empty. */
const listRefusal = (key: string, list: string): string | undefined => {
  const values = list.split(',').map((v) => v.trim());
  if (!list.trim()) return `${key} in () takes a value at least: ${SELECTOR_FORM}`;
  if (values.some((v) => !v)) return `${key} in (${list}) holds an empty value: ${SELECTOR_FORM}`;
  return undefined;
};

/**
 * Why `text` is no clause of a selector — or undefined where it is one: a clause empty, a key the feed has none of, `==` where `=` is
 * meant, a list with no parentheses or none between them, a value the grammar reads itself, and anything else, which has no operator at
 * all. Pure.
 */
function clauseRefusal(text: string): string | undefined {
  const t = text.trim();
  if (!t) return `a selector holds an empty clause: ${SELECTOR_FORM}`;
  const listed = LISTED.exec(t);
  if (listed) return keyRefusal(listed[1]) ?? listRefusal(listed[1], listed[3]);
  if (MEANS_LIST.test(t))
    return `${JSON.stringify(t)} names a list and spells it with no (values) after ${/notin/.test(t) ? 'notin' : 'in'}: ${SELECTOR_FORM}`;
  if (t.includes('==')) return `${JSON.stringify(t)} compares with ==, and a selector compares with one =: ${SELECTOR_FORM}`;
  const compared = COMPARED.exec(t);
  if (compared) return keyRefusal(compared[1]) ?? valueRefusal(compared[1], compared[2], compared[3].trim());
  if (KEY.test(t)) return keyRefusal(t);
  return `${JSON.stringify(t)} is no clause of a selector: it names no operator: ${SELECTOR_FORM}`;
}

/**
 * Why the selectors `values` spell are refused before anything is read — in the words of the first that is wrong — or undefined where
 * every one of them is a selector. A selector with no clause at all is refused too: `-l ''` and `-l ,` select nothing and say nothing.
 * Pure: what `WATCH.check` answers, and what a loader of a stored selector throws.
 */
export function selectorsRefusal(values: readonly string[]): string | undefined {
  for (const value of values) {
    const clauses = clausesOf(value);
    if (clauses === undefined) return `${JSON.stringify(value)} leaves a ( open: ${SELECTOR_FORM}`;
    if (!clauses.some((c) => c.trim())) return `${JSON.stringify(value)} is no selector: it holds no clause — ${SELECTOR_FORM}`;
    for (const clause of clauses) {
      const refusal = clauseRefusal(clause);
      if (refusal) return refusal;
    }
  }
  return undefined;
}

/** One clause of checked text, parsed (`selectorsRefusal` first): its key, its operator, and its value or values. */
function clauseOf(text: string): Clause {
  const t = text.trim();
  const listed = LISTED.exec(t);
  if (listed) {
    const values = listed[3].split(',').map((v) => v.trim());
    return listed[2] === 'notin' ? { key: listed[1], op: 'notin', values } : { key: listed[1], op: 'in', values };
  }
  const compared = COMPARED.exec(t);
  if (compared) {
    const value = compared[3].trim();
    return compared[2] === '!=' ? { key: compared[1], op: '!=', value } : { key: compared[1], op: '=', value };
  }
  return { key: t, op: 'exists' };
}

/**
 * The selectors `values` spell, parsed: one list of clauses for each `-l` given, in the order given, and none at all for none, which
 * selects every line. Text already held to the grammar (`selectorsRefusal`): what it refuses, this does not read. Pure.
 */
export const parseSelectors = (values: readonly string[]): Selectors =>
  values.map((value) => (clausesOf(value) ?? []).filter((c) => c.trim()).map(clauseOf));

/**
 * What `line` offers a selector: a flat map of its keys to their values, read off the signed line (`upgraded`) — `kind` from what it is
 * about, each label it carries, and each reserved key it names. A key the line does not carry is absent, which `=` and `in` never match
 * and `!=` and `notin` always do. The message is no key of it. Pure.
 */
export function selectableOf(line: FeedLine): Readonly<Record<string, string>> {
  const signed = upgraded(line);
  const labels: FeedLabels = signed.labels ?? {};
  const on: Record<string, string> = {};
  for (const key of LABEL_KEYS) {
    const value = labels[key];
    if (value !== undefined) on[key] = value;
  }
  on.kind = involvedOf(signed).kind;
  for (const [key, value] of [
    ['reason', signed.reason],
    ['on', signed.on],
    ['via', signed.via],
    ['type', signed.type],
    ['waits', signed.waits],
    ['source', signed.source],
  ] as const)
    if (value !== undefined) on[key] = value;
  return on;
}

/** Whether `clause` holds of `value`, the line's under its key, or undefined where the line carries none. Pure. */
function holds(clause: Clause, value: string | undefined): boolean {
  if (clause.op === 'exists') return value !== undefined;
  if (clause.op === '=') return value === clause.value;
  if (clause.op === '!=') return value !== clause.value;
  const listed = value !== undefined && clause.values.includes(value);
  return clause.op === 'in' ? listed : !listed;
}

/** The values a clause names: its one, or its list. */
const named = (clause: Clause): readonly string[] =>
  clause.op === 'exists' ? [] : clause.op === '=' || clause.op === '!=' ? [clause.value] : clause.values;

/**
 * Whether `clause` holds of `line`, whose keys are `on`: a clause on `reason` naming a former code is held of the line's current reason and
 * its former one together — one of them listed for `=` and `in`, neither for `!=` and `notin`; every other clause of the key it names.
 * The line's codes are read as its writer wrote them, which a newer `nemia` may have written outside the table: `formerOf` matches only
 * the codes it knows.
 */
function holdsOf(clause: Clause, line: FeedLine, on: Readonly<Record<string, string>>): boolean {
  const value = on[clause.key];
  if (clause.key !== 'reason' || !named(clause).some(isFormerReason)) return holds(clause, value);
  const former = value === undefined ? undefined : formerOf({ reason: value, on: on.on, via: on.via } as Codes, involvedOf(line).kind);
  const listed = [value, former].some((v) => v !== undefined && named(clause).includes(v));
  return clause.op === '=' || clause.op === 'in' ? listed : !listed;
}

/**
 * Whether `line` is selected by `selectors`: every clause of one selector holds of it (AND), and one selector of them does (OR) — and
 * every line where none was given. Pure.
 */
export function selects(selectors: Selectors, line: FeedLine): boolean {
  if (selectors.length === 0) return true;
  const on = selectableOf(line);
  return selectors.some((clauses) => clauses.every((clause) => holdsOf(clause, line, on)));
}
