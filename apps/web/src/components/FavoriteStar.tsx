/**
 * The star that puts a run or a workflow under the sidebar's Favorites, and takes it off when pressed again: kept by this browser
 * (`useFavorites`).
 */
import { Star } from 'lucide-react';
import { ToggleButton } from 'react-aria-components';
import { buttonVariants } from '@/components/ui/button';
import type { Favorite } from '@/lib/favorites';
import { useFavorites } from '@/lib/useFavorites';
import { cn } from '@/lib/utils';

/**
 * The star of `favorite`, a toggle named `Star <name>` whose pressed state says whether it is starred, with what a press does on hover;
 * filled amber while starred. `className` places it: `nodrag` on a canvas's node.
 */
export function FavoriteStar({ favorite, name, className }: { favorite: Favorite; name: string; className?: string }) {
  const { starred, toggle } = useFavorites();
  const on = starred(favorite);
  return (
    <ToggleButton
      isSelected={on}
      onChange={() => toggle(favorite)}
      aria-label={`Star ${name}`}
      data-favorite-star
      data-starred={on || undefined}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xs' }), 'text-muted-foreground', className)}
    >
      <span
        title={on ? 'Starred: take it off Favorites' : 'Star: list it under Favorites'}
        className="flex size-full items-center justify-center"
      >
        <Star aria-hidden className={on ? 'fill-foreground text-foreground' : undefined} />
      </span>
    </ToggleButton>
  );
}
