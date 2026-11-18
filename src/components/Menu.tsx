import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** The button text. */
  label: string;
  /** What the menu holds, for screen readers. Defaults to the label. */
  groupLabel?: string;
  /** Rendered inside the popover; call `close` after an action that should dismiss it. */
  children: (close: () => void) => ReactNode;
}

/**
 * A button that opens a small popover of actions. It closes on an outside click or Escape, and
 * Escape hands focus back to the button.
 */
export function Menu({ label, groupLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="menu-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu-popover" role="group" aria-label={groupLabel ?? label}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
