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

   What it answers, and the exit code that says which:

     0   no recorded file differs
     1   some do, in one of two groups:
           changed      the text differs: an update's overwrite loses the edit
           whitespace   the text is the same once spaces, tabs and line breaks
                        are taken out: a formatter, an indent. A change of
                        spaces inside a string, a class list included, lands
                        here too.
     2   it cannot tell: there is no record (a copy installed before 0.3.0),
         or the CLI rewrote the files as it installed them

   What it cannot know: a file recorded and not here is counted, not listed
   (removed, or never installed, look the same); a file the project wrote
   beside the kit is not in the record and is not looked at; and a formatter
   that moves more than whitespace (quotes, commas, parentheses) makes a file
   `changed`.

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

/**
 * @param {object} input
 * @param {{ kit?: object, project?: object }} input.record  RELEASE.json
 * @param {(group: string, path: string) => string | null | undefined} input.read
 *   a recorded file's text; `null` when it is not there, `undefined` when
 *   the place it would be in is not known
 * @returns {{ changed: string[][], whitespace: string[][], missing: number,
 *   unread: number, recorded: number }} each listed file as `[group, path]`
 */
export function compare({ record, read }) {
  const result = { changed: [], whitespace: [], missing: 0, unread: 0, recorded: 0 };
  for (const group of GROUPS) {
    for (const path of Object.keys(record[group] ?? {}).sort()) {
      result.recorded++;
      const text = read(group, path);
      if (text === undefined) result.unread++;
      else if (text === null) result.missing++;
      else {
        // The text as it stands, against each form the record holds.
        const now = digests(text);
        const then = record[group][path];
        const forms = then.landed ? [then, then.landed] : [then];
        if (forms.some((form) => form.exact === now.exact)) continue;
        if (forms.some((form) => form.loose === now.loose)) {
          result.whitespace.push([group, path]);
        } else result.changed.push([group, path]);
      }
    }
  }
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

function main() {
  const kit = dirname(fileURLToPath(import.meta.url));
  const shown = (path) => relative(process.cwd(), path) || ".";
  const cannotTell = (sentence) => {
    console.error(sentence);
    return 2;
  };

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

  const listed = result.changed.length + result.whitespace.length;
  const list = (title, files) => {
    if (!files.length) return;
    console.log(`\n${title}`);
    for (const [group, path] of files) {
      console.log(`  ${shown(join(places[group], path))}`);
    }
  };
  console.log(
    listed
      ? `Kit ${record.version}: ${listed} of ${result.recorded} recorded files differ from the release you installed.`
      : `Kit ${record.version}: none of the ${result.recorded} recorded files differs from the release you installed.`,
  );
  list(
    "changed (the text differs: an update's overwrite loses the edit):",
    result.changed,
  );
  list(
    "whitespace (the same text, laid out differently):",
    result.whitespace,
  );
  if (result.missing || result.unread) console.log("");
  if (result.missing) {
    console.log(
      `${result.missing} recorded file(s) are not here, removed or never installed: not listed.`,
    );
  }
  if (result.unread) {
    console.log(
      `${result.unread} recorded file(s) of the project's root (the skills) were not looked at: no components.json above ${shown(kit)}.`,
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
