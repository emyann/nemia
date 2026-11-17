/**
 * RadioTile: a choice of one among a few, each drawn as a tile.
 *
 * A block of the MD3 kit: it is copied into your project to be edited. It is
 * yours from then on: an update of the kit does not touch it. It is the
 * kit's `RadioGroup` and `Radio`, with a tile drawn around each radio.
 *
 *   <RadioTileGroup label="Delivery day" defaultValue="tue">
 *     <RadioTile value="mon" title="Monday" description="16 November" />
 *     <RadioTile value="tue" title="Tuesday" description="17 November" />
 *   </RadioTileGroup>
 *
 * It behaves as the kit's radio group does: one tab stop, the arrow keys
 * move the choice, a label and an error message. The whole tile is pressed.
 * The selected tile takes the `primary` outline and an 8% tint; the radio
 * itself stays, so the choice does not rest on colour.
 *
 * Neither Material 3 nor React Aria describes a radio tile. The radio is
 * Material's (https://m3.material.io/components/radio-button/specs); the
 * tile borrows an outlined card's container
 * (https://m3.material.io/components/cards/specs: the medium corner, the
 * `outline-variant` outline) and its title-small and body-medium type.
 */
import { Body, Radio, RadioGroup, Title } from '@/components/ui/ds';
import type { ComponentProps, ReactNode } from 'react';

type RadioTileGroupProps = ComponentProps<typeof RadioGroup> & {
  /** Tiles side by side, wrapping (the default), or one under another. */
  layout?: 'row' | 'column';
};

/** The group of tiles, the kit's radio group: one tab stop, the arrow keys moving the choice, laid out by `layout`. */
export function RadioTileGroup({ layout = 'row', className = '', children, ...props }: RadioTileGroupProps) {
  return (
    <RadioGroup {...props} className={className}>
      <div className={layout === 'row' ? 'flex flex-wrap gap-3' : 'flex flex-col gap-3'}>{children}</div>
    </RadioGroup>
  );
}

type RadioTileProps = Omit<ComponentProps<typeof Radio>, 'children'> & {
  title: ReactNode;
  description?: ReactNode;
};

/**
 * One tile of the group: the kit's radio, its `title` and `description` beside it, the whole tile pressed. A disabled tile fades its
 * outline to Material's disabled 12% and its title to the supporting ink, so it reads apart from those that can be picked, its words
 * still read.
 */
export function RadioTile({ title, description, className = '', ...props }: RadioTileProps) {
  return (
    <Radio
      {...props}
      className={`rounded-shape-medium border-outline-variant data-disabled:border-on-surface/12 data-selected:border-primary data-selected:bg-primary/8 min-w-40 flex-1 items-center gap-4 border py-1 ps-4 pe-4 transition-colors ${className}`}
    >
      <span className="flex min-w-0 flex-col py-1">
        <Title size="small" component="span" className="text-on-surface group-data-disabled/rd:text-on-surface-variant">
          {title}
        </Title>
        {description && (
          <Body component="span" className="text-on-surface-variant">
            {description}
          </Body>
        )}
      </span>
    </Radio>
  );
}
