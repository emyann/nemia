/**
 * `tokens.json`: the board's theme (`theme/theme.css`, `theme/theme.v4.css`) as the artifact's token families, dark first, each colour
 * role with what it is for (`usage.ts`), the look's meanings over the roles, the type scale, the square corners, the elevations as
 * hairlines and the state layers; the faces as the files the build copies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { headOf } from '../../head.ts';
import { WEB } from '../paths.ts';
import type { Face } from '../stylesheet/fonts.ts';
import { ALIASES, FAMILIES, MEANING, SCALE, SHADOW_USAGE, USAGE } from './usage.ts';

/** A token whose value differs by theme. */
type Themed = { name: string; value: { light: string; dark: string }; usage: string };

/** The colour roles one block of the theme declares, each by its name and its `hsl()` value. */
const rolesOf = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--(md-sys-color-[a-z-]+):\s*(hsl\([^)]*\));/g)].map(([, name, value]) => [name ?? '', value ?? '']),
  );

/** The light and the dark roles of the theme, refused when the two schemes name other roles. */
const schemes = (theme: string) => {
  const at = theme.indexOf('@media (prefers-color-scheme: dark)');
  const light = rolesOf(theme.slice(theme.indexOf(':root {'), at));
  const dark = rolesOf(theme.slice(at));
  const names = Object.keys(light);
  if (names.length !== Object.keys(dark).length || names.some((name) => !dark[name]))
    throw new Error('theme/theme.css names other roles in its light and dark schemes: generate the theme again (ds-theme)');
  return { light, dark, names };
};

/** Each colour role, its value in both schemes and what it is for; refused for a role with no usage. */
const colourTokens = (light: Record<string, string>, dark: Record<string, string>, names: readonly string[]) =>
  names.map((name) => {
    const role = name.replace('md-sys-color-', '');
    const usage = USAGE[role];
    if (!usage) throw new Error(`no usage for the colour role ${role}: say what it is for in tools/design-system/src/tokens/usage.ts`);
    return { name, value: { light: light[name] ?? '', dark: dark[name] ?? '' }, usage } satisfies Themed;
  });

/**
 * Where the board's stylesheet writes its dark meanings, the dark media query around a `:root` block, never the `dark` variant that
 * names the same query above it: what is before it is the light scheme's.
 */
const DARK_ROOT = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/;

/** The `--meaning-*` values one part of the board's stylesheet writes, by their name after `--meaning-`. */
const meaningsIn = (css: string) =>
  Object.fromEntries([...css.matchAll(/--meaning-([a-z-]+):\s*([^;]+);/g)].map(([, n, v]) => [n ?? '', (v ?? '').trim()]));

/**
 * A meaning's value as a token's: a colour as written, or a role of the theme read through `var(--md-sys-color-…)`, as the theme
 * writes it.
 */
const valueOf = (value: string, roles: Record<string, string>) => {
  const role = /^var\(\s*--(md-sys-color-[a-z-]+)\s*\)$/.exec(value)?.[1];
  return role ? (roles[role] ?? value) : value;
};

/**
 * The look's meanings as the board writes them beside the theme (`src/styles.css`), each role it writes with its value in both schemes,
 * then its further names; refused for a meaning the stylesheet does not write.
 */
const meaningTokens = (light: Record<string, string>, dark: Record<string, string>) => {
  const css = fs.readFileSync(path.join(WEB, 'src', 'styles.css'), 'utf8');
  const at = css.search(DARK_ROOT);
  const written = { light: meaningsIn(at < 0 ? css : css.slice(0, at)), dark: meaningsIn(at < 0 ? '' : css.slice(at)) };
  return [
    ...MEANING.flatMap(([word, usage]) => {
      if (!written.light[word])
        throw new Error(`src/styles.css writes no --meaning-${word}: say its value there, or take it out of usage.ts`);
      return [
        [word, usage],
        [`on-${word}`, `Ink on \`meaning-${word}\`.`],
        [`${word}-container`, `The quieter field of \`meaning-${word}\`.`],
        [`on-${word}-container`, `Ink on \`meaning-${word}-container\`.`],
      ]
        .filter(([name = '']) => written.light[name])
        .map(([name = '', said = '']) => {
          const lit = written.light[name] ?? '';
          return {
            name: `meaning-${name}`,
            value: { light: valueOf(lit, light), dark: valueOf(written.dark[name] ?? lit, dark) },
            usage: said,
          } satisfies Themed;
        });
    }),
    ...ALIASES,
  ];
};

/** A number the theme's v4 sheet declares, read by `pattern`'s first group. */
const numberIn = (v4: string, pattern: RegExp) => Number(pattern.exec(v4)?.[1]);

/** One style of the type scale. */
const styleOf = (v4: string, stem: string, size: string, group: { usage: string; sample: string }) => {
  const key = `${stem}-${size}`;
  const tracking = new RegExp(`--md-sys-typescale-${key}-tracking:\\s*(-?[\\d.]+(?:px|em)?)`).exec(v4)?.[1];
  const weight = new RegExp(`--md-sys-typescale-${key}-weight:\\s*(\\d+)`).exec(v4)?.[1];
  const labelTracking = size === 'small' ? '0.1em' : '0.06em';
  return {
    name: key,
    ...(stem === 'title' && size !== 'large' ? { family: 'barlow' } : {}),
    fontSize: `${numberIn(v4, new RegExp(`--md-sys-typescale-${key}-size:\\s*(\\d+)px`))}px`,
    lineHeight: `${numberIn(v4, new RegExp(`--md-sys-typescale-${key}-line-height:\\s*(\\d+)px`))}px`,
    letterSpacing: tracking ?? (stem === 'label' ? labelTracking : '0px'),
    fontWeight: Number(weight ?? 400),
    sample: group.sample,
    usage: group.usage,
  };
};

/** The type scale's groups, each in three sizes. */
const typeGroups = (v4: string) =>
  SCALE.map(([name, stem, family, usage, sample]) => ({
    name,
    family,
    styles: ['large', 'medium', 'small'].map((size) => styleOf(v4, stem, size, { usage, sample })),
  }));

/** The elevations, each a hairline in a role at an opacity, in both schemes. */
const shadowTokens = (v4: string, light: Record<string, string>, dark: Record<string, string>) =>
  [...v4.matchAll(/--md-sys-elevation-(\d): 0 0 0 1px --alpha\(var\(--(md-sys-color-[a-z-]+)\) \/ (\d+)%\);/g)].map(
    ([, level = '', role = '', share]) =>
      ({
        name: `md-sys-elevation-${level}`,
        value: {
          light: `0 0 0 1px ${(light[role] ?? '').replace(/\)$/, ` / ${share}%)`)}`,
          dark: `0 0 0 1px ${(dark[role] ?? '').replace(/\)$/, ` / ${share}%)`)}`,
        },
        usage: SHADOW_USAGE[level] ?? '',
      }) satisfies Themed,
  );

/** The state layers' opacities. */
const stateTokens = (v4: string) =>
  (['hover', 'focus', 'pressed', 'dragged'] as const).map((state) => ({
    name: `md-sys-state-${state}-state-layer-opacity`,
    value: `${numberIn(v4, new RegExp(`--md-sys-state-${state}-state-layer-opacity:\\s*(\\d+)%`))}%`,
    usage: `The layer over a part while it is ${{ hover: 'under the pointer', focus: 'focused', pressed: 'pressed', dragged: 'dragged' }[state]}.`,
  }));

/** The six corners, every one square. */
const radiusTokens = () =>
  ['extra-small', 'small', 'medium', 'large', 'extra-large', 'full'].map((corner) => ({
    name: `md-sys-shape-corner-${corner}`,
    value: '0',
    usage: `Square: the ${corner} corner of the kit is 0. Hardware is cut, labels are stuck on.`,
  }));

/**
 * tokens.json's text.
 * @param faces the faces the build copies.
 * @param components each board card that has a component, by its name, with its source under `apps/web/src`.
 * @param kitVersion the kit's release the board holds.
 */
export const tokensOf = (faces: readonly Face[], components: Readonly<Record<string, string>>, kitVersion: string) => {
  const { light, dark, names } = schemes(fs.readFileSync(path.join(WEB, 'theme', 'theme.css'), 'utf8'));
  const v4 = fs.readFileSync(path.join(WEB, 'theme', 'theme.v4.css'), 'utf8');
  const head = headOf();
  const tokens = {
    name: 'Nemia Design System',
    version: 1,
    color: {
      themes: [
        { id: 'dark', name: 'Dark' },
        { id: 'light', name: 'Light' },
      ],
      tokens: [...colourTokens(light, dark, names), ...meaningTokens(light, dark)],
    },
    type: {
      fonts: faces.map(({ family, file, weight, style }) => ({ family, file, weight, style })),
      families: FAMILIES,
      groups: typeGroups(v4),
    },
    radius: {
      note: "Every corner of the kit is square. A cut corner and a rounded sticker are drawn around the kit's parts, not by a radius.",
      tokens: radiusTokens(),
    },
    shadow: {
      note: 'The look draws no shadow: a raised surface is a hairline, in yellow and then in violet as it rises.',
      tokens: shadowTokens(v4, light, dark),
    },
    state: { note: "A state is a layer of the content's own colour over the container, at these opacities.", tokens: stateTokens(v4) },
    meta: {
      source: 'local',
      repo: 'nemia',
      ref: `main@${head.sha}`,
      package: 'apps/web',
      paths: {
        tokens: ['apps/web/theme/theme.css', 'apps/web/theme/theme.v4.css', 'apps/web/src/styles.css'],
        fonts: [...new Set(faces.map((face) => `node_modules/${face.source}`))],
        assets: [],
        docs: ['apps/web/DESIGN.md', 'apps/web/CLAUDE.md'],
      },
      components: {
        ...components,
        kit: `apps/web/src/components/ui/ds (release ${kitVersion}, its stories at the kit's tag v${kitVersion})`,
      },
      synced: head.date,
    },
  };
  return `${JSON.stringify(tokens, null, 2)}\n`;
};
