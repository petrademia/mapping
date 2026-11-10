import { useState } from "react";
import { IconButton, type IconName } from "./IconButton";

interface Props {
  /** Button text, e.g. "Clear Main Deck". */
  label: string;
  /** What will be lost, shown in the confirm step. */
  message: string;
  /** Optional count shown at the right of the label, e.g. cards in the deck. */
  detail?: number;
  /** Show an icon-only button (the label becomes its tooltip and accessible name). */
  icon?: IconName;
  /** Text of the confirming button; defaults to "Clear". */
  confirmLabel?: string;
  disabled?: boolean;
  className?: string;
  onConfirm: () => void;
}

/**
 * A destructive action in two steps, inline: click, read what is lost, then
 * Clear or Cancel (focus starts on Cancel). Never a browser dialog.
 */
export function ClearButton({
  label,
  message,
  detail,
  icon,
  confirmLabel = "Clear",
  disabled,
  className,
  onConfirm,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    if (icon) {
      return (
        <IconButton
          icon={icon}
          label={label}
          className={className}
          disabled={disabled}
          onClick={() => setConfirming(true)}
        />
      );
    }
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        <span>{label}</span>
        {detail === undefined ? null : <span className="clear-detail">{detail}</span>}
      </button>
    );
  }
  return (
    <span className="delete-confirm" role="group" aria-label={`${label}?`}>
      <span>{message}</span>
      <button
        type="button"
        className="danger"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" autoFocus onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
