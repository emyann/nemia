/**
 * The names a key had before it was renamed, and every place one is still read or written back: `FORMER_KEYS`, the frontmatter read under
 * either name (`readKeys`), a line written in the form the file has (`formerKeyWritten`, `codexModeWritten`), a Codex sandbox named by
 * `permissionMode:` (`codexSandboxNamed`, `formerSandbox`), `workspace: folder` read as `place: folder` (`placeSpelled`), the fence a step
 * asks for under either key (`modeOf`), an agent's own key renamed and its words (`FORMER_OWN_KEYS`, `harnessPromptNamed`), and a step
 * frozen on a run record under an old name (`asNamed`).
 */
import { LIST_KEYS, refuse, splitFrontmatter, type StepAgent, type StepKey, type Workflow } from '../step/step.ts';
import { flatValue, frontmatterOrNull, readFrontmatter, type FrontmatterEntry } from '../frontmatter/frontmatter.ts';
import { ALLOW_EXAMPLE, BUDGET_EXAMPLE, DISALLOW_EXAMPLE, TOOLS_EXAMPLE } from '../keys/index.ts';
import type { AgentOwnKey, HarnessPrompt, RoleKey } from '../agents/agents.ts';

/**
 * A key's former name, and the name it has now: `disallow:` and `allow:` are the former names of `disallowedTools:` and `allowedTools:`,
 * Claude Code's `--disallowedTools` and `--allowedTools` — a subagent's `disallowedTools:` and `allowedTools:`. A former name is read as
 * the key it is now (`readKeys`), in step files and agent files alike; `nemia start` says which files still use one (`formerKeyLine`);
 * nothing writes one (`renderStep`, `renderAgent`); and a run record whose steps hold the former fields is read under the current ones
 * (`asNamed`). A key renamed adds its line here, and `asNamed` carries it.
 */
export const FORMER_KEYS: Readonly<Record<string, StepKey & RoleKey>> = { disallow: 'disallowedTools', allow: 'allowedTools' };

/**
 * An agent's own key's former name, and the name it has now: `systemPrompt:` is the former name of `harnessPrompt:`, what becomes of
 * Claude Code's own prompt. No step has the key, so it is not one of `FORMER_KEYS`: `parseAgent` reads either line, its words through
 * `harnessPromptNamed`; `nemia start` names a file still using it (`harnessPromptLine`); nothing writes it (`renderAgent`, the api); and a
 * run record whose agents hold the former field is read under the new one (`asNamed`).
 */
export const FORMER_OWN_KEYS: Readonly<Record<string, AgentOwnKey>> = { systemPrompt: 'harnessPrompt' };

/** The former words of `systemPrompt:`, each the word `harnessPrompt:` says now; `no-coding` kept its name. */
export const FORMER_HARNESS_PROMPTS: Readonly<Record<string, HarnessPrompt>> = { default: 'keep', own: 'replace' };

/**
 * The word a former `systemPrompt:` line says under `harnessPrompt:` (`FORMER_HARNESS_PROMPTS`): `default` is `keep`, `own` is
 * `replace`, any other word is itself, for the reader to judge. For code outside the package that reads a former line the parser did
 * not, as the api's picture of an agent that does not load. Pure.
 */
export const harnessPromptNamed = (word: string): string =>
  Object.hasOwn(FORMER_HARNESS_PROMPTS, word) ? FORMER_HARNESS_PROMPTS[word] : word;

/**
 * A step's or an agent's lines with a codex `permissionMode:` read as the `sandbox:` it names — `bypassPermissions`, which the engine takes
 * for the widest sandbox, as `danger-full-access` — for a step or agent that runs on `harness`. So a folder, or an agent, that names a
 * codex sandbox under the former key still loads, and `nemia start` names the line to rename (`codexModeLine`). Refused when `sandbox:` is
 * written beside it: on codex the two are one key. Whether the word is a sandbox is the runtime's to say at `nemia start`. Pure.
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
  const { permissionMode: _, ...rest } = meta;
  return { ...rest, sandbox: sandboxNamed(word) } as Partial<Record<K | 'permissionMode' | 'sandbox', string>>;
}

/**
 * A step's lines with `workspace: folder` read as `place: folder`, the key where a step works now: so a folder that says the former line
 * still loads, its step's own keys say `place`, and `nemia start` names the line to rename (`placeLine`). Refused when `place:` is written
 * beside it: the two say one thing, and the file keeps one line. `workspace: main` is the key's own word, and is left as it is. Pure.
 */
export function placeSpelled<K extends string>(
  file: string,
  meta: Partial<Record<K | 'workspace' | 'place', string>>,
): Partial<Record<K | 'workspace' | 'place', string>> {
  if (meta.workspace !== 'folder') return meta;
  if (meta.place !== undefined) {
    refuse(
      `${file}: \`workspace: folder\` and \`place: ${meta.place}\` are both set, and they say one thing: \`workspace: folder\` is the former spelling of \`place: folder\`. Delete the \`workspace: folder\` line, and keep \`place:\`.`,
    );
  }
  const { workspace: _, ...rest } = meta;
  return { ...rest, place: 'folder' } as Partial<Record<K | 'workspace' | 'place', string>>;
}

/** What `nemia start` says of a step file that still says `workspace: folder` (`placeSpelled`). The one writer of it. */
export const placeLine = (file: string): string =>
  `${file}: \`workspace: folder\` is read as \`place: folder\`, where the step works. The former line is still read; rename it, or save the file from the board, which writes \`place:\`.`;

/** Why `workspace: folder` is not written, as `formerKeyWritten` says of a former name: what sends one is a stale form. */
export const placeWritten = (file: string): string =>
  `${file}: \`workspace: folder\` is the former spelling of \`place: folder\`, which a file may still say but nothing writes. Send \`place: folder\` — a page that sends the former spelling is stale: reload it, and save again.`;

/** The sandbox a codex permission mode named: itself, or `danger-full-access` for `bypassPermissions`, the engine's alias for it. */
const sandboxNamed = (word: string): string => (word === 'bypassPermissions' ? 'danger-full-access' : word);

/**
 * The sandbox a codex file's former `permissionMode: <word>` is read as. For code outside the package that reads a file's lines the
 * parser did not read — the api's picture of an agent that does not load — so it reads the former line as the parser would. Pure.
 */
export const formerSandbox = (word: string): string => sandboxNamed(word);

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
 * The frontmatter as key → value: every key a key `refusal` does not refuse — a key a step has, or an agent — set once, to something. The
 * block is read as YAML, or in the former line form (`readFrontmatter`), which refuses a block in neither; a list on a key that holds one
 * (`LIST_KEYS`) reads as the comma string, `tools: [Read, Grep]` as `Read, Grep`, and a list on any other key is refused (`flatValue`). A
 * key under its former name (`FORMER_KEYS`) is read as the key, and `spelled` says under which name, so a refusal quotes the line as
 * written. A key set twice, under either name, is refused rather than last-one-wins: both values are something the author meant, and a
 * step would wait on half of what it was written to wait on.
 */
export function readKeys<K extends string>(
  step: string,
  block: string,
  refusal: (key: string) => string | undefined,
): { meta: Partial<Record<K, string>>; spelled: Spelled } {
  const meta: Partial<Record<K, string>> = {};
  const spelled: Spelled = {};
  for (const entry of readFrontmatter(step, block).entries) {
    const written = entry.key;
    const key = keyNamed(written);
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
    const value = flatValue(step, entry, LIST_KEYS.includes(key));
    if (!value) refuse(noValue(step, key, written));
    meta[key as K] = value;
    if (written !== key) spelled[key] = written;
  }
  return { meta, spelled };
}

/** Why a key written with no value is refused, and what to write: the command, the tools or the dollars it takes, or the line deleted. */
const noValue = (step: string, key: string, written: string): string =>
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
            : `${step}: \`${key}\` has no value. Delete the line rather than leaving it blank — an empty key is not the same as an absent one.`;

/** A file's frontmatter as it reads (`readFrontmatter`), or null for a file with none, one that never closes, or one in neither form. */
function frontmatterOf(text: string): { entries: FrontmatterEntry[]; former: boolean } | null {
  try {
    const { block } = splitFrontmatter('', text);
    return block === null ? null : frontmatterOrNull(block);
  } catch {
    return null;
  }
}

/**
 * The value a file's frontmatter gives `key`, read as the parser reads it (`readFrontmatter`): its text, a list as the comma string — or
 * `undefined` for a file with no such key, an empty one, one that holds a map, or whose frontmatter never closes or reads in neither form
 * (the parser refuses it). Never throws: for a listing, which names what a file says before the parser judges it. `agent : coder` names
 * `coder`.
 */
export function frontmatterKey(text: string, key: string): string | undefined {
  const value = frontmatterOf(text)?.entries.find((entry) => entry.key === key)?.value;
  if (typeof value === 'string') return value || undefined;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(', ') || undefined;
  return undefined;
}

/**
 * The former key names (`FORMER_KEYS`) a file's frontmatter still uses, in the order it uses them — none for a file whose frontmatter never
 * closes, or reads in neither form.
 */
export function formerKeysIn(text: string): string[] {
  return (frontmatterOf(text)?.entries ?? []).flatMap(({ key }) => (Object.hasOwn(FORMER_KEYS, key) ? [key] : []));
}

/** Whether a file's frontmatter is read in the former line form (`readFrontmatter` marks it `former`): what `formerFormLine` names. */
export const inFormerForm = (text: string): boolean => frontmatterOf(text)?.former === true;

/**
 * Why a former name is not written: read from a file, it is never put in one (`renderStep`, `renderAgent`). What sends one is a stale form
 * — a board page drawn when the key had its former name — and its save is refused rather than written under a name the file would then
 * carry on.
 */
export const formerKeyWritten = (file: string, former: string): string =>
  `${file}: \`${former}\` is \`${renamed(former)}\`'s former name, which a file may still say but nothing writes. Send \`${renamed(former)}\` — a page that sends the former name is stale: reload it, and save again.`;

/** The key a former name is now, a step's (`FORMER_KEYS`) or an agent's own (`FORMER_OWN_KEYS`). */
const renamed = (former: string): string => FORMER_KEYS[former] ?? FORMER_OWN_KEYS[former];

/**
 * Why a codex `permissionMode` (`formerSandbox`) is not written, as `formerKeyWritten` says of a former name: read
 * from a file, it is `sandbox:` on the step (`codexSandboxNamed`), and nothing puts it in one — `renderStep`, `renderAgent`, and
 * `writeWorkflow` for a step whose harness is its agent's. What sends one is a stale form that still names a codex sandbox as
 * `permissionMode`, or a step moved onto codex that kept its Claude Code mode, which a file would read as its sandbox. It names no word for
 * the sandbox: which words are one is the runtime's to say at `nemia start`.
 */
export const codexModeWritten = (file: string, word: string): string =>
  `${file}: \`permissionMode: ${word}\` on a step that runs on codex is the former name of \`sandbox:\` there, which a file may still say but nothing writes. Send the sandbox as \`sandbox:\` instead: a page that sends the former name is stale — reload it, and save again; and a step moved onto codex from Claude Code keeps its permission mode — clear it, and set the sandbox.`;

/** What `nemia start` says of a file whose codex step or agent still names its sandbox as `permissionMode:`. The one writer of it. */
export const codexModeLine = (file: string, word: string): string =>
  `${file}: \`permissionMode: ${word}\` is read as \`sandbox: ${sandboxNamed(word)}\`, Codex's own name for its sandbox. The former line is still read; rename it, or save the file from the board, which writes \`sandbox:\`.`;

/**
 * What `nemia start` says of a file that still writes a key under its former name: that it is still read, as what, and what to write. The
 * one writer of it.
 */
export const formerKeyLine = (file: string, former: string): string =>
  `${file}: \`${former}:\` is read as \`${FORMER_KEYS[former]}:\`, Claude Code's name for it. The former name is still read; rename the line, or save the file from the board, which writes the new name.`;

/**
 * What `nemia start` says of a file whose frontmatter is still in the former line form (`inFormerForm`), `key: the rest of the line`,
 * never quoted: that it is still read, and the fix. The one writer of it.
 */
export const formerFormLine = (file: string): string =>
  `${file}: the frontmatter is in the former line form, \`key: the rest of the line\`, which is still read, and is not YAML. Rewrite it as YAML, every value the same: nemia frontmatter rewrite <folder>, or save the file from the board.`;

/**
 * What `nemia start` says of an agent file that still says `systemPrompt:` (`FORMER_OWN_KEYS`), and as what it is read. The one writer of
 * it.
 */
export const harnessPromptLine = (file: string, word: string): string =>
  `${file}: \`systemPrompt: ${word}\` is read as \`harnessPrompt: ${harnessPromptNamed(word)}\`, what becomes of Claude Code's own prompt. The former line is still read; rename it, or save the file from the board, which writes \`harnessPrompt:\`.`;

/**
 * A step as a record holds it: a `Workflow` whose agent's `keys` may still name a key by its former name (`FORMER_KEYS`), and whose agent
 * may still hold its harness prompt as `systemPrompt` (`FORMER_OWN_KEYS`), in a former word, and whose place may still be `workspace:
 * 'folder'` (`placeSpelled`).
 */
export type FrozenStep = Omit<Workflow, 'agent' | 'workspace'> & {
  workspace?: 'main' | 'folder';
  agent?: Omit<StepAgent, 'keys'> & { keys: string[]; systemPrompt?: string };
};

/**
 * Whether a frozen step names no key by a former name (`FORMER_KEYS`): on its fields, in its agent's `keys` or in its agent's `given`; and
 * its agent holds no former `systemPrompt` (`FORMER_OWN_KEYS`); and it says no `workspace: 'folder'`, there or in its agent's `given`.
 */
function isNamed(step: FrozenStep): step is Workflow {
  if (step.agent && Object.hasOwn(step.agent, 'systemPrompt')) return false;
  if (step.workspace === 'folder' || step.agent?.given?.workspace === 'folder') return false;
  return [...Object.keys(step), ...(step.agent?.keys ?? []), ...Object.keys(step.agent?.given ?? {})].every((key) => keyNamed(key) === key);
}

/**
 * A frozen agent's harness prompt under its name now: its former `systemPrompt`, in the word it is now (`harnessPromptNamed`), unless it
 * holds `harnessPrompt` too, which is kept.
 */
function harnessPromptAsNamed(agent: NonNullable<FrozenStep['agent']>): Omit<StepAgent, 'keys'> & { keys: string[] } {
  const { systemPrompt: former, ...rest } = agent;
  if (former === undefined || rest.harnessPrompt !== undefined) return rest;
  return { ...rest, harnessPrompt: harnessPromptNamed(former) as HarnessPrompt };
}

/**
 * A step's fields, or its agent's `given`, under the names their keys have now (`FORMER_KEYS`), and a `workspace: 'folder'` as `place:
 * 'folder'` (`placeSpelled`): a field under both keeps the new one's.
 */
function renamedFields(fields: object) {
  const renamed = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => keyNamed(key) === key || !Object.hasOwn(fields, keyNamed(key)))
      .map(([key, value]) => [keyNamed(key), value]),
  );
  if (renamed.workspace !== 'folder') return renamed;
  const { workspace: _, ...rest } = renamed;
  return { place: 'folder', ...rest };
}

/**
 * A step read back off a record under the names its keys have now (`FORMER_KEYS`). A run frozen under a key's former name holds the step's
 * field under it, and the former name among its agent's `keys` and `given`: read so, the tick would hand the engine no `allowedTools` and
 * the step would run unfenced, with nothing said; and its agent's harness prompt as `systemPrompt`, in a former word (`FORMER_OWN_KEYS`):
 * read so, `own` would be filed appended to Claude Code's prompt instead of in its place; and its place as `workspace: 'folder'`, which is
 * `place: 'folder'` now, and its agent's `keys` naming `workspace` for it. Read by `readRun`, so no reader — the tick,
 * `nemia ls`, the api — ever sees a former name, and the next pass that writes the record back writes the new ones alone. A field under
 * both names keeps the new one's value. A step with no former name is returned as it is. Pure.
 */
export function asNamed(step: FrozenStep): Workflow {
  if (isNamed(step)) return step;
  const fields = renamedFields(step) as Workflow;
  if (!step.agent) return fields;
  const { keys, given } = step.agent;
  const agent = {
    ...harnessPromptAsNamed(step.agent),
    keys: [...new Set(keys.map((key) => (key === 'workspace' && step.workspace === 'folder' ? 'place' : (keyNamed(key) as StepKey))))],
    given: renamedFields(given),
  };
  return { ...fields, agent };
}
