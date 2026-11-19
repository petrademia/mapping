import type { DerivedLabels } from "../lib/derivedLabels";
import { roleVariant, setRoleVariant, type TurnVariantRole } from "../lib/roleVariants";
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
 * A role that counts in both turn orders, or going second only. One chip turns it on; once on, a
 * small "going second only" toggle narrows it. The saved tag is the base role or its going-second role.
 */
function TurnVariantChip({
  role,
  label,
  roles,
  onChange,
  title,
  secondTitle,
}: {
  role: TurnVariantRole;
  label: string;
  roles: Role[];
  onChange: (roles: Role[]) => void;
  title: string;
  secondTitle: string;
}) {
  const variant = roleVariant(roles, role);
  const on = variant !== "off";
  return (
    <span className="role-option">
      <button
        type="button"
        className={on ? "chip on" : "chip"}
        data-role={role}
        aria-pressed={on}
        title={title}
        onClick={() => onChange(setRoleVariant(roles, role, on ? "off" : "both"))}
      >
        {label}
      </button>
      {on ? (
        <button
          type="button"
          className={variant === "second" ? "chip on role-second" : "chip role-second"}
          aria-pressed={variant === "second"}
          aria-label={`${label}: going second only`}
          title={secondTitle}
          onClick={() => onChange(setRoleVariant(roles, role, variant === "second" ? "both" : "second"))}
        >
          Going second only
        </button>
      ) : null}
    </span>
  );
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
        <TurnVariantChip
          role="lingering"
          label="Lingering handtrap"
          roles={roles}
          onChange={onChange}
          title="A lingering handtrap: its effect taxes or blocks the opponent all turn, so they go on with a smaller board (Droll & Lock Bird)"
          secondTitle="Only works going second, because you must control no cards (Mulcharmy)"
        />
        <TurnVariantChip
          role="breaker"
          label="Board breaker"
          roles={roles}
          onChange={onChange}
          title="A board breaker: it destroys, banishes or bounces the opponent's cards on your turn"
          secondTitle="Only worth it going second, since going first there is no board yet"
        />
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
