"use client";

import {
  Breadcrumb as AriaBreadcrumb,
  type BreadcrumbProps as AriaBreadcrumbProps,
  Breadcrumbs as AriaBreadcrumbs,
  type BreadcrumbsProps as AriaBreadcrumbsProps,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { ChevronRightIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { cn } from "../utils";
import { Link } from "./Link";

export type BreadcrumbsProps<T extends object> = Omit<
  AriaBreadcrumbsProps<T>,
  "className"
> & { className?: string };

/**
 * The path to the page a person is on: a row of links to each level above
 * it, then the page itself, which is not a link. On React Aria
 * `Breadcrumbs`.
 *
 *   <nav aria-label="Path">
 *     <Breadcrumbs>
 *       <Breadcrumb href="/">Team drive</Breadcrumb>
 *       <Breadcrumb href="/finance">Finance</Breadcrumb>
 *       <Breadcrumb>Invoices</Breadcrumb>
 *     </Breadcrumbs>
 *   </nav>
 *
 * It is a list (`ol`): put it in a `nav` with a name, so the path is a
 * landmark. The last `Breadcrumb` is the current page, whatever it is given:
 * it is announced as such (`aria-current="page"`) and does not navigate.
 * With `items` and a function it renders a path that is data, and `onAction`
 * is called with the `id` of the level pressed, for a path that changes
 * state instead of the address. `isDisabled` disables every level. A long
 * path wraps onto a second line.
 *
 * Material 3 does not describe this component. What it borrows:
 *
 * - **The type**: https://m3.material.io/styles/typography/type-scale-tokens —
 *   body-medium, the size of supporting text.
 * - **The colours**: https://m3.material.io/styles/color/roles —
 *   `on-surface-variant` for the levels above, `on-surface` for the page
 *   itself, as a list item's supporting text and its label.
 * - **The links**: the kit's `Link` (its doc comment cites what it borrows):
 *   underlined under the pointer and on focus, with the kit's focus ring.
 * - **The target**: https://m3.material.io/foundations/designing/structure —
 *   each level is 48dp high.
 * - **Right to left**: https://m3.material.io/foundations/layout/bidirectionality-rtl
 *   — the chevron between two levels is mirrored.
 */
export function Breadcrumbs<T extends object>({
  className,
  ...props
}: BreadcrumbsProps<T>) {
  return (
    <AriaBreadcrumbs
      data-slot="breadcrumbs"
      {...props}
      className={cn(
        "m-0 flex list-none flex-wrap items-center gap-1 p-0 text-body-medium font-body-medium text-on-surface-variant",
        className,
      )}
    />
  );
}

export type BreadcrumbProps = Omit<AriaBreadcrumbProps, "children"> &
  Pick<
    AriaLinkProps,
    "href" | "target" | "rel" | "download" | "routerOptions"
  > & {
    /** The level's name. */
    children: React.ReactNode;
  };

/**
 * One level of a `Breadcrumbs` path: a link (`href`, with `target`, `rel`,
 * `download` and `routerOptions` as on the kit's `Link`), followed by a
 * chevron unless it is the last. The last one is the current page: drawn in
 * `on-surface`, not underlined, not a link to follow.
 *
 * Material 3 does not describe this component; `Breadcrumbs` says what it is
 * built from instead.
 */
export function Breadcrumb({
  href,
  target,
  rel,
  download,
  routerOptions,
  children,
  className,
  ...props
}: BreadcrumbProps) {
  return (
    <AriaBreadcrumb
      data-slot="breadcrumb"
      {...props}
      className={composeTailwindRenderProps(
        className,
        "flex items-center gap-1",
      )}
    >
      {({ isCurrent }) => (
        <>
          <Link
            href={href}
            target={target}
            rel={rel}
            download={download}
            routerOptions={routerOptions}
            color="inherit"
            underline="hover"
            // React Aria disables the current page's link. It is not an
            // unavailable control: it is where the person is.
            className="inline-flex min-h-12 items-center data-current:data-disabled:cursor-default data-current:data-disabled:text-on-surface"
          >
            {children}
          </Link>
          {!isCurrent && (
            <ChevronRightIcon
              size={18}
              className="shrink-0 rtl:-scale-x-100"
            />
          )}
        </>
      )}
    </AriaBreadcrumb>
  );
}
