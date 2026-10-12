/**
 * The page the checks read the look's stories on: every story beside a part of `src/components/look`, drawn as Storybook draws it
 * (`composeStories`, under the annotations of `.storybook/preview.tsx`), each in a section of its own named by Storybook's id for
 * it. The bare address draws an index and every story; `?part=<name>` every story of one part; `?story=<id>` one story. A story
 * that throws is said on its section (`data-broken`). It holds no part's props: a state is shown by writing its story. Built by
 * `buildParts` (`gallery.ts`) into a scratch folder, never by the board's own build, and no file of `src` imports it. Its layout
 * is inline styles: a class written here alone would enter the board's stylesheet.
 */
import { Component, StrictMode, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { composeStories } from '@storybook/react-vite';
import preview from '../../../.storybook/preview.tsx';

type Stories = Parameters<typeof composeStories>[0];

/** A story as the page draws it: Storybook's id for it, the part it is a story of, its name, and what draws it. */
type Shown = { id: string; part: string; name: string; Story: ComponentType };

/** A story as Storybook composes it: what draws it under the preview's decorator, with its id and its name. */
type Composed = ComponentType & { id: string; storyName: string };

const MODULES = import.meta.glob<Stories>('../../../src/components/look/*.stories.tsx', { eager: true });

/** Every story of the look, a part after another by its file's name, each part's by their names. */
const STORIES: Shown[] = Object.entries(MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([file, stories]) => {
    const part = file.replace(/^.*\/([^/]+)\.stories\.tsx$/, '$1');
    const composed = composeStories(stories, preview) as Record<string, Composed>;
    return Object.values(composed).map((Story) => ({ id: Story.id, part, name: Story.storyName, Story }));
  });

const PAGE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 28,
  padding: 32,
  minHeight: '100svh',
  boxSizing: 'border-box',
};
const HEADING: CSSProperties = { margin: '0 0 10px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 };
const INDEX: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', margin: 0, padding: 0, listStyle: 'none', fontSize: 12 };

/** What draws a story, and says on its section that it threw when it did, in place of taking the whole page down. */
class Held extends Component<{ children: ReactNode }, { broken: string | null }> {
  override state = { broken: null as string | null };

  static getDerivedStateFromError(err: unknown): { broken: string } {
    return { broken: err instanceof Error ? err.message : String(err) };
  }

  override render(): ReactNode {
    return this.state.broken === null ? this.props.children : <p data-broken>{this.state.broken}</p>;
  }
}

/** One story's section, named for the checks by the story's id and its part. */
function Section({ id, part, name, Story }: Shown) {
  return (
    <section data-story={id} data-part={part}>
      <h3 style={HEADING}>
        {part} / {name}
      </h3>
      <Held>
        <Story />
      </Held>
    </section>
  );
}

/** The index of the stories: each part, then each of its stories, as a link to the page that draws it alone. */
function Index() {
  const parts = [...new Set(STORIES.map((story) => story.part))];
  return (
    <nav data-stories aria-label="The look's stories">
      <ul style={INDEX}>
        {parts.map((part) => (
          <li key={part}>
            <a href={`?part=${part}`}>{part}</a>
          </li>
        ))}
        {STORIES.map((story) => (
          <li key={story.id}>
            <a data-story-link={story.id} href={`?story=${story.id}`}>
              {story.part} / {story.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The page: the stories its address asks for, and at the bare address the index over all of them. */
function Page() {
  const asked = new URLSearchParams(location.search);
  const [part, story] = [asked.get('part'), asked.get('story')];
  const shown = STORIES.filter((one) => (story ? one.id === story : part ? one.part === part : true));
  return (
    <main data-stories-page={shown.length} style={PAGE}>
      {!part && !story && <Index />}
      {shown.map((one) => (
        <Section key={one.id} {...one} />
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
