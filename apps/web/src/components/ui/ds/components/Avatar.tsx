"use client";

import { useEffect, useState, type ReactNode } from "react";

import { UserIcon } from "../icons";
import { cn } from "../utils";

export type AvatarProps = {
  /** Image URL; the fallback shows while it is missing or fails to load. */
  src?: string | null;
  /** Accessible name of the person (also the image `alt`). Leave it out
   *  where the name is written beside the avatar: the avatar is then
   *  decorative, hidden from a screen reader, and the name is said once. */
  alt?: string;
  /** What to show without an image — typically initials. Defaults to a person glyph. */
  fallback?: ReactNode;
  /** Diameter in px. 40 is the list-item avatar; 24–32 suit inline bylines. */
  size?: number;
  className?: string;
};

/**
 * A round picture of a person with an initials fallback. Plain markup — no
 * React Aria, just an `<img>` that swaps to the fallback when the request
 * fails — sized by `size` so the same component serves a 24dp byline and a
 * 40dp list-item avatar.
 *
 *   <Avatar src={user.image} alt={user.name} fallback="YR" />
 *   <Avatar size={24} fallback={initials(author)} alt={author} />
 *
 * Material 3 does not describe this component. MD3 draws avatars inside list
 * items, chips and the top app bar at 40dp (lists) and 24dp (chips) on
 * `primary-container` with `on-primary-container` initials — those are the
 * colours used here.
 *
 * `alt` decides what a screen reader hears. With it, the avatar is an image
 * named for the person, picture or initials alike. Without it the avatar is
 * decorative and hidden: the form for an avatar beside the person's visible
 * name, in a list row, a table cell or a byline.
 *
 *   <Avatar fallback="AM" /> <span>Ada Martin</span>
 */
export function Avatar({
  src,
  alt,
  fallback,
  size = 40,
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const showImage = Boolean(src) && !failed;
  const px = { width: size, height: size };

  return (
    <span
      data-slot="avatar"
      // With a name the fallback is an image of that name. With none the
      // avatar is decorative: an image role with no name says nothing useful.
      role={showImage || !alt ? undefined : "img"}
      aria-label={showImage || !alt ? undefined : alt}
      aria-hidden={alt ? undefined : true}
      className={cn(
        "rounded-shape-full bg-primary-container text-on-primary-container relative inline-flex shrink-0 items-center justify-center overflow-hidden font-medium select-none",
        className,
      )}
      style={{ ...px, fontSize: Math.round(size * 0.4) }}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt ?? ""}
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true" className="leading-none uppercase">
          {fallback ?? <UserIcon size={Math.round(size * 0.6)} />}
        </span>
      )}
    </span>
  );
}

export default Avatar;
