/**
 * Every list of the platforms a release is built for names the same ones as `tools/release/archive.ts`'s `PLATFORMS`: the Node
 * sums `node.json` pins, the platforms `nemia upgrade` downloads for (`RELEASE_PLATFORMS`, in the orchestrator's `src/release`), the
 * archives `tools/release/README.md`'s asset table lists, and the Agent SDK's platform packages the lockfile holds, from which
 * `nemia doctor fix claude` installs the harness of each platform. The lists sit across boundaries no import may cross (the
 * archive tool imports nothing installed, and no package imports a tool), so the guard reads them as texts: a pure judgement,
 * proven on planted copies, and run once on the shipped files.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { textOf } from 'test-kit/repo';
import { PLATFORMS, SDK_PLATFORM_PREFIX } from '../../release/archive.ts';

const NODE = 'tools/release/node.json';
const UPGRADE = 'packages/agent-orchestrator/src/release/release.ts';
const README = 'tools/release/README.md';
const LOCK = 'package-lock.json';

/** The texts the guard reads, each by its path from the root. */
type Texts = Record<typeof NODE | typeof UPGRADE | typeof README | typeof LOCK, string>;

/** The SDK's package in the lockfile, whose optional dependencies are its platform packages. */
const SDK = 'node_modules/@anthropic-ai/claude-agent-sdk';

/** The sentence naming what `file`'s list `found` lacks or adds against `PLATFORMS`, or nothing where they agree. */
const differs = (file: string, what: string, found: readonly string[] | undefined): string[] => {
  if (found === undefined) return [`${file}: no ${what} found to read: keep it where this guard reads it, or change the guard with it`];
  const missing = PLATFORMS.filter((p) => !found.includes(p));
  const extra = [...new Set(found)].filter((p) => !(PLATFORMS as readonly string[]).includes(p));
  if (missing.length === 0 && extra.length === 0) return [];
  return [
    `${file}: its list of ${what} ${missing.length > 0 ? `lacks ${missing.join(', ')}` : ''}${missing.length > 0 && extra.length > 0 ? ' and ' : ''}${extra.length > 0 ? `names ${extra.join(', ')} besides` : ''}: make it name ${PLATFORMS.join(', ')}, as tools/release/archive.ts's PLATFORMS does`,
  ];
};

/** The keys of node.json's `sha256`, or undefined where it holds none. */
const nodeSums = (text: string): string[] | undefined => {
  const sums = (JSON.parse(text) as { sha256?: Record<string, string> }).sha256;
  return sums === undefined ? undefined : Object.keys(sums);
};

/** The words of the `RELEASE_PLATFORMS = [...] as const` literal, across line breaks, or undefined where there is none. */
const upgradePlatforms = (text: string): string[] | undefined => {
  const literal = /export const RELEASE_PLATFORMS\s*=\s*\[([^\]]*)\]\s*as const/.exec(text)?.[1];
  return literal === undefined ? undefined : [...literal.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
};

/** The platform of each archive row of the README's asset table, or undefined where it lists none. */
const readmeAssets = (text: string): string[] | undefined => {
  const rows = [...text.matchAll(/^\|\s*`nemia-<tag>-([a-z0-9-]+)\.tar\.gz`/gm)].map((m) => m[1] ?? '');
  return rows.length === 0 ? undefined : rows;
};

/** The platforms of the SDK's platform packages in the lockfile, the musl builds left aside, or undefined where it has no SDK. */
const sdkPlatforms = (text: string): string[] | undefined => {
  const sdk = (JSON.parse(text) as { packages?: Record<string, { optionalDependencies?: Record<string, string> }> }).packages?.[SDK];
  if (sdk === undefined) return undefined;
  const prefix = `@anthropic-ai/${SDK_PLATFORM_PREFIX}`;
  return Object.keys(sdk.optionalDependencies ?? {})
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .filter((p) => !p.endsWith('-musl'));
};

/**
 * Each list among `texts` that differs from `PLATFORMS`, a sentence naming its file and the fix. The SDK's packages may name
 * platforms no release is built for (Windows): only those it lacks are refused.
 *
 * @param texts The text of each file the guard reads, by its path from the root.
 */
export const platformDrift = (texts: Texts): string[] => {
  const sdk = sdkPlatforms(texts[LOCK]);
  return [
    ...differs(NODE, 'pinned Node sums', nodeSums(texts[NODE])),
    ...differs(UPGRADE, 'RELEASE_PLATFORMS', upgradePlatforms(texts[UPGRADE])),
    ...differs(README, 'asset table', readmeAssets(texts[README])),
    ...differs(
      LOCK,
      `${SDK}'s platform packages`,
      sdk?.filter((p) => (PLATFORMS as readonly string[]).includes(p)),
    ),
  ];
};

/** The shipped texts. */
const shipped = (): Texts => {
  const read = (file: string): string => {
    const text = textOf(file);
    assert.ok(text !== undefined, `${file} is not in the repository`);
    return text;
  };
  return { [NODE]: read(NODE), [UPGRADE]: read(UPGRADE), [README]: read(README), [LOCK]: read(LOCK) };
};

/** `text` with `from` replaced by `to`, asserting `from` is there, so a plant that no longer matches fails loudly. */
const planted = (text: string, from: string | RegExp, to: string): string => {
  const out = text.replace(from, to);
  assert.notEqual(out, text, `the plant ${String(from)} matches nothing`);
  return out;
};

test("every list of a release's platforms names the archive tool's, darwin-x64 among them", () => {
  assert.deepEqual(platformDrift(shipped()), []);
});

test('REFUSED: a list lacking a platform, one naming another besides, one the guard cannot read, and an SDK with no package for one', () => {
  const texts = shipped();
  const refusedIn = (changed: Partial<Texts>, file: string, what: string) => {
    const said = platformDrift({ ...texts, ...changed });
    assert.equal(said.length, 1, `${what}: ${said.join('\n')}`);
    assert.ok(said[0]?.startsWith(`${file}:`), `${what}: ${said[0]}`);
  };
  refusedIn({ [NODE]: planted(texts[NODE], /\s*"darwin-x64": "[0-9a-f]+",/, '') }, NODE, "node.json without darwin-x64's sum");
  refusedIn({ [NODE]: planted(texts[NODE], '"sha256": {', '"sha256": {\n    "win32-x64": "0",') }, NODE, 'node.json naming win32-x64');
  refusedIn({ [UPGRADE]: planted(texts[UPGRADE], " 'darwin-x64',", '') }, UPGRADE, 'RELEASE_PLATFORMS without darwin-x64');
  refusedIn(
    { [UPGRADE]: planted(texts[UPGRADE], 'export const RELEASE_PLATFORMS =', 'export const RELEASE_PLATFORMS: string[] =') },
    UPGRADE,
    'RELEASE_PLATFORMS no longer a literal the guard reads',
  );
  refusedIn({ [README]: planted(texts[README], /^\|\s*`nemia-<tag>-darwin-x64\.tar\.gz`.*\n/m, '') }, README, 'no darwin-x64 row');
  refusedIn(
    { [LOCK]: planted(texts[LOCK], /\s*"@anthropic-ai\/claude-agent-sdk-darwin-x64": "[^"]+",/, '') },
    LOCK,
    'the SDK with no darwin-x64 package',
  );
});
