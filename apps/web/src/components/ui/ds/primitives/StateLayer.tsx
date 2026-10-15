import { cn, tv, type VariantProps } from "../utils";

const stateLayerColors = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  "on-primary": "bg-on-primary",
  "on-secondary": "bg-on-secondary",
  "on-secondary-container": "bg-on-secondary-container",
  "on-surface": "bg-on-surface",
  "on-surface-variant": "bg-on-surface-variant",
  "inverse-on-surface": "bg-inverse-on-surface",
} as const;

export type StateLayerColor = keyof typeof stateLayerColors;

const styles = tv({
  base: "absolute inset-0 transition-opacity pointer-events-none opacity-0",
  variants: {
    state: {
      none: "opacity-0",
      hover: "state-opacity-hover",
      focus: "state-opacity-focus",
      press: "state-opacity-pressed",
      drag: "state-opacity-dragged",
    },
  },
  defaultVariants: {
    state: "none",
  },
});

type StateLayerProps = Omit<VariantProps<typeof styles>, "state"> & {
  color: StateLayerColor;
  isHovered?: boolean;
  // Keyboard focus only (react-aria's isFocusVisible) — plain isFocused would
  // leave the layer stuck at 10% after every mouse click. Focus outranks
  // hover so a keyboard-focused control doesn't dim to 8% when hovered.
  isFocusVisible?: boolean;
  isPressed?: boolean;
  isDragged?: boolean;
  /** Classes for the layer, such as the rounding of a host that does not clip it. */
  className?: string;
};

/**
 * MD3 state layer: an overlay tinted with the content color whose opacity
 * follows the interaction state (hover 8%, focus/press 10%, drag 16%).
 * Colors are a static map so Tailwind can see every class at build time —
 * never build `bg-${color}` strings dynamically.
 *
 * The opacities come from `--md-sys-state-*` through the `state-opacity-*`
 * utilities (tokens/theme.v4.css), not from Tailwind's numeric opacity scale,
 * which compiles to a literal a theme cannot reach. A preset that wants
 * flatter or louder feedback moves those four variables.
 */
export default function StateLayer(props: StateLayerProps) {
  const { color, isHovered, isFocusVisible, isPressed, isDragged, className } =
    props;

  const state = isDragged
    ? "drag"
    : isPressed
      ? "press"
      : isFocusVisible
        ? "focus"
        : isHovered
          ? "hover"
          : "none";

  return (
    <div
      data-slot="state-layer"
      className={cn(stateLayerColors[color], styles({ state }), className)}
    />
  );
}
