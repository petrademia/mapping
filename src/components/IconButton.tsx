import type { ButtonHTMLAttributes } from "react";

export type IconName = "trash" | "minus" | "plus" | "check" | "x" | "grip" | "up" | "down";

const PATHS: Record<IconName, string[]> = {
  // Lid, body and two ribs.
  trash: [
    "M3 5h10",
    "M6.5 5V3.5h3V5",
    "M4.5 5l.6 7.5h5.8l.6-7.5",
    "M7 7.5v3.5",
    "M9 7.5v3.5",
  ],
  minus: ["M4 8h8"],
  plus: ["M4 8h8", "M8 4v8"],
  check: ["M3.5 8.5l3 3 6-7"],
  // Six dots: a drag handle.
  grip: ["M6 4h.01", "M10 4h.01", "M6 8h.01", "M10 8h.01", "M6 12h.01", "M10 12h.01"],
  up: ["M4 10l4-4 4 4"],
  down: ["M4 6l4 4 4-4"],
  x: ["M4.5 4.5l7 7", "M11.5 4.5l-7 7"],
};

/** A pass or fail mark: an icon with a text equivalent for screen readers. */
export function PassMark({ passed }: { passed: boolean }) {
  return (
    <span
      className={passed ? "pass-mark pass" : "pass-mark fail"}
      role="img"
      aria-label={passed ? "Matched" : "Not matched"}
    >
      <Icon name={passed ? "check" : "x"} />
    </span>
  );
}

/** One consistent stroke icon set: 16px grid, 1.5 stroke, round caps. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  icon: IconName;
  /** Accessible name and tooltip, e.g. "Remove Ash Blossom". */
  label: string;
}

/** A square icon-only button. The label is both its name for screen readers and its tooltip. */
export function IconButton({ icon, label, className, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={`icon-button${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}
