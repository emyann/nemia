#!/usr/bin/env node
/* =============================================================================
   md3 — Material Design 3 specs, guidelines, accessibility and tokens, read
   straight from m3.material.io. No browser, no dependencies (Node ≥ 18).

     md3 list [filter]                       pages the site publishes
     md3 page <page> [tab]                   overview | specs | guidelines | accessibility
     md3 tokens <page> [--theme dark] [--contrast high] [--platform android]
                       [--filter text] [--json]
     md3 check [--file spec-version.json] [--strict]
     md3 refresh                             re-read the site version now

   How it works — the site is a client-rendered app whose data is plain JSON:
   the HTML names the JS bundle, the bundle carries the current content
   version (`carbonVersion`, a date stamp) and the sitemap, every page is
   `/_dsm/content/m3/<version>/<id>.json` (tabs → blocks → chunks; Do/Don't
   are IMAGE chunks with `captionModifier`), and a specs page references its
   token table `/_dsm/data/dsdb-m3/<version>/TOKEN_TABLE.<component>.json`
   (tokens, typed values per context tag, reference chains).

   Freshness/performance: content under a version folder never changes, so
   everything is cached under ~/.cache/ds-spec/<version>/ and the version is
   re-checked at most once a day (or with `refresh` / --refresh). A new site
   deploy = new folder = automatic cache miss. Nothing here is documented by
   Google; if the bundle shape changes, `getSite` fails loudly.

   Content © Google — CC BY 4.0 / Apache 2.0 (https://m3.material.io/get-started).
   ========================================================================== */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SITE = "https://m3.material.io";
const CACHE =
  process.env.MD3_CACHE_DIR ?? join(homedir(), ".cache", "ds-spec");
const VERSION_TTL_MS = 24 * 60 * 60 * 1000;

/* ---------------------------------------------------------------- fetch */

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "ds-spec-skill/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function cached(key, produce) {
  const path = join(CACHE, key);
  try {
    return await readFile(path, "utf8");
  } catch {
    const text = await produce();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    return text;
  }
}

/** Site version + sitemap, from the HTML → bundle. Cached for a day. */
async function getSite({ refresh = false } = {}) {
  const versionFile = join(CACHE, "site.json");
  if (!refresh) {
    try {
      const site = JSON.parse(await readFile(versionFile, "utf8"));
      if (Date.now() - Date.parse(site.fetchedAt) < VERSION_TTL_MS) return site;
    } catch {
      /* first run */
    }
  }
  const html = await fetchText(`${SITE}/`);
  const bundlePath = html.match(/static\/angular\/main\.[a-z0-9]+\.js/)?.[0];
  if (!bundlePath)
    throw new Error(
      "m3.material.io: could not find the app bundle in the HTML — the site changed shape",
    );
  const bundle = await fetchText(`${SITE}/${bundlePath}`);
  const version = bundle.match(/carbonVersion:"([^"]+)"/)?.[1];
  if (!version)
    throw new Error(
      "m3.material.io: carbonVersion not found in the bundle — the site changed shape",
    );
  const pages = [];
  const entry =
    /\{"slug":"([^"]+)","exportedCarbonFileId":"([^"]+)","carbonPath":"([^"]+)"(?:,"theme":"[^"]*")?(?:,"tabs":(\[[^\]]*\]))?/g;
  for (const m of bundle.matchAll(entry)) {
    const tabs = m[4]
      ? [...m[4].matchAll(/"label":"([^"]+)"/g)].map((t) => t[1])
      : [];
    pages.push({ slug: m[1], file: m[2], carbonPath: m[3], tabs });
  }
  if (pages.length < 20)
    throw new Error(
      `m3.material.io: sitemap parse found only ${pages.length} pages — the bundle changed shape`,
    );
  const site = {
    version,
    bundle: bundlePath,
    fetchedAt: new Date().toISOString(),
    pages,
  };
  await mkdir(CACHE, { recursive: true });
  await writeFile(versionFile, JSON.stringify(site, null, 2));
  return site;
}

function resolvePage(site, query) {
  const q = query.toLowerCase().replace(/^\/+|\/+$/g, "");
  const exact = site.pages.find(
    (p) =>
      p.slug === q ||
      p.slug.endsWith(`/${q}`) ||
      p.carbonPath === `m3/pages/${q}`,
  );
  if (exact) return exact;
  const loose = site.pages.filter(
    (p) => p.slug.includes(q) || p.carbonPath.includes(q),
  );
  if (loose.length === 1) return loose[0];
  if (loose.length > 1)
    throw new Error(
      `"${query}" is ambiguous: ${loose.map((p) => p.slug).join(", ")}`,
    );
  throw new Error(`No page matches "${query}". Try: md3 list ${query}`);
}

async function getPageJson(site, page) {
  const text = await cached(`${site.version}/pages/${page.file}`, () =>
    fetchText(`${SITE}/_dsm/content/m3/${site.version}/${page.file}`),
  );
  return JSON.parse(text);
}

/* ------------------------------------------------------------ html → md */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#160": " ",
};
const decode = (s) =>
  s.replace(
    /&(#?\w+);/g,
    (m, e) =>
      ENTITIES[e] ??
      (e.startsWith("#") ? String.fromCodePoint(+e.slice(1)) : m),
  );
const absolute = (href) => (href.startsWith("/") ? SITE + href : href);

/** Small, forgiving HTML → Markdown for the site's rich-text blocks. */
function htmlToMarkdown(html, site) {
  let s = html;
  // Tooltip custom elements: keep the text, append the definition once.
  s = s.replace(
    /<app-froala-tooltip-element[^>]*description="([^"]*)"[^>]*>([\s\S]*?)<\/app-froala-tooltip-element>/g,
    (m, d, text) => `${text}`,
  );
  s = s.replace(
    /<app-froala-tooltip-element[^>]*>([\s\S]*?)<\/app-froala-tooltip-element>/g,
    "$1",
  );
  // Tables first (before paragraph handling).
  s = s.replace(/<table[\s\S]*?<\/table>/g, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
      [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
        inline(c[1]).replace(/\|/g, "\\|").trim(),
      ),
    );
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill("")];
    const [head, ...body] = rows;
    return `\n\n| ${pad(head).join(" | ")} |\n| ${pad(head)
      .map(() => "---")
      .join(
        " | ",
      )} |\n${body.map((r) => `| ${pad(r).join(" | ")} |`).join("\n")}\n\n`;
  });
  s = s.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g,
    (m, n, t) => `\n\n${"#".repeat(Math.min(6, +n + 1))} ${inline(t)}\n\n`,
  );
  s = s.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/g,
    (m, t) => `\n\n\`\`\`\n${decode(t.replace(/<[^>]+>/g, ""))}\n\`\`\`\n\n`,
  );
  // Lists (two levels is plenty for this site).
  s = s.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/g, (m, tag, body) => {
    let i = 0;
    return (
      "\n" +
      body.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (mm, item) => {
        const nested = item.replace(
          /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/g,
          (n, t2, b2) =>
            "\n" +
            b2.replace(
              /<li[^>]*>([\s\S]*?)<\/li>/g,
              (x, it) => `    - ${inline(it)}\n`,
            ),
        );
        return `${tag === "ol" ? `${++i}.` : "-"} ${inline(nested).replace(/\n\s*-/g, "\n    -")}\n`;
      }) +
      "\n"
    );
  });
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (m, t) => `\n\n${inline(t)}\n\n`);
  s = s.replace(/<br\s*\/?>/g, "\n");
  s = inline(s);
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  function inline(t) {
    return decode(
      t
        .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, "**$2**")
        .replace(/<(em|i)>([\s\S]*?)<\/\1>/g, "*$2*")
        .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
        .replace(
          /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
          (m, href, text) =>
            `[${text.replace(/<[^>]+>/g, "")}](${linkTarget(href)})`,
        )
        .replace(/<[^>]+>/g, "")
        .replace(/[ \t]+/g, " "),
    );
  }
  function linkTarget(href) {
    // Content links use the internal carbon path (/m3/pages/<x>#…); map to the public route.
    const m = href.match(/^\/m3\/pages\/([^#?]+)(.*)$/);
    if (m && site) {
      const page = site.pages.find((p) => p.carbonPath === `m3/pages/${m[1]}`);
      if (page) return `${SITE}/${page.slug}${m[2]}`;
    }
    return absolute(href);
  }
}

/* --------------------------------------------------------------- page */

function renderPage(site, page, json, tab) {
  const sections = json.sections.filter(
    (s) => !tab || s.name.toLowerCase() === tab.toLowerCase(),
  );
  if (tab && !sections.length)
    throw new Error(
      `Page "${page.slug}" has no "${tab}" tab (has: ${json.sections.map((s) => s.name).join(", ")})`,
    );
  const out = [];
  out.push(`# ${json.title}${tab ? ` — ${sections[0].name}` : ""}`);
  out.push(
    `> Source: ${SITE}/${page.slug}${tab ? `/${tab.toLowerCase()}` : ""} · site version ${site.version} · page updated ${json.updatedTimestamp?.slice(0, 10)} · © Google, CC BY 4.0 / Apache 2.0`,
  );
  if (json.description && !tab) out.push(`\n${json.description}`);
  for (const section of sections) {
    if (!section.isVisible && section.isVisible !== undefined) continue;
    out.push(`\n## ${section.name}\n`);
    for (const block of section.contentBlocks) {
      if (block.isHidden) continue;
      if (block.title) out.push(`\n### ${block.title}\n`);
      for (const c of block.contentChunks) {
        const caption = c.footer ? htmlToMarkdown(c.footer, site) : "";
        switch (c.contentChunkType) {
          case "TEXT":
            if (c.htmlValue) out.push(htmlToMarkdown(c.htmlValue, site) + "\n");
            break;
          case "IMAGE": {
            const mod = (c.captionModifier || "").toUpperCase();
            if (mod === "DO")
              out.push(
                `✅ **Do** — ${caption}${c.altText ? ` _(image: ${c.altText})_` : ""}\n`,
              );
            else if (mod === "DON'T" || mod === "DONT")
              out.push(
                `❌ **Don't** — ${caption}${c.altText ? ` _(image: ${c.altText})_` : ""}\n`,
              );
            else if (mod)
              out.push(`⚠️ **${c.captionModifier}** — ${caption}\n`);
            else if (caption || c.altText)
              out.push(
                `_(image${c.altText ? `: ${c.altText}` : ""}${caption ? ` — ${caption}` : ""})_\n`,
              );
            break;
          }
          case "VIDEO":
            out.push(
              `_(video${c.altText ? `: ${c.altText}` : ""}${caption ? ` — ${caption}` : ""})_\n`,
            );
            break;
          case "RESOURCE":
            if (c.libraryModuleType === "TOKEN_TABLE")
              out.push(
                `> **Token table** — run \`md3 tokens ${page.slug.split("/").pop()}\` for every token, value and reference chain.\n`,
              );
            else if (c.libraryModuleType === "STATUS_TABLE")
              out.push(
                `> _(availability table: Figma kit, Android, Compose, Flutter, Web links)_\n`,
              );
            else out.push(`> _(embedded module: ${c.libraryModuleType})_\n`);
            break;
          default:
            break;
        }
      }
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/* -------------------------------------------------------------- tokens */

function pickValue(values, selected) {
  let best = null;
  for (const v of values) {
    const tags = v.contextTags ?? [];
    if (!tags.every((t) => selected.has(t))) continue;
    const score = Number(v.specificityScore ?? 0);
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (v.revisionCreateTime ?? "") > (best.v.revisionCreateTime ?? ""))
    )
      best = { v, score };
  }
  return best?.v ?? null;
}

const hex = (c) => {
  const h = (x) =>
    Math.round((x ?? 0) * 255)
      .toString(16)
      .padStart(2, "0");
  const a = c.alpha === undefined || c.alpha === 1 ? "" : h(c.alpha);
  return `#${h(c.red)}${h(c.green)}${h(c.blue)}${a}`;
};

function literal(v) {
  if (!v) return "—";
  if (v.undefined) return "undefined";
  if (v.color) return hex(v.color);
  if (v.length)
    return `${v.length.value ?? 0}${v.length.unit === "DIPS" ? "dp" : (v.length.unit?.toLowerCase() ?? "")}`;
  if (v.opacity !== undefined) return String(v.opacity);
  if (v.elevation) return `${v.elevation.value ?? 0}dp`;
  if (v.shape)
    return v.shape.family
      ? v.shape.family.replace("SHAPE_FAMILY_", "").toLowerCase()
      : JSON.stringify(v.shape);
  if (v.typography) return JSON.stringify(v.typography);
  if (v.duration) return JSON.stringify(v.duration);
  if (v.easing) return JSON.stringify(v.easing);
  const other = Object.keys(v).find(
    (k) =>
      ![
        "name",
        "revisionId",
        "revisionCreateTime",
        "state",
        "createTime",
        "contextTags",
        "specificityScore",
      ].includes(k),
  );
  return other ? `${other}: ${JSON.stringify(v[other])}` : "—";
}

function renderTokens(site, page, tables, ctx, opts) {
  const out = [];
  const result = {
    site: site.version,
    page: page.slug,
    context: ctx.labels,
    components: [],
  };
  for (const sys of tables) {
    const byTokenName = new Map(sys.tokens.map((t) => [t.tokenName, t]));
    const values = new Map();
    for (const v of sys.values) {
      const key = v.name.split("/values/")[0];
      if (!values.has(key)) values.set(key, []);
      values.get(key).push(v);
    }
    const tagsById = new Map(sys.tags.map((t) => [t.name, t]));
    // Selected tags: each group's default, overridden by --theme/--contrast/--platform.
    const selected = new Set();
    const labels = [];
    for (const g of sys.contextTagGroups) {
      const groupTags = sys.tags.filter((t) => t.name.startsWith(g.name + "/"));
      // Web is this kit's target; the token db's own default is Android.
      const wanted =
        ctx.overrides[g.displayName.toLowerCase()] ??
        (g.displayName === "Platform" ? "web" : undefined);
      const tag =
        (wanted &&
          groupTags.find(
            (t) => t.displayName.toLowerCase() === wanted.toLowerCase(),
          )) ||
        tagsById.get(g.defaultTag) ||
        groupTags[0];
      if (tag) {
        selected.add(tag.name);
        labels.push(`${g.displayName}: ${tag.displayName}`);
      }
      if (
        wanted &&
        !groupTags.some(
          (t) => t.displayName.toLowerCase() === wanted.toLowerCase(),
        )
      )
        throw new Error(
          `Unknown ${g.displayName} "${wanted}". Options: ${groupTags.map((t) => t.displayName).join(", ")}`,
        );
    }
    result.context = labels;
    const groupPath = (id) => {
      const g = sys.displayGroups.find((x) => x.name === id);
      return g
        ? (g.parentGroup ? groupPath(g.parentGroup) + " / " : "") +
            g.displayName
        : "";
    };
    const resolve = (tokenRes, chain = []) => {
      const v = pickValue(values.get(tokenRes) ?? [], selected);
      if (!v) return { value: "—", chain };
      if (v.tokenName) {
        const ref = byTokenName.get(v.tokenName);
        if (!ref || chain.includes(v.tokenName) || chain.length > 8)
          return { value: v.tokenName, chain: [...chain, v.tokenName] };
        return resolve(ref.name, [...chain, v.tokenName]);
      }
      return { value: literal(v), chain };
    };
    const component = sys.components?.[0]?.displayName ?? sys.displayName;
    const rows = [];
    for (const t of sys.tokens) {
      if (!t.tokenName.startsWith("md.comp.")) continue;
      if (opts.filter && !t.tokenName.includes(opts.filter)) continue;
      const r = resolve(t.name);
      rows.push({
        group: groupPath(t.displayGroup),
        token: t.tokenName,
        type: t.tokenValueType,
        value: r.value,
        via: r.chain,
      });
    }
    rows.sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.token.localeCompare(b.token),
    );
    result.components.push({
      component,
      dsdbVersion: sys.dsdbVersion,
      tokens: rows,
    });
    if (!opts.json) {
      out.push(`# ${component} tokens`);
      out.push(
        `> Source: ${SITE}/${page.slug}/specs · site version ${site.version} · token db ${sys.dsdbVersion} (revision ${sys.revisionCreateTime?.slice(0, 10)}) · context: ${labels.join(", ")}`,
      );
      let current = null;
      for (const r of rows) {
        if (r.group !== current) {
          current = r.group;
          out.push(
            `\n## ${current || "Other"}\n\n| token | value | via |\n| --- | --- | --- |`,
          );
        }
        out.push(
          `| \`${r.token}\` | ${r.value} | ${r.via.map((c) => `\`${c}\``).join(" → ") || "literal"} |`,
        );
      }
      out.push("");
    }
  }
  return opts.json ? JSON.stringify(result, null, 2) : out.join("\n");
}

async function getTokenTables(site, page, json) {
  const ids = new Set();
  for (const s of json.sections)
    for (const b of s.contentBlocks)
      for (const c of b.contentChunks)
        if (
          c.contentChunkType === "RESOURCE" &&
          c.libraryModuleType === "TOKEN_TABLE" &&
          c.resourceName
        )
          ids.add(c.resourceName.split("/").pop());
  if (!ids.size)
    throw new Error(
      `Page "${page.slug}" embeds no token table (foundations/styles pages describe tokens in prose — try: md3 page ${page.slug.split("/").pop()} specs)`,
    );
  const tables = [];
  for (const id of ids) {
    const text = await cached(
      `${site.version}/tokens/TOKEN_TABLE.${id}.json`,
      () =>
        fetchText(
          `${SITE}/_dsm/data/dsdb-m3/${site.version}/TOKEN_TABLE.${id}.json`,
        ),
    );
    tables.push(JSON.parse(text).system);
  }
  return tables;
}

/* ----------------------------------------------------------------- cli */

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=");
      const next = argv[i + 1];
      if (inline !== undefined) args.flags[k] = inline;
      else if (next && !next.startsWith("--")) args.flags[k] = argv[++i];
      else args.flags[k] = true;
    } else args._.push(a);
  }
  return args;
}

const USAGE = `md3 — Material Design 3 specs, guidelines, accessibility and tokens from m3.material.io

  md3 list [filter]                     pages (slug and tabs)
  md3 page <page> [tab]                 e.g. md3 page text-fields guidelines
  md3 tokens <page> [options]           e.g. md3 tokens switch --theme dark
      --theme light|dark  --contrast default|"medium contrast"|"high contrast"
      --platform web|android|ios|compose  --filter <substring>  --json
  md3 check [--file path] [--strict]    site version vs the version a file records
  md3 refresh                           re-read the site version (bypass the 24h check)
  --refresh on any command does the same. Cache: ${CACHE}`;

async function main() {
  const { _: pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = pos;
  if (!cmd || flags.help) return console.log(USAGE);
  const site = await getSite({ refresh: !!flags.refresh || cmd === "refresh" });
  switch (cmd) {
    case "refresh":
      return console.log(
        `site version ${site.version} · ${site.pages.length} pages · checked ${site.fetchedAt}`,
      );
    case "list": {
      const f = (rest[0] ?? "").toLowerCase();
      for (const p of site.pages.filter((p) => !f || p.slug.includes(f)))
        console.log(`${p.slug.padEnd(48)} ${p.tabs.join(" · ")}`);
      return console.log(
        `\n${site.pages.length} pages · site version ${site.version}`,
      );
    }
    case "page": {
      if (!rest[0]) throw new Error("md3 page <page> [tab]");
      const page = resolvePage(site, rest[0]);
      const json = await getPageJson(site, page);
      return console.log(
        flags.json
          ? JSON.stringify(json, null, 2)
          : renderPage(site, page, json, rest[1]),
      );
    }
    case "tokens": {
      if (!rest[0]) throw new Error("md3 tokens <page> [--theme dark] …");
      const page = resolvePage(site, rest[0]);
      const json = await getPageJson(site, page);
      const tables = await getTokenTables(site, page, json);
      const ctx = {
        overrides: {
          theme: flags.theme,
          contrast: flags.contrast,
          platform: flags.platform,
        },
        labels: [],
      };
      for (const k of Object.keys(ctx.overrides))
        if (ctx.overrides[k] === undefined) delete ctx.overrides[k];
      return console.log(
        renderTokens(site, page, tables, ctx, {
          filter: flags.filter,
          json: !!flags.json,
        }),
      );
    }
    case "check": {
      const file = flags.file ?? "spec-version.json";
      let recorded = null;
      try {
        recorded = JSON.parse(await readFile(file, "utf8"));
      } catch {
        /* no record */
      }
      console.log(
        `site version ${site.version} · ${site.pages.length} pages · checked ${site.fetchedAt}`,
      );
      if (!recorded) return console.log(`no version record at ${file}`);
      const drift = recorded.carbonVersion !== site.version;
      console.log(
        drift
          ? `DRIFT: ${file} records ${recorded.carbonVersion} — the spec moved; re-audit (${(recorded.audited && Object.keys(recorded.audited).join(", ")) || "components"})`
          : `up to date with ${file}`,
      );
      if (drift && flags.strict) process.exit(1);
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}"\n\n${USAGE}`);
  }
}

main().catch((e) => {
  console.error(`md3: ${e.message}`);
  process.exit(1);
});
