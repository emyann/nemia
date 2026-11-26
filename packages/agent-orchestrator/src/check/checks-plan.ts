/**
 * A step's `checks:` as the loader reads it (`checksOf`): a list of named checks, each a shell line (`run:`) and the checks it waits on
 * (`after:`), resolved into the plan the pass files by (`CheckSpec`), and on an ending whether it uses the repository's own checkout
 * (`usesCheckout: false` where it does not, which gives the checkout back before it runs). A check that names no `after:` waits on the
 * enabled check above it, `after: []` on none; a check turned off (`enabled: false`) is taken out, and the checks that waited on it wait
 * on what it waited on. `check: <line>` is the one-check shorthand, read beside it by `stepChecks` (`src/step/step.ts`). The words follow
 * GitHub Actions, whose step's `run:` is a shell line and whose jobs wait by name.
 */
import { readFrontmatter, type FrontmatterValue } from '../frontmatter/frontmatter.ts';
import { refuse, type CheckSpec } from '../step/step.ts';

/** What a check's name is: a word of lower-case letters, digits and dashes, opening on a letter, as a task id carries it. */
const CHECK_NAME = /^[a-z][a-z0-9-]*$/;

const ENTRY_KEYS = ['name', 'run', 'after', 'enabled', 'usesCheckout'] as const;

const EXAMPLE = '`checks: [ { name: types, run: npm run typecheck }, { name: lint, run: npm run lint, after: [] } ]`';

/** A check as written, before the plan is resolved: its name, its line, its waits as written (absent: the one above), on or off. */
type Written = { name: string; run: string; after: readonly string[] | undefined; enabled: boolean; usesCheckout: boolean };

/** Whether a value is a map of YAML. */
const isMap = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A check's `run:` as written, refused when empty or `none`, which the shell would run as a command it cannot find. */
function runOf(step: string, name: string, run: unknown) {
  if (typeof run !== 'string' || ['', 'none', '""', "''"].includes(run.trim()))
    refuse(
      `${step}: the check \`${name}\` has no \`run:\` line, the shell command it executes. Write one: \`- name: ${name}\` and \`run: <command>\`.`,
    );
  return run;
}

/** A check's `after:` as written: a list of names, a comma string, or absent. */
function afterOf(step: string, name: string, after: unknown) {
  if (after === undefined) return undefined;
  if (typeof after === 'string')
    return after
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  if (Array.isArray(after) && after.every((n) => typeof n === 'string')) return after.map((n) => n.trim()).filter(Boolean);
  return refuse(
    `${step}: the check \`${name}\`'s \`after:\` is a list of the checks it waits on, by name: \`after: [types]\`, or \`after: []\` for none.`,
  );
}

/** A check's `enabled:` as written: `true` or `false`, a YAML word read as text or as a boolean; absent, on. */
function enabledOf(step: string, name: string, enabled: unknown) {
  if (enabled === undefined || enabled === true || enabled === 'true') return true;
  if (enabled === false || enabled === 'false') return false;
  return refuse(`${step}: the check \`${name}\`'s \`enabled:\` is \`true\` or \`false\`: \`enabled: false\` turns it off.`);
}

/** A check's `usesCheckout:` as written: `true` or `false`, a YAML word read as text or as a boolean; absent, it uses the checkout. */
function usesCheckoutOf(step: string, name: string, uses: unknown) {
  if (uses === undefined || uses === true || uses === 'true') return true;
  if (uses === false || uses === 'false') return false;
  return refuse(
    `${step}: the check \`${name}\`'s \`usesCheckout:\` is \`true\` or \`false\`: \`usesCheckout: false\` says it reads and writes nothing of the checkout, or delete the line.`,
  );
}

/** One entry of `checks:`, refused unless it is a map of the five keys with a name of its own. */
function writtenOf(step: string, entry: unknown) {
  if (!isMap(entry)) return refuse(`${step}: each item of \`checks:\` is a map with a name and a line: ${EXAMPLE}.`);
  const name = entry.name;
  if (typeof name !== 'string' || !CHECK_NAME.test(name))
    refuse(
      `${step}: a check's \`name:\` is a word of lower-case letters, digits and dashes, opening on a letter (${JSON.stringify(name ?? null)} is not): \`name: types\`.`,
    );
  const unknown = Object.keys(entry).filter((key) => !(ENTRY_KEYS as readonly string[]).includes(key));
  if (unknown.length)
    refuse(
      `${step}: the check \`${name}\` has \`${unknown.join('`, `')}\`, which a check does not take: it takes ${ENTRY_KEYS.map((k) => `\`${k}:\``).join(', ')}.`,
    );
  return {
    name,
    run: runOf(step, name, entry.run),
    after: afterOf(step, name, entry.after),
    enabled: enabledOf(step, name, entry.enabled),
    usesCheckout: usesCheckoutOf(step, name, entry.usesCheckout),
  } satisfies Written;
}

/**
 * The value of the JSON text the reader keeps of `checks:`, read as the frontmatter reads a line, which JSON is; the text itself where
 * it is neither.
 * @param step The step's name, which the reader's refusal starts with.
 * @param text The text of the step's `checks:`.
 */
function listOf(step: string, text: string) {
  try {
    const read: unknown = readFrontmatter(step, `checks: ${text}`).entries[0]?.value;
    return read;
  } catch {
    return text;
  }
}

/** The checks as written with each `after:` given: absent, the check above it as written, none for the first. */
const explicitWaits = (written: readonly Written[]) =>
  written.map((c, i) => ({ ...c, after: c.after ?? (i === 0 ? [] : [written[i - 1]?.name ?? '']).filter(Boolean) }));

/** Refused: a wait on a check the step does not have, on itself, or a cycle of waits. */
function waitsRefusal(step: string, checks: readonly { name: string; after: readonly string[] }[]) {
  for (const c of checks) {
    for (const name of c.after) {
      if (name === c.name) refuse(`${step}: the check \`${c.name}\` waits on itself. Delete \`${name}\` from its \`after:\`.`);
      if (!checks.some((d) => d.name === name))
        refuse(
          `${step}: the check \`${c.name}\` waits on \`${name}\`, which is no check of this step. Name one of its checks in \`after:\`, or delete it.`,
        );
    }
  }
  cycleRefusal(step, checks);
}

/** Refused: checks that wait on each other in a cycle, so none could start. */
function cycleRefusal(step: string, checks: readonly { name: string; after: readonly string[] }[]) {
  const settled = new Set<string>();
  let moved = true;
  while (moved) {
    moved = false;
    for (const c of checks) {
      if (settled.has(c.name) || !c.after.every((name) => settled.has(name))) continue;
      settled.add(c.name);
      moved = true;
    }
  }
  const looped = checks.filter((c) => !settled.has(c.name)).map((c) => c.name);
  if (looped.length)
    refuse(
      `${step}: the checks \`${looped.join('`, `')}\` wait on each other in a cycle, so none could start. Take one wait out of their \`after:\`.`,
    );
}

/** The waits of the enabled checks, each wait on a check turned off replaced by that check's own waits, in order and once each. */
function throughDisabled(checks: readonly (Written & { after: readonly string[] })[]) {
  const named = new Map(checks.map((c) => [c.name, c]));
  // oxlint-disable-next-line landmines-types/no-explicit-return-types -- resolve calls itself, so its type cannot be inferred
  const resolve = (names: readonly string[], seen: ReadonlySet<string>): string[] =>
    names.flatMap((name) => {
      const c = named.get(name);
      if (c === undefined || seen.has(name)) return [];
      return c.enabled ? [name] : resolve(c.after, new Set([...seen, name]));
    });
  return checks
    .filter((c) => c.enabled)
    .map(
      (c) =>
        ({
          name: c.name,
          run: c.run,
          after: [...new Set(resolve(c.after, new Set([c.name])))],
          ...(c.usesCheckout ? {} : { usesCheckout: false as const }),
        }) satisfies CheckSpec,
    );
}

/**
 * A step's checks resolved from its `checks:` (the JSON text the reader keeps of its list), refused in `step`'s words: both `check:` and
 * `checks:` on one step, an item that is no map, a name outside `CHECK_NAME` or written twice, a key a check does not take, an empty
 * `run:`, an `enabled:` or a `usesCheckout:` that is not a boolean, an `after:` naming no check of the step or the check itself, and a
 * cycle of waits. A check with no `after:` waits on the check above it; a check turned off is taken out, its waits handed to the checks
 * that waited on it. Undefined where the step has no `checks:`; refused where every check is turned off, which reads as checks to a person
 * and runs none.
 * @param step The step's name, which a refusal starts with.
 * @param check The step's `check:` line, refused beside `checks:`.
 * @param text The JSON text of the step's `checks:` list, or undefined where it has none.
 */
export function checksOf(step: string, check: string | undefined, text: string | undefined) {
  if (text === undefined) return undefined;
  if (check !== undefined)
    refuse(
      `${step}: \`check:\` and \`checks:\` both say what judges the step. Keep one: \`check: <line>\` is one check named \`check\`, the same as \`checks: [ { name: check, run: <line> } ]\`.`,
    );
  const list = listOf(step, text);
  if (!Array.isArray(list) || list.length === 0) return refuse(`${step}: \`checks:\` is a list of named checks: ${EXAMPLE}.`);
  const written = list.map((entry) => writtenOf(step, entry));
  const twice = written.find((c, i) => written.findIndex((d) => d.name === c.name) !== i);
  if (twice) refuse(`${step}: two checks are named \`${twice.name}\`, and a wait names one check. Rename one of them.`);
  const waits = explicitWaits(written);
  waitsRefusal(step, waits);
  const plan = throughDisabled(waits);
  if (plan.length === 0)
    refuse(
      `${step}: every check of \`checks:\` is turned off (\`enabled: false\`), so the step would run none. Turn one on, or delete \`checks:\`.`,
    );
  return plan satisfies readonly CheckSpec[];
}

/**
 * A step's resolved checks as the map its file writes them back as (`checks:`), each `after:` written and `usesCheckout: false` where
 * a check uses no checkout: the plan, read again, is itself.
 * @param checks The step's resolved checks.
 */
export const checksWritten = (checks: readonly CheckSpec[]) =>
  checks.map((c) => {
    const entry: Record<string, FrontmatterValue> = { name: c.name, run: c.run, after: [...c.after] };
    if (c.usesCheckout === false) entry.usesCheckout = 'false';
    return entry;
  });
