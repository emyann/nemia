/**
 * What the built site must hold, read from the build that `npm run build` writes, so nothing builds the site a second time to
 * assert it: every page of the sidebar is built, no figure prints its style as an attribute, how a run lives draws its sequence,
 * and each code-drawn state machine has one home — the lifecycle the runtime's page, Nemia's machine hers.
 *
 * Run as `node built.ts [dist]` after `astro build`, it names each fault and exits 1; `faultsOf` is what
 * `test/built.test.ts` makes refuse.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The site's pages, in the sidebar's order: each built as its own `index.html`. */
export const PAGES = [
  '',
  'map',
  'runtime',
  'a2a',
  'workflows',
  'agents',
  'factories',
  'how-a-run-lives',
  'nemia',
  'glossary',
  'getting-started',
];

/** The SVGs of a built page. */
const svgsOf = (html: string): string[] => html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];

/** A page as a person says it: the home page by its path. */
const said = (page: string): string => page || '/';

/**
 * What the site built into `dist` is wrong about, each fault worded with its fix, or nothing: a page not built, a figure whose
 * style is printed as an attribute, a missing sequence, and a state machine drawn on other than its one page.
 */
export const faultsOf = (dist: string): string[] => {
  const unbuilt = PAGES.filter((page) => !fs.existsSync(path.join(dist, page, 'index.html')));
  if (unbuilt.length > 0) return [`these pages are not built: ${unbuilt.map(said).join(', ')}`];
  const html = new Map(PAGES.map((page) => [page, fs.readFileSync(path.join(dist, page, 'index.html'), 'utf8')]));
  const figures = (page: string) => svgsOf(html.get(page) ?? '');
  const homeOf = (word: string, home: string, machine: string) => {
    const drawn = PAGES.filter((page) => figures(page).some((svg) => svg.includes(word)));
    return drawn.length === 1 && drawn[0] === home
      ? []
      : [`${machine} is drawn on ${drawn.map(said).join(', ') || 'no page'}, not on ${said(home)} alone`];
  };
  return [
    ...PAGES.filter((page) => (html.get(page) ?? '').includes('set:html')).map(
      (page) => `a figure of ${said(page)} prints its style as an attribute: draw it through the site's stylesheet`,
    ),
    ...(figures('how-a-run-lives').length > 0 ? [] : ['how a run lives draws no sequence']),
    ...homeOf('input-required', 'runtime', 'the lifecycle'),
    ...homeOf('untrusted', 'nemia', "Nemia's machine"),
  ];
};

if (import.meta.filename === process.argv[1]) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const faults = faultsOf(dist);
  if (faults.length > 0) {
    console.error(`the site built into ${dist} is wrong:\n${faults.map((fault) => `  ${fault}`).join('\n')}`);
    process.exit(1);
  }
}
