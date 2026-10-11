"use client";

import { useEffect, useState, type ReactNode } from "react";

import { UserIcon } from "../icons";
import { cn } from "../utils";

export type AvatarProps = {
  /** Image URL; the fallback shows while it is missing or fails to load. */
  src?: string | null;
  /** Accessible name of the person (also the image `alt`). */
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
 * Not a Material 3 component of its own: MD3 draws avatars inside list
 * items, chips and the top app bar at 40dp (lists) and 24dp (chips) on
 * `primary-container` with `on-primary-container` initials — those are the
 * colours used here. The fallback is `aria-hidden` when `alt` names the
 * person, so screen readers get the name once.
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
      role={showImage ? undefined : "img"}
      aria-label={showImage ? undefined : alt}
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
