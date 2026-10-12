import type { Lesson } from '../lib/api';
import { cn } from '../lib/utils';
import { container, dashed, ringed } from '../lib/meaning';

/** The lesson line: sage when the run wrote where the next agent reads, a grey ring when it wrote nothing, dashed when nobody can say. */
export function LessonChip({ lesson }: { lesson: Lesson }) {
  const [text, title, className] =
    lesson.state === 'written'
      ? [`lesson · ${lesson.said}`, 'The run changed a file where the next agent reads.', container.sage]
      : lesson.state === 'nothing'
        ? [lesson.said, 'What this run learned is written nowhere the next agent reads (CLAUDE.md, "When you miss").', ringed.grey]
        : [`lesson ${lesson.said}`, 'A branch could not be read, so nobody can say what it wrote.', dashed.grey];
  return (
    <p>
      <span
        data-lesson={lesson.state}
        title={title}
        className={cn('inline-block rounded px-2 py-0.5 font-mono text-body-small', className)}
      >
        {text}
      </span>
    </p>
  );
}
