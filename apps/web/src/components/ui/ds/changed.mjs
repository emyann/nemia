#!/usr/bin/env node
/* =============================================================================
   Which kit files did this project change?

     node <ui>/ds/changed.mjs        # <ui>/ds is the folder this file is in

   Run it before an update. An update replaces every kit file that differs
   from the new release, edited or not, so what a project changed has to be
   known before the overwrite. This lists the kit files here that differ from
   the release they were installed from. It reads and lists: it writes
   nothing and merges nothing.

   The release is known from `RELEASE.json`, beside this file: the kit's
   version and two digests of every file the registry carries (of both its
   forms, for a source the CLI lands without the comment it opens with). The
   whole install (`npx shadcn add @ds/ds`) brings it and only that install
   replaces it, so it still says the old release when this runs before the
   next one.

   The whole install does not bring every item: an adapter, a preset is asked
   for by name. The record names those items and their files (`optional`),
   and each brings a record of its own, `releases/<item>.json`: its version
   and its files' digests. So the check knows what a project holds. An item
   is held when its record or one of its files is here; its files are then
   compared with its own record, which is the release that item was
   installed from.

     node <ui>/ds/changed.mjs --missing   # also names every recorded file not here

   What it answers, and the exit code that says which:

     0   no recorded file of what the project holds differs or is missing
     1   some do, in three groups:
           changed      the text differs: an update's overwrite loses the edit
           whitespace   the text is the same once spaces, tabs and line breaks
                        are taken out: a formatter, an indent. A change of
                        spaces inside a string, a class list included, lands
                        here too.
           missing      a file of the whole install, or of an optional item
                        the project holds, is not here: the update brings it
                        back
     2   it cannot tell: there is no record (a copy installed before 0.3.0),
         the CLI rewrote the files as it installed them, or an option it
         does not know

   What it says besides, with no effect on the exit code: the optional items
   the project does not hold, once, in one line; a held item whose own record
   is of another release than `RELEASE.json` (`behind`: an update that named
   only `@ds/ds` left it there); and the update command that takes everything
   the project holds.

   What it cannot know: a file the project wrote beside the kit is not in the
   record and is not looked at; a formatter that moves more than whitespace
   (quotes, commas, parentheses) makes a file `changed`; an optional item
   installed before it brought a record of its own (0.3.0) is compared with
   `RELEASE.json`, so a file of it that differs is listed as `changed` and
   may be behind instead; and a record of the 0.3.0 shape names no item, so
   a file not here is counted (`--missing` names it) and is no finding.

   Nothing is set aside. The one thing the CLI itself does to a `.ts` or
   `.tsx` file as it installs it is known and recorded: it drops the comment
   the file opens with (seen with shadcn 4.19 on a real install: `index.ts`
   and `primitives/Typography.tsx` land without theirs). So the record keeps
   two forms of such a file, as the kit writes it and from its first token
   on, and a file here is unchanged when it is either. Any other text is
   listed: a comment put at a file's top (`// @ts-nocheck`), an edit inside
   the comment it opens with. A `"use client"` is compared like any line: the
   same install, under `rsc: false`, left the directive on all 36 files that
   have it (the CLI looks for the statement without its semicolon, and the
   kit writes one), so one added or taken out is an edit, and is listed.

   Node builtins only: it runs with nothing but what the install brought.
   ========================================================================== */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD = "RELEASE.json";
export const UPDATE = "npx shadcn add @ds/ds --overwrite -y";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** A file the CLI puts through its transforms: the components and the
    libraries. Every other file (a stylesheet, a skill, a script, the licence)
    lands as it is in the kit. */
const isTransformed = (path) => /\.[jt]sx?$/.test(path);

/** What stands before a source file's first token: blank lines and comments.
    The CLI writes a transformed file from its first token on. */
const OPENING = /^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/;

/** The two digests of a text, the same at the kit's build and in a project.
    `exact`: the text with its line ends as LF. `loose`: the same with every
    space, tab and line break out. */
export function digests(text) {
  const exact = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return { exact: sha256(exact), loose: sha256(exact.replace(/\s+/g, "")) };
}

/** The second form of a file the CLI transforms (`path` says which): its
    text from the first token on, as the CLI lands it. `null` when there is
    no second form: nothing stands before the first token, or the file lands
    as it is. The build records it as the entry's `landed`. */
export function landedText(text, path) {
  if (!isTransformed(path)) return null;
  const whole = text.replace(/^\uFEFF/, "");
  const from = whole.replace(OPENING, "");
  return from === whole ? null : from;
}

/** The files a record names, each as the place it is read from. `kit` paths
    are under the kit's folder, `project` paths under the project's root. */
export const GROUPS = ["kit", "project"];

/** Where an optional item's own record lands, under the kit's folder. */
export const itemRecord = (item) => `releases/${item}.json`;

/** The update that takes everything a project holds: the whole install and
    each optional item it holds, by name. */
export const updateCommand = (held = []) =>
  UPDATE.replace(" --overwrite", [...held].sort().map((item) => ` @ds/${item}`).join("") + " --overwrite");

/** An optional item's own record, or `null` when it is not one. */
function parseItemRecord(text) {
  if (typeof text !== "string") return null;
  try {
    const own = JSON.parse(text);
    return typeof own?.version === "string" && own.kit && typeof own.kit === "object"
      ? own
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} input
 * @param {{ version?: string, kit?: object, project?: object,
 *   optional?: Record<string, string[]> }} input.record  RELEASE.json.
 *   `optional` names the items the whole install does not bring, each with
 *   its files under the kit's folder; a record of the 0.3.0 shape has none.
 * @param {(group: string, path: string) => string | null | undefined} input.read
 *   a recorded file's text; `null` when it is not there, `undefined` when
 *   the place it would be in is not known. An item's own record is read the
 *   same way, as `("kit", itemRecord(item))`.
 * @returns {{ changed: string[][], whitespace: string[][], missing: string[][],
 *   behind: { item: string, version: string }[], absent: string[],
 *   held: string[], unrecorded: string[], grouped: boolean, unread: number,
 *   recorded: number }} each listed file as `[group, path]`. `missing`: the
 *   recorded files not here, of the whole install and of the optional items
 *   held. `behind`: held items whose own record is of another release.
 *   `absent`: optional items of which nothing is here. `unrecorded`: held
 *   items with no record of their own. `grouped`: the record names its
 *   optional items. `recorded`: the files looked for.
 */
export function compare({ record, read }) {
  const result = {
    changed: [],
    whitespace: [],
    missing: [],
    behind: [],
    absent: [],
    held: [],
    unrecorded: [],
    grouped: record.optional !== undefined,
    unread: 0,
    recorded: 0,
  };
  /** One file as it stands, against the digests of a release. */
  const look = (group, path, then) => {
    result.recorded++;
    const text = read(group, path);
    if (text === undefined) result.unread++;
    else if (text === null) result.missing.push([group, path]);
    else {
      // The text as it stands, against each form the record holds.
      const now = digests(text);
      const forms = then.landed ? [then, then.landed] : [then];
      if (forms.some((form) => form.exact === now.exact)) return;
      if (forms.some((form) => form.loose === now.loose)) {
        result.whitespace.push([group, path]);
      } else result.changed.push([group, path]);
    }
  };

  const optional = record.optional ?? {};
  const theirs = new Set(Object.values(optional).flat());
  for (const group of GROUPS) {
    for (const path of Object.keys(record[group] ?? {}).sort()) {
      if (group === "kit" && theirs.has(path)) continue;
      look(group, path, record[group][path]);
    }
  }
  for (const item of Object.keys(optional).sort()) {
    const paths = optional[item].filter((path) => record.kit?.[path]);
    const own = parseItemRecord(read("kit", itemRecord(item)));
    if (!own && !paths.some((path) => typeof read("kit", path) === "string")) {
      result.absent.push(item);
      continue;
    }
    result.held.push(item);
    if (!own) {
      // Installed before the item brought a record: the whole install's.
      result.unrecorded.push(item);
      for (const path of paths) look("kit", path, record.kit[path]);
      continue;
    }
    if (own.version !== record.version) {
      result.behind.push({ item, version: own.version });
    }
    // Against the release this item was installed from, which is its own.
    for (const path of Object.keys(own.kit).sort()) look("kit", path, own.kit[path]);
  }
  const order = ([g, p], [h, q]) =>
    GROUPS.indexOf(g) - GROUPS.indexOf(h) || (p < q ? -1 : p > q ? 1 : 0);
  for (const group of ["changed", "whitespace", "missing"]) result[group].sort(order);
  return result;
}

/** What the CLI does to a component as it installs it, read in the project's
    `components.json`. Each of these rewrites the file's text, so the record,
    taken from the kit's own files, says nothing of what landed. */
function rewrites(config) {
  if (config.tsx === false) return "`tsx: false`";
  if (config.tailwind?.prefix) return "a Tailwind `prefix`";
  if (config.tailwind?.cssVariables === false) return "`cssVariables: false`";
  return null;
}

const asBefore = `Update as before: commit your work, run "${UPDATE}", then read "git diff" and put back what was yours.`;

/** The nearest folder at or above `from` that holds `components.json`. */
function projectRoot(from) {
  for (let at = from; ; at = dirname(at)) {
    if (existsSync(join(at, "components.json"))) return at;
    if (dirname(at) === at) return null;
  }
}

const USAGE = `Usage: node changed.mjs [--missing]
  --missing   also name every recorded file that is not here, with the item
              it belongs to and whether the project holds that item`;

function main(args = process.argv.slice(2)) {
  const kit = dirname(fileURLToPath(import.meta.url));
  const shown = (path) => relative(process.cwd(), path) || ".";
  const cannotTell = (sentence) => {
    console.error(sentence);
    return 2;
  };

  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const unknown = args.find((arg) => arg !== "--missing");
  if (unknown !== undefined) {
    return cannotTell(`Unknown option ${unknown}.\n${USAGE}`);
  }
  const naming = args.includes("--missing");

  const recordPath = join(kit, RECORD);
  if (!existsSync(recordPath)) {
    return cannotTell(
      `No release record here (${shown(recordPath)}). This copy of the kit was installed before 0.3.0, or its record was removed, so this check cannot tell which kit files you changed. ${asBefore}`,
    );
  }
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
    if (typeof record?.version !== "string" || typeof record.kit !== "object") {
      throw new Error("no version, or no files");
    }
  } catch (error) {
    return cannotTell(
      `The release record (${shown(recordPath)}) cannot be read: ${error.message}. This check cannot tell which kit files you changed. ${asBefore}`,
    );
  }

  const root = projectRoot(kit);
  if (root) {
    let config;
    try {
      config = JSON.parse(readFileSync(join(root, "components.json"), "utf8"));
    } catch {
      config = {};
    }
    const rewritten = rewrites(config);
    if (rewritten) {
      return cannotTell(
        `${shown(join(root, "components.json"))} has ${rewritten}: the CLI rewrote the kit's files as it installed them, so this check cannot tell which you changed. ${asBefore}`,
      );
    }
  }

  const places = { kit, project: root };
  const result = compare({
    record,
    read: (group, path) => {
      if (!places[group]) return undefined;
      const file = join(places[group], path);
      return existsSync(file) ? readFileSync(file, "utf8") : null;
    },
  });

  // A record of the 0.3.0 shape names no item: a file not here may never
  // have been installed, so it is counted and is no finding.
  const missing = result.grouped ? result.missing : [];
  const listed = result.changed.length + result.whitespace.length + missing.length;
  const here = ([group, path]) => shown(join(places[group], path));
  const list = (title, lines) => {
    if (!lines.length) return;
    console.log(`\n${title}`);
    for (const line of lines) console.log(`  ${line}`);
  };
  const optional = record.optional ?? {};
  const itemOf = (path) =>
    Object.keys(optional).find((item) => optional[item].includes(path));

  console.log(
    listed
      ? `Kit ${record.version}: ${listed} of ${result.recorded} recorded files differ from the release you installed.`
      : `Kit ${record.version}: none of the ${result.recorded} recorded files differs from the release you installed.`,
  );
  list(
    "changed (the text differs: an update's overwrite loses the edit):",
    result.changed.map(here),
  );
  list(
    "whitespace (the same text, laid out differently):",
    result.whitespace.map(here),
  );
  list(
    "missing (recorded, of what you hold, and not here: the update brings it back):",
    missing.map(here),
  );
  list(
    `behind (installed from another release than ${record.version}, the one the whole install is at: the update below takes it):`,
    result.behind.map(({ item, version }) => `@ds/${item}  ${version}`),
  );
  if (naming) {
    const held = new Set(result.held);
    const not = [
      ...result.missing.map((file) => [file, itemOf(file[1])]),
      ...result.absent.flatMap((item) => optional[item].map((path) => [["kit", path], item])),
    ];
    list(
      "not here (every recorded file that is not, and the item it belongs to):",
      not.length
        ? not.map(([file, item]) =>
            !result.grouped
              ? here(file)
              : item === undefined
                ? `${here(file)}  @ds/ds, the whole install: missing`
                : held.has(item)
                  ? `${here(file)}  @ds/${item}, installed: missing`
                  : `${here(file)}  @ds/${item}, not installed`,
          )
        : ["none"],
    );
  }

  console.log("");
  const unsure = result.unrecorded.filter((item) =>
    [...result.changed, ...result.whitespace].some(([, path]) => optional[item].includes(path)),
  );
  if (unsure.length) {
    console.log(
      `${unsure.map((item) => `@ds/${item}`).join(", ")}: installed before the item brought a record of its own, so its file is compared with ${record.version}'s: it may be behind, not edited.`,
    );
  }
  if (result.absent.length) {
    console.log(
      `Not installed, and no finding: ${result.absent.map((item) => `@ds/${item}`).join(", ")}.`,
    );
  }
  if (!result.grouped && result.missing.length) {
    console.log(
      `${result.missing.length} recorded file(s) are not here, removed or never installed: ${naming ? "named above" : "--missing names them"}.`,
    );
  }
  if (result.unread) {
    console.log(
      `${result.unread} recorded file(s) of the project's root (the skills) were not looked at: no components.json above ${shown(kit)}.`,
    );
  }
  console.log(`To update, from a clean working tree: ${updateCommand(result.held)}`);
  if (!result.grouped) {
    console.log(
      "This record names no optional item: add to that command each adapter or preset the project holds (@ds/next-adapter, @ds/preset-editorial, …).",
    );
  }
  return listed ? 1 : 0;
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = main();
}
