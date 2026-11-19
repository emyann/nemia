import { ExternalLink } from 'lucide-react';
import { DOCS_PAGES } from '@/lib/docs';

/** What the guide says of each idea: its name, a few lines, and the words of its link. */
const IDEAS: readonly { key: keyof typeof DOCS_PAGES; name: string; lines: string; link: string }[] = [
  {
    key: 'workflow',
    name: 'A workflow',
    lines:
      'A folder of markdown: each file a step, run in order, each step a session of an agent that hands what it made to the next. A gate waits on you.',
    link: 'Workflows',
  },
  {
    key: 'agent',
    name: 'An agent',
    lines: 'Who fills a step: one markdown file of its instructions, its model and its tools, and the fence of what it may run.',
    link: 'Agents',
  },
  {
    key: 'hire',
    name: 'A hire',
    lines: 'The agent a factory puts in a step of a workflow it runs: the same workflow can be filled by other agents in another factory.',
    link: 'Hires',
  },
];

/** The short guide an empty factory is given: what a workflow, an agent and a hire are, a few lines each, with a link to its docs page. */
export function FactoryGuide() {
  return (
    <section data-factory-guide aria-labelledby="factory-guide" className="flex flex-col gap-4">
      <h2 id="factory-guide" className="m-0 text-title-medium text-on-surface">
        What goes in it
      </h2>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {IDEAS.map((idea) => (
          <li key={idea.key} data-guide={idea.key} className="flex flex-col gap-1">
            <span className="text-title-small text-on-surface">{idea.name}</span>
            <p className="m-0 text-body-medium text-on-surface-variant">{idea.lines}</p>
            <a
              href={DOCS_PAGES[idea.key]}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-fit items-center gap-1 text-body-medium text-primary underline underline-offset-2"
            >
              {idea.link}, in the docs
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
