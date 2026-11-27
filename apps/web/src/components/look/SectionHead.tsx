import type { ReactNode } from 'react';
import { Body, Label, Tag } from '../ui/ds';
import { CutTag } from './CutTag';
import { MeaningTag } from './MeaningTag';

/** How a section's count chip is drawn by its meaning: the kit's tag in the section's role, outlined and quiet where it holds none. */
const COUNT_TAG = {
  yours: { variant: 'filled', color: 'primary' },
  alive: { variant: 'tonal', color: 'alive' },
  rest: { variant: 'filled', color: 'neutral' },
  quiet: { variant: 'outlined', color: 'neutral' },
} as const;

/** The count chip's tag: the look's tag in the meaning for a session at work, which the theme has no role for, else the kit's. */
function CountTag({
  count,
  drawn,
  tag,
  children,
}: {
  count: number;
  drawn: string;
  tag: (typeof COUNT_TAG)[keyof typeof COUNT_TAG];
  children: ReactNode;
}) {
  return tag.color === 'alive' ? (
    <MeaningTag data-count-chip={count} data-count-tone={drawn} hue="alive" className="h-8 px-3">
      {children}
    </MeaningTag>
  ) : (
    <Tag data-count-chip={count} data-count-tone={drawn} variant={tag.variant} color={tag.color} className="h-8 px-3">
      {children}
    </Tag>
  );
}

/**
 * A section's head, the one the pages of the board share: its count, in the mono face, and its word in small caps, on a cut tag in the section's colour; quiet at zero. */
export function SectionHead({ count, word, tone }: { count: number; word: string; tone: 'yours' | 'alive' | 'rest' }) {
  const drawn = count === 0 ? 'quiet' : tone;
  const tag = COUNT_TAG[drawn];
  return (
    <h2 className="m-0 flex">
      <CutTag edge={drawn === 'quiet'}>
        <CountTag count={count} drawn={drawn} tag={tag}>
          <span className="inline-flex items-baseline gap-2.5">
            <Body size="large" component="span" className="font-mono">
              {count}
            </Body>
            <Label size="large" component="span" className="uppercase">
              {word}
            </Label>
          </span>
        </CountTag>
      </CutTag>
    </h2>
  );
}

