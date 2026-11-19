/**
 * Where Nemia's documentation pages are read (`DOCS_PAGES`): GitHub's rendering of the docs' own `.mdx`, since no docs site is published
 * yet; a published site moves them in this one place.
 */

/** The docs' source on GitHub, each page an `.mdx` there. */
const DOCS_BASE = 'https://github.com/emyann/nemia/blob/main/apps/docs/src/content/docs';

/** The page that says what a workflow, an agent and a hire are. */
export const DOCS_PAGES: Readonly<Record<'workflow' | 'agent' | 'hire', string>> = {
  workflow: `${DOCS_BASE}/workflows.mdx`,
  agent: `${DOCS_BASE}/agents.mdx`,
  hire: `${DOCS_BASE}/factories.mdx#hires`,
};
