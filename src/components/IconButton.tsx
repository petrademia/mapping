import type { ButtonHTMLAttributes } from "react";

export type IconName =
  | "trash" | "minus" | "plus" | "check" | "x" | "grip" | "up" | "down"
  | "sun" | "moon" | "device" | "shuffle" | "download" | "upload" | "file" | "save" | "redo";

const PATHS: Record<IconName, string[]> = {
  sun: [
    "M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
    "M8 1.5V3", "M8 13v1.5", "M1.5 8H3", "M13 8h1.5",
    "M3.4 3.4l1 1", "M11.6 11.6l1 1", "M3.4 12.6l1-1", "M11.6 4.4l1-1",
  ],
  moon: ["M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"],
  // A screen: follow the device.
  device: ["M2 3.5h12v8H2z", "M6 14h4", "M8 11.5V14"],
  shuffle: [
    "M2 4.5h2.5c3 0 4 7 7 7H13", "M11.5 9.5l1.5 2-1.5 2",
    "M2 11.5h2.5c1 0 1.8-1 2.5-2", "M9 6c.6-.9 1.2-1.5 2.5-1.5H13", "M11.5 2.5l1.5 2-1.5 2",
  ],
  download: ["M8 2.5v7", "M5 7l3 3 3-3", "M3 13h10"],
  upload: ["M8 10.5v-7", "M5 6l3-3 3 3", "M3 13h10"],
  file: ["M4 2h5l3 3v9H4z", "M9 2v3h3"],
  save: ["M3 3h8l2 2v8H3z", "M5.5 3v3h4V3", "M5.5 13V9.5h5V13"],
  redo: ["M13 8a5 5 0 1 1-1.5-3.5", "M13 2.5v3h-3"],
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
