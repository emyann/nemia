/**
 * CheckTile: several choices among a few, each drawn as a tile — the twin of `RadioTile` for a question that takes any of its options.
 *
 *   <CheckTileGroup label="Where do the answers go?" defaultValue={['retry']}>
 *     <CheckTile value="retry" title="retry" description="Into the next try." />
 *     <CheckTile value="gate" title="gate" description="With the approval." />
 *   </CheckTileGroup>
 *
 * It is the kit's `CheckboxGroup` and `Checkbox`, with the tile `RadioTile` draws around each box: the medium corner, the
 * `outline-variant` outline, the `primary` outline and an 8% tint once chosen, the title and its line. The box itself stays, a square
 * beside the radio's circle, so one choice and several read apart without colour.
 *
 * Neither Material 3 nor React Aria describes a checkbox tile. The checkbox is Material's
 * (https://m3.material.io/components/checkbox/specs); the tile borrows an outlined card's container, as `RadioTile` does
 * (https://m3.material.io/components/cards/specs).
 */
import { Body, Checkbox, CheckboxGroup, Title } from '@/components/ui/ds';
import type { ComponentProps, ReactNode } from 'react';

type CheckTileGroupProps = ComponentProps<typeof CheckboxGroup> & {
  /** Tiles side by side, wrapping (the default), or one under another. */
  layout?: 'row' | 'column';
};

/** The group of tiles, the kit's checkbox group: its value the list of the tiles chosen, laid out by `layout`. */
export function CheckTileGroup({ layout = 'row', className = '', children, ...props }: CheckTileGroupProps) {
  return (
    <CheckboxGroup {...props} className={className}>
      <div className={layout === 'row' ? 'flex flex-wrap gap-3' : 'flex flex-col gap-3'}>{children}</div>
    </CheckboxGroup>
  );
}

type CheckTileProps = Omit<ComponentProps<typeof Checkbox>, 'children' | 'errorMessage'> & {
  title: ReactNode;
  description?: ReactNode;
};

/**
 * One tile of the group: the kit's checkbox, its `title` and `description` beside it, the whole tile pressed. A disabled tile fades its
 * outline to Material's disabled 12% and its title to the supporting ink, as a radio tile does.
 */
export function CheckTile({ title, description, className = '', ...props }: CheckTileProps) {
  return (
    <Checkbox
      {...props}
      className={`rounded-shape-medium border-outline-variant data-disabled:border-on-surface/12 data-selected:border-primary data-selected:bg-primary/8 min-w-40 flex-1 items-center gap-4 border py-1 ps-4 pe-4 transition-colors ${className}`}
    >
      <span className="flex min-w-0 flex-col py-1">
        <Title size="small" component="span" className="text-on-surface group-data-disabled/cb:text-on-surface-variant">
          {title}
        </Title>
        {description && (
          <Body component="span" className="text-on-surface-variant">
            {description}
          </Body>
        )}
      </span>
    </Checkbox>
  );
}
