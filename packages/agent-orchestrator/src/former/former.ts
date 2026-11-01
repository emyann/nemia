/**
 * The names a key had before it was renamed, and every place one is still read or written back: `FORMER_KEYS`, the frontmatter read under
 * either name (`readKeys`), a line written in the form the file has (`formerKeyWritten`, `codexModeWritten`), a Codex sandbox named by
 * `permissionMode:` (`codexSandboxNamed`, `formerSandbox`), `workspace: folder` read as `place: folder` (`placeSpelled`), `workspace: main`
 * read as `workspace: base` (`baseSpelled`), the fence a step asks for under either key (`modeOf`), an agent's own key renamed and its
 * words (`FORMER_OWN_KEYS`, `harnessPromptNamed`), and a step frozen on a run record under an old name (`asNamed`).
 */
import { LIST_KEYS, refuse, splitFrontmatter, type StepAgent, type StepKey, type Workflow } from '../step/step.ts';
import {
  flatValue,
  frontmatterOrNull,
  readFrontmatter,
  withKey,
  type FrontmatterEntry,
  type FrontmatterValue,
} from '../frontmatter/frontmatter.ts';
import { ALLOW_EXAMPLE, BUDGET_EXAMPLE, DISALLOW_EXAMPLE, TOOLS_EXAMPLE } from '../keys/index.ts';
import type { AgentOwnKey, HarnessPrompt, RoleKey } from '../agents/agents.ts';
import { DEFAULT_HARNESS, fenceKeysOf, HARNESS_FENCE_KEYS } from '../harness/harness.ts';
import { HARNESS_KNOBS } from 'agent-runtime/vocabulary';

/**
 * The fence keys a file once wrote at the top level, each now under its harness's block: `permissionMode:`, `tools:`, `allowedTools:` and
 * `disallowedTools:` under the default harness's block, `<harness>: { fence: … }`, and `sandbox:` under the sandboxed one's
 * (`fenceKeysOf`). A top-level line is still read as the key in the block of the file's harness (`readKeys`); `nemia start` names each
 * file that writes one (`formerFenceLine`), and `nemia frontmatter rewrite` moves it (`fenceMoved`). Nothing writes one: `renderStep` and
 * `renderAgent` write the block (`fencedPairs`).
 */
export const FORMER_FENCE_KEYS: readonly string[] = HARNESS_FENCE_KEYS;

/** Whether `key` names a harness, whose block a file's frontmatter may hold. */
export const isHarnessBlock = (key: string): boolean => fenceKeysOf(key) !== undefined;

/** The harness block a frontmatter holds, `<harness>: { fence: … }`: the harness, the line it opens on and the fence keys it sets. */
export type FenceBlock = { harness: string; line: number; keys: string[] };

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
  (Object.hasOwn(FORMER_HARNESS_PROMPTS, word) ? FORMER_HARNESS_PROMPTS[word] : undefined) ?? word;

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
 * beside it: the two say one thing, and the file keeps one line. `workspace: main` is the key's own former word, read as `base`
 * (`baseSpelled`). Pure.
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

/**
 * A step's lines with `workspace: main` read as `workspace: base`, the word for a step that works on the base branch in the repository's
 * own checkout: so a folder that says the former line still loads, its step says `base`, and `nemia start` names the line to rename
 * (`baseLine`). One key holds both spellings, so the file cannot say the two at once. Pure.
 */
export function baseSpelled<K extends string>(meta: Partial<Record<K | 'workspace', string>>): Partial<Record<K | 'workspace', string>> {
  if (meta.workspace !== 'main') return meta;
  return { ...meta, workspace: 'base' };
}

/** What `nemia start` says of a step file that still says `workspace: main` (`baseSpelled`). The one writer of it. */
export const baseLine = (file: string): string =>
  `${file}: \`workspace: main\` is read as \`workspace: base\`, a step that works on the base branch in the repository's own checkout. The former line is still read; rename it, or save the file from the board, which writes \`workspace: base\`.`;

/** Why `workspace: main` is not written, as `formerKeyWritten` says of a former name: what sends one is a stale form. */
export const baseWritten = (file: string): string =>
  `${file}: \`workspace: main\` is the former spelling of \`workspace: base\`, which a file may still say but nothing writes. Send \`workspace: base\` — a page that sends the former spelling is stale: reload it, and save again.`;

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
const keyNamed = (written: string): string => (Object.hasOwn(FORMER_KEYS, written) ? FORMER_KEYS[written] : undefined) ?? written;

/**
 * The frontmatter as key → value: every key a key `refusal` does not refuse — a key a step has, or an agent — set once, to something. The
 * block is read as YAML, or in the former line form (`readFrontmatter`), which refuses a block in neither; a list on a key that holds one
 * (`LIST_KEYS`) reads as the comma string, `tools: [Read, Grep]` as `Read, Grep`, and a list on any other key is refused (`flatValue`). A
 * key under its former name (`FORMER_KEYS`) is read as the key, and `spelled` says under which name, so a refusal quotes the line as
 * written. A key set twice, under either name, is refused rather than last-one-wins: both values are something the author meant, and a
 * step would wait on half of what it was written to wait on.
 *
 * A harness's block, `<harness>: { fence: { permissionMode: <mode>, tools: [Read] } }`, is read into the same keys, each a key of that
 * harness's fence (`fenceKeysOf`), and handed back as `block`: whether it is the file's harness is the caller's to judge
 * (`fenceBlockRefusal`). A fence key at the top level is its former spelling (`FORMER_FENCE_KEYS`), still read; one written both ways is
 * refused, naming both. A block holding anything but `fence`, a fence key the harness does not take, and two blocks are refused.
 */
export function readKeys<K extends string>(
  step: string,
  block: string,
  refusal: (key: string) => string | undefined,
): { meta: Partial<Record<K, string>>; spelled: Spelled; block?: FenceBlock } {
  const meta: Partial<Record<K, string>> = {};
  const spelled: Spelled = {};
  let fenced: FenceBlock | undefined;
  const set = (entry: FrontmatterEntry, written: string, inBlock: string | undefined) => {
    const key = keyNamed(written);
    const refused = refusal(key);
    if (refused !== undefined) refuse(refused);
    if (Object.hasOwn(meta, key)) {
      const first = spelled[key] ?? key;
      const blocked = inBlock ?? (fenced?.keys.includes(key) ? fenced.harness : undefined);
      if (blocked !== undefined) refuse(bothSpellings(step, key, blocked));
      if (first !== written) {
        refuse(
          `${step}: \`${key}\` is set twice, as \`${first}:\` and as \`${written}:\` — \`${first === key ? written : first}:\` is its former name, and reads as \`${key}:\`. Keep the \`${key}:\` line and delete the other.`,
        );
      }
      refuse(
        `${step}: \`${written}\` is set twice, and a step that says two things says nothing. Keep one line${key === 'after' ? ' and list every step on it: `after: a, b`' : ''}.`,
      );
    }
    const value = flatValue(step, { ...entry, key }, LIST_KEYS.includes(key));
    if (!value) refuse(noValue(step, key, written));
    meta[key as K] = value;
    if (written !== key) spelled[key] = written;
    if (inBlock !== undefined) fenced?.keys.push(key);
  };
  for (const entry of readFrontmatter(step, block).entries) {
    if (!isBlockEntry(entry)) {
      set(entry, entry.key, undefined);
      continue;
    }
    if (fenced !== undefined) refuse(twoBlocks(step, fenced.harness, entry.key));
    fenced = { harness: entry.key, line: entry.line, keys: [] };
    for (const [key, value] of blockFence(step, entry)) set({ key, value, line: entry.line }, key, entry.key);
  }
  return { meta, spelled, ...(fenced && { block: fenced }) };
}

/** Refused: a fence key written both at the top level, its former spelling, and under its harness's block. */
const bothSpellings = (step: string, key: string, harness: string): string =>
  `${step}: \`${key}\` is set twice, at the top level and under \`${harness}: { fence: … }\` — the top-level line is its former spelling, and reads as the block's. Keep the block's and delete the other line: nemia frontmatter rewrite <folder> moves a top-level fence key into its block.`;

/** Whether a frontmatter entry is a harness's block: a key naming a harness, holding a map. */
const isBlockEntry = (entry: FrontmatterEntry): boolean =>
  isHarnessBlock(entry.key) && typeof entry.value === 'object' && !Array.isArray(entry.value);

/**
 * The fence keys and values a harness's block `entry` holds, or refused: a key of the block other than `fence`, a `fence` that is not a
 * map, and a key the harness's fence does not take (`fenceKeysOf`).
 */
function blockFence(step: string, entry: FrontmatterEntry): Array<[string, FrontmatterValue]> {
  const harness = entry.key;
  const map = entry.value as Readonly<Record<string, FrontmatterValue>>;
  const other = Object.keys(map).find((key) => key !== 'fence');
  if (other !== undefined) refuse(blockKeyRefused(step, harness, other));
  const fence = map.fence;
  if (fence === undefined) return [];
  const takes = fenceKeysOf(harness);
  if (takes === undefined)
    refuse(`${step}: \`${harness}:\` names no harness, so its block holds no fence: delete the block, or name a harness`);
  if (typeof fence !== 'object' || Array.isArray(fence)) refuse(fenceNotMap(step, harness, takes));
  const keys = Object.entries(fence as Readonly<Record<string, FrontmatterValue>>);
  const untaken = keys.find(([key]) => !takes.includes(key));
  if (untaken !== undefined) refuse(fenceKeyRefused(step, harness, untaken[0], takes));
  return keys;
}

/** Refused: two harness blocks in one file, which runs on one harness. */
const twoBlocks = (file: string, first: string, second: string): string =>
  `${file}: \`${first}:\` and \`${second}:\` are both set, and a file runs on one harness, whose block holds its fence. Keep the block of the harness it runs on — its \`harness:\` line, \`${DEFAULT_HARNESS}\` without one — and delete the other.`;

/** Refused: a key under a harness's block other than `fence`. */
const blockKeyRefused = (file: string, harness: string, key: string): string =>
  `${file}: \`${harness}: { ${key}: … }\` — a harness's block in a step or agent file holds its \`fence\` alone. Write \`${key}:\` at the top level, or delete it.`;

/** Refused: a harness's `fence` that is not a map of its keys. */
const fenceNotMap = (file: string, harness: string, takes: readonly string[]): string =>
  `${file}: \`${harness}: { fence: … }\` is a map of the harness's fence keys — ${takes.join(', ')} — each on a line of its own, indented under \`fence:\`.`;

/** Refused: a key in a harness's fence that the harness does not take. */
const fenceKeyRefused = (file: string, harness: string, key: string, takes: readonly string[]): string =>
  `${file}: \`${harness}: { fence: { ${key}: … } }\` — ${harness}'s fence takes ${takes.map((k) => `\`${k}\``).join(', ')}, and not \`${key}\`. Correct the key, or move it into the block of the harness that takes it.`;

/**
 * Why a file's harness block (`readKeys`) is refused, or `undefined` when it is the block of `harness`, the harness the file runs on — its
 * own `harness:` line, its agent's, or the default. A block for another harness would fence a session that never starts.
 */
export function fenceBlockRefusal(file: string, block: FenceBlock | undefined, harness: string): string | undefined {
  if (block === undefined || block.harness === harness) return undefined;
  const takes = fenceKeysOf(harness);
  return `${file}:${block.line}: \`${block.harness}: { fence: … }\` fences a session on ${block.harness}, and this file runs on ${harness}. Name the block \`${harness}:\` with ${harness}'s fence keys${takes ? ` (${takes.join(', ')})` : ''}, or set \`harness: ${block.harness}\`.`;
}

/**
 * Refuses a file's harness block that is not the block of the harness it runs on (`fenceBlockRefusal`): the first of `harnesses` given —
 * its own `harness:` line, its agent's — else the default.
 */
export function refuseFenceBlock(file: string, block: FenceBlock | undefined, ...harnesses: Array<string | undefined>): void {
  const runsOn = harnesses.map((harness) => harness?.trim()).find(Boolean) ?? DEFAULT_HARNESS;
  const why = fenceBlockRefusal(file, block, runsOn);
  if (why !== undefined) refuse(why);
}

/**
 * Pairs a writer hands `renderFrontmatter`, with each fence key (`FORMER_FENCE_KEYS`) moved under the block of the harness whose fence
 * takes it (`fenceKeysOf`) — `permissionMode` and the tool lists under one harness's, `sandbox` under the other's — written where the
 * first of them was: `[harness, { fence: { … } }]`. Each value is as the pair had it. What `renderStep` and `renderAgent` write. Where the
 * file says the harness it runs on (`runsOn`), a key of another harness's fence is left at the top level, so the parser refuses it in the
 * words of the key's reader, which name the draft's own line, rather than a block the person never wrote.
 */
export function fencedPairs(
  pairs: ReadonlyArray<readonly [string, FrontmatterValue]>,
  runsOn?: string,
): Array<readonly [string, FrontmatterValue]> {
  const blocks = new Map<string, Record<string, FrontmatterValue>>();
  const out: Array<readonly [string, FrontmatterValue]> = [];
  for (const [key, value] of pairs) {
    const harness = FORMER_FENCE_KEYS.includes(key) ? harnessTaking(key) : undefined;
    if (harness === undefined || (runsOn !== undefined && fenceKeysOf(runsOn) !== undefined && harness !== runsOn)) {
      out.push([key, value]);
      continue;
    }
    let fence = blocks.get(harness);
    if (fence === undefined) {
      fence = {};
      blocks.set(harness, fence);
      out.push([harness, { fence }]);
    }
    fence[key] = value;
  }
  return out;
}

/** The harness whose fence takes key `key` (`fenceKeysOf`): each fence key is one harness's. */
const harnessTaking = (key: string): string | undefined =>
  Object.keys(HARNESS_KNOBS).find((harness) => fenceKeysOf(harness)?.includes(key));

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
 * (the parser refuses it). A fence key (`FORMER_FENCE_KEYS`) is read under a harness's block, `<harness>: { fence: … }`, where the top
 * level has none, unless `top` asks for the top-level line alone. Never throws: for a listing, which names what a file says before the
 * parser judges it. `agent : coder` names `coder`.
 */
export function frontmatterKey(text: string, key: string, top = false): string | undefined {
  const entries = frontmatterOf(text)?.entries ?? [];
  const found = entries.find((entry) => entry.key === key)?.value;
  const value =
    found !== undefined || top || !FORMER_FENCE_KEYS.includes(key)
      ? found
      : entries.flatMap((entry) => (isHarnessBlock(entry.key) ? [fenceOfBlock(entry.value)?.[key]] : [])).find((v) => v !== undefined);
  if (typeof value === 'string') return value || undefined;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(', ') || undefined;
  return undefined;
}

/** The fence map a harness block's value holds, or `undefined` for one that holds none. */
const fenceOfBlock = (value: FrontmatterValue): Readonly<Record<string, FrontmatterValue>> | undefined => {
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const fence = (value as Readonly<Record<string, FrontmatterValue>>).fence;
  return typeof fence === 'object' && !Array.isArray(fence) ? (fence as Readonly<Record<string, FrontmatterValue>>) : undefined;
};

/** The fence keys a file's frontmatter still writes at the top level (`FORMER_FENCE_KEYS`), in the order it writes them. */
export function formerFenceIn(text: string): string[] {
  return (frontmatterOf(text)?.entries ?? []).flatMap(({ key }) => (FORMER_FENCE_KEYS.includes(key) ? [key] : []));
}

/** What `nemia start` says of a file that still writes fence key `key` at the top level (`formerFenceIn`). The one writer of it. */
export const formerFenceLine = (file: string, key: string): string =>
  `${file}: \`${key}:\` at the top level is read as the fence of the file's harness, \`<harness>: { fence: { ${key}: … } }\`. The former line is still read; move it into the block: nemia frontmatter rewrite <folder>, or save the file from the board.`;

/**
 * What `nemia start` says of an agent file with no `overridable:` line, whose steps may override everything a step may change of its agent
 * (`offerRefusal`). The one writer of it.
 */
export const overridableLine = (file: string): string =>
  `${file}: no \`overridable:\` line, so a step may override every key it takes from this agent, its fence narrowed, skills and MCP servers added. Say what a step may override — \`overridable: [model, fence, skills]\` — and a step that writes anything else is refused at load.`;

/**
 * The block a top-level fence key moves into: the harness whose fence takes it (`harnessTaking`), and for the mode key one harness takes
 * and another reads as its former spelling (`codexSandboxNamed`), the harness the file runs on, whose own mode key it becomes. Undefined
 * for that key where the file's harness is not known: it stays where it is.
 */
function movedTo(
  key: string,
  value: FrontmatterValue,
  harness: string | undefined,
): { block: string; key: string; value: FrontmatterValue } | undefined {
  if (key !== 'permissionMode') {
    const block = harnessTaking(key);
    return block === undefined ? undefined : { block, key, value };
  }
  const takes = harness === undefined ? undefined : fenceKeysOf(harness);
  if (harness === undefined || takes === undefined) return undefined;
  if (takes[0] !== 'sandbox') return { block: harness, key, value };
  return { block: harness, key: 'sandbox', value: typeof value === 'string' ? sandboxNamed(value) : value };
}

/**
 * A file's text with each top-level fence key (`FORMER_FENCE_KEYS`) moved into the block of the harness whose fence takes it (`movedTo`),
 * every value as it was, and `changed`; `kept`, the keys left at the top level because the harness they belong to is not known — the
 * mode key two harnesses read, where `harness` is undefined. A file whose fence is already in its block is returned as it is. What
 * `nemia frontmatter rewrite` writes after the line form. Refused where the block cannot be written so it reads back the same.
 */
export function fenceMoved(name: string, text: string, harness: string | undefined): { text: string; changed: boolean; kept: string[] } {
  const { block } = splitFrontmatter(name, text);
  if (block === null) return { text, changed: false, kept: [] };
  const read = readFrontmatter(name, block);
  const top = read.entries.filter(({ key }) => FORMER_FENCE_KEYS.includes(key));
  if (read.former || !top.length) return { text, changed: false, kept: [] };
  const fences = new Map<string, Record<string, FrontmatterValue>>();
  for (const entry of read.entries.filter(({ key }) => isHarnessBlock(key))) fences.set(entry.key, { ...fenceOfBlock(entry.value) });
  const kept: string[] = [];
  const touched = new Set<string>();
  let moved = block;
  for (const { key, value } of top) {
    const to = movedTo(key, value, harness);
    if (to === undefined) {
      kept.push(key);
      continue;
    }
    fences.set(to.block, { ...fences.get(to.block), [to.key]: to.value });
    touched.add(to.block);
    moved = withKey(name, moved, key, undefined);
  }
  if (moved === block) return { text, changed: false, kept };
  for (const at of touched) {
    const fence = fences.get(at);
    if (fence !== undefined) moved = withKey(name, moved, at, { fence });
  }
  const open = text.indexOf(block);
  return { text: `${text.slice(0, open)}${moved}${text.slice(open + block.length)}`, changed: true, kept };
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
const renamed = (former: string): string | undefined => FORMER_KEYS[former] ?? FORMER_OWN_KEYS[former];

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
 * 'folder'` (`placeSpelled`), and whose ending may still say `workspace: 'main'` (`baseSpelled`).
 */
export type FrozenStep = Omit<Workflow, 'agent' | 'workspace'> & {
  workspace?: 'main' | 'base' | 'folder';
  agent?: Omit<StepAgent, 'keys'> & { keys: string[]; systemPrompt?: string };
};

/**
 * Whether a frozen step names no key by a former name (`FORMER_KEYS`): on its fields, in its agent's `keys` or in its agent's `given`; and
 * its agent holds no former `systemPrompt` (`FORMER_OWN_KEYS`); and it says no `workspace: 'folder'` or `workspace: 'main'`, there or
 * in its agent's `given`.
 */
function isNamed(step: FrozenStep): step is Workflow {
  if (step.agent && Object.hasOwn(step.agent, 'systemPrompt')) return false;
  if (isFormerWorkspace(step.workspace) || isFormerWorkspace(step.agent?.given?.workspace)) return false;
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

/** Whether a frozen `workspace` is a former spelling: `folder`, now `place: 'folder'`, or `main`, now `base`. */
const isFormerWorkspace = (workspace: unknown): boolean => workspace === 'folder' || workspace === 'main';

/**
 * A step's fields, or its agent's `given`, under the names their keys have now (`FORMER_KEYS`), a `workspace: 'folder'` as `place:
 * 'folder'` (`placeSpelled`) and a `workspace: 'main'` as `workspace: 'base'` (`baseSpelled`): a field under both keeps the new one's.
 */
function renamedFields(fields: object) {
  const renamed = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => keyNamed(key) === key || !Object.hasOwn(fields, keyNamed(key)))
      .map(([key, value]) => [keyNamed(key), value]),
  );
  if (renamed.workspace === 'main') return { ...renamed, workspace: 'base' };
  if (renamed.workspace !== 'folder') return renamed;
  const { workspace: _, ...rest } = renamed;
  return { place: 'folder', ...rest };
}

/**
 * A step read back off a record under the names its keys have now (`FORMER_KEYS`). A run frozen under a key's former name holds the step's
 * field under it, and the former name among its agent's `keys` and `given`: read so, the tick would hand the engine no `allowedTools` and
 * the step would run unfenced, with nothing said; and its agent's harness prompt as `systemPrompt`, in a former word (`FORMER_OWN_KEYS`):
 * read so, `own` would be filed appended to Claude Code's prompt instead of in its place; and its place as `workspace: 'folder'`, which is
 * `place: 'folder'` now, and its agent's `keys` naming `workspace` for it; and its ending as `workspace: 'main'`, which is `workspace:
 * 'base'` now, so the run would end on no step (`endsOnBase`). Read by `readRun`, so no reader — the tick, `nemia ls`, the api — ever sees
 * a former name, and the next pass that writes the record back writes the new ones alone. A field under both names keeps the new one's
 * value. A step with no former name is returned as it is. Pure.
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
