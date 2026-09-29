/**
 * The names a key had before it was renamed, and every place one is still read or written back: `FORMER_KEYS`, the frontmatter read
 * under either name (`readKeys`), a line written in the form the file has (`formerKeyWritten`, `codexModeWritten`), a Codex sandbox
 * named by `permissionMode:` (`codexSandboxNamed`, `formerSandbox`), the fence a step asks for under either key (`modeOf`), and a step
 * frozen on a run record under an old name (`asNamed`).
 */
import { refuse, splitFrontmatter, type StepAgent, type StepKey, type Workflow } from '../step/step.ts';
import { SANDBOXES } from '../harness/harness.ts';
import { ALLOW_EXAMPLE, BUDGET_EXAMPLE, DISALLOW_EXAMPLE, TOOLS_EXAMPLE } from '../keys/index.ts';
import type { RoleKey } from '../agents/agents.ts';

/**
 * A key's former name, and the name it has now: `disallow:` and `allow:` are the former names of `disallowedTools:` and `allowedTools:`,
 * Claude Code's `--disallowedTools` and `--allowedTools` — a subagent's `disallowedTools:` and `allowedTools:`. A former name is read as the
 * key it is now (`readKeys`), in step files and agent files alike; `wf start` says which files still use one (`formerKeyLine`); nothing
 * writes one (`renderStep`, `renderAgent`); and a run record whose steps hold the former fields is read under the current ones
 * (`asNamed`). A key renamed adds its line here, and `asNamed` carries it.
 */
export const FORMER_KEYS: Readonly<Record<string, StepKey & RoleKey>> = { disallow: 'disallowedTools', allow: 'allowedTools' };

/**
 * A step's or an agent's lines with a codex `permissionMode:` read as the `sandbox:` it names — `bypassPermissions`, which the engine takes for
 * the widest sandbox, as `danger-full-access` — for a step or agent that runs on `harness`. So a folder, or an agent, that names a codex
 * sandbox under the former key still loads, and `wf start` names the line to rename (`codexModeLine`). Refused when `sandbox:` is written beside it: on
 * codex the two are one key. A word that is no sandbox is left where it is, for `wordOf` to refuse in words naming `sandbox:`. Pure.
 */
export function codexSandboxNamed<K extends string>(
  file: string,
  meta: Partial<Record<K | 'permissionMode' | 'sandbox', string>>,
  harness: string | undefined,
): Partial<Record<K | 'permissionMode' | 'sandbox', string>> {
  const word = meta.permissionMode;
  if (harness !== 'codex' || word === undefined) return meta;
  if (meta.sandbox !== undefined) {
    refuse(
      `${file}: \`permissionMode: ${word}\` and \`sandbox: ${meta.sandbox}\` are both set, and on codex they are one key: \`permissionMode:\` is the former name of a codex step's sandbox, and \`sandbox:\` is Codex's own name for it. Keep the \`sandbox:\` line and delete the other.`,
    );
  }
  const sandbox = sandboxNamed(word);
  if (!SANDBOXES.codex.includes(sandbox)) return meta;
  const { permissionMode: _, ...rest } = meta;
  return { ...rest, sandbox } as Partial<Record<K | 'permissionMode' | 'sandbox', string>>;
}

/** The sandbox a codex permission mode named: itself, or `danger-full-access` for `bypassPermissions`, the engine's alias for it. */
const sandboxNamed = (word: string): string => (word === 'bypassPermissions' ? 'danger-full-access' : word);

/**
 * The sandbox a codex file's former `permissionMode: <word>` is read as, or `undefined` for a word that names none, which the parser
 * refuses. For code outside the package that reads a file's lines the parser did not read — the api's picture of an agent
 * that does not load — so it reads the former line as the parser would. Pure.
 */
export const formerSandbox = (word: string): string | undefined => {
  const sandbox = sandboxNamed(word);
  return SANDBOXES.codex.includes(sandbox) ? sandbox : undefined;
};

/**
 * The fence a step asks its harness for: the engine's task calls both `permissionMode`, Claude Code's permission mode and Codex's sandbox,
 * and a step has at most one of the two (`wordOf`). What the tick files as `config.permissionMode`. Pure.
 */
export const modeOf = (step: Pick<Workflow, 'permissionMode' | 'sandbox'>): string | undefined => step.sandbox ?? step.permissionMode;

/** The name a key was written under, for a key read under a former one (`FORMER_KEYS`), by the key it is now. */
export type Spelled = Partial<Record<string, string>>;

/** The key a frontmatter line names: its own, or the one its former name is now (`FORMER_KEYS`). */
const keyNamed = (written: string): string => (Object.hasOwn(FORMER_KEYS, written) ? FORMER_KEYS[written] : written);

/**
 * The frontmatter as key → value: every line a key `refusal` does not refuse — a key a step has, or an agent — set once, to something. A line
 * under a key's former name (`FORMER_KEYS`) is read as the key, and `spelled` says under which name, so a refusal quotes the line as written.
 * Blank lines and lines opening on `#`, the comment character, are skipped. A key set twice, under either name, is refused rather than
 * last-one-wins: both values are something the author meant, and a step would wait on half of what it was written to wait on.
 */
export function readKeys<K extends string>(
  step: string,
  block: string,
  refusal: (key: string) => string | undefined,
): { meta: Partial<Record<K, string>>; spelled: Spelled } {
  const meta: Partial<Record<K, string>> = {};
  const spelled: Spelled = {};
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i <= 0) {
      refuse(
        `${step}: \`${line}\` is not \`key: value\`. Each frontmatter line is a key, a colon and its value, and a list stays on one line: \`after: a, b\`.`,
      );
    }
    const written = line.slice(0, i).trim();
    const key = keyNamed(written);
    const value = line.slice(i + 1).trim();

    const refused = refusal(key);
    if (refused !== undefined) refuse(refused);
    if (Object.hasOwn(meta, key)) {
      const first = spelled[key] ?? key;
      if (first !== written) {
        refuse(
          `${step}: \`${key}\` is set twice, as \`${first}:\` and as \`${written}:\` — \`${first === key ? written : first}:\` is its former name, and reads as \`${key}:\`. Keep the \`${key}:\` line and delete the other.`,
        );
      }
      refuse(
        `${step}: \`${written}\` is set twice, and a step that says two things says nothing. Keep one line${key === 'after' ? ' and list every step on it: `after: a, b`' : ''}.`,
      );
    }
    if (!value) {
      refuse(
        key === 'check'
          ? `${step}: \`check\` has no value. Give the command that must exit 0 in the step's workspace — \`check: npm test\` — or delete the line, and the step runs no check.`
          : key === 'tools'
            ? `${step}: \`tools\` has no value, which reads as every tool to one person and as none to another. Name the tools the session may have — ${TOOLS_EXAMPLE} — or delete the line, and the step has the harness's own set.`
            : key === 'disallowedTools'
              ? `${step}: \`${written}\` has no value, which denies nothing and reads as a fence. Name what the session may not have — ${DISALLOW_EXAMPLE} — or delete the line, and the step is denied nothing beyond the checkout's settings.`
              : key === 'allowedTools'
                ? `${step}: \`${written}\` has no value, which allows nothing and reads as a permission. Name what the session may do without being asked — ${ALLOW_EXAMPLE} — or delete the line, and the step may do only what its \`permissionMode\` allows by itself.`
                : key === 'budget'
                  ? `${step}: \`budget\` has no value, which reads as no cap to one person and as nothing to spend to another. Give the most the step's tries may cost together, in dollars — ${BUDGET_EXAMPLE} — or delete the line, and the step has no budget.`
                  : `${step}: \`${key}\` has no value. Delete the line rather than leaving it blank — an empty key is not the same as an absent one.`,
      );
    }
    meta[key as K] = value;
    if (written !== key) spelled[key] = written;
  }
  return { meta, spelled };
}

/**
 * The value a file's frontmatter gives `key`, read as the parser reads it — each line trimmed, the key trimmed before its colon — or
 * `undefined` for a file with no such line, or whose frontmatter never closes (the parser refuses it). `agent : coder` names `coder`.
 */
export function frontmatterKey(text: string, key: string): string | undefined {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return undefined;
  }
  for (const raw of (block ?? '').split('\n')) {
    const line = raw.trim();
    const i = line.indexOf(':');
    if (line.startsWith('#') || i <= 0 || line.slice(0, i).trim() !== key) continue;
    return line.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

/** The former key names (`FORMER_KEYS`) a file's frontmatter still uses, in the order it uses them — none for a file whose frontmatter never closes. */
export function formerKeysIn(text: string): string[] {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return [];
  }
  return (block ?? '').split('\n').flatMap((raw) => {
    const line = raw.trim();
    const i = line.indexOf(':');
    const key = i > 0 && !line.startsWith('#') ? line.slice(0, i).trim() : '';
    return Object.hasOwn(FORMER_KEYS, key) ? [key] : [];
  });
}

/**
 * Why a former name is not written: read from a file, it is never put in one (`renderStep`, `renderAgent`). What sends one is a stale form
 * — a board page drawn when the key had its former name — and its save is refused rather than written under a name the file would then
 * carry on.
 */
export const formerKeyWritten = (file: string, former: string): string =>
  `${file}: \`${former}\` is \`${FORMER_KEYS[former]}\`'s former name, which a file may still say but nothing writes. Send \`${FORMER_KEYS[former]}\` — a page that sends the former name is stale: reload it, and save again.`;

/**
 * Why a codex `permissionMode` that names a sandbox (`formerSandbox`) is not written, as `formerKeyWritten` says of a former name: read from a
 * file, it is `sandbox:` on the step (`codexSandboxNamed`), and nothing puts it in one — `renderStep`, `renderAgent`, and `writeWorkflow` for a
 * step whose harness is its agent's. What sends one is a stale form that still names a codex sandbox as `permissionMode`, or a step moved onto
 * codex that kept its Claude Code mode, `bypassPermissions`. Any other word is no sandbox, written as given, and refused by the parser in words naming `sandbox:`.
 */
export const codexModeWritten = (file: string, word: string): string =>
  `${file}: \`permissionMode: ${word}\` on a step that runs on codex is the former name of \`sandbox:\` there, which a file may still say but nothing writes. Send \`sandbox: ${sandboxNamed(word)}\` instead: a page that sends the former name is stale — reload it, and save again; and a step moved onto codex from Claude Code keeps its permission mode — clear it, and set the sandbox.`;

/** What `wf start` says of a file whose codex step or agent still names its sandbox as `permissionMode:`. The one writer of it. */
export const codexModeLine = (file: string, word: string): string =>
  `${file}: \`permissionMode: ${word}\` is read as \`sandbox: ${sandboxNamed(word)}\`, Codex's own name for its sandbox. The former line is still read; rename it, or save the file from the board, which writes \`sandbox:\`.`;

/** What `wf start` says of a file that still writes a key under its former name: that it is still read, as what, and what to write. The one writer of it. */
export const formerKeyLine = (file: string, former: string): string =>
  `${file}: \`${former}:\` is read as \`${FORMER_KEYS[former]}:\`, Claude Code's name for it. The former name is still read; rename the line, or save the file from the board, which writes the new name.`;

/** A step as a record holds it: a `Workflow` whose agent's `keys` may still name a key by its former name (`FORMER_KEYS`). */
export type FrozenStep = Omit<Workflow, 'agent'> & { agent?: Omit<StepAgent, 'keys'> & { keys: string[] } };

/** Whether a frozen step names no key by a former name (`FORMER_KEYS`): on its fields, in its agent's `keys` or in its agent's `given`. */
function isNamed(step: FrozenStep): step is Workflow {
  return [...Object.keys(step), ...(step.agent?.keys ?? []), ...Object.keys(step.agent?.given ?? {})].every((key) => keyNamed(key) === key);
}

/** A step's fields, or its agent's `given`, under the names their keys have now (`FORMER_KEYS`): a field under both keeps the new one's. */
function renamedFields(fields: object) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => keyNamed(key) === key || !Object.hasOwn(fields, keyNamed(key)))
      .map(([key, value]) => [keyNamed(key), value]),
  );
}

/**
 * A step read back off a record under the names its keys have now (`FORMER_KEYS`). A run frozen under a key's former name holds the step's
 * field under it, and the former name among its agent's `keys` and `given`: read so, the tick would hand the engine no
 * `allowedTools` and the step would run unfenced, with nothing said. Read by `readRun`, so no reader — the tick, `wf ls`, the api — ever sees
 * a former name, and the next pass that writes the record back writes the new ones alone. A field under both names keeps the new one's
 * value. A step with no former name is returned as it is. Pure.
 */
export function asNamed(step: FrozenStep): Workflow {
  if (isNamed(step)) return step;
  const renamed = renamedFields(step) as Workflow;
  if (!step.agent) return renamed;
  const { keys, given } = step.agent;
  const agent = { ...step.agent, keys: [...new Set(keys.map((key) => keyNamed(key) as StepKey))], given: renamedFields(given) };
  return { ...renamed, agent };
}
