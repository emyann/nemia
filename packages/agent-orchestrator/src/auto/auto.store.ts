/**
 * An agent's rules for `auto` on disk, two files under `<store>/auto/`, each with one writer: the person's confirmed list,
 * `<agent>.json`, written by `nemia policy confirm` and `nemia policy rm` alone (`confirmRule`, `dropRule`); and what the agent proposes,
 * `<agent>.proposed.json`, written by `nemia policy propose` alone (`writeProposed`). Each read and written whole, through a hidden file
 * renamed over it, and composed on read by `nemia policy` and admission.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { agentNameRefusal } from '../agents/agents.ts';
import { firstRefusal, When } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { AUTO_ANSWERS, AUTO_FOLDER, CONDITIONS, DEFAULT_AUTO, DEFAULT_ID, ruleWords, type AutoRule } from './auto.ts';

/** A rule as the files keep it. */
const RuleSchema = Schema.Struct({
  id: Schema.String,
  answer: Schema.Literals(AUTO_ANSWERS),
  steps: Schema.optionalKey(Schema.Array(Schema.String)),
  when: Schema.Array(Schema.Literals(CONDITIONS)),
  under: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  from: Schema.optionalKey(Schema.Literals(['default', 'proposed'])),
});

/** The person's confirmed list: when it was last written, and its rules, in order; a key it does not name is read past. */
const ConfirmedSchema = Schema.StructWithRest(Schema.Struct({ since: When, rules: Schema.Array(RuleSchema) }), [
  Schema.Record(Schema.String, Schema.Unknown),
]);

/**
 * What an agent proposes: when, its rules, the words of the custom instruction the machinery cannot hold (`guidance`), and the digest of
 * the instruction it read (`digest`), null for none; a key it does not name is read past.
 */
const ProposedSchema = Schema.StructWithRest(
  Schema.Struct({ at: When, rules: Schema.Array(RuleSchema), guidance: Schema.Array(Schema.String), digest: Schema.NullOr(Schema.String) }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** The person's confirmed list, as read. */
export type Confirmed = { since: string; rules: AutoRule[] };

/** What an agent proposed, as read. */
export type Proposed = { at: string; rules: AutoRule[]; guidance: string[]; digest: string | null };

/** The folder of `<store>/auto/`, under the store `home`. */
export const autoDir = (home: string): string => path.join(home, AUTO_FOLDER);

/** `agent`'s name, refused (`Invalid`) where it is no agent's. */
function named(agent: string): string {
  const bad = agentNameRefusal(agent);
  if (bad) throw new Invalid({ message: bad });
  return agent;
}

/** The file the person's confirmed list for `agent` is kept in, in the store `home`. Refused (`Invalid`): a name that is no agent's. */
export const confirmedFile = (home: string, agent: string): string => path.join(autoDir(home), `${named(agent)}.json`);

/** The file `agent`'s proposals are kept in, in the store `home`. Refused (`Invalid`): a name that is no agent's. */
export const proposedFile = (home: string, agent: string): string => path.join(autoDir(home), `${named(agent)}.proposed.json`);

/** The digest of the words of a custom instruction, or null for none: what a proposal is stale against once the words change. */
export const digestOf = (words: string | undefined): string | null =>
  words === undefined ? null : createHash('sha256').update(words).digest('hex').slice(0, 16);

/** A rule as decoded, its optional keys left out where absent. */
const ruleOf = (rule: Schema.Schema.Type<typeof RuleSchema>): AutoRule => ({
  id: rule.id,
  answer: rule.answer,
  ...(rule.steps === undefined ? {} : { steps: [...rule.steps] }),
  when: [...rule.when],
  ...(rule.under === undefined ? {} : { under: rule.under }),
  ...(rule.from === undefined ? {} : { from: rule.from }),
});

/** The JSON in `file`, or undefined where no file is there; refused (`Invalid`), naming `fix`, where it is no JSON. */
function jsonIn(file: string, fix: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${file} is not JSON: ${fix}.` });
  }
}

/** The refusal of `raw`, read from `file`, that its schema refused with `error`: its first wrong field, and `fix`. */
function unread(file: string, raw: unknown, error: Schema.SchemaError, fix: string): Invalid {
  const { path: at, words } = firstRefusal(raw, error);
  return new Invalid({ message: `${file}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
}

/** Writes `value` to `file` whole, through a hidden file renamed over it. */
function writeWhole(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(value)}\n`);
  fs.renameSync(hidden, file);
}

/**
 * The person's confirmed list for `agent` in the store `home`, or undefined where they confirmed none. Refused (`Invalid`), naming the
 * file and its first wrong field, where it does not read: admission then allows nothing by it.
 */
export function readConfirmed(home: string, agent: string): Confirmed | undefined {
  const file = confirmedFile(home, agent);
  const fix = `it is yours, written by nemia policy confirm and nemia policy rm alone: move it aside, and confirm the rules again`;
  const raw = jsonIn(file, fix);
  if (raw === undefined) return undefined;
  const read = Schema.decodeUnknownResult(ConfirmedSchema)(raw);
  if (Result.isFailure(read)) throw unread(file, raw, read.failure, fix);
  return { since: read.success.since, rules: read.success.rules.map(ruleOf) };
}

/** What `agent` proposed in the store `home`, or undefined where it proposed nothing. Refused (`Invalid`) where the file does not read. */
export function readProposed(home: string, agent: string): Proposed | undefined {
  const fix = `propose again with nemia policy propose ${agent} --file <path>`;
  const file = proposedFile(home, agent);
  const raw = jsonIn(file, fix);
  if (raw === undefined) return undefined;
  const read = Schema.decodeUnknownResult(ProposedSchema)(raw);
  if (Result.isFailure(read)) throw unread(file, raw, read.failure, fix);
  const { at, rules, guidance, digest } = read.success;
  return { at, rules: rules.map(ruleOf), guidance: [...guidance], digest };
}

/** Writes what `agent` proposes in the store `home`, whole, over what it proposed before: `nemia policy propose`'s, alone. */
export function writeProposed(home: string, agent: string, proposed: Proposed): void {
  writeWhole(proposedFile(home, agent), proposed);
}

/**
 * Confirms the rule `id` for `agent` in the store `home` at `now`, as the person read it in `words`: the rule it proposed, or the rule
 * that is built in (`default`), added to the person's list, which a first confirm seeds with the builtin rule. The list written. Refused,
 * writing nothing: a rule it did not propose (`Missing`), one whose words are no longer `words`, proposed again since (`Conflict`), and one
 * in force already (`Conflict`).
 */
export function confirmRule(home: string, agent: string, id: string, words: string, now: Date): Confirmed {
  const rule = id === DEFAULT_ID ? DEFAULT_AUTO : readProposed(home, agent)?.rules.find((r) => r.id === id);
  if (rule === undefined)
    throw new Missing({
      message: `${agent} proposed no rule ${id}: see what it proposed with nemia policy ${agent}, or ask it to propose again.`,
    });
  if (ruleWords(rule) !== words)
    throw new Conflict({
      message: `${agent}'s rule ${id} now reads "${ruleWords(rule)}", not the words you confirmed: read it again with nemia policy ${agent}, and confirm what it says.`,
    });
  const rules = readConfirmed(home, agent)?.rules ?? [DEFAULT_AUTO];
  if (rules.some((r) => r.id === id))
    throw new Conflict({
      message: `the rule ${id} is in force already for ${agent}: drop it first with nemia policy rm ${agent} ${id}.`,
    });
  const confirmed = { since: now.toISOString(), rules: [...rules, id === DEFAULT_ID ? rule : { ...rule, from: 'proposed' as const }] };
  writeWhole(confirmedFile(home, agent), confirmed);
  return confirmed;
}

/**
 * Drops the rule `id` from the person's list for `agent` in the store `home` at `now`, the builtin rule among them while they confirmed
 * none. The list written. Refused, writing nothing: a rule not in force (`Missing`).
 */
export function dropRule(home: string, agent: string, id: string, now: Date): Confirmed {
  const rules = readConfirmed(home, agent)?.rules ?? [DEFAULT_AUTO];
  if (!rules.some((r) => r.id === id))
    throw new Missing({
      message: `no rule ${id} is in force for ${agent}: the rules in force are ${rules.map((r) => r.id).join(', ') || 'none'} (nemia policy ${agent}).`,
    });
  const confirmed = { since: now.toISOString(), rules: rules.filter((r) => r.id !== id) };
  writeWhole(confirmedFile(home, agent), confirmed);
  return confirmed;
}
