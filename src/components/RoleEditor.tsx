import type { DerivedLabels } from "../lib/derivedLabels";
import { toggleRole, type Role } from "../lib/taxonomy";

interface Props {
  roles: Role[];
  onChange: (roles: Role[]) => void;
  /**
   * Starter, Extender and Brick as read from the Hand Conditions; null when there is
   * no Hand Goal to read them from yet.
   */
  derived: DerivedLabels | null;
}

/**
 * Interaction is the one role you tag. Starter, Extender and Brick are not asked
 * for: they follow from the routes you wrote as Hand Conditions.
 */
export function RoleEditor({ roles, onChange, derived }: Props) {
  const interaction = roles.includes("interaction");
  const shown: { key: string; label: string; swatch: string; title: string }[] = [];
  if (derived?.starter) {
    shown.push({ key: "starter", label: "Starter", swatch: "var(--starter)", title: "A Hand Condition is met by this card alone" });
  }
  if (derived?.extender) {
    shown.push({ key: "extender", label: "Extender", swatch: "var(--extender)", title: "A Hand Condition needs this card together with another" });
  }
  if (derived?.brick) {
    shown.push({ key: "brick", label: "Brick", swatch: "var(--undesirable)", title: "In none of your routes, and not an Interaction card" });
  }
  return (
    <div className="taxonomy-block">
      <span className="taxonomy-label">Role</span>
      <div className="roles" role="group" aria-label="Roles">
        <button
          type="button"
          className={interaction ? "chip on" : "chip"}
          data-role="interaction"
          aria-pressed={interaction}
          onClick={() => onChange(toggleRole(roles, "interaction"))}
        >
          Interaction
        </button>
      </div>
      {derived ? (
        <p className="derived-labels" aria-label="Read from your Hand Conditions">
          <span className="derived-from">From your Hand Conditions:</span>
          {shown.length > 0 ? (
            shown.map((entry) => (
              <span
                key={entry.key}
                className="derived-chip"
                title={entry.title}
                style={{ "--swatch": entry.swatch } as React.CSSProperties}
              >
                {entry.label}
              </span>
            ))
          ) : (
            <span className="derived-none">none</span>
          )}
        </p>
      ) : (
        <p className="derived-labels">
          <span className="derived-from">Starter, Extender and Brick appear here once you define a Hand Goal.</span>
        </p>
      )}
    </div>
  );
}
