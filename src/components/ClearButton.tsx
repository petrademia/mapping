import { useState } from "react";

interface Props {
  /** Button text, e.g. "Clear Main Deck". */
  label: string;
  /** What will be lost, shown in the confirm step. */
  message: string;
  /** Optional count shown at the right of the label, e.g. cards in the deck. */
  detail?: number;
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
  disabled,
  className,
  onConfirm,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
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
        Clear
      </button>
      <button type="button" autoFocus onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
